/* ============================================================
   COMUNIDAD Y DEBATE MUSICAL
   Feed, escucha, comparación de versiones e interacción segura
   ============================================================ */

let proyectosRaiz = [];
let proyectosVisibles = [];
let mejorasPorProyecto = {};
let comentariosPorProyecto = {};
let votosPorProyecto = {};
let votosUsuario = new Set();
let sesionActual = null;
let idAbierto = null;
let modoVotosPersistentes = true;
let interesesUsuario = [];
let perfilComunidadActual = null;

document.addEventListener('DOMContentLoaded', inicializarComunidad);

async function inicializarComunidad() {
    prepararEventosComunidad();
    await cargarComunidad();
}

function prepararEventosComunidad() {
    document.getElementById('filtro-comunidad')?.addEventListener('input', aplicarFiltrosFeed);
    document.getElementById('orden-comunidad')?.addEventListener('change', aplicarFiltrosFeed);
    document.getElementById('vista-comunidad')?.addEventListener('change', aplicarFiltrosFeed);
    document.getElementById('btn-notificaciones-comunidad')?.addEventListener('click', alternarPanelNotificaciones);
    document.getElementById('lista-notificaciones')?.addEventListener('click', gestionarNotificacion);
    document.getElementById('feed-contenedor')?.addEventListener('click', gestionarAccionFeed);
    document.getElementById('modal-cruceta')?.addEventListener('click', gestionarAccionModal);
    document.getElementById('input-comentario')?.addEventListener('keydown', (evento) => {
        if (evento.key === 'Enter') enviarComentario();
    });
}

async function cargarComunidad() {
    mostrarEstadoFeed('Cargando propuestas y conversaciones...');

    try {
        const { data: { session } } = await clienteSupabase.auth.getSession();
        sesionActual = session;
        if (!sesionActual) {
            document.querySelectorAll('#vista-comunidad option:not([value="todo"])').forEach((opcion) => {
                opcion.disabled = true;
            });
            document.getElementById('vista-comunidad')?.setAttribute('title', 'Inicia sesión para personalizar la Comunidad');
        }

        const { data: proyectos, error } = await clienteSupabase
            .from('comunidad_repertorios')
            .select('*')
            .is('respuesta_a_id', null)
            .order('created_at', { ascending: false });

        if (error) throw error;

        proyectosRaiz = proyectos || [];
        await cargarMetricasFeed();

        if (sesionActual) {
            await Promise.all([
                cargarDatosSidebar(sesionActual.user),
                cargarVotosUsuario(sesionActual.user.id),
                cargarNotificacionesComunidad(sesionActual.user.id)
            ]);
        }

        aplicarFiltrosFeed();
        await abrirProyectoCompartido();
    } catch (error) {
        console.error('Error cargando Comunidad:', error);
        mostrarEstadoFeed('No se ha podido cargar la comunidad. Inténtalo de nuevo dentro de unos instantes.');
    }
}

async function cargarMetricasFeed() {
    mejorasPorProyecto = {};
    comentariosPorProyecto = {};
    votosPorProyecto = {};

    if (proyectosRaiz.length === 0) return;

    const ids = proyectosRaiz.map((proyecto) => proyecto.id);
    const [mejorasRes, comentariosRes, votosRes] = await Promise.all([
        clienteSupabase
            .from('comunidad_repertorios')
            .select('id, respuesta_a_id')
            .in('respuesta_a_id', ids),
        clienteSupabase
            .from('comunidad_comentarios')
            .select('id, repertorio_id')
            .in('repertorio_id', ids),
        clienteSupabase
            .from('comunidad_valoraciones')
            .select('repertorio_id')
            .in('repertorio_id', ids)
    ]);

    (mejorasRes.data || []).forEach((mejora) => {
        mejorasPorProyecto[mejora.respuesta_a_id] = (mejorasPorProyecto[mejora.respuesta_a_id] || 0) + 1;
    });

    (comentariosRes.data || []).forEach((comentario) => {
        comentariosPorProyecto[comentario.repertorio_id] = (comentariosPorProyecto[comentario.repertorio_id] || 0) + 1;
    });

    if (votosRes.error) {
        modoVotosPersistentes = false;
        proyectosRaiz.forEach((proyecto) => {
            votosPorProyecto[proyecto.id] = Number(proyecto.likes) || 0;
        });
    } else {
        modoVotosPersistentes = true;
        (votosRes.data || []).forEach((voto) => {
            votosPorProyecto[voto.repertorio_id] = (votosPorProyecto[voto.repertorio_id] || 0) + 1;
        });
    }
}

