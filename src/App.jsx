import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Polyline, Popup } from 'react-leaflet';
import { LogOut, Shield, X, MapPin, Navigation, Search, CheckCircle, Car, User, Clock } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- CONFIGURACIÓN DE ICONOS ---
const iconPasajero = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30], iconAnchor: [15, 30] });
const iconDestino = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/2776/2776067.png', iconSize: [30, 30], iconAnchor: [15, 30] });
const iconTaxi = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', iconSize: [35, 35], iconAnchor: [17, 17] });

// --- UTILIDADES MAPA ---
function MapEvents({ setCoords, active }) {
  useMapEvents({ click(e) { if (active) setCoords([e.latlng.lat, e.latlng.lng]); } });
  return null;
}
function MapView({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 15, { duration: 1.5 }); }, [center, map]);
  return null;
}

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

  if (loading) return (
    <div className="h-screen bg-black flex flex-col items-center justify-center text-white font-black italic">
      <div className="w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      CARGANDO TAXINSTA...
    </div>
  );

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
  const [errorViaje, setErrorViaje] = useState(null);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // --- 1. RECUPERAR ESTADO AL INICIAR ---
  useEffect(() => {
    const checkActiveRide = async () => {
      const { data } = await supabase
        .from('viajes')
        .select('*')
        .or(`pasajero_id.eq.${profile.id},conductor_id.eq.${profile.id}`)
        .in('estado', ['pendiente', 'en_camino'])
        .maybeSingle();
      
      if (data) {
        setViajeActivo(data);
        if (data.cond_lat) setTaxiPos([data.cond_lat, data.cond_lon]);
      }
    };
    if (profile) checkActiveRide();
  }, [profile]);

  // --- 2. SUSCRIPCIÓN REALTIME MEJORADA ---
  useEffect(() => {
    const channel = supabase.channel('ride_tracking')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        const { eventType, new: newRide, old: oldRide } = payload;

        // Si soy conductor y hay un viaje nuevo pendiente
        if (isConductor && eventType === 'INSERT' && newRide.estado === 'pendiente' && !viajeActivo) {
          setOfertaConductor(newRide);
        }

        // Si el viaje que me pertenece cambia
        if (newRide.pasajero_id === profile.id || newRide.conductor_id === profile.id) {
          if (newRide.estado === 'finalizado') {
            setViajeActivo(null);
            setTaxiPos(null);
            setDestino(null);
          } else {
            setViajeActivo(newRide);
            if (newRide.cond_lat) setTaxiPos([newRide.cond_lat, newRide.cond_lon]);
          }
        }
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile, isConductor, viajeActivo]);

  // GPS en vivo para el conductor
  useEffect(() => {
    let watchId;
    if (isConductor && viajeActivo?.estado === 'en_camino') {
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        await supabase.from('viajes').update({ 
          cond_lat: pos.coords.latitude, 
          cond_lon: pos.coords.longitude 
        }).eq('id', viajeActivo.id);
      }, null, { enableHighAccuracy: true });
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isConductor, viajeActivo]);

  const solicitarTaxi = async () => {
    if (viajeActivo) return;
    setErrorViaje(null);
    const { error } = await supabase.from('viajes').insert([{
      pasajero_id: profile.id,
      nombre_pasajero: profile.nombre,
      origen_lat: origen[0], origen_lon: origen[1],
      destino_lat: destino[0], destino_lon: destino[1],
      tarifa_estimada: 3.50,
      estado: 'pendiente'
    }]);
    if (error) setErrorViaje("No se pudo enviar la solicitud.");
  };

  const aceptarViaje = async () => {
    if (!ofertaConductor) return;
    const { error } = await supabase.from('viajes')
      .update({ estado: 'en_camino', conductor_id: profile.id })
      .eq('id', ofertaConductor.id)
      .is('conductor_id', null);

    if (error) {
      setErrorViaje("El viaje ya fue tomado por otro.");
      setOfertaConductor(null);
    } else {
      setOfertaConductor(null);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-black relative overflow-hidden font-sans">
      <MapContainer center={origen} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapView center={taxiPos || origen} />
        <MapEvents setCoords={modo === 'origen' ? setOrigen : setDestino} active={isPasajero && !viajeActivo} />
        
        <Marker position={origen} icon={iconPasajero} />
        {destino && <Marker position={destino} icon={iconDestino} />}
        {taxiPos && <Marker position={taxiPos} icon={iconTaxi} />}
      </MapContainer>

      {/* HEADER DINÁMICO */}
      <div className="absolute top-6 left-6 right-6 z-[1000] flex justify-between items-start pointer-events-none">
        <div className="bg-black/60 backdrop-blur-xl p-4 rounded-3xl border border-white/10 pointer-events-auto">
          <h1 className="text-white font-black italic text-xl leading-none">TaxiInsta</h1>
          <p className="text-purple-400 text-[10px] font-bold uppercase mt-1 tracking-widest">{profile.rol}</p>
        </div>
        <button onClick={onLogout} className="p-4 bg-zinc-900/90 text-white rounded-full border border-white/10 pointer-events-auto shadow-2xl active:scale-90 transition-transform">
          <LogOut size={20}/>
        </button>
      </div>

      {/* UI PASAJERO */}
      {isPasajero && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
          {!viajeActivo ? (
            <div className="bg-zinc-900/95 backdrop-blur-2xl p-6 rounded-[40px] border border-white/10 shadow-2xl space-y-4 animate-in slide-in-from-bottom-10">
              <div className="flex bg-black/40 p-1.5 rounded-2xl">
                <button onClick={() => setModo('origen')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'origen' ? 'bg-white text-black' : 'text-zinc-500'}`}>Recogida</button>
                <button onClick={() => setModo('destino')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'destino' ? 'bg-white text-black' : 'text-zinc-500'}`}>Destino</button>
              </div>
              <button onClick={solicitarTaxi} disabled={!destino} className="w-full bg-white text-black py-5 rounded-3xl font-black uppercase italic text-xl shadow-xl active:scale-95 disabled:opacity-20 transition-all">
                SOLICITAR AHORA
              </button>
            </div>
          ) : (
            <div className="bg-white p-6 rounded-[45px] shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="flex items-center gap-4 mb-6">
                <div className={`p-4 rounded-full ${viajeActivo.estado === 'pendiente' ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-green-100 text-green-600'}`}>
                  {viajeActivo.estado === 'pendiente' ? <Clock size={28}/> : <Car size={28}/>}
                </div>
                <div>
                  <h3 className="text-black font-black italic text-xl uppercase leading-none">
                    {viajeActivo.estado === 'pendiente' ? "Buscando..." : "Taxi Asignado"}
                  </h3>
                  <p className="text-zinc-400 text-[10px] font-bold uppercase mt-1">Valle de la Pascua</p>
                </div>
              </div>
              {viajeActivo.conductor_id && (
                <div className="bg-zinc-50 rounded-3xl p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-zinc-200 rounded-full flex items-center justify-center text-zinc-500"><User/></div>
                    <div>
                      <p className="text-black font-black text-xs uppercase italic leading-none">Unidad en camino</p>
                      <p className="text-[9px] text-zinc-400 font-bold uppercase mt-1">Conductor Verificado</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-green-600 font-black text-xl leading-none">${viajeActivo.tarifa_estimada}</p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* UI CONDUCTOR */}
      {isConductor && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
          {ofertaConductor && !viajeActivo && (
            <div className="bg-white p-8 rounded-[45px] shadow-2xl border-t-[12px] border-purple-600 animate-in slide-in-from-bottom-20">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-black font-black italic text-3xl tracking-tighter leading-none">NUEVO VIAJE</h2>
                  <p className="text-purple-600 font-bold text-[10px] uppercase mt-1 tracking-widest">Ganancia: ${ofertaConductor.tarifa_estimada}</p>
                </div>
                <div className="bg-purple-50 p-3 rounded-2xl text-purple-600"><MapPin/></div>
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
                  <p className="font-black italic uppercase text-lg leading-none">VIAJE EN CURSO</p>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase mt-1 tracking-widest">Transmitiendo GPS...</p>
                </div>
              </div>
              <button onClick={async () => {
                await supabase.from('viajes').update({ estado: 'finalizado' }).eq('id', viajeActivo.id);
                setViajeActivo(null);
              }} className="w-full bg-green-600 py-5 rounded-3xl font-black uppercase italic text-lg shadow-lg active:bg-green-700 transition-colors">
                FINALIZAR Y COBRAR
              </button>
            </div>
          )}

          {errorViaje && !viajeActivo && (
            <div className="bg-red-500 text-white p-4 rounded-2xl mb-4 text-center text-xs font-black uppercase animate-bounce">
              {errorViaje}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- PANEL ADMIN ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (profile?.rol !== 'admin') return;
    supabase.from('perfiles').select('*').order('nombre').then(({ data }) => setUsers(data || []));
  }, [profile]);
  if (profile?.rol !== 'admin') return <Navigate to="/" />;
  return (
    <div className="min-h-screen bg-black text-white p-10 font-sans">
      <div className="flex justify-between items-center mb-12">
        <h1 className="text-4xl font-black italic tracking-tighter uppercase leading-none">ADMIN<br/><span className="text-purple-500">PANEL</span></h1>
        <Link to="/" className="p-5 bg-zinc-900 rounded-full border border-zinc-800"><X/></Link>
      </div>
      <div className="grid gap-6 max-w-2xl mx-auto">
        {users.map(u => (
          <div key={u.id} className="bg-zinc-900/50 p-8 rounded-[40px] border border-zinc-800">
            <div className="flex justify-between items-center mb-6">
              <p className="font-black text-2xl italic tracking-tight">{u.nombre || "Sin Nombre"}</p>
              <span className="text-[10px] bg-purple-600/20 text-purple-400 px-4 py-1.5 rounded-full font-black uppercase tracking-widest">{u.rol}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['pasajero', 'conductor', 'admin'].map(r => (
                <button key={r} onClick={async () => { await supabase.rpc('cambiar_rol_usuario', { target_user_id: u.id, nuevo_rol: r }); window.location.reload(); }} className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${u.rol === r ? 'bg-white text-black shadow-lg scale-105' : 'bg-zinc-800 text-zinc-500'}`}>{r}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- PANTALLA DE ACCESO ---
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
    <div className="min-h-screen bg-black flex items-center justify-center p-6 text-white font-sans">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-12 rounded-[50px] shadow-2xl text-center">
        <h1 className="text-5xl font-black italic mb-12 tracking-tighter">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-5 rounded-3xl border border-zinc-700 outline-none focus:border-purple-500 transition-colors" type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
          <input className="w-full bg-zinc-800 p-5 rounded-3xl border border-zinc-700 outline-none focus:border-purple-500 transition-colors" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
          <button className="w-full bg-purple-600 p-5 rounded-3xl font-black uppercase tracking-widest text-lg shadow-xl active:scale-95 transition-transform mt-4 italic">
            {isReg ? "REGISTRARME" : "ENTRAR"}
          </button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="mt-10 text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">{isReg ? "Ya tengo cuenta" : "Crear nueva cuenta"}</button>
      </div>
    </div>
  );
}