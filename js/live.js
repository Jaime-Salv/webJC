/* ============================================================
   DIRECTO - REPERTORIO EN VIVO Y CHAT
   Archivo usado por: templates/live.html
   ============================================================ */

const parametrosURL = new URLSearchParams(window.location.search);
const idProcesion = parametrosURL.get('id');

let catalogoMaestro = [];
let canalDirecto = null;
const CLAVE_CACHE_DIRECTO = `jc_directo_cache_${idProcesion || 'sin-id'}`;

document.addEventListener('DOMContentLoaded', inicializarDirecto);

async function inicializarDirecto() {
    if (!idProcesion) {
        mostrarErrorDirecto('No se ha indicado ninguna procesión.');
        return;
    }

    await cargarCabeceraEvento();
    await cargarCatalogoEnMemoria();
    await cargarMarchas();
    await cargarChat();

    activarSuscripcionesRealtime();
    prepararEventosChat();
    window.addEventListener('online', actualizarConexionDirecto);
    window.addEventListener('offline', actualizarConexionDirecto);
    actualizarConexionDirecto();
}

function textoSeguro(valor) {
    if (valor === null || valor === undefined) {
        return '';
    }

    return String(valor);
}

function limpiarElemento(elemento) {
    while (elemento.firstChild) {
        elemento.removeChild(elemento.firstChild);
    }
}

function crearMensajeEstado(texto) {
    const p = document.createElement('p');
    p.className = 'estado-vacio';
    p.textContent = texto;
    return p;
}

function mostrarErrorDirecto(texto) {
    const header = document.getElementById('txt-hermandad-header');
    const timeline = document.getElementById('timeline-contenedor');

    if (header) {
        header.textContent = 'Error';
    }

    if (timeline) {
        limpiarElemento(timeline);
        timeline.appendChild(crearMensajeEstado(texto));
    }
}

function obtenerTituloMarcha(idMarcha) {
    const marchaInfo = catalogoMaestro.find((marcha) => {
        return Number(marcha.id_marcha) === Number(idMarcha);
    });

    if (!marchaInfo) {
        return 'Marcha desconocida';
    }

    return marchaInfo.titulo;
}

async function cargarCabeceraEvento() {
    const { data, error } = await clienteSupabase
        .from('maestro_procesiones')
        .select('*')
        .eq('id_procesion', idProcesion)
        .maybeSingle();

    if (error) {
        console.error('Error cargando cabecera del directo:', error);
        mostrarErrorDirecto('No se ha podido cargar la procesión.');
        return;
    }

    if (!data) {
        mostrarErrorDirecto('No existe ninguna procesión con ese ID.');
        return;
    }

    const header = document.getElementById('txt-hermandad-header');

    if (header) {
        header.textContent = textoSeguro(data.hermandad);
    }

    if (data.url_foto) {
        document.body.style.backgroundImage =
            `linear-gradient(to bottom, rgba(10,10,10,0.7) 0%, rgba(5,5,5,0.98) 100%), url('${data.url_foto}')`;

        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center 30%';
        document.body.style.backgroundAttachment = 'fixed';
    }
}

async function cargarCatalogoEnMemoria() {
    const { data, error } = await clienteSupabase
        .from('catalogo_marchas')
        .select('id_marcha, titulo');

    if (error) {
        console.error('Error cargando catálogo:', error);
        catalogoMaestro = [];
        return;
    }

    catalogoMaestro = data || [];
}

async function cargarMarchas() {
    const contenedor = document.getElementById('timeline-contenedor');

    if (!contenedor) {
        return;
    }

    let data = null;
    let error = null;
    let usandoCache = false;

    try {
        const respuesta = await clienteSupabase
            .from('repertorio_transaccional')
            .select('*')
            .eq('id_procesion', idProcesion)
            .order('orden', { ascending: false });
        data = respuesta.data;
        error = respuesta.error;
    } catch (errorRed) {
        error = errorRed;
    }

    if (error) {
        try {
            const cache = JSON.parse(localStorage.getItem(CLAVE_CACHE_DIRECTO) || 'null');
            if (cache && Array.isArray(cache.data)) {
                data = cache.data;
                usandoCache = true;
            }
        } catch (_) {
            data = null;
        }
    } else {
        localStorage.setItem(CLAVE_CACHE_DIRECTO, JSON.stringify({ data: data || [], actualizadaEn: new Date().toISOString() }));
    }

    limpiarElemento(contenedor);

    if (error && !usandoCache) {
        console.error('Error cargando marchas:', error);
        contenedor.appendChild(crearMensajeEstado('No se ha podido cargar el repertorio.'));
        actualizarResumenDirecto([], true);
        return;
    }

    actualizarResumenDirecto(data || [], usandoCache);

    if (!data || data.length === 0) {
        contenedor.appendChild(crearMensajeEstado('Esperando marchas...'));
        return;
    }

    data.forEach((registro, index) => {
        const esLaUltima = index === 0;

        const card = document.createElement('div');
        card.className = esLaUltima ? 'marcha-live-card ultima' : 'marcha-live-card';

        const info = document.createElement('div');
        info.className = 'ml-info';

        const fase = document.createElement('div');
        fase.className = 'ml-fase';

        if (esLaUltima) {
            fase.textContent = `🔴 SONANDO AHORA: ${textoSeguro(registro.fase)}`;
        } else {
            fase.textContent = `INTERPRETADA · ${textoSeguro(registro.fase)}`;
        }

        const titulo = document.createElement('h4');
        titulo.className = 'ml-titulo';
        titulo.textContent = obtenerTituloMarcha(registro.id_marcha);

        const orden = document.createElement('div');
        orden.className = 'ml-orden';
        orden.textContent = `#${textoSeguro(registro.orden)}`;

        info.appendChild(fase);
        info.appendChild(titulo);

        card.appendChild(info);
        card.appendChild(orden);

        contenedor.appendChild(card);
    });
}

