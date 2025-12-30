import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents, Polyline } from 'react-leaflet';
import { LogOut, Shield, X, MapPin, Navigation, Search, CheckCircle, Car, User } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- ICONOS ---
const iconPasajero = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30] });
const iconDestino = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/2776/2776067.png', iconSize: [30, 30] });
const iconTaxi = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', iconSize: [35, 35] });

// --- UTILIDADES MAPA ---
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
    const { data } = await supabase.from('perfiles').select('*').eq('id', user.id).single();
    setProfile(data);
    setLoading(false);
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    window.location.href = '/';
  };

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white font-black italic animate-pulse">CARGANDO TAXINSTA...</div>;

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

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // --- 1. RECUPERACIÓN DE ESTADO (CRÍTICO) ---
  useEffect(() => {
    const recuperarViaje = async () => {
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
    recuperarViaje();
  }, [profile]);

  // --- 2. ESCUCHA DE CAMBIOS REALTIME ---
  useEffect(() => {
    const channel = supabase.channel('viajes_v5')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        // Lógica para nuevas ofertas (sólo conductores libres)
        if (isConductor && !viajeActivo && payload.eventType === 'INSERT' && payload.new.estado === 'pendiente') {
          setOfertaConductor(payload.new);
        }
        
        // Lógica de actualización del viaje del usuario actual
        if (payload.new.pasajero_id === profile.id || payload.new.conductor_id === profile.id) {
          if (payload.new.estado === 'finalizado') {
            setViajeActivo(null);
            setTaxiPos(null);
            setDestino(null);
            alert("¡Viaje finalizado con éxito!");
          } else {
            setViajeActivo(payload.new);
            if (payload.new.cond_lat) setTaxiPos([payload.new.cond_lat, payload.new.cond_lon]);
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
        await supabase.from('viajes').update({ 
          cond_lat: pos.coords.latitude, 
          cond_lon: pos.coords.longitude 
        }).eq('id', viajeActivo.id);
      }, null, { enableHighAccuracy: true });
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isConductor, viajeActivo]);

  const solicitarTaxi = async () => {
    if (viajeActivo) return alert("Ya tienes un viaje en curso.");
    const { error } = await supabase.from('viajes').insert([{
      pasajero_id: profile.id,
      nombre_pasajero: profile.nombre,
      origen_lat: origen[0], origen_lon: origen[1],
      destino_lat: destino[0], destino_lon: destino[1],
      tarifa_estimada: 2.50, // Ejemplo
      estado: 'pendiente'
    }]);
    if (error) alert(error.message);
  };

  return (
    <div className="h-[100dvh] w-full bg-black relative overflow-hidden font-sans">
      <MapContainer center={origen} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapEvents setCoords={modo === 'origen' ? setOrigen : setDestino} active={isPasajero && !viajeActivo} />
        
        <Marker position={origen} icon={iconPasajero} />
        {destino && <Marker position={destino} icon={iconDestino} />}
        {taxiPos && <Marker position={taxiPos} icon={iconTaxi} />}
        
        {viajeActivo && (
          <Polyline positions={[[viajeActivo.origen_lat, viajeActivo.origen_lon], [viajeActivo.destino_lat, viajeActivo.destino_lon]]} color="white" weight={2} dashArray="5, 10" />
        )}
      </MapContainer>

      {/* HEADER */}
      <div className="absolute top-6 left-6 right-6 z-[1000] flex justify-between items-center pointer-events-none">
        <div className="bg-black/80 backdrop-blur-xl p-4 rounded-3xl border border-white/10 pointer-events-auto">
          <h1 className="text-white font-black italic text-xl">TaxiInsta</h1>
          <p className="text-green-500 text-[9px] font-bold uppercase tracking-widest">{profile.rol}</p>
        </div>
        <button onClick={onLogout} className="p-4 bg-zinc-900 text-white rounded-full border border-white/10 pointer-events-auto"><LogOut size={20}/></button>
      </div>

      {/* --- UI DINÁMICA: PASAJERO --- */}
      {isPasajero && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
          {!viajeActivo ? (
            /* Pantalla de Selección */
            <div className="bg-zinc-900 p-6 rounded-[35px] border border-white/10 shadow-2xl space-y-4">
              <div className="flex bg-black/50 p-1 rounded-2xl">
                <button onClick={() => setModo('origen')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase ${modo === 'origen' ? 'bg-white text-black' : 'text-zinc-500'}`}>Recogida</button>
                <button onClick={() => setModo('destino')} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase ${modo === 'destino' ? 'bg-white text-black' : 'text-zinc-500'}`}>Destino</button>
              </div>
              <button onClick={solicitarTaxi} disabled={!destino} className="w-full bg-white text-black py-5 rounded-2xl font-black uppercase italic text-xl shadow-xl disabled:opacity-30">Pedir Servicio</button>
            </div>
          ) : (
            /* Pantalla de Viaje en Curso */
            <div className="bg-white p-6 rounded-[40px] shadow-2xl animate-in slide-in-from-bottom-10">
              <div className="flex items-center gap-4 mb-4">
                <div className="bg-purple-100 p-3 rounded-full text-purple-600"><Car size={24}/></div>
                <div>
                  <h3 className="text-black font-black italic text-lg uppercase leading-none">
                    {viajeActivo.estado === 'pendiente' ? "Buscando Conductor..." : "Taxi en Camino"}
                  </h3>
                  <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider">Estado: {viajeActivo.estado}</p>
                </div>
              </div>
              {viajeActivo.conductor_id && (
                <div className="border-t border-zinc-100 pt-4 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-zinc-200 rounded-full flex items-center justify-center"><User size={16}/></div>
                    <p className="text-black font-bold text-xs uppercase">Conductor Asignado</p>
                  </div>
                  <p className="text-green-600 font-black text-lg">${viajeActivo.tarifa_estimada}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* --- UI DINÁMICA: CONDUCTOR --- */}
      {isConductor && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
          {ofertaConductor && !viajeActivo && (
            <div className="bg-white p-8 rounded-[40px] shadow-2xl border-t-8 border-purple-600 animate-bounce">
              <h3 className="text-black font-black italic text-2xl mb-4 italic uppercase">¡Nueva Solicitud!</h3>
              <div className="flex gap-2">
                <button onClick={async () => {
                  const { error } = await supabase.from('viajes').update({ estado: 'en_camino', conductor_id: profile.id }).eq('id', ofertaConductor.id).is('conductor_id', null);
                  if (error) { alert("Viaje tomado por otro"); setOfertaConductor(null); }
                }} className="flex-1 bg-black text-white py-4 rounded-2xl font-black uppercase">Aceptar</button>
                <button onClick={() => setOfertaConductor(null)} className="p-4 bg-zinc-100 text-zinc-400 rounded-2xl"><X/></button>
              </div>
            </div>
          )}

          {viajeActivo && (
            <div className="bg-zinc-900 p-6 rounded-[35px] border border-white/10 text-white shadow-2xl">
              <p className="font-black italic uppercase text-lg mb-4 text-center">Viaje en progreso</p>
              <button onClick={async () => {
                await supabase.from('viajes').update({ estado: 'finalizado' }).eq('id', viajeActivo.id);
                setViajeActivo(null);
              }} className="w-full bg-green-600 py-4 rounded-2xl font-black uppercase shadow-lg">Finalizar Viaje</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// (AuthScreen y AdminPanel se mantienen iguales)
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
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-10 rounded-[45px] shadow-2xl text-center">
        <h1 className="text-4xl font-black italic mb-10 tracking-tighter">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none" type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
          <input className="w-full bg-zinc-800 p-4 rounded-2xl border border-zinc-700 outline-none" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
          <button className="w-full bg-purple-600 p-4 rounded-2xl font-black uppercase">{isReg ? "Registrar" : "Entrar"}</button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="mt-8 text-zinc-500 text-[10px] font-black uppercase">{isReg ? "Ya tengo cuenta" : "Crear cuenta"}</button>
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
      <div className="flex justify-between items-center mb-10"><h1 className="text-4xl font-black italic tracking-tighter uppercase">Admin Panel</h1><Link to="/"><X/></Link></div>
      <div className="grid gap-4 max-w-xl mx-auto">
        {users.map(u => (
          <div key={u.id} className="bg-zinc-900 p-6 rounded-[35px] border border-zinc-800 flex flex-col gap-4">
            <div className="flex justify-between items-center"><p className="font-bold text-xl">{u.nombre}</p><span className="text-xs font-black uppercase text-purple-500">{u.rol}</span></div>
            <div className="grid grid-cols-3 gap-2">
              {['pasajero', 'conductor', 'admin'].map(r => (
                <button key={r} onClick={async () => { await supabase.rpc('cambiar_rol_usuario', { target_user_id: u.id, nuevo_rol: r }); window.location.reload(); }} className={`py-3 rounded-xl text-[10px] font-black uppercase ${u.rol === r ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-500'}`}>{r}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}