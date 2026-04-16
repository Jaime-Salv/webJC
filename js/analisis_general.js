/**
 * ARCHIVO: js/analisis_general.js
 * FUNCIÓN: Gestión de Auditoría Global 2026 - Julián Cerdán
 */

let chartsActivas = {};

// Variables globales para almacenar las listas completas para el Modal
let datosCompletosMarchas = [];
let datosCompletosAutores = [];

async function iniciarAuditoriaGlobal() {
    const params = new URLSearchParams(window.location.search);
    const tipo = params.get('tipo') || "Semana Santa";
    const year = params.get('year') || "2026";

    const elSub = document.getElementById('subtitulo-analisis');
    if (elSub) elSub.innerText = `${tipo} • Informe de Datos ${year}`;

    try {
        const { data: proc, error: errProc } = await clienteSupabase
            .from('maestro_procesiones')
            .select('*')
            .eq('tipo', tipo);

        if (errProc || !proc || proc.length === 0) {
            console.warn("No se encontraron procesiones para este ciclo.");
            return;
        }
        
        const ids = proc.map(p => p.id_procesion);
        const [rep, cat] = await Promise.all([
            clienteSupabase.from('repertorio_transaccional').select('*').in('id_procesion', ids),
            clienteSupabase.from('catalogo_marchas').select('*')
        ]);

        if (rep.error || cat.error) throw new Error("Error cargando repertorio o catálogo");

        const catMap = new Map(cat.data.map(c => [c.id_marcha, c]));
        const dataMaster = rep.data.map(r => {
            const info = catMap.get(r.id_marcha) || {};
            const p = proc.find(p => p.id_procesion === r.id_procesion);
            return { 
                ...r, 
                ...info, 
                hermandad: p?.hermandad || 'S/D' 
            };
        });

        procesarDataCientifica(dataMaster);

    } catch (e) { 
        console.error("Error crítico en motor de datos:", e); 
    }
}

function procesarDataCientifica(data) {
    const N = data.length;
    if (N === 0) return;

    // --- 1. ACTUALIZACIÓN DE INDICADORES (KPIs) ---
    const elTotal = document.getElementById('kpi-total');
    if (elTotal) elTotal.innerText = N;

    const elHoras = document.getElementById('kpi-horas');
    if (elHoras) {
        const segs = data.reduce((acc, m) => acc + (parseInt(m.duracion_seg) || 0), 0);
        const h = Math.floor(segs / 3600);
        const m = Math.floor((segs % 3600) / 60);
        elHoras.innerText = `${h}h ${m}m`;
    }

    const elMedia = document.getElementById('kpi-media');
    const anos = data.map(m => parseInt(m.ano)).filter(a => a > 1800);
    if (elMedia && anos.length > 0) {
        const media = anos.reduce((a, b) => a + b, 0) / anos.length;
        elMedia.innerText = Math.round(media);
    }

    // --- 2. DIVERSIDAD Y EXCLUSIVIDAD ---
    const conteoTitulos = {};
    const exclusividadMap = {}; 
    const autoresMap = {}; // NUEVO: Mapa para guardar el autor de cada marcha

    data.forEach(m => {
        const t = m.titulo || "S/D";
        conteoTitulos[t] = (conteoTitulos[t] || 0) + 1;
        autoresMap[t] = m.autor || "Anónimo"; // Asociamos el título con su autor
        
        if (!exclusividadMap[t]) exclusividadMap[t] = new Set();
        if (m.hermandad) exclusividadMap[t].add(m.hermandad);
    });

    const S = Object.keys(conteoTitulos).length;
    const elRiqueza = document.getElementById('kpi-riqueza');
    if (elRiqueza) elRiqueza.innerText = S;

    const elShannon = document.getElementById('kpi-shannon');
    if (elShannon) {
        let H = 0;
        Object.values(conteoTitulos).forEach(f => {
            const pi = f / N;
            H -= pi * Math.log(pi);
        });
        
        // CÁLCULO RIGUROSO: Equitatividad de Pielou (J')
        if (S > 1) {
            const J = H / Math.log(S);
            const porcentaje = (J * 100).toFixed(1);
            elShannon.innerText = porcentaje + '%';
        } else {
            elShannon.innerText = '0%';
        }
    }

    const elExcl = document.getElementById('kpi-excl');
    if (elExcl && S > 0) {
        const exclCount = Object.values(exclusividadMap).filter(set => set.size === 1).length;
        elExcl.innerText = ((exclCount / S) * 100).toFixed(1) + '%';
    }

    // --- 3. ADN DE ÉPOCAS (Barra visual) ---
    const elAdn = document.getElementById('adn-bar-render');
    if (elAdn) {
        const eras = { c: 0, t: 0, m: 0 };
        data.forEach(m => {
            const a = parseInt(m.ano);
            if (!a || isNaN(a)) return;
            if (a < 1950) eras.c++;
            else if (a <= 2000) eras.t++;
            else eras.m++;
        });

        elAdn.innerHTML = `
            <div style="width:${(eras.c / N * 100)}%; background:#d4af37; height:100%" title="Clásico (<1950)"></div>
            <div style="width:${(eras.t / N * 100)}%; background:#888; height:100%" title="Transición (1950-2000)"></div>
            <div style="width:${(eras.m / N * 100)}%; background:#444; height:100%" title="Contemporáneo (>2000)"></div>
        `;
    }

    // --- 4. RENDERIZADO DE GRÁFICAS ---
    // AÑADIDO: Pasamos autoresMap para poder leerlo en las gráficas
    renderizarChartsMaster(data, conteoTitulos, anos, autoresMap);
}

