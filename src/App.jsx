import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { User, Car, Navigation, Moon, Sun, LogOut, MessageCircle, ShieldCheck } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Icono para el Pasajero (Punto azul)
const passengerIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png',
    iconSize: [30, 30],
});

// Icono para el Taxi
const taxiIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png',
    iconSize: [35, 35],
});

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, map.getZoom()); }, [center]);
  return null;
}

function App() {
  const [userRole, setUserRole] = useState(null); 
  const [userName, setUserName] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [myLocation, setMyLocation] = useState([10.4806, -66.9036]);
  const [onlineDrivers, setOnlineDrivers] = useState([]);
  const [showChat, setShowChat] = useState(false);

  // OBTENER UBICACIÓN EN TIEMPO REAL (Para ambos roles)
  useEffect(() => {
    if (isLoggedIn) {
      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setMyLocation([latitude, longitude]);
          
          // Solo si es conductor, enviamos la ubicación a la DB
          if (userRole === 'conductor') {
            await supabase
              .from('perfiles')
              .upsert({ 
                id: 'ID_CONDUCTOR_UNICO', // Aquí irá el ID real de Supabase Auth
                nombre: userName,
                rol: 'conductor',
                latitud: latitude,
                longitud: longitude,
                en_servicio: true,
                updated_at: new Date()
              });
          }
        },
        (err) => console.error("Error de GPS:", err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [isLoggedIn, userRole]);

  // EL PASAJERO ESCUCHA A LOS CONDUCTORES
  useEffect(() => {
    if (isLoggedIn && userRole === 'pasajero') {
      const fetchDrivers = async () => {
        const { data } = await supabase
          .from('perfiles')
          .select('*')
          .eq('rol', 'conductor')
          .eq('en_servicio', true);
        setOnlineDrivers(data || []);
      };
      fetchDrivers();

      const subscription = supabase
        .channel('mapa-taxis')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, fetchDrivers)
        .subscribe();

      return () => supabase.removeChannel(subscription);
    }
  }, [isLoggedIn, userRole]);

  if (!isLoggedIn) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${darkMode ? 'bg-zinc-950' : 'bg-gray-50'}`}>
        <div className={`w-full max-w-md p-8 rounded-[40px] shadow-2xl ${darkMode ? 'bg-zinc-900 text-white border border-zinc-800' : 'bg-white text-gray-800 border border-gray-100'}`}>
          <div className="flex justify-center mb-6">
             <div className="p-4 bg-purple-600 rounded-3xl text-white shadow-xl shadow-purple-500/20"><Car size={40}/></div>
          </div>
          <h1 className="text-4xl font-black italic mb-2 text-center bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
          <p className="text-center text-sm opacity-60 mb-8 font-medium italic">Style. Speed. Safety.</p>
          
          <input 
            className={`w-full p-4 rounded-2xl mb-4 outline-none border transition-all ${darkMode ? 'bg-zinc-800 border-zinc-700 focus:border-purple-500' : 'bg-gray-100 border-transparent focus:border-purple-500'}`}
            placeholder="Introduce tu nombre..."
            onChange={(e) => setUserName(e.target.value)}
          />

          <div className="space-y-3">
            <button onClick={() => {setUserRole('pasajero'); setIsLoggedIn(true)}} className="w-full bg-purple-600 p-4 rounded-2xl font-bold flex items-center justify-center gap-3 text-white shadow-lg active:scale-95 transition">
              <User size={20}/> ENTRAR COMO PASAJERO
            </button>
            <div className="relative py-2">
               <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-zinc-700"></span></div>
               <div className="relative flex justify-center text-xs uppercase"><span className="bg-zinc-900 px-2 text-zinc-500">Acceso Staff</span></div>
            </div>
            <button onClick={() => {setUserRole('conductor'); setIsLoggedIn(true)}} className="w-full bg-zinc-800 p-4 rounded-2xl font-bold flex items-center justify-center gap-3 text-white border border-zinc-700 active:scale-95 transition">
              <ShieldCheck size={20} className="text-green-500"/> ACCESO CONDUCTORES
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-gray-50 text-gray-800'} min-h-screen flex flex-col w-full overflow-hidden`}>
      {/* HEADER TIPO INSTAGRAM */}
      <nav className="p-4 flex justify-between items-center border-b dark:border-zinc-900 sticky top-0 z-[2000] bg-inherit backdrop-blur-md">
        <h2 className="text-xl font-black italic tracking-tighter">TaxiInsta</h2>
        <div className="flex gap-2">
          <button onClick={() => setDarkMode(!darkMode)} className="p-2.5 bg-zinc-800/50 rounded-full text-yellow-400"><Sun size={18}/></button>
          <button onClick={() => setIsLoggedIn(false)} className="p-2.5 bg-red-500/10 text-red-500 rounded-full"><LogOut size={18}/></button>
        </div>
      </nav>

      <main className="flex-1 relative flex flex-col h-[calc(100vh-73px)]">
        <div className="absolute inset-0 w-full h-full">
          <MapContainer center={myLocation} zoom={15} style={{ height: '100%', width: '100%' }}>
            <TileLayer url={darkMode ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
            <ChangeView center={myLocation} />
            
            {/* Mi marcador (Pasajero o Conductor) */}
            <Marker position={myLocation} icon={userRole === 'pasajero' ? passengerIcon : taxiIcon}>
               <Popup>Tú estás aquí</Popup>
            </Marker>

            {/* Marcadores de otros conductores para el pasajero */}
            {userRole === 'pasajero' && onlineDrivers.map(d => (
              <Marker key={d.id} position={[d.latitud, d.longitud]} icon={taxiIcon}>
                <Popup>
                  <div className="p-2">
                    <p className="font-bold">{d.nombre}</p>
                    <button className="bg-purple-600 text-white text-xs px-2 py-1 rounded mt-1">Pedir Viaje</button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* BOTONES FLOTANTES SEGÚN ROL */}
        <div className="absolute bottom-8 left-0 right-0 px-6 flex flex-col items-center gap-4 z-[1000]">
          {userRole === 'conductor' ? (
            <div className="bg-green-500 text-white px-6 py-3 rounded-full font-black shadow-2xl animate-pulse flex items-center gap-2">
              <div className="w-2 h-2 bg-white rounded-full"></div> EN LÍNEA - ESPERANDO VIAJES
            </div>
          ) : (
            <button className="bg-white text-black px-8 py-4 rounded-2xl font-black shadow-2xl flex items-center gap-3 active:scale-95 transition border-2 border-purple-500">
               <Navigation size={20} className="text-purple-600"/> ¿A DÓNDE VAMOS HOY?
            </button>
          )}
          
          {/* Botón de Chat siempre visible en el mapa */}
          <button onClick={() => setShowChat(!showChat)} className="bg-zinc-900 text-white p-4 rounded-full shadow-2xl border border-zinc-700 self-end">
            <MessageCircle size={24}/>
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;