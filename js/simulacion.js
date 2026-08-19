/* ============================================================
   SIMULADOR DE REPERTORIOS
   Búsqueda, escucha previa, estadísticas y publicación
   ============================================================ */

let catalogoGlobal = [];
let itinerarioSimulado = [];
let idEnEdicion = null;
let borradorActualId = localStorage.getItem('jc_simulacion_borrador_actual_id');
const CLAVE_BORRADORES_SIMULACION = 'jc_simulacion_borradores_v1';

document.addEventListener('DOMContentLoaded', inicializarSimulador);

async function inicializarSimulador() {
    prepararEventos();
    restaurarBorrador();

    try {
        const { data, error } = await clienteSupabase
            .from('catalogo_marchas')
            .select('*')
            .order('titulo', { ascending: true });

        if (error) throw error;

        catalogoGlobal = (data || []).filter((marcha) => {
            const duracion = Number(marcha.duracion_seg);
            return duracion > 0 && Number.isFinite(duracion);
        });

        renderizarResultados();
        incorporarMarchaPendiente();
    } catch (error) {
        console.error('Error cargando el catálogo:', error);
        const resultados = document.getElementById('resultados-marchas');
        if (resultados) {
            resultados.innerHTML = '<div class="estado-busqueda">No se ha podido cargar el catálogo musical.</div>';
        }
    }

    renderizarItinerario();
    ejecutarAuditoria();
    renderizarBorradoresGuardados();
}