async function cargarVotosUsuario(usuarioId) {
    votosUsuario = new Set();

    if (modoVotosPersistentes) {
        const { data, error } = await clienteSupabase
            .from('comunidad_valoraciones')
            .select('repertorio_id')
            .eq('usuario_id', usuarioId);

        if (!error) {
            votosUsuario = new Set((data || []).map((voto) => String(voto.repertorio_id)));
            return;
        }

        modoVotosPersistentes = false;
    }

    const votosLocales = JSON.parse(localStorage.getItem('jc_votos_realizados') || '[]');
    votosUsuario = new Set(votosLocales.map(String));
}

async function cargarDatosSidebar(user) {
    const nombreEmail = user.email.split('@')[0];

    const [perfilRes, proyectosRes, mejorasRes, debatesRes] = await Promise.all([
        clienteSupabase.from('perfiles').select('*').eq('id', user.id).maybeSingle(),
        clienteSupabase
            .from('comunidad_repertorios')
            .select('*', { count: 'exact', head: true })
            .eq('usuario_id', user.id)
            .is('respuesta_a_id', null),
        clienteSupabase
            .from('comunidad_repertorios')
            .select('*', { count: 'exact', head: true })
            .eq('usuario_id', user.id)
            .not('respuesta_a_id', 'is', null),
        clienteSupabase
            .from('comunidad_comentarios')
            .select('*', { count: 'exact', head: true })
            .eq('usuario_id', user.id)
    ]);

    const perfil = perfilRes.data;
    perfilComunidadActual = perfil || null;
    interesesUsuario = Array.isArray(perfil?.intereses_musicales) ? perfil.intereses_musicales : [];
    asignarTexto('user-name', perfil?.username || nombreEmail);
    asignarTexto('user-bio', perfil?.descripcion || 'Músico de la familia Julián Cerdán.');
    asignarTexto('user-fav', perfil?.marcha_favorita || 'No definida');
    asignarTexto('stat-proyectos', proyectosRes.count || 0);
    asignarTexto('stat-mejoras', mejorasRes.count || 0);
    asignarTexto('stat-debates', debatesRes.count || 0);

    if (perfil?.avatar_url && esUrlWebValida(perfil.avatar_url)) {
        document.getElementById('user-avatar').src = perfil.avatar_url;
    }
}

function aplicarFiltrosFeed() {
    const termino = normalizarTexto(document.getElementById('filtro-comunidad')?.value || '');
    const orden = document.getElementById('orden-comunidad')?.value || 'recientes';
    const vista = document.getElementById('vista-comunidad')?.value || 'todo';

    proyectosVisibles = proyectosRaiz.filter((proyecto) => {
        const coincideVista = vista === 'mios'
            ? sesionActual && String(proyecto.usuario_id) === String(sesionActual.user.id)
            : vista === 'para-ti'
                ? coincideConIntereses(proyecto)
                : true;
        if (!coincideVista) return false;
        if (!termino) return true;

        const marchas = repertorioSeguro(proyecto)
            .map((marcha) => `${marcha.titulo || ''} ${marcha.autor || ''}`)
            .join(' ');
        const contenido = normalizarTexto([
            proyecto.proyecto_nombre,
            proyecto.usuario_nombre,
            proyecto.descripcion,
            marchas
        ].join(' '));

        return contenido.includes(termino);
    });

    proyectosVisibles.sort((a, b) => {
        if (orden === 'valorados') return obtenerVotos(b.id) - obtenerVotos(a.id);
        if (orden === 'comentados') return obtenerComentarios(b.id) - obtenerComentarios(a.id);
        if (orden === 'mejoras') return obtenerMejoras(b.id) - obtenerMejoras(a.id);
        return new Date(b.created_at) - new Date(a.created_at);
    });

    renderizarFeed();
}

function coincideConIntereses(proyecto) {
    if (!sesionActual || interesesUsuario.length === 0) return true;
    const etiquetas = generarEtiquetas(calcularEstadisticas(repertorioSeguro(proyecto))).map(normalizarTexto);
    const mapa = {
        clasico: 'clasico', contemporaneo: 'contemporaneo', cornetas: 'con cornetas',
        sin_cornetas: 'predominio sin cornetas', variedad: 'alta variedad autoral'
    };
    return interesesUsuario.some((interes) => etiquetas.includes(mapa[interes]));
}

function renderizarFeed() {
    const contenedor = document.getElementById('feed-contenedor');
    if (!contenedor) return;

    asignarTexto(
        'feed-resumen',
        `${proyectosVisibles.length} ${proyectosVisibles.length === 1 ? 'propuesta encontrada' : 'propuestas encontradas'}`
    );

    if (proyectosVisibles.length === 0) {
        mostrarEstadoFeed(
            proyectosRaiz.length
                ? 'No hay propuestas que coincidan con la búsqueda.'
                : 'Todavía no hay repertorios publicados. Puedes inaugurar la comunidad creando el primero.'
        );
        return;
    }

    contenedor.innerHTML = proyectosVisibles.map(crearTarjetaProyecto).join('');
}

