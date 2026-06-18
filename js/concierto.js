/* ============================================================
   CONCIERTO.JS
   Página pública de programa de concierto
   ============================================================ */

const parametrosURLConcierto = new URLSearchParams(window.location.search);
const idConcierto = parametrosURLConcierto.get('id');

document.addEventListener('DOMContentLoaded', () => {
    cargarConcierto();
});

async function cargarConcierto() {
    const contenedor = document.getElementById('contenido-concierto');

    if (!contenedor) {
        return;
    }

    if (!idConcierto) {
        renderizarError('No se ha indicado ningún concierto.');
        return;
    }

    try {
        const { data: concierto, error: errorConcierto } = await clienteSupabase
            .from('conciertos')
            .select('*')
            .eq('id_concierto', idConcierto)
            .maybeSingle();

        if (errorConcierto) {
            throw errorConcierto;
        }

        if (!concierto) {
            renderizarError('El concierto no existe o todavía no está publicado.');
            return;
        }

        const { data: obras, error: errorObras } = await clienteSupabase
            .from('concierto_obras')
            .select('*')
            .eq('id_concierto', idConcierto)
            .order('orden', { ascending: true });

        if (errorObras) {
            throw errorObras;
        }

        renderizarConcierto(concierto, obras || []);

    } catch (error) {
        console.error('Error cargando concierto:', error);
        renderizarError('No se ha podido cargar el programa del concierto.');
    }
}

function renderizarConcierto(concierto, obras) {
    const contenedor = document.getElementById('contenido-concierto');

    if (!contenedor) {
        return;
    }

    document.title = `${concierto.titulo || 'Concierto'} - Julián Cerdán`;

    const cartel = campoRelleno(concierto.cartel_url)
        ? concierto.cartel_url
        : '../img/escudo.png';

    const fecha = formatearFecha(concierto.fecha);
    const hora = formatearHora(concierto.hora);

    const lugarCompleto = [
        concierto.lugar || '',
        concierto.localidad || ''
    ].filter(Boolean).join(' · ');

    const descripcion = campoRelleno(concierto.descripcion)
        ? concierto.descripcion
        : 'Programa de concierto publicado por la Banda de Música Julián Cerdán.';

    contenedor.innerHTML = `
        <section class="page-shell hero-concierto">
            <div class="cartel-box">
                <img src="${escaparAtributo(cartel)}" alt="${escaparAtributo(concierto.titulo || 'Cartel del concierto')}">
            </div>

            <article class="concierto-info">
                <div class="eyebrow">Programa digital</div>

                <h1>${escaparHTML(concierto.titulo || 'Concierto')}</h1>

                <div class="meta-concierto">
                    <span class="meta-pill">📅 ${escaparHTML(fecha)}</span>
                    ${hora ? `<span class="meta-pill">🕘 ${escaparHTML(hora)}</span>` : ''}
                    ${lugarCompleto ? `<span class="meta-pill">📍 ${escaparHTML(lugarCompleto)}</span>` : ''}
                </div>

                <p class="descripcion-concierto">${escaparHTML(descripcion)}</p>

                <div class="acciones-concierto">
                    <a href="#programa" class="btn-primary">Ver programa</a>
                    <button type="button" class="btn-secondary" onclick="compartirConcierto()">Compartir</button>
                    <button type="button" class="btn-secondary" onclick="copiarEnlaceConcierto()">Copiar enlace</button>
                </div>
            </article>
        </section>

        <section id="programa" class="page-shell section-programa">
            <div class="section-heading">
                <span>Repertorio del concierto</span>
                <h2>Programa</h2>
            </div>

            <div class="programa-lista">
                ${renderizarObras(obras)}
            </div>
        </section>
    `;
}

function renderizarObras(obras) {
    if (!obras || obras.length === 0) {
        return `
            <div class="empty-state">
                Todavía no se ha publicado el programa de obras de este concierto.
            </div>
        `;
    }

    return obras.map((obra) => renderizarObra(obra)).join('');
}