function incorporarMarchaPendiente() {
    const pendiente = localStorage.getItem('jc_marcha_pendiente_simulador');
    if (!pendiente) return;

    try {
        const datosPendientes = JSON.parse(pendiente);
        const marcha = catalogoGlobal.find((item) => String(item.id_marcha) === String(datosPendientes.id_marcha)) || datosPendientes;
        if (!marcha?.titulo || !(Number(marcha.duracion_seg) > 0)) throw new Error('Marcha incompleta');
        localStorage.removeItem('jc_marcha_pendiente_simulador');
        agregarMarcha(marcha);
        mostrarAvisoSimulador(`“${marcha.titulo}” se ha añadido a tu cruceta.`);
        document.getElementById('contenedor-itinerario')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (error) {
        localStorage.removeItem('jc_marcha_pendiente_simulador');
        console.error('No se ha podido incorporar la marcha del catálogo:', error);
        mostrarAvisoSimulador('No se ha podido añadir la marcha enviada desde el catálogo.', true);
    }
}

function mostrarAvisoSimulador(mensaje, esError = false) {
    const aviso = document.getElementById('aviso-simulador');
    if (!aviso) return;
    aviso.textContent = mensaje;
    aviso.classList.toggle('error', esError);
    aviso.classList.add('visible');
    clearTimeout(mostrarAvisoSimulador.temporizador);
    mostrarAvisoSimulador.temporizador = setTimeout(() => aviso.classList.remove('visible'), 5000);
}

function prepararEventos() {
    document.getElementById('sim-buscador-marcha')?.addEventListener('input', renderizarResultados);
    document.getElementById('sim-horas')?.addEventListener('input', () => {
        ejecutarAuditoria();
        autoguardarSimulacion();
    });
    document.getElementById('sim-nombre')?.addEventListener('input', autoguardarSimulacion);
    document.getElementById('sim-descripcion')?.addEventListener('input', autoguardarSimulacion);
    document.getElementById('sim-visibilidad')?.addEventListener('change', actualizarAyudaVisibilidad);

    document.getElementById('resultados-marchas')?.addEventListener('click', gestionarAccionResultado);
    document.getElementById('contenedor-itinerario')?.addEventListener('click', gestionarAccionItinerario);
    document.getElementById('lista-borradores-simulacion')?.addEventListener('click', gestionarAccionBorrador);
}

function restaurarBorrador() {
    const borrador = localStorage.getItem('jc_simulacion_borrador');

    if (borrador) {
        try {
            itinerarioSimulado = JSON.parse(borrador);
        } catch (error) {
            localStorage.removeItem('jc_simulacion_borrador');
        }
    }

    const horas = localStorage.getItem('jc_simulacion_horas');
    const nombre = localStorage.getItem('jc_simulacion_nombre');
    const descripcion = localStorage.getItem('jc_simulacion_descripcion');
    const visibilidad = localStorage.getItem('jc_simulacion_visibilidad');

    if (horas !== null) document.getElementById('sim-horas').value = horas;
    if (nombre !== null) document.getElementById('sim-nombre').value = nombre;
    if (descripcion !== null) document.getElementById('sim-descripcion').value = descripcion;
    if (visibilidad !== null && ['publica', 'miembros', 'enlace'].includes(visibilidad)) {
        document.getElementById('sim-visibilidad').value = visibilidad;
    }
    const esMejora = Boolean(localStorage.getItem('jc_simulacion_parent_id'));
    if (esMejora) document.getElementById('sim-visibilidad').disabled = true;
    actualizarAyudaVisibilidad();
}

function renderizarResultados() {
    const contenedor = document.getElementById('resultados-marchas');
    if (!contenedor) return;

    const termino = normalizarTexto(document.getElementById('sim-buscador-marcha')?.value || '');
    let resultados = catalogoGlobal.filter((marcha) => {
        if (!termino) return true;

        const textoMarcha = normalizarTexto([
            marcha.titulo,
            marcha.autor,
            marcha.dedicatoria,
            marcha.localidad,
            marcha.ano
        ].filter(Boolean).join(' '));

        return textoMarcha.includes(termino);
    });

    if (!termino) {
        resultados = resultados
            .sort((a, b) => Number(tieneMultimedia(b)) - Number(tieneMultimedia(a)))
            .slice(0, 8);
    } else {
        resultados = resultados.slice(0, 20);
    }

    if (resultados.length === 0) {
        contenedor.innerHTML = '<div class="estado-busqueda">No hay marchas que coincidan con la búsqueda.</div>';
        return;
    }

    contenedor.innerHTML = resultados.map(crearTarjetaResultado).join('');
}

function crearTarjetaResultado(marcha) {
    const tieneAudio = campoRelleno(marcha.url_audio);
    const tieneYoutube = esUrlWebValida(marcha.url_youtube);
    const yaIncluida = itinerarioSimulado.some((item) => String(item.id_marcha) === String(marcha.id_marcha));
    const esEditada = idEnEdicion && itinerarioSimulado.some((item) => {
        return item.uuid === idEnEdicion && String(item.id_marcha) === String(marcha.id_marcha);
    });

    return `
        <article class="resultado-marcha">
            <div class="resultado-cabecera">
                <div class="resultado-info">
                    <strong>${escaparHTML(marcha.titulo || 'Marcha sin título')}</strong>
                    <span>${escaparHTML(marcha.autor || 'Autor desconocido')}</span>
                </div>
                <span class="resultado-etiqueta">${formatearDuracion(marcha.duracion_seg)}</span>
            </div>
            <div class="resultado-etiquetas">
                ${marcha.ano ? `<span class="resultado-etiqueta">${escaparHTML(marcha.ano)}</span>` : ''}
                <span class="resultado-etiqueta">${tieneCornetas(marcha) ? '🎺 Con cornetas' : 'Sin cornetas'}</span>
                ${yaIncluida ? '<span class="resultado-etiqueta">Ya incluida</span>' : ''}
            </div>
            <div class="resultado-acciones">
                <button type="button" class="btn-mini" data-accion="audio" data-id="${escaparAtributo(marcha.id_marcha)}" ${tieneAudio ? '' : 'disabled'}>
                    ▶ Escuchar
                </button>
                <button type="button" class="btn-mini" data-accion="youtube" data-id="${escaparAtributo(marcha.id_marcha)}" ${tieneYoutube ? '' : 'disabled'}>
                    YouTube
                </button>
                <button type="button" class="btn-mini btn-anadir" data-accion="anadir" data-id="${escaparAtributo(marcha.id_marcha)}">
                    ${esEditada ? 'Actualizar' : '+ Añadir'}
                </button>
            </div>
        </article>
    `;
}

function gestionarAccionResultado(evento) {
    const boton = evento.target.closest('[data-accion][data-id]');
    if (!boton) return;

    const marcha = catalogoGlobal.find((item) => String(item.id_marcha) === String(boton.dataset.id));
    if (!marcha) return;

    if (boton.dataset.accion === 'audio') reproducirMarcha(marcha);
    if (boton.dataset.accion === 'youtube') abrirYoutube(marcha);
    if (boton.dataset.accion === 'anadir') agregarMarcha(marcha);
}

function agregarMarcha(marchaBase) {
    const calle = document.getElementById('sim-calle')?.value.trim() || 'S/E';
    const datosMarcha = {
        ...marchaBase,
        calle,
        uuid: idEnEdicion || crypto.randomUUID()
    };

    if (idEnEdicion) {
        const indice = itinerarioSimulado.findIndex((item) => item.uuid === idEnEdicion);

        if (indice >= 0) {
            itinerarioSimulado[indice] = datosMarcha;
        } else {
            itinerarioSimulado.push(datosMarcha);
        }

        idEnEdicion = null;
    } else {
        itinerarioSimulado.push(datosMarcha);
    }

    document.getElementById('sim-buscador-marcha').value = '';
    document.getElementById('sim-calle').value = '';

    actualizarSimulador();
}

function gestionarAccionItinerario(evento) {
    const boton = evento.target.closest('[data-accion][data-uuid]');
    if (!boton) return;

    const uuid = boton.dataset.uuid;
    const item = itinerarioSimulado.find((marcha) => marcha.uuid === uuid);
    if (!item) return;

    if (boton.dataset.accion === 'audio') reproducirMarcha(item);
    if (boton.dataset.accion === 'youtube') abrirYoutube(item);
    if (boton.dataset.accion === 'editar') prepararEdicion(uuid);
    if (boton.dataset.accion === 'borrar') eliminarMarcha(uuid);
    if (boton.dataset.accion === 'subir') moverMarcha(uuid, -1);
    if (boton.dataset.accion === 'bajar') moverMarcha(uuid, 1);
}

function prepararEdicion(uuid) {
    const item = itinerarioSimulado.find((marcha) => marcha.uuid === uuid);
    if (!item) return;

    idEnEdicion = uuid;
    document.getElementById('sim-buscador-marcha').value = item.titulo || '';
    document.getElementById('sim-calle').value = item.calle === 'S/E' ? '' : item.calle;
    renderizarResultados();

    document.getElementById('sim-buscador-marcha')?.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
    });
}

