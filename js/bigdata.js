/* ============================================================
   MOTOR ESTADÍSTICO Y MACHINE LEARNING (Julián Cerdán)
   Incluye: Estadística Inferencial, Regresión Lineal, K-Means Clustering y Matriz de Calor Completa
   ============================================================ */

let chartDecadas = null;
let chartDispersion = null;
let chartPareto = null;

// --- EXTRACCIÓN Y DATA CLEANING ---
async function extraerYProcesarDatos() {
    try {
        const { data, error } = await clienteSupabase
            .from('catalogo_marchas')
            .select('*');
        
        if (error) throw error;
        
        // Limpieza de datos (excluimos nulos, años absurdos y duraciones < 1 min)
        const dataset = data.map(d => ({
            ...d,
            ano_num: parseInt(d.ano),
            dur_num: parseInt(d.duracion_seg)
        })).filter(d => 
            !isNaN(d.ano_num) && d.ano_num > 1800 && d.ano_num <= new Date().getFullYear() &&
            !isNaN(d.dur_num) && d.dur_num > 60
        );

        ejecutarAnalisisProfundo(dataset);
        
    } catch (err) {
        console.error("Error en el Laboratorio Big Data:", err.message);
        alert("Fallo en la sincronización inferencial de Supabase.");
    }
}

// --- ALGORITMOS ESTADÍSTICOS ---
function ejecutarAnalisisProfundo(datos) {
    const N = datos.length;
    if (N === 0) return;

    // --- 1. KPIs DE ESTADÍSTICA POBLACIONAL ---
    document.getElementById('bd-n').innerText = N;
    
    const autoresSet = new Set(datos.map(d => d.autor).filter(a => a && a !== "Desconocido"));
    document.getElementById('bd-indice-autores').innerText = autoresSet.size;

    // Mediana Robusta (Año)
    const anosArray = datos.map(d => d.ano_num).sort((a,b) => a - b);
    const mid = Math.floor(anosArray.length / 2);
    const medianaAno = anosArray.length % 2 !== 0 ? anosArray[mid] : Math.round((anosArray[mid-1] + anosArray[mid]) / 2);
    document.getElementById('bd-ano-mediana').innerText = medianaAno;

    // Media (μ) y Desviación Estándar (σ)
    const duracionesArray = datos.map(d => d.dur_num);
    const mediaDur = duracionesArray.reduce((a,b) => a+b, 0) / N;
    const varianza = duracionesArray.reduce((a,b) => a + Math.pow(b - mediaDur, 2), 0) / N;
    const desviacion = Math.sqrt(varianza);

    const m_min = Math.floor(mediaDur / 60);
    const s_sec = Math.round(mediaDur % 60);
    document.getElementById('bd-duracion-media').innerText = `${m_min}:${s_sec.toString().padStart(2,'0')}`;
    document.getElementById('bd-duracion-sub').innerText = `Desviación (σ): ±${Math.round(desviacion)}s`;

    // --- 2. ANÁLISIS A/B (CORNETAS VS PLANTILLA COMPLETA) ---
    const cornetas = datos.filter(d => d.cornetas == 1 || d.cornetas === true);
    const sinCornetas = datos.filter(d => d.cornetas == 0 || d.cornetas === false);

    const freqCC = (cornetas.length / N) * 100;
    const freqSC = (sinCornetas.length / N) * 100;
    document.getElementById('ab-freq-cc').innerText = freqCC.toFixed(1) + '%';
    document.getElementById('ab-freq-sc').innerText = freqSC.toFixed(1) + '%';
    document.getElementById('ab-freq-delta').innerText = Math.abs(freqCC - freqSC).toFixed(1) + ' p.p.';

    const calcMediana = (arr, campo) => {
        if(arr.length === 0) return 0;
        const vals = arr.map(d => d[campo]).sort((a,b)=>a-b);
        const midIdx = Math.floor(vals.length/2);
        return vals.length % 2 !== 0 ? vals[midIdx] : Math.round((vals[midIdx-1] + vals[midIdx]) / 2);
    };

    const calcMedia = (arr, campo) => arr.length ? arr.reduce((a,b)=>a+b[campo],0)/arr.length : 0;

    const medAnoCC = calcMediana(cornetas, 'ano_num');
    const medAnoSC = calcMediana(sinCornetas, 'ano_num');
    document.getElementById('ab-ano-cc').innerText = medAnoCC || '-';
    document.getElementById('ab-ano-sc').innerText = medAnoSC || '-';
    document.getElementById('ab-ano-delta').innerText = Math.abs(medAnoCC - medAnoSC) + ' años';

    const durMediaCC = calcMedia(cornetas, 'dur_num');
    const durMediaSC = calcMedia(sinCornetas, 'dur_num');
    
    const fmtT = s => s>0 ? `${Math.floor(s/60)}:${Math.round(s%60).toString().padStart(2,'0')}` : '-';
    
    document.getElementById('ab-dur-cc').innerText = fmtT(durMediaCC);
    document.getElementById('ab-dur-sc').innerText = fmtT(durMediaSC);
    document.getElementById('ab-dur-delta').innerText = Math.round(Math.abs(durMediaCC - durMediaSC)) + 's';

    // --- 3. ML Y MATRIZ DE CALOR ---
    renderizarGraficosYModelos(datos);
    renderizarMatrizCalor(datos);
}

