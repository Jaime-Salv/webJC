/* ============================================================
   CONSOLA DE ADMINISTRACIÓN COMPLETA - WEB JULIÁN CERDÁN
   ============================================================ */

let procesionActiva = null;
let catalogoCache = [];
let contadorOrden = 1;
let ordenEnEdicion = null;

let usuarioActual = null;
let perfilActual = null;
let marchaFichaActual = null;

let conciertoAdminActual = null;
let conciertosAdminCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    const accesoPermitido = await comprobarAccesoAdmin();

    if (!accesoPermitido) {
        return;
    }

    await cargarCatalogoEnMemoria();
    await comprobarEstadoSistema();
    await cargarUsuariosAdmin();
    await cargarConciertosAdmin();
    prepararNavegacionAdmin();
    await actualizarResumenAdmin();

    const inputIdMarcha = document.getElementById('inp-id-marcha');
    const inputTituloMarcha = document.getElementById('inp-titulo-marcha');
    const btnFinalizarEvento = document.getElementById('btn-finalizar-evento');
    const btnDescartarEvento = document.getElementById('btn-descartar-evento');
    const btnProbarNotificacion = document.getElementById('btn-probar-notificacion');
    const inputFichaIdMarcha = document.getElementById('ficha-id-marcha');

    if (inputIdMarcha) {
        inputIdMarcha.addEventListener('input', autocompletarTitulo);
    }

    if (inputTituloMarcha) {
        inputTituloMarcha.addEventListener('input', () => {
            inputTituloMarcha.style.color = 'var(--color-oro)';
        });

        inputTituloMarcha.addEventListener('keydown', (evento) => {
            if (evento.key === 'Enter') {
                evento.preventDefault();
                inyectarMarcha();
            }
        });
    }

    if (btnFinalizarEvento) {
        btnFinalizarEvento.addEventListener('click', finalizarEvento);
    }

    if (btnDescartarEvento) {
        btnDescartarEvento.addEventListener('click', descartarEvento);
    }

    if (btnProbarNotificacion) {
        btnProbarNotificacion.addEventListener('click', probarNotificacionDirecto);
    }

    if (inputFichaIdMarcha) {
        inputFichaIdMarcha.addEventListener('keydown', (evento) => {
            if (evento.key === 'Enter') {
                buscarMarchaParaFicha();
            }
        });
    }
});

/* ------------------------------------------------------------
   NAVEGACIÓN Y RESUMEN DE LA CONSOLA
------------------------------------------------------------ */

function prepararNavegacionAdmin() {
    const botones = document.querySelectorAll('[data-admin-target]');
    const accesosRapidos = document.querySelectorAll('[data-admin-go]');

    botones.forEach((boton) => {
        boton.addEventListener('click', () => mostrarVistaAdmin(boton.dataset.adminTarget));
    });

    accesosRapidos.forEach((boton) => {
        boton.addEventListener('click', () => mostrarVistaAdmin(boton.dataset.adminGo));
    });

    const nombreAdmin = perfilActual?.username || usuarioActual?.email?.split('@')[0] || 'Administrador';
    const etiquetaNombre = document.getElementById('admin-sidebar-name');
    if (etiquetaNombre) etiquetaNombre.textContent = nombreAdmin;

    const vistaInicial = window.location.hash.replace('#', '');
    const vistaValida = document.querySelector(`[data-admin-view="${vistaInicial}"]`);

    if (vistaInicial && vistaValida) {
        mostrarVistaAdmin(vistaInicial, false);
    }
}

function mostrarVistaAdmin(nombreVista, actualizarHash = true) {
    const vista = document.querySelector(`[data-admin-view="${nombreVista}"]`);
    if (!vista) return;

    document.querySelectorAll('[data-admin-view]').forEach((seccion) => {
        seccion.classList.toggle('activa', seccion === vista);
    });

    document.querySelectorAll('[data-admin-target]').forEach((boton) => {
        boton.classList.toggle('activo', boton.dataset.adminTarget === nombreVista);
    });

    if (actualizarHash) {
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}#${nombreVista}`);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function actualizarResumenAdmin() {
    const resumenCatalogo = document.getElementById('resumen-catalogo');
    const resumenConciertos = document.getElementById('resumen-conciertos');
    const detalleConciertos = document.getElementById('resumen-conciertos-detalle');
    const resumenUsuarios = document.getElementById('resumen-usuarios');

    if (resumenCatalogo) resumenCatalogo.textContent = catalogoCache.length;
    if (resumenConciertos) resumenConciertos.textContent = conciertosAdminCache.length;

    const publicados = conciertosAdminCache.filter((concierto) => concierto.estado === 'Publicado').length;
    const borradores = conciertosAdminCache.filter((concierto) => concierto.estado === 'Borrador').length;

    if (detalleConciertos) {
        detalleConciertos.textContent = `${publicados} publicados · ${borradores} borradores`;
    }

    try {
        const { count } = await clienteSupabase
            .from('perfiles')
            .select('*', { count: 'exact', head: true });

        if (resumenUsuarios) resumenUsuarios.textContent = count || 0;
    } catch (error) {
        if (resumenUsuarios) resumenUsuarios.textContent = '--';
    }

    actualizarEstadoDirectoAdmin();
}

function actualizarEstadoDirectoAdmin() {
    const resumen = document.getElementById('resumen-directo');
    const detalle = document.getElementById('resumen-directo-detalle');
    const estado = document.getElementById('admin-live-status');

    if (procesionActiva) {
        if (resumen) resumen.textContent = 'Activo';
        if (detalle) detalle.textContent = `${procesionActiva.hermandad} · ${procesionActiva.localidad}`;
        if (estado) {
            estado.textContent = `● ${procesionActiva.hermandad}`;
            estado.classList.add('activo');
        }
    } else {
        if (resumen) resumen.textContent = 'Inactivo';
        if (detalle) detalle.textContent = 'No hay ninguna actuación activa.';
        if (estado) {
            estado.textContent = '● Sin señal activa';
            estado.classList.remove('activo');
        }
    }
}

/* ------------------------------------------------------------
   MÓDULO 0: SEGURIDAD DE ACCESO ADMIN
------------------------------------------------------------ */

async function comprobarAccesoAdmin() {
    try {
        bloquearPantallaAdmin('Comprobando permisos...');

        const { data: sesionData, error: errorSesion } = await clienteSupabase.auth.getSession();

        if (errorSesion) {
            console.error('Error comprobando sesión:', errorSesion);
            mostrarAccesoDenegado('No se ha podido comprobar la sesión.');
            return false;
        }

        const session = sesionData.session;

        if (!session) {
            mostrarAccesoDenegado('Debes iniciar sesión para acceder al panel de administración.');
            setTimeout(() => {
                window.location.href = './login.html';
            }, 1800);
            return false;
        }

        usuarioActual = session.user;

        const { data: perfil, error: errorPerfil } = await clienteSupabase
            .from('perfiles')
            .select('id, username, rol')
            .eq('id', session.user.id)
            .maybeSingle();

        if (errorPerfil) {
            console.error('Error obteniendo perfil:', errorPerfil);
            mostrarAccesoDenegado('No se ha podido comprobar tu perfil.');
            return false;
        }

        if (!perfil) {
            mostrarAccesoDenegado('Tu usuario no tiene perfil asociado.');
            return false;
        }

        perfilActual = perfil;

        if (perfil.rol !== 'admin') {
            mostrarAccesoDenegado('No tienes permisos para acceder al panel de administración.');
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 2200);
            return false;
        }

        desbloquearPantallaAdmin();
        return true;

    } catch (error) {
        console.error('Error inesperado comprobando acceso admin:', error);
        mostrarAccesoDenegado('Error inesperado comprobando permisos.');
        return false;
    }
}