function eliminarMarcha(uuid) {
    if (idEnEdicion === uuid) idEnEdicion = null;
    itinerarioSimulado = itinerarioSimulado.filter((item) => item.uuid !== uuid);
    actualizarSimulador();
}

function moverMarcha(uuid, desplazamiento) {
    const indice = itinerarioSimulado.findIndex((item) => item.uuid === uuid);
    const destino = indice + desplazamiento;

    if (indice < 0 || destino < 0 || destino >= itinerarioSimulado.length) return;

    [itinerarioSimulado[indice], itinerarioSimulado[destino]] = [
        itinerarioSimulado[destino],
        itinerarioSimulado[indice]
    ];

    actualizarSimulador();
}

function actualizarSimulador() {
    renderizarItinerario();
    renderizarResultados();
    ejecutarAuditoria();
    autoguardarSimulacion();
}

function renderizarItinerario() {
    const contenedor = document.getElementById('contenedor-itinerario');
    if (!contenedor) return;

    if (itinerarioSimulado.length === 0) {
        contenedor.innerHTML = `
            <p style="color:#666; text-align:center; padding:40px; border:2px dashed #1a1a1a; border-radius:12px;">
                Comienza a escuchar y añadir marchas para diseñar el repertorio.
            </p>
        `;
        return;
    }

    contenedor.innerHTML = itinerarioSimulado.map((item, indice) => `
        <article class="item-marcha" style="${idEnEdicion === item.uuid ? 'border-color:#3498db; background:rgba(52,152,219,0.12);' : ''}">
            <div class="item-cuerpo">
                <div class="item-posicion">${indice + 1}</div>
                <div class="item-info">
                    <strong>${escaparHTML(item.titulo || 'Marcha sin título')}</strong>
                    <span>${escaparHTML(item.autor || 'Autor desconocido')}</span>
                    <div class="item-meta">
                        <small>📍 ${escaparHTML(item.calle || 'S/E')}</small>
                        <small>⏱ ${formatearDuracion(item.duracion_seg)}</small>
                        <small>${tieneCornetas(item) ? '🎺 Con cornetas' : 'Sin cornetas'}</small>
                    </div>
                </div>
            </div>
            <div class="item-acciones">
                <button type="button" class="btn-item" data-accion="subir" data-uuid="${escaparAtributo(item.uuid)}" ${indice === 0 ? 'disabled' : ''}>↑</button>
                <button type="button" class="btn-item" data-accion="bajar" data-uuid="${escaparAtributo(item.uuid)}" ${indice === itinerarioSimulado.length - 1 ? 'disabled' : ''}>↓</button>
                <button type="button" class="btn-item" data-accion="audio" data-uuid="${escaparAtributo(item.uuid)}" ${campoRelleno(item.url_audio) ? '' : 'disabled'}>▶ Oír</button>
                <button type="button" class="btn-item" data-accion="youtube" data-uuid="${escaparAtributo(item.uuid)}" ${esUrlWebValida(item.url_youtube) ? '' : 'disabled'}>YouTube</button>
                <button type="button" class="btn-item" data-accion="editar" data-uuid="${escaparAtributo(item.uuid)}">Editar</button>
                <button type="button" class="btn-eliminar" data-accion="borrar" data-uuid="${escaparAtributo(item.uuid)}" style="grid-column:1/-1;">Borrar</button>
            </div>
        </article>
    `).join('');
}