function renderizarGraficosYModelos(datos) {
    Chart.defaults.color = '#ccc';
    Chart.defaults.font.family = 'Montserrat';

    // ==========================================
    // GRÁFICO 1: HISTOGRAMA DÉCADAS
    // ==========================================
    const decadasMap = {};
    datos.forEach(d => {
        const decada = Math.floor(d.ano_num / 10) * 10;
        decadasMap[`${decada}s`] = (decadasMap[`${decada}s`] || 0) + 1;
    });

    if(chartDecadas) chartDecadas.destroy();
    chartDecadas = new Chart(document.getElementById('chartDecadas'), {
        type: 'bar',
        data: {
            labels: Object.keys(decadasMap).sort(),
            datasets: [{ label: 'Nº Marchas', data: Object.keys(decadasMap).sort().map(k => decadasMap[k]), backgroundColor: '#d4af37' }]
        },
        options: { maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // ==========================================
    // ALGORITMO: REGRESIÓN LINEAL Y K-MEANS
    // ==========================================
    let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
    const n = datos.length;
    datos.forEach(d => {
        sumX += d.ano_num; 
        sumY += (d.dur_num / 60);
        sumXY += (d.ano_num * (d.dur_num / 60)); 
        sumXX += (d.ano_num * d.ano_num);
    });
    
    const m = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const b = (sumY - m * sumX) / n;
    
    const minAno = Math.min(...datos.map(d => d.ano_num));
    const maxAno = Math.max(...datos.map(d => d.ano_num));
    
    const lineaTendencia = [
        { x: minAno, y: m * minAno + b },
        { x: maxAno, y: m * maxAno + b }
    ];

    const maxDur = Math.max(...datos.map(d => d.dur_num));
    const normalizedData = datos.map(d => ({
        ...d, normX: (d.ano_num - minAno) / (maxAno - minAno), normY: d.dur_num / maxDur
    }));

    let centroids = [ { x: 0.2, y: 0.8 }, { x: 0.8, y: 0.3 }, { x: 0.5, y: 0.5 } ];
    let clusters = [[], [], []];

    for (let iter = 0; iter < 5; iter++) {
        clusters = [[], [], []];
        normalizedData.forEach(d => {
            let minDist = Infinity; let cIndex = 0;
            centroids.forEach((c, i) => {
                const dist = Math.pow(d.normX - c.x, 2) + Math.pow(d.normY - c.y, 2);
                if (dist < minDist) { minDist = dist; cIndex = i; }
            });
            clusters[cIndex].push(d);
        });

        centroids = clusters.map(cluster => {
            if (cluster.length === 0) return {x: 0, y: 0};
            return {
                x: cluster.reduce((sum, p) => sum + p.normX, 0) / cluster.length,
                y: cluster.reduce((sum, p) => sum + p.normY, 0) / cluster.length
            };
        });
    }

    if(chartDispersion) chartDispersion.destroy();
    chartDispersion = new Chart(document.getElementById('chartDispersion'), {
        data: {
            datasets: [
                {
                    type: 'line', label: 'Tendencia (Regresión)', data: lineaTendencia,
                    borderColor: 'rgba(255, 59, 59, 0.8)', borderWidth: 2, borderDash: [5, 5], pointRadius: 0
                },
                {
                    type: 'scatter', label: 'Clúster A',
                    data: clusters[0].map(d => ({ x: d.ano_num, y: d.dur_num / 60, titulo: d.titulo })),
                    backgroundColor: 'rgba(212, 175, 55, 0.8)', borderColor: '#000', pointRadius: 5
                },
                {
                    type: 'scatter', label: 'Clúster B',
                    data: clusters[1].map(d => ({ x: d.ano_num, y: d.dur_num / 60, titulo: d.titulo })),
                    backgroundColor: 'rgba(52, 152, 219, 0.8)', borderColor: '#000', pointRadius: 5
                },
                {
                    type: 'scatter', label: 'Clúster C',
                    data: clusters[2].map(d => ({ x: d.ano_num, y: d.dur_num / 60, titulo: d.titulo })),
                    backgroundColor: 'rgba(46, 204, 113, 0.8)', borderColor: '#000', pointRadius: 5
                }
            ]
        },
        options: {
            maintainAspectRatio: false,
            plugins: { 
                legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 10 } } },
                tooltip: { callbacks: { label: (ctx) => `${ctx.raw.titulo} (${ctx.raw.x}) - ${ctx.raw.y.toFixed(2)} min` } }
            },
            scales: {
                // Eje Lineal para correcta dispersión en el tiempo
                x: { type: 'linear', position: 'bottom', title: { display: true, text: 'Año de Composición' }, min: 1850, max: new Date().getFullYear() + 5, grid: { color: 'rgba(255,255,255,0.05)' } },
                y: { title: { display: true, text: 'Duración (Minutos)' }, grid: { color: 'rgba(255,255,255,0.05)' } }
            }
        }
    });

    // ==========================================
    // GRÁFICO 3: PARETO DE AUTORES
    // ==========================================
    const conteoAutores = {};
    datos.forEach(d => { if(d.autor && d.autor !== 'Desconocido') conteoAutores[d.autor] = (conteoAutores[d.autor] || 0) + 1; });
    const topAutores = Object.entries(conteoAutores).sort((a,b) => b[1] - a[1]).slice(0, 10);

    if(chartPareto) chartPareto.destroy();
    chartPareto = new Chart(document.getElementById('chartPareto'), {
        type: 'bar',
        data: {
            labels: topAutores.map(a => a[0]),
            datasets: [{ label: 'Obras', data: topAutores.map(a => a[1]), backgroundColor: 'rgba(255, 255, 255, 0.8)', borderRadius: 4 }]
        },
        options: { maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(255,255,255,0.05)' } }, y: { grid: { display: false } } } }
    });
}

// ==========================================
// GEOGRAFÍA MUSICAL: MATRIZ DE CALOR COMPLETA
// ==========================================
function renderizarMatrizCalor(datos) {
    const head = document.getElementById('heatmap-head');
    const body = document.getElementById('heatmap-body');
    head.innerHTML = ''; body.innerHTML = '';

    const conteoAutores = {};
    const conteoLocalidades = {};
    const relaciones = {};

    datos.forEach(d => {
        if (!d.autor || d.autor === 'Desconocido' || !d.localidad) return;
        
        conteoAutores[d.autor] = (conteoAutores[d.autor] || 0) + 1;
        conteoLocalidades[d.localidad] = (conteoLocalidades[d.localidad] || 0) + 1;
        
        const clave = `${d.autor}|${d.localidad}`;
        relaciones[clave] = (relaciones[clave] || 0) + 1;
    });

    // MATRIZ MAESTRA: Eliminamos el .slice() para procesar todos los autores y localidades
    const topAutores = Object.entries(conteoAutores).sort((a,b) => b[1] - a[1]).map(x => x[0]);
    const topLocalidades = Object.entries(conteoLocalidades).sort((a,b) => b[1] - a[1]).map(x => x[0]);

    if (topAutores.length === 0 || topLocalidades.length === 0) return;

    const maxRelacion = Math.max(...Object.values(relaciones));

    // Cabecera (Localidades)
    let trHead = '<tr><th style="text-align: left; background: #000; position: sticky; left: 0; top: 0; z-index: 3;">COMPOSITOR</th>';
    topLocalidades.forEach(loc => {
        trHead += `<th style="position: sticky; top: 0; background: #000; z-index: 2;">${loc}</th>`;
    });
    trHead += '</tr>';
    head.innerHTML = trHead;

    // Cuerpo (Autores y Relaciones)
    topAutores.forEach(autor => {
        let tr = `<tr><td class="sticky-col">${autor}</td>`;
        
        topLocalidades.forEach(loc => {
            const cruce = relaciones[`${autor}|${loc}`] || 0;
            
            let bg = 'transparent';
            let colorTexto = '#555';
            
            if (cruce > 0) {
                const intensidad = 0.15 + (0.85 * (cruce / maxRelacion));
                bg = `rgba(212, 175, 55, ${intensidad})`;
                colorTexto = intensidad > 0.5 ? '#000' : '#fff';
            }
            
            tr += `<td style="background: ${bg}; color: ${colorTexto}; font-weight: ${cruce > 0 ? '900' : 'normal'}; border: 1px solid #1a1a1a;">
                ${cruce > 0 ? cruce : '-'}
            </td>`;
        });
        tr += '</tr>';
        body.innerHTML += tr;
    });
}

// Iniciar al cargar
window.onload = () => {
    setTimeout(extraerYProcesarDatos, 100);
};