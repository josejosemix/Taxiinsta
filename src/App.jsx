import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { LogOut, Shield, X, Search, Mail, Lock, User, Navigation, Info } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Iconos personalizados
const passengerIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [32, 32], iconAnchor: [16, 32],
});

const taxiIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png',
  iconSize: [40, 40], iconAnchor: [20, 20],
});

// Componentes de soporte del Mapa
function MapEventsHandler({ setCoords, isPasajero }) {
  useMapEvents({ click(e) { if (isPasajero) setCoords([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

function MapViewHandler({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, 16); }, [center]);
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

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white font-black italic">TAXINSTA...</div>;

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

// --- LOGIN ---
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
      <div className="w-full max-w-sm bg-zinc-900 p-10 rounded-[45px] border border-zinc-800">
        <h1 className="text-4xl font-black italic mb-10 tracking-tighter">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none" type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} />
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
          <button className="w-full bg-purple-600 p-4 rounded-2xl font-black">{isReg ? "REGISTRAR" : "ENTRAR"}</button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="mt-6 text-zinc-500 text-[10px] font-bold uppercase tracking-widest">{isReg ? "Ya tengo cuenta" : "Crear cuenta"}</button>
      </div>
    </div>
  );
}

// --- INTERFAZ DEL MAPA (CON SEGUIMIENTO) ---
function MainMap({ profile }) {
  const [coords, setCoords] = useState([9.2132, -66.0125]); 
  const [taxiPos, setTaxiPos] = useState(null); // Ubicación del conductor en vivo
  const [solicitudEnviada, setSolicitudEnviada] = useState(false);
  const [viajeActivo, setViajeActivo] = useState(null);
  const [notificacionConductor, setNotificacionConductor] = useState(null);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // Cerrar sesión con recarga para móvil
  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.replace('/');
  };

  // --- LÓGICA DE TIEMPO REAL ---
  useEffect(() => {
    const channel = supabase.channel('viajes_flujo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, 
      (payload) => {
        // Conductor: Ve nuevas solicitudes
        if (isConductor && payload.eventType === 'INSERT' && payload.new.estado === 'pendiente') {
          setNotificacionConductor(payload.new);
        }
        
        // Pasajero: Recibe actualización de su viaje (Aceptado o Posición del taxi)
        if (isPasajero && payload.new.pasajero_id === profile.id) {
          setViajeActivo(payload.new);
          if (payload.new.estado === 'en_camino' && payload.new.cond_lat) {
            setTaxiPos([payload.new.cond_lat, payload.new.cond_lon]);
          }
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [isConductor, isPasajero, profile.id]);

  // --- CONDUCTOR: TRANSMITIR GPS ---
  useEffect(() => {
    let interval;
    if (isConductor && viajeActivo && viajeActivo.estado === 'en_camino') {
      interval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          await supabase.from('viajes').update({
            cond_lat: pos.coords.latitude,
            cond_lon: pos.coords.longitude
          }).eq('id', viajeActivo.id);
        });
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [isConductor, viajeActivo]);

  const solicitarTaxi = async () => {
    // 1. Verificar si hay conductores
    const { data: conductores } = await supabase.from('perfiles').select('id').eq('rol', 'conductor');
    if (!conductores || conductores.length === 0) {
      alert("❌ NO HAY TAXIS: En este momento no hay conductores conectados en Valle de la Pascua.");
      return;
    }

    setSolicitudEnviada(true);
    const { error } = await supabase.from('viajes').insert([{
      pasajero_id: profile.id, nombre_pasajero: profile.nombre,
      origen_lat: coords[0], origen_lon: coords[1], estado: 'pendiente'
    }]);
    if (error) alert(error.message);
  };

  const aceptarViaje = async () => {
    const { error } = await supabase.from('viajes').update({
      estado: 'en_camino',
      conductor_id: profile.id
    }).eq('id', notificacionConductor.id);
    
    if (!error) {
      setViajeActivo(notificacionConductor);
      setNotificacionConductor(null);
      setCoords([notificacionConductor.origen_lat, notificacionConductor.origen_lon]);
    }
  };

  return (
    <div className="h-[100dvh] w-screen bg-black relative overflow-hidden">
      
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <div className="text-white">
          <h2 className="font-black italic text-2xl tracking-tighter">TaxiInsta</h2>
          <span className="text-[10px] text-green-500 font-black uppercase tracking-widest">{profile?.rol}</span>
        </div>
        <button onClick={handleLogout} className="p-4 bg-zinc-900/80 text-white rounded-full border border-white/10"><LogOut/></button>
      </div>

      {/* Mapa */}
      <MapContainer center={coords} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapViewHandler center={coords} />
        <MapEventsHandler setCoords={setCoords} isPasajero={isPasajero && !viajeActivo} />
        
        {/* Marcador Pasajero */}
        <Marker position={coords} icon={passengerIcon} />

        {/* Marcador Taxi (Visible para ambos durante el viaje) */}
        {taxiPos && <Marker position={taxiPos} icon={taxiIcon} />}
      </MapContainer>

      {/* --- UI FLOTANTE --- */}
      <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
        
        {/* PASAJERO: Estado del pedido */}
        {isPasajero && !viajeActivo && (
          <button onClick={solicitarTaxi} disabled={solicitudEnviada} className="w-full bg-white text-black font-black py-5 rounded-[30px] shadow-2xl uppercase text-xl tracking-tighter">
            {solicitudEnviada ? "BUSCANDO TAXI..." : "PEDIR TAXI AHORA"}
          </button>
        )}

        {isPasajero && viajeActivo?.estado === 'en_camino' && (
          <div className="bg-purple-600 p-6 rounded-[35px] text-white shadow-2xl animate-pulse">
            <div className="flex items-center gap-4">
              <Navigation className="animate-spin" />
              <div>
                <p className="font-black italic uppercase leading-none">¡Conductor en camino!</p>
                <p className="text-[10px] opacity-80 mt-1 uppercase">Síguelo en vivo en el mapa</p>
              </div>
            </div>
          </div>
        )}

        {/* CONDUCTOR: Notificación y Acción */}
        {isConductor && notificacionConductor && (
          <div className="bg-white p-6 rounded-[35px] shadow-2xl border-4 border-purple-500">
            <h3 className="text-black font-black italic text-xl mb-4 leading-none">NUEVA SOLICITUD</h3>
            <button onClick={aceptarViaje} className="w-full bg-black text-white py-4 rounded-2xl font-black uppercase">TOMAR SERVICIO</button>
          </div>
        )}

        {isConductor && viajeActivo?.estado === 'en_camino' && (
          <div className="bg-green-500 p-6 rounded-[35px] text-white text-center shadow-2xl">
            <p className="font-black italic uppercase">Vas hacia el pasajero</p>
            <p className="text-[10px] uppercase font-bold">Transmitiendo GPS en vivo...</p>
          </div>
        )}
      </div>

      {profile?.rol === 'admin' && (
        <Link to="/admin" className="absolute top-24 right-6 z-[1000] p-4 bg-blue-600 text-white rounded-full"><Shield/></Link>
      )}
    </div>
  );
}

// --- PANEL ADMIN (Igual que antes) ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    supabase.from('perfiles').select('*').order('nombre').then(({ data }) => setUsers(data || []));
  }, []);
  const handleUpdateRole = async (userId, newRole) => {
    await supabase.rpc('cambiar_rol_usuario', { target_user_id: userId, nuevo_rol: newRole });
    window.location.reload();
  };
  if (profile?.rol !== 'admin') return <Navigate to="/" />;
  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="flex justify-between items-center mb-8"><h1 className="text-3xl font-black italic italic tracking-tighter">ADMIN</h1><Link to="/"><X/></Link></div>
      {users.map(u => (
        <div key={u.id} className="bg-zinc-900 p-6 rounded-[30px] mb-4 border border-zinc-800">
          <p className="font-bold mb-4">{u.nombre} - <span className="text-purple-500">{u.rol}</span></p>
          <div className="grid grid-cols-3 gap-2">
            {['pasajero', 'conductor', 'admin'].map(r => (
              <button key={r} onClick={() => handleUpdateRole(u.id, r)} className={`py-2 rounded-xl text-[10px] font-bold uppercase ${u.rol === r ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500'}`}>{r}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}