function ejecutarAuditoria() {
    const totalMarchas = itinerarioSimulado.length;
    const totalSegundos = itinerarioSimulado.reduce((total, marcha) => {
        return total + (Number(marcha.duracion_seg) || 0);
    }, 0);
    const horasRecorrido = Number(document.getElementById('sim-horas')?.value) || 0;
    const densidad = horasRecorrido > 0 ? (totalSegundos / (horasRecorrido * 3600)) * 100 : 0;
    const autores = new Set(
        itinerarioSimulado
            .map((marcha) => normalizarTexto(marcha.autor || ''))
            .filter(Boolean)
    );
    const totalCornetas = itinerarioSimulado.filter(tieneCornetas).length;
    const porcentajeCornetas = totalMarchas > 0 ? (totalCornetas / totalMarchas) * 100 : 0;
    const duracionMedia = totalMarchas > 0 ? Math.round(totalSegundos / totalMarchas) : 0;

    asignarTexto('aud-n', totalMarchas);
    asignarTexto('aud-tiempo', formatearDuracion(totalSegundos));
    asignarTexto('aud-ratio', `${densidad.toFixed(1)}%`);
    asignarTexto('aud-autores', autores.size);
    asignarTexto('aud-cornetas', `${Math.round(porcentajeCornetas)}%`);
    asignarTexto('aud-media', formatearDuracion(duracionMedia));

    renderizarAvisosAuditoria(porcentajeCornetas);
}

