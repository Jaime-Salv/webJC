/* ============================================================
   LÓGICA DE AUDITORÍA INDIVIDUAL AVANZADA (ANALISIS.JS)
   Motor de cruce de datos, estadísticas y renderizado Chart.js
   ============================================================ */

const parametrosURL = new URLSearchParams(window.location.search);
const idProcesion = parametrosURL.get('id');

let datosProcesion = null;
let repertorioEnriquecido = [];
let repertorioTimelineActual = [];
let paginaTimelineActual = 1;
const MARCHAS_POR_PAGINA = 15;

// --- CONTROL DE INSTANCIAS PARA EVITAR CRECIMIENTO INFINITO ---
let instanciaTiempos = null;
let instanciaEpocas = null;
let instanciaEvolucion = null;
let instanciaCompositores = null;

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

async function cargarDatosActuacion() {
    if (!idProcesion) {
        document.getElementById('titulo-hermandad').innerText = "⚠️ Error: ID no proporcionado";
        return;
    }

    try {
        const { data: procData, error: procError } = await clienteSupabase
            .from('maestro_procesiones')
            .select('*')
            .eq('id_procesion', idProcesion)
            .maybeSingle();

        if (procError) throw procError;

        if (!procData) {
            document.getElementById('titulo-hermandad').innerText = "Procesión no encontrada";
            document.getElementById('subtitulo-localidad').innerText = "El ID no existe o no hay permisos de lectura.";
            return;
        }

        datosProcesion = procData;

        const { data: transData, error: transError } = await clienteSupabase
            .from('repertorio_transaccional')
            .select('*')
            .eq('id_procesion', idProcesion)
            .order('orden', { ascending: true });

        if (transError) throw transError;

        const { data: catData, error: catError } = await clienteSupabase
            .from('catalogo_marchas')
            .select('*');

        if (catError) throw catError;

        repertorioEnriquecido = transData.map((trans) => {
            const marchaCatalogo = catData.find((m) => m.id_marcha === trans.id_marcha) || {};

            return {
                ...marchaCatalogo,
                fase: trans.fase,
                orden: trans.orden
            };
        });

        renderizarCabecera(datosProcesion);
        calcularMetricas(repertorioEnriquecido, datosProcesion.hermandad, datosProcesion.localidad);
        analizarRepeticiones(repertorioEnriquecido);
        renderizarGraficos(repertorioEnriquecido);
        renderizarTimeline(repertorioEnriquecido);
        analizarDispersionYEstilo(repertorioEnriquecido);
        gestionarPanelYoutube(datosProcesion);
        cargarDatosSociales();

    } catch (error) {
        console.error("Fallo estructural en la auditoría:", error);
        document.getElementById('titulo-hermandad').innerText = "Error en la matriz de datos.";
    }
}

/* ------------------------------------------------------------
   MÓDULO 1: CABECERA Y CONTEXTO
------------------------------------------------------------ */

function renderizarCabecera(data) {
    document.getElementById('titulo-hermandad').innerText = data.hermandad;
    document.getElementById('subtitulo-localidad').innerText = `${data.localidad} | ${new Date(data.creado_en).toLocaleDateString()}`;
    document.getElementById('badge-tipo').innerText = data.tipo;

    if (data.url_foto) {
        document.body.style.backgroundImage = `linear-gradient(to bottom, rgba(10,10,10,0.6) 0%, rgba(5,5,5,0.95) 100%), url('${data.url_foto}')`;
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundPosition = 'center 30%';
        document.body.style.backgroundAttachment = 'fixed';

        const hero = document.getElementById('hero-procesion');

        if (hero) {
            hero.style.background = 'transparent';
            hero.style.borderColor = 'transparent';
            hero.style.boxShadow = 'none';
        }
    }
}

function compartirActuacion() {
    if (!datosProcesion) return;

    const url = new URL(window.location.href);
    url.search = '';
    url.hash = '';
    url.searchParams.set('id', idProcesion);

    const tipo = datosProcesion.tipo || 'Actuación';
    const titulo = datosProcesion.hermandad || 'Repertorio';
    const localidad = datosProcesion.localidad ? ` · ${datosProcesion.localidad}` : '';
    abrirCompartir({
        titulo: `${titulo}${localidad}`,
        url: url.href,
        texto: `🎼 Mira este repertorio de ${tipo} de la Banda de Música Julián Cerdán:\n\n${titulo}${localidad}`
    });
}

/* ------------------------------------------------------------
   MÓDULO 2: KPIS Y ESTADÍSTICAS MATEMÁTICAS
------------------------------------------------------------ */

