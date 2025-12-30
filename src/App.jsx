import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { LogOut, X, Navigation, Car, User, Clock, Bell, Shield } from 'lucide-react';
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
    const initSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      if (session) {
        const { data } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
        setProfile(data);
      }
      setLoading(false);
    };
    initSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      if (session) {
        const { data } = await supabase.from('perfiles').select('*').eq('id', session.user.id).single();
        setProfile(data);
      } else { setProfile(null); }
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading) return <div className="h-screen bg-black flex items-center justify-center text-white font-black italic animate-pulse">CARGANDO TAXINSTA...</div>;

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
  const [viajeActivo, setViajeActivo] = useState(null);
  const [oferta, setOferta] = useState(null);
  const [taxiPos, setTaxiPos] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // Sincronización de estado activa
  const fetchEstadoActual = useCallback(async () => {
    if (!profile) return;
    const { data } = await supabase.from('viajes').select('*')
      .or(`pasajero_id.eq.${profile.id},conductor_id.eq.${profile.id}`)
      .in('estado', ['pendiente', 'en_camino'])
      .maybeSingle();
    
    setViajeActivo(data || null);
    if (data?.cond_lat) setTaxiPos([data.cond_lat, data.cond_lon]);
  }, [profile]);

  useEffect(() => {
    fetchEstadoActual();
    const channel = supabase.channel('viajes_repo')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        const { eventType, new: row } = payload;
        
        // Lógica de Ofertas para conductores
        if (isConductor && eventType === 'INSERT' && row.estado === 'pendiente') setOferta(row);
        if (isConductor && eventType === 'UPDATE' && row.conductor_id) setOferta(null);

        // Lógica de Viaje Activo
        if (row.pasajero_id === profile.id || row.conductor_id === profile.id) {
          if (row.estado === 'finalizado') {
            setViajeActivo(null);
            setTaxiPos(null);
          } else {
            setViajeActivo(row);
            if (row.cond_lat) setTaxiPos([row.cond_lat, row.cond_lon]);
          }
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile, isConductor, fetchEstadoActual]);

  const tomarViaje = async () => {
    if (!oferta) return;
    const { data, error } = await supabase.from('viajes')
      .update({ estado: 'en_camino', conductor_id: profile.id })
      .eq('id', oferta.id)
      .eq('estado', 'pendiente') // SEGURIDAD: Solo si sigue pendiente
      .is('conductor_id', null)
      .select();

    if (error || !data?.length) {
      setOferta(null);
      setErrorMsg("VIAJE YA TOMADO POR OTRO CONDUCTOR");
      setTimeout(() => setErrorMsg(null), 3000);
    }
  };

  const pedirTaxi = async () => {
    const { error } = await supabase.from('viajes').insert([{
      pasajero_id: profile.id,
      nombre_pasajero: profile.nombre || "Usuario",
      origen_lat: origen[0], origen_lon: origen[1],
      destino_lat: destino[0], destino_lon: destino[1],
      estado: 'pendiente'
    }]);
    if (error) alert("Error al pedir");
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

      {/* HEADER */}
      <div className="absolute top-6 left-6 right-6 z-[1000] flex justify-between items-center pointer-events-none">
        <div className="bg-zinc-900/95 p-4 rounded-3xl border border-white/10 pointer-events-auto shadow-2xl">
          <h1 className="text-white font-black italic text-xl leading-none">TaxiInsta</h1>
          <p className="text-green-500 text-[10px] font-black uppercase mt-1">{profile?.rol}</p>
        </div>
        <div className="flex gap-2 pointer-events-auto">
          {profile?.rol === 'admin' && (
            <Link to="/admin" className="p-4 bg-blue-600 text-white rounded-full shadow-lg"><Shield size={20} fill="currentColor"/></Link>
          )}
          <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="p-4 bg-zinc-900 text-white rounded-full"><LogOut size={20}/></button>
        </div>
      </div>

      {/* ERROR MSG */}
      {errorMsg && (
        <div className="absolute top-28 left-8 right-8 z-[1000] bg-red-600 text-white py-4 rounded-2xl text-center font-black text-xs animate-bounce shadow-2xl">
          {errorMsg}
        </div>
      )}

      {/* UI PASAJERO */}
      {isPasajero && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
          {!viajeActivo ? (
            <div className="bg-zinc-900/95 p-6 rounded-[40px] border border-white/10 space-y-4 shadow-2xl">
              <div className="flex bg-black/40 p-1 rounded-2xl">
                <button onClick={() => setModo('origen')} className={`flex-1 py-3 rounded-xl text-[10px] font-black ${modo === 'origen' ? 'bg-white text-black' : 'text-zinc-500'}`}>RECOGIDA</button>
                <button onClick={() => setModo('destino')} className={`flex-1 py-3 rounded-xl text-[10px] font-black ${modo === 'destino' ? 'bg-white text-black' : 'text-zinc-500'}`}>DESTINO</button>
              </div>
              <button onClick={pedirTaxi} disabled={!destino} className="w-full bg-white text-black py-5 rounded-3xl font-black italic text-xl active:scale-95 disabled:opacity-20">SOLICITAR TAXI</button>
            </div>
          ) : (
            <div className="bg-white p-8 rounded-[45px] shadow-2xl border-t-8 border-purple-600 animate-in zoom-in-95">
              <div className="flex items-center gap-5">
                <div className={`p-4 rounded-full ${viajeActivo.estado === 'pendiente' ? 'bg-amber-100 text-amber-600 animate-pulse' : 'bg-green-100 text-green-600'}`}>
                  {viajeActivo.estado === 'pendiente' ? <Clock size={32}/> : <Car size={32}/>}
                </div>
                <div>
                  <h3 className="text-black font-black text-2xl uppercase italic leading-none">{viajeActivo.estado === 'pendiente' ? "BUSCANDO..." : "VIAJE ASIGNADO"}</h3>
                  <p className="text-zinc-400 text-[10px] font-bold uppercase mt-1">Valle de la Pascua</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* UI CONDUCTOR */}
      {isConductor && (
        <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
          {oferta && !viajeActivo && (
            <div className="bg-white p-8 rounded-[45px] shadow-2xl border-t-[12px] border-purple-600 animate-in slide-in-from-bottom-20">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-black font-black text-3xl italic uppercase leading-none">NUEVA SOLICITUD</h2>
                <div className="bg-purple-600 text-white p-3 rounded-2xl animate-bounce"><Bell size={24}/></div>
              </div>
              <button onClick={tomarViaje} className="w-full bg-black text-white py-6 rounded-3xl font-black text-2xl italic active:scale-95">ACEPTAR SERVICIO</button>
            </div>
          )}
          {viajeActivo && (
            <div className="bg-zinc-900/95 p-6 rounded-[40px] border border-white/10 text-white shadow-2xl">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-4 bg-purple-600 rounded-full shadow-lg shadow-purple-500/50"><Navigation size={24}/></div>
                <p className="font-black italic text-lg uppercase">Servicio en Curso</p>
              </div>
              <button onClick={async () => {
                await supabase.from('viajes').update({ estado: 'finalizado' }).eq('id', viajeActivo.id);
                setViajeActivo(null);
              }} className="w-full bg-green-600 py-5 rounded-3xl font-black text-lg active:bg-green-700 shadow-xl">FINALIZAR SERVICIO</button>
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
      <div className="w-full max-w-sm bg-zinc-900 p-12 rounded-[50px] shadow-2xl text-center border border-zinc-800">
        <h1 className="text-5xl font-black italic mb-12 uppercase tracking-tighter">TaxiInsta</h1>
        <form onSubmit={handleAuth} className="space-y-4">
          <input className="w-full bg-zinc-800 p-5 rounded-3xl border border-zinc-700 outline-none focus:border-purple-500" type="email" placeholder="Email" onChange={e => setEmail(e.target.value)} required />
          <input className="w-full bg-zinc-800 p-5 rounded-3xl border border-zinc-700 outline-none focus:border-purple-500" type="password" placeholder="Password" onChange={e => setPassword(e.target.value)} required />
          <button className="w-full bg-purple-600 p-5 rounded-3xl font-black uppercase text-lg shadow-xl mt-4">{isReg ? "REGISTRAR" : "INGRESAR"}</button>
        </form>
        <button onClick={() => setIsReg(!isReg)} className="mt-10 text-zinc-500 text-[10px] font-black uppercase">{isReg ? "Ya tengo cuenta" : "Crear cuenta"}</button>
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
      <div className="flex justify-between items-center mb-12">
        <h1 className="text-4xl font-black italic uppercase">Admin</h1>
        <Link to="/" className="p-4 bg-zinc-900 rounded-full"><X/></Link>
      </div>
      <div className="grid gap-6 max-w-2xl mx-auto">
        {users.map(u => (
          <div key={u.id} className="bg-zinc-900 p-8 rounded-[40px] border border-zinc-800">
            <div className="flex justify-between items-center mb-6">
              <p className="font-black text-2xl italic">{u.nombre || u.email}</p>
              <span className="text-[10px] bg-purple-600/20 text-purple-400 px-4 py-1.5 rounded-full font-black uppercase">{u.rol}</span>
            </div>
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