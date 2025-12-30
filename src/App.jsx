import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { LogOut, Shield, Trash2, X, Search, MapPin } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- CONFIGURACIÓN DE ICONOS ---
const taxiIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png', iconSize: [35, 35] });

// --- LÓGICA DEL MAPA ---
function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, 15); }, [center]);
  return null;
}

// --- APP PRINCIPAL ---
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) checkProfile(session.user);
      else setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) checkProfile(session.user);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function checkProfile(user) {
    let { data, error } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
    
    // Si el perfil no existe, lo creamos automáticamente
    if (!data) {
      const { data: newProfile } = await supabase.from('perfiles').insert([
        { id: user.id, nombre: user.email.split('@')[0], rol: 'pasajero' }
      ]).select().single();
      setProfile(newProfile);
    } else {
      setProfile(data);
    }
    setLoading(false);
  }

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white italic font-black animate-pulse">CARGANDO...</div>;
  if (!session) return <div className="text-white p-20">Por favor, inicia sesión o regístrate en la app.</div>;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainInterface profile={profile} />} />
        <Route path="/admin" element={<AdminPanel profile={profile} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

// --- INTERFAZ DE MAPA Y BUSCADOR ---
function MainInterface({ profile }) {
  const [destino, setDestino] = useState("");
  const [posicionDestino, setPosicionDestino] = useState(null);
  const centroInicial = [10.4806, -66.9036];

  const buscarDireccion = async () => {
    if (destino.length < 3) return;
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${destino}`);
    const data = await res.json();
    if (data.length > 0) {
      setPosicionDestino([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-zinc-950 text-white">
      <nav className="p-4 flex justify-between items-center bg-zinc-900/50 backdrop-blur-md z-[2000]">
        <h1 className="font-black italic text-xl">TaxiInsta</h1>
        <div className="flex gap-2">
          {profile?.rol === 'admin' && <Link to="/admin" className="p-2 bg-blue-600/20 text-blue-500 rounded-full"><Shield/></Link>}
          <button onClick={() => supabase.auth.signOut()} className="p-2 bg-red-600/20 text-red-500 rounded-full"><LogOut/></button>
        </div>
      </nav>

      <div className="flex-1 relative">
        <MapContainer center={centroInicial} zoom={14} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <ChangeView center={posicionDestino} />
          {posicionDestino && <Marker position={posicionDestino} />}
        </MapContainer>

        {/* Buscador Estilo Instagram */}
        <div className="absolute top-4 left-0 right-0 px-6 z-[1000]">
          <div className="bg-zinc-900/90 p-2 rounded-full border border-white/10 flex items-center shadow-2xl">
            <input 
              className="flex-1 bg-transparent px-4 outline-none text-sm"
              placeholder="¿A dónde vas?"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && buscarDireccion()}
            />
            <button onClick={buscarDireccion} className="bg-purple-600 p-3 rounded-full"><Search size={18}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- PANEL ADMIN ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    supabase.from('perfiles').select('*').then(({ data }) => setUsers(data || []));
  }, []);

  if (profile?.rol !== 'admin') return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-black italic">ADMIN CONTROL</h2>
        <Link to="/" className="p-2 bg-zinc-800 rounded-full"><X/></Link>
      </div>
      <div className="space-y-3">
        {users.map(u => (
          <div key={u.id} className="p-4 bg-zinc-900 rounded-2xl border border-zinc-800 flex justify-between">
            <div>
              <p className="font-bold">{u.nombre}</p>
              <p className="text-xs text-purple-500 font-black">{u.rol}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}