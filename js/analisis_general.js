/**
 * ARCHIVO: js/analisis_general.js
 * FUNCIÓN: Gestión de Auditoría Global 2026 - Julián Cerdán
 */

// Variable global para controlar las instancias de las gráficas
let chartsActivas = {};

async function iniciarAuditoriaGlobal() {
    const params = new URLSearchParams(window.location.search);
    const tipo = params.get('tipo') || "Semana Santa";
    const year = params.get('year') || "2026";

    // Actualizar subtítulo si existe
    const elSub = document.getElementById('subtitulo-analisis');
    if (elSub) elSub.innerText = `${tipo} • Informe de Datos ${year}`;

    try {
        // 1. Obtención masiva de datos desde Supabase
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

        // 2. Unión de datos optimizada (O(n)) mediante Map para alto volumen (>500 registros)
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
    
    // Total Interpretaciones
    const elTotal = document.getElementById('kpi-total');
    if (elTotal) elTotal.innerText = N;

    // Esfuerzo (Horas y Minutos)
    const elHoras = document.getElementById('kpi-horas');
    if (elHoras) {
        const segs = data.reduce((acc, m) => acc + (parseInt(m.duracion_seg) || 0), 0);
        const h = Math.floor(segs / 3600);
        const m = Math.floor((segs % 3600) / 60);
        elHoras.innerText = `${h}h ${m}m`;
    }

    // Antigüedad Media
    const elMedia = document.getElementById('kpi-media');
    const anos = data.map(m => parseInt(m.ano)).filter(a => a > 1800);
    if (elMedia && anos.length > 0) {
        const media = anos.reduce((a, b) => a + b, 0) / anos.length;
        elMedia.innerText = Math.round(media);
    }

    // --- 2. DIVERSIDAD Y EXCLUSIVIDAD ---
    const conteoTitulos = {};
    const exclusividadMap = {}; 

    data.forEach(m => {
        const t = m.titulo || "S/D";
        conteoTitulos[t] = (conteoTitulos[t] || 0) + 1;
        
        if (!exclusividadMap[t]) exclusividadMap[t] = new Set();
        if (m.hermandad) exclusividadMap[t].add(m.hermandad);
    });

    // Obras únicas (Riqueza)
    const S = Object.keys(conteoTitulos).length;
    const elRiqueza = document.getElementById('kpi-riqueza');
    if (elRiqueza) elRiqueza.innerText = S;

    // Índice de Diversidad de Shannon (H')
    const elShannon = document.getElementById('kpi-shannon');
    if (elShannon) {
        let H = 0;
        Object.values(conteoTitulos).forEach(f => {
            const pi = f / N;
            H -= pi * Math.log(pi);
        });
        elShannon.innerText = H.toFixed(2);
    }

    // Índice de Exclusividad
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
    renderizarChartsMaster(data, conteoTitulos, anos);
}

function renderizarChartsMaster(raw, titulos, listaAnos) {
    Chart.defaults.color = '#777';
    Chart.defaults.font.family = 'Montserrat';

    // Función para limpiar canvas y evitar errores de duplicidad
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
                    label: 'Obras por época', 
                    data: decadasOrdenadas.map(d => decs[d]), 
                    borderColor: '#d4af37', 
                    backgroundColor: 'rgba(212,175,55,0.1)', 
                    fill: true, 
                    tension: 0.4 
                }]
            },
            options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    // 2. Top 15 Marchas (Barras Horizontales)
    limpiarChart('canvasTop');
    const top15 = Object.entries(titulos).sort((a,b) => b[1] - a[1]).slice(0, 15);
    const ctxTop = document.getElementById('canvasTop');
    if (ctxTop) {
        chartsActivas['canvasTop'] = new Chart(ctxTop, {
            type: 'bar',
            data: {
                labels: top15.map(d => d[0]),
                datasets: [{ label: 'Interpretaciones', data: top15.map(d => d[1]), backgroundColor: '#d4af37', borderRadius: 5 }]
            },
            options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 3. Top 15 Autores (Barras Horizontales para evitar colapso de leyenda)
    limpiarChart('canvasAutores');
    const autF = {};
    raw.forEach(m => { if(m.autor) autF[m.autor] = (autF[m.autor] || 0) + 1; });
    const top15Autores = Object.entries(autF).sort((a,b) => b[1] - a[1]).slice(0, 15);
    const ctxAut = document.getElementById('canvasAutores');
    if (ctxAut) {
        chartsActivas['canvasAutores'] = new Chart(ctxAut, {
            type: 'bar',
            data: {
                labels: top15Autores.map(a => a[0]),
                datasets: [{ label: 'Obras interpretadas', data: top15Autores.map(a => a[1]), backgroundColor: 'rgba(212, 175, 55, 0.6)', borderRadius: 5 }]
            },
            options: { indexAxis: 'y', maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    // 4. Esfuerzo por Día (Minutos)
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
                    label: 'Minutos Interpretados', 
                    data: Object.values(esfD).map(s => (s/60).toFixed(1)), 
                    backgroundColor: 'rgba(212,175,55,0.2)', 
                    borderColor: '#d4af37', 
                    borderWidth: 1 
                }]
            },
            options: { maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }

    // 5. Localidades (Polar Area)
    limpiarChart('canvasLocs');
    const locF = {};
    raw.forEach(m => { if(m.localidad) locF[m.localidad] = (locF[m.localidad] || 0) + 1; });
    const ctxLoc = document.getElementById('canvasLocs');
    if (ctxLoc) {
        chartsActivas['canvasLocs'] = new Chart(ctxLoc, {
            type: 'polarArea',
            data: {
                labels: Object.keys(locF),
                datasets: [{ 
                    data: Object.values(locF), 
                    backgroundColor: ['rgba(212,175,55,0.4)', 'rgba(255,255,255,0.2)', 'rgba(136,136,136,0.4)', 'rgba(68,68,68,0.6)'], 
                    borderColor: '#000' 
                }]
            },
            options: { maintainAspectRatio: false, scales: { r: { ticks: { display: false }, grid: { color: '#222' } } } }
        });
    }
}

// Inicialización
window.onload = iniciarAuditoriaGlobal;