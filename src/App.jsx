import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Popup } from 'react-leaflet';
import { LogOut, Shield, X, Navigation, User, MapPin } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Iconos personalizados estilo profesional
const passengerIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [35, 35], iconAnchor: [17, 35],
});

const taxiIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
  iconSize: [40, 40], iconAnchor: [20, 20],
});

// Ayudantes del Mapa
function MapEventsHandler({ setCoords, isPasajero, bloqueado }) {
  useMapEvents({ 
    click(e) { 
      if (isPasajero && !bloqueado) setCoords([e.latlng.lat, e.latlng.lng]); 
    } 
  });
  return null;
}

function MapViewHandler({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 16); }, [center]);
  return null;
}

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

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white font-black italic animate-pulse">TAXINSTA...</div>;

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
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-white text-center">
      <div className="w-full max-w-sm bg-zinc-900 p-10 rounded-[45px] border border-zinc-800 shadow-2xl">
        <h1 className="text-4xl font-black italic mb-10 tracking-tighter">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none focus:border-purple-500 transition-all" type="email" placeholder="Correo Electrónico" onChange={e => setEmail(e.target.value)} />
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none focus:border-purple-500 transition-all" type="password" placeholder="Contraseña" onChange={e => setPassword(e.target.value)} />
          <button className="w-full bg-purple-600 p-4 rounded-2xl font-black shadow-lg active:scale-95 transition-transform">{isReg ? "REGISTRAR" : "ENTRAR"}</button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="mt-8 text-zinc-500 text-[10px] font-bold uppercase tracking-widest block w-full">{isReg ? "Ya tengo cuenta" : "Quiero ser parte de TaxiInsta"}</button>
      </div>
    </div>
  );
}

