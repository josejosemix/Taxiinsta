import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { LogOut, X, Navigation, Car, User, Clock, Bell } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- ICONOS ---
const iconPasajero = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30], iconAnchor: [15, 30] });
const iconDestino = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/2776/2776067.png', iconSize: [30, 30], iconAnchor: [15, 30] });
const iconTaxi = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', iconSize: [35, 35], iconAnchor: [17, 17] });

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

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white font-black italic animate-pulse tracking-tighter text-2xl">TAXINSTA</div>;

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
  const [msgError, setMsgError] = useState(null);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // Sincronización Inicial
  useEffect(() => {
    const sync = async () => {
      const { data } = await supabase.from('viajes').select('*')
        .or(`pasajero_id.eq.${profile.id},conductor_id.eq.${profile.id}`)
        .in('estado', ['pendiente', 'en_camino']).maybeSingle();
      if (data) {
        setViajeActivo(data);
        if (data.cond_lat) setTaxiPos([data.cond_lat, data.cond_lon]);
      }
    };
    if (profile) sync();
  }, [profile]);

  // Realtime
  useEffect(() => {
    const channel = supabase.channel('taxi_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        const { eventType, new: newR } = payload;

        if (isConductor && !viajeActivo) {
          if (eventType === 'INSERT' && newR.estado === 'pendiente') setOfertaConductor(newR);
          if (eventType === 'UPDATE' && newR.conductor_id !== null) setOfertaConductor(null);
        }

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
  }, [profile, isConductor, viajeActivo]);

  // GPS Conductor
  useEffect(() => {
    let watchId;
    if (isConductor && viajeActivo?.estado === 'en_camino') {
      watchId = navigator.geolocation.watchPosition(async (pos) => {
        await supabase.from('viajes').update({ cond_lat: pos.coords.latitude, cond_lon: pos.coords.longitude }).eq('id', viajeActivo.id);
      }, null, { enableHighAccuracy: true });
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isConductor, viajeActivo]);

  const aceptarServicio = async () => {
    const tempOferta = ofertaConductor;
    setOfertaConductor(null); // Limpieza inmediata (Optimista)

    const { data, error } = await supabase.from('viajes').update({ 
      estado: 'en_camino', 
      conductor_id: profile.id 
    }).eq('id', tempOferta.id).is('conductor_id', null).select();

    if (error || !data.length) {
      setMsgError("EL VIAJE YA FUE TOMADO POR OTRO.");
      setTimeout(() => setMsgError(null), 3000);
    }
  };

  return (
    <div className="h-[100dvh] w-full bg-black relative overflow-hidden font-sans">
      <MapContainer center={origen} zoom={15} zoomControl={false} className="h-full w-full z-0">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapView center={taxiPos || origen} />
        <MapEvents setCoords={modo === 'origen' ? setOrigen : setDestino} active={isPasajero && !viajeActivo} />
        <Marker position={origen} icon={iconPasajero} />
        {destino && <Marker position={destino} icon={iconDestino} />}
        {taxiPos && <Marker position={taxiPos} icon={iconTaxi} />}
      </MapContainer>

      {/* ERROR OVERLAY */}
      {msgError && (
        <div className="absolute top-24 left-0 right-0 z-[2000] px-6 animate-bounce">
          <div className="bg-red-600 text-white py-4 rounded-2xl text-center font-black text-xs shadow-2xl uppercase tracking-tighter">
            {msgError}
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="absolute top-6 left-6 right-6 z-50 flex justify-between items-center pointer-events-none">
        <div className="bg-zinc-900/90 backdrop-blur-xl p-4 rounded-3xl border border-white/10 pointer-events-auto shadow-2xl">
          <h1 className="text-white font-black italic text-xl tracking-tighter leading-none">TaxiInsta</h1>
          <p className="text-green-500 text-[10px] font-black uppercase mt-1 tracking-widest">{profile.rol}</p>
        </div>
        <button onClick={onLogout} className="p-4 bg-zinc-900/90 text-white rounded-full border border-white/10 pointer-events-auto shadow-2xl active:scale-95 transition-transform">
          <LogOut size={20}/>
        </button>
      </div>

      {/* PASAJERO */}
      {isPasajero && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-50">
          {!viajeActivo ? (
            <div className="bg-zinc-900/95 p-6 rounded-[40px] border border-white/10 shadow-2xl space-y-4 animate-in slide-in-from-bottom-10">
              <div className="flex bg-black/40 p-1.5 rounded-2xl">
                <button onClick={() => setModo('origen')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'origen' ? 'bg-white text-black shadow-lg' : 'text-zinc-500'}`}>Recogida</button>
                <button onClick={() => setModo('destino')} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'destino' ? 'bg-white text-black shadow-lg' : 'text-zinc-500'}`}>Destino</button>
              </div>
              <button onClick={async () => {
                await supabase.from('viajes').insert([{ pasajero_id: profile.id, nombre_pasajero: profile.nombre, origen_lat: origen[0], origen_lon: origen[1], destino_lat: destino[0], destino_lon: destino[1], tarifa_estimada: 2.00, estado: 'pendiente' }]);
              }} disabled={!destino} className="w-full bg-white text-black py-5 rounded-3xl font-black uppercase italic text-xl shadow-xl active:scale-95 disabled:opacity-20">SOLICITAR AHORA</button>
            </div>
          ) : (
            <div className="bg-white p-7 rounded-[45px] shadow-2xl border-t-8 border-purple-600 animate-in zoom-in-95">
              <div className="flex items-center gap-5">
                <div className={`p-4 rounded-full ${viajeActivo.estado === 'pendiente' ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-green-100 text-green-600'}`}>
                  {viajeActivo.estado === 'pendiente' ? <Clock size={32}/> : <Car size={32}/>}
                </div>
                <div>
                  <h3 className="text-black font-black italic text-2xl uppercase leading-none">{viajeActivo.estado === 'pendiente' ? "Buscando..." : "Asignado"}</h3>
                  <p className="text-zinc-400 text-[10px] font-bold uppercase mt-1 tracking-widest">{viajeActivo.estado === 'pendiente' ? "Esperando unidad" : "En camino a tu ubicación"}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CONDUCTOR */}
      {isConductor && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-50">
          {ofertaConductor && !viajeActivo && (
            <div className="bg-white p-8 rounded-[45px] shadow-2xl border-t-[12px] border-purple-600 animate-in slide-in-from-bottom-20">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-black font-black italic text-3xl tracking-tighter leading-none uppercase">Nuevo Viaje</h2>
                  <p className="text-zinc-400 text-[10px] font-bold uppercase mt-1 tracking-widest">Valle de la pascua</p>
                </div>
                <div className="bg-purple-600 text-white p-4 rounded-2xl shadow-lg animate-bounce"><Bell size={24}/></div>
              </div>
              <button onClick={aceptarServicio} className="w-full bg-black text-white py-6 rounded-3xl font-black uppercase italic text-2xl shadow-xl active:scale-95 transition-transform tracking-tight">ACEPTAR</button>
            </div>
          )}

          {viajeActivo && (
            <div className="bg-zinc-900/95 p-6 rounded-[40px] border border-white/10 text-white shadow-2xl">
              <div className="flex items-center gap-4 mb-6 px-2">
                <div className="p-4 bg-purple-600 rounded-full shadow-lg shadow-purple-500/20"><Navigation size={24}/></div>
                <div>
                  <p className="font-black italic uppercase text-lg leading-none">Viaje en Curso</p>
                  <p className="text-[9px] text-zinc-500 font-bold uppercase mt-1 tracking-widest">GPS Activo</p>
                </div>
              </div>
              <button onClick={async () => {
                await supabase.from('viajes').update({ estado: 'finalizado' }).eq('id', viajeActivo.id);
                setViajeActivo(null);
              }} className="w-full bg-green-600 py-5 rounded-3xl font-black uppercase italic text-lg shadow-xl active:bg-green-700 transition-all">FINALIZAR Y COBRAR</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- LOGIN ---
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
        <h1 className="text-5xl font-black italic mb-12 tracking-tighter uppercase">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-5 rounded-3xl border border-zinc-700 outline-none focus:border-purple-500 transition-all" type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
          <input className="w-full bg-zinc-800 p-5 rounded-3xl border border-zinc-700 outline-none focus:border-purple-500 transition-all" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
          <button className="w-full bg-purple-600 p-5 rounded-3xl font-black uppercase tracking-widest text-lg shadow-xl active:scale-95 italic transition-transform mt-4">
            {isReg ? "Registrar" : "Entrar"}
          </button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="mt-10 text-zinc-500 text-[10px] font-black uppercase tracking-[0.2em]">{isReg ? "Ya tengo cuenta" : "Crear cuenta"}</button>
      </div>
    </div>
  );
}

// --- ADMIN ---
function AdminPanel({ profile }) {
  const [users, setUsers] = useState([]);
  useEffect(() => {
    if (profile?.rol !== 'admin') return;
    supabase.from('perfiles').select('*').order('nombre').then(({ data }) => setUsers(data || []));
  }, [profile]);
  if (profile?.rol !== 'admin') return <Navigate to="/" />;
  return (
    <div className="min-h-screen bg-black text-white p-10">
      <div className="flex justify-between items-center mb-12">
        <h1 className="text-4xl font-black italic uppercase tracking-tighter">Administración</h1>
        <Link to="/" className="p-4 bg-zinc-900 rounded-full border border-zinc-800"><X/></Link>
      </div>
      <div className="grid gap-6 max-w-2xl mx-auto">
        {users.map(u => (
          <div key={u.id} className="bg-zinc-900 p-8 rounded-[40px] border border-zinc-800 shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <p className="font-black text-2xl italic tracking-tight">{u.nombre || u.email}</p>
              <span className="text-[10px] bg-purple-600/20 text-purple-400 px-4 py-1.5 rounded-full font-black uppercase">{u.rol}</span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {['pasajero', 'conductor', 'admin'].map(r => (
                <button key={r} onClick={async () => { await supabase.rpc('cambiar_rol_usuario', { target_user_id: u.id, nuevo_rol: r }); window.location.reload(); }} className={`py-4 rounded-2xl text-[10px] font-black uppercase transition-all ${u.rol === r ? 'bg-white text-black scale-105 shadow-lg' : 'bg-zinc-800 text-zinc-500 active:bg-zinc-700'}`}>{r}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}