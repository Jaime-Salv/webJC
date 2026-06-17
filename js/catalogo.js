/* ============================================================
   CATÁLOGO WIKIPEDIA DE MARCHAS
   ============================================================ */

let catalogoGlobal = [];

document.addEventListener('DOMContentLoaded', () => {
    cargarCatalogoMaestro();
    prepararEventosCatalogo();
    gestionarHeaderSmart();
});

function prepararEventosCatalogo() {
    const filtroTexto = document.getElementById('filtro-texto');
    const filtroAutor = document.getElementById('filtro-autor');
    const filtroEstilo = document.getElementById('filtro-estilo');
    const filtroAnoMin = document.getElementById('filtro-ano-min');
    const filtroAnoMax = document.getElementById('filtro-ano-max');

    if (filtroTexto) filtroTexto.addEventListener('input', aplicarFiltros);
    if (filtroAutor) filtroAutor.addEventListener('change', aplicarFiltros);
    if (filtroEstilo) filtroEstilo.addEventListener('change', aplicarFiltros);
    if (filtroAnoMin) filtroAnoMin.addEventListener('input', aplicarFiltros);
    if (filtroAnoMax) filtroAnoMax.addEventListener('input', aplicarFiltros);

    const btnCerrar = document.getElementById('btn-cerrar-modal');
    const modal = document.getElementById('modal-marcha');
    const btnCerrarMiniPlayer = document.getElementById('mini-player-cerrar');

    if (btnCerrar) {
        btnCerrar.addEventListener('click', cerrarFichaMarcha);
    }

    if (modal) {
        modal.addEventListener('click', (evento) => {
            if (evento.target.id === 'modal-marcha') {
                cerrarFichaMarcha();
            }
        });
    }

    if (btnCerrarMiniPlayer) {
        btnCerrarMiniPlayer.addEventListener('click', cerrarMiniPlayer);
    }

    document.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape') {
            cerrarFichaMarcha();
        }
    });
}