function bloquearPantallaAdmin(mensaje) {
    let bloqueo = document.getElementById('bloqueo-admin');

    if (!bloqueo) {
        bloqueo = document.createElement('div');
        bloqueo.id = 'bloqueo-admin';
        bloqueo.style.position = 'fixed';
        bloqueo.style.inset = '0';
        bloqueo.style.zIndex = '99999';
        bloqueo.style.background = 'rgba(5, 5, 5, 0.98)';
        bloqueo.style.color = '#d4af37';
        bloqueo.style.display = 'flex';
        bloqueo.style.alignItems = 'center';
        bloqueo.style.justifyContent = 'center';
        bloqueo.style.textAlign = 'center';
        bloqueo.style.padding = '30px';
        bloqueo.style.fontFamily = 'Montserrat, sans-serif';
        bloqueo.style.fontWeight = '900';
        bloqueo.style.letterSpacing = '1px';
        bloqueo.style.textTransform = 'uppercase';

        document.body.appendChild(bloqueo);
    }

    bloqueo.textContent = mensaje;
}

function desbloquearPantallaAdmin() {
    const bloqueo = document.getElementById('bloqueo-admin');

    if (bloqueo) {
        bloqueo.remove();
    }
}

function mostrarAccesoDenegado(mensaje) {
    bloquearPantallaAdmin(mensaje);
}

/* ------------------------------------------------------------
   MÓDULO 1: INICIALIZACIÓN Y ESTADO
------------------------------------------------------------ */

async function cargarCatalogoEnMemoria() {
    const { data, error } = await clienteSupabase
        .from('catalogo_marchas')
        .select('id_marcha, titulo');

    if (error) {
        console.error('Error cargando catálogo:', error);
        catalogoCache = [];
        return;
    }

    catalogoCache = data || [];
}

async function comprobarEstadoSistema() {
    const { data, error } = await clienteSupabase
        .from('maestro_procesiones')
        .select('*')
        .eq('estado', 'Activa')
        .maybeSingle();

    if (error) {
        console.error('Error comprobando procesión activa:', error);
        desactivarModoInyeccion();
        return;
    }

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
    const formNuevaProcesion = document.getElementById('form-nueva-procesion');
    const info = document.getElementById('info-procesion-activa');
    const txtHermandad = document.getElementById('txt-hermandad-activa');
    const txtLugar = document.getElementById('txt-lugar-activa');
    const btnFinalizar = document.getElementById('btn-finalizar-evento');
    const btnDescartar = document.getElementById('btn-descartar-evento');
    const panelInyeccion = document.getElementById('panel-inyeccion');
    const selectFase = document.getElementById('inp-fase-marcha');

    if (formNuevaProcesion) formNuevaProcesion.style.display = 'none';
    if (info) info.style.display = 'block';

    if (txtHermandad) {
        txtHermandad.innerText = procesionActiva.hermandad;
    }

    if (txtLugar) {
        txtLugar.innerText = `${procesionActiva.localidad} (${procesionActiva.tipo})`;
    }

    if (btnFinalizar) {
        btnFinalizar.style.display = 'block';
    }

    if (btnDescartar) {
        btnDescartar.style.display = 'block';
    }

    if (panelInyeccion) {
        panelInyeccion.style.opacity = '1';
        panelInyeccion.style.pointerEvents = 'auto';
    }

    if (selectFase) {
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
    }

    cargarHistorialTransaccional();
    actualizarEstadoDirectoAdmin();
}

function desactivarModoInyeccion() {
    const formNuevaProcesion = document.getElementById('form-nueva-procesion');
    const info = document.getElementById('info-procesion-activa');
    const btnFinalizar = document.getElementById('btn-finalizar-evento');
    const btnDescartar = document.getElementById('btn-descartar-evento');
    const panelInyeccion = document.getElementById('panel-inyeccion');

    if (formNuevaProcesion) formNuevaProcesion.style.display = 'block';
    if (info) info.style.display = 'none';
    if (btnFinalizar) btnFinalizar.style.display = 'none';
    if (btnDescartar) btnDescartar.style.display = 'none';

    if (panelInyeccion) {
        panelInyeccion.style.opacity = '0.5';
        panelInyeccion.style.pointerEvents = 'none';
    }

    actualizarEstadoDirectoAdmin();
}

/* ------------------------------------------------------------
   MÓDULO 3: CREACIÓN DE PROCESIÓN
------------------------------------------------------------ */

async function iniciarNuevaProcesion() {
    const hermandad = document.getElementById('adm-hermandad')?.value.trim();
    const localidad = document.getElementById('adm-localidad')?.value.trim();
    const fecha = document.getElementById('adm-fecha')?.value;
    const tipo = document.getElementById('adm-tipo')?.value;
    const inputArchivo = document.getElementById('adm-foto-archivo')?.files?.[0];

    if (!hermandad || !localidad || !fecha) {
        alert('Rellena los campos obligatorios.');
        return;
    }

    let url_foto_final = '../img/foto-dashboard.jpg';

    try {
        const btnSend = document.querySelector('#form-nueva-procesion .btn-send');

        if (btnSend) {
            btnSend.innerText = 'PROCESANDO...';
            btnSend.disabled = true;
        }

        if (inputArchivo) {
            const extension = inputArchivo.name.split('.').pop();
            const nombreUnico = `procesion_${Date.now()}.${extension}`;

            const { error: uploadError } = await clienteSupabase
                .storage
                .from('portadas')
                .upload(nombreUnico, inputArchivo);

            if (uploadError) {
                throw new Error('Error al subir foto: ' + uploadError.message);
            }

            const { data: publicUrlData } = clienteSupabase
                .storage
                .from('portadas')
                .getPublicUrl(nombreUnico);

            url_foto_final = publicUrlData.publicUrl;
        }

        const { data, error } = await clienteSupabase
            .from('maestro_procesiones')
            .insert([{
                hermandad,
                localidad,
                fecha,
                tipo,
                url_foto: url_foto_final,
                estado: 'Activa'
            }])
            .select()
            .single();

        if (error) {
            throw error;
        }

        procesionActiva = data;
        activarModoInyeccion();
        await enviarAvisoInicioDirecto(data);

    } catch (error) {
        alert('Fallo al iniciar directo: ' + error.message);
    } finally {
        const btnSend = document.querySelector('#form-nueva-procesion .btn-send');

        if (btnSend) {
            btnSend.innerText = 'ACTIVAR DIRECTO';
            btnSend.disabled = false;
        }
    }
}

async function enviarAvisoInicioDirecto(procesion) {
    const estado = document.getElementById('estado-push-admin');

    try {
        const { data: sesionData } = await clienteSupabase.auth.getSession();
        const token = sesionData.session?.access_token;
        if (!token) return;

        const respuesta = await fetch('/.netlify/functions/push-live', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                idProcesion: procesion.id_procesion,
                hermandad: procesion.hermandad,
                localidad: procesion.localidad
            })
        });

        const resultado = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            const detalle = resultado.detail || resultado.error || `Error HTTP ${respuesta.status}`;
            actualizarEstadoPushAdmin(`El directo se activó, pero el aviso falló: ${detalle}`, true);
            return;
        }

        mostrarResultadoEnvioPush(resultado, 'Aviso de directo');
    } catch (error) {
        // La activación del directo no debe fallar si el servicio push no está disponible.
        console.warn('No se han podido enviar los avisos de directo:', error);
        actualizarEstadoPushAdmin(`No se ha podido contactar con el servicio de avisos: ${error.message}`, true);
    }
}