function crearTarjetaProyecto(proyecto) {
    const repertorio = repertorioSeguro(proyecto);
    const estadisticas = calcularEstadisticas(repertorio);
    const etiquetas = generarEtiquetas(estadisticas);
    const proyectoId = escaparAtributo(proyecto.id);
    const yaVotado = votosUsuario.has(String(proyecto.id));

    return `
        <article class="post-card">
            <div class="post-header">
                <div class="autor-info">
                    <strong>${escaparHTML(proyecto.usuario_nombre || 'Miembro de la comunidad')}</strong>
                    <span title="${escaparAtributo(formatearFechaCompleta(proyecto.created_at))}">
                        ${escaparHTML(formatearFechaRelativa(proyecto.created_at))}
                    </span>
                </div>
                <button type="button" class="btn-like ${yaVotado ? 'liked' : ''}" data-accion="like" data-id="${proyectoId}">
                    ♥ ${obtenerVotos(proyecto.id)}
                </button>
            </div>

            <h3 style="margin:0 0 9px;">${escaparHTML(proyecto.proyecto_nombre || 'Proyecto sin título')}</h3>
            <p class="post-description">${escaparHTML(proyecto.descripcion || 'Sin argumentación técnica publicada.')}</p>

            <div class="post-tags">
                ${etiquetas.map((etiqueta) => `<span class="post-tag">${escaparHTML(etiqueta)}</span>`).join('')}
            </div>

            <div class="post-stats">
                <div class="stat-item"><span>Obras</span><strong>${repertorio.length}</strong></div>
                <div class="stat-item"><span>Tiempo musical</span><strong>${formatearDuracion(estadisticas.totalSegundos)}</strong></div>
                <div class="stat-item"><span>Autores</span><strong>${estadisticas.autores}</strong></div>
            </div>

            <div class="post-social">
                <span class="post-social-count">💬 ${obtenerComentarios(proyecto.id)}</span>
                <span class="post-social-count">🛠 ${obtenerMejoras(proyecto.id)}</span>
                <span class="post-social-count">Densidad ${Number(proyecto.densidad_musical) || 0}%</span>
            </div>

            <div class="post-actions">
                <button type="button" class="btn-post-secundario" data-accion="comentar" data-id="${proyectoId}">Comentar</button>
                <button type="button" class="btn-post-secundario" data-accion="mejorar" data-id="${proyectoId}">Proponer mejora</button>
                <button type="button" class="btn-post-secundario" data-accion="compartir" data-id="${proyectoId}">Compartir</button>
                <button type="button" class="btn-ver-cruceta" data-accion="ver" data-id="${proyectoId}">Ver repertorio</button>
            </div>
        </article>
    `;
}

async function cargarNotificacionesComunidad(usuarioId) {
    const boton = document.getElementById('btn-notificaciones-comunidad');
    if (!boton) return;
    try {
        const { data, error } = await clienteSupabase.from('notificaciones_comunidad')
            .select('*').eq('destinatario_id', usuarioId).order('created_at', { ascending: false }).limit(20);
        if (error) throw error;
        const notificaciones = data || [];
        const pendientes = notificaciones.filter((item) => !item.leida).length;
        boton.hidden = false;
        boton.innerHTML = `🔔 Actividad${pendientes ? ` <span>${pendientes}</span>` : ''}`;
        const lista = document.getElementById('lista-notificaciones');
        if (lista) lista.innerHTML = notificaciones.length
            ? notificaciones.map(crearItemNotificacion).join('')
            : '<p class="notificacion-vacia">Todavía no tienes actividad nueva.</p>';
    } catch (error) {
        console.error('No se han podido cargar las notificaciones:', error);
    }
}

function crearItemNotificacion(item) {
    const accion = item.tipo === 'comentario' ? 'comentó tu propuesta' : 'apoyó tu propuesta';
    return `<button type="button" class="notificacion-item ${item.leida ? '' : 'nueva'}" data-notificacion-id="${escaparAtributo(item.id)}" data-proyecto-id="${escaparAtributo(item.repertorio_id)}">
        <strong>${escaparHTML(item.actor_nombre || 'Alguien')} ${accion}</strong>
        ${item.resumen ? `<span>${escaparHTML(item.resumen)}</span>` : ''}
        <small>${escaparHTML(formatearFechaRelativa(item.created_at))}</small>
    </button>`;
}

function alternarPanelNotificaciones() {
    document.getElementById('panel-notificaciones-comunidad')?.classList.toggle('abierto');
}

