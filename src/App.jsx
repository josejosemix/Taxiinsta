import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { LogOut, Shield, X, Search, Mail, Lock, User, CheckCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Configuración de Icono personalizado
const customIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
  iconSize: [32, 32],
  iconAnchor: [16, 32],
});

// Componente para controlar la vista del mapa
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
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
    if (!data || error) {
      const { data: newP } = await supabase.from('perfiles').insert([
        { id: user.id, nombre: user.email.split('@')[0], rol: 'pasajero' }
      ]).select().single();
      setProfile(newP);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }

  if (loading) return (
    <div className="h-screen bg-black flex items-center justify-center">
      <div className="text-white font-black italic text-2xl animate-pulse tracking-tighter">TAXINSTA...</div>
    </div>
  );

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
  const [load, setLoad] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoad(true);
    const { error } = isReg 
      ? await supabase.auth.signUp({ email, password }) 
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
    setLoad(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-10 rounded-[45px] shadow-2xl">
        <h1 className="text-4xl font-black italic text-center text-white mb-10 tracking-tighter">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-4 top-4 text-zinc-500" size={18} />
            <input className="w-full bg-zinc-800 p-4 pl-12 rounded-2xl text-white outline-none border border-zinc-700 focus:border-purple-500" type="email" placeholder="Correo" onChange={e => setEmail(e.target.value)} required />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-4 text-zinc-500" size={18} />
            <input className="w-full bg-zinc-800 p-4 pl-12 rounded-2xl text-white outline-none border border-zinc-700 focus:border-purple-500" type="password" placeholder="Contraseña" onChange={e => setPassword(e.target.value)} required />
          </div>
          <button className="w-full bg-purple-600 p-4 rounded-2xl text-white font-black uppercase tracking-widest hover:bg-purple-500 transition-all">
            {load ? "..." : isReg ? "Crear Cuenta" : "Entrar"}
          </button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="w-full text-zinc-500 mt-8 text-[10px] font-black uppercase tracking-[0.2em]">
          {isReg ? "Ya tengo cuenta / Volver" : "¿Nuevo? Regístrate aquí"}
        </button>
      </div>
    </div>
  );
}

// --- INTERFAZ DEL MAPA ---
function MainMap({ profile }) {
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState([9.2132, -66.0125]); // Valle de la Pascua

  const handleSearch = async () => {
    if (search.length < 3) return;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${search}`);
    const data = await res.json();
    if (data[0]) setCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
  };

  return (
    <div className="h-[100dvh] w-screen bg-black relative overflow-hidden">
      {/* Header Estilo Instagram */}
      <div className="absolute top-0 left-0 right-0 z-[1000] p-6 flex justify-between items-center bg-gradient-to-b from-black/90 to-transparent">
        <div>
          <h2 className="text-white font-black italic text-2xl tracking-tighter">TaxiInsta</h2>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            <span className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">{profile?.rol}</span>
          </div>
        </div>
        <div className="flex gap-3">
          {profile?.rol === 'admin' && (
            <Link to="/admin" className="p-3 bg-blue-600 text-white rounded-full shadow-lg active:scale-90 transition-transform">
              <Shield size={20} />
            </Link>
          )}
          <button onClick={() => supabase.auth.signOut()} className="p-3 bg-zinc-900/80 text-white rounded-full border border-white/10 backdrop-blur-md">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Buscador Flotante */}
      <div className="absolute top-24 left-0 right-0 z-[1000] px-6">
        <div className="bg-zinc-900/90 border border-white/10 rounded-[25px] flex p-1 shadow-2xl backdrop-blur-xl max-w-md mx-auto">
          <input className="flex-1 bg-transparent p-4 text-white outline-none text-sm" placeholder="¿A dónde vas?" value={search} onChange={e => setSearch(e.target.value)} onKeyPress={e => e.key === 'Enter' && handleSearch()} />
          <button onClick={handleSearch} className="p-4 bg-purple-600 rounded-[20px] text-white"><Search size={20}/></button>
        </div>
      </div>

      <MapContainer center={coords} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapViewHandler center={coords} />
        <Marker position={coords} icon={customIcon} />
      </MapContainer>

      {/* Botón de Acción Principal */}
      <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
        <button className="w-full max-w-md mx-auto block bg-white text-black font-black py-5 rounded-[30px] shadow-2xl active:scale-95 transition-transform uppercase text-xl tracking-tighter">
          Solicitar Taxi Ahora
        </button>
      </div>
    </div>
  );
}

// --- PANEL ADMIN PROFESIONAL ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);
  const [updating, setUpdating] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const { data } = await supabase.from('perfiles').select('*').order('nombre');
    setUsers(data || []);
  };

  const handleUpdateRole = async (userId, newRole) => {
    setUpdating(userId);
    const { error } = await supabase.rpc('cambiar_rol_usuario', { 
      target_user_id: userId, 
      nuevo_rol: newRole 
    });
    if (error) alert("Error: " + error.message);
    else fetchUsers();
    setUpdating(null);
  };

  if (profile?.rol !== 'admin') return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-black text-white p-6 pb-20 overflow-x-hidden">
      <div className="max-w-xl mx-auto">
        <div className="flex justify-between items-center mb-10 mt-4">
          <div>
            <h1 className="text-3xl font-black italic tracking-tighter">EQUIPO</h1>
            <p className="text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em]">Gestión de Roles</p>
          </div>
          <Link to="/" className="p-4 bg-zinc-900 rounded-full border border-zinc-800"><X size={24}/></Link>
        </div>

        <div className="grid gap-4">
          {users.map(u => (
            <div key={u.id} className="bg-zinc-900/50 border border-zinc-800/50 p-6 rounded-[35px] backdrop-blur-sm relative overflow-hidden">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white leading-none mb-2">{u.nombre}</h3>
                  <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                    u.rol === 'admin' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                    u.rol === 'conductor' ? 'bg-green-500/10 text-green-400 border border-green-500/20' :
                    'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                  }`}>
                    {u.rol}
                  </span>
                </div>
                <User className="text-zinc-800" size={40} />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {['pasajero', 'conductor', 'admin'].map((r) => (
                  <button
                    key={r}
                    onClick={() => handleUpdateRole(u.id, r)}
                    disabled={updating === u.id || u.id === profile.id}
                    className={`py-3 rounded-2xl text-[9px] font-black uppercase transition-all ${
                      u.rol === r ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                    } ${u.id === profile.id ? 'opacity-30 cursor-not-allowed' : ''}`}
                  >
                    {updating === u.id ? '...' : r}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}