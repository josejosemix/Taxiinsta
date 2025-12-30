import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { LogOut, Navigation, Car, Clock, Bell, Shield, X, CheckCircle, MapPin } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- CONFIGURACIÓN DE ICONOS ---
const iconPasajero = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30], iconAnchor: [15, 30] });
const iconTaxi = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', iconSize: [35, 35], iconAnchor: [17, 17] });
const iconDestino = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/2776/2776067.png', iconSize: [30, 30], iconAnchor: [15, 30] });

function MapEvents({ setCoords, active }) {
  useMapEvents({ click(e) { if (active) setCoords([e.latlng.lat, e.latlng.lng]); } });
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user.id);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(uid) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', uid).maybeSingle();
    setProfile(data);
    setLoading(false);
  }

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white font-black italic animate-pulse text-2xl">RIDERY CLONE...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/" element={session ? <MainMap profile={profile} /> : <AuthScreen />} />
        <Route path="/admin" element={<AdminPanel profile={profile} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

function MainMap({ profile }) {
  const [origen, setOrigen] = useState([9.2132, -66.0125]);
  const [destino, setDestino] = useState(null);
  const [modo, setModo] = useState('origen');
  const [viaje, setViaje] = useState(null);
  const [oferta, setOferta] = useState(null);
  const [error, setError] = useState(null);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // --- SINCRONIZACIÓN DE ESTADO ---
  const sync = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('viajes').select('*')
      .or(`pasajero_id.eq.${profile.id},conductor_id.eq.${profile.id}`)
      .not('estado', 'eq', 'finalizado')
      .maybeSingle();
    setViaje(data || null);
  }, [profile]);

  useEffect(() => {
    sync();
    const channel = supabase.channel('ridery_flow')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        const { eventType, new: row } = payload;
        if (isConductor && eventType === 'INSERT' && row.estado === 'pendiente') setOferta(row);
        if (row?.pasajero_id === profile.id || row?.conductor_id === profile.id) {
          if (row.estado === 'finalizado') setViaje(null);
          else setViaje(row);
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile, isConductor, sync]);

  // GPS TRANSMISION (Solo cuando el conductor acepta)
  useEffect(() => {
    let watchId;
    if (isConductor && viaje && ['aceptado', 'en_sitio', 'en_viaje'].includes(viaje.estado)) {
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        await supabase.from('viajes').update({ 
          cond_lat: pos.coords.latitude, cond_lon: pos.coords.longitude 
        }).eq('id', viaje.id);
      }, null, { enableHighAccuracy: true });
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isConductor, viaje]);

  // FUNCIONES DE ESTADO
  const updateEstado = async (nuevo) => {
    const { error } = await supabase.from('viajes').update({ estado: nuevo }).eq('id', viaje.id);
    if (error) setError("ERROR AL ACTUALIZAR");
  };

  const solicitar = async () => {
    const { error } = await supabase.from('viajes').insert([{
      pasajero_id: profile.id, nombre_pasajero: profile.nombre,
      origen_lat: origen[0], origen_lon: origen[1],
      destino_lat: destino[0], destino_lon: destino[1], estado: 'pendiente'
    }]);
    if (error) setError("YA TIENES UN VIAJE ACTIVO");
  };

  const aceptar = async () => {
    const { data } = await supabase.from('viajes').update({ 
      estado: 'aceptado', conductor_id: profile.id 
    }).eq('id', oferta.id).is('conductor_id', null).select();
    if (!data?.length) { setOferta(null); setError("VIAJE YA TOMADO"); }
  };

  return (
    <div className="h-[100dvh] w-full bg-black relative overflow-hidden font-sans">
      <MapContainer center={origen} zoom={15} zoomControl={false} className="h-full w-full z-0">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapView center={viaje?.cond_lat ? [viaje.cond_lat, viaje.cond_lon] : origen} />
        <MapEvents setCoords={modo === 'origen' ? setOrigen : setDestino} active={!viaje} />
        
        <Marker position={origen} icon={iconPasajero} />
        {destino && <Marker position={destino} icon={iconDestino} />}
        {viaje?.cond_lat && <Marker position={[viaje.cond_lat, viaje.cond_lon]} icon={iconTaxi} />}
      </MapContainer>

      {/* HEADER TIPO RIDERY */}
      <div className="absolute top-6 left-6 right-6 z-50 flex justify-between items-center">
        <div className="bg-zinc-900/95 p-4 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md">
          <h1 className="text-white font-black italic text-xl leading-none">TaxiInsta</h1>
          <p className="text-purple-500 text-[10px] font-black uppercase mt-1">{profile?.rol}</p>
        </div>
        <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="p-4 bg-zinc-900 text-white rounded-full border border-white/10"><LogOut size={20}/></button>
      </div>

      {error && <div className="absolute top-28 left-8 right-8 z-[100] bg-red-600 text-white p-4 rounded-2xl text-center font-black animate-bounce">{error}</div>}

      {/* PANEL INFERIOR (CONTROLES) */}
      <div className="absolute bottom-10 left-0 right-0 px-8 z-50">
        
        {/* FLUJO PASAJERO */}
        {isPasajero && !viaje && (
          <div className="bg-zinc-900/95 p-6 rounded-[40px] border border-white/10 shadow-2xl space-y-4">
            <div className="flex bg-black/40 p-1 rounded-2xl">
              <button onClick={() => setModo('origen')} className={`flex-1 py-3 rounded-xl text-[10px] font-black ${modo === 'origen' ? 'bg-white text-black' : 'text-zinc-500'}`}>RECOGIDA</button>
              <button onClick={() => setModo('destino')} className={`flex-1 py-3 rounded-xl text-[10px] font-black ${modo === 'destino' ? 'bg-white text-black' : 'text-zinc-500'}`}>DESTINO</button>
            </div>
            <button onClick={solicitar} disabled={!destino} className="w-full bg-white text-black py-5 rounded-3xl font-black italic text-xl uppercase active:scale-95 disabled:opacity-20">PEDIR AHORA</button>
          </div>
        )}

        {isPasajero && viaje && (
          <div className="bg-white p-8 rounded-[45px] shadow-2xl border-t-8 border-purple-600">
            <div className="flex items-center gap-4">
              <div className="p-4 bg-purple-100 text-purple-600 rounded-full animate-pulse"><Car size={32}/></div>
              <div className="flex-1">
                <h3 className="text-black font-black text-2xl uppercase italic leading-none">
                  {viaje.estado === 'pendiente' ? 'BUSCANDO...' : 
                   viaje.estado === 'aceptado' ? 'CONDUCTOR EN CAMINO' :
                   viaje.estado === 'en_sitio' ? '¡LLEGÓ AL PUNTO!' : 'EN VIAJE'}
                </h3>
                <p className="text-zinc-400 text-[10px] font-bold mt-1">ESTATUS REAL DEL SERVICIO</p>
              </div>
              <button onClick={() => updateEstado('finalizado')} className="p-2 text-zinc-300"><X/></button>
            </div>
          </div>
        )}

        {/* FLUJO CONDUCTOR */}
        {isConductor && oferta && !viaje && (
          <div className="bg-white p-8 rounded-[45px] shadow-2xl border-t-[12px] border-purple-600 animate-bounce">
            <h2 className="text-black font-black text-2xl italic mb-6">NUEVA SOLICITUD DISPONIBLE</h2>
            <button onClick={aceptar} className="w-full bg-black text-white py-6 rounded-3xl font-black text-xl uppercase">TOMAR SERVICIO</button>
          </div>
        )}

        {isConductor && viaje && (
          <div className="bg-zinc-900/95 p-6 rounded-[40px] border border-white/10 shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-purple-600 rounded-full shadow-lg shadow-purple-500/50 text-white"><Navigation size={24}/></div>
              <div>
                <p className="text-white font-black italic text-lg leading-none uppercase">{viaje.estado.replace('_', ' ')}</p>
                <p className="text-zinc-500 text-[9px] font-bold uppercase mt-1 tracking-widest">Panel de Control Ridery</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {viaje.estado === 'aceptado' && <button onClick={() => updateEstado('en_sitio')} className="w-full bg-blue-600 text-white py-5 rounded-3xl font-black uppercase italic">YA LLEGUÉ AL SITIO</button>}
              {viaje.estado === 'en_sitio' && <button onClick={() => updateEstado('en_viaje')} className="w-full bg-amber-500 text-black py-5 rounded-3xl font-black uppercase italic">INICIAR RECORRIDO</button>}
              {viaje.estado === 'en_viaje' && <button onClick={() => updateEstado('finalizado')} className="w-full bg-green-600 text-white py-5 rounded-3xl font-black uppercase italic text-xl">FINALIZAR Y COBRAR</button>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Pantalla de autenticación minimalista
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const handleLogin = async (e) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-8">
      <div className="w-full max-w-xs space-y-8 text-center">
        <h1 className="text-6xl font-black italic text-white tracking-tighter uppercase">Ridery</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input className="w-full bg-zinc-900 border border-zinc-800 p-5 rounded-3xl text-white outline-none focus:border-purple-600 transition-all" type="email" placeholder="Correo" onChange={e => setEmail(e.target.value)} />
          <input className="w-full bg-zinc-900 border border-zinc-800 p-5 rounded-3xl text-white outline-none focus:border-purple-600 transition-all" type="password" placeholder="Contraseña" onChange={e => setPassword(e.target.value)} />
          <button className="w-full bg-purple-600 text-white p-5 rounded-3xl font-black uppercase text-lg shadow-xl shadow-purple-900/20 active:scale-95 transition-transform">INGRESAR</button>
        </form>
      </div>
    </div>
  );
}

// Panel Admin básico
function AdminPanel({ profile }) {
  if (profile?.rol !== 'admin') return <Navigate to="/" />;
  return <div className="p-20 text-white bg-black min-h-screen"><h1>Panel de Control Maestro</h1><Link to="/" className="text-purple-500">Volver</Link></div>;
}