function calcularMetricas(repertorio, hermandadStr, localidadStr) {
    const n = repertorio.length;

    if (n === 0) return;

    document.getElementById('kpi-total').innerText = n;

    const autoresUnicos = new Set(
        repertorio
            .map((m) => m.autor)
            .filter((a) => a && a !== "Desconocido")
    );

    document.getElementById('kpi-autores').innerText = autoresUnicos.size;

    const conCornetas = repertorio.filter((m) => m.cornetas === 1).length;
    document.getElementById('kpi-cornetas').innerText = ((conCornetas / n) * 100).toFixed(1) + "%";

    const anosValidos = repertorio
        .map((m) => m.ano)
        .filter((a) => typeof a === 'number' && a > 1800);

    if (anosValidos.length > 0) {
        const anoMedio = Math.round(anosValidos.reduce((a, b) => a + b, 0) / anosValidos.length);
        document.getElementById('kpi-ano').innerText = anoMedio;
    } else {
        document.getElementById('kpi-ano').innerText = "N/A";
    }

    const duracionSegundos = repertorio.reduce((acc, m) => acc + (m.duracion_seg || 240), 0);
    const horas = Math.floor(duracionSegundos / 3600);
    const minutos = Math.floor((duracionSegundos % 3600) / 60);
    document.getElementById('kpi-duracion').innerText = `${horas}h ${minutos}m`;

    const normalizar = (txt) => txt ? txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";

    const palabrasIgnoradas = [
        "la", "el", "los", "las", "de", "del",
        "hermandad", "cofradia", "cristo", "virgen",
        "nuestra", "senora", "jesus", "san", "santa"
    ];

    const termsHermandad = normalizar(hermandadStr)
        .split(" ")
        .filter((w) => !palabrasIgnoradas.includes(w) && w.length > 3);

    const termsLocalidadProcesion = localidadStr
        ? normalizar(localidadStr).split(" ").filter((w) => !palabrasIgnoradas.includes(w) && w.length > 3)
        : [];

    let dedicadasContador = 0;

    repertorio.forEach((m) => {
        const dedicatoria = normalizar(m.dedicatoria);
        const localidadComposicion = normalizar(m.localidad);

        const coincideHermandad = termsHermandad.some((term) => dedicatoria.includes(term));

        if (coincideHermandad) {
            if (termsLocalidadProcesion.length === 0) {
                dedicadasContador++;
                return;
            }

            const localidadEnDedicatoria = termsLocalidadProcesion.some((term) => dedicatoria.includes(term));
            const localidadEnCampo = localidadComposicion && termsLocalidadProcesion.some((term) => localidadComposicion.includes(term));

            if (localidadEnDedicatoria || localidadEnCampo) {
                dedicadasContador++;
            }
        }
    });

    document.getElementById('kpi-dedicadas').innerText = ((dedicadasContador / n) * 100).toFixed(1) + "%";
}

/* ------------------------------------------------------------
   MÓDULO 3: PANEL DE REDUNDANCIA
------------------------------------------------------------ */

function analizarRepeticiones(repertorio) {
    const conteo = {};

    repertorio.forEach((m) => {
        const titulo = m.titulo;
        conteo[titulo] = (conteo[titulo] || 0) + 1;
    });

    const repetidas = Object.entries(conteo).filter(([titulo, cantidad]) => cantidad > 1);
    const panel = document.getElementById('panel-repeticiones');

    if (!panel) return;

    if (repetidas.length > 0) {
        let htmlAlert = `
            <div style="font-size: 2rem;">🔁</div>
            <div style="width: 100%;">
                <strong style="color: var(--color-oro); font-size: 1.1rem; letter-spacing: 1px;">MARCHAS REITERADAS</strong>
                <p style="margin: 5px 0 10px 0; color: #aaa; font-size: 0.85rem;">Las siguientes composiciones sonaron en múltiples ocasiones durante el itinerario:</p>
                <ul style="margin: 0; padding-left: 20px; color: #f4f4f4; line-height: 1.6;">`;

        repetidas.forEach(([titulo, cantidad]) => {
            htmlAlert += `<li><strong>${escaparHTML(titulo)}</strong> fue interpretada <strong style="color: var(--color-oro);">${cantidad} veces</strong>.</li>`;
        });

        htmlAlert += `</ul></div>`;

        panel.style.borderColor = "rgba(212, 175, 55, 0.5)";
        panel.innerHTML = htmlAlert;
    } else {
        panel.style.borderColor = "#27ae60";
        panel.innerHTML = `
            <div style="font-size: 2rem;">📊</div>
            <div>
                <strong style="color: #27ae60; font-size: 1.1rem; letter-spacing: 1px;">MÁXIMA VARIEDAD</strong>
                <p style="margin: 5px 0 0 0; color: #ccc; font-size: 0.9rem;">El 100% de las marchas interpretadas fueron únicas. No hubo repeticiones.</p>
            </div>
        `;
    }
}

