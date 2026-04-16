/* ============================================================
   CONSOLA DE ADMINISTRACIÓN COMPLETA - REPARADA (Jaime Rubiales)
   ============================================================ */

let procesionActiva = null;
let catalogoCache = [];
let contadorOrden = 1;

// VARIABLE GLOBAL PARA SABER SI ESTAMOS EDITANDO
let ordenEnEdicion = null; 

document.addEventListener('DOMContentLoaded', async () => {
    await cargarCatalogoEnMemoria();
    await comprobarEstadoSistema();

    // Event Listeners
    document.getElementById('inp-id-marcha').addEventListener('input', autocompletarTitulo);
    document.getElementById('btn-finalizar-evento').addEventListener('click', finalizarEvento);
});

/* ------------------------------------------------------------
   MÓDULO 1: INICIALIZACIÓN Y ESTADO
------------------------------------------------------------ */
async function cargarCatalogoEnMemoria() {
    const { data, error } = await clienteSupabase
        .from('catalogo_marchas')
        .select('id_marcha, titulo');
    if (!error && data) catalogoCache = data;
}

async function comprobarEstadoSistema() {
    const { data, error } = await clienteSupabase
        .from('maestro_procesiones')
        .select('*')
        .eq('estado', 'Activa')
        .maybeSingle();

    if (data) {
        procesionActiva = data;
        activarModoInyeccion();
    } else {
        desactivarModoInyeccion();
    }
}

/* ------------------------------------------------------------
   MÓDULO 2: GESTIÓN DE LA INTERFAZ
------------------------------------------------------------ */
function activarModoInyeccion() {
    document.getElementById('form-nueva-procesion').style.display = 'none';
    const info = document.getElementById('info-procesion-activa');
    info.style.display = 'block';
    
    document.getElementById('txt-hermandad-activa').innerText = procesionActiva.hermandad;
    document.getElementById('txt-lugar-activa').innerText = `${procesionActiva.localidad} (${procesionActiva.tipo})`;
    
    document.getElementById('btn-finalizar-evento').style.display = 'block';
    document.getElementById('panel-inyeccion').style.opacity = "1";
    document.getElementById('panel-inyeccion').style.pointerEvents = "auto";

    // Lógica para el selector de fases
    const selectFase = document.getElementById('inp-fase-marcha');
    selectFase.innerHTML = ''; 
    
    if (procesionActiva.tipo === 'Semana Santa') {
        selectFase.innerHTML = `
            <option value="Ida">Ida</option>
            <option value="Carrera Oficial">Carrera Oficial</option>
            <option value="Vuelta">Vuelta</option>
        `;
    } else {
        selectFase.innerHTML = `
            <option value="Día">Día</option>
            <option value="Noche">Noche</option>
        `;
    }

    cargarHistorialTransaccional();
}

function desactivarModoInyeccion() {
    document.getElementById('form-nueva-procesion').style.display = 'block';
    document.getElementById('info-procesion-activa').style.display = 'none';
    document.getElementById('btn-finalizar-evento').style.display = 'none';
    document.getElementById('panel-inyeccion').style.opacity = "0.5";
    document.getElementById('panel-inyeccion').style.pointerEvents = "none";
}

/* ------------------------------------------------------------
   MÓDULO 3: CREACIÓN DE PROCESIÓN
------------------------------------------------------------ */
async function iniciarNuevaProcesion() {
    const hermandad = document.getElementById('adm-hermandad').value.trim();
    const localidad = document.getElementById('adm-localidad').value.trim();
    const fecha = document.getElementById('adm-fecha').value;
    const tipo = document.getElementById('adm-tipo').value;
    const inputArchivo = document.getElementById('adm-foto-archivo').files[0];

    if (!hermandad || !localidad || !fecha) return alert("Rellena los campos obligatorios.");

    let url_foto_final = '../img/foto-dashboard.jpg'; 

    try {
        const btnSend = document.querySelector('.btn-send');
        btnSend.innerText = "PROCESANDO...";
        btnSend.disabled = true;

        if (inputArchivo) {
            const extension = inputArchivo.name.split('.').pop();
            const nombreUnico = `procesion_${Date.now()}.${extension}`;

            const { data: uploadData, error: uploadError } = await clienteSupabase
                .storage
                .from('portadas')
                .upload(nombreUnico, inputArchivo);

            if (uploadError) throw new Error("Error al subir foto: " + uploadError.message);

            const { data: publicUrlData } = clienteSupabase
                .storage
                .from('portadas')
                .getPublicUrl(nombreUnico);

            url_foto_final = publicUrlData.publicUrl;
        }

        const { data, error } = await clienteSupabase
            .from('maestro_procesiones')
            .insert([{ 
                hermandad, localidad, fecha, tipo, 
                url_foto: url_foto_final, 
                estado: 'Activa' 
            }])
            .select().single();

        if (error) throw error;

        procesionActiva = data;
        activarModoInyeccion();

    } catch (e) {
        alert("Fallo al iniciar directo: " + e.message);
    } finally {
        const btnSend = document.querySelector('.btn-send');
        btnSend.innerText = "ACTIVAR DIRECTO";
        btnSend.disabled = false;
    }
}

