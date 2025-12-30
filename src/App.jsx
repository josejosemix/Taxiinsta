import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { Car, Navigation, Sun, LogOut, MessageCircle, Mail, Lock, UserPlus, ArrowLeft } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const passengerIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30] });
const taxiIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png', iconSize: [35, 35] });

// Componente para arreglar el mapa negro al cargar
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    setTimeout(() => { map.invalidateSize(); }, 500);
  }, [map]);
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
  const [isRegistering, setIsRegistering] = useState(false); // Estado para cambiar el formulario
  const [loading, setLoading] = useState(false);
  const [myLocation, setMyLocation] = useState([10.4806, -66.9036]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) getProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) getProfile(session.user.id);
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function getProfile(id) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', id).single();
    if (data) setProfile(data);
  }

  const handleAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) return alert("Completa los campos");
    setLoading(true);
    
    if (!isRegistering) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) alert("Error: " + error.message);
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) alert("Error: " + error.message);
      else if (data.user) {
        await supabase.from('perfiles').insert([{ id: data.user.id, rol: 'pasajero', nombre: email.split('@')[0] }]);
        alert("¡Registro exitoso! Ya puedes entrar.");
        setIsRegistering(false);
      }
    }
    setLoading(false);
  };

  const handleRequestRide = () => {
    alert("Buscando taxis cercanos... (Enviando alerta a conductores)");
    // Aquí conectaremos la alerta real en el siguiente paso
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-zinc-900 p-10 rounded-[40px] border border-zinc-800 shadow-2xl transition-all">
          <div className="flex justify-center mb-6">
             <div className="p-4 bg-purple-600 rounded-3xl text-white"><Car size={40}/></div>
          </div>
          
          <h1 className="text-4xl font-black italic mb-2 text-center bg-gradient-to-r from-purple-400 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
          <p className="text-center text-zinc-500 text-sm mb-8 italic">
            {isRegistering ? "Crea tu cuenta de pasajero" : "Bienvenido de nuevo"}
          </p>

          <form onSubmit={handleAuth} className="space-y-4">
            <div className="relative">
              <Mail className="absolute left-4 top-4 text-zinc-500" size={20}/>
              <input className="w-full p-4 pl-12 rounded-2xl bg-zinc-800 border-zinc-700 border outline-none text-white focus:border-purple-500 transition" placeholder="Correo" type="email" onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-4 text-zinc-500" size={20}/>
              <input className="w-full p-4 pl-12 rounded-2xl bg-zinc-800 border-zinc-700 border outline-none text-white focus:border-purple-500 transition" placeholder="Contraseña" type="password" onChange={e => setPassword(e.target.value)} />
            </div>
            
            <button type="submit" className="w-full bg-purple-600 hover:bg-purple-500 p-4 rounded-2xl font-black shadow-lg shadow-purple-500/20 transition active:scale-95 flex justify-center items-center gap-2">
                {loading ? "..." : isRegistering ? <><UserPlus size={20}/> REGISTRARME</> : "ENTRAR"}
            </button>
          </form>

          <button onClick={() => setIsRegistering(!isRegistering)} className="w-full mt-6 text-zinc-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-white transition">
            {isRegistering ? <><ArrowLeft size={16}/> Volver al login</> : "¿No tienes cuenta? Regístrate gratis"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col overflow-hidden">
      <nav className="p-4 border-b border-zinc-900 flex justify-between items-center bg-zinc-950/80 backdrop-blur-md z-[2000]">
        <div>
          <h2 className="font-black italic text-xl tracking-tighter text-white">TaxiInsta</h2>
          {profile && (
            <div className="flex gap-2 items-center mt-1">
              <span className="bg-purple-600 text-[9px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest">{profile.rol}</span>
              <span className="text-xs font-bold text-zinc-400 italic">@{profile.nombre}</span>
            </div>
          )}
        </div>
        <button onClick={() => supabase.auth.signOut()} className="p-2.5 bg-red-500/10 text-red-500 rounded-full border border-red-500/20 hover:bg-red-500/20 transition"><LogOut size={20}/></button>
      </nav>

      <main className="flex-1 relative">
        <div className="absolute inset-0 w-full h-full bg-zinc-900">
            <MapContainer center={myLocation} zoom={15} style={{ height: '100%', width: '100%' }}>
              <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
              <MapResizer />
              <ChangeView center={myLocation} />
              <Marker position={myLocation} icon={profile?.rol === 'conductor' ? taxiIcon : passengerIcon} />
            </MapContainer>
        </div>

        {profile?.rol === 'pasajero' && (
          <div className="absolute bottom-10 w-full px-6 flex flex-col items-center gap-4 z-[1000]">
            <button 
              onClick={handleRequestRide}
              className="w-full max-w-xs bg-white text-black px-10 py-5 rounded-[25px] font-black shadow-[0_20px_50px_rgba(168,85,247,0.4)] border-4 border-purple-500 active:scale-95 transition hover:bg-purple-50"
            >
              <div className="flex items-center justify-center gap-3">
                <Navigation size={24} className="text-purple-600 animate-pulse"/>
                <span>¿A DÓNDE VAMOS?</span>
              </div>
            </button>
            <button className="bg-zinc-900/90 p-4 rounded-full border border-zinc-700 shadow-xl self-end">
              <MessageCircle size={24}/>
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;