async function cargarCatalogoMaestro() {
    try {
        const { data, error } = await clienteSupabase
            .from('catalogo_marchas')
            .select('*')
            .order('id_marcha', { ascending: true });

        if (error) {
            throw error;
        }

        catalogoGlobal = data || [];

        poblarSelectores(catalogoGlobal);
        renderizarTabla(catalogoGlobal);
        calcularKPIs(catalogoGlobal);

    } catch (error) {
        console.error('Error de conexión:', error);

        const tbody = document.getElementById('tabla-catalogo-body');

        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" style="color:#ff3b3b; text-align:center; padding: 40px;">
                        Error: ${escaparHTML(error.message)}
                    </td>
                </tr>
            `;
        }
    }
}

function poblarSelectores(datos) {
    const selectorAutor = document.getElementById('filtro-autor');

    if (!selectorAutor) {
        return;
    }

    const autoresUnicos = [
        ...new Set(
            datos
                .map((marcha) => marcha.autor)
                .filter((autor) => autor && autor.trim() !== '')
        )
    ].sort();

    selectorAutor.innerHTML = '<option value="TODOS">Todos los Compositores</option>';

    autoresUnicos.forEach((autor) => {
        const option = document.createElement('option');
        option.value = autor;
        option.textContent = autor;
        selectorAutor.appendChild(option);
    });
}

function aplicarFiltros() {
    const textoBuscado = normalizarTexto(document.getElementById('filtro-texto')?.value || '');
    const autor = document.getElementById('filtro-autor')?.value || 'TODOS';
    const estilo = document.getElementById('filtro-estilo')?.value || 'TODOS';
    const minAno = parseInt(document.getElementById('filtro-ano-min')?.value) || 0;
    const maxAno = parseInt(document.getElementById('filtro-ano-max')?.value) || 9999;

    const resultados = catalogoGlobal.filter((marcha) => {
        const tituloNorm = normalizarTexto(marcha.titulo || '');
        const autorNorm = normalizarTexto(marcha.autor || '');
        const dedicatoriaNorm = normalizarTexto(marcha.dedicatoria || '');
        const localidadNorm = normalizarTexto(marcha.localidad || '');

        const matchTexto =
            tituloNorm.includes(textoBuscado) ||
            autorNorm.includes(textoBuscado) ||
            dedicatoriaNorm.includes(textoBuscado) ||
            localidadNorm.includes(textoBuscado);

        const matchAutor = autor === 'TODOS' || marcha.autor === autor;

        let matchEstilo = true;

        if (estilo === 'CORNETAS') {
            matchEstilo = marcha.cornetas === 1;
        }

        if (estilo === 'SIN_CORNETAS') {
            matchEstilo = marcha.cornetas === 0 || marcha.cornetas === null;
        }

        const year = parseInt(marcha.ano) || 0;
        const matchAno = year === 0 || (year >= minAno && year <= maxAno);

        return matchTexto && matchAutor && matchEstilo && matchAno;
    });

    renderizarTabla(resultados);
    calcularKPIs(resultados);
}

function renderizarTabla(datosFiltrados) {
    const tbody = document.getElementById('tabla-catalogo-body');

    if (!tbody) {
        return;
    }

    tbody.innerHTML = '';

    if (!datosFiltrados || datosFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding: 30px; color:#888;">
                    0 resultados encontrados.
                </td>
            </tr>
        `;
        return;
    }

    datosFiltrados.forEach((marcha) => {
        const estiloCornetas = marcha.cornetas === 1
            ? '<span style="color:var(--color-oro);">🎺 Con Cornetas</span>'
            : '<span style="color:#666;">Sin Cornetas</span>';

        const tiempoEst = formatearDuracion(marcha.duracion_seg);
        const tieneAudio = marcha.url_audio && String(marcha.url_audio).trim() !== '';

        const tr = document.createElement('tr');
        tr.setAttribute('data-id-marcha', marcha.id_marcha);
        tr.setAttribute('title', 'Abrir ficha de la marcha');

        tr.innerHTML = `
            <td style="color:#555;">#${escaparHTML(marcha.id_marcha)}</td>
            <td style="font-weight:bold; color:white;">${escaparHTML(marcha.titulo)}</td>
            <td style="color:#ccc;">${escaparHTML(marcha.autor || '--')}</td>
            <td style="color:var(--color-oro);">${escaparHTML(marcha.ano || '--')}</td>
            <td>${estiloCornetas}</td>
            <td style="color:#888;">${escaparHTML(tiempoEst)}</td>
            <td style="text-align:center;">
                <button
                    type="button"
                    class="btn-play-tabla"
                    ${tieneAudio ? '' : 'disabled'}
                    title="${tieneAudio ? 'Reproducir marcha' : 'Audio no disponible'}"
                    aria-label="${tieneAudio ? 'Reproducir marcha' : 'Audio no disponible'}"
                >
                    ▶
                </button>
            </td>
        `;

        tr.addEventListener('click', () => {
            abrirFichaMarcha(marcha.id_marcha);
        });

        const btnPlay = tr.querySelector('.btn-play-tabla');

        if (btnPlay) {
            btnPlay.addEventListener('click', (evento) => {
                evento.stopPropagation();

                if (!tieneAudio) {
                    return;
                }

                reproducirEnMiniPlayer(marcha);
            });
        }

        tbody.appendChild(tr);
    });
}

function calcularKPIs(datos) {
    const kpiMuestra = document.getElementById('kpi-muestra');
    const kpiCornetas = document.getElementById('kpi-cornetas');
    const kpiDuracion = document.getElementById('kpi-duracion');

    if (!kpiMuestra || !kpiCornetas || !kpiDuracion) {
        return;
    }

    kpiMuestra.innerText = datos.length;

    if (datos.length === 0) {
        kpiCornetas.innerText = '0%';
        kpiDuracion.innerText = '0:00';
        return;
    }

    const conCornetas = datos.filter((marcha) => marcha.cornetas === 1).length;
    kpiCornetas.innerText = Math.round((conCornetas / datos.length) * 100) + '%';

    const duraciones = datos.filter((marcha) => marcha.duracion_seg > 0);

    if (duraciones.length > 0) {
        const suma = duraciones.reduce((acc, marcha) => acc + marcha.duracion_seg, 0);
        const media = Math.round(suma / duraciones.length);
        kpiDuracion.innerText = formatearDuracion(media);
    } else {
        kpiDuracion.innerText = '--';
    }
}

/* ============================================================
   FICHA WIKIPEDIA DE MARCHA
   ============================================================ */

function abrirFichaMarcha(idMarcha) {
    const marcha = catalogoGlobal.find((item) => {
        return Number(item.id_marcha) === Number(idMarcha);
    });

    if (!marcha) {
        alert('No se ha encontrado la marcha seleccionada.');
        return;
    }

    rellenarFichaMarcha(marcha);

    const modal = document.getElementById('modal-marcha');

    if (modal) {
        modal.classList.add('activo');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    }
}

