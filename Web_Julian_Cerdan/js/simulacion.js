/* ============================================================
   SIMULADOR CON BLOQUEO DE SEGURIDAD (Jaime Rubiales)
   ============================================================ */

let catalogoGlobal = [];
let itinerarioSimulado = [];
let idEnEdicion = null; 

async function inicializarSimulador() {
    try {
        const { data, error } = await clienteSupabase.from('catalogo_marchas').select('*').order('titulo', { ascending: true });
        if (error) throw error;
        catalogoGlobal = data.filter(m => m.duracion_seg && !isNaN(m.duracion_seg));
        llenarBuscadorNativo();
    } catch (err) { console.error(err); }

    const borrador = localStorage.getItem('jc_simulacion_borrador');
    if (borrador) {
        try {
            itinerarioSimulado = JSON.parse(borrador);
            document.getElementById('sim-horas').value = localStorage.getItem('jc_simulacion_horas') || 6;
            document.getElementById('sim-nombre').value = localStorage.getItem('jc_simulacion_nombre') || '';
            renderizarItinerario();
        } catch (e) { localStorage.removeItem('jc_simulacion_borrador'); }
    }

    document.getElementById('sim-horas').addEventListener('input', () => { ejecutarAuditoria(); autoguardarSimulacion(); });
    document.getElementById('sim-nombre').addEventListener('input', autoguardarSimulacion);
    ejecutarAuditoria();
}

// --- NUEVO SISTEMA DE INVITACIÓN VISUAL ---
async function obtenerUsuario() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    
    if (!session) {
        document.getElementById('modal-auth-invitation').style.display = 'flex';
        return null;
    }
    return session.user;
}

function cerrarInvitacion() {
    document.getElementById('modal-auth-invitation').style.display = 'none';
}

function llenarBuscadorNativo() {
    const datalist = document.getElementById('lista-marchas');
    if(!datalist) return;
    datalist.innerHTML = catalogoGlobal.map(m => `<option value="${m.titulo} (${m.autor || 'Desconocido'})">`).join('');
}

function procesarMarcha() {
    const texto = document.getElementById('sim-buscador-marcha').value.trim();
    const calle = document.getElementById('sim-calle').value.trim();
    const marchaBase = catalogoGlobal.find(m => `${m.titulo} (${m.autor || 'Desconocido'})` === texto);
    
    if (!marchaBase) return alert("Selecciona una marcha válida.");

    const datosMarcha = { 
        ...marchaBase, 
        calle: calle || "S/E",
        uuid: idEnEdicion ? idEnEdicion : crypto.randomUUID() 
    };

    if (idEnEdicion) {
        const index = itinerarioSimulado.findIndex(item => item.uuid === idEnEdicion);
        itinerarioSimulado[index] = datosMarcha;
        idEnEdicion = null;
        document.getElementById('btn-agregar-marcha').innerText = "Añadir al Itinerario";
        document.getElementById('btn-agregar-marcha').style.background = "var(--color-oro)";
    } else {
        itinerarioSimulado.push(datosMarcha);
    }

    document.getElementById('sim-buscador-marcha').value = '';
    document.getElementById('sim-calle').value = '';
    renderizarItinerario();
    ejecutarAuditoria();
    autoguardarSimulacion();
}