async function gestionarNotificacion(evento) {
    const item = evento.target.closest('[data-notificacion-id]');
    if (!item || !sesionActual) return;
    await clienteSupabase.from('notificaciones_comunidad').update({ leida: true })
        .eq('id', item.dataset.notificacionId).eq('destinatario_id', sesionActual.user.id);
    document.getElementById('panel-notificaciones-comunidad')?.classList.remove('abierto');
    await Promise.all([abrirModal(item.dataset.proyectoId), cargarNotificacionesComunidad(sesionActual.user.id)]);
}

async function crearNotificacionProyecto(idProyecto, tipo, resumen = '') {
    if (!sesionActual) return;
    const proyecto = proyectosRaiz.find((item) => String(item.id) === String(idProyecto));
    if (!proyecto?.usuario_id || String(proyecto.usuario_id) === String(sesionActual.user.id)) return;
    const campoPreferencia = tipo === 'comentario' ? 'notificar_comentarios' : 'notificar_valoraciones';
    try {
        const { data: preferencias } = await clienteSupabase.from('perfiles')
            .select(`username, ${campoPreferencia}`).eq('id', proyecto.usuario_id).maybeSingle();
        if (preferencias && preferencias[campoPreferencia] === false) return;
        const nombreActor = perfilComunidadActual?.username || sesionActual.user.email?.split('@')[0] || 'Miembro';
        const { error } = await clienteSupabase.from('notificaciones_comunidad').insert({
            destinatario_id: proyecto.usuario_id,
            actor_id: sesionActual.user.id,
            actor_nombre: nombreActor,
            repertorio_id: proyecto.id,
            tipo,
            resumen: String(resumen || proyecto.proyecto_nombre || '').slice(0, 180)
        });
        if (error) throw error;
    } catch (error) {
        console.error('No se ha podido registrar la notificación:', error);
    }
}