function renderizarAvisosAuditoria(porcentajeCornetas) {
    const contenedor = document.getElementById('aud-avisos');
    if (!contenedor) return;

    const avisos = [];
    const conteoTitulos = contarValores(itinerarioSimulado.map((marcha) => normalizarTexto(marcha.titulo || '')));
    const repetidas = Object.values(conteoTitulos).filter((cantidad) => cantidad > 1).length;

    if (repetidas > 0) {
        avisos.push(`⚠️ Hay ${repetidas} ${repetidas === 1 ? 'marcha repetida' : 'marchas repetidas'} en el repertorio.`);
    }

    if (itinerarioSimulado.length >= 4) {
        const conteoAutores = contarValores(
            itinerarioSimulado.map((marcha) => marcha.autor || 'Autor desconocido')
        );
        const autorDominante = Object.entries(conteoAutores).sort((a, b) => b[1] - a[1])[0];

        if (autorDominante && autorDominante[1] / itinerarioSimulado.length > 0.5) {
            avisos.push(`🎼 ${autorDominante[0]} concentra más de la mitad del repertorio.`);
        }

        if (porcentajeCornetas >= 75) {
            avisos.push('🎺 Predominan claramente las marchas con cornetas.');
        }

        if (porcentajeCornetas <= 25) {
            avisos.push('🎶 Predominan claramente las marchas sin cornetas.');
        }
    }

    contenedor.classList.toggle('activa', avisos.length > 0);
    contenedor.innerHTML = avisos.map((aviso) => `<div class="aviso-auditoria">${escaparHTML(aviso)}</div>`).join('');
}

function reproducirMarcha(marcha) {
    if (!campoRelleno(marcha.url_audio)) return;

    const reproductor = document.getElementById('mini-player-sim');
    const audio = document.getElementById('mini-player-audio');

    asignarTexto('mini-player-titulo', marcha.titulo || 'Marcha');
    asignarTexto('mini-player-autor', marcha.autor || 'Autor desconocido');

    if (audio.src !== marcha.url_audio) {
        audio.src = marcha.url_audio;
    }

    reproductor.classList.add('activo');
    audio.play().catch(() => {
        // Algunos navegadores requieren que el usuario pulse play en el control.
    });
}

function cerrarReproductor() {
    const reproductor = document.getElementById('mini-player-sim');
    const audio = document.getElementById('mini-player-audio');
    audio.pause();
    reproductor.classList.remove('activo');
}

function abrirYoutube(marcha) {
    if (!esUrlWebValida(marcha.url_youtube)) return;
    window.open(marcha.url_youtube, '_blank', 'noopener,noreferrer');
}

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

async function prepararParaComunidad() {
    const usuario = await obtenerUsuario();
    if (!usuario || itinerarioSimulado.length === 0) return;

    const nombre = document.getElementById('sim-nombre').value || 'Proyecto sin título';
    const descripcion = document.getElementById('sim-descripcion').value || '';
    const horas = Number(document.getElementById('sim-horas').value) || 0;
    const totalSegundos = itinerarioSimulado.reduce((total, marcha) => {
        return total + (Number(marcha.duracion_seg) || 0);
    }, 0);
    const densidad = horas > 0 ? Math.round((totalSegundos / (horas * 3600)) * 100) : 0;
    const parentId = localStorage.getItem('jc_simulacion_parent_id');
    const visibilidad = document.getElementById('sim-visibilidad')?.value || 'publica';

    try {
        const { data: perfil } = await clienteSupabase
            .from('perfiles')
            .select('username')
            .eq('id', usuario.id)
            .maybeSingle();
        const nombrePublico = perfil?.username || usuario.email.split('@')[0];

        const { data: proyectoPublicado, error } = await clienteSupabase.from('comunidad_repertorios').insert([{
            proyecto_nombre: nombre,
            horas_estimadas: horas,
            densidad_musical: densidad,
            descripcion,
            repertorio_json: itinerarioSimulado,
            usuario_id: usuario.id,
            usuario_nombre: nombrePublico,
            respuesta_a_id: parentId,
            visibilidad
        }]).select('id, visibilidad, enlace_token').single();

        if (error) throw error;

        itinerarioSimulado = [];
        localStorage.removeItem('jc_simulacion_borrador');
        localStorage.removeItem('jc_simulacion_parent_id');
        actualizarSimulador();

        if (visibilidad === 'enlace') {
            const url = new URL('comunidad.html', window.location.href);
            url.searchParams.set('enlace', proyectoPublicado.enlace_token);
            const inputEnlace = document.getElementById('url-enlace-privado');
            if (inputEnlace) inputEnlace.value = url.href;
            document.getElementById('resultado-enlace-privado')?.classList.add('visible');
            mostrarAvisoSimulador('Propuesta privada creada. Copia el enlace antes de salir.');
        } else {
            alert(visibilidad === 'miembros' ? 'Propuesta publicada para miembros.' : '¡Publicado con éxito!');
            window.location.href = 'comunidad.html';
        }
    } catch (error) {
        alert(error.message);
    }
}

