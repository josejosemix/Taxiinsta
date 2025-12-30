import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Polyline } from 'react-leaflet';
import { LogOut, Shield, X, MapPin, Navigation, Search, Car, User, Clock, DollarSign } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- CONFIGURACIÓN DE ICONOS ---
const iconPasajero = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30], iconAnchor: [15, 30] });
const iconDestino = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/2776/2776067.png', iconSize: [30, 30], iconAnchor: [15, 30] });
const iconTaxi = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', iconSize: [35, 35], iconAnchor: [17, 17] });

// --- UTILIDADES ---
const calcularDistanciaKM = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
};

function MapEvents({ setCoords, active }) {
  useMapEvents({ click(e) { if (active) setCoords([e.latlng.lat, e.latlng.lng]); } });
  return null;
}

function MapView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 15); }, [center]);
  return null;
}

// --- COMPONENTE PRINCIPAL ---
export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) fetchProfile(session.user);
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchProfile(session.user);
      else { setProfile(null); setLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(user) {
    const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).maybeSingle();
    setProfile(data);
    setLoading(false);
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.replace('/');
  };

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white font-black italic animate-pulse">TAXINSTA...</div>;

  return (
    <Router>
      <Routes>
        <Route path="/" element={session ? <MainMap profile={profile} onLogout={handleSignOut} /> : <AuthScreen />} />
        <Route path="/admin" element={<AdminPanel profile={profile} />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Router>
  );
}

