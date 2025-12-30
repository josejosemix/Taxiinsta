import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, Link } from 'react-router-dom';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import { LogOut, Navigation, Car, Clock, Bell, Shield, X, RefreshCw } from 'lucide-react';
import { supabase } from './supabaseClient';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// --- ICONOS ---
const iconPasajero = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/684/684908.png', iconSize: [30, 30] });
const iconTaxi = new L.Icon({ iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', iconSize: [35, 35] });

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

  if (loading) return (
    <div className="h-screen bg-black flex flex-col items-center justify-center text-white font-black italic">
      <RefreshCw className="animate-spin text-purple-500 mb-4" size={48} />
      <p className="animate-pulse">SINCRONIZANDO CON RIDERY...</p>
    </div>
  );

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
  const [viaje, setViaje] = useState(null);
  const [oferta, setOferta] = useState(null);
  const [error, setError] = useState(null);
  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // --- SINCRONIZACIÓN MAESTRA (Evita el bloqueo de tus capturas) ---
  const verificarEstadoViaje = useCallback(async () => {
    if (!profile) return;
    const { data, error } = await supabase.from('viajes')
      .select('*')
      .or(`pasajero_id.eq.${profile.id},conductor_id.eq.${profile.id}`)
      .not('estado', 'eq', 'finalizado')
      .maybeSingle();

    if (error) console.error("Error DB:", error);
    
    // Si la DB dice que no hay viaje pero la pantalla dice "Buscando", limpiamos.
    if (!data) {
      setViaje(null);
      setOferta(null);
    } else {
      setViaje(data);
    }
  }, [profile]);

  useEffect(() => {
    verificarEstadoViaje();

    const channel = supabase.channel('cambios_viaje')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'viajes' }, (payload) => {
        const { eventType, new: row, old: oldRow } = payload;

        // Lógica para Conductor (Nuevas ofertas)
        if (isConductor && eventType === 'INSERT' && row.estado === 'pendiente') {
          setOferta(row);
        }

        // Lógica de actualización (Si alguien toma el viaje o cambia de estado)
        if (row?.pasajero_id === profile.id || row?.conductor_id === profile.id) {
          if (row.estado === 'finalizado') {
            setViaje(null);
          } else {
            setViaje(row);
            setOferta(null); // Si ya tengo viaje, quito la oferta
          }
        }

        // Si se borra el registro manualmente
        if (eventType === 'DELETE') {
          verificarEstadoViaje();
        }
      }).subscribe();

    // Verificación de respaldo cada 5 segundos (por si falla el internet)
    const interval = setInterval(verificarEstadoViaje, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [profile, isConductor, verificarEstadoViaje]);

  const tomarViaje = async () => {
    if (!oferta) return;
    const { data, error } = await supabase.from('viajes')
      .update({ estado: 'aceptado', conductor_id: profile.id })
      .eq('id', oferta.id)
      .eq('estado', 'pendiente') // CRÍTICO: Solo si sigue pendiente
      .select();

    if (error || !data?.length) {
      setOferta(null);
      setError("¡EL VIAJE YA FUE TOMADO POR OTRO!");
      setTimeout(() => setError(null), 3000);
    }
  };

  const cancelarViaje = async () => {
    if (!viaje) return;
    await supabase.from('viajes').update({ estado: 'finalizado' }).eq('id', viaje.id);
    setViaje(null);
  };

  return (
    <div className="h-[100dvh] w-full bg-black relative overflow-hidden">
      <MapContainer center={[9.2132, -66.0125]} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        {viaje?.cond_lat && <Marker position={[viaje.cond_lat, viaje.cond_lon]} icon={iconTaxi} />}
      </MapContainer>

      {/* HEADER TIPO INSTAGRAM/RIDERY */}
      <div className="absolute top-6 left-6 right-6 z-50 flex justify-between items-center pointer-events-none">
        <div className="bg-zinc-900/90 p-4 rounded-3xl border border-white/10 backdrop-blur-md pointer-events-auto">
          <h1 className="text-white font-black italic text-xl">TaxiInsta</h1>
          <p className="text-purple-500 text-[10px] font-black uppercase tracking-widest">{profile?.rol}</p>
        </div>
        <div className="flex gap-2 pointer-events-auto">
          {profile?.rol === 'admin' && (
            <Link to="/admin" className="p-4 bg-blue-600 text-white rounded-full shadow-lg border border-blue-400">
              <Shield size={22} fill="currentColor" />
            </Link>
          )}
          <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} className="p-4 bg-zinc-900 text-white rounded-full border border-white/10"><LogOut size={22}/></button>
        </div>
      </div>

      {/* ERROR FLOTANTE (No bloquea la pantalla) */}
      {error && (
        <div className="absolute top-28 left-8 right-8 z-[100] bg-red-600 text-white py-4 rounded-2xl text-center font-black text-xs uppercase animate-bounce shadow-2xl">
          {error}
        </div>
      )}

      {/* UI DINÁMICA INFERIOR */}
      <div className="absolute bottom-10 left-0 right-0 px-8 z-50">
        
        {/* PASAJERO BUSCANDO */}
        {isPasajero && !viaje && (
          <div className="bg-zinc-900/95 p-6 rounded-[40px] border border-white/10 shadow-2xl space-y-4">
             <button onClick={async () => {
               await supabase.from('viajes').insert([{ pasajero_id: profile.id, nombre_pasajero: profile.nombre, origen_lat: 9.2132, origen_lon: -66.0125, estado: 'pendiente' }]);
             }} className="w-full bg-white text-black py-5 rounded-3xl font-black italic text-xl uppercase active:scale-95">Solicitar Ride</button>
          </div>
        )}

        {/* PASAJERO CON VIAJE ACTIVO */}
        {isPasajero && viaje && (
          <div className="bg-white p-8 rounded-[45px] shadow-2xl border-t-8 border-purple-600 animate-in zoom-in-95">
            <div className="flex items-center gap-5">
              <div className="p-4 bg-purple-100 text-purple-600 rounded-full animate-pulse"><Clock size={32}/></div>
              <div className="flex-1">
                <h3 className="text-black font-black text-2xl uppercase italic leading-none">
                   {viaje.estado === 'pendiente' ? 'Buscando...' : 'Asignado'}
                </h3>
                <p className="text-zinc-400 text-[10px] font-bold uppercase mt-1">Estatus Real del Servicio</p>
              </div>
              <button onClick={cancelarViaje} className="p-3 bg-zinc-100 text-zinc-400 rounded-full"><X/></button>
            </div>
          </div>
        )}

        {/* CONDUCTOR RECIBIENDO OFERTA */}
        {isConductor && oferta && !viaje && (
          <div className="bg-white p-8 rounded-[45px] shadow-2xl border-t-[12px] border-purple-600 animate-in slide-in-from-bottom-20">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-black font-black text-3xl italic uppercase leading-none tracking-tighter">Nueva Solicitud</h2>
              <div className="bg-purple-600 text-white p-3 rounded-2xl animate-bounce"><Bell size={24}/></div>
            </div>
            <button onClick={tomarViaje} className="w-full bg-black text-white py-6 rounded-3xl font-black text-2xl italic active:scale-95 uppercase tracking-tighter">Aceptar Servicio</button>
          </div>
        )}

        {/* CONDUCTOR EN VIAJE */}
        {isConductor && viaje && (
          <div className="bg-zinc-900/95 p-6 rounded-[40px] border border-white/10 text-white shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-4 bg-purple-600 rounded-full shadow-lg shadow-purple-500/50 text-white"><Navigation size={24}/></div>
              <p className="font-black italic text-lg uppercase tracking-tight">Servicio en Curso</p>
            </div>
            <button onClick={cancelarViaje} className="w-full bg-green-600 py-5 rounded-3xl font-black text-lg active:bg-green-700 shadow-xl uppercase">Finalizar Viaje</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ... (Componentes AuthScreen y AdminPanel se mantienen iguales)