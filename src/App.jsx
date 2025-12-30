import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Polyline, Popup } from 'react-leaflet';
import { LogOut, Shield, X, MapPin, Navigation, Search, Send, Map as MapIcon } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Configuración de Iconos (Fix para Leaflet en React)
const iconPasajero = new L.Icon({ 
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', 
  iconSize: [30, 30], iconAnchor: [15, 30] 
});
const iconDestino = new L.Icon({ 
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2776/2776067.png', 
  iconSize: [30, 30], iconAnchor: [15, 30] 
});
const iconTaxi = new L.Icon({ 
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', 
  iconSize: [35, 35], iconAnchor: [17, 17] 
});

// --- COMPONENTES AUXILIARES DEL MAPA ---
function MapEvents({ setCoords, active }) {
  useMapEvents({
    click(e) {
      if (active) setCoords([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function MapView({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.flyTo(center, 15, { duration: 1.5 });
  }, [center, map]);
  return null;
}

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Verificar sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user);
      else setLoading(false);
    });

    // Escuchar cambios de autenticación
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (user) => {
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
    if (!error) setProfile(data);
    setLoading(false);
  };

  if (loading) return (
    <div className="h-screen bg-black flex flex-col items-center justify-center text-white font-black italic">
      <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      TAXINSTA...
    </div>
  );

  return (
    <Router>
      <Routes>
        <Route path="/" element={session ? <MainMap profile={profile} /> : <AuthScreen />} />
        <Route path="/admin" element={profile?.rol === 'admin' ? <AdminPanel profile={profile} /> : <Navigate to="/" />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

// --- PANTALLA DE LOGIN ---
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isReg, setIsReg] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    const { error } = isReg 
      ? await supabase.auth.signUp({ email, password }) 
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-white">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-8 rounded-[40px] shadow-2xl">
        <h1 className="text-3xl font-black italic text-center mb-8 tracking-tighter uppercase">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none focus:border-purple-500" type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none focus:border-purple-500" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
          <button className="w-full bg-purple-600 p-4 rounded-2xl font-black uppercase tracking-widest hover:bg-purple-500 transition-colors">
            {isReg ? "Crear Cuenta" : "Entrar"}
          </button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="w-full text-zinc-500 mt-6 text-[10px] font-black uppercase tracking-widest italic">
          {isReg ? "Ya tengo cuenta" : "Registrarme"}
        </button>
      </div>
    </div>
  );
}

// --- INTERFAZ DEL MAPA ---
function MainMap({ profile }) {
  const [origen, setOrigen] = useState([9.2132, -66.0125]);
  const [destino, setDestino] = useState(null);
  const [destinoText, setDestinoText] = useState("");
  const [modo, setModo] = useState('origen'); // 'origen' o 'destino'
  const [viajeActivo, setViajeActivo] = useState(null);
  const [ofertaConductor, setOfertaConductor] = useState(null);
  const [taxiPos, setTaxiPos] = useState(null);
  const [buscando, setBuscando] = useState(false);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.replace('/');
  };

  // Obtener ubicación real del pasajero al inicio
  useEffect(() => {
    if (isPasajero) {
      navigator.geolocation.getCurrentPosition(
        (p) => setOrigen([p.coords.latitude, p.coords.longitude]),
        (err) => console.error("Error GPS:", err),
        { enableHighAccuracy: true }
      );
    }
  }, [isPasajero]);

  // Suscripción Realtime
  useEffect(() => {
    const channel = supabase.channel('viajes_v4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        // Lógica para Conductor
        if (isConductor) {
          if (payload.eventType === 'INSERT' && payload.new.estado === 'pendiente') {
            setOfertaConductor(payload.new);
          }
          if (payload.new.conductor_id === profile.id) {
            setViajeActivo(payload.new);
          }
        }
        // Lógica para Pasajero
        if (isPasajero && payload.new.pasajero_id === profile.id) {
          setViajeActivo(payload.new);
          if (payload.new.cond_lat) setTaxiPos([payload.new.cond_lat, payload.new.cond_lon]);
        }
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile, isConductor, isPasajero]);

  // Transmisión GPS del Conductor
  useEffect(() => {
    let watchId;
    if (isConductor && viajeActivo?.estado === 'en_camino') {
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        await supabase.from('viajes').update({
          cond_lat: pos.coords.latitude,
          cond_lon: pos.coords.longitude
        }).eq('id', viajeActivo.id);
      }, null, { enableHighAccuracy: true });
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isConductor, viajeActivo]);

  const buscarDestino = async () => {
    if (!destinoText) return;
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${destinoText}`);
      const data = await res.json();
      if (data[0]) {
        setDestino([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
        setModo('destino');
      } else {
        alert("No se encontró esa dirección.");
      }
    } catch (e) { alert("Error al buscar."); }
  };

  const solicitarServicio = async () => {
    if (!destino) return alert("Por favor marca un destino en el mapa o escríbelo.");
    setBuscando(true);
    const { error } = await supabase.from('viajes').insert([{
      pasajero_id: profile.id,
      nombre_pasajero: profile.nombre,
      origen_lat: origen[0],
      origen_lon: origen[1],
      destino_lat: destino[0],
      destino_lon: destino[1],
      destino_nombre: destinoText || "Punto en el mapa",
      estado: 'pendiente'
    }]);
    if (error) { alert(error.message); setBuscando(false); }
  };

  const aceptarViaje = async () => {
    if (!ofertaConductor) return;
    const { error } = await supabase.from('viajes')
      .update({ estado: 'en_camino', conductor_id: profile.id })
      .eq('id', ofertaConductor.id)
      .is('conductor_id', null);

    if (error) {
      alert("Este viaje ya ha sido tomado por otro conductor.");
      setOfertaConductor(null);
    } else {
      setOfertaConductor(null);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-black relative overflow-hidden font-sans">
      
      {/* MAPA */}
      <MapContainer center={origen} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        
        {/* Manejo de vista automática */}
        <MapView center={isConductor && ofertaConductor ? [ofertaConductor.origen_lat, ofertaConductor.origen_lon] : origen} />
        
        {/* Click para marcar origen/destino */}
        <MapEvents setCoords={modo === 'origen' ? setOrigen : setDestino} active={isPasajero && !viajeActivo} />
        
        {/* Marcadores Pasajero */}
        <Marker position={origen} icon={iconPasajero}><Popup>Recogida</Popup></Marker>
        {destino && <Marker position={destino} icon={iconDestino}><Popup>Destino</Popup></Marker>}
        
        {/* Ruta para el Conductor */}
        {isConductor && ofertaConductor && (
          <>
            <Marker position={[ofertaConductor.origen_lat, ofertaConductor.origen_lon]} icon={iconPasajero} />
            <Marker position={[ofertaConductor.destino_lat, ofertaConductor.destino_lon]} icon={iconDestino} />
            <Polyline positions={[
              [ofertaConductor.origen_lat, ofertaConductor.origen_lon],
              [ofertaConductor.destino_lat, ofertaConductor.destino_lon]
            ]} color="#a855f7" weight={5} opacity={0.7} dashArray="10, 10" />
          </>
        )}

        {/* Taxi en movimiento */}
        {taxiPos && <Marker position={taxiPos} icon={iconTaxi} />}
      </MapContainer>

      {/* HEADER (TaxiInsta) */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-start z-[1000] pointer-events-none">
        <div className="bg-black/40 backdrop-blur-md p-4 rounded-3xl border border-white/10 pointer-events-auto">
          <h1 className="text-white font-black italic text-2xl tracking-tighter leading-none">TaxiInsta</h1>
          <p className="text-[9px] text-green-500 font-bold uppercase tracking-widest mt-1">{profile?.rol}</p>
        </div>
        <button onClick={handleLogout} className="p-4 bg-zinc-900/90 text-white rounded-full border border-white/10 pointer-events-auto active:scale-95">
          <LogOut size={20}/>
        </button>
      </div>

      {/* UI PASAJERO: PANEL DE DESTINO */}
      {isPasajero && !viajeActivo && (
        <div className="absolute top-24 left-0 right-0 px-6 z-[1000]">
          <div className="bg-zinc-900/95 backdrop-blur-xl p-5 rounded-[35px] border border-white/10 shadow-2xl space-y-4">
            <div className="flex bg-black/50 p-1.5 rounded-2xl gap-1">
              <button onClick={() => setModo('origen')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'origen' ? 'bg-white text-black shadow-lg' : 'text-zinc-500'}`}>
                Punto Recogida
              </button>
              <button onClick={() => setModo('destino')} className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'destino' ? 'bg-white text-black shadow-lg' : 'text-zinc-500'}`}>
                Punto Destino
              </button>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500" size={16}/>
                <input 
                  className="w-full bg-zinc-800 p-4 pl-12 rounded-2xl text-white text-sm outline-none focus:ring-2 ring-purple-500" 
                  placeholder="¿A dónde vas hoy?" 
                  value={destinoText} 
                  onChange={e => setDestinoText(e.target.value)}
                  onKeyPress={e => e.key === 'Enter' && buscarDestino()}
                />
              </div>
              <button onClick={buscarDestino} className="p-4 bg-purple-600 rounded-2xl text-white shadow-lg active:scale-95"><MapIcon size={20}/></button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER DE ACCIONES */}
      <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
        <div className="max-w-md mx-auto">
          
          {/* PASAJERO: Botón Pedir */}
          {isPasajero && !viajeActivo && (
            <button 
              onClick={solicitarServicio} 
              disabled={buscando}
              className="w-full bg-white text-black font-black py-6 rounded-[30px] shadow-2xl uppercase text-xl italic tracking-tighter active:scale-95 transition-all"
            >
              {buscando ? "BUSCANDO CONDUCTORES..." : "SOLICITAR TAXI YA"}
            </button>
          )}

          {/* PASAJERO: Esperando */}
          {isPasajero && viajeActivo?.estado === 'en_camino' && (
            <div className="bg-purple-600 p-6 rounded-[35px] text-white shadow-2xl flex items-center gap-4 animate-pulse">
              <div className="bg-white/20 p-3 rounded-full"><Navigation className="animate-bounce"/></div>
              <div>
                <p className="font-black italic uppercase text-lg leading-none">Taxi en camino</p>
                <p className="text-[10px] font-bold uppercase opacity-70">Mira el mapa para ver su ubicación</p>
              </div>
            </div>
          )}

          {/* CONDUCTOR: Oferta Entrante */}
          {isConductor && ofertaConductor && (
            <div className="bg-white p-8 rounded-[40px] shadow-2xl animate-in slide-in-from-bottom-20 duration-500">
              <div className="flex justify-between mb-4">
                <h3 className="text-black font-black italic text-2xl tracking-tighter">NUEVO VIAJE</h3>
                <div className="bg-purple-100 p-2 rounded-xl text-purple-600"><MapPin/></div>
              </div>
              <p className="text-zinc-500 text-xs font-bold uppercase mb-6">
                Destino: <span className="text-black">{ofertaConductor.destino_nombre}</span>
              </p>
              <div className="flex gap-3">
                <button onClick={aceptarViaje} className="flex-1 bg-black text-white py-5 rounded-2xl font-black uppercase text-lg italic shadow-lg active:bg-zinc-800">
                  TOMAR SERVICIO
                </button>
                <button onClick={() => setOfertaConductor(null)} className="p-5 bg-zinc-100 text-zinc-400 rounded-2xl"><X/></button>
              </div>
            </div>
          )}

          {/* CONDUCTOR: Viaje en curso */}
          {isConductor && viajeActivo && (
            <div className="bg-zinc-900 p-6 rounded-[35px] border border-white/10 text-white shadow-2xl text-center">
              <p className="font-black italic uppercase text-xl mb-1">SERVICIO ACTIVO</p>
              <p className="text-zinc-500 text-[10px] uppercase font-bold mb-4">Compartiendo tu GPS...</p>
              <button 
                onClick={async () => {
                  await supabase.from('viajes').update({ estado: 'finalizado' }).eq('id', viajeActivo.id);
                  setViajeActivo(null);
                }} 
                className="w-full bg-green-600 py-4 rounded-2xl font-black uppercase shadow-lg active:scale-95"
              >
                FINALIZAR VIAJE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- PANEL ADMIN ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    supabase.from('perfiles').select('*').order('nombre').then(({ data }) => setUsers(data || []));
  }, []);

  const changeRole = async (uid, rol) => {
    await supabase.rpc('cambiar_rol_usuario', { target_user_id: uid, nuevo_rol: rol });
    window.location.reload();
  };

  return (
    <div className="min-h-screen bg-black text-white p-8">
      <div className="flex justify-between items-center mb-12">
        <h1 className="text-4xl font-black italic tracking-tighter">ADMIN PANEL</h1>
        <Link to="/" className="p-4 bg-zinc-900 rounded-full border border-zinc-800"><X/></Link>
      </div>
      <div className="grid gap-4">
        {users.map(u => (
          <div key={u.id} className="bg-zinc-900/50 p-6 rounded-[35px] border border-zinc-800 flex flex-col gap-4">
            <div className="flex justify-between items-center">
              <p className="font-bold text-xl">{u.nombre}</p>
              <span className="text-[10px] bg-purple-600/20 text-purple-400 px-3 py-1 rounded-full font-black uppercase">{u.rol}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['pasajero', 'conductor', 'admin'].map(r => (
                <button 
                  key={r} 
                  onClick={() => changeRole(u.id, r)}
                  className={`py-3 rounded-xl text-[9px] font-black uppercase ${u.rol === r ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500'}`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}