function cerrarFichaMarcha() {
    const modal = document.getElementById('modal-marcha');

    if (modal) {
        modal.classList.remove('activo');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    }
}

function rellenarFichaMarcha(marcha) {
    setText('modal-titulo', marcha.titulo || 'Marcha sin título');

    const subtitulo = [
        marcha.autor || 'Autor desconocido',
        marcha.ano || 'Año no disponible',
        marcha.cornetas === 1 ? 'Con cornetas' : 'Sin cornetas'
    ].join(' · ');

    setText('modal-subtitulo', subtitulo);
    setText('modal-id', `#${marcha.id_marcha}`);
    setText('modal-ano', marcha.ano || '--');
    setText('modal-duracion', formatearDuracion(marcha.duracion_seg));
    setText('modal-estilo', marcha.cornetas === 1 ? 'Con cornetas' : 'Sin cornetas');
    setText('modal-localidad', marcha.localidad || '--');
    setText('modal-dedicatoria', marcha.dedicatoria || '--');

    pintarAudioWeb(marcha);
    pintarYoutube(marcha.url_youtube);
    pintarSpotify(marcha.spotify_uri);
    pintarPatrimonioMusical(marcha);
}

function pintarAudioWeb(marcha) {
    const contenedor = document.getElementById('modal-audio-web');

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = '';

    if (!marcha.url_audio || String(marcha.url_audio).trim() === '') {
        const p = document.createElement('p');
        p.className = 'sin-dato';
        p.textContent = 'Audio interno no disponible.';
        contenedor.appendChild(p);
        return;
    }

    const texto = document.createElement('p');
    texto.style.marginBottom = '8px';
    texto.style.color = '#ccc';
    texto.textContent = 'Escuchar desde la web:';

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'btn-send';
    boton.style.width = 'auto';
    boton.style.padding = '12px 16px';
    boton.textContent = '▶ Reproducir en segundo plano';

    boton.addEventListener('click', () => {
        reproducirEnMiniPlayer(marcha);
    });

    contenedor.appendChild(texto);
    contenedor.appendChild(boton);
}

function pintarYoutube(urlYoutube) {
    const contenedor = document.getElementById('modal-youtube');

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = '';

    if (!urlYoutube || String(urlYoutube).trim() === '') {
        const p = document.createElement('p');
        p.className = 'sin-dato';
        p.textContent = 'Vídeo de YouTube no disponible.';
        contenedor.appendChild(p);
        return;
    }

    const texto = document.createElement('p');
    texto.style.marginBottom = '8px';
    texto.style.color = '#ccc';
    texto.textContent = 'También puedes abrir una interpretación en YouTube:';

    const enlace = document.createElement('a');
    enlace.className = 'btn-youtube';
    enlace.href = urlYoutube;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.textContent = 'Ver en YouTube';

    contenedor.appendChild(texto);
    contenedor.appendChild(enlace);
}

function pintarSpotify(spotifyUri) {
    const contenedor = document.getElementById('modal-youtube');

    if (!contenedor) {
        return;
    }

    if (!spotifyUri || String(spotifyUri).trim() === '') {
        return;
    }

    const urlSpotify = convertirSpotifyUriAUrl(spotifyUri);

    if (!urlSpotify) {
        return;
    }

    const bloque = document.createElement('div');
    bloque.style.marginTop = '14px';

    const texto = document.createElement('p');
    texto.style.marginBottom = '8px';
    texto.style.color = '#ccc';
    texto.textContent = 'También puedes abrir esta marcha en Spotify:';

    const enlace = document.createElement('a');
    enlace.className = 'btn-spotify';
    enlace.href = urlSpotify;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.textContent = 'Abrir en Spotify';

    bloque.appendChild(texto);
    bloque.appendChild(enlace);
    contenedor.appendChild(bloque);
}

