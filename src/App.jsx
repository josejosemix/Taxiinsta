import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { User, Car, Navigation, Moon, Sun, LogOut } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const taxiIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png',
    iconSize: [35, 35],
    iconAnchor: [17, 17],
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

  // LÓGICA DEL CONDUCTOR: Enviar GPS a la Base de Datos
  useEffect(() => {
    if (isLoggedIn && userRole === 'conductor') {
      const watchId = navigator.geolocation.watchPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setMyLocation([latitude, longitude]);
          
          await supabase
            .from('perfiles')
            .upsert({ 
              id: 'ID_DE_PRUEBA_1', // Temporalmente manual hasta tener Auth
              nombre: userName,
              rol: 'conductor',
              latitud: latitude,
              longitud: longitude,
              en_servicio: true,
              updated_at: new Date()
            });
        },
        (err) => console.error(err),
        { enableHighAccuracy: true }
      );
      return () => navigator.geolocation.clearWatch(watchId);
    }
  }, [isLoggedIn, userRole]);

  // LÓGICA DEL PASAJERO: Ver conductores en tiempo real
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
        .channel('cambios-perfiles')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'perfiles' }, fetchDrivers)
        .subscribe();

      return () => supabase.removeChannel(subscription);
    }
  }, [isLoggedIn, userRole]);

  if (!isLoggedIn) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 ${darkMode ? 'bg-zinc-950' : 'bg-gray-50'}`}>
        <div className={`w-full max-w-md p-8 rounded-[40px] shadow-2xl ${darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-gray-800'}`}>
          <h1 className="text-4xl font-black italic mb-8 text-center bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
          <input 
            className={`w-full p-4 rounded-2xl mb-4 outline-none border ${darkMode ? 'bg-zinc-800 border-zinc-700' : 'bg-gray-100 border-transparent'}`}
            placeholder="Tu nombre..."
            onChange={(e) => setUserName(e.target.value)}
          />
          <div className="grid grid-cols-2 gap-4">
            <button onClick={() => {setUserRole('pasajero'); setIsLoggedIn(true)}} className="bg-purple-600 p-4 rounded-2xl font-bold flex flex-col items-center gap-2 text-white shadow-lg active:scale-95 transition">
              <User size={24}/> Pasajero
            </button>
            <button onClick={() => {setUserRole('conductor'); setIsLoggedIn(true)}} className="bg-zinc-800 p-4 rounded-2xl font-bold flex flex-col items-center gap-2 text-white border border-zinc-700 active:scale-95 transition">
              <Car size={24}/> Conductor
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${darkMode ? 'dark bg-zinc-950 text-white' : 'bg-gray-50 text-gray-800'} min-h-screen flex flex-col w-full`}>
      <nav className="p-4 flex justify-between items-center border-b dark:border-zinc-800 sticky top-0 z-[2000] bg-inherit">
        <h2 className="text-xl font-black italic">TaxiInsta <span className="text-xs opacity-50 font-normal">| {userRole === 'conductor' ? 'Modo Driver' : 'Modo Cliente'}</span></h2>
        <div className="flex gap-3">
          <button onClick={() => setDarkMode(!darkMode)} className="p-2 bg-zinc-800 rounded-full text-yellow-400"><Sun size={18}/></button>
          <button onClick={() => setIsLoggedIn(false)} className="p-2 bg-red-500/10 text-red-500 rounded-full"><LogOut size={18}/></button>
        </div>
      </nav>

      <main className="flex-1 relative flex flex-col">
        <div className="flex-1 h-full w-full">
          <MapContainer center={myLocation} zoom={15} className="h-full w-full">
            <TileLayer url={darkMode ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
            <ChangeView center={myLocation} />
            
            {userRole === 'conductor' && <Marker position={myLocation} icon={taxiIcon} />}

            {userRole === 'pasajero' && onlineDrivers.map(d => (
              <Marker key={d.id} position={[d.latitud, d.longitud]} icon={taxiIcon}>
                <Popup>Conductor: {d.nombre}</Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {userRole === 'conductor' && (
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] bg-green-500 text-white px-8 py-4 rounded-full font-black shadow-2xl animate-pulse">
            TRANSMITIENDO UBICACIÓN GPS
          </div>
        )}
      </main>
    </div>
  );
}

export default App;