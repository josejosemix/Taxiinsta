import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { User, Car, Navigation, Moon, Sun, LogOut, MessageCircle, ShieldCheck, Lock, Mail } from 'lucide-react';
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
  const [showChat, setShowChat] = useState(false);

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
    const { data } = await supabase.from('perfiles').select('*').eq('id', userId).single();
    if (data) setProfile(data);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Error: " + error.message);
    setLoading(false);
  };

  const handleSignUp = async () => {
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      alert("Error al registrar: " + error.message);
    } else if (data.user) {
      const nombreUsuario = email.split('@')[0];
      await supabase.from('perfiles').upsert({ 
        id: data.user.id, 
        rol: 'pasajero', 
        nombre: nombreUsuario 
      });
      alert("¡Registro exitoso como pasajero!");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (session && profile) {
      const watchId = navigator.geolocation.watchPosition(async (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation([latitude, longitude]);
        
        if (profile.rol === 'conductor') {
          await supabase.from('perfiles').upsert({ 
            id: session.user.id, 
            nombre: profile.nombre,
            rol: 'conductor',
            latitud: latitude, 
            longitud: longitude, 
            en_servicio: true,
            updated_at: new Date()
          });
        }
      }, null, { enableHighAccuracy: true });
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [session, profile]);

  useEffect(() => {
    if (session && profile?.rol === 'pasajero') {
      const fetchDrivers = async () => {
        const { data } = await supabase.from('perfiles').select('*').eq('rol', 'conductor').eq('en_servicio', true);
        setOnlineDrivers(data || []);
      };
      fetchDrivers();
      const sub = supabase.channel('world').on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, fetchDrivers).subscribe();
      return () => supabase.removeChannel(sub);
    }
  }, [session, profile]);

  if (!session) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${darkMode ? 'bg-zinc-950' : 'bg-gray-50'}`}>
        <div className="w-full max-w-md p-8 rounded-[40px] shadow-2xl bg-zinc-900 border border-zinc-800 text-white">
          <h1 className="text-4xl font-black italic mb-8 text-center bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
          <div className="space-y-4">
            <div className="relative">
                <Mail className="absolute left-4 top-4 text-zinc-500" size={20}/>
                <input className="w-full p-4 pl-12 rounded-2xl bg-zinc-800 border-zinc-700 outline-none focus:border-purple-500 border" placeholder="Correo electrónico" onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="relative">
                <Lock className="absolute left-4 top-4 text-zinc-500" size={20}/>
                <input type="password" className="w-full p-4 pl-12 rounded-2xl bg-zinc-800 border-zinc-700 outline-none focus:border-purple-500 border" placeholder="Contraseña" onChange={e => setPassword(e.target.value)} />
            </div>
            <button onClick={handleLogin} disabled={loading} className="w-full bg-purple-600 p-4 rounded-2xl font-bold active:scale-95 transition">
                {loading ? "Cargando..." : "INICIAR SESIÓN"}
            </button>
            <button onClick={handleSignUp} disabled={loading} className="w-full text-zinc-400 text-sm font-bold hover:text-white transition">
               ¿Eres nuevo? Regístrate como Pasajero
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-gray-50 text-gray-800'} min-h-screen flex flex-col w-full overflow-hidden`}>
      <nav className="p-4 flex justify-between items-center border-b dark:border-zinc-900 sticky top-0 z-[2000] bg-inherit">
        <div className="flex flex-col">
          <h2 className="text-xl font-black italic tracking-tighter">TaxiInsta</h2>
          {profile && (
            <span className="text-[10px] uppercase font-bold text-purple-500">
              {profile.rol}: {profile.nombre}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 bg-zinc-800/50 rounded-full text-yellow-400"><Sun size={18}/></button>
          <button onClick={() => supabase.auth.signOut()} className="p-2.5 bg-red-500/10 text-red-500 rounded-full"><LogOut size={18}/></button>
        </div>
      </nav>

      <main className="flex-1 relative flex flex-col h-[calc(100vh-73px)]">
        <div className="absolute inset-0 w-full h-full">
          <MapContainer center={myLocation} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer url={darkMode ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
            <ChangeView center={myLocation} />
            <Marker position={myLocation} icon={profile?.rol === 'pasajero' ? passengerIcon : taxiIcon} />
            {profile?.rol === 'pasajero' && onlineDrivers.map(d => (
              <Marker key={d.id} position={[d.latitud, d.longitud]} icon={taxiIcon}>
                <Popup><p className="font-bold">Taxi: {d.nombre}</p></Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div className="absolute bottom-8 left-0 right-0 px-6 flex flex-col items-center gap-4 z-[1000]">
          {profile?.rol === 'pasajero' && (
            <button className="w-full max-w-xs bg-white text-black px-8 py-4 rounded-3xl font-black shadow-2xl flex items-center justify-center gap-3 border-4 border-purple-500 transition-all hover:scale-105">
               <Navigation size={20} className="text-purple-600"/> ¿A DÓNDE VAMOS HOY?
            </button>
          )}
          <button onClick={() => setShowChat(!showChat)} className="bg-zinc-900 text-white p-5 rounded-full shadow-2xl border border-zinc-700 self-end">
            <MessageCircle size={28}/>
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;