async function gestionarAccionFeed(evento) {
    const boton = evento.target.closest('[data-accion][data-id]');
    if (!boton) return;

    const { accion, id } = boton.dataset;

    if (accion === 'like') await darLike(id);
    if (accion === 'ver') await abrirModal(id);
    if (accion === 'comentar') {
        await abrirModal(id);
        document.getElementById('input-comentario')?.focus();
        document.getElementById('contenedor-comentarios')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (accion === 'mejorar') await prepararMejora(id);
    if (accion === 'compartir') compartirProyecto(id);
}

async function abrirModal(id, actualizarUrl = true) {
    idAbierto = id;
    const proyecto = proyectosRaiz.find((item) => String(item.id) === String(id));
    if (!proyecto) return;

    asignarTexto('modal-titulo', proyecto.proyecto_nombre || 'Proyecto');
    renderizarDetalleProyecto(proyecto, false);

    const botonMejorar = document.getElementById('btn-mejorar');
    botonMejorar.onclick = () => prepararMejora(proyecto.id);

    document.getElementById('modal-cruceta').style.display = 'flex';
    await Promise.all([cargarHiloMejoras(id), cargarComentarios(id)]);

    if (actualizarUrl) {
        const url = obtenerUrlProyecto(id);
        window.history.replaceState({}, '', url);
    }
}

async function abrirProyectoCompartido() {
    const id = new URLSearchParams(window.location.search).get('proyecto');
    if (!id) return;

    const existe = proyectosRaiz.some((proyecto) => String(proyecto.id) === String(id));
    if (existe) await abrirModal(id, false);
}

function compartirProyecto(id) {
    const proyecto = proyectosRaiz.find((item) => String(item.id) === String(id));
    if (!proyecto) return;

    const repertorio = repertorioSeguro(proyecto);
    const titulo = proyecto.proyecto_nombre || 'Proyecto de repertorio';

    abrirCompartir({
        titulo,
        url: obtenerUrlProyecto(id),
        texto: `🎼 Mira este repertorio propuesto en la Comunidad de la Banda de Música Julián Cerdán:\n\n${titulo}\n${repertorio.length} obras · por ${proyecto.usuario_nombre || 'un miembro de la comunidad'}`
    });
}

function obtenerUrlProyecto(id) {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('proyecto', id);
    return url.href;
}

function renderizarDetalleProyecto(proyecto, esMejora) {
    const repertorio = repertorioSeguro(proyecto);
    const estadisticas = calcularEstadisticas(repertorio);
    const lista = document.getElementById('modal-lista-marchas');
    const color = esMejora ? '#3498db' : 'var(--color-oro)';

    lista.innerHTML = `
        <div style="background:${esMejora ? 'rgba(52,152,219,0.1)' : 'rgba(212,175,55,0.1)'}; border:1px dashed ${color}; padding:15px; border-radius:6px; margin-bottom:16px; font-size:0.82rem; line-height:1.55; color:#ccc;">
            <strong style="color:${color}; display:block; margin-bottom:5px;">
                ${esMejora ? 'ARGUMENTO DE LA MEJORA' : 'NOTAS DEL AUTOR'}
            </strong>
            ${escaparHTML(proyecto.descripcion || 'Sin descripción proporcionada.')}
        </div>
        <div class="modal-project-summary">
            <div class="modal-summary-box"><strong>${repertorio.length}</strong><span>Obras</span></div>
            <div class="modal-summary-box"><strong>${formatearDuracion(estadisticas.totalSegundos)}</strong><span>Tiempo</span></div>
            <div class="modal-summary-box"><strong>${estadisticas.autores}</strong><span>Autores</span></div>
            <div class="modal-summary-box"><strong>${Math.round(estadisticas.porcentajeCornetas)}%</strong><span>Cornetas</span></div>
        </div>
        <h4 style="color:#888; font-size:0.7rem; text-transform:uppercase;">${esMejora ? 'Versión propuesta' : 'Cruceta original'}</h4>
        ${repertorio.map((marcha, indice) => crearFilaMarcha(marcha, indice, color)).join('')}
    `;
}

function crearFilaMarcha(marcha, indice, color) {
    const tieneAudio = campoRelleno(marcha.url_audio);
    const tieneYoutube = esUrlWebValida(marcha.url_youtube);

    return `
        <div class="item-marcha" style="border-left-color:${color}; margin-bottom:8px;">
            <div class="item-marcha-info">
                <span style="color:${color}; font-size:0.6rem;">#${indice + 1} · ${escaparHTML(marcha.calle || 'S/E')}</span>
                <strong>${escaparHTML(marcha.titulo || 'Marcha sin título')}</strong>
                <small>${escaparHTML(marcha.autor || 'Autor desconocido')} · ${formatearDuracion(marcha.duracion_seg)}</small>
            </div>
            <div class="item-marcha-actions">
                <button type="button" class="btn-media" data-modal-accion="audio" data-indice="${indice}" ${tieneAudio ? '' : 'disabled'}>▶ Oír</button>
                <button type="button" class="btn-media" data-modal-accion="youtube" data-indice="${indice}" ${tieneYoutube ? '' : 'disabled'}>YouTube</button>
            </div>
        </div>
    `;
}

function gestionarAccionModal(evento) {
    const boton = evento.target.closest('[data-modal-accion]');
    if (!boton) return;

    const proyecto = obtenerProyectoVisibleModal();
    const marcha = repertorioSeguro(proyecto)[Number(boton.dataset.indice)];
    if (!marcha) return;

    if (boton.dataset.modalAccion === 'audio') reproducirEnComunidad(marcha);
    if (boton.dataset.modalAccion === 'youtube') abrirYoutube(marcha);
}

function obtenerProyectoVisibleModal() {
    const mejoraId = document.getElementById('modal-lista-marchas')?.dataset.mejoraId;

    if (mejoraId && window.mejoraComunidadActiva && String(window.mejoraComunidadActiva.id) === mejoraId) {
        return window.mejoraComunidadActiva;
    }

    return proyectosRaiz.find((proyecto) => String(proyecto.id) === String(idAbierto));
}

async function cargarHiloMejoras(idPadre) {
    const contenedor = document.getElementById('contenedor-hilo-mejoras');
    if (!contenedor) return;

    const { data, error } = await clienteSupabase
        .from('comunidad_repertorios')
        .select('*')
        .eq('respuesta_a_id', idPadre)
        .order('created_at', { ascending: true });

    if (error) {
        contenedor.innerHTML = '<p style="font-size:0.7rem; color:#777;">No se han podido cargar las mejoras.</p>';
        return;
    }

    contenedor.innerHTML = '<h4 style="color:#3498db; font-size:0.7rem; text-transform:uppercase; margin-top:20px;">Hilo de mejoras propuestas</h4>';

    if (!data?.length) {
        contenedor.innerHTML += '<p style="font-size:0.7rem; color:#555;">Nadie ha propuesto mejoras todavía.</p>';
        return;
    }

    contenedor.innerHTML += data.map((mejora) => `
        <article class="mejora-card">
            <div class="mejora-card-header">
                ${escaparHTML(mejora.usuario_nombre || 'Miembro')} · ${escaparHTML(formatearFechaRelativa(mejora.created_at))}
            </div>
            <h5>${escaparHTML(mejora.proyecto_nombre || 'Propuesta de mejora')}</h5>
            <button type="button" class="btn-media" onclick="verDetalleMejora('${escaparAtributo(mejora.id)}')">Comparar versión</button>
        </article>
    `).join('');
}

async function verDetalleMejora(idMejora) {
    const original = proyectosRaiz.find((proyecto) => String(proyecto.id) === String(idAbierto));
    if (!original) return;

    const { data: mejora, error } = await clienteSupabase
        .from('comunidad_repertorios')
        .select('*')
        .eq('id', idMejora)
        .single();

    if (error || !mejora) return;

    window.mejoraComunidadActiva = mejora;
    const comparacion = compararRepertorios(repertorioSeguro(original), repertorioSeguro(mejora));

    renderizarDetalleProyecto(mejora, true);
    const lista = document.getElementById('modal-lista-marchas');
    lista.dataset.mejoraId = String(mejora.id);
    lista.insertAdjacentHTML('afterbegin', crearResumenComparacion(comparacion));
    lista.insertAdjacentHTML(
        'beforeend',
        '<button type="button" onclick="volverAOriginal()" style="width:100%; margin-top:12px; background:#333; color:white; border:none; padding:11px; border-radius:5px; cursor:pointer; font-weight:bold;">VOLVER A LA ORIGINAL</button>'
    );
}

function crearResumenComparacion(comparacion) {
    const cambios = [
        ...comparacion.anadidas.map((texto) => `<div class="cambio-item cambio-anadida">+ Añadida: ${escaparHTML(texto)}</div>`),
        ...comparacion.eliminadas.map((texto) => `<div class="cambio-item cambio-eliminada">− Eliminada: ${escaparHTML(texto)}</div>`),
        ...comparacion.movidas.map((texto) => `<div class="cambio-item cambio-movida">↕ Reordenada: ${escaparHTML(texto)}</div>`),
        ...comparacion.ubicaciones.map((texto) => `<div class="cambio-item cambio-ubicacion">📍 Nueva ubicación: ${escaparHTML(texto)}</div>`)
    ];

    return `
        <section style="margin-bottom:20px;">
            <h4 style="color:#67b7ec; margin:0; font-size:0.75rem; text-transform:uppercase;">Comparación con la original</h4>
            <div class="comparador-resumen">
                <div class="comparador-dato"><strong>${comparacion.anadidas.length}</strong><span>Añadidas</span></div>
                <div class="comparador-dato"><strong>${comparacion.eliminadas.length}</strong><span>Eliminadas</span></div>
                <div class="comparador-dato"><strong>${comparacion.movidas.length}</strong><span>Movidas</span></div>
                <div class="comparador-dato"><strong>${comparacion.ubicaciones.length}</strong><span>Ubicaciones</span></div>
            </div>
            <div class="cambio-lista">
                ${cambios.length ? cambios.join('') : '<div class="cambio-item cambio-movida">La propuesta conserva la estructura musical original.</div>'}
            </div>
        </section>
    `;
}

function volverAOriginal() {
    const original = proyectosRaiz.find((proyecto) => String(proyecto.id) === String(idAbierto));
    if (!original) return;

    window.mejoraComunidadActiva = null;
    const lista = document.getElementById('modal-lista-marchas');
    delete lista.dataset.mejoraId;
    renderizarDetalleProyecto(original, false);
}

function compararRepertorios(original, propuesta) {
    const mapaOriginal = new Map(original.map((marcha, indice) => [claveMarcha(marcha), { marcha, indice }]));
    const mapaPropuesta = new Map(propuesta.map((marcha, indice) => [claveMarcha(marcha), { marcha, indice }]));
    const resultado = { anadidas: [], eliminadas: [], movidas: [], ubicaciones: [] };

    mapaPropuesta.forEach(({ marcha, indice }, clave) => {
        const anterior = mapaOriginal.get(clave);

        if (!anterior) {
            resultado.anadidas.push(marcha.titulo || 'Marcha sin título');
            return;
        }

        if (anterior.indice !== indice) {
            resultado.movidas.push(`${marcha.titulo}: posición ${anterior.indice + 1} → ${indice + 1}`);
        }

        if (normalizarTexto(anterior.marcha.calle || 'S/E') !== normalizarTexto(marcha.calle || 'S/E')) {
            resultado.ubicaciones.push(`${marcha.titulo}: ${anterior.marcha.calle || 'S/E'} → ${marcha.calle || 'S/E'}`);
        }
    });

    mapaOriginal.forEach(({ marcha }, clave) => {
        if (!mapaPropuesta.has(clave)) {
            resultado.eliminadas.push(marcha.titulo || 'Marcha sin título');
        }
    });

    return resultado;
}

async function prepararMejora(id) {
    const usuario = await obtenerUsuario();
    if (!usuario) return;

    const proyecto = proyectosRaiz.find((item) => String(item.id) === String(id));
    if (!proyecto) return;

    localStorage.setItem('jc_simulacion_borrador', JSON.stringify(repertorioSeguro(proyecto)));
    localStorage.setItem('jc_simulacion_nombre', `Mejora de: ${proyecto.proyecto_nombre || 'Proyecto'}`);
    localStorage.setItem('jc_simulacion_descripcion', '');
    localStorage.setItem('jc_simulacion_horas', proyecto.horas_estimadas || 6);
    localStorage.setItem('jc_simulacion_parent_id', proyecto.id);
    window.location.href = 'simulacion.html';
}

async function darLike(id) {
    const usuario = await obtenerUsuario();
    if (!usuario) return;

    const yaVotado = votosUsuario.has(String(id));

    try {
        if (modoVotosPersistentes) {
            const consulta = yaVotado
                ? clienteSupabase
                    .from('comunidad_valoraciones')
                    .delete()
                    .eq('repertorio_id', id)
                    .eq('usuario_id', usuario.id)
                : clienteSupabase
                    .from('comunidad_valoraciones')
                    .insert([{ repertorio_id: id, usuario_id: usuario.id }]);

            const { error } = await consulta;
            if (error) throw error;
        } else {
            await actualizarLikeLegacy(id, yaVotado);
        }

        if (yaVotado) {
            votosUsuario.delete(String(id));
            votosPorProyecto[id] = Math.max(0, obtenerVotos(id) - 1);
        } else {
            votosUsuario.add(String(id));
            votosPorProyecto[id] = obtenerVotos(id) + 1;
            await crearNotificacionProyecto(id, 'valoracion');
        }

        guardarVotosLocales();
        renderizarFeed();
    } catch (error) {
        console.error('Error actualizando valoración:', error);
    }
}

async function actualizarLikeLegacy(id, yaVotado) {
    const proyecto = proyectosRaiz.find((item) => String(item.id) === String(id));
    const actual = Number(proyecto?.likes) || 0;
    const nuevoTotal = yaVotado ? Math.max(0, actual - 1) : actual + 1;
    const { error } = await clienteSupabase
        .from('comunidad_repertorios')
        .update({ likes: nuevoTotal })
        .eq('id', id);

    if (error) throw error;
    if (proyecto) proyecto.likes = nuevoTotal;
}

function guardarVotosLocales() {
    localStorage.setItem('jc_votos_realizados', JSON.stringify([...votosUsuario]));
}

async function enviarComentario() {
    const usuario = await obtenerUsuario();
    if (!usuario || !idAbierto) return;

    const input = document.getElementById('input-comentario');
    const texto = input.value.trim();
    if (!texto) return;

    input.disabled = true;

    try {
        const { data: perfil } = await clienteSupabase
            .from('perfiles')
            .select('username')
            .eq('id', usuario.id)
            .maybeSingle();

        const nombre = perfil?.username || usuario.email.split('@')[0];
        const { error } = await clienteSupabase
            .from('comunidad_comentarios')
            .insert([{
                repertorio_id: idAbierto,
                usuario_id: usuario.id,
                comentario: texto,
                usuario_nombre: nombre
            }]);

        if (error) throw error;

        input.value = '';
        comentariosPorProyecto[idAbierto] = obtenerComentarios(idAbierto) + 1;
        await crearNotificacionProyecto(idAbierto, 'comentario', texto);
        await Promise.all([cargarComentarios(idAbierto), cargarDatosSidebar(usuario)]);
        renderizarFeed();
    } catch (error) {
        console.error('Error guardando comentario:', error);
        alert(`No se ha podido guardar el comentario: ${error.message}`);
    } finally {
        input.disabled = false;
        input.focus();
    }
}

async function cargarComentarios(id) {
    const contenedor = document.getElementById('contenedor-comentarios');
    const { data, error } = await clienteSupabase
        .from('comunidad_comentarios')
        .select('*')
        .eq('repertorio_id', id)
        .order('created_at', { ascending: true });

    if (error) {
        contenedor.innerHTML = '<p style="font-size:0.7rem; color:#777;">No se han podido cargar los comentarios.</p>';
        return;
    }

    contenedor.innerHTML = data?.length
        ? data.map((comentario) => `
            <div class="comentario-item">
                <div class="comentario-meta">
                    <strong>${escaparHTML(comentario.usuario_nombre || 'Miembro')}</strong>
                    <time>${escaparHTML(formatearFechaRelativa(comentario.created_at))}</time>
                </div>
                <span>${escaparHTML(comentario.comentario || '')}</span>
            </div>
        `).join('')
        : '<p style="font-size:0.7rem; color:#555;">Sin comentarios técnicos aún.</p>';
}

function reproducirEnComunidad(marcha) {
    if (!campoRelleno(marcha.url_audio)) return;

    const contenedor = document.getElementById('community-player');
    const audio = document.getElementById('community-player-audio');

    asignarTexto('community-player-title', marcha.titulo || 'Marcha');
    asignarTexto('community-player-author', marcha.autor || 'Autor desconocido');
    if (audio.src !== marcha.url_audio) audio.src = marcha.url_audio;

    contenedor.classList.add('activo');
    audio.play().catch(() => {});
}

function cerrarReproductorComunidad() {
    const audio = document.getElementById('community-player-audio');
    audio.pause();
    document.getElementById('community-player').classList.remove('activo');
}

function abrirYoutube(marcha) {
    if (esUrlWebValida(marcha.url_youtube)) {
        window.open(marcha.url_youtube, '_blank', 'noopener,noreferrer');
    }
}

async function obtenerUsuario() {
    if (sesionActual?.user) return sesionActual.user;

    const { data: { session } } = await clienteSupabase.auth.getSession();
    sesionActual = session;

    if (!session) {
        document.getElementById('modal-auth-invitation').style.display = 'flex';
        return null;
    }

    return session.user;
}

function cerrarInvitacion() {
    document.getElementById('modal-auth-invitation').style.display = 'none';
}

function cerrarModal() {
    document.getElementById('modal-cruceta').style.display = 'none';
    const lista = document.getElementById('modal-lista-marchas');
    if (lista) delete lista.dataset.mejoraId;
    window.mejoraComunidadActiva = null;

    const url = new URL(window.location.href);
    if (url.searchParams.has('proyecto')) {
        url.searchParams.delete('proyecto');
        window.history.replaceState({}, '', url);
    }
}

function generarEtiquetas(estadisticas) {
    const etiquetas = [];

    if (estadisticas.total > 0) {
        if (estadisticas.porcentajeCornetas >= 70) etiquetas.push('Con cornetas');
        else if (estadisticas.porcentajeCornetas <= 30) etiquetas.push('Predominio sin cornetas');
        else etiquetas.push('Equilibrado');

        if (estadisticas.autores / estadisticas.total >= 0.65) etiquetas.push('Alta variedad autoral');
        if (estadisticas.anoMedio && estadisticas.anoMedio < 1975) etiquetas.push('Clásico');
        if (estadisticas.anoMedio && estadisticas.anoMedio >= 2000) etiquetas.push('Contemporáneo');
    }

    return etiquetas.slice(0, 3);
}

function calcularEstadisticas(repertorio) {
    const totalSegundos = repertorio.reduce((total, marcha) => total + (Number(marcha.duracion_seg) || 0), 0);
    const autores = new Set(
        repertorio.map((marcha) => normalizarTexto(marcha.autor || '')).filter(Boolean)
    ).size;
    const cornetas = repertorio.filter(tieneCornetas).length;
    const anos = repertorio.map((marcha) => Number(marcha.ano)).filter((ano) => ano > 1800 && ano < 2200);

    return {
        total: repertorio.length,
        totalSegundos,
        autores,
        porcentajeCornetas: repertorio.length ? (cornetas / repertorio.length) * 100 : 0,
        anoMedio: anos.length ? anos.reduce((total, ano) => total + ano, 0) / anos.length : 0
    };
}

function repertorioSeguro(proyecto) {
    return Array.isArray(proyecto?.repertorio_json) ? proyecto.repertorio_json : [];
}

function claveMarcha(marcha) {
    return campoRelleno(marcha.id_marcha)
        ? `id:${marcha.id_marcha}`
        : `titulo:${normalizarTexto(marcha.titulo || '')}`;
}

function obtenerVotos(id) {
    return Number(votosPorProyecto[id]) || 0;
}

function obtenerComentarios(id) {
    return Number(comentariosPorProyecto[id]) || 0;
}

function obtenerMejoras(id) {
    return Number(mejorasPorProyecto[id]) || 0;
}

function mostrarEstadoFeed(mensaje) {
    const contenedor = document.getElementById('feed-contenedor');
    if (contenedor) contenedor.innerHTML = `<div class="estado-feed">${escaparHTML(mensaje)}</div>`;
}

function formatearFechaRelativa(valor) {
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return 'Fecha desconocida';

    const diferencia = fecha.getTime() - Date.now();
    const minutos = Math.round(diferencia / 60000);
    const horas = Math.round(diferencia / 3600000);
    const dias = Math.round(diferencia / 86400000);
    const formato = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

    if (Math.abs(minutos) < 60) return formato.format(minutos, 'minute');
    if (Math.abs(horas) < 24) return formato.format(horas, 'hour');
    if (Math.abs(dias) < 30) return formato.format(dias, 'day');
    return formatearFechaCompleta(valor);
}

function formatearFechaCompleta(valor) {
    const fecha = new Date(valor);
    if (Number.isNaN(fecha.getTime())) return '';
    return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatearDuracion(segundos) {
    const total = Math.max(0, Math.round(Number(segundos) || 0));
    const minutos = Math.floor(total / 60);
    const resto = total % 60;
    return `${minutos}:${String(resto).padStart(2, '0')}`;
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