function pintarPatrimonioMusical(marcha) {
    const contenedor = document.getElementById('modal-patrimonio');

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = '';

    const urlGuardada = marcha.url_patrimonio && String(marcha.url_patrimonio).trim() !== ''
        ? String(marcha.url_patrimonio).trim()
        : null;

    const urlBusqueda = crearUrlBusquedaPatrimonio(marcha);

    const texto = document.createElement('p');
    texto.style.marginBottom = '10px';
    texto.style.color = '#ccc';

    if (urlGuardada) {
        texto.textContent = 'Ficha externa recomendada:';
    } else {
        texto.textContent = 'No hay ficha enlazada todavía. Puedes buscar esta marcha en Patrimonio Musical:';
    }

    const enlace = document.createElement('a');
    enlace.className = 'btn-patrimonio';
    enlace.href = urlGuardada || urlBusqueda;
    enlace.target = '_blank';
    enlace.rel = 'noopener noreferrer';
    enlace.textContent = urlGuardada ? 'Ver ficha en Patrimonio Musical' : 'Buscar en Patrimonio Musical';

    const aviso = document.createElement('p');
    aviso.className = 'nota-fuente-externa';
    aviso.textContent = 'Enlace externo. La información pertenece a su fuente original.';

    contenedor.appendChild(texto);
    contenedor.appendChild(enlace);
    contenedor.appendChild(aviso);
}

/* ============================================================
   MINI REPRODUCTOR
   ============================================================ */

function reproducirEnMiniPlayer(marcha) {
    const miniPlayer = document.getElementById('mini-player');
    const audio = document.getElementById('mini-player-audio');
    const titulo = document.getElementById('mini-player-titulo');
    const autor = document.getElementById('mini-player-autor');

    if (!miniPlayer || !audio) {
        return;
    }

    if (!marcha.url_audio || String(marcha.url_audio).trim() === '') {
        alert('Esta marcha no tiene audio interno disponible.');
        return;
    }

    if (titulo) {
        titulo.textContent = marcha.titulo || 'Marcha sin título';
    }

    if (autor) {
        autor.textContent = marcha.autor || 'Autor desconocido';
    }

    const urlActual = audio.getAttribute('src');

    if (urlActual !== marcha.url_audio) {
        audio.src = marcha.url_audio;
    }

    miniPlayer.classList.add('activo');
    miniPlayer.setAttribute('aria-hidden', 'false');

    audio.play().catch((error) => {
        console.warn('El navegador ha bloqueado la reproducción automática:', error);
    });
}

function cerrarMiniPlayer() {
    const miniPlayer = document.getElementById('mini-player');
    const audio = document.getElementById('mini-player-audio');

    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute('src');
        audio.load();
    }

    if (miniPlayer) {
        miniPlayer.classList.remove('activo');
        miniPlayer.setAttribute('aria-hidden', 'true');
    }
}

/* ============================================================
   UTILIDADES
   ============================================================ */

function setText(idElemento, valor) {
    const elemento = document.getElementById(idElemento);

    if (elemento) {
        elemento.textContent = valor;
    }
}

function formatearDuracion(segundos) {
    const total = parseInt(segundos);

    if (!total || total <= 0) {
        return '--';
    }

    const minutos = Math.floor(total / 60);
    const seg = total % 60;

    return `${minutos}:${seg.toString().padStart(2, '0')}`;
}

function normalizarTexto(texto) {
    return String(texto || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
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

function convertirSpotifyUriAUrl(spotifyUri) {
    if (!spotifyUri) {
        return null;
    }

    const texto = String(spotifyUri).trim();

    if (!texto.startsWith('spotify:track:')) {
        return null;
    }

    const trackId = texto.replace('spotify:track:', '').trim();

    if (!trackId) {
        return null;
    }

    return `https://open.spotify.com/track/${trackId}`;
}

function crearUrlBusquedaPatrimonio(marcha) {
    const titulo = marcha?.titulo || '';
    const autor = marcha?.autor || '';

    const consulta = `site:patrimoniomusical.com/bd-marcha "${titulo}" "${autor}"`;

    return `https://www.google.com/search?q=${encodeURIComponent(consulta)}`;
}

function gestionarHeaderSmart() {
    let ultimoScroll = window.scrollY;
    const cabecera = document.querySelector('.main-header-pro');

    window.addEventListener('scroll', () => {
        if (!cabecera) {
            return;
        }

        const scrollActual = window.scrollY;

        if (scrollActual <= 0) {
            cabecera.style.transform = 'translateY(0)';
            return;
        }

        if (scrollActual > ultimoScroll && scrollActual > 100) {
            cabecera.style.transform = 'translateY(-100%)';
        } else if (scrollActual < ultimoScroll) {
            cabecera.style.transform = 'translateY(0)';
        }

        ultimoScroll = scrollActual;
    });
}