function autoguardarSimulacion() {
    localStorage.setItem('jc_simulacion_borrador', JSON.stringify(itinerarioSimulado));
    localStorage.setItem('jc_simulacion_horas', document.getElementById('sim-horas').value);
    localStorage.setItem('jc_simulacion_nombre', document.getElementById('sim-nombre').value);
    localStorage.setItem('jc_simulacion_descripcion', document.getElementById('sim-descripcion').value);
    localStorage.setItem('jc_simulacion_visibilidad', document.getElementById('sim-visibilidad')?.value || 'publica');
}

function actualizarAyudaVisibilidad() {
    const valor = document.getElementById('sim-visibilidad')?.value || 'publica';
    const mensajes = {
        publica: 'Aparecerá en la Comunidad y cualquiera podrá verla.',
        miembros: 'Solo aparecerá para personas que hayan iniciado sesión.',
        enlace: 'No aparecerá en la Comunidad. Será de solo lectura para quien tenga el enlace.'
    };
    const esMejora = Boolean(localStorage.getItem('jc_simulacion_parent_id'));
    asignarTexto('sim-visibilidad-ayuda', esMejora ? 'La mejora conserva la visibilidad de la propuesta original.' : mensajes[valor]);
    autoguardarSimulacion();
}

async function copiarEnlacePrivado() {
    const input = document.getElementById('url-enlace-privado');
    if (!input?.value) return;
    try {
        if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(input.value);
        else {
            input.select();
            document.execCommand('copy');
        }
        mostrarAvisoSimulador('Enlace privado copiado.');
    } catch (error) {
        mostrarAvisoSimulador('No se ha podido copiar. Mantén pulsado el enlace para copiarlo.', true);
    }
}

function leerBorradoresSimulacion() {
    try {
        const datos = JSON.parse(localStorage.getItem(CLAVE_BORRADORES_SIMULACION) || '[]');
        return Array.isArray(datos) ? datos : [];
    } catch (_) {
        return [];
    }
}

function guardarColeccionBorradores(borradores) {
    localStorage.setItem(CLAVE_BORRADORES_SIMULACION, JSON.stringify(borradores));
    renderizarBorradoresGuardados();
}

