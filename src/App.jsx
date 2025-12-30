import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Polyline, Popup } from 'react-leaflet';
import { LogOut, Shield, X, MapPin, Navigation, Search, Info, Car } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- CONFIGURACIÓN DE ICONOS ---
const iconPasajero = new L.Icon({ 
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', 
  iconSize: [32, 32], iconAnchor: [16, 32] 
});
const iconDestino = new L.Icon({ 
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2776/2776067.png', 
  iconSize: [32, 32], iconAnchor: [16, 32] 
});
const iconTaxi = new L.Icon({ 
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', 
  iconSize: [40, 40], iconAnchor: [20, 20] 
});

// --- LÓGICA MATEMÁTICA ---
const calcularDistanciaKM = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// --- COMPONENTES DEL MAPA ---
function MapEvents({ setCoords, active }) {
  useMapEvents({ click(e) { if (active) setCoords([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

function MapView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 15); }, [center, map]);
  return null;
}

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(user) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
    setProfile(data);
    setLoading(false);
  }

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white font-black italic animate-pulse tracking-tighter text-3xl">TAXINSTA...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/" element={session ? <MainMap profile={profile} /> : <AuthScreen />} />
        <Route path="/admin" element={<AdminPanel profile={profile} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

// --- PANTALLA DE ACCESO ---
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isReg, setIsReg] = useState(false);
  const handleAuth = async (e) => {
    e.preventDefault();
    const { error } = isReg ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };
  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-white font-sans">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-10 rounded-[45px] shadow-2xl">
        <h1 className="text-4xl font-black italic text-center mb-10 tracking-tighter">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none" type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
          <button className="w-full bg-purple-600 p-4 rounded-2xl font-black uppercase tracking-widest">{isReg ? "REGISTRAR" : "ENTRAR"}</button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="w-full text-zinc-500 mt-8 text-[10px] font-black uppercase tracking-widest italic">{isReg ? "Ya tengo cuenta" : "Crear cuenta"}</button>
      </div>
    </div>
  );
}

