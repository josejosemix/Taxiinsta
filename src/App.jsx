import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { LogOut, Shield, X, Search, Mail, Lock, User } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const customIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// --- NUEVO: Captura el click del pasajero para mover el marcador ---
function MapEventsHandler({ setCoords, isPasajero }) {
  useMapEvents({
    click(e) {
      if (isPasajero) {
        setCoords([e.latlng.lat, e.latlng.lng]);
      }
    },
  });
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

// --- LOGIN (Sin cambios mayores) ---
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
        <h1 className="text-4xl font-black italic mb-10 italic tracking-tighter">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none" type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} />
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} />
          <button className="w-full bg-purple-600 p-4 rounded-2xl font-black">{isReg ? "REGISTRAR" : "ENTRAR"}</button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="mt-6 text-zinc-500 text-[10px] font-bold uppercase tracking-widest italic">{isReg ? "Ya tengo cuenta" : "Crear cuenta"}</button>
      </div>
    </div>
  );
}

// --- INTERFAZ DEL MAPA (Corregida) ---
function MainMap({ profile }) {
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState([9.2132, -66.0125]); // Valle de la Pascua
  const [enviando, setEnviando] = useState(false);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  const buscar = async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${search}`);
    const data = await res.json();
    if (data[0]) setCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
  };

  const enviarSolicitud = async () => {
    setEnviando(true);
    const { error } = await supabase.from('viajes').insert([{
      pasajero_id: profile.id,
      nombre_pasajero: profile.nombre,
      origen_lat: coords[0],
      origen_lon: coords[1],
      estado: 'pendiente'
    }]);

    if (error) alert("Error: " + error.message);
    else alert("¡Solicitud enviada! Buscando conductores en Valle de la Pascua...");
    setEnviando(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-black relative overflow-hidden font-sans">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-6 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <div>
          <h2 className="text-white font-black italic text-2xl tracking-tighter">TaxiInsta</h2>
          <span className="text-[10px] text-green-500 font-black uppercase tracking-widest leading-none">
             {profile?.rol}
          </span>
        </div>
        <div className="flex gap-2">
          {profile?.rol === 'admin' && <Link to="/admin" className="p-3 bg-blue-600 text-white rounded-full"><Shield size={20}/></Link>}
          <button onClick={() => supabase.auth.signOut()} className="p-3 bg-zinc-900 text-white rounded-full border border-white/10"><LogOut size={20}/></button>
        </div>
      </div>

      {/* Buscador - SOLO PARA PASAJEROS */}
      {isPasajero && (
        <div className="absolute top-24 left-0 right-0 z-[1000] px-6">
          <div className="bg-zinc-900/90 border border-white/10 rounded-[25px] flex p-1 shadow-2xl backdrop-blur-md max-w-md mx-auto">
            <input className="flex-1 bg-transparent p-4 text-white outline-none text-sm" placeholder="¿A dónde vamos?" value={search} onChange={e => setSearch(e.target.value)} onKeyPress={e => e.key === 'Enter' && buscar()} />
            <button onClick={buscar} className="p-4 bg-purple-600 rounded-[20px] text-white"><Search size={20}/></button>
          </div>
        </div>
      )}

      {/* Mapa - Pasajero puede clickear */}
      <MapContainer center={coords} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapViewHandler center={coords} />
        <MapEventsHandler setCoords={setCoords} isPasajero={isPasajero} />
        <Marker position={coords} icon={customIcon} />
      </MapContainer>

      {/* Botón de Acción - SOLO PARA PASAJEROS */}
      {isPasajero && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
          <button 
            onClick={enviarSolicitud}
            disabled={enviando}
            className="w-full max-w-md mx-auto block bg-white text-black font-black py-5 rounded-[30px] shadow-2xl active:scale-95 transition-transform uppercase text-xl tracking-tighter"
          >
            {enviando ? "PROCESANDO..." : "SOLICITAR TAXI AHORA"}
          </button>
        </div>
      )}

      {/* Mensaje para Conductores */}
      {isConductor && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000] text-center">
          <div className="bg-zinc-900/90 border border-green-500/30 p-4 rounded-2xl text-white max-w-sm mx-auto backdrop-blur-md">
            <p className="font-bold text-sm uppercase tracking-widest text-green-400 animate-pulse">Esperando servicios...</p>
            <p className="text-[10px] text-zinc-500 mt-1 italic">Tu ubicación se está compartiendo con la central</p>
          </div>
        </div>
      )}
    </div>
  );
}

// --- ADMIN PANEL (Igual al anterior, pero actualizado) ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);
  const [updating, setUpdating] = useState(null);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    const { data } = await supabase.from('perfiles').select('*').order('nombre');
    setUsers(data || []);
  };

  const handleUpdateRole = async (userId, newRole) => {
    setUpdating(userId);
    const { error } = await supabase.rpc('cambiar_rol_usuario', { target_user_id: userId, nuevo_rol: newRole });
    if (error) alert(error.message); else fetchUsers();
    setUpdating(null);
  };

  if (profile?.rol !== 'admin') return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="flex justify-between items-center mb-10 max-w-xl mx-auto">
        <h1 className="text-3xl font-black italic tracking-tighter uppercase">Equipo</h1>
        <Link to="/" className="p-4 bg-zinc-900 rounded-full"><X/></Link>
      </div>
      <div className="max-w-xl mx-auto space-y-4">
        {users.map(u => (
          <div key={u.id} className="bg-zinc-900/50 p-6 rounded-[35px] border border-zinc-800">
            <div className="flex justify-between items-center mb-4">
              <p className="font-bold text-xl">{u.nombre}</p>
              <span className="text-[10px] font-black uppercase text-purple-500">{u.rol}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {['pasajero', 'conductor', 'admin'].map(r => (
                <button 
                  key={r}
                  onClick={() => handleUpdateRole(u.id, r)}
                  disabled={updating === u.id || u.id === profile.id}
                  className={`py-2 rounded-xl text-[9px] font-black uppercase ${u.rol === r ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500'}`}
                >
                  {updating === u.id ? '...' : r}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}