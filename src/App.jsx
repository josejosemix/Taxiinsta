import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Polyline } from 'react-leaflet';
import { LogOut, Shield, X, MapPin, Navigation, Search, CheckCircle } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Iconos
const iconPasajero = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30] });
const iconDestino = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/2776/2776067.png', iconSize: [30, 30] });
const iconTaxi = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', iconSize: [35, 35] });

function MapEvents({ setCoords, mode, active }) {
  useMapEvents({
    click(e) {
      if (active) setCoords([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

function MapView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 15); }, [center]);
  return null;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(user) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
    setProfile(data);
  }

  if (!session) return <AuthScreen />;
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MainMap profile={profile} />} />
        <Route path="/admin" element={<AdminPanel profile={profile} />} />
      </Routes>
    </Router>
  );
}

function MainMap({ profile }) {
  const [origen, setOrigen] = useState([9.2132, -66.0125]);
  const [destino, setDestino] = useState(null);
  const [destinoText, setDestinoText] = useState("");
  const [modoSeleccion, setModoSeleccion] = useState('origen'); // 'origen' o 'destino'
  const [viajeActivo, setViajeActivo] = useState(null);
  const [ofertaParaConductor, setOfertaParaConductor] = useState(null);
  const [taxiPos, setTaxiPos] = useState(null);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // Obtener ubicación actual al iniciar
  useEffect(() => {
    navigator.geolocation.getCurrentPosition((p) => setOrigen([p.coords.latitude, p.coords.longitude]));
  }, []);

  // Realtime
  useEffect(() => {
    const channel = supabase.channel('flujo_taxi')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        if (isConductor && payload.eventType === 'INSERT' && payload.new.estado === 'pendiente') {
          setOfertaParaConductor(payload.new);
        }
        if (payload.new.pasajero_id === profile?.id || payload.new.conductor_id === profile?.id) {
          setViajeActivo(payload.new);
          if (payload.new.cond_lat) setTaxiPos([payload.new.cond_lat, payload.new.cond_lon]);
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile, isConductor]);

  // Transmisión GPS Conductor
  useEffect(() => {
    let watchId;
    if (isConductor && viajeActivo?.estado === 'en_camino') {
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        await supabase.from('viajes').update({
          cond_lat: pos.coords.latitude, cond_lon: pos.coords.longitude
        }).eq('id', viajeActivo.id);
      });
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isConductor, viajeActivo]);

  const buscarDestino = async () => {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${destinoText}`);
    const data = await res.json();
    if (data[0]) setDestino([parseFloat(data[0].lat), parseFloat(data[0].lon)]);
  };

  const solicitarServicio = async () => {
    if (!destino) return alert("Por favor indica a dónde vas.");
    await supabase.from('viajes').insert([{
      pasajero_id: profile.id, nombre_pasajero: profile.nombre,
      origen_lat: origen[0], origen_lon: origen[1],
      destino_lat: destino[0], destino_lon: destino[1],
      destino_nombre: destinoText || "Destino marcado", estado: 'pendiente'
    }]);
  };

  const aceptarViaje = async () => {
    const { error } = await supabase.from('viajes')
      .update({ estado: 'en_camino', conductor_id: profile.id })
      .eq('id', ofertaParaConductor.id)
      .is('conductor_id', null); // Seguridad: solo si nadie lo ha tomado

    if (error) alert("Error: El viaje ya no está disponible.");
    else setOfertaParaConductor(null);
  };

  return (
    <div className="h-[100dvh] w-full bg-black relative overflow-hidden">
      <MapContainer center={origen} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapView center={isConductor && ofertaParaConductor ? [ofertaParaConductor.origen_lat, ofertaParaConductor.origen_lon] : origen} />
        <MapEvents setCoords={modoSeleccion === 'origen' ? setOrigen : setDestino} active={isPasajero && !viajeActivo} />
        
        <Marker position={origen} icon={iconPasajero} />
        {destino && <Marker position={destino} icon={iconDestino} />}
        {isConductor && ofertaParaConductor && (
          <>
            <Marker position={[ofertaParaConductor.origen_lat, ofertaParaConductor.origen_lon]} icon={iconPasajero} />
            <Marker position={[ofertaParaConductor.destino_lat, ofertaParaConductor.destino_lon]} icon={iconDestino} />
            <Polyline positions={[[ofertaParaConductor.origen_lat, ofertaParaConductor.origen_lon], [ofertaParaConductor.destino_lat, ofertaParaConductor.destino_lon]]} color="purple" />
          </>
        )}
        {taxiPos && <Marker position={taxiPos} icon={iconTaxi} />}
      </MapContainer>

      {/* UI PASAJERO */}
      {isPasajero && !viajeActivo && (
        <div className="absolute top-20 left-0 right-0 px-6 z-[1000]">
          <div className="bg-zinc-900 p-4 rounded-3xl border border-white/10 shadow-2xl space-y-3">
            <div className="flex gap-2 bg-black/50 p-2 rounded-2xl">
              <button onClick={() => setModoSeleccion('origen')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase ${modoSeleccion === 'origen' ? 'bg-white text-black' : 'text-zinc-500'}`}>Recogida</button>
              <button onClick={() => setModoSeleccion('destino')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase ${modoSeleccion === 'destino' ? 'bg-white text-black' : 'text-zinc-500'}`}>Destino</button>
            </div>
            <div className="flex gap-2">
              <input className="flex-1 bg-zinc-800 p-3 rounded-xl text-white text-sm outline-none" placeholder="Escribe tu destino..." value={destinoText} onChange={e => setDestinoText(e.target.value)} />
              <button onClick={buscarDestino} className="p-3 bg-purple-600 rounded-xl text-white"><Search size={20}/></button>
            </div>
          </div>
        </div>
      )}

      {/* BOTÓN ACCIÓN PASAJERO */}
      {isPasajero && !viajeActivo && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
          <button onClick={solicitarServicio} className="w-full bg-white text-black font-black py-5 rounded-[30px] uppercase text-xl italic shadow-2xl">Solicitar Taxi</button>
        </div>
      )}

      {/* UI CONDUCTOR - NUEVA SOLICITUD */}
      {isConductor && ofertaParaConductor && (
        <div className="absolute bottom-10 left-0 right-0 px-6 z-[1000]">
          <div className="bg-white p-6 rounded-[40px] shadow-2xl">
            <h3 className="text-black font-black italic text-xl mb-2">¡NUEVO VIAJE!</h3>
            <p className="text-zinc-500 text-xs font-bold uppercase mb-4">Destino: {ofertaParaConductor.destino_nombre}</p>
            <div className="flex gap-2">
              <button onClick={aceptarViaje} className="flex-1 bg-black text-white py-4 rounded-2xl font-black uppercase italic">Aceptar</button>
              <button onClick={() => setOfertaParaConductor(null)} className="p-4 bg-zinc-100 text-zinc-400 rounded-2xl"><X/></button>
            </div>
          </div>
        </div>
      )}

      {/* Header Info */}
      <div className="absolute top-6 left-6 z-[1000] text-white">
        <h1 className="font-black italic text-3xl tracking-tighter">TaxiInsta</h1>
        <p className="text-[10px] uppercase font-bold text-green-500">{profile?.rol}</p>
      </div>
    </div>
  );
}

// Pantallas de soporte (AuthScreen, AdminPanel) iguales al código anterior...