// --- INTERFAZ PRINCIPAL ---
function MainMap({ profile }) {
  const [origen, setOrigen] = useState([9.2132, -66.0125]);
  const [destino, setDestino] = useState(null);
  const [destinoText, setDestinoText] = useState("");
  const [modo, setModo] = useState('origen');
  const [viajeActivo, setViajeActivo] = useState(null);
  const [ofertaConductor, setOfertaConductor] = useState(null);
  const [taxiPos, setTaxiPos] = useState(null);
  const [tarifa, setTarifa] = useState(0);
  const [buscando, setBuscando] = useState(false);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // Cálculo de tarifa automática
  useEffect(() => {
    if (origen && destino) {
      const d = calcularDistanciaKM(origen[0], origen[1], destino[0], destino[1]);
      const precio = Math.max(1.50, d * 0.70).toFixed(2); // $1.50 mínimo, $0.70 por km
      setTarifa(precio);
    }
  }, [origen, destino]);

  // Realtime
  useEffect(() => {
    const channel = supabase.channel('logica_pro')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        if (isConductor && payload.eventType === 'INSERT' && payload.new.estado === 'pendiente') {
          setOfertaConductor(payload.new);
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
        }
        if (payload.new.pasajero_id === profile?.id || payload.new.conductor_id === profile?.id) {
          setViajeActivo(payload.new);
          if (payload.new.cond_lat) setTaxiPos([payload.new.cond_lat, payload.new.cond_lon]);
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile, isConductor]);

  // GPS Conductor en vivo
  useEffect(() => {
    let watchId;
    if (isConductor && viajeActivo?.estado === 'en_camino') {
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        await supabase.from('viajes').update({ cond_lat: pos.coords.latitude, cond_lon: pos.coords.longitude }).eq('id', viajeActivo.id);
      }, null, { enableHighAccuracy: true });
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isConductor, viajeActivo]);

  const solicitarTaxi = async () => {
    if (!destino) return alert("Por favor selecciona un destino en el mapa.");
    setBuscando(true);
    const { error } = await supabase.from('viajes').insert([{
      pasajero_id: profile.id, nombre_pasajero: profile.nombre,
      origen_lat: origen[0], origen_lon: origen[1],
      destino_lat: destino[0], destino_lon: destino[1],
      destino_nombre: destinoText || "Punto marcado",
      tarifa_estimada: tarifa, estado: 'pendiente'
    }]);
    if (error) { alert(error.message); setBuscando(false); }
  };

  const aceptarViaje = async () => {
    const { error } = await supabase.from('viajes')
      .update({ estado: 'en_camino', conductor_id: profile.id })
      .eq('id', ofertaConductor.id).is('conductor_id', null);
    
    if (error) { alert("El viaje ya fue tomado."); setOfertaConductor(null); }
    else setOfertaConductor(null);
  };

  return (
    <div className="h-[100dvh] w-full bg-black relative overflow-hidden font-sans">
      <MapContainer center={origen} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapView center={isConductor && ofertaConductor ? [ofertaConductor.origen_lat, ofertaConductor.origen_lon] : origen} />
        <MapEvents setCoords={modo === 'origen' ? setOrigen : setDestino} active={isPasajero && !viajeActivo} />
        
        <Marker position={origen} icon={iconPasajero} />
        {destino && <Marker position={destino} icon={iconDestino} />}
        {taxiPos && <Marker position={taxiPos} icon={iconTaxi} />}

        {isConductor && ofertaConductor && (
          <Polyline positions={[[ofertaConductor.origen_lat, ofertaConductor.origen_lon], [ofertaConductor.destino_lat, ofertaConductor.destino_lon]]} color="#a855f7" weight={4} dashArray="10, 10" />
        )}
      </MapContainer>

      {/* HEADER LOGOUT */}
      <div className="absolute top-6 right-6 z-[1000] flex gap-2">
        {profile?.rol === 'admin' && <Link to="/admin" className="p-4 bg-blue-600 text-white rounded-full shadow-xl"><Shield/></Link>}
        <button onClick={() => { supabase.auth.signOut(); window.location.replace('/'); }} className="p-4 bg-zinc-900/90 text-white rounded-full border border-white/10 shadow-2xl"><LogOut/></button>
      </div>

      {/* UI PASAJERO: SELECTOR */}
      {isPasajero && !viajeActivo && (
        <div className="absolute top-20 left-6 right-6 z-[1000] space-y-2">
          <div className="bg-zinc-900/95 p-4 rounded-[30px] border border-white/10 shadow-2xl">
            <div className="flex bg-black/50 p-1 rounded-2xl mb-3">
              <button onClick={() => setModo('origen')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase ${modo === 'origen' ? 'bg-white text-black' : 'text-zinc-500'}`}>Recogida</button>
              <button onClick={() => setModo('destino')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase ${modo === 'destino' ? 'bg-white text-black' : 'text-zinc-500'}`}>Destino</button>
            </div>
            <div className="flex gap-2">
              <input className="flex-1 bg-zinc-800 p-4 rounded-2xl text-white text-sm outline-none" placeholder="¿A dónde vamos?" value={destinoText} onChange={e => setDestinoText(e.target.value)} />
              <button onClick={solicitarTaxi} className="p-4 bg-purple-600 rounded-2xl text-white"><Search/></button>
            </div>
          </div>
        </div>
      )}

      {/* FOOTER ACCIONES */}
      <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
        <div className="max-w-md mx-auto">
          {isPasajero && destino && !viajeActivo && (
            <div className="bg-white p-6 rounded-[35px] shadow-2xl text-center animate-in slide-in-from-bottom-10">
              <p className="text-zinc-400 font-bold uppercase text-[10px] mb-1 tracking-widest">Tarifa Estimada</p>
              <p className="text-black font-black text-4xl mb-4 italic">${tarifa}</p>
              <button onClick={solicitarTaxi} disabled={buscando} className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase text-xl italic tracking-tighter">
                {buscando ? "BUSCANDO TAXI..." : "PEDIR TAXI AHORA"}
              </button>
            </div>
          )}

          {isPasajero && viajeActivo?.estado === 'en_camino' && (
            <div className="bg-purple-600 p-6 rounded-[35px] text-white shadow-2xl flex items-center gap-4 animate-pulse">
              <Navigation className="animate-bounce" />
              <div>
                <p className="font-black italic uppercase leading-none">Conductor en camino</p>
                <p className="text-[10px] font-bold opacity-70 mt-1 uppercase">Síguelo en vivo en el mapa</p>
              </div>
            </div>
          )}

          {isConductor && ofertaConductor && (
            <div className="bg-white p-8 rounded-[40px] shadow-2xl animate-in slide-in-from-bottom-20">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-black font-black italic text-2xl">OFERTA: ${ofertaConductor.tarifa_estimada}</h3>
                <Car className="text-purple-600" />
              </div>
              <p className="text-zinc-500 font-bold text-xs uppercase mb-6 leading-tight">Hacia: {ofertaConductor.destino_nombre}</p>
              <div className="flex gap-2">
                <button onClick={aceptarViaje} className="flex-1 bg-black text-white py-5 rounded-2xl font-black uppercase italic text-xl">ACEPTAR</button>
                <button onClick={() => setOfertaConductor(null)} className="p-5 bg-zinc-100 text-zinc-400 rounded-2xl"><X/></button>
              </div>
            </div>
          )}

          {isConductor && viajeActivo && (
            <div className="bg-zinc-900 p-6 rounded-[35px] border border-white/10 text-white text-center shadow-2xl">
              <p className="font-black italic uppercase text-xl mb-4">SERVICIO ACTIVO</p>
              <button onClick={async () => { await supabase.from('viajes').update({ estado: 'finalizado' }).eq('id', viajeActivo.id); setViajeActivo(null); }} className="w-full bg-green-600 py-4 rounded-2xl font-black uppercase shadow-lg">FINALIZAR VIAJE</button>
            </div>
          )}
        </div>
      </div>

      <div className="absolute top-8 left-8 z-[1000] pointer-events-none">
        <h1 className="text-white font-black italic text-3xl tracking-tighter leading-none">TaxiInsta</h1>
        <p className="text-green-500 font-bold text-[10px] uppercase tracking-[0.3em] mt-1">{profile?.rol}</p>
      </div>
    </div>
  );
}

// --- PANEL ADMIN ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (profile?.rol !== 'admin') return;
    supabase.from('perfiles').select('*').order('nombre').then(({ data }) => setUsers(data || []));
  }, [profile]);

  if (profile?.rol !== 'admin') return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="flex justify-between items-center mb-10"><h1 className="text-4xl font-black italic tracking-tighter">ADMIN</h1><Link to="/"><X/></Link></div>
      <div className="grid gap-4 max-w-xl mx-auto">
        {users.map(u => (
          <div key={u.id} className="bg-zinc-900 p-6 rounded-[35px] border border-zinc-800">
            <div className="flex justify-between items-center mb-4"><p className="font-bold text-xl">{u.nombre}</p><span className="text-xs font-black uppercase text-purple-500">{u.rol}</span></div>
            <div className="grid grid-cols-3 gap-2">
              {['pasajero', 'conductor', 'admin'].map(r => (
                <button key={r} onClick={async () => { await supabase.rpc('cambiar_rol_usuario', { target_user_id: u.id, nuevo_rol: r }); window.location.reload(); }} className={`py-3 rounded-xl text-[10px] font-black uppercase ${u.rol === r ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500'}`}>{r}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}