async function probarNotificacionDirecto() {
    const boton = document.getElementById('btn-probar-notificacion');

    try {
        if (boton) {
            boton.disabled = true;
            boton.textContent = 'Enviando prueba...';
        }

        actualizarEstadoPushAdmin('Contactando con el servicio de notificaciones...');

        const { data: sesionData } = await clienteSupabase.auth.getSession();
        const token = sesionData.session?.access_token;

        if (!token) {
            throw new Error('No hay una sesión de administrador válida.');
        }

        const respuesta = await fetch('/.netlify/functions/push-live', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({
                idProcesion: 'prueba',
                hermandad: 'Notificación de prueba',
                localidad: 'Banda de Música Julián Cerdán',
                prueba: true
            })
        });

        const resultado = await respuesta.json().catch(() => ({}));

        if (!respuesta.ok) {
            throw new Error(resultado.detail || resultado.error || `Error HTTP ${respuesta.status}`);
        }

        mostrarResultadoEnvioPush(resultado, 'Prueba');
    } catch (error) {
        actualizarEstadoPushAdmin(`Prueba fallida: ${error.message}`, true);
    } finally {
        if (boton) {
            boton.disabled = false;
            boton.textContent = 'Probar notificación';
        }
    }
}

function mostrarResultadoEnvioPush(resultado, prefijo) {
    const total = Number(resultado.totalSubscriptions) || 0;
    const enviados = Number(resultado.sent) || 0;
    const fallidos = Number(resultado.failed) || 0;
    const eliminados = Number(resultado.removed) || 0;

    if (total === 0) {
        actualizarEstadoPushAdmin(
            `${prefijo}: no hay suscripciones guardadas en Supabase. Activa primero los avisos desde el móvil.`,
            true
        );
        return;
    }

    if (enviados > 0 && fallidos === 0) {
        actualizarEstadoPushAdmin(
            `${prefijo}: ${enviados} notificación${enviados === 1 ? '' : 'es'} enviada${enviados === 1 ? '' : 's'} correctamente.`,
            false,
            true
        );
        return;
    }

    const primerError = resultado.errors?.[0];
    const detalle = primerError
        ? ` Código ${primerError.statusCode || '--'}: ${primerError.message}`
        : '';

    actualizarEstadoPushAdmin(
        `${prefijo}: ${enviados} enviadas, ${fallidos} fallidas y ${eliminados} suscripciones caducadas eliminadas.${detalle}`,
        true
    );
}

function actualizarEstadoPushAdmin(mensaje, esError = false, esCorrecto = false) {
    const estado = document.getElementById('estado-push-admin');
    if (!estado) return;

    estado.textContent = mensaje;
    estado.classList.toggle('error', esError);
    estado.classList.toggle('correcto', esCorrecto);
}

/* ------------------------------------------------------------
   MÓDULO 4: INYECCIÓN DE MARCHAS Y EDICIÓN
------------------------------------------------------------ */

function autocompletarTitulo() {
    const inputId = parseInt(document.getElementById('inp-id-marcha')?.value);
    const inputTitulo = document.getElementById('inp-titulo-marcha');

    if (!inputTitulo) {
        return;
    }

    if (isNaN(inputId)) {
        inputTitulo.style.color = 'var(--color-oro)';
        return;
    }

    const marchaEncontrada = catalogoCache.find((marcha) => marcha.id_marcha === inputId);

    if (marchaEncontrada) {
        inputTitulo.value = marchaEncontrada.titulo;
        inputTitulo.style.color = '#27ae60';
    } else {
        inputTitulo.value = '';
        inputTitulo.placeholder = 'ID no registrado: escribe el título para crearlo';
        inputTitulo.style.color = '#ff3b3b';
    }
}

