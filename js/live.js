/* ============================================================
   MOTOR DE TELEMETRÍA EN DIRECTO Y CHAT (LIVE.JS)
   ============================================================ */

const parametrosURL = new URLSearchParams(window.location.search);
const idProcesion = parametrosURL.get('id');

let catalogoMaestro = [];

// 1. EJECUCIÓN INICIAL
document.addEventListener('DOMContentLoaded', async () => {
    if (!idProcesion) {
        document.getElementById('txt-hermandad-header').innerText = "⚠️ Error de Conexión";
        return;
    }
    
    await cargarCabeceraEvento();
    await cargarCatalogoEnMemoria();
    
    // Cargas iniciales
    cargarMarchas();
    cargarChat();

    // Activar el motor en tiempo real de Supabase (Sustituye al antiguo setInterval)
    activarSuscripcionesRealtime();
});

// 2. CARGAR CABECERA Y FONDO
async function cargarCabeceraEvento() {
    const { data, error } = await clienteSupabase
        .from('maestro_procesiones')
        .select('*')
        .eq('id_procesion', idProcesion)
        .maybeSingle();

    if (error || !data) return;

    document.getElementById('txt-hermandad-header').innerText = data.hermandad;
    
    if (data.url_foto) {
        document.body.style.backgroundImage = `linear-gradient(to bottom, rgba(10,10,10,0.7) 0%, rgba(5,5,5,0.98) 100%), url('${data.url_foto}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center 30%';
        document.body.style.backgroundAttachment = 'fixed';
    }
}

// 3. CARGAR CATÁLOGO (Para cruzar IDs con nombres)
async function cargarCatalogoEnMemoria() {
    const { data, error } = await clienteSupabase.from('catalogo_marchas').select('id_marcha, titulo');
    if (!error && data) catalogoMaestro = data;
}

/* ============================================================
   MÓDULO DE REPERTORIO (TIMELINE)
   ============================================================ */
async function cargarMarchas() {
    const { data, error } = await clienteSupabase
        .from('repertorio_transaccional')
        .select('*')
        .eq('id_procesion', idProcesion)
        .order('orden', { ascending: false });

    const contenedor = document.getElementById('timeline-contenedor');
    contenedor.innerHTML = "";

    if (!data || data.length === 0) {
        contenedor.innerHTML = `<p style="color: #777; text-align: center; padding: 20px;">Esperando marchas...</p>`;
        return;
    }

    data.forEach((reg, index) => {
        const marchaInfo = catalogoMaestro.find(m => m.id_marcha === reg.id_marcha) || { titulo: "Marcha Desconocida" };
        
        // Es la última si es la posición 0 del array (porque ordenamos por DESC)
        const esLaUltima = (index === 0);
        const claseCard = esLaUltima ? 'marcha-live-card ultima' : 'marcha-live-card';
        const textoFase = esLaUltima ? `🔴 SONANDO: ${reg.fase}` : reg.fase;

        contenedor.innerHTML += `
            <div class="${claseCard}">
                <div class="ml-info">
                    <div class="ml-fase">${textoFase}</div>
                    <h4 class="ml-titulo">${marchaInfo.titulo}</h4>
                </div>
                <div class="ml-orden">#${reg.orden}</div>
            </div>
        `;
    });
}

    data.forEach((reg, index) => {
        const marchaInfo = catalogoMaestro.find(m => m.id_marcha === reg.id_marcha) || { titulo: "Marcha Desconocida" };
        
        // Lógica de "Sonando Ahora" para la primera de la lista
        const esLaUltima = (index === 0);
        const colorPunto = esLaUltima ? '#ff3b3b' : 'var(--color-oro)';
        const sombraPunto = esLaUltima ? '0 0 15px #ff3b3b' : '0 0 10px var(--color-oro)';
        const etiquetaFase = esLaUltima ? `👉 SONANDO AHORA (${reg.fase})` : reg.fase;

        contenedor.innerHTML += `
            <div class="timeline-item">
                <div class="timeline-punto" style="background: ${colorPunto}; box-shadow: ${sombraPunto};"></div>
                <div class="t-orden">MARCHA #${reg.orden}</div>
                <h4 class="t-titulo" style="${esLaUltima ? 'color: #ff3b3b;' : 'color: white;'}">${marchaInfo.titulo}</h4>
                <span class="t-fase" style="${esLaUltima ? 'color: #ff3b3b; background: rgba(255, 59, 59, 0.1); border: 1px solid rgba(255,59,59,0.3);' : ''}">${etiquetaFase}</span>
            </div>
        `;
    });


/* ============================================================
   MÓDULO DE CHAT
   ============================================================ */
const cajaMensajes = document.getElementById('caja-mensajes');
const inputChat = document.getElementById('input-chat');
const btnEnviarChat = document.getElementById('btn-enviar-chat');

async function cargarChat() {
    const { data } = await clienteSupabase
        .from('directo_chat')
        .select('*')
        .eq('id_procesion', idProcesion)
        .order('created_at', { ascending: true });

    cajaMensajes.innerHTML = '';
    
    if (!data || data.length === 0) {
        cajaMensajes.innerHTML = '<p style="color:#555; text-align:center; margin-top:20px;">Sé el primero en comentar.</p>';
    } else {
        data.forEach(msg => pintarMensaje(msg));
    }
}

function pintarMensaje(msg) {
    if (cajaMensajes.innerHTML.includes("Sé el primero")) cajaMensajes.innerHTML = '';
    
    cajaMensajes.innerHTML += `
        <div class="mensaje-chat">
            <strong style="color: var(--color-oro);">${msg.usuario_nombre}:</strong> 
            <span style="color: #ccc;">${msg.mensaje}</span>
        </div>
    `;
    cajaMensajes.scrollTop = cajaMensajes.scrollHeight; // Auto-scroll abajo
}

async function enviarMensaje() {
    const texto = inputChat.value.trim();
    if (!texto) return;

    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (!session) return alert("Debes iniciar sesión para usar el chat en vivo.");

    const { data: perf } = await clienteSupabase.from('perfiles').select('username').eq('id', session.user.id).maybeSingle();
    const nombre = (perf && perf.username) ? perf.username : session.user.email.split('@')[0];

    inputChat.value = ''; // Limpiamos para UX fluida

    await clienteSupabase.from('directo_chat').insert([{
        id_procesion: idProcesion,
        usuario_nombre: nombre,
        mensaje: texto
    }]);
}

// Event Listeners del Chat
if (btnEnviarChat) btnEnviarChat.addEventListener('click', enviarMensaje);
if (inputChat) inputChat.addEventListener('keypress', (e) => { if (e.key === 'Enter') enviarMensaje(); });

/* ============================================================
   SUSCRIPCIONES EN TIEMPO REAL (REALTIME)
   ============================================================ */
function activarSuscripcionesRealtime() {
    clienteSupabase
        .channel('canal-directo')
        // 1. Escuchar nuevas marchas insertadas desde el panel de Admin
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'repertorio_transaccional', filter: `id_procesion=eq.${idProcesion}` }, 
            () => cargarMarchas() 
        )
        // 2. Escuchar nuevos mensajes de chat de cualquier usuario
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'directo_chat', filter: `id_procesion=eq.${idProcesion}` }, 
            (payload) => pintarMensaje(payload.new) 
        )
        .subscribe();
}