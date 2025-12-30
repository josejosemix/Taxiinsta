import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Car, Navigation, LogOut, Mail, Lock, UserPlus, ArrowLeft, Search, Settings, Trash2, Shield } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const passengerIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30] });
const taxiIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png', iconSize: [35, 35] });

function MapResizer() {
  const map = useMap();
  useEffect(() => { setTimeout(() => { map.invalidateSize(); }, 500); }, [map]);
  return null;
}

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, map.getZoom()); }, [center, map]);
  return null;
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [isAdminView, setIsAdminView] = useState(false); // Panel Admin
  const [allUsers, setAllUsers] = useState([]); // Para el Admin
  const [destino, setDestino] = useState("");
  const [myLocation, setMyLocation] = useState([10.4806, -66.9036]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) getProfile(session.user.id);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) getProfile(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function getProfile(id) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', id).single();
    if (data) setProfile(data);
  }

  // Cargar usuarios para el Admin
  const loadAllUsers = async () => {
    const { data } = await supabase.from('perfiles').select('*');
    setAllUsers(data || []);
  };

  const deleteUser = async (id) => {
    if(window.confirm("¿Borrar este usuario?")) {
      await supabase.from('perfiles').delete().eq('id', id);
      loadAllUsers();
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    if (isRegistering) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (!error) {
        await supabase.from('perfiles').insert([{ id: data.user.id, rol: 'pasajero', nombre: email.split('@')[0] }]);
        alert("Registro exitoso");
        setIsRegistering(false);
      }
    } else {
      await supabase.auth.signInWithPassword({ email, password });
    }
  };

  // Lógica de Pedido Real
  const solicitarViaje = async () => {
    if (!destino) return alert("Escribe un destino primero");
    const { error } = await supabase.from('pedidos').insert([
      { pasajero_id: session.user.id, origen: 'Mi ubicación', destino: destino, estado: 'pendiente' }
    ]);
    if (!error) alert("¡Pedido enviado! Los conductores verán tu solicitud.");
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-zinc-900 p-10 rounded-[40px] border border-zinc-800 text-white">
          <h1 className="text-4xl font-black italic mb-8 text-center bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
          <form onSubmit={handleAuth} className="space-y-4">
            <input className="w-full p-4 rounded-2xl bg-zinc-800 border-zinc-700 border outline-none text-white" placeholder="Email" onChange={e => setEmail(e.target.value)} />
            <input type="password" className="w-full p-4 rounded-2xl bg-zinc-800 border-zinc-700 border outline-none text-white" placeholder="Clave" onChange={e => setPassword(e.target.value)} />
            <button className="w-full bg-purple-600 p-4 rounded-2xl font-black">{isRegistering ? "REGISTRAR" : "ENTRAR"}</button>
          </form>
          <button onClick={() => setIsRegistering(!isRegistering)} className="w-full mt-4 text-zinc-500 text-sm">
            {isRegistering ? "Ya tengo cuenta" : "Crear cuenta de pasajero"}
          </button>
        </div>
      </div>
    );
  }

  // VISTA DE ADMINISTRADOR
  if (isAdminView) {
    return (
      <div className="min-h-screen bg-zinc-950 text-white p-6">
        <button onClick={() => setIsAdminView(false)} className="mb-6 flex items-center gap-2 text-zinc-400"><ArrowLeft size={20}/> Volver al Mapa</button>
        <h2 className="text-2xl font-black mb-6">Panel de Control</h2>
        <div className="space-y-4">
          {allUsers.map(u => (
            <div key={u.id} className="p-4 bg-zinc-900 rounded-2xl flex justify-between items-center border border-zinc-800">
              <div>
                <p className="font-bold">{u.nombre}</p>
                <p className="text-xs text-purple-500 uppercase">{u.rol}</p>
              </div>
              <button onClick={() => deleteUser(u.id)} className="text-red-500 p-2 hover:bg-red-500/10 rounded-xl transition"><Trash2 size={20}/></button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col overflow-hidden">
      <nav className="p-4 border-b border-zinc-900 flex justify-between items-center z-[2000]">
        <div>
          <h2 className="font-black italic text-xl">TaxiInsta</h2>
          <span className="text-[10px] bg-purple-600 px-2 py-0.5 rounded-full">{profile?.rol}</span>
        </div>
        <div className="flex gap-2">
          {profile?.rol === 'admin' && (
            <button onClick={() => {setIsAdminView(true); loadAllUsers();}} className="p-2.5 bg-zinc-800 rounded-full text-blue-400"><Shield size={20}/></button>
          )}
          <button onClick={() => supabase.auth.signOut()} className="p-2.5 bg-red-500/10 text-red-500 rounded-full"><LogOut size={20}/></button>
        </div>
      </nav>

      <main className="flex-1 relative">
        <div className="absolute inset-0 z-0">
          <MapContainer center={myLocation} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <MapResizer />
            <ChangeView center={myLocation} />
            <Marker position={myLocation} icon={profile?.rol === 'conductor' ? taxiIcon : passengerIcon} />
          </MapContainer>
        </div>

        {/* INPUT DE DESTINO PARA PASAJERO */}
        {profile?.rol === 'pasajero' && (
          <div className="absolute top-6 left-0 right-0 px-6 z-[1000]">
            <div className="bg-zinc-900/90 backdrop-blur-md p-2 rounded-[25px] border border-zinc-800 shadow-2xl flex items-center">
              <div className="p-3 bg-purple-600 rounded-2xl mr-3"><Search size={20}/></div>
              <input 
                className="bg-transparent flex-1 outline-none text-white text-sm" 
                placeholder="¿A dónde vamos?"
                onChange={(e) => setDestino(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* BOTÓN SOLICITAR */}
        {profile?.rol === 'pasajero' && (
          <div className="absolute bottom-10 left-0 right-0 px-10 z-[1000]">
            <button onClick={solicitarViaje} className="w-full bg-white text-black py-5 rounded-[25px] font-black shadow-2xl border-4 border-purple-500 active:scale-95 transition">
              SOLICITAR TAXI INSTA
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;