function renderizarChartsMaster(raw, titulos, listaAnos, autoresMap) {
    Chart.defaults.color = '#777';
    Chart.defaults.font.family = 'Montserrat';

    const limpiarChart = (id) => {
        if (chartsActivas[id]) chartsActivas[id].destroy();
    };

    // 1. Cronología (Décadas)
    limpiarChart('canvasCronologia');
    const decs = {};
    listaAnos.forEach(a => { const d = Math.floor(a/10)*10; decs[d] = (decs[d]||0)+1; });
    const decadasOrdenadas = Object.keys(decs).sort((a, b) => a - b);

    const ctxCron = document.getElementById('canvasCronologia');
    if (ctxCron) {
        chartsActivas['canvasCronologia'] = new Chart(ctxCron, {
            type: 'line',
            data: {
                labels: decadasOrdenadas,
                datasets: [{ 
                    label: 'Obras por época', data: decadasOrdenadas.map(d => decs[d]), 
                    borderColor: '#d4af37', backgroundColor: 'rgba(212,175,55,0.1)', fill: true, tension: 0.4 
                }]
            },
            options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    // 2. Top 10 Marchas 
    limpiarChart('canvasTop');
    
    // AÑADIDO: Ahora la estructura es [Titulo, Interpretaciones, Autor]
    datosCompletosMarchas = Object.entries(titulos)
        .map(([titulo, conteo]) => [titulo, conteo, autoresMap[titulo]])
        .sort((a,b) => b[1] - a[1]);
        
    const top10Marchas = datosCompletosMarchas.slice(0, 10); 
    
    const ctxTop = document.getElementById('canvasTop');
    if (ctxTop) {
        chartsActivas['canvasTop'] = new Chart(ctxTop, {
            type: 'bar',
            data: {
                labels: top10Marchas.map(d => d[0]),
                datasets: [{ label: 'Interpretaciones', data: top10Marchas.map(d => d[1]), backgroundColor: '#d4af37', borderRadius: 5 }]
            },
            options: { 
                indexAxis: 'y', 
                maintainAspectRatio: false, 
                plugins: { 
                    legend: { display: false },
                    // NUEVO: Añadimos el autor al recuadro flotante
                    tooltip: {
                        callbacks: {
                            afterLabel: function(context) {
                                return 'Autor: ' + top10Marchas[context.dataIndex][2];
                            }
                        }
                    }
                } 
            }
        });
    }

    // 3. Top 10 Autores
    limpiarChart('canvasAutores');
    const autF = {};
    raw.forEach(m => { if(m.autor) autF[m.autor] = (autF[m.autor] || 0) + 1; });
    
    datosCompletosAutores = Object.entries(autF).sort((a,b) => b[1] - a[1]);
    const top10Autores = datosCompletosAutores.slice(0, 10); 

    const ctxAut = document.getElementById('canvasAutores');
    if (ctxAut) {
        chartsActivas['canvasAutores'] = new Chart(ctxAut, {
            type: 'bar',
            data: {
                labels: top10Autores.map(a => a[0]),
                datasets: [{ label: 'Obras interpretadas', data: top10Autores.map(a => a[1]), backgroundColor: 'rgba(212, 175, 55, 0.6)', borderRadius: 5 }]
            },
            options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 4. Esfuerzo por Día
    limpiarChart('canvasEsfuerzo');
    const esfD = {};
    raw.forEach(m => { 
        if(!esfD[m.hermandad]) esfD[m.hermandad] = 0;
        esfD[m.hermandad] += (parseInt(m.duracion_seg) || 0);
    });
    const ctxEsf = document.getElementById('canvasEsfuerzo');
    if (ctxEsf) {
        chartsActivas['canvasEsfuerzo'] = new Chart(ctxEsf, {
            type: 'bar',
            data: {
                labels: Object.keys(esfD),
                datasets: [{ 
                    label: 'Minutos Interpretados', data: Object.values(esfD).map(s => (s/60).toFixed(1)), 
                    backgroundColor: 'rgba(212,175,55,0.2)', borderColor: '#d4af37', borderWidth: 1 
                }]
            },
            options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    // 5. Tasa de Rotación / Reincidencia (Doughnut)
    limpiarChart('canvasRotacion');
    let rotBaja = 0, rotMedia = 0, rotAlta = 0;
    
    // titulos es el objeto que ya tiene contado cuántas veces suena cada marcha
    Object.values(titulos).forEach(count => {
        if (count === 1) rotBaja++;
        else if (count >= 2 && count <= 3) rotMedia++;
        else rotAlta++;
    });
    
    const ctxRot = document.getElementById('canvasRotacion');
    if (ctxRot) {
        chartsActivas['canvasRotacion'] = new Chart(ctxRot, {
            type: 'doughnut',
            data: {
                labels: ['1 sola vez', '2 a 3 veces', '4 o más veces'],
                datasets: [{ 
                    data: [rotBaja, rotMedia, rotAlta], 
                    backgroundColor: [
                        'rgba(136, 136, 136, 0.5)', // Gris (Baja rotación)
                        'rgba(212, 175, 55, 0.5)',  // Oro translúcido (Media)
                        'rgba(212, 175, 55, 1)'     // Oro sólido (Alta rotación)
                    ], 
                    borderColor: '#111',
                    borderWidth: 2
                }]
            },
            options: { 
                maintainAspectRatio: false, 
                cutout: '70%', 
                plugins: { 
                    legend: { 
                        position: 'bottom', 
                        labels: { color: '#ccc', font: { size: 11, family: 'Montserrat' } } 
                    } 
                } 
            }
        });
    }
}

// ========================================================
// LOGICA DEL MODAL EMERGENTE PARA LISTAS COMPLETAS
// ========================================================

function abrirModalGrafico(tipo) {
    const modal = document.getElementById('modal-grafico-completo');
    const titulo = document.getElementById('modal-titulo-grafico');
    const contenedor = document.getElementById('contenedor-canvas-modal');
    
    contenedor.innerHTML = '<canvas id="canvasModalRender"></canvas>';
    
    let dataset = [];
    let colorBarra = '';
    let labelEjeX = '';

    if (tipo === 'marchas') {
        titulo.innerText = "Ranking Completo de Marchas";
        dataset = datosCompletosMarchas;
        colorBarra = '#d4af37';
        labelEjeX = 'Interpretaciones';
    } else if (tipo === 'autores') {
        titulo.innerText = "Influencia Total de Compositores";
        dataset = datosCompletosAutores;
        colorBarra = 'rgba(212, 175, 55, 0.6)';
        labelEjeX = 'Obras Interpretadas';
    }

    const alturaNecesaria = Math.max(400, dataset.length * 25);
    contenedor.style.height = alturaNecesaria + 'px';

    modal.style.display = 'flex';

    const ctxModal = document.getElementById('canvasModalRender');
    chartsActivas['canvasModalRender'] = new Chart(ctxModal, {
        type: 'bar',
        data: {
            labels: dataset.map(d => d[0]),
            datasets: [{ 
                label: labelEjeX, 
                data: dataset.map(d => d[1]), 
                backgroundColor: colorBarra, 
                borderRadius: 3 
            }]
        },
        options: { 
            indexAxis: 'y', 
            maintainAspectRatio: false, 
            plugins: { 
                legend: { display: false },
                // NUEVO: Añadimos el autor al recuadro flotante del Modal
                tooltip: {
                    callbacks: {
                        afterLabel: function(context) {
                            if (tipo === 'marchas' && dataset[context.dataIndex][2]) {
                                return 'Autor: ' + dataset[context.dataIndex][2];
                            }
                            return null;
                        }
                    }
                }
            },
            scales: {
                x: { ticks: { stepSize: 1 } }, 
                y: { ticks: { autoSkip: false, font: { size: 11 } } } 
            }
        }
    });
}

function cerrarModalGrafico() {
    const modal = document.getElementById('modal-grafico-completo');
    modal.style.display = 'none';
    if (chartsActivas['canvasModalRender']) {
        chartsActivas['canvasModalRender'].destroy();
    }
}

window.onload = iniciarAuditoriaGlobal;