function actualizarConexionDirecto() {
    const elemento = document.getElementById('live-conexion');
    if (!elemento) return;
    elemento.textContent = navigator.onLine ? 'En línea' : 'Sin cobertura';
    elemento.classList.toggle('offline', !navigator.onLine);
}

function actualizarResumenDirecto(marchas, usandoCache = false) {
    const ahora = document.getElementById('live-ahora');
    const total = document.getElementById('live-total');
    const actualizado = document.getElementById('live-actualizado');
    if (ahora) ahora.textContent = marchas.length ? obtenerTituloMarcha(marchas[0].id_marcha) : 'Esperando';
    if (total) total.textContent = textoSeguro(marchas.length);
    if (actualizado) {
        actualizado.textContent = usandoCache
            ? 'Mostrando la última información guardada en este dispositivo.'
            : `Actualizado a las ${new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
        actualizado.classList.toggle('cache', usandoCache);
    }
    actualizarConexionDirecto();
}

async function cargarChat() {
    const cajaMensajes = document.getElementById('caja-mensajes');

    if (!cajaMensajes) {
        return;
    }

    const { data, error } = await clienteSupabase
        .from('directo_chat')
        .select('*')
        .eq('id_procesion', idProcesion)
        .order('created_at', { ascending: true });

    limpiarElemento(cajaMensajes);

    if (error) {
        console.error('Error cargando chat:', error);
        cajaMensajes.appendChild(crearMensajeEstado('No se ha podido cargar el chat.'));
        return;
    }

    if (!data || data.length === 0) {
        const mensajeVacio = crearMensajeEstado('Sé el primero en comentar.');
        mensajeVacio.id = 'mensaje-chat-vacio';
        cajaMensajes.appendChild(mensajeVacio);
        return;
    }

    data.forEach((mensaje) => {
        pintarMensaje(mensaje);
    });
}

function pintarMensaje(mensajeChat) {
    const cajaMensajes = document.getElementById('caja-mensajes');

    if (!cajaMensajes) {
        return;
    }

    const mensajeVacio = document.getElementById('mensaje-chat-vacio');

    if (mensajeVacio) {
        mensajeVacio.remove();
    }

    const item = document.createElement('div');
    item.className = 'mensaje-chat';

    const usuario = document.createElement('strong');
    usuario.style.color = 'var(--color-oro)';
    usuario.textContent = `${textoSeguro(mensajeChat.usuario_nombre)}: `;

    const mensaje = document.createElement('span');
    mensaje.style.color = '#ccc';
    mensaje.textContent = textoSeguro(mensajeChat.mensaje);

    item.appendChild(usuario);
    item.appendChild(mensaje);

    cajaMensajes.appendChild(item);
    cajaMensajes.scrollTop = cajaMensajes.scrollHeight;
}

function prepararEventosChat() {
    const inputChat = document.getElementById('input-chat');
    const btnEnviarChat = document.getElementById('btn-enviar-chat');

    if (btnEnviarChat) {
        btnEnviarChat.addEventListener('click', enviarMensaje);
    }

    if (inputChat) {
        inputChat.addEventListener('keydown', (evento) => {
            if (evento.key === 'Enter') {
                enviarMensaje();
            }
        });
    }
}

async function enviarMensaje() {
    const inputChat = document.getElementById('input-chat');

    if (!inputChat) {
        return;
    }

    const texto = inputChat.value.trim();

    if (!texto) {
        return;
    }

    const { data: sesionData, error: errorSesion } = await clienteSupabase.auth.getSession();

    if (errorSesion) {
        console.error('Error obteniendo sesión:', errorSesion);
        alert('No se ha podido comprobar tu sesión.');
        return;
    }

    const session = sesionData.session;

    if (!session) {
        alert('Debes iniciar sesión para usar el chat en vivo.');
        return;
    }

    const { data: perfil, error: errorPerfil } = await clienteSupabase
        .from('perfiles')
        .select('username')
        .eq('id', session.user.id)
        .maybeSingle();

    if (errorPerfil) {
        console.error('Error obteniendo perfil:', errorPerfil);
    }

    const nombreUsuario = perfil?.username || session.user.email.split('@')[0];

    inputChat.value = '';

    const { error } = await clienteSupabase
        .from('directo_chat')
        .insert([{
            id_procesion: Number(idProcesion),
            usuario_id: session.user.id,
            usuario_nombre: nombreUsuario,
            mensaje: texto
        }]);

    if (error) {
        console.error('Error enviando mensaje:', error);
        alert('No se ha podido enviar el mensaje.');
    }
}

function activarSuscripcionesRealtime() {
    if (canalDirecto) {
        clienteSupabase.removeChannel(canalDirecto);
    }

    canalDirecto = clienteSupabase
        .channel(`canal-directo-${idProcesion}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'repertorio_transaccional'
            },
            (payload) => {
                const idCambio = payload.new?.id_procesion || payload.old?.id_procesion;

                if (Number(idCambio) === Number(idProcesion)) {
                    cargarMarchas();
                }
            }
        )
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'directo_chat'
            },
            (payload) => {
                if (Number(payload.new?.id_procesion) === Number(idProcesion)) {
                    pintarMensaje(payload.new);
                }
            }
        )
        .subscribe((estado) => {
            console.log('Estado canal directo:', estado);
        });
}