/* ------------------------------------------------------------
   MÓDULO 4: GRÁFICOS INTERACTIVOS
------------------------------------------------------------ */

function renderizarGraficos(repertorio) {
    Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
    Chart.defaults.font.family = 'Montserrat';

    if (instanciaTiempos) instanciaTiempos.destroy();

    const duraciones = repertorio.map((m) => m.duracion_seg).filter((d) => d > 0);
    const rangos = { '< 3m': 0, '3m - 4.5m': 0, '> 4.5m': 0 };

    duraciones.forEach((d) => {
        if (d < 180) rangos['< 3m']++;
        else if (d <= 270) rangos['3m - 4.5m']++;
        else rangos['> 4.5m']++;
    });

    instanciaTiempos = new Chart(document.getElementById('chartTiempos'), {
        type: 'doughnut',
        data: {
            labels: Object.keys(rangos),
            datasets: [{
                data: Object.values(rangos),
                backgroundColor: ['#b5952f', '#d4af37', '#ffffff'],
                borderColor: '#121212',
                borderWidth: 2
            }]
        },
        options: { maintainAspectRatio: false, responsive: true }
    });

    if (instanciaEpocas) instanciaEpocas.destroy();

    const anos = repertorio.map((m) => m.ano).filter((a) => a > 1800);
    const decadas = {};

    anos.forEach((a) => {
        const decada = Math.floor(a / 10) * 10;
        decadas[`${decada}s`] = (decadas[`${decada}s`] || 0) + 1;
    });

    instanciaEpocas = new Chart(document.getElementById('chartEpocas'), {
        type: 'bar',
        data: {
            labels: Object.keys(decadas).sort(),
            datasets: [{
                label: 'Marchas',
                data: Object.keys(decadas).sort().map((k) => decadas[k]),
                backgroundColor: '#d4af37',
                borderRadius: 4
            }]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            plugins: { legend: { display: false } }
        }
    });

    if (instanciaEvolucion) instanciaEvolucion.destroy();

    const ordenMarchas = repertorio.map((m) => `#${m.orden}`);
    const anosEvolucion = repertorio.map((m) => {
        const year = parseInt(m.ano);
        return (!isNaN(year) && year > 1800) ? year : null;
    });

    instanciaEvolucion = new Chart(document.getElementById('chartEvolucionTemporal'), {
        type: 'line',
        data: {
            labels: ordenMarchas,
            datasets: [{
                label: 'Año de Composición',
                data: anosEvolucion,
                borderColor: '#ffffff',
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointBackgroundColor: '#d4af37',
                pointBorderColor: '#000',
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: false,
                tension: 0.3,
                spanGaps: true
            }]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            return repertorio[context[0].dataIndex].titulo;
                        },
                        afterTitle: function(context) {
                            return "Fase: " + (repertorio[context[0].dataIndex].fase || 'N/A');
                        }
                    }
                }
            },
            scales: {
                y: {
                    min: 1880,
                    suggestedMax: new Date().getFullYear(),
                    ticks: { stepSize: 10 }
                }
            }
        }
    });

    if (instanciaCompositores) instanciaCompositores.destroy();

    const autores = repertorio.map((m) => m.autor).filter((a) => a && a !== "Desconocido");
    const conteoAutores = {};

    autores.forEach((a) => {
        conteoAutores[a] = (conteoAutores[a] || 0) + 1;
    });

    const topAutores = Object.entries(conteoAutores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    instanciaCompositores = new Chart(document.getElementById('chartCompositores'), {
        type: 'bar',
        data: {
            labels: topAutores.map((a) => a[0]),
            datasets: [{
                label: 'Obras Interpretadas',
                data: topAutores.map((a) => a[1]),
                backgroundColor: 'rgba(212, 175, 55, 0.8)',
                borderColor: '#d4af37',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            maintainAspectRatio: false,
            responsive: true,
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: { x: { ticks: { stepSize: 1 } } }
        }
    });
}

/* ------------------------------------------------------------
   MÓDULO 5: MINI REPRODUCTOR Y CRONOLOGÍA PAGINADA
------------------------------------------------------------ */

function reproducirEnMiniPlayerAnalisis(marcha) {
    const miniPlayer = document.getElementById('mini-player-analisis');
    const audio = document.getElementById('mini-player-analisis-audio');
    const titulo = document.getElementById('mini-player-analisis-titulo');
    const autor = document.getElementById('mini-player-analisis-autor');

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
        const partes = [
            marcha.autor || 'Autor desconocido',
            marcha.fase || '',
            marcha.orden ? `Nº ${marcha.orden}` : ''
        ].filter(Boolean);

        autor.textContent = partes.join(' · ');
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

function cerrarMiniPlayerAnalisis() {
    const miniPlayer = document.getElementById('mini-player-analisis');
    const audio = document.getElementById('mini-player-analisis-audio');

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

function renderizarTimeline(repertorio, pagina = 1) {
    const contenedor = document.getElementById('timeline-contenedor');
    const paginacion = document.getElementById('timeline-paginacion');
    const resumen = document.getElementById('timeline-resumen');

    if (!contenedor) {
        return;
    }

    repertorioTimelineActual = Array.isArray(repertorio) ? repertorio : [];

    if (repertorioTimelineActual.length === 0) {
        contenedor.innerHTML = `<p style="color: #ff3b3b; font-weight: bold;">No hay marchas registradas en este informe.</p>`;

        if (paginacion) paginacion.innerHTML = '';
        if (resumen) resumen.textContent = '0 marchas registradas.';

        return;
    }

    const totalPaginas = Math.ceil(repertorioTimelineActual.length / MARCHAS_POR_PAGINA);
    paginaTimelineActual = Math.min(Math.max(Number(pagina) || 1, 1), totalPaginas);

    const inicio = (paginaTimelineActual - 1) * MARCHAS_POR_PAGINA;
    const fin = inicio + MARCHAS_POR_PAGINA;
    const marchasPagina = repertorioTimelineActual.slice(inicio, fin);

    contenedor.innerHTML = '';

    if (resumen) {
        const desde = inicio + 1;
        const hasta = Math.min(fin, repertorioTimelineActual.length);
        resumen.textContent = `Mostrando ${desde}-${hasta} de ${repertorioTimelineActual.length} marchas.`;
    }

    marchasPagina.forEach((marcha) => {
        const tieneAudio = marcha.url_audio && String(marcha.url_audio).trim() !== '';

        const item = document.createElement('div');
        item.className = 'timeline-item';

        const info = document.createElement('div');
        info.className = 'timeline-info';

        const hora = document.createElement('div');
        hora.className = 't-hora';
        hora.textContent = `Nº ${marcha.orden}`;

        const fase = document.createElement('div');
        fase.className = 't-fase';
        fase.textContent = marcha.fase || 'Itinerario';

        const titulo = document.createElement('h4');
        titulo.className = 't-titulo';
        titulo.textContent = marcha.titulo || 'Marcha sin título';

        const autor = document.createElement('p');
        autor.className = 't-autor';
        autor.textContent = marcha.autor || 'Autor no registrado';

        info.appendChild(hora);
        info.appendChild(fase);
        info.appendChild(titulo);
        info.appendChild(autor);

        if (marcha.dedicatoria) {
            const dedicatoria = document.createElement('span');
            dedicatoria.style.display = 'block';
            dedicatoria.style.fontSize = '0.75rem';
            dedicatoria.style.color = 'rgba(212, 175, 55, 0.8)';
            dedicatoria.style.fontStyle = 'italic';
            dedicatoria.style.marginTop = '3px';
            dedicatoria.textContent = `Dedicada a: ${marcha.dedicatoria}`;
            info.appendChild(dedicatoria);
        }

        const botonPlay = document.createElement('button');
        botonPlay.type = 'button';
        botonPlay.className = 'btn-play-analisis';
        botonPlay.textContent = '▶';
        botonPlay.title = tieneAudio ? 'Reproducir marcha' : 'Audio no disponible';
        botonPlay.setAttribute('aria-label', tieneAudio ? 'Reproducir marcha' : 'Audio no disponible');

        if (!tieneAudio) {
            botonPlay.disabled = true;
        }

        botonPlay.addEventListener('click', (evento) => {
            evento.stopPropagation();

            if (!tieneAudio) {
                return;
            }

            reproducirEnMiniPlayerAnalisis(marcha);
        });

        const botonSpotify = document.createElement('a');
        botonSpotify.className = 'btn-spotify-analisis';
        botonSpotify.textContent = 'Spotify';
        botonSpotify.target = '_blank';
        botonSpotify.rel = 'noopener noreferrer';

        const urlSpotify = convertirSpotifyUriAUrlAnalisis(marcha.spotify_uri);

        if (urlSpotify) {
            botonSpotify.href = urlSpotify;
        } else {
            botonSpotify.href = '#';
            botonSpotify.classList.add('desactivado');
            botonSpotify.addEventListener('click', (evento) => {
                evento.preventDefault();
            });
        }

        const botonPatrimonio = document.createElement('a');
        botonPatrimonio.className = 'btn-patrimonio-analisis';
        botonPatrimonio.textContent = marcha.url_patrimonio ? 'Patrimonio' : 'Buscar';
        botonPatrimonio.target = '_blank';
        botonPatrimonio.rel = 'noopener noreferrer';
        botonPatrimonio.href = marcha.url_patrimonio && String(marcha.url_patrimonio).trim() !== ''
            ? String(marcha.url_patrimonio).trim()
            : crearUrlBusquedaPatrimonioAnalisis(marcha);

        const acciones = document.createElement('div');
        acciones.className = 'acciones-marcha-analisis';

        acciones.appendChild(botonPlay);
        acciones.appendChild(botonSpotify);
        acciones.appendChild(botonPatrimonio);

        item.appendChild(info);
        item.appendChild(acciones);

        contenedor.appendChild(item);
    });

    renderizarPaginacionTimeline(totalPaginas);
}

function renderizarPaginacionTimeline(totalPaginas) {
    const paginacion = document.getElementById('timeline-paginacion');

    if (!paginacion) {
        return;
    }

    paginacion.innerHTML = '';

    if (totalPaginas <= 1) {
        return;
    }

    const btnAnterior = document.createElement('button');
    btnAnterior.type = 'button';
    btnAnterior.className = 'btn-pagina-timeline';
    btnAnterior.textContent = '← Anterior';
    btnAnterior.disabled = paginaTimelineActual === 1;
    btnAnterior.addEventListener('click', () => {
        cambiarPaginaTimeline(paginaTimelineActual - 1);
    });

    const indicador = document.createElement('span');
    indicador.className = 'indicador-pagina-timeline';
    indicador.textContent = `Página ${paginaTimelineActual} de ${totalPaginas}`;

    const btnSiguiente = document.createElement('button');
    btnSiguiente.type = 'button';
    btnSiguiente.className = 'btn-pagina-timeline';
    btnSiguiente.textContent = 'Siguiente →';
    btnSiguiente.disabled = paginaTimelineActual === totalPaginas;
    btnSiguiente.addEventListener('click', () => {
        cambiarPaginaTimeline(paginaTimelineActual + 1);
    });

    paginacion.appendChild(btnAnterior);
    paginacion.appendChild(indicador);
    paginacion.appendChild(btnSiguiente);
}

function cambiarPaginaTimeline(nuevaPagina) {
    renderizarTimeline(repertorioTimelineActual, nuevaPagina);

    const panelRepertorio = document.querySelector('.panel-repertorio');

    if (panelRepertorio) {
        panelRepertorio.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });
    }
}

/* ------------------------------------------------------------
   MÓDULO 6: EXPORTACIÓN PARA SOFTWARE R
------------------------------------------------------------ */

const btnExportar = document.getElementById('btn-exportar-repertorio');

if (btnExportar) {
    btnExportar.addEventListener('click', () => {
        if (repertorioEnriquecido.length === 0) {
            alert("La matriz de datos está vacía.");
            return;
        }

        const cabeceras = "orden,fase,titulo,autor,ano,duracion_seg,cornetas\n";

        const filas = repertorioEnriquecido.map((m) => {
            const t = m.titulo ? m.titulo.replace(/"/g, '""') : '';
            const a = m.autor ? m.autor.replace(/"/g, '""') : '';
            const f = m.fase ? m.fase.replace(/"/g, '""') : '';
            const cornetasInt = m.cornetas === 1 ? 1 : 0;

            return `${m.orden},"${f}","${t}","${a}",${m.ano || 'NA'},${m.duracion_seg || 'NA'},${cornetasInt}`;
        }).join("\n");

        const blob = new Blob([cabeceras + filas], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');

        link.href = URL.createObjectURL(blob);
        link.download = `dataset_actuacion_${datosProcesion.hermandad.replace(/\s+/g, '_')}.csv`;
        link.click();
    });
}

/* ------------------------------------------------------------
   MÓDULO 7: ANÁLISIS DE DISPERSIÓN Y CORNETAS
------------------------------------------------------------ */

function analizarDispersionYEstilo(repertorio) {
    const n = repertorio.length;

    if (n === 0) return;

    const autores = new Set(repertorio.map((m) => m.autor).filter((a) => a && a !== "Desconocido"));
    const riquezaAutoral = ((autores.size / n) * 100).toFixed(1);

    document.getElementById('var-autores').innerText = riquezaAutoral + "%";

    const anos = repertorio
        .map((m) => parseInt(m.ano))
        .filter((a) => !isNaN(a) && a > 1800);

    if (anos.length > 0) {
        const maxAno = Math.max(...anos);
        const minAno = Math.min(...anos);
        const brecha = maxAno - minAno;

        document.getElementById('var-anos').innerText = `${brecha} años`;
        document.getElementById('var-anos-detalle').innerText = `De ${minAno} a ${maxAno}`;
    }

    const duraciones = repertorio
        .map((m) => parseInt(m.duracion_seg))
        .filter((d) => !isNaN(d) && d > 0);

    if (duraciones.length > 0) {
        const maxD = Math.max(...duraciones);
        const minD = Math.min(...duraciones);
        const diferencia = maxD - minD;
        const formatTime = (s) => `${Math.floor(s / 60)}m ${s % 60}s`;

        document.getElementById('var-duracion').innerText = formatTime(diferencia);
        document.getElementById('var-duracion-detalle').innerText = `Min: ${formatTime(minD)} | Max: ${formatTime(maxD)}`;
    }

    const isSemanaSanta = datosProcesion.tipo === 'Semana Santa';
    let fasesArray = [];

    if (isSemanaSanta) {
        fasesArray = [
            { idFase: 'Ida', label: 'IDA', color: 'white' },
            { idFase: 'Carrera Oficial', label: 'CARRERA OFICIAL', color: 'var(--color-oro)' },
            { idFase: 'Vuelta', label: 'VUELTA', color: '#ff3b3b' }
        ];
    } else {
        fasesArray = [
            { idFase: 'Día', label: 'DÍA', color: 'white' },
            { idFase: 'Noche', label: 'NOCHE', color: '#6495ed' }
        ];
    }

    const contenedorDinamico = document.getElementById('contenedor-cornetas-dinamico');

    if (contenedorDinamico) {
        contenedorDinamico.innerHTML = '';

        fasesArray.forEach((faseObj, index) => {
            const marchasFase = repertorio.filter((m) => m.fase === faseObj.idFase);
            const totalFase = marchasFase.length;
            const cornetasFase = marchasFase.filter((m) => m.cornetas === 1).length;
            const pct = totalFase > 0 ? Math.round((cornetasFase / totalFase) * 100) : 0;

            contenedorDinamico.innerHTML += `
                <div class="fase-row">
                    <div class="fase-info">
                        <span style="color: ${faseObj.color};">${faseObj.label}</span>
                        <strong>${pct}% (${cornetasFase}/${totalFase})</strong>
                    </div>
                    <div class="fase-barra-bg">
                        <div class="fase-barra-fill" id="barra-corneta-${index}" style="background: ${faseObj.color}; width: 0%;"></div>
                    </div>
                </div>
            `;

            setTimeout(() => {
                const barra = document.getElementById(`barra-corneta-${index}`);
                if (barra) barra.style.width = `${pct}%`;
            }, 100);
        });
    }
}

/* ------------------------------------------------------------
   MÓDULO 8: INTERACCIÓN SOCIAL
------------------------------------------------------------ */

async function cargarDatosSociales() {
    const { data: comentarios } = await clienteSupabase
        .from('procesion_comentarios')
        .select('*')
        .eq('id_procesion', idProcesion)
        .order('created_at', { ascending: true });

    const { data: valoraciones } = await clienteSupabase
        .from('valoraciones')
        .select('usuario_id')
        .eq('id_procesion', idProcesion);

    const totalLikes = valoraciones ? valoraciones.length : 0;
    const totalComentarios = comentarios ? comentarios.length : 0;

    const { data: { session } } = await clienteSupabase.auth.getSession();

    let yaVotado = false;

    if (session && valoraciones) {
        yaVotado = valoraciones.some((v) => v.usuario_id === session.user.id);
    } else {
        const votosRealizados = JSON.parse(localStorage.getItem('jc_votos_procesiones') || "[]");
        yaVotado = votosRealizados.includes(idProcesion);
    }

    const hLike = document.getElementById('like-count-hero');
    const hComm = document.getElementById('comment-count-hero');
    const btnMainLike = document.getElementById('btn-like-main');

    if (hLike) hLike.innerText = totalLikes;
    if (hComm) hComm.innerText = totalComentarios;

    if (btnMainLike) {
        btnMainLike.style.color = yaVotado ? '#ff3b3b' : 'white';
        btnMainLike.style.borderColor = yaVotado ? '#ff3b3b' : 'rgba(212, 175, 55, 0.3)';
    }

    const mainLike = document.getElementById('like-count');
    const btnLikeAnalisis = document.getElementById('btn-like-analisis');

    if (mainLike) mainLike.innerText = totalLikes;

    if (btnLikeAnalisis) {
        btnLikeAnalisis.style.color = yaVotado ? '#ff3b3b' : 'white';
        btnLikeAnalisis.style.borderColor = yaVotado ? '#ff3b3b' : '#333';
    }

    const cont = document.getElementById('contenedor-comentarios-analisis');

    if (cont) {
        if (comentarios && comentarios.length > 0) {
            cont.innerHTML = comentarios.map((c) => `
                <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; margin-bottom: 12px; border-left: 3px solid var(--color-oro);">
                    <strong style="color: var(--color-oro); font-size: 0.9rem;">${escaparHTML(c.usuario_nombre)}:</strong>
                    <span style="color: #ccc; font-size: 0.85rem; margin-left: 5px;">${escaparHTML(c.comentario)}</span>
                </div>
            `).join('');

            cont.scrollTop = cont.scrollHeight;
        } else {
            cont.innerHTML = '<p style="color:#555; text-align:center;">Nadie ha comentado aún. ¡Sé el primero en analizar esta cruceta!</p>';
        }
    }
}

async function gestionarLike() {
    const { data: { session } } = await clienteSupabase.auth.getSession();

    if (!session) {
        document.getElementById('modal-auth-invitation').style.display = 'flex';
        return;
    }

    const { data: likeExistente } = await clienteSupabase
        .from('valoraciones')
        .select('*')
        .eq('id_procesion', idProcesion)
        .eq('usuario_id', session.user.id)
        .maybeSingle();

    try {
        let votosRealizados = JSON.parse(localStorage.getItem('jc_votos_procesiones') || "[]");

        if (likeExistente) {
            const { error } = await clienteSupabase
                .from('valoraciones')
                .delete()
                .eq('id_procesion', idProcesion)
                .eq('usuario_id', session.user.id);

            if (error) throw error;

            votosRealizados = votosRealizados.filter((id) => id !== idProcesion);
        } else {
            const { error } = await clienteSupabase
                .from('valoraciones')
                .insert([{
                    id_procesion: idProcesion,
                    usuario_id: session.user.id
                }]);

            if (error) throw error;

            if (!votosRealizados.includes(idProcesion)) {
                votosRealizados.push(idProcesion);
            }
        }

        localStorage.setItem('jc_votos_procesiones', JSON.stringify(votosRealizados));
        cargarDatosSociales();

    } catch (err) {
        console.error("Error al actualizar MG en valoraciones:", err);
    }
}

function cerrarInvitacion() {
    document.getElementById('modal-auth-invitation').style.display = 'none';
}

async function enviarComentarioAnalisis() {
    const { data: { session } } = await clienteSupabase.auth.getSession();

    if (!session) {
        document.getElementById('modal-auth-invitation').style.display = 'flex';
        return;
    }

    const input = document.getElementById('input-comentario-analisis');

    if (!input.value.trim()) return;

    try {
        const { data: perf } = await clienteSupabase
            .from('perfiles')
            .select('username')
            .eq('id', session.user.id)
            .maybeSingle();

        const nombre = (perf && perf.username) ? perf.username : session.user.email.split('@')[0];

        const { error } = await clienteSupabase
            .from('procesion_comentarios')
            .insert([{
                id_procesion: Number(idProcesion),
                usuario_id: session.user.id,
                comentario: input.value.trim(),
                usuario_nombre: nombre
            }]);

        if (error) throw error;

        input.value = '';
        cargarDatosSociales();

    } catch (err) {
        console.error("Error al comentar:", err.message);
    }
}

/* ------------------------------------------------------------
   MÓDULO 9: YOUTUBE DE LA PROCESIÓN
------------------------------------------------------------ */

const urlParams = new URLSearchParams(window.location.search);
const idProcesionActual = urlParams.get('id');

async function gestionarPanelYoutube(procData) {
    const { data: { session } } = await clienteSupabase.auth.getSession();

    if (session) {
        const { data: perfil } = await clienteSupabase
            .from('perfiles')
            .select('rol')
            .eq('id', session.user.id)
            .maybeSingle();

        if (perfil && perfil.rol === 'admin') {
            const panel = document.getElementById('admin-panel-youtube');

            if (panel) {
                panel.style.display = 'block';
            }

            if (procData.url_youtube) {
                const input = document.getElementById('input-url-youtube');

                if (input) {
                    input.value = procData.url_youtube;
                }
            }
        }
    }

    if (procData.url_youtube) {
        renderizarIframeYoutube(procData.url_youtube);
    }
}

async function renderizarIframeYoutube(input) {
    const contenedor = document.getElementById('contenedor-video-final');

    if (!contenedor || !input) {
        return;
    }

    if (input.includes(',')) {
        const ids = input.split(',').map((id) => id.trim()).filter((id) => id.length > 0);

        contenedor.innerHTML = `
            <h3 style="color: var(--color-oro); margin-bottom: 20px;">Recorrido Audiovisual 🎥</h3>
            <p style="color: #777; font-size: 0.9rem; font-style: italic;">Cargando títulos de los vídeos...</p>
        `;

        let htmlGaleria = `
            <h3 style="color: var(--color-oro); margin-bottom: 20px;">Recorrido Audiovisual 🎥</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
        `;

        for (const id of ids) {
            let tituloVideo = "Marcha en Directo";

            try {
                const respuesta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
                const datos = await respuesta.json();

                if (datos.title) {
                    tituloVideo = datos.title;
                }
            } catch (error) {
                console.warn(`No se pudo obtener el título para el vídeo ${id}`);
            }

            htmlGaleria += `
                <div style="background: rgba(18,18,18,0.8); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; transition: 0.3s;">
                    <a href="https://www.youtube.com/watch?v=${escaparHTML(id)}" target="_blank" style="text-decoration: none; flex: 1; display: flex; flex-direction: column;">
                        <img src="https://img.youtube.com/vi/${escaparHTML(id)}/mqdefault.jpg" style="width: 100%; display: block; border-bottom: 1px solid rgba(212, 175, 55, 0.2);">
                        <div style="padding: 15px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                            <h4 style="color: white; font-size: 0.95rem; margin: 0 0 15px 0; font-weight: normal; line-height: 1.4;">${escaparHTML(tituloVideo)}</h4>
                            <span style="color: var(--color-oro); font-size: 0.75rem; font-weight: bold; letter-spacing: 1px; display: inline-block;">▶ VER VÍDEO</span>
                        </div>
                    </a>
                </div>
            `;
        }

        htmlGaleria += `</div>`;
        contenedor.innerHTML = htmlGaleria;

    } else {
        let embedUrl = input;

        if (input.includes('list=')) {
            const listId = new URL(input).searchParams.get('list');
            embedUrl = `https://www.youtube.com/embed/videoseries?list=${listId}`;
        } else if (input.includes('v=')) {
            const videoId = new URL(input).searchParams.get('v');
            embedUrl = `https://www.youtube.com/embed/${videoId}`;
        } else if (input.includes('youtu.be/')) {
            const videoId = input.split('youtu.be/')[1].split('?')[0];
            embedUrl = `https://www.youtube.com/embed/${videoId}`;
        } else if (!input.includes('http')) {
            embedUrl = `https://www.youtube.com/embed/${input}`;
        }

        contenedor.innerHTML = `
            <h3 style="color: var(--color-oro); margin-bottom: 20px;">Recorrido Audiovisual Completo 🎥</h3>
            <div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; border: 1px solid var(--border-gold);">
                <iframe
                    style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"
                    src="${escaparHTML(embedUrl)}"
                    frameborder="0"
                    allowfullscreen>
                </iframe>
            </div>
        `;
    }
}

function procesarInputYoutube(inputRaw) {
    if (!inputRaw) return "";

    const partes = inputRaw.split(',');

    const idsProcesados = partes.map((parte) => {
        let cadena = parte.trim();

        if (cadena.includes('youtu.be/')) {
            return cadena.split('youtu.be/')[1].split(/[?#]/)[0];
        }

        if (cadena.includes('youtube.com/watch')) {
            try {
                const urlParams = new URL(cadena).searchParams;
                return urlParams.get('v') || cadena;
            } catch (error) {
                return cadena;
            }
        }

        return cadena;
    });

    return idsProcesados.filter((id) => id.length > 0).join(', ');
}

async function guardarUrlYoutube() {
    const inputUsuario = document.getElementById('input-url-youtube')?.value;
    const nuevaUrlLimpia = procesarInputYoutube(inputUsuario);

    if (!idProcesionActual) return;

    try {
        const { error } = await clienteSupabase
            .from('maestro_procesiones')
            .update({ url_youtube: nuevaUrlLimpia })
            .eq('id_procesion', idProcesionActual);

        if (error) throw error;

        const input = document.getElementById('input-url-youtube');

        if (input) {
            input.value = '';
        }

        window.location.reload();

    } catch (error) {
        alert("Error al guardar: " + error.message);
    }
}

/* ------------------------------------------------------------
   UTILIDADES EXTERNAS
------------------------------------------------------------ */

function crearUrlBusquedaPatrimonioAnalisis(marcha) {
    const titulo = marcha?.titulo || '';
    const autor = marcha?.autor || '';
    const consulta = `site:patrimoniomusical.com/bd-marcha "${titulo}" "${autor}"`;

    return `https://www.google.com/search?q=${encodeURIComponent(consulta)}`;
}

function convertirSpotifyUriAUrlAnalisis(spotifyUri) {
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

/* ------------------------------------------------------------
   ARRANQUE
------------------------------------------------------------ */

window.onload = () => {
    cargarDatosActuacion();

    const btnLikeAnalisis = document.getElementById('btn-like-analisis');

    if (btnLikeAnalisis) {
        btnLikeAnalisis.addEventListener('click', gestionarLike);
    }

    const btnCerrarMiniPlayer = document.getElementById('mini-player-analisis-cerrar');

    if (btnCerrarMiniPlayer) {
        btnCerrarMiniPlayer.addEventListener('click', cerrarMiniPlayerAnalisis);
    }
};
