import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, Polyline } from 'react-leaflet';
import { Search, Home, Bell, User, Star, Navigation, Heart, Car, MapPin, X, CheckCircle, Send, MessageCircle } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Configuración de iconos de Leaflet
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
  map.setView(center, 15);
  return null;
}

function App() {
  const [mapCenter, setMapCenter] = useState(centerPosition);
  const [destination, setDestination] = useState(null);
  const [address, setAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [appStatus, setAppStatus] = useState("searching"); 
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [message, setMessage] = useState("");
  
  const [drivers, setDrivers] = useState([
    { id: 1, pos: [10.485, -66.905], name: "Carlos R.", car: "Toyota Corolla" },
    { id: 2, pos: [10.475, -66.910], name: "Maria V.", car: "Hyundai Accent" },
    { id: 3, pos: [10.482, -66.895], name: "Jose P.", car: "Kia Rio" },
  ]);

  const handleSearch = async (e) => {
    if (e.key === 'Enter' && address.length > 3) {
      setLoading(true);
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${address}`);
        const data = await response.json();
        if (data.length > 0) {
          const { lat, lon } = data[0];
          const newPos = [parseFloat(lat), parseFloat(lon)];
          setMapCenter(newPos);
          setDestination(newPos);
        }
      } catch (error) { console.error(error); }
      setLoading(false);
    }
  };

  const requestTaxi = (driver) => {
    setAppStatus("requesting");
    setSelectedDriver(driver);
    setTimeout(() => {
      setAppStatus("on_trip");
    }, 2500);
  };

  const cancelTrip = () => {
    setAppStatus("searching");
    setSelectedDriver(null);
    setShowChat(false);
  };

  useEffect(() => {
    if (appStatus !== "on_trip") {
      const interval = setInterval(() => {
        setDrivers(prev => prev.map(d => ({
          ...d,
          pos: [d.pos[0] + (Math.random() - 0.5) * 0.0005, d.pos[1] + (Math.random() - 0.5) * 0.0005]
        })));
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [appStatus]);

  function MapEvents() {
    useMapEvents({
      click(e) {
        if (appStatus === "searching") {
          setDestination([e.latlng.lat, e.latlng.lng]);
          setAddress(`${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}`);
        }
      },
    });
    return destination ? <Marker position={destination} /> : null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col w-full font-sans overflow-hidden">
      <nav className="w-full bg-white border-b border-gray-200 px-4 py-3 flex justify-between items-center sticky top-0 z-[2000] shadow-sm">
        <div className="max-w-6xl w-full mx-auto flex justify-between items-center">
          <h1 className="text-2xl font-black italic bg-gradient-to-r from-purple-600 to-pink-500 bg-clip-text text-transparent">TaxiInsta</h1>
          <div className="flex gap-4 items-center">
            <Bell className="w-6 h-6 text-gray-400" />
            <div className="w-8 h-8 bg-gradient-to-tr from-yellow-400 to-red-500 rounded-full"></div>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-6xl w-full mx-auto p-0 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 relative">
        
        <div className="lg:col-span-2 relative">
          <div className="bg-white w-full h-[500px] lg:h-[700px] rounded-none md:rounded-[40px] shadow-2xl overflow-hidden border-4 border-white z-0 relative">
            <MapContainer center={mapCenter} zoom={14} className="h-full w-full">
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <ChangeView center={mapCenter} />
              <MapEvents />
              {drivers.map(driver => (
                <Marker key={driver.id} position={driver.pos} icon={taxiIcon} />
              ))}
              {appStatus === "on_trip" && selectedDriver && destination && (
                <Polyline positions={[selectedDriver.pos, destination]} color="#a855f7" weight={5} opacity={0.6} dashArray="10, 15" />
              )}
            </MapContainer>

            {appStatus === "searching" && (
              <div className="absolute top-6 left-6 right-6 md:w-80 z-[1000]">
                <div className="bg-white/95 backdrop-blur-md p-5 rounded-[25px] shadow-2xl border border-white">
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-3 text-blue-500 font-bold text-xs uppercase">Ubicación de origen</div>
                  <div className="flex items-center gap-3 border-b border-gray-100 pb-3 mb-3">
                    <MapPin className="text-blue-500 w-4 h-4" />
                    <input className="text-sm w-full outline-none font-semibold text-gray-700 bg-transparent" placeholder="Mi ubicación" readOnly />
                  </div>
                  <div className="flex items-center gap-3">
                    <Navigation className="text-red-500 w-4 h-4" />
                    <input 
                      className="text-sm w-full outline-none font-semibold text-gray-800 bg-transparent" 
                      placeholder="¿A dónde vas? (Enter)" 
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

        <div className="lg:col-span-1 px-4">
          {appStatus === "searching" && (
            <div>
              <h3 className="font-black text-xl mb-4 text-gray-800">Cerca de ti</h3>
              <div className="flex flex-col gap-4">
                {drivers.map((d) => (
                  <div key={d.id} className="bg-white border border-gray-100 rounded-[25px] p-4 shadow-sm hover:scale-[1.02] transition-transform">
                    <div className="flex items-center gap-4 mb-3">
                      <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center border border-purple-100"><User className="text-purple-500" /></div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-800">{d.name}</p>
                        <p className="text-xs text-gray-400 font-medium tracking-tight">⭐ 4.9 • {d.car}</p>
                      </div>
                      <p className="font-black text-green-600 text-lg">${10 + d.id}.00</p>
                    </div>
                    <button onClick={() => requestTaxi(d)} className="w-full bg-black text-white py-3 rounded-2xl font-bold text-sm hover:bg-purple-600 transition shadow-lg active:scale-95">Solicitar Ahora</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {appStatus === "requesting" && (
            <div className="bg-white p-10 rounded-[40px] shadow-xl text-center border-2 border-purple-400 animate-pulse">
              <div className="w-24 h-24 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <Car className="w-12 h-12 text-purple-500" />
              </div>
              <h2 className="text-2xl font-black mb-2 text-gray-800">Buscando...</h2>
              <p className="text-gray-400 text-sm px-4">Estamos notificando a {selectedDriver?.name} sobre tu solicitud.</p>
            </div>
          )}

          {appStatus === "on_trip" && (
            <div className="flex flex-col gap-4">
              <div className="bg-white p-6 rounded-[35px] shadow-2xl border-b-8 border-purple-500">
                <div className="flex items-center justify-between mb-4">
                  <span className="bg-purple-100 text-purple-600 px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase">Viaje Activo</span>
                  <p className="font-black text-xl text-gray-800">${10 + selectedDriver?.id}.00</p>
                </div>
                <div className="flex items-center gap-4 mb-6">
                  <div className="relative">
                    <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center border-2 border-purple-500"><User size={30} className="text-purple-500"/></div>
                    <div className="absolute -bottom-1 -right-1 bg-green-500 w-4 h-4 rounded-full border-2 border-white"></div>
                  </div>
                  <div className="flex-1">
                    <p className="font-black text-lg text-gray-800">{selectedDriver?.name}</p>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{selectedDriver?.car}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setShowChat(!showChat)} className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 py-3 rounded-2xl font-bold text-sm hover:bg-gray-200 transition">
                    <MessageCircle size={18} /> Chat
                  </button>
                  <button onClick={cancelTrip} className="bg-red-50 text-red-500 py-3 rounded-2xl font-bold text-sm hover:bg-red-100 transition">Cancelar</button>
                </div>
              </div>

              {/* MINI CHAT TIPO INSTAGRAM */}
              {showChat && (
                <div className="bg-white rounded-[30px] shadow-2xl border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-10">
                  <div className="p-4 bg-gray-50 border-b flex justify-between items-center">
                    <span className="font-bold text-sm">Chat con {selectedDriver?.name}</span>
                    <button onClick={() => setShowChat(false)}><X size={16} /></button>
                  </div>
                  <div className="h-40 p-4 overflow-y-auto flex flex-col gap-2">
                    <div className="bg-gray-100 p-3 rounded-2xl rounded-tl-none text-xs font-medium w-4/5">Hola, voy en camino. Llego en 5 minutos. 🚗</div>
                    {message && <div className="bg-purple-500 text-white p-3 rounded-2xl rounded-tr-none text-xs font-medium self-end w-4/5">{message}</div>}
                  </div>
                  <div className="p-3 border-t flex gap-2">
                    <input 
                      className="flex-1 bg-gray-100 rounded-xl px-4 py-2 text-xs outline-none" 
                      placeholder="Escribe un mensaje..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                    />
                    <button className="bg-purple-500 text-white p-2 rounded-xl"><Send size={16}/></button>
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

export default App;