import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { LogOut, Shield, X, Search, User, Lock, Mail } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Icono personalizado para el mapa
const customIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/2776/2776067.png',
  iconSize: [38, 38],
});

// Componente para mover la cámara del mapa
function MapViewHandler({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, 16);
  }, [center]);
  return null;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuchar cambios de sesión
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) getProfile(session.user.id);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) getProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function getProfile(id) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', id).single();
    setProfile(data);
    setLoading(false);
  }

  if (loading) return (
    <div className="h-screen bg-zinc-950 flex items-center justify-center">
      <div className="text-white font-black italic text-2xl animate-pulse">TaxiInsta...</div>
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

// --- PANTALLA DE LOGIN / REGISTRO ---
function AuthScreen() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    let error;

    if (isRegister) {
      const { data, error: regError } = await supabase.auth.signUp({ email, password });
      error = regError;
      if (!error && data.user) {
        await supabase.from('perfiles').insert([{ id: data.user.id, nombre: email.split('@')[0], rol: 'pasajero' }]);
      }
    } else {
      const { error: logError } = await supabase.auth.signInWithPassword({ email, password });
      error = logError;
    }

    if (error) alert(error.message);
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
      <div className="w-full max-w-[350px] space-y-6">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-2xl">
          <h1 className="text-4xl font-black italic text-center mb-8 bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
          <form onSubmit={handleAuth} className="space-y-3">
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 text-zinc-500" size={18} />
              <input className="w-full bg-zinc-800 border-zinc-700 border p-3 pl-10 rounded-xl text-white outline-none focus:border-purple-500 transition-all" type="email" placeholder="Correo electrónico" onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3.5 text-zinc-500" size={18} />
              <input className="w-full bg-zinc-800 border-zinc-700 border p-3 pl-10 rounded-xl text-white outline-none focus:border-purple-500 transition-all" type="password" placeholder="Contraseña" onChange={e => setPassword(e.target.value)} required />
            </div>
            <button className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold p-3 rounded-xl transition-all shadow-lg shadow-purple-500/20">
              {loading ? "Procesando..." : isRegister ? "Registrarse" : "Entrar"}
            </button>
          </form>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-center">
          <p className="text-zinc-400 text-sm">
            {isRegister ? "¿Ya tienes cuenta?" : "¿No tienes cuenta?"} 
            <button onClick={() => setIsRegister(!isRegister)} className="text-purple-400 font-bold ml-1 hover:underline">
              {isRegister ? "Inicia sesión" : "Regístrate"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

// --- INTERFAZ PRINCIPAL (MAPA) ---
function MainMap({ profile }) {
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState([10.4806, -66.9036]); // Caracas por defecto

  const handleSearch = async () => {
    if (search.length < 3) return;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${search}`);
    const data = await res.json();
    if (data.length > 0) {
      setCoords([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-black overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 w-full z-[1000] p-4 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
        <h2 className="text-white font-black italic text-xl">TaxiInsta</h2>
        <div className="flex gap-2">
          {profile?.rol === 'admin' && (
            <Link to="/admin" className="p-2 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full backdrop-blur-md">
              <Shield size={20} />
            </Link>
          )}
          <button onClick={() => supabase.auth.signOut()} className="p-2 bg-zinc-900/50 text-white border border-white/10 rounded-full backdrop-blur-md">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Buscador Flotante (Estilo Mobile) */}
      <div className="absolute top-16 w-full z-[1000] px-4">
        <div className="bg-zinc-900/90 border border-white/10 rounded-2xl flex items-center p-1 shadow-2xl backdrop-blur-xl">
          <input 
            className="flex-1 bg-transparent p-3 text-white outline-none text-sm"
            placeholder="¿A dónde vas?"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button onClick={handleSearch} className="p-3 bg-purple-600 rounded-xl text-white">
            <Search size={18} />
          </button>
        </div>
      </div>

      <div className="flex-1">
        <MapContainer center={coords} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <MapViewHandler center={coords} />
          <Marker position={coords} icon={customIcon} />
        </MapContainer>
      </div>

      {/* Botón de Acción Inferior */}
      <div className="absolute bottom-6 w-full px-6 z-[1000]">
        <button className="w-full bg-white text-black font-black py-4 rounded-2xl shadow-2xl active:scale-95 transition-transform uppercase tracking-tighter text-lg">
          Solicitar Taxi Ahora
        </button>
      </div>
    </div>
  );
}

// --- PANEL DE ADMINISTRACIÓN ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    supabase.from('perfiles').select('*').then(({ data }) => setUsers(data || []));
  }, []);

  if (profile?.rol !== 'admin') return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-black italic">PANEL <span className="text-purple-500 italic">ADMIN</span></h1>
        <Link to="/" className="p-2 bg-zinc-900 rounded-full"><X/></Link>
      </div>
      <div className="grid gap-3">
        {users.map(u => (
          <div key={u.id} className="p-4 bg-zinc-900 border border-zinc-800 rounded-2xl flex justify-between items-center">
            <div>
              <p className="font-bold text-zinc-200">{u.nombre}</p>
              <p className="text-[10px] font-black uppercase text-purple-500 tracking-widest">{u.rol}</p>
            </div>
            <div className="flex gap-2 text-zinc-500 text-[10px]">
              {u.id.substring(0,8)}...
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}