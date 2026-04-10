/* ============================================================
   MOTOR DE TELEMETRÍA EN DIRECTO (LIVE.JS)
   ============================================================ */

const parametrosURL = new URLSearchParams(window.location.search);
const idProcesion = parametrosURL.get('id');

let catalogoCache = [];
let totalMarchasActual = 0; // Para saber si tenemos que actualizar la pantalla

// Ejecutar al iniciar
document.addEventListener('DOMContentLoaded', async () => {
    if (!idProcesion) {
        document.getElementById('titulo-hermandad').innerText = "⚠️ Error de Conexión";
        return;
    }
    
    await cargarCatalogoEnMemoria();
    await cargarCabeceraEvento();
    
    // Primera carga del repertorio
    await sincronizarRepertorioLive();

    // POLÍTICA DE ACTUALIZACIÓN (POLLING): Consultar cada 5 segundos
    setInterval(sincronizarRepertorioLive, 5000);
});

// 1. Cargar el catálogo para cruzar los IDs con los nombres
async function cargarCatalogoEnMemoria() {
    const { data, error } = await clienteSupabase.from('catalogo_marchas').select('*');
    if (!error && data) catalogoCache = data;
}

// 2. Cargar los datos de la hermandad para la cabecera
async function cargarCabeceraEvento() {
    const { data, error } = await clienteSupabase
        .from('maestro_procesiones')
        .select('*')
        .eq('id_procesion', idProcesion)
        .single();

    if (error) return;

    document.getElementById('titulo-hermandad').innerText = data.hermandad;
    document.getElementById('subtitulo-localidad').innerText = `${data.localidad} | ${data.tipo}`;
    
    if (data.url_foto) {
        document.body.style.backgroundImage = `linear-gradient(to bottom, rgba(10,10,10,0.6) 0%, rgba(5,5,5,0.95) 100%), url('${data.url_foto}')`;
        document.body.style.backgroundSize = 'cover';
        
        // CORRECCIÓN DE ENCUADRE: Foco en el rostro/centro
        document.body.style.backgroundPosition = 'center 30%';
        
        document.body.style.backgroundAttachment = 'fixed';

        const heroLive = document.getElementById('hero-live');
        heroLive.style.background = 'transparent';
        heroLive.style.borderColor = 'transparent';
        heroLive.style.boxShadow = 'none';
    }
}

// 3. Sincronización Transaccional del Repertorio
async function sincronizarRepertorioLive() {
    try {
        const { data: transData, error } = await clienteSupabase
            .from('repertorio_transaccional')
            .select('*')
            .eq('id_procesion', idProcesion)
            .order('orden', { ascending: false }); // DESCENDENTE: La última marcha sonada sale la primera

        if (error) throw error;

        // Si no hay marchas nuevas, no tocamos el DOM (para ahorrar recursos del navegador)
        if (transData.length === totalMarchasActual) return;
        
        // Si hay marchas nuevas, actualizamos contador y renderizamos
        totalMarchasActual = transData.length;
        document.getElementById('contador-marchas').innerText = totalMarchasActual;

        renderizarTimelineLive(transData);

    } catch (e) {
        console.error("Error de telemetría:", e);
    }
}

// 4. Renderizar las tarjetas en pantalla
function renderizarTimelineLive(transData) {
    const contenedor = document.getElementById('timeline-directo');
    contenedor.innerHTML = "";

    if (transData.length === 0) {
        contenedor.innerHTML = `<div style="text-align:center; padding: 50px; color:#aaa;">Esperando a que la dirección musical inicie el repertorio...</div>`;
        return;
    }

    transData.forEach((reg, index) => {
        // Cruzamos el ID con el catálogo en memoria
        const marchaInfo = catalogoCache.find(m => m.id_marcha === reg.id_marcha) || { titulo: "Marcha Desconocida", autor: "N/A" };
        
        // La marcha en la posición 0 del array (la más reciente) la pintamos diferente
        const esLaUltima = (index === 0) ? 'ultima' : '';
        const etiquetaFase = esLaUltima ? `👉 SONANDO AHORA (${reg.fase})` : reg.fase;

        contenedor.innerHTML += `
            <div class="marcha-live-card ${esLaUltima}">
                <div>
                    <div class="ml-fase" style="${esLaUltima ? 'color:#ff3b3b;' : ''}">${etiquetaFase}</div>
                    <h3 class="ml-titulo">${marchaInfo.titulo}</h3>
                    <p class="ml-autor">${marchaInfo.autor}</p>
                </div>
                <div class="ml-orden">#${reg.orden}</div>
            </div>
        `;
    });
}