function MainMap({ profile, onLogout }) {
  const [origen, setOrigen] = useState([9.2132, -66.0125]);
  const [destino, setDestino] = useState(null);
  const [modo, setModo] = useState('origen');
  const [viajeActivo, setViajeActivo] = useState(null);
  const [ofertaConductor, setOfertaConductor] = useState(null);
  const [taxiPos, setTaxiPos] = useState(null);
  const [tarifa, setTarifa] = useState(0);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // Cargar estado inicial
  useEffect(() => {
    const checkActiveRide = async () => {
      const { data } = await supabase.from('viajes').select('*')
        .or(`pasajero_id.eq.${profile.id},conductor_id.eq.${profile.id}`)
        .in('estado', ['pendiente', 'en_camino']).maybeSingle();
      if (data) {
        setViajeActivo(data);
        if (data.cond_lat) setTaxiPos([data.cond_lat, data.cond_lon]);
      }
    };
    if (profile) checkActiveRide();
  }, [profile]);

  // Cálculo de tarifa
  useEffect(() => {
    if (origen && destino) {
      const d = calcularDistanciaKM(origen[0], origen[1], destino[0], destino[1]);
      setTarifa(Math.max(2.00, d * 0.80).toFixed(2));
    }
  }, [origen, destino]);

  // Realtime: Suscripción única y limpia
  useEffect(() => {
    const channel = supabase.channel('global_rides')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        const { eventType, new: newR, old: oldR } = payload;

        // 1. Lógica para Conductor (Ver ofertas)
        if (isConductor && !viajeActivo) {
          if (eventType === 'INSERT' && newR.estado === 'pendiente') setOfertaConductor(newR);
          if (eventType === 'UPDATE' && newR.conductor_id !== null) setOfertaConductor(null);
        }

        // 2. Lógica de Viaje Propio (Pasajero y Conductor)
        if (newR.pasajero_id === profile.id || newR.conductor_id === profile.id) {
          if (newR.estado === 'finalizado') {
            setViajeActivo(null);
            setTaxiPos(null);
            setDestino(null);
          } else {
            setViajeActivo(newR);
            if (newR.cond_lat) setTaxiPos([newR.cond_lat, newR.cond_lon]);
          }
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile, isConductor, viajeActivo, ofertaConductor]);

  // Transmisión GPS Conductor
  useEffect(() => {
    let watchId;
    if (isConductor && viajeActivo?.estado === 'en_camino') {
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        await supabase.from('viajes').update({ cond_lat: pos.coords.latitude, cond_lon: pos.coords.longitude }).eq('id', viajeActivo.id);
      }, null, { enableHighAccuracy: true });
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isConductor, viajeActivo]);

  const aceptarViaje = async () => {
    if (!ofertaConductor) return;
    const { data, error } = await supabase.from('viajes').update({ estado: 'en_camino', conductor_id: profile.id })
      .eq('id', ofertaConductor.id).is('conductor_id', null).select();
    
    if (error || !data.length) {
      setOfertaConductor(null);
      alert("¡Demasiado tarde! El viaje ya fue tomado.");
    } else {
      setOfertaConductor(null);
      setViajeActivo(data[0]);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-black relative overflow-hidden font-sans">
      <MapContainer center={origen} zoom={15} zoomControl={false} className="h-full w-full z-0">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapView center={taxiPos || (viajeActivo ? [viajeActivo.origen_lat, viajeActivo.origen_lon] : origen)} />
        <MapEvents setCoords={modo === 'origen' ? setOrigen : setDestino} active={isPasajero && !viajeActivo} />
        <Marker position={origen} icon={iconPasajero} />
        {destino && <Marker position={destino} icon={iconDestino} />}
        {taxiPos && <Marker position={taxiPos} icon={iconTaxi} />}
      </MapContainer>

      {/* HEADER */}
      <div className="absolute top-6 left-6 right-6 z-50 flex justify-between items-center pointer-events-none">
        <div className="bg-zinc-900/90 backdrop-blur-xl p-4 rounded-3xl border border-white/10 pointer-events-auto">
          <h1 className="text-white font-black italic text-xl tracking-tighter">TaxiInsta</h1>
          <p className="text-green-500 text-[9px] font-black uppercase tracking-widest">{profile.rol}</p>
        </div>
        <button onClick={onLogout} className="p-4 bg-zinc-900/90 text-white rounded-full border border-white/10 pointer-events-auto shadow-2xl active:scale-90 transition-transform"><LogOut size={20}/></button>
      </div>

      {/* UI PASAJERO */}
      {isPasajero && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-50">
          {!viajeActivo ? (
            <div className="bg-zinc-900/95 p-6 rounded-[40px] border border-white/10 shadow-2xl space-y-4 animate-in slide-in-from-bottom-10">
              <div className="flex bg-black/40 p-1.5 rounded-2xl">
                <button onClick={() => setModo('origen')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'origen' ? 'bg-white text-black' : 'text-zinc-500'}`}>Recogida</button>
                <button onClick={() => setModo('destino')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'destino' ? 'bg-white text-black' : 'text-zinc-500'}`}>Destino</button>
              </div>
              {destino && (
                <div className="flex justify-between items-center px-2">
                  <span className="text-zinc-500 text-[10px] font-black uppercase">Tarifa Est.</span>
                  <span className="text-green-500 font-black text-xl italic">${tarifa}</span>
                </div>
              )}
              <button onClick={async () => {
                await supabase.from('viajes').insert([{ pasajero_id: profile.id, nombre_pasajero: profile.nombre, origen_lat: origen[0], origen_lon: origen[1], destino_lat: destino[0], destino_lon: destino[1], tarifa_estimada: tarifa, estado: 'pendiente' }]);
              }} disabled={!destino} className="w-full bg-white text-black py-5 rounded-3xl font-black uppercase italic text-xl shadow-xl active:scale-95 disabled:opacity-20 transition-all">SOLICITAR TAXI</button>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-[45px] shadow-2xl animate-in zoom-in-95">
              <div className="flex items-center gap-4 mb-6">
                <div className={`p-4 rounded-full ${viajeActivo.estado === 'pendiente' ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-purple-100 text-purple-600'}`}>
                  {viajeActivo.estado === 'pendiente' ? <Clock size={28}/> : <Car size={28}/>}
                </div>
                <div>
                  <h3 className="text-black font-black italic text-xl uppercase leading-none">{viajeActivo.estado === 'pendiente' ? "Buscando..." : "Taxi Asignado"}</h3>
                  <p className="text-zinc-400 text-[10px] font-bold uppercase mt-1 tracking-widest">{viajeActivo.estado === 'pendiente' ? "Esperando respuesta" : "En camino a tu ubicación"}</p>
                </div>
              </div>
              {viajeActivo.conductor_id && (
                <div className="bg-zinc-50 rounded-3xl p-4 flex items-center justify-between border border-zinc-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white"><User size={20}/></div>
                    <p className="text-black font-black text-xs uppercase italic leading-none">Conductor Activo</p>
                  </div>
                  <p className="text-green-600 font-black text-xl leading-none">${viajeActivo.tarifa_estimada}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* UI CONDUCTOR */}
      {isConductor && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-50">
          {ofertaConductor && !viajeActivo && (
            <div className="bg-white p-8 rounded-[45px] shadow-2xl border-t-[12px] border-purple-600 animate-in slide-in-from-bottom-20">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-black font-black italic text-3xl tracking-tighter leading-none uppercase">Nuevo Viaje</h2>
                <div className="bg-green-100 text-green-600 p-2 rounded-xl font-black text-xl italic">${ofertaConductor.tarifa_estimada}</div>
              </div>
              <div className="flex gap-3">
                <button onClick={aceptarViaje} className="flex-[2] bg-black text-white py-5 rounded-3xl font-black uppercase italic text-lg shadow-xl active:scale-95 transition-transform">ACEPTAR</button>
                <button onClick={() => setOfertaConductor(null)} className="flex-1 bg-zinc-100 text-zinc-400 py-5 rounded-3xl font-black active:scale-95 transition-transform"><X className="mx-auto"/></button>
              </div>
            </div>
          )}

          {viajeActivo && (
            <div className="bg-zinc-900/95 backdrop-blur-xl p-6 rounded-[40px] border border-white/10 text-white shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-purple-600 rounded-full animate-pulse"><Navigation size={24}/></div>
                <div>
                  <p className="font-black italic uppercase text-lg leading-none tracking-tighter">SERVICIO EN CURSO</p>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase mt-1 tracking-widest">GPS Transmitiendo en vivo</p>
                </div>
              </div>
              <button onClick={async () => {
                await supabase.from('viajes').update({ estado: 'finalizado' }).eq('id', viajeActivo.id);
                setViajeActivo(null);
              }} className="w-full bg-green-600 py-5 rounded-3xl font-black uppercase italic text-lg shadow-lg active:bg-green-700 transition-colors">FINALIZAR SERVICIO</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- OTROS COMPONENTES ---
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isReg, setIsReg] = useState(false);
  const handleAuth = async (e) => {
    e.preventDefault();
    const { error } = isReg ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password });
    if (error) alert(error.message);
  };
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-12 rounded-[50px] shadow-2xl text-center">
        <h1 className="text-5xl font-black italic mb-12 tracking-tighter italic uppercase">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-5 rounded-3xl border border-zinc-700 outline-none focus:border-purple-500" type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
          <input className="w-full bg-zinc-800 p-5 rounded-3xl border border-zinc-700 outline-none focus:border-purple-500" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
          <button className="w-full bg-purple-600 p-5 rounded-3xl font-black uppercase tracking-widest text-lg shadow-xl active:scale-95 italic">{isReg ? "Registrar" : "Entrar"}</button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="mt-10 text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">{isReg ? "Ya tengo cuenta" : "Crear nueva cuenta"}</button>
      </div>
    </div>
  );
}

function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (profile?.rol !== 'admin') return;
    supabase.from('perfiles').select('*').order('nombre').then(({ data }) => setUsers(data || []));
  }, [profile]);
  if (profile?.rol !== 'admin') return <Navigate to="/" />;
  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="flex justify-between items-center mb-12"><h1 className="text-4xl font-black italic uppercase">Admin</h1><Link to="/" className="p-4 bg-zinc-900 rounded-full border border-zinc-800"><X/></Link></div>
      <div className="grid gap-6 max-w-2xl mx-auto">
        {users.map(u => (
          <div key={u.id} className="bg-zinc-900/50 p-8 rounded-[40px] border border-zinc-800">
            <div className="flex justify-between items-center mb-6"><p className="font-black text-2xl italic">{u.nombre || u.email}</p><span className="text-[10px] bg-purple-600/20 text-purple-400 px-4 py-1.5 rounded-full font-black uppercase">{u.rol}</span></div>
            <div className="grid grid-cols-3 gap-3">
              {['pasajero', 'conductor', 'admin'].map(r => (
                <button key={r} onClick={async () => { await supabase.rpc('cambiar_rol_usuario', { target_user_id: u.id, nuevo_rol: r }); window.location.reload(); }} className={`py-4 rounded-2xl text-[10px] font-black uppercase ${u.rol === r ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500'}`}>{r}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}