// --- INTERFAZ PRINCIPAL ---
function MainMap({ profile }) {
  const [coords, setCoords] = useState([9.2132, -66.0125]); 
  const [taxiPos, setTaxiPos] = useState(null);
  const [viajeActivo, setViajeActivo] = useState(null);
  const [ofertaPendiente, setOfertaPendiente] = useState(null); // Para que el conductor vea la oferta
  const [buscando, setBuscando] = useState(false);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // --- REALTIME: FLUJO DE TRABAJO ---
  useEffect(() => {
    const channel = supabase.channel('logica_taxis')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        
        // 1. CONDUCTOR: Recibe nueva oferta (solo si no tiene viaje ya)
        if (isConductor && payload.eventType === 'INSERT' && payload.new.estado === 'pendiente' && !viajeActivo) {
          setOfertaPendiente(payload.new);
          // Movemos el mapa del conductor para que vea dónde está el cliente
          setCoords([payload.new.origen_lat, payload.new.origen_lon]);
          if (navigator.vibrate) navigator.vibrate([300, 100, 300]);
        }

        // 2. PASAJERO: Actualización de su viaje
        if (isPasajero && payload.new.pasajero_id === profile.id) {
          setViajeActivo(payload.new);
          if (payload.new.estado === 'en_camino' && payload.new.cond_lat) {
            setTaxiPos([payload.new.cond_lat, payload.new.cond_lon]);
          }
        }

        // 3. LIMPIEZA: Si alguien más toma el viaje, se quita la oferta al conductor
        if (isConductor && payload.eventType === 'UPDATE' && payload.new.estado === 'en_camino' && payload.new.conductor_id !== profile.id) {
          setOfertaPendiente(null);
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [isConductor, isPasajero, profile.id, viajeActivo]);

  // --- CONDUCTOR: TRANSMITIR UBICACIÓN ---
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

  // ACCIONES
  const pedirTaxi = async () => {
    const { data: conds } = await supabase.from('perfiles').select('id').eq('rol', 'conductor');
    if (!conds?.length) return alert("Lo sentimos, no hay conductores en línea.");
    
    setBuscando(true);
    await supabase.from('viajes').insert([{
      pasajero_id: profile.id, nombre_pasajero: profile.nombre,
      origen_lat: coords[0], origen_lon: coords[1], estado: 'pendiente'
    }]);
  };

  const aceptarServicio = async () => {
    if (!ofertaPendiente) return;
    const { error } = await supabase.from('viajes').update({
      estado: 'en_camino',
      conductor_id: profile.id
    }).eq('id', ofertaPendiente.id);

    if (error) {
      alert("El viaje ya fue tomado por otro conductor.");
      setOfertaPendiente(null);
    } else {
      setViajeActivo(ofertaPendiente);
      setOfertaPendiente(null);
    }
  };

  return (
    <div className="h-[100dvh] w-screen bg-black relative overflow-hidden font-sans">
      
      {/* Botón Salir */}
      <button onClick={() => { supabase.auth.signOut(); window.location.reload(); }} className="absolute top-6 right-6 z-[1000] p-4 bg-zinc-900/90 text-white rounded-full border border-white/10 backdrop-blur-md shadow-xl"><LogOut size={20}/></button>

      <MapContainer center={coords} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapViewHandler center={coords} />
        <MapEventsHandler setCoords={setCoords} isPasajero={isPasajero} bloqueado={buscando || viajeActivo} />
        
        {/* Marcador Pasajero */}
        <Marker position={coords} icon={passengerIcon}>
          <Popup className="custom-popup">Recogida aquí</Popup>
        </Marker>

        {/* Marcador Conductor (Visible para el pasajero) */}
        {taxiPos && <Marker position={taxiPos} icon={taxiIcon} />}
      </MapContainer>

      {/* --- PANEL DE INTERACCIÓN INFERIOR --- */}
      <div className="absolute bottom-0 left-0 right-0 p-8 z-[1000] bg-gradient-to-t from-black via-black/80 to-transparent">
        <div className="max-w-md mx-auto">
          
          {/* PASAJERO: Pedir o Esperar */}
          {isPasajero && !viajeActivo && (
            <button onClick={pedirTaxi} disabled={buscando} className="w-full bg-white text-black font-black py-6 rounded-[30px] shadow-[0_20px_50px_rgba(255,255,255,0.2)] uppercase text-xl italic tracking-tighter transition-all active:scale-95">
              {buscando ? "BUSCANDO TAXI..." : "SOLICITAR TAXI AHORA"}
            </button>
          )}

          {isPasajero && viajeActivo?.estado === 'en_camino' && (
            <div className="bg-purple-600 p-6 rounded-[35px] text-white shadow-2xl flex items-center gap-4 animate-pulse">
              <div className="p-3 bg-white/20 rounded-full"><Navigation className="animate-bounce"/></div>
              <div>
                <p className="font-black italic uppercase text-lg leading-none">Tu taxi va en camino</p>
                <p className="text-[10px] uppercase font-bold opacity-70">Sigue el movimiento en el mapa</p>
              </div>
            </div>
          )}

          {/* CONDUCTOR: Notificación de Nueva Solicitud */}
          {isConductor && ofertaPendiente && (
            <div className="bg-white p-8 rounded-[40px] shadow-2xl border-b-8 border-purple-500 animate-in fade-in slide-in-from-bottom-10 duration-500">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-black font-black italic text-2xl leading-none">NUEVA SOLICITUD</h3>
                  <p className="text-zinc-500 font-bold text-xs uppercase mt-1">Cliente: {ofertaPendiente.nombre_pasajero}</p>
                </div>
                <div className="bg-purple-100 p-2 rounded-xl text-purple-600"><MapPin size={24}/></div>
              </div>
              <p className="text-zinc-400 text-[10px] font-bold uppercase mb-6 tracking-widest">La ubicación se marca en tu mapa ahora mismo</p>
              <button onClick={aceptarServicio} className="w-full bg-black text-white py-5 rounded-2xl font-black uppercase text-lg italic shadow-xl active:bg-zinc-800">
                TOMAR SERVICIO
              </button>
              <button onClick={() => setOfertaPendiente(null)} className="w-full text-zinc-400 font-bold text-[10px] uppercase mt-4">Ignorar por ahora</button>
            </div>
          )}

          {/* CONDUCTOR: Estado de viaje actual */}
          {isConductor && viajeActivo && (
            <div className="bg-zinc-900 p-6 rounded-[35px] border border-white/10 text-white flex flex-col items-center gap-4 shadow-2xl">
              <div className="w-12 h-1 bg-zinc-700 rounded-full mb-2"></div>
              <p className="font-black italic uppercase text-xl">SERVICIO ACTIVO</p>
              <p className="text-zinc-500 text-xs text-center font-medium">Dirígete al punto marcado en el mapa. Tu ubicación se está compartiendo con el cliente.</p>
              <button onClick={() => setViajeActivo(null)} className="w-full bg-green-600 py-4 rounded-2xl font-black uppercase text-sm mt-2 shadow-lg">FINALIZAR VIAJE</button>
            </div>
          )}
        </div>
      </div>
      
      {/* Indicador de Rol arriba a la izquierda */}
      <div className="absolute top-8 left-8 z-[1000] pointer-events-none">
        <h2 className="text-white font-black italic text-3xl tracking-tighter leading-none">TaxiInsta</h2>
        <div className="flex items-center gap-2 mt-1">
          <div className={`w-2 h-2 rounded-full ${isConductor ? 'bg-green-500' : 'bg-purple-500'}`}></div>
          <span className="text-[10px] text-white/50 font-black uppercase tracking-[0.2em]">{profile?.rol}</span>
        </div>
      </div>
    </div>
  );
}

// Panel Admin (Simplificado)
function AdminPanel({ profile }) {
  if (profile?.rol !== 'admin') return <Navigate to="/" />;
  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="flex justify-between items-center mb-10">
        <h1 className="text-4xl font-black italic tracking-tighter">PANEL ADMIN</h1>
        <Link to="/" className="p-4 bg-zinc-900 rounded-full border border-zinc-800"><X/></Link>
      </div>
      <p className="text-zinc-500 font-bold uppercase tracking-widest text-xs">Gestión de flota y usuarios</p>
      {/* Aquí puedes reutilizar el código anterior del listado de usuarios */}
    </div>
  );
}