function normalizarTituloCatalogo(titulo) {
    return String(titulo || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es');
}

async function obtenerOCrearMarcha(idIntroducido, tituloIntroducido) {
    if (Number.isInteger(idIntroducido)) {
        const marchaPorId = catalogoCache.find((marcha) => Number(marcha.id_marcha) === idIntroducido);

        if (marchaPorId) return marchaPorId;
    }

    const titulo = String(tituloIntroducido || '').trim();

    if (!titulo) {
        throw new Error('Escribe un título o introduce el ID de una marcha existente.');
    }

    const tituloNormalizado = normalizarTituloCatalogo(titulo);
    const marchaExistente = catalogoCache.find((marcha) => {
        return normalizarTituloCatalogo(marcha.titulo) === tituloNormalizado;
    });

    if (marchaExistente) return marchaExistente;

    const nuevaMarcha = { titulo };

    if (Number.isInteger(idIntroducido)) {
        nuevaMarcha.id_marcha = idIntroducido;
    }

    const { data, error } = await clienteSupabase
        .from('catalogo_marchas')
        .insert([nuevaMarcha])
        .select('id_marcha, titulo')
        .single();

    if (error) {
        throw new Error(`No se ha podido crear la marcha: ${error.message}`);
    }

    catalogoCache.push(data);
    return data;
}

window.prepararEdicion = function(orden, id_marcha, fase) {
    ordenEnEdicion = orden;

    const inputId = document.getElementById('inp-id-marcha');
    const selectFase = document.getElementById('inp-fase-marcha');
    const btn = document.getElementById('btn-inyectar-marcha');
    const panel = document.getElementById('panel-inyeccion');

    if (inputId) {
        inputId.value = id_marcha;
    }

    autocompletarTitulo();

    if (selectFase) {
        selectFase.value = fase;
    }

    if (btn) {
        btn.innerText = 'ACTUALIZAR';
        btn.style.background = '#3498db';
        btn.style.color = 'white';
    }

    if (panel) {
        panel.scrollIntoView({ behavior: 'smooth' });
    }
};

async function inyectarMarcha() {
    if (!procesionActiva) {
        alert('No hay proceso activo.');
        return;
    }

    const inputId = parseInt(document.getElementById('inp-id-marcha')?.value, 10);
    const fase = document.getElementById('inp-fase-marcha')?.value;
    const tituloInput = document.getElementById('inp-titulo-marcha')?.value?.trim() || '';

    if (ordenEnEdicion !== null && isNaN(inputId)) {
        alert('Para editar una marcha del directo, introduce un ID válido.');
        return;
    }

    if (isNaN(inputId) && !tituloInput) {
        alert('Escribe el título de la marcha. El ID es opcional.');
        return;
    }

    try {
        const marcha = await obtenerOCrearMarcha(
            Number.isInteger(inputId) ? inputId : null,
            tituloInput
        );
        const idMarcha = Number(marcha.id_marcha);

        if (ordenEnEdicion !== null) {
            const { data, error } = await clienteSupabase
                .from('repertorio_transaccional')
                .update({
                    id_marcha: idMarcha,
                    fase: fase
                })
                .eq('id_procesion', procesionActiva.id_procesion)
                .eq('orden', ordenEnEdicion)
                .select();

            if (error) {
                throw error;
            }

            if (!data || data.length === 0) {
                alert("⚠️ Supabase ha bloqueado el cambio. Revisa la Primary Key y las políticas UPDATE.");
                return;
            }

            ordenEnEdicion = null;

            const btn = document.getElementById('btn-inyectar-marcha');

            if (btn) {
                btn.innerText = 'Añadir';
                btn.style.background = 'var(--color-oro)';
                btn.style.color = 'black';
            }

        } else {
            const { error } = await clienteSupabase
                .from('repertorio_transaccional')
                .insert([{
                    id_procesion: procesionActiva.id_procesion,
                    id_marcha: idMarcha,
                    fase: fase,
                    orden: contadorOrden
                }]);

            if (error) {
                throw error;
            }
        }

        const inputIdMarcha = document.getElementById('inp-id-marcha');
        const inputTituloMarcha = document.getElementById('inp-titulo-marcha');

        if (inputIdMarcha) {
            inputIdMarcha.value = '';
            inputIdMarcha.focus();
        }

        if (inputTituloMarcha) {
            inputTituloMarcha.value = '';
            inputTituloMarcha.placeholder = 'Título de la marcha';
            inputTituloMarcha.style.color = 'var(--color-oro)';
        }

        cargarHistorialTransaccional();

    } catch (error) {
        alert('Error al guardar marcha: ' + error.message);
    }
}

async function cargarHistorialTransaccional() {
    if (!procesionActiva) {
        return;
    }

    const { data, error } = await clienteSupabase
        .from('repertorio_transaccional')
        .select('*')
        .eq('id_procesion', procesionActiva.id_procesion)
        .order('orden', { ascending: true });

    if (error) {
        console.error('Error cargando historial:', error);
        return;
    }

    const tbody = document.getElementById('tabla-historial-body');

    if (!tbody) {
        return;
    }

    tbody.innerHTML = '';

    contadorOrden = data.length > 0 ? data[data.length - 1].orden + 1 : 1;

    data.forEach((registro) => {
        const marcha = catalogoCache.find((item) => item.id_marcha === registro.id_marcha);
        const nombreMostrar = marcha ? marcha.titulo : `ID: ${registro.id_marcha}`;

        tbody.innerHTML += `
            <tr>
                <td class="col-num">#${registro.orden}</td>
                <td class="col-marcha">${escaparHTML(nombreMostrar)}</td>
                <td class="col-fase">${escaparHTML(registro.fase)}</td>
                <td class="col-acciones">
                    <button class="btn-editar-fila" title="Editar marcha" onclick="prepararEdicion(${registro.orden}, ${registro.id_marcha}, '${escaparAtributo(registro.fase)}')">✏️</button>
                </td>
            </tr>
        `;
    });
}

/* ------------------------------------------------------------
   MÓDULO 5: GESTIÓN DE USUARIOS Y ROLES
------------------------------------------------------------ */

async function cargarUsuariosAdmin() {
    const contenedor = document.getElementById('tabla-usuarios-admin');

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = `<p style="color:#999;">Cargando usuarios...</p>`;

    const { data, error } = await clienteSupabase
        .from('perfiles')
        .select('id, username, nombre_completo, email, rol, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error cargando usuarios:', error);
        contenedor.innerHTML = `<p style="color:#ff7070;">No se han podido cargar los usuarios.</p>`;
        return;
    }

    if (!data || data.length === 0) {
        contenedor.innerHTML = `<p style="color:#999;">Todavía no hay usuarios registrados.</p>`;
        return;
    }

    let html = `
        <div style="overflow-x:auto;">
            <table style="width:100%; border-collapse:collapse; font-size:0.85rem;">
                <thead>
                    <tr style="border-bottom:1px solid rgba(212,175,55,0.35); color:#d4af37; text-align:left;">
                        <th style="padding:10px;">Usuario</th>
                        <th style="padding:10px;">Email</th>
                        <th style="padding:10px;">Rol actual</th>
                        <th style="padding:10px;">Acción</th>
                    </tr>
                </thead>
                <tbody>
    `;

    data.forEach((usuario) => {
        const nombreVisible = usuario.nombre_completo || usuario.username || 'Sin nombre';
        const emailVisible = usuario.email || 'Sin email';
        const rolActual = usuario.rol || 'usuario';
        const esMiUsuario = usuarioActual && usuario.id === usuarioActual.id;

        html += `
            <tr style="border-bottom:1px solid rgba(255,255,255,0.08);">
                <td style="padding:10px; color:white;">${escaparHTML(nombreVisible)}</td>
                <td style="padding:10px; color:#aaa;">${escaparHTML(emailVisible)}</td>
                <td style="padding:10px;">
                    <span style="color:${rolActual === 'admin' ? '#d4af37' : '#ccc'}; font-weight:bold;">
                        ${escaparHTML(rolActual)}
                    </span>
                </td>
                <td style="padding:10px;">
                    ${
                        esMiUsuario
                            ? `<span style="color:#777;">Tu usuario</span>`
                            : `
                                <button
                                    onclick="cambiarRolUsuario('${usuario.id}', '${rolActual === 'admin' ? 'usuario' : 'admin'}')"
                                    style="
                                        background:${rolActual === 'admin' ? '#333' : '#d4af37'};
                                        color:${rolActual === 'admin' ? '#fff' : '#000'};
                                        border:1px solid rgba(212,175,55,0.5);
                                        padding:8px 12px;
                                        border-radius:4px;
                                        cursor:pointer;
                                        font-weight:bold;
                                    "
                                >
                                    ${rolActual === 'admin' ? 'Quitar admin' : 'Hacer admin'}
                                </button>
                            `
                    }
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    contenedor.innerHTML = html;
}

async function cambiarRolUsuario(idUsuario, nuevoRol) {
    if (!idUsuario || !nuevoRol) {
        alert('Datos de usuario no válidos.');
        return;
    }

    if (!['usuario', 'admin'].includes(nuevoRol)) {
        alert('Rol no permitido.');
        return;
    }

    const confirmar = confirm(`¿Seguro que quieres cambiar este usuario a rol "${nuevoRol}"?`);

    if (!confirmar) {
        return;
    }

    const { error } = await clienteSupabase
        .from('perfiles')
        .update({
            rol: nuevoRol,
            updated_at: new Date().toISOString()
        })
        .eq('id', idUsuario);

    if (error) {
        console.error('Error cambiando rol:', error);
        alert('No se ha podido cambiar el rol.');
        return;
    }

    alert('Rol actualizado correctamente.');
    await cargarUsuariosAdmin();
}

/* ------------------------------------------------------------
   MÓDULO 6: GESTIÓN DE FICHA MUSICAL DE MARCHAS
   Bucket Supabase Storage: mp3
------------------------------------------------------------ */

async function buscarMarchaParaFicha() {
    const inputId = document.getElementById('ficha-id-marcha');
    const estado = document.getElementById('estado-guardado-ficha');

    if (!inputId) {
        alert('No se encuentra el campo de ID de marcha.');
        return;
    }

    const idMarcha = Number(inputId.value);

    if (!idMarcha || idMarcha <= 0) {
        alert('Introduce un ID de marcha válido.');
        return;
    }

    if (estado) {
        estado.style.color = '#aaa';
        estado.textContent = 'Buscando marcha...';
    }

    const { data, error } = await clienteSupabase
        .from('catalogo_marchas')
        .select('id_marcha, titulo, autor, url_audio, url_youtube, spotify_uri, url_patrimonio')
        .eq('id_marcha', idMarcha)
        .maybeSingle();

    if (error) {
        console.error('Error buscando marcha:', error);

        if (estado) {
            estado.style.color = '#ff7070';
            estado.textContent = 'No se ha podido buscar la marcha.';
        }

        return;
    }

    if (!data) {
        marchaFichaActual = null;
        limpiarFichaMusical();

        if (estado) {
            estado.style.color = '#ff7070';
            estado.textContent = 'No existe ninguna marcha con ese ID.';
        }

        return;
    }

    marchaFichaActual = data;
    pintarFichaMusical(data);

    if (estado) {
        estado.style.color = '#d4af37';
        estado.textContent = 'Marcha cargada. Puedes editar MP3, YouTube, Spotify y Patrimonio Musical.';
    }
}

function limpiarFichaMusical() {
    const resultado = document.getElementById('resultado-ficha-marcha');
    const titulo = document.getElementById('ficha-titulo-detectado');
    const autor = document.getElementById('ficha-autor-detectado');
    const audioActual = document.getElementById('ficha-audio-actual');
    const youtubeActual = document.getElementById('ficha-youtube-actual');
    const spotifyActual = document.getElementById('ficha-spotify-actual');
    const patrimonioActual = document.getElementById('ficha-patrimonio-actual');
    const inputYoutube = document.getElementById('ficha-url-youtube');
    const inputSpotify = document.getElementById('ficha-spotify-uri');
    const inputPatrimonio = document.getElementById('ficha-url-patrimonio');
    const inputAudio = document.getElementById('ficha-audio-mp3');

    if (resultado) resultado.classList.remove('activo');
    if (titulo) titulo.textContent = '--';
    if (autor) autor.textContent = '--';
    if (audioActual) audioActual.textContent = 'Sin audio interno.';
    if (youtubeActual) youtubeActual.textContent = 'Sin enlace de YouTube.';
    if (spotifyActual) spotifyActual.textContent = 'Sin URI de Spotify.';
    if (patrimonioActual) patrimonioActual.textContent = 'Sin enlace de Patrimonio Musical.';
    if (inputYoutube) inputYoutube.value = '';
    if (inputSpotify) inputSpotify.value = '';
    if (inputPatrimonio) inputPatrimonio.value = '';
    if (inputAudio) inputAudio.value = '';
}

function pintarFichaMusical(marcha) {
    const resultado = document.getElementById('resultado-ficha-marcha');
    const titulo = document.getElementById('ficha-titulo-detectado');
    const autor = document.getElementById('ficha-autor-detectado');
    const audioActual = document.getElementById('ficha-audio-actual');
    const youtubeActual = document.getElementById('ficha-youtube-actual');
    const spotifyActual = document.getElementById('ficha-spotify-actual');
    const patrimonioActual = document.getElementById('ficha-patrimonio-actual');
    const inputYoutube = document.getElementById('ficha-url-youtube');
    const inputSpotify = document.getElementById('ficha-spotify-uri');
    const inputPatrimonio = document.getElementById('ficha-url-patrimonio');
    const inputAudio = document.getElementById('ficha-audio-mp3');

    if (resultado) resultado.classList.add('activo');

    if (titulo) {
        titulo.textContent = marcha.titulo || 'Sin título';
    }

    if (autor) {
        autor.textContent = marcha.autor || 'Autor desconocido';
    }

    if (audioActual) {
        audioActual.innerHTML = '';

        if (marcha.url_audio) {
            const enlace = document.createElement('a');
            enlace.href = marcha.url_audio;
            enlace.target = '_blank';
            enlace.rel = 'noopener noreferrer';
            enlace.textContent = marcha.url_audio;
            enlace.style.color = '#d4af37';

            const audio = document.createElement('audio');
            audio.controls = true;
            audio.preload = 'none';
            audio.src = marcha.url_audio;
            audio.className = 'preview-audio-admin';

            audioActual.appendChild(enlace);
            audioActual.appendChild(audio);
        } else {
            audioActual.textContent = 'Sin audio interno.';
        }
    }

    pintarEnlaceActual(youtubeActual, marcha.url_youtube, 'Sin enlace de YouTube.');
    pintarTextoActual(spotifyActual, marcha.spotify_uri, 'Sin URI de Spotify.');
    pintarEnlaceActual(patrimonioActual, marcha.url_patrimonio, 'Sin enlace de Patrimonio Musical.');

    if (inputYoutube) {
        inputYoutube.value = marcha.url_youtube || '';
    }

    if (inputSpotify) {
        inputSpotify.value = marcha.spotify_uri || '';
    }

    if (inputPatrimonio) {
        inputPatrimonio.value = marcha.url_patrimonio || '';
    }

    if (inputAudio) {
        inputAudio.value = '';
    }
}

function pintarEnlaceActual(contenedor, url, mensajeVacio) {
    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = '';

    if (url) {
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.target = '_blank';
        enlace.rel = 'noopener noreferrer';
        enlace.textContent = url;
        enlace.style.color = '#d4af37';

        contenedor.appendChild(enlace);
    } else {
        contenedor.textContent = mensajeVacio;
    }
}

function pintarTextoActual(contenedor, texto, mensajeVacio) {
    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = '';

    if (texto) {
        const span = document.createElement('span');
        span.textContent = texto;
        span.style.color = '#d4af37';
        contenedor.appendChild(span);
    } else {
        contenedor.textContent = mensajeVacio;
    }
}

async function guardarFichaMusicalMarcha() {
    const estado = document.getElementById('estado-guardado-ficha');
    const inputAudio = document.getElementById('ficha-audio-mp3');
    const inputYoutube = document.getElementById('ficha-url-youtube');
    const inputSpotify = document.getElementById('ficha-spotify-uri');
    const inputPatrimonio = document.getElementById('ficha-url-patrimonio');

    if (!marchaFichaActual) {
        alert('Primero busca una marcha por ID.');
        return;
    }

    const archivoAudio = inputAudio?.files?.[0] || null;
    const urlYoutube = inputYoutube?.value?.trim() || null;
    const spotifyInput = inputSpotify?.value?.trim() || null;
    const spotifyUri = convertirSpotifyInputAUri(spotifyInput);
    const urlPatrimonio = inputPatrimonio?.value?.trim() || null;

    if (archivoAudio && !archivoAudio.type.includes('audio')) {
        alert('El archivo seleccionado debe ser de audio.');
        return;
    }

    if (archivoAudio && !archivoAudio.name.toLowerCase().endsWith('.mp3')) {
        const confirmar = confirm('El archivo no parece ser .mp3. Puede que el navegador no lo reproduzca bien. ¿Quieres continuar?');

        if (!confirmar) {
            return;
        }
    }

    if (spotifyInput && !spotifyUri) {
        alert('No se ha podido reconocer la pista de Spotify. Pega una URL de pista o una URI tipo spotify:track:...');
        return;
    }

    if (urlPatrimonio && !urlPatrimonio.includes('patrimoniomusical.com')) {
        const confirmar = confirm('El enlace no parece ser de patrimoniomusical.com. ¿Quieres guardarlo igualmente?');

        if (!confirmar) {
            return;
        }
    }

    if (estado) {
        estado.style.color = '#aaa';
        estado.textContent = 'Guardando ficha musical...';
    }

    let urlAudioFinal = marchaFichaActual.url_audio || null;

    try {
        if (archivoAudio) {
            urlAudioFinal = await subirAudioMarcha(archivoAudio, marchaFichaActual);
        }

        const datosActualizar = {
            url_audio: urlAudioFinal,
            url_youtube: urlYoutube,
            spotify_uri: spotifyUri,
            url_patrimonio: urlPatrimonio
        };

        const { error } = await clienteSupabase
            .from('catalogo_marchas')
            .update(datosActualizar)
            .eq('id_marcha', marchaFichaActual.id_marcha);

        if (error) {
            throw error;
        }

        marchaFichaActual = {
            ...marchaFichaActual,
            ...datosActualizar
        };

        pintarFichaMusical(marchaFichaActual);

        if (estado) {
            estado.style.color = '#27ae60';
            estado.textContent = 'Ficha musical guardada correctamente.';
        }

        alert('Ficha musical actualizada correctamente.');

    } catch (error) {
        console.error('Error guardando ficha musical:', error);

        if (estado) {
            estado.style.color = '#ff7070';
            estado.textContent = 'No se ha podido guardar la ficha musical.';
        }

        alert('Error guardando ficha musical: ' + error.message);
    }
}

async function subirAudioMarcha(archivoAudio, marcha) {
    const extension = obtenerExtensionArchivo(archivoAudio.name) || 'mp3';
    const nombreBase = normalizarNombreArchivo(`${marcha.id_marcha}-${marcha.titulo || 'marcha'}`);
    const rutaArchivo = `marchas/${nombreBase}.${extension}`;

    const { error: errorUpload } = await clienteSupabase
        .storage
        .from('mp3')
        .upload(rutaArchivo, archivoAudio, {
            cacheControl: '3600',
            upsert: true,
            contentType: archivoAudio.type || 'audio/mpeg'
        });

    if (errorUpload) {
        throw errorUpload;
    }

    const { data } = clienteSupabase
        .storage
        .from('mp3')
        .getPublicUrl(rutaArchivo);

    if (!data || !data.publicUrl) {
        throw new Error('No se ha podido obtener la URL pública del audio.');
    }

    return data.publicUrl;
}

/* ------------------------------------------------------------
   MÓDULO 7: FINALIZAR EVENTO
------------------------------------------------------------ */

async function finalizarEvento() {
    if (!procesionActiva) {
        return;
    }

    const confirmar = confirm('¿Finalizar el evento? Se guardará en el histórico.');

    if (!confirmar) {
        return;
    }

    try {
        const { error } = await clienteSupabase
            .from('maestro_procesiones')
            .update({ estado: 'Finalizada' })
            .eq('id_procesion', procesionActiva.id_procesion);

        if (error) {
            throw error;
        }

        window.location.reload();

    } catch (error) {
        alert('Error al finalizar: ' + error.message);
    }
}

/* ------------------------------------------------------------
   MÓDULO 8: GESTIÓN DE CONCIERTOS
------------------------------------------------------------ */

async function cargarConciertosAdmin() {
    const selector = document.getElementById('select-concierto-admin');

    if (!selector) {
        return;
    }

    selector.innerHTML = `<option value="">Cargando conciertos...</option>`;

    try {
        const { data, error } = await clienteSupabase
            .from('conciertos')
            .select('*')
            .order('fecha', { ascending: false });

        if (error) {
            throw error;
        }

        conciertosAdminCache = data || [];

        selector.innerHTML = `<option value="">Seleccionar concierto existente...</option>`;

        conciertosAdminCache.forEach((concierto) => {
            const option = document.createElement('option');
            option.value = concierto.id_concierto;

            const fecha = concierto.fecha || 'Sin fecha';
            const estado = concierto.estado || 'Sin estado';

            option.textContent = `${concierto.titulo} · ${fecha} · ${estado}`;
            selector.appendChild(option);
        });

    } catch (error) {
        console.error('Error cargando conciertos:', error);
        selector.innerHTML = `<option value="">Error cargando conciertos</option>`;
    }
}

function nuevoConciertoAdmin() {
    conciertoAdminActual = null;

    const campos = [
        'concierto-id',
        'concierto-titulo',
        'concierto-fecha',
        'concierto-hora',
        'concierto-lugar',
        'concierto-localidad',
        'concierto-cartel-url',
        'concierto-descripcion'
    ];

    campos.forEach((id) => {
        const campo = document.getElementById(id);
        if (campo) campo.value = '';
    });

    const estado = document.getElementById('concierto-estado');
    if (estado) estado.value = 'Borrador';

    const selector = document.getElementById('select-concierto-admin');
    if (selector) selector.value = '';

    const estadoTexto = document.getElementById('estado-concierto-admin');
    if (estadoTexto) {
        estadoTexto.style.color = '#aaa';
        estadoTexto.textContent = 'Nuevo concierto. Rellena los datos y guarda.';
    }

    limpiarFormularioObraConciertoAdmin();
    limpiarQRConciertoAdmin();

    const listaObras = document.getElementById('lista-obras-concierto-admin');
    if (listaObras) {
        listaObras.innerHTML = `<p style="color:#888;">Guarda el concierto antes de añadir obras.</p>`;
    }

    setSiguienteOrdenObra(1);
}

function seleccionarConciertoAdmin() {
    const selector = document.getElementById('select-concierto-admin');

    if (!selector || !selector.value) {
        nuevoConciertoAdmin();
        return;
    }

    const idConcierto = Number(selector.value);
    const concierto = conciertosAdminCache.find((item) => Number(item.id_concierto) === idConcierto);

    if (!concierto) {
        alert('No se ha encontrado el concierto seleccionado.');
        return;
    }

    conciertoAdminActual = concierto;
    pintarConciertoAdmin(concierto);
    cargarObrasConciertoAdmin();
    limpiarQRConciertoAdmin();
}

function pintarConciertoAdmin(concierto) {
    setValorAdmin('concierto-id', concierto.id_concierto || '');
    setValorAdmin('concierto-titulo', concierto.titulo || '');
    setValorAdmin('concierto-fecha', concierto.fecha || '');
    setValorAdmin('concierto-hora', concierto.hora ? String(concierto.hora).slice(0, 5) : '');
    setValorAdmin('concierto-lugar', concierto.lugar || '');
    setValorAdmin('concierto-localidad', concierto.localidad || '');
    setValorAdmin('concierto-cartel-url', concierto.cartel_url || '');
    setValorAdmin('concierto-estado', concierto.estado || 'Borrador');
    setValorAdmin('concierto-descripcion', concierto.descripcion || '');

    const estadoTexto = document.getElementById('estado-concierto-admin');

    if (estadoTexto) {
        estadoTexto.style.color = '#d4af37';
        estadoTexto.textContent = `Concierto cargado: ${concierto.titulo}`;
    }
}

async function guardarConciertoAdmin() {
    const titulo = document.getElementById('concierto-titulo')?.value.trim();
    const fecha = document.getElementById('concierto-fecha')?.value || null;
    const hora = document.getElementById('concierto-hora')?.value || null;
    const lugar = document.getElementById('concierto-lugar')?.value.trim() || null;
    const localidad = document.getElementById('concierto-localidad')?.value.trim() || null;
    let cartelUrl = document.getElementById('concierto-cartel-url')?.value.trim() || null;
    const archivoCartel = document.getElementById('concierto-cartel-archivo')?.files?.[0] || null;
    const estado = document.getElementById('concierto-estado')?.value || 'Borrador';
    const descripcion = document.getElementById('concierto-descripcion')?.value.trim() || null;

    const estadoTexto = document.getElementById('estado-concierto-admin');

    if (!titulo) {
        alert('El concierto necesita un título.');
        return;
    }

    if (!['Borrador', 'Publicado', 'Oculto'].includes(estado)) {
        alert('Estado no válido.');
        return;
    }

    if (archivoCartel) {
        if (!archivoCartel.type.startsWith('image/')) {
            alert('El cartel debe ser un archivo de imagen.');
            return;
        }

        cartelUrl = await subirCartelConciertoAdmin(archivoCartel, titulo);
    }
    const datosGuardar = {
        titulo,
        fecha,
        hora,
        lugar,
        localidad,
        descripcion,
        cartel_url: cartelUrl,
        estado,
        actualizado_en: new Date().toISOString()
    };

    if (estadoTexto) {
        estadoTexto.style.color = '#aaa';
        estadoTexto.textContent = 'Guardando concierto...';
    }

    try {
        let data = null;
        let error = null;

        if (conciertoAdminActual?.id_concierto) {
            const respuesta = await clienteSupabase
                .from('conciertos')
                .update(datosGuardar)
                .eq('id_concierto', conciertoAdminActual.id_concierto)
                .select()
                .single();

            data = respuesta.data;
            error = respuesta.error;
        } else {
            const respuesta = await clienteSupabase
                .from('conciertos')
                .insert([datosGuardar])
                .select()
                .single();

            data = respuesta.data;
            error = respuesta.error;
        }

        if (error) {
            throw error;
        }

        conciertoAdminActual = data;

        if (estadoTexto) {
            estadoTexto.style.color = '#27ae60';
            estadoTexto.textContent = 'Concierto guardado correctamente.';
        }

        await cargarConciertosAdmin();

        const selector = document.getElementById('select-concierto-admin');
        if (selector && conciertoAdminActual?.id_concierto) {
            selector.value = conciertoAdminActual.id_concierto;
        }

        pintarConciertoAdmin(conciertoAdminActual);
        await cargarObrasConciertoAdmin();

        const inputCartelArchivo = document.getElementById('concierto-cartel-archivo');
        if (inputCartelArchivo) {
            inputCartelArchivo.value = '';
        }

    } catch (error) {
        console.error('Error guardando concierto:', error);

        if (estadoTexto) {
            estadoTexto.style.color = '#ff7070';
            estadoTexto.textContent = 'No se ha podido guardar el concierto.';
        }

        alert('Error guardando concierto: ' + error.message);
    }
}

async function cargarObrasConciertoAdmin() {
    const lista = document.getElementById('lista-obras-concierto-admin');

    if (!lista) {
        return;
    }

    if (!conciertoAdminActual?.id_concierto) {
        lista.innerHTML = `<p style="color:#888;">Selecciona o guarda un concierto para ver sus obras.</p>`;
        return;
    }

    lista.innerHTML = `<p style="color:#888;">Cargando obras...</p>`;

    const { data, error } = await clienteSupabase
        .from('concierto_obras')
        .select('*')
        .eq('id_concierto', conciertoAdminActual.id_concierto)
        .order('orden', { ascending: true });

    if (error) {
        console.error('Error cargando obras:', error);
        lista.innerHTML = `<p style="color:#ff7070;">No se han podido cargar las obras.</p>`;
        return;
    }

    const obras = data || [];

    if (obras.length === 0) {
        lista.innerHTML = `<p style="color:#888;">Este concierto todavía no tiene obras añadidas.</p>`;
        setSiguienteOrdenObra(1);
        return;
    }

    lista.innerHTML = obras.map((obra) => `
        <div class="obra-admin-item">
            <div class="obra-admin-num">#${escaparHTML(obra.orden)}</div>

            <div>
                <div class="obra-admin-titulo">${escaparHTML(obra.titulo || 'Obra sin título')}</div>
                <div class="obra-admin-sub">
                    ${escaparHTML(obra.compositor || 'Compositor no indicado')}
                    ${obra.duracion_aprox ? ' · ' + escaparHTML(obra.duracion_aprox) : ''}
                </div>
            </div>

            <button type="button" class="btn-mini-danger" onclick="eliminarObraConciertoAdmin(${obra.id_obra})">
                Eliminar
            </button>
        </div>
    `).join('');

    const ultimoOrden = Math.max(...obras.map((obra) => Number(obra.orden) || 0));
    setSiguienteOrdenObra(ultimoOrden + 1);
}

async function guardarObraConciertoAdmin() {
    if (!conciertoAdminActual?.id_concierto) {
        alert('Primero guarda o selecciona un concierto.');
        return;
    }

    const orden = Number(document.getElementById('obra-orden')?.value);
    const titulo = document.getElementById('obra-titulo')?.value.trim();
    const compositor = document.getElementById('obra-compositor')?.value.trim() || null;
    const duracion = document.getElementById('obra-duracion')?.value.trim() || null;
    const descripcion = document.getElementById('obra-descripcion')?.value.trim() || null;
    const youtube = document.getElementById('obra-youtube')?.value.trim() || null;
    const spotify = document.getElementById('obra-spotify')?.value.trim() || null;
    const enlaceExterno = document.getElementById('obra-enlace-externo')?.value.trim() || null;
    const notas = document.getElementById('obra-notas')?.value.trim() || null;

    if (!orden || orden <= 0) {
        alert('Introduce un orden válido.');
        return;
    }

    if (!titulo) {
        alert('La obra necesita un título.');
        return;
    }

    try {
        const { error } = await clienteSupabase
            .from('concierto_obras')
            .insert([{
                id_concierto: conciertoAdminActual.id_concierto,
                orden,
                titulo,
                compositor,
                descripcion,
                duracion_aprox: duracion,
                enlace_youtube: youtube,
                enlace_spotify: spotify,
                enlace_externo: enlaceExterno,
                notas,
                actualizado_en: new Date().toISOString()
            }]);

        if (error) {
            throw error;
        }

        limpiarFormularioObraConciertoAdmin();
        await cargarObrasConciertoAdmin();

    } catch (error) {
        console.error('Error guardando obra:', error);
        alert('Error guardando obra: ' + error.message);
    }
}

async function eliminarObraConciertoAdmin(idObra) {
    if (!idObra) {
        return;
    }

    const confirmar = confirm('¿Eliminar esta obra del programa?');

    if (!confirmar) {
        return;
    }

    try {
        const { error } = await clienteSupabase
            .from('concierto_obras')
            .delete()
            .eq('id_obra', idObra);

        if (error) {
            throw error;
        }

        await cargarObrasConciertoAdmin();

    } catch (error) {
        console.error('Error eliminando obra:', error);
        alert('No se ha podido eliminar la obra: ' + error.message);
    }
}

function limpiarFormularioObraConciertoAdmin() {
    const ids = [
        'obra-orden',
        'obra-titulo',
        'obra-compositor',
        'obra-duracion',
        'obra-descripcion',
        'obra-youtube',
        'obra-spotify',
        'obra-enlace-externo',
        'obra-notas'
    ];

    ids.forEach((id) => {
        const campo = document.getElementById(id);
        if (campo) campo.value = '';
    });
}

function setSiguienteOrdenObra(orden) {
    const inputOrden = document.getElementById('obra-orden');

    if (inputOrden) {
        inputOrden.value = orden;
    }
}

function obtenerUrlPublicaConciertoAdmin() {
    if (!conciertoAdminActual?.id_concierto) {
        return null;
    }

    const baseUrl = window.location.origin;
    return `${baseUrl}/templates/concierto.html?id=${conciertoAdminActual.id_concierto}`;
}

function abrirProgramaConciertoAdmin() {
    const url = obtenerUrlPublicaConciertoAdmin();

    if (!url) {
        alert('Primero guarda o selecciona un concierto.');
        return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
}

function copiarEnlaceConciertoAdmin() {
    const url = obtenerUrlPublicaConciertoAdmin();

    if (!url) {
        alert('Primero guarda o selecciona un concierto.');
        return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url)
            .then(() => alert('Enlace público copiado.'))
            .catch(() => fallbackCopiarTextoAdmin(url));
    } else {
        fallbackCopiarTextoAdmin(url);
    }
}

function fallbackCopiarTextoAdmin(texto) {
    const inputTemporal = document.createElement('input');
    inputTemporal.value = texto;
    document.body.appendChild(inputTemporal);
    inputTemporal.select();

    try {
        document.execCommand('copy');
        alert('Enlace copiado.');
    } catch (error) {
        alert('No se ha podido copiar. Copia manualmente: ' + texto);
    }

    document.body.removeChild(inputTemporal);
}

async function generarQRConciertoAdmin() {
    const url = obtenerUrlPublicaConciertoAdmin();

    if (!url) {
        alert('Primero guarda o selecciona un concierto.');
        return;
    }

    const box = document.getElementById('qr-concierto-admin');
    const canvas = document.getElementById('qr-concierto-canvas');
    const textoUrl = document.getElementById('url-publica-concierto-admin');

    if (!box || !canvas) {
        alert('No se encuentra el contenedor del QR.');
        return;
    }

    if (typeof QRCode === 'undefined') {
        alert('No se ha cargado la librería de QR. Revisa la conexión o el script qrcode.min.js.');
        return;
    }

    try {
        await QRCode.toCanvas(canvas, url, {
            width: 260,
            margin: 2,
            color: {
                dark: '#000000',
                light: '#ffffff'
            }
        });

        box.classList.add('activo');

        if (textoUrl) {
            textoUrl.textContent = url;
        }

    } catch (error) {
        console.error('Error generando QR:', error);
        alert('No se ha podido generar el QR.');
    }
}

function limpiarQRConciertoAdmin() {
    const box = document.getElementById('qr-concierto-admin');
    const canvas = document.getElementById('qr-concierto-canvas');
    const textoUrl = document.getElementById('url-publica-concierto-admin');

    if (box) box.classList.remove('activo');
    if (textoUrl) textoUrl.textContent = '';

    if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
}

async function subirCartelConciertoAdmin(archivoCartel, tituloConcierto) {
    const extension = obtenerExtensionArchivo(archivoCartel.name) || 'jpg';
    const nombreBase = normalizarNombreArchivo(`concierto-${tituloConcierto || 'cartel'}-${Date.now()}`);
    const rutaArchivo = `conciertos/${nombreBase}.${extension}`;

    const { error: errorUpload } = await clienteSupabase
        .storage
        .from('carteles')
        .upload(rutaArchivo, archivoCartel, {
            cacheControl: '3600',
            upsert: true,
            contentType: archivoCartel.type || 'image/jpeg'
        });

    if (errorUpload) {
        throw errorUpload;
    }

    const { data } = clienteSupabase
        .storage
        .from('carteles')
        .getPublicUrl(rutaArchivo);

    if (!data || !data.publicUrl) {
        throw new Error('No se ha podido obtener la URL pública del cartel.');
    }

    return data.publicUrl;
}

function setValorAdmin(id, valor) {
    const campo = document.getElementById(id);

    if (campo) {
        campo.value = valor;
    }
}

/* ------------------------------------------------------------
   UTILIDADES
------------------------------------------------------------ */

function obtenerExtensionArchivo(nombreArchivo) {
    if (!nombreArchivo || !nombreArchivo.includes('.')) {
        return '';
    }

    return nombreArchivo.split('.').pop().toLowerCase();
}

function normalizarNombreArchivo(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/ñ/g, 'n')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .substring(0, 90);
}

function convertirSpotifyInputAUri(valor) {
    if (!valor || String(valor).trim() === '') {
        return null;
    }

    const texto = String(valor).trim();

    if (texto.startsWith('spotify:track:')) {
        return texto;
    }

    try {
        const url = new URL(texto);
        const partes = url.pathname.split('/').filter(Boolean);
        const indiceTrack = partes.indexOf('track');

        if (indiceTrack !== -1 && partes[indiceTrack + 1]) {
            const trackId = partes[indiceTrack + 1];
            return `spotify:track:${trackId}`;
        }

        return null;

    } catch (error) {
        return null;
    }
}

function escaparHTML(valor) {
    if (valor === null || valor === undefined) {
        return '';
    }

    return String(valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escaparAtributo(valor) {
    return escaparHTML(valor).replaceAll('`', '&#096;');
}

async function descartarEvento() {
    if (!procesionActiva) return;

    const confirmacion = prompt(
        `Vas a eliminar definitivamente "${procesionActiva.hermandad}" y todo lo asociado.\n\nEscribe DESCARTAR para continuar.`
    );

    if (confirmacion !== 'DESCARTAR') {
        return;
    }

    const idProcesion = procesionActiva.id_procesion;
    const boton = document.getElementById('btn-descartar-evento');

    try {
        if (boton) {
            boton.disabled = true;
            boton.textContent = 'Eliminando...';
        }

        // Se eliminan primero los registros dependientes para evitar
        // conservar repertorio, actividad social o datos huérfanos.
        const tablasRelacionadas = [
            'repertorio_transaccional',
            'procesion_comentarios',
            'valoraciones'
        ];

        for (const tabla of tablasRelacionadas) {
            const { error } = await clienteSupabase
                .from(tabla)
                .delete()
                .eq('id_procesion', idProcesion);

            if (error) {
                throw new Error(`No se ha podido limpiar ${tabla}: ${error.message}`);
            }
        }

        const { error: errorProcesion } = await clienteSupabase
            .from('maestro_procesiones')
            .delete()
            .eq('id_procesion', idProcesion);

        if (errorProcesion) {
            throw errorProcesion;
        }

        await eliminarPortadaActuacionDescartada(procesionActiva.url_foto);

        procesionActiva = null;
        contadorOrden = 1;
        ordenEnEdicion = null;
        desactivarModoInyeccion();

        const tbody = document.getElementById('tabla-historial-body');
        if (tbody) tbody.innerHTML = '';

        alert('La actuación se ha descartado y no se guardará en el histórico.');
        window.location.reload();

    } catch (error) {
        alert(`No se ha podido descartar completamente la actuación: ${error.message}`);

        if (boton) {
            boton.disabled = false;
            boton.textContent = 'Descartar';
        }
    }
}

async function eliminarPortadaActuacionDescartada(urlFoto) {
    if (!urlFoto || !urlFoto.includes('/storage/v1/object/public/portadas/')) {
        return;
    }

    try {
        const rutaCodificada = urlFoto.split('/storage/v1/object/public/portadas/')[1];
        const rutaArchivo = decodeURIComponent(rutaCodificada.split('?')[0]);

        if (rutaArchivo) {
            const { error } = await clienteSupabase.storage
                .from('portadas')
                .remove([rutaArchivo]);

            if (error) {
                console.warn('La actuación se eliminó, pero no se pudo borrar su portada:', error);
            }
        }
    } catch (error) {
        console.warn('No se ha podido interpretar la ruta de la portada descartada:', error);
    }
}