function crearIdBorrador() {
    return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function obtenerDatosProyectoActual() {
    return {
        id: borradorActualId,
        nombre: document.getElementById('sim-nombre')?.value.trim() || 'Propuesta sin título',
        descripcion: document.getElementById('sim-descripcion')?.value.trim() || '',
        visibilidad: document.getElementById('sim-visibilidad')?.value || 'publica',
        horas: Number(document.getElementById('sim-horas')?.value) || 0,
        marchas: itinerarioSimulado.map((marcha) => ({ ...marcha })),
        actualizadoEn: new Date().toISOString()
    };
}

function prepararDatosExportacionSimulacion(proyecto = obtenerDatosProyectoActual()) {
    return {
        meta: {
            tituloDocumento: 'Propuesta de repertorio',
            hermandad: proyecto.nombre,
            localidad: proyecto.horas ? `Borrador de trabajo · ${proyecto.horas} h de recorrido` : 'Borrador de trabajo',
            fecha: String(proyecto.actualizadoEn || new Date().toISOString()).slice(0, 10),
            tipo: 'Simulación',
            etiquetaFase: 'Ubicación'
        },
        marchas: (proyecto.marchas || []).map((marcha, indice) => ({
            ...marcha,
            orden: indice + 1,
            fase: marcha.calle || 'Sin ubicación'
        }))
    };
}

function guardarBorradorSimulacion() {
    if (itinerarioSimulado.length === 0) {
        mostrarAvisoSimulador('Añade al menos una marcha antes de guardar el borrador.', true);
        return;
    }

    const borradores = leerBorradoresSimulacion();
    if (!borradorActualId) borradorActualId = crearIdBorrador();
    const proyecto = { ...obtenerDatosProyectoActual(), id: borradorActualId };
    const indice = borradores.findIndex((item) => item.id === borradorActualId);
    if (indice >= 0) borradores[indice] = proyecto;
    else borradores.unshift(proyecto);

    localStorage.setItem('jc_simulacion_borrador_actual_id', borradorActualId);
    guardarColeccionBorradores(borradores);
    mostrarAvisoSimulador(`Borrador “${proyecto.nombre}” guardado en este dispositivo.`);
}

function nuevoBorradorSimulacion() {
    if (itinerarioSimulado.length > 0 && !confirm('¿Empezar un borrador nuevo? El actual seguirá disponible si lo has guardado.')) return;
    borradorActualId = null;
    itinerarioSimulado = [];
    idEnEdicion = null;
    localStorage.removeItem('jc_simulacion_borrador_actual_id');
    localStorage.removeItem('jc_simulacion_parent_id');
    document.getElementById('sim-nombre').value = '';
    document.getElementById('sim-descripcion').value = '';
    document.getElementById('sim-horas').value = '6';
    document.getElementById('sim-visibilidad').value = 'publica';
    document.getElementById('sim-visibilidad').disabled = false;
    actualizarAyudaVisibilidad();
    actualizarSimulador();
    mostrarAvisoSimulador('Nuevo borrador preparado.');
}

function abrirBorradorSimulacion(id) {
    const proyecto = leerBorradoresSimulacion().find((item) => item.id === id);
    if (!proyecto) return;
    borradorActualId = proyecto.id;
    localStorage.setItem('jc_simulacion_borrador_actual_id', borradorActualId);
    itinerarioSimulado = Array.isArray(proyecto.marchas) ? proyecto.marchas.map((marcha) => ({ ...marcha })) : [];
    document.getElementById('sim-nombre').value = proyecto.nombre || '';
    document.getElementById('sim-descripcion').value = proyecto.descripcion || '';
    document.getElementById('sim-horas').value = proyecto.horas || 6;
    document.getElementById('sim-visibilidad').value = proyecto.visibilidad || 'publica';
    actualizarAyudaVisibilidad();
    actualizarSimulador();
    document.getElementById('contenedor-itinerario')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    mostrarAvisoSimulador(`Borrador “${proyecto.nombre}” abierto.`);
}

function eliminarBorradorSimulacion(id) {
    const borradores = leerBorradoresSimulacion();
    const proyecto = borradores.find((item) => item.id === id);
    if (!proyecto || !confirm(`¿Eliminar el borrador “${proyecto.nombre}” de este dispositivo?`)) return;
    guardarColeccionBorradores(borradores.filter((item) => item.id !== id));
    if (borradorActualId === id) {
        borradorActualId = null;
        localStorage.removeItem('jc_simulacion_borrador_actual_id');
    }
    mostrarAvisoSimulador('Borrador eliminado.');
}

async function exportarProyectoSimulacion(proyecto, formato) {
    const { meta, marchas } = prepararDatosExportacionSimulacion(proyecto);
    if (marchas.length === 0) {
        mostrarAvisoSimulador('El borrador no contiene marchas.', true);
        return;
    }
    try {
        if (formato === 'copiar') await RepertorioExport.copiarTexto(meta, marchas);
        else if (formato === 'pdf') RepertorioExport.descargarPDF(meta, marchas);
        else RepertorioExport.descargarTexto(meta, marchas);
        mostrarAvisoSimulador(formato === 'copiar' ? 'Repertorio copiado.' : `Repertorio ${formato.toUpperCase()} preparado.`);
    } catch (error) {
        mostrarAvisoSimulador('No se ha podido exportar: ' + error.message, true);
    }
}

function exportarSimulacionActual(formato) {
    exportarProyectoSimulacion(obtenerDatosProyectoActual(), formato);
}

function gestionarAccionBorrador(evento) {
    const boton = evento.target.closest('[data-borrador-accion][data-borrador-id]');
    if (!boton) return;
    const id = boton.dataset.borradorId;
    const accion = boton.dataset.borradorAccion;
    if (accion === 'abrir') abrirBorradorSimulacion(id);
    if (accion === 'eliminar') eliminarBorradorSimulacion(id);
    if (accion === 'txt' || accion === 'pdf') {
        const proyecto = leerBorradoresSimulacion().find((item) => item.id === id);
        if (proyecto) exportarProyectoSimulacion(proyecto, accion);
    }
}

function renderizarBorradoresGuardados() {
    const contenedor = document.getElementById('lista-borradores-simulacion');
    if (!contenedor) return;
    const borradores = leerBorradoresSimulacion();
    if (borradores.length === 0) {
        contenedor.innerHTML = '<p class="borradores-vacio">Todavía no hay borradores guardados en este dispositivo.</p>';
        return;
    }
    contenedor.innerHTML = borradores.map((proyecto) => {
        const fecha = new Date(proyecto.actualizadoEn);
        const fechaTexto = Number.isNaN(fecha.getTime()) ? '' : fecha.toLocaleDateString('es-ES');
        return `
            <article class="borrador-sim ${proyecto.id === borradorActualId ? 'activo' : ''}">
                <div><strong>${escaparHTML(proyecto.nombre || 'Propuesta sin título')}</strong><span>${(proyecto.marchas || []).length} marchas · ${escaparHTML(fechaTexto)}</span></div>
                <div class="borrador-acciones">
                    <button type="button" data-borrador-accion="abrir" data-borrador-id="${escaparAtributo(proyecto.id)}">Abrir</button>
                    <button type="button" data-borrador-accion="txt" data-borrador-id="${escaparAtributo(proyecto.id)}">TXT</button>
                    <button type="button" data-borrador-accion="pdf" data-borrador-id="${escaparAtributo(proyecto.id)}">PDF</button>
                    <button type="button" class="peligro" data-borrador-accion="eliminar" data-borrador-id="${escaparAtributo(proyecto.id)}">Eliminar</button>
                </div>
            </article>`;
    }).join('');
}

function tieneMultimedia(marcha) {
    return campoRelleno(marcha.url_audio) || esUrlWebValida(marcha.url_youtube);
}

function tieneCornetas(marcha) {
    return marcha.cornetas === 1 || marcha.cornetas === true || String(marcha.cornetas) === '1';
}

function campoRelleno(valor) {
    return valor !== null && valor !== undefined && String(valor).trim() !== '';
}

function esUrlWebValida(valor) {
    if (!campoRelleno(valor)) return false;

    try {
        const url = new URL(String(valor));
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch (error) {
        return false;
    }
}

function contarValores(valores) {
    return valores.filter(Boolean).reduce((conteo, valor) => {
        conteo[valor] = (conteo[valor] || 0) + 1;
        return conteo;
    }, {});
}

function formatearDuracion(segundos) {
    const total = Math.max(0, Math.round(Number(segundos) || 0));
    const minutos = Math.floor(total / 60);
    const resto = total % 60;
    return `${minutos}:${String(resto).padStart(2, '0')}`;
}

function normalizarTexto(valor) {
    return String(valor)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function asignarTexto(id, valor) {
    const elemento = document.getElementById(id);
    if (elemento) elemento.textContent = valor;
}

function escaparHTML(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function escaparAtributo(valor) {
    return escaparHTML(valor);
}
