import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Car, Navigation, LogOut, Search, Shield, Trash2, X, Settings, UserCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- ICONOS ---
const passengerIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30] });
const taxiIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png', iconSize: [35, 35] });

// --- COMPONENTES DE APOYO ---
function MapResizer() {
  const map = useMap();
  useEffect(() => { setTimeout(() => { map.invalidateSize(); }, 500); }, [map]);
  return null;
}

// --- VISTA PANEL ADMINISTRADOR (Solo accesible vía /admin) ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (profile?.rol === 'admin') loadUsers();
  }, [profile]);

  const loadUsers = async () => {
    const { data } = await supabase.from('perfiles').select('*');
    setUsers(data || []);
  };

  const deleteUser = async (id) => {
    if(window.confirm("¿Seguro que deseas eliminar este usuario?")) {
      await supabase.from('perfiles').delete().eq('id', id);
      loadUsers();
    }
  };

  if (profile?.rol !== 'admin') {
    return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center p-10 text-center">
      <div>
        <Shield size={60} className="mx-auto text-red-500 mb-4" />
        <h1 className="text-2xl font-bold">ACCESO DENEGADO</h1>
        <p className="text-zinc-500">No tienes permisos para estar aquí.</p>
        <Link to="/" className="mt-4 inline-block bg-purple-600 px-6 py-2 rounded-xl">Volver al Mapa</Link>
      </div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6 font-sans">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-black italic">ADMIN <span className="text-purple-500">CONTROL</span></h1>
          <Link to="/" className="p-3 bg-zinc-900 rounded-2xl border border-zinc-800"><X/></Link>
        </div>
        
        <div className="grid gap-4">
          {users.map(u => (
            <div key={u.id} className="bg-zinc-900 p-5 rounded-[30px] border border-zinc-800 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-zinc-800 rounded-full flex items-center justify-center text-purple-500">
                  <UserCircle size={30}/>
                </div>
                <div>
                  <p className="font-bold text-lg leading-tight">{u.nombre}</p>
                  <p className="text-xs font-black text-purple-600 uppercase tracking-widest">{u.rol}</p>
                </div>
              </div>
              <button onClick={() => deleteUser(u.id)} className="p-4 bg-red-500/10 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition">
                <Trash2 size={20}/>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- VISTA PRINCIPAL (MAPA) ---
function MainApp({ profile, session }) {
  const [destino, setDestino] = useState("");
  const [myLocation] = useState([10.4806, -66.9036]);

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-950 overflow-hidden">
      <nav className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-950/50 backdrop-blur-xl z-[2000]">
        <h2 className="font-black italic text-xl text-white">TaxiInsta</h2>
        <div className="flex gap-2">
          {profile?.rol === 'admin' && (
            <Link to="/admin" className="p-2.5 bg-blue-500/10 text-blue-500 rounded-full border border-blue-500/20"><Shield size={20}/></Link>
          )}
          <button onClick={() => supabase.auth.signOut()} className="p-2.5 bg-red-500/10 text-red-500 rounded-full"><LogOut size={20}/></button>
        </div>
      </nav>

      <main className="flex-1 relative">
        <MapContainer center={myLocation} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <MapResizer />
          <Marker position={myLocation} icon={profile?.rol === 'conductor' ? taxiIcon : passengerIcon} />
        </MapContainer>

        {profile?.rol === 'pasajero' && (
          <div className="absolute top-6 left-0 right-0 px-6 z-[1000]">
            <input 
              className="w-full bg-zinc-900/90 backdrop-blur-md p-4 rounded-3xl border border-white/10 outline-none text-white shadow-2xl"
              placeholder="¿A dónde vamos hoy?"
              onChange={(e) => setDestino(e.target.value)}
            />
          </div>
        )}
      </main>
    </div>
  );
}

// --- COMPONENTE ROOT CON RUTAS ---
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) getProfile(session.user.id);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) getProfile(session.user.id);
    });
  }, []);

  async function getProfile(id) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', id).single();
    if (data) setProfile(data);
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 text-white italic font-black">
        Cargando App... (O redirigiendo al Login)
        {/* Aquí iría tu componente de Login que ya tienes */}
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainApp profile={profile} session={session} />} />
        <Route path="/admin" element={<AdminPanel profile={profile} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}