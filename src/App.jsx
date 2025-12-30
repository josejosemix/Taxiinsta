import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Car, Navigation, LogOut, Search, Shield, Trash2, X, UserCircle, Mail, Lock } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- ICONOS ---
const passengerIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30] });
const taxiIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png', iconSize: [35, 35] });

// --- COMPONENTE LOGIN ---
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);

  const handleAuth = async (e) => {
    e.preventDefault();
    setLoading(true);
    if (isRegistering) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (!error && data.user) {
        await supabase.from('perfiles').insert([{ id: data.user.id, rol: 'pasajero', nombre: email.split('@')[0] }]);
        alert("¡Registro exitoso! Ahora inicia sesión.");
        setIsRegistering(false);
      } else { alert(error.message); }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-zinc-900 p-10 rounded-[40px] border border-zinc-800 shadow-2xl">
        <h1 className="text-4xl font-black italic mb-8 text-center bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-4 top-4 text-zinc-500" size={20}/>
            <input className="w-full p-4 pl-12 rounded-2xl bg-zinc-800 border-zinc-700 border outline-none text-white focus:border-purple-500 transition" placeholder="Correo" type="email" onChange={e => setEmail(e.target.value)} />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-4 text-zinc-500" size={20}/>
            <input className="w-full p-4 pl-12 rounded-2xl bg-zinc-800 border-zinc-700 border outline-none text-white focus:border-purple-500 transition" placeholder="Contraseña" type="password" onChange={e => setPassword(e.target.value)} />
          </div>
          <button type="submit" className="w-full bg-purple-600 p-4 rounded-2xl font-black transition active:scale-95 shadow-lg shadow-purple-500/20">
            {loading ? "Cargando..." : isRegistering ? "CREAR CUENTA" : "ENTRAR"}
          </button>
        </form>
        <button onClick={() => setIsRegistering(!isRegistering)} className="w-full mt-6 text-zinc-500 text-sm font-bold hover:text-white transition">
          {isRegistering ? "← Volver al login" : "¿Eres nuevo? Regístrate como Pasajero"}
        </button>
      </div>
    </div>
  );
}

// --- PANEL ADMIN ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);

  useEffect(() => { if (profile?.rol === 'admin') loadUsers(); }, [profile]);

  const loadUsers = async () => {
    const { data } = await supabase.from('perfiles').select('*');
    setUsers(data || []);
  };

  const deleteUser = async (id) => {
    if(window.confirm("¿Borrar usuario?")) {
      await supabase.from('perfiles').delete().eq('id', id);
      loadUsers();
    }
  };

  if (profile?.rol !== 'admin') return <Navigate to="/" />;

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <h1 className="text-3xl font-black italic uppercase">Admin <span className="text-purple-500">Panel</span></h1>
          <Link to="/" className="p-3 bg-zinc-900 rounded-full border border-zinc-800"><X/></Link>
        </div>
        <div className="grid gap-4">
          {users.map(u => (
            <div key={u.id} className="bg-zinc-900 p-5 rounded-[30px] border border-zinc-800 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <UserCircle size={40} className="text-zinc-700"/>
                <div>
                  <p className="font-bold">{u.nombre}</p>
                  <p className="text-[10px] font-black text-purple-500 uppercase">{u.rol}</p>
                </div>
              </div>
              <button onClick={() => deleteUser(u.id)} className="p-4 bg-red-500/10 text-red-500 rounded-2xl"><Trash2 size={20}/></button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- MAPA PRINCIPAL ---
function MainApp({ profile }) {
  const [myLocation] = useState([10.4806, -66.9036]);
  const mapRef = React.useRef();

  return (
    <div className="h-screen w-full flex flex-col bg-zinc-950 overflow-hidden">
      <nav className="p-4 border-b border-zinc-900 flex justify-between items-center z-[2000]">
        <h2 className="font-black italic text-xl">TaxiInsta</h2>
        <div className="flex gap-2">
          {profile?.rol === 'admin' && <Link to="/admin" className="p-2.5 bg-blue-500/10 text-blue-500 rounded-full border border-blue-500/20"><Shield size={20}/></Link>}
          <button onClick={() => supabase.auth.signOut()} className="p-2.5 bg-red-500/10 text-red-500 rounded-full border border-red-500/20"><LogOut size={20}/></button>
        </div>
      </nav>
      <main className="flex-1 relative">
        <MapContainer center={myLocation} zoom={15} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
          <Marker position={myLocation} icon={profile?.rol === 'conductor' ? taxiIcon : passengerIcon} />
        </MapContainer>
        {profile?.rol === 'pasajero' && (
          <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
            <button className="w-full bg-white text-black py-5 rounded-[25px] font-black shadow-2xl border-4 border-purple-500 active:scale-95 transition">
               ¿A DÓNDE VAMOS?
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

// --- APP ROOT ---
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  if (loading) return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-white italic font-black">Cargando...</div>;
  if (!session) return <Login />;

  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainApp profile={profile} />} />
        <Route path="/admin" element={<AdminPanel profile={profile} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}