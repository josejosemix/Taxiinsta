import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import { Search, Home, Bell, User, Star, Navigation, Heart, Car, MapPin, X, CheckCircle, Send, MessageCircle, Moon, Sun } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix de iconos para producción
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

const taxiIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448339.png',
    iconSize: [35, 35],
    iconAnchor: [17, 17],
});

const centerPosition = [10.4806, -66.9036]; 

function ChangeView({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center]);
  return null;
}

function App() {
  const [darkMode, setDarkMode] = useState(true);
  const [mapCenter, setMapCenter] = useState(centerPosition);
  const [destination, setDestination] = useState(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [appStatus, setAppStatus] = useState("searching"); 
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [message, setMessage] = useState("");
  const [chatLog, setChatLog] = useState([{ sender: 'driver', text: 'Hola! Estoy en camino.' }]);

  const [drivers, setDrivers] = useState([
    { id: 1, pos: [10.485, -66.905], name: "Carlos R.", car: "Toyota Corolla", rating: 4.9 },
    { id: 2, pos: [10.475, -66.910], name: "Maria V.", car: "Hyundai Accent", rating: 4.8 },
  ]);

  const handleSearch = async (e) => {
    if (e.key === 'Enter' && address.length > 3) {
      setLoading(true);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${address}`);
        const data = await response.json();
        if (data.length > 0) {
          const { lat, lon } = data[0];
          setMapCenter([parseFloat(lat), parseFloat(lon)]);
          setDestination([parseFloat(lat), parseFloat(lon)]);
        }
      } catch (error) { console.error(error); }
      setLoading(false);
    }
  };

  const sendMessage = () => {
    if (message.trim()) {
      setChatLog([...chatLog, { sender: 'me', text: message }]);
      setMessage("");
    }
  };

  return (
    <div className={`${darkMode ? 'dark bg-zinc-950' : 'bg-gray-50'} min-h-screen flex flex-col w-full font-sans transition-colors duration-500`}>
      
      {/* NAVBAR */}
      <nav className={`${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-200'} w-full border-b px-4 py-3 flex justify-between items-center sticky top-0 z-[2000]`}>
        <div className="max-w-6xl w-full mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-black italic bg-gradient-to-r from-purple-500 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
          <div className="flex gap-4 items-center">
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-zinc-800 transition">
              {darkMode ? <Sun className="text-yellow-400" /> : <Moon className="text-gray-600" />}
            </button>
            <div className="w-8 h-8 bg-gradient-to-tr from-yellow-400 to-red-500 rounded-full"></div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-6xl w-full mx-auto p-0 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
        
        {/* MAPA */}
        <div className="lg:col-span-2 relative h-[50vh] md:h-[700px]">
          <div className="w-full h-full md:rounded-[40px] overflow-hidden border-4 border-transparent dark:border-zinc-800 shadow-2xl">
            <MapContainer center={mapCenter} zoom={14} className="h-full w-full">
              <TileLayer url={darkMode ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"} />
              <ChangeView center={mapCenter} />
              <MapEvents setDestination={setDestination} setAddress={setAddress} active={appStatus === "searching"} />
              {drivers.map(d => <Marker key={d.id} position={d.pos} icon={taxiIcon} />)}
              {destination && <Marker position={destination} />}
              {appStatus === "on_trip" && selectedDriver && destination && (
                <Polyline positions={[selectedDriver.pos, destination]} color="#a855f7" weight={4} dashArray="5, 10" />
              )}
            </MapContainer>

            {appStatus === "searching" && (
              <div className="absolute top-4 left-4 right-4 md:w-80 z-[1000]">
                <div className={`${darkMode ? 'bg-zinc-900/90 text-white border-zinc-700' : 'bg-white/95 border-gray-100'} backdrop-blur-md p-4 rounded-3xl shadow-2xl border`}>
                  <div className="flex items-center gap-3 border-b border-gray-700/20 pb-2 mb-2">
                    <MapPin className="text-blue-500 w-4 h-4" />
                    <input className="text-sm w-full bg-transparent outline-none" placeholder="Origen" readOnly defaultValue="Mi ubicación" />
                  </div>
                  <div className="flex items-center gap-3">
                    <Navigation className="text-pink-500 w-4 h-4" />
                    <input 
                      className="text-sm w-full bg-transparent outline-none" 
                      placeholder="¿A dónde vamos?" 
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      onKeyDown={handleSearch}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* PANEL DE CONTROL */}
        <div className="lg:col-span-1 px-4 py-4">
          {appStatus === "searching" && (
            <div className="space-y-4">
              <h3 className={`font-black text-xl ${darkMode ? 'text-white' : 'text-gray-800'}`}>Conductores Activos</h3>
              {drivers.map(d => (
                <div key={d.id} className={`${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-100'} p-4 rounded-[25px] border shadow-sm`}>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-purple-500/10 rounded-full flex items-center justify-center text-purple-500"><User /></div>
                    <div className="flex-1">
                      <p className={`font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>{d.name}</p>
                      <p className="text-xs text-gray-500">{d.car} • ⭐{d.rating}</p>
                    </div>
                    <p className="font-black text-green-500">$12.00</p>
                  </div>
                  <button onClick={() => { setSelectedDriver(d); setAppStatus("requesting"); setTimeout(()=>setAppStatus("on_trip"), 2000); }} className="w-full mt-4 bg-purple-600 text-white py-3 rounded-2xl font-bold text-sm active:scale-95 transition">Solicitar</button>
                </div>
              ))}
            </div>
          )}

          {appStatus === "on_trip" && (
            <div className="space-y-4">
              <div className={`${darkMode ? 'bg-zinc-900 text-white' : 'bg-white text-gray-800'} p-6 rounded-[35px] shadow-2xl border-t-4 border-purple-500`}>
                <div className="flex items-center justify-between mb-4 text-xs font-black uppercase tracking-widest text-purple-500"><span>En Camino</span><span>$12.00</span></div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 bg-zinc-800 rounded-2xl flex items-center justify-center border border-zinc-700 text-purple-400"><User size={30}/></div>
                  <div><p className="font-black text-lg">{selectedDriver?.name}</p><p className="text-xs text-gray-500 uppercase">{selectedDriver?.car}</p></div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowChat(!showChat)} className="flex-1 bg-zinc-800 text-white py-3 rounded-2xl font-bold text-xs flex items-center justify-center gap-2"><MessageCircle size={16}/> CHAT</button>
                  <button onClick={() => setAppStatus("searching")} className="flex-1 bg-red-500/10 text-red-500 py-3 rounded-2xl font-bold text-xs">CANCELAR</button>
                </div>
              </div>

              {showChat && (
                <div className={`${darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-gray-100'} rounded-[30px] border shadow-2xl flex flex-col h-[300px]`}>
                  <div className="p-4 border-b border-zinc-800 flex justify-between items-center text-white"><span className="font-bold text-sm">Mensajes</span><X onClick={()=>setShowChat(false)} className="cursor-pointer"/></div>
                  <div className="flex-1 p-4 overflow-y-auto space-y-2">
                    {chatLog.map((m, i) => (
                      <div key={i} className={`${m.sender === 'me' ? 'bg-purple-600 self-end ml-auto rounded-tr-none' : 'bg-zinc-800 self-start rounded-tl-none'} p-3 rounded-2xl text-white text-xs max-w-[80%]`}>{m.text}</div>
                    ))}
                  </div>
                  <div className="p-3 border-t border-zinc-800 flex gap-2">
                    <input value={message} onChange={e=>setMessage(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendMessage()} className="flex-1 bg-zinc-800 rounded-xl px-4 py-2 text-xs text-white outline-none" placeholder="Escribe..." />
                    <button onClick={sendMessage} className="bg-purple-600 text-white p-2 rounded-xl"><Send size={16}/></button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function MapEvents({ setDestination, setAddress, active }) {
  useMapEvents({
    click(e) {
      if (active) {
        setDestination([e.latlng.lat, e.latlng.lng]);
        setAddress(`${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
      }
    },
  });
  return null;
}

export default App;