function renderizarObra(obra) {
    const compositor = campoRelleno(obra.compositor)
        ? obra.compositor
        : 'Compositor no indicado';

    const descripcion = campoRelleno(obra.descripcion)
        ? obra.descripcion
        : 'Descripción pendiente de completar.';

    const duracion = campoRelleno(obra.duracion_aprox)
        ? `<span class="obra-pill">⏱ ${escaparHTML(obra.duracion_aprox)}</span>`
        : '';

    const enlaceYoutube = campoRelleno(obra.enlace_youtube)
        ? `<a class="obra-pill obra-link" href="${escaparAtributo(obra.enlace_youtube)}" target="_blank" rel="noopener noreferrer">YouTube</a>`
        : '';

    const enlaceSpotifyUrl = normalizarSpotify(obra.enlace_spotify);

    const enlaceSpotify = enlaceSpotifyUrl
        ? `<a class="obra-pill obra-link" href="${escaparAtributo(enlaceSpotifyUrl)}" target="_blank" rel="noopener noreferrer">Spotify</a>`
        : '';

    const enlaceExterno = campoRelleno(obra.enlace_externo)
        ? `<a class="obra-pill obra-link" href="${escaparAtributo(obra.enlace_externo)}" target="_blank" rel="noopener noreferrer">Enlace externo</a>`
        : '';

    const notas = campoRelleno(obra.notas)
        ? `<span class="obra-pill">📝 ${escaparHTML(obra.notas)}</span>`
        : '';

    const extras = [duracion, enlaceYoutube, enlaceSpotify, enlaceExterno, notas].filter(Boolean).join('');

    return `
        <article class="obra-card">
            <div class="obra-numero">${escaparHTML(obra.orden || '')}</div>

            <div class="obra-contenido">
                <h3>${escaparHTML(obra.titulo || 'Obra sin título')}</h3>

                <div class="obra-compositor">
                    ${escaparHTML(compositor)}
                </div>

                <p class="obra-descripcion">
                    ${escaparHTML(descripcion)}
                </p>

                ${extras ? `<div class="obra-extra">${extras}</div>` : ''}
            </div>
        </article>
    `;
}

function compartirConcierto() {
    const titulo = document.querySelector('.concierto-info h1')?.textContent?.trim() || 'Programa de concierto';
    const url = obtenerUrlCanonicaConcierto();

    abrirCompartir({
        titulo,
        url,
        texto: `🎼 Mira este programa de concierto de la Banda de Música Julián Cerdán:\n\n${titulo}`
    });
}

function copiarEnlaceConcierto() {
    const urlActual = obtenerUrlCanonicaConcierto();

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(urlActual)
            .then(() => {
                alert('Enlace del concierto copiado.');
            })
            .catch(() => {
                fallbackCopiarEnlace(urlActual);
            });
    } else {
        fallbackCopiarEnlace(urlActual);
    }
}

function fallbackCopiarEnlace(url) {
    const inputTemporal = document.createElement('input');
    inputTemporal.value = url;
    document.body.appendChild(inputTemporal);
    inputTemporal.select();

    try {
        document.execCommand('copy');
        alert('Enlace del concierto copiado.');
    } catch (error) {
        alert('No se ha podido copiar el enlace. Puedes copiarlo desde la barra del navegador.');
    }

    document.body.removeChild(inputTemporal);
}

function renderizarError(mensaje) {
    const contenedor = document.getElementById('contenido-concierto');

    if (!contenedor) {
        return;
    }

    contenedor.innerHTML = `
        <section class="page-shell">
            <div class="estado-carga">
                <div>
                    <h1 style="color: var(--color-oro); text-transform: uppercase;">Concierto no disponible</h1>
                    <p style="color:#aaa; line-height:1.6;">${escaparHTML(mensaje)}</p>
                    <a href="../index.html#actuaciones" class="btn-primary" style="margin-top:20px;">Volver a actuaciones</a>
                </div>
            </div>
        </section>
    `;
}

function campoRelleno(valor) {
    return valor !== null && valor !== undefined && String(valor).trim() !== '';
}

function formatearFecha(fechaISO) {
    if (!fechaISO) {
        return 'Fecha por confirmar';
    }

    try {
        return new Date(fechaISO).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        });
    } catch (error) {
        return fechaISO;
    }
}

function formatearHora(hora) {
    if (!hora) {
        return '';
    }

    const texto = String(hora).trim();

    if (texto.length >= 5) {
        return texto.slice(0, 5);
    }

    return texto;
}

function normalizarSpotify(valor) {
    if (!campoRelleno(valor)) {
        return null;
    }

    const texto = String(valor).trim();

    if (texto.startsWith('https://open.spotify.com/')) {
        return texto;
    }

    if (texto.startsWith('spotify:track:')) {
        const id = texto.replace('spotify:track:', '').trim();

        if (!id) {
            return null;
        }

        return `https://open.spotify.com/track/${id}`;
    }

    return texto;
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

function obtenerUrlCanonicaConcierto() {
    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('id', idConcierto);
    return url.href;
}
