// ... (mismos imports anteriores)

function MainMap({ profile }) {
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState([9.2132, -66.0125]); 
  const [condCoords, setCondCoords] = useState(null); // Ubicación del conductor en vivo
  const [enviando, setEnviando] = useState(false);
  const [notificacion, setNotificacion] = useState(null);
  const [viajeActivo, setViajeActivo] = useState(null);

  const isPasajero = profile?.rol === 'pasajero';
  const isConductor = profile?.rol === 'conductor';

  // --- LÓGICA DE RASTREO (CONDUCTOR ENVÍA) ---
  useEffect(() => {
    let interval;
    if (isConductor && viajeActivo) {
      interval = setInterval(() => {
        navigator.geolocation.getCurrentPosition(async (pos) => {
          const { latitude, longitude } = pos.coords;
          await supabase.from('viajes')
            .update({ cond_lat: latitude, cond_lon: longitude })
            .eq('id', viajeActivo.id);
        });
      }, 5000); // Actualiza cada 5 segundos
    }
    return () => clearInterval(interval);
  }, [isConductor, viajeActivo]);

  // --- LÓGICA DE RASTREO (PASAJERO RECIBE) ---
  useEffect(() => {
    const channel = supabase.channel('seguimiento_en_vivo')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'viajes' }, 
      payload => {
        // Si soy el pasajero y el conductor actualizó su posición
        if (isPasajero && payload.new.pasajero_id === profile.id) {
          if (payload.new.estado === 'en_camino') {
            setCondCoords([payload.new.cond_lat, payload.new.cond_lon]);
          }
          if (payload.new.estado === 'conductor_en_punto') {
            alert("🚨 ¡EL TAXI LLEGÓ! Está afuera.");
          }
        }
        // Si soy el conductor y alguien más tomó el viaje primero
        if (isConductor && payload.new.estado === 'en_camino' && payload.new.conductor_id !== profile.id) {
          setNotificacion(null);
        }
      }).subscribe();
    return () => supabase.removeChannel(channel);
  }, [isPasajero, isConductor, profile.id]);

  const aceptarViaje = async (viaje) => {
    const { error } = await supabase.from('viajes')
      .update({ 
        estado: 'en_camino', 
        conductor_id: profile.id 
      })
      .eq('id', viaje.id);
    
    if (!error) {
      setViajeActivo(viaje);
      setNotificacion(null);
      setCoords([viaje.origen_lat, viaje.origen_lon]);
    }
  };

  const solicitarTaxi = async () => {
    setEnviando(true);
    // Verificación de conductores (Simulada para este ejemplo)
    const { data: conductores } = await supabase.from('perfiles').select('id').eq('rol', 'conductor');
    
    if (!conductores || conductores.length === 0) {
      alert("⚠️ Lo sentimos, no hay conductores disponibles en Valle de la Pascua en este momento.");
      setEnviando(false);
      return;
    }

    const { error } = await supabase.from('viajes').insert([{
      pasajero_id: profile.id, 
      nombre_pasajero: profile.nombre,
      origen_lat: coords[0], 
      origen_lon: coords[1], 
      estado: 'pendiente'
    }]);
    
    if (!error) alert("Buscando el taxi más cercano...");
    setEnviando(false);
  };

  return (
    <div className="h-[100dvh] w-screen bg-black relative">
      {/* MAPA */}
      <MapContainer center={coords} zoom={15} zoomControl={false} className="h-full w-full">
        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
        <MapViewHandler center={coords} />
        <MapEventsHandler setCoords={setCoords} isPasajero={isPasajero} />
        
        {/* Marcador del Pasajero (Punto de recogida) */}
        <Marker position={coords} icon={customIcon} />

        {/* Marcador del Conductor (Solo visible para pasajero cuando está en camino) */}
        {isPasajero && condCoords && (
          <Marker position={condCoords} icon={new L.Icon({
            iconUrl: 'https://cdn-icons-png.flaticon.com/512/3063/3063822.png', // Icono de coche
            iconSize: [40, 40],
            iconAnchor: [20, 20]
          })} />
        )}
      </MapContainer>

      {/* INTERFAZ DE CONDUCTOR (NOTIFICACIÓN) */}
      {isConductor && notificacion && (
        <div className="absolute top-24 left-0 right-0 z-[2000] px-6">
          <div className="bg-white p-6 rounded-[35px] shadow-2xl animate-bounce">
            <p className="text-black font-black italic">¡VIAJE DISPONIBLE!</p>
            <button onClick={() => aceptarViaje(notificacion)} className="w-full bg-black text-white py-4 rounded-2xl mt-4 font-black">
              ACEPTAR Y TRANSMITIR GPS
            </button>
          </div>
        </div>
      )}

      {/* BOTONES INFERIORES */}
      <div className="absolute bottom-10 left-0 right-0 px-8 z-[1000]">
        {isPasajero && (
          <button onClick={solicitarTaxi} disabled={enviando} className="w-full bg-white text-black font-black py-5 rounded-[30px] uppercase text-xl italic">
            {enviando ? "VERIFICANDO..." : "SOLICITAR AHORA"}
          </button>
        )}
        
        {isPasajero && condCoords && (
          <div className="bg-purple-600 text-white p-4 rounded-2xl text-center font-bold animate-pulse">
            🚕 Tu conductor está en camino. ¡Síguelo en el mapa!
          </div>
        )}
      </div>
    </div>
  );
}