/* ------------------------------------------------------------
   MÓDULO 4: INYECCIÓN DE MARCHAS Y EDICIÓN
------------------------------------------------------------ */
function autocompletarTitulo() {
    const inputId = parseInt(document.getElementById('inp-id-marcha').value);
    const inputTitulo = document.getElementById('inp-titulo-marcha');

    if (isNaN(inputId)) {
        inputTitulo.value = "";
        return;
    }

    const marchaEncontrada = catalogoCache.find(m => m.id_marcha === inputId);
    if (marchaEncontrada) {
        inputTitulo.value = marchaEncontrada.titulo;
        inputTitulo.style.color = "#27ae60";
    } else {
        inputTitulo.value = "⚠️ ID no registrado";
        inputTitulo.style.color = "#ff3b3b";
    }
}

// PREPARAR MODO EDICIÓN
window.prepararEdicion = function(orden, id_marcha, fase) {
    ordenEnEdicion = orden; 
    
    document.getElementById('inp-id-marcha').value = id_marcha;
    autocompletarTitulo(); 
    document.getElementById('inp-fase-marcha').value = fase;

    const btn = document.getElementById('btn-inyectar-marcha');
    if(btn) {
        btn.innerText = "ACTUALIZAR";
        btn.style.background = "#3498db"; 
        btn.style.color = "white";
    }
    
    document.getElementById('panel-inyeccion').scrollIntoView({ behavior: 'smooth' });
};

async function inyectarMarcha() {
    if (!procesionActiva) return alert("No hay proceso activo.");

    const inputId = parseInt(document.getElementById('inp-id-marcha').value);
    const fase = document.getElementById('inp-fase-marcha').value;
    const tituloInput = document.getElementById('inp-titulo-marcha').value;

    if (isNaN(inputId) || tituloInput.includes("⚠️") || tituloInput === "") {
        return alert("Introduce un ID de marcha válido.");
    }

    try {
        if (ordenEnEdicion !== null) {
            // ==========================================
            // MODO EDICIÓN BLINDADO: Obligamos a devolver resultado (.select())
            // ==========================================
            const { data, error } = await clienteSupabase
                .from('repertorio_transaccional')
                .update({ 
                    id_marcha: inputId, 
                    fase: fase 
                })
                .eq('id_procesion', procesionActiva.id_procesion)
                .eq('orden', ordenEnEdicion)
                .select(); // <-- Esto comprueba si de verdad Supabase guardó el cambio

            if (error) throw error;
            
            // Si data está vacío, es que Supabase nos bloqueó (RLS o falta de Primary Key)
            if (!data || data.length === 0) {
                return alert("⚠️ Supabase ha bloqueado el cambio en la base de datos. Revisa en Supabase que la tabla tiene una 'Primary Key' asignada y que tienes activado el permiso UPDATE en las políticas RLS.");
            }
            
            ordenEnEdicion = null;
            const btn = document.getElementById('btn-inyectar-marcha');
            if(btn) {
                btn.innerText = "Añadir";
                btn.style.background = "var(--color-oro)";
                btn.style.color = "black";
            }
            
        } else {
            // ==========================================
            // MODO CREACIÓN NORMAL
            // ==========================================
            const { error } = await clienteSupabase
                .from('repertorio_transaccional')
                .insert([{ 
                    id_procesion: procesionActiva.id_procesion, 
                    id_marcha: inputId, 
                    fase: fase, 
                    orden: contadorOrden 
                }]);

            if (error) throw error;
        }

        document.getElementById('inp-id-marcha').value = '';
        document.getElementById('inp-titulo-marcha').value = '';
        document.getElementById('inp-id-marcha').focus();

        cargarHistorialTransaccional();

    } catch (e) {
        alert("Error al guardar marcha: " + e.message);
    }
}

async function cargarHistorialTransaccional() {
    if (!procesionActiva) return;

    const { data, error } = await clienteSupabase
        .from('repertorio_transaccional')
        .select('*')
        .eq('id_procesion', procesionActiva.id_procesion)
        .order('orden', { ascending: true });

    if (error) return;

    const tbody = document.getElementById('tabla-historial-body');
    tbody.innerHTML = '';
    
    contadorOrden = data.length > 0 ? data[data.length - 1].orden + 1 : 1;

    data.forEach(reg => {
        const marcha = catalogoCache.find(m => m.id_marcha === reg.id_marcha);
        const nombreMostrar = marcha ? marcha.titulo : `ID: ${reg.id_marcha}`;

        tbody.innerHTML += `
            <tr>
                <td class="col-num">#${reg.orden}</td>
                <td class="col-marcha">${nombreMostrar}</td>
                <td class="col-fase">${reg.fase}</td>
                <td class="col-acciones">
                    <button class="btn-editar-fila" title="Editar marcha" onclick="prepararEdicion(${reg.orden}, ${reg.id_marcha}, '${reg.fase}')">✏️</button>
                </td>
            </tr>
        `;
    });
}

/* ------------------------------------------------------------
   MÓDULO 5: FINALIZAR EVENTO
------------------------------------------------------------ */
async function finalizarEvento() {
    if (!procesionActiva) return;
    if (!confirm("¿Finalizar el evento? Se guardará en el histórico.")) return;

    try {
        const { error } = await clienteSupabase
            .from('maestro_procesiones')
            .update({ estado: 'Finalizada' })
            .eq('id_procesion', procesionActiva.id_procesion);

        if (error) throw error;
        window.location.reload();

    } catch (e) {
        alert("Error al finalizar: " + e.message);
    }
}