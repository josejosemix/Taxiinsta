import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { User, Car, Navigation, Moon, Sun, LogOut, MessageCircle, Mail, Lock } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const passengerIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30] });
const taxiIcon = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png', iconSize: [35, 35] });

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, map.getZoom()); }, [center]);
  return null;
}

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [darkMode, setDarkMode] = useState(true);
  const [myLocation, setMyLocation] = useState([10.4806, -66.9036]);
  const [onlineDrivers, setOnlineDrivers] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setProfile(null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId) => {
    const { data, error } = await supabase.from('perfiles').select('*').eq('id', userId).single();
    if (error) console.error("Error cargando perfil:", error);
    if (data) setProfile(data);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Error Login: " + error.message);
    setLoading(false);
  };

  const handleSignUp = async () => {
    if (!email || !password) return alert("Rellena los campos");
    setLoading(true);
    // Forzamos el registro con Email
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: { data: { nombre: email.split('@')[0] } }
    });

    if (error) {
      alert("Error en registro: " + error.message);
    } else if (data.user) {
      // Intentar crear el perfil manual si el Trigger no existe
      await supabase.from('perfiles').upsert({ 
        id: data.user.id, 
        rol: 'pasajero', 
        nombre: email.split('@')[0] 
      });
      alert("¡Registro completo! Ya puedes iniciar sesión.");
    }
    setLoading(false);
  };

  // ... (Resto de la lógica de GPS igual)

  if (!session) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${darkMode ? 'bg-zinc-950' : 'bg-gray-50'}`}>
        <div className="w-full max-w-md p-8 rounded-[40px] shadow-2xl bg-zinc-900 border border-zinc-800 text-white">
          <h1 className="text-4xl font-black italic mb-8 text-center bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
          <div className="space-y-4">
            <div className="relative">
                <Mail className="absolute left-4 top-4 text-zinc-500" size={20}/>
                <input className="w-full p-4 pl-12 rounded-2xl bg-zinc-800 border-zinc-700 outline-none focus:border-purple-500 border text-white" placeholder="Email" onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="relative">
                <Lock className="absolute left-4 top-4 text-zinc-500" size={20}/>
                <input type="password" className="w-full p-4 pl-12 rounded-2xl bg-zinc-800 border-zinc-700 outline-none focus:border-purple-500 border text-white" placeholder="Contraseña" onChange={e => setPassword(e.target.value)} />
            </div>
            <button onClick={handleLogin} disabled={loading} className="w-full bg-purple-600 p-4 rounded-2xl font-bold hover:bg-purple-700 transition">
                {loading ? "Cargando..." : "INICIAR SESIÓN"}
            </button>
            <button onClick={handleSignUp} disabled={loading} className="w-full text-zinc-400 text-sm py-2 hover:text-white transition">
               ¿Nuevo aquí? Regístrate como Pasajero
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-gray-50 text-gray-800'} min-h-screen flex flex-col w-full`}>
      <nav className="p-4 flex justify-between items-center border-b dark:border-zinc-900 bg-inherit">
        <div className="flex flex-col">
          <h2 className="text-xl font-black italic">TaxiInsta</h2>
          <div className="flex items-center gap-2">
             <span className="text-[10px] px-2 py-0.5 bg-purple-600 rounded-full text-white font-bold uppercase">
               {profile?.rol || 'Cargando...'}
             </span>
             <span className="text-xs opacity-70">{profile?.nombre}</span>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} className="p-2.5 bg-red-500/10 text-red-500 rounded-full"><LogOut size={18}/></button>
      </nav>

      {/* Mapa y controles igual que antes... */}
      <main className="flex-1 relative h-[calc(100vh-80px)]">
         <MapContainer center={myLocation} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer url={darkMode ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
            <ChangeView center={myLocation} />
            <Marker position={myLocation} icon={profile?.rol === 'pasajero' ? passengerIcon : taxiIcon} />
         </MapContainer>
         
         {profile?.rol === 'pasajero' && (
            <div className="absolute bottom-10 left-0 right-0 px-6 z-[1000] flex justify-center">
               <button className="bg-white text-black px-10 py-4 rounded-full font-black shadow-2xl border-4 border-purple-500">
                  ¿A DÓNDE VAMOS?
               </button>
            </div>
         )}
      </main>
    </div>
  );
}

export default App;  // Cambio final