function prepararEdicion(uuid) {
    const item = itinerarioSimulado.find(i => i.uuid === uuid);
    if (!item) return;
    idEnEdicion = uuid;
    document.getElementById('sim-buscador-marcha').value = `${item.titulo} (${item.autor || 'Desconocido'})`;
    document.getElementById('sim-calle').value = item.calle === "S/E" ? "" : item.calle;
    const btn = document.getElementById('btn-agregar-marcha');
    btn.innerText = "ACTUALIZAR POSICIÓN";
    btn.style.background = "#3498db";
    renderizarItinerario();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function eliminarMarcha(uuid) {
    if(idEnEdicion === uuid) idEnEdicion = null;
    itinerarioSimulado = itinerarioSimulado.filter(i => i.uuid !== uuid);
    renderizarItinerario();
    ejecutarAuditoria();
    autoguardarSimulacion();
}

function renderizarItinerario() {
    const cont = document.getElementById('contenedor-itinerario');
    if (!cont) return;
    cont.innerHTML = itinerarioSimulado.length ? itinerarioSimulado.map((item, i) => `
        <div class="item-marcha" style="${idEnEdicion === item.uuid ? 'border: 2px solid #3498db; background: rgba(52, 152, 219, 0.15);' : ''}">
            <div class="item-info">
                <span style="color:var(--color-oro); font-size:0.7rem;">#${i+1} - ${item.calle}</span>
                <strong>${item.titulo}</strong>
                <span>${item.autor}</span>
            </div>
            <div style="display:flex; flex-direction:column; gap:5px;">
                <button onclick="prepararEdicion('${item.uuid}')" style="background:#3498db; color:white; border:none; border-radius:3px; padding:6px; font-size:0.6rem; cursor:pointer;">EDITAR</button>
                <button onclick="eliminarMarcha('${item.uuid}')" class="btn-eliminar">BORRAR</button>
            </div>
        </div>`).join('') : '<p style="color:#666; text-align:center;">Itinerario vacío.</p>';
}

function ejecutarAuditoria() {
    const n = itinerarioSimulado.length;
    document.getElementById('aud-n').innerText = n;
    const totalSeg = itinerarioSimulado.reduce((acc, curr) => acc + parseInt(curr.duracion_seg), 0);
    const horas = parseFloat(document.getElementById('sim-horas').value) || 0;
    document.getElementById('aud-tiempo').innerText = `${Math.floor(totalSeg/60)}m ${totalSeg%60}s`;
    const ratio = horas > 0 ? ((totalSeg/60)/(horas*60))*100 : 0;
    document.getElementById('aud-ratio').innerText = `${ratio.toFixed(1)}%`;
}

// --- PUBLICACIÓN PROTEGIDA ---
async function prepararParaComunidad() {
    const usuario = await obtenerUsuario();
    if (!usuario) return; 

    if (itinerarioSimulado.length === 0) return;
    const nombre = document.getElementById('sim-nombre').value || "Proyecto sin título";
    const desc = document.getElementById('sim-descripcion').value || "";
    const horas = parseFloat(document.getElementById('sim-horas').value) || 0;
    const totalSeg = itinerarioSimulado.reduce((acc, curr) => acc + parseInt(curr.duracion_seg), 0);
    const dens = horas > 0 ? Math.round(((totalSeg/60)/(horas*60))*100) : 0;
    const parentId = localStorage.getItem('jc_simulacion_parent_id');

    try {
        const { error } = await clienteSupabase.from('comunidad_repertorios').insert([{ 
            proyecto_nombre: nombre, 
            horas_estimadas: horas, 
            densidad_musical: dens,
            descripcion: desc,
            repertorio_json: itinerarioSimulado, 
            usuario_nombre: usuario.email.split('@')[0], 
            respuesta_a_id: parentId 
        }]);

        if (error) throw error;
        alert("¡Publicado con éxito!");
        itinerarioSimulado = [];
        localStorage.removeItem('jc_simulacion_borrador');
        localStorage.removeItem('jc_simulacion_parent_id');
        window.location.href = "comunidad.html";
    } catch (err) { alert(err.message); }
}

function autoguardarSimulacion() {
    localStorage.setItem('jc_simulacion_borrador', JSON.stringify(itinerarioSimulado));
    localStorage.setItem('jc_simulacion_horas', document.getElementById('sim-horas').value);
    localStorage.setItem('jc_simulacion_nombre', document.getElementById('sim-nombre').value);
}

window.onload = inicializarSimulador;