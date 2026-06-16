/* ============================================================
   LÓGICA DE AUDITORÍA INDIVIDUAL AVANZADA (ANALISIS.JS)
   Motor de cruce de datos, estadísticas y renderizado Chart.js
   ============================================================ */

const parametrosURL = new URLSearchParams(window.location.search);
const idProcesion = parametrosURL.get('id');

let datosProcesion = null;
let repertorioEnriquecido = []; // Snapshot cruzado con la matriz maestra del catálogo

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
        // 1. Descargamos los datos de cabecera de la Procesión
        // CAMBIO: Usamos maybeSingle() para evitar el error 406
        const { data: procData, error: procError } = await clienteSupabase
            .from('maestro_procesiones')
            .select('*')
            .eq('id_procesion', idProcesion)
            .maybeSingle(); 
            
        if (procError) throw procError;
        
        // Freno de seguridad: Si no encuentra la procesión, paramos aquí
        if (!procData) {
            document.getElementById('titulo-hermandad').innerText = "Procesión no encontrada";
            document.getElementById('subtitulo-localidad').innerText = "El ID no existe o no hay permisos de lectura.";
            return;
        }
        
        datosProcesion = procData;

        // 2. Descargamos el REPERTORIO TRANSACCIONAL
        const { data: transData, error: transError } = await clienteSupabase
            .from('repertorio_transaccional')
            .select('*')
            .eq('id_procesion', idProcesion)
            .order('orden', { ascending: true }); 
        if (transError) throw transError;

        // 3. Descargamos el Catálogo Maestro
        const { data: catData, error: catError } = await clienteSupabase
            .from('catalogo_marchas')
            .select('*');
        if (catError) throw catError;

        // 4. EL CRUCE DE DATOS
        repertorioEnriquecido = transData.map(trans => {
            const marchaCatalogo = catData.find(m => m.id_marcha === trans.id_marcha) || {};
            return { 
                ...marchaCatalogo, 
                fase: trans.fase, 
                orden: trans.orden 
            }; 
        });

        // 5. Lanzamos la cadena de renderizado
        renderizarCabecera(datosProcesion);
        calcularMetricas(repertorioEnriquecido, datosProcesion.hermandad, datosProcesion.localidad);
        analizarRepeticiones(repertorioEnriquecido);
        renderizarGraficos(repertorioEnriquecido);
        renderizarTimeline(repertorioEnriquecido);
        analizarDispersionYEstilo(repertorioEnriquecido);
        gestionarPanelYoutube(datosProcesion);

        // 6. Lanzar la carga de la interacción social
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
        
        // CORRECCIÓN DE ENCUADRE: Foco en el rostro/centro
        document.body.style.backgroundPosition = 'center 30%'; 
        
        document.body.style.backgroundAttachment = 'fixed';

        const hero = document.getElementById('hero-procesion');
        hero.style.background = 'transparent';
        hero.style.borderColor = 'transparent';
        hero.style.boxShadow = 'none';
    }
}

/* ------------------------------------------------------------
   MÓDULO 2: KPIS Y ESTADÍSTICAS MATEMÁTICAS
------------------------------------------------------------ */
// OJO: Recuerda que hemos añadido el parámetro "localidadStr" a la función
function calcularMetricas(repertorio, hermandadStr, localidadStr) {
    const n = repertorio.length;
    if (n === 0) return;

    // KPI 1 y 2: Total y Autores
    document.getElementById('kpi-total').innerText = n;
    const autoresUnicos = new Set(repertorio.map(m => m.autor).filter(a => a && a !== "Desconocido"));
    document.getElementById('kpi-autores').innerText = autoresUnicos.size;

    // KPI 3: Mix de Cornetas
    const conCornetas = repertorio.filter(m => m.cornetas === 1).length;
    document.getElementById('kpi-cornetas').innerText = ((conCornetas / n) * 100).toFixed(1) + "%";

    // KPI 4: Año Medio de Composición
    const anosValidos = repertorio.map(m => m.ano).filter(a => typeof a === 'number' && a > 1800);
    if (anosValidos.length > 0) {
        const anoMedio = Math.round(anosValidos.reduce((a, b) => a + b, 0) / anosValidos.length);
        document.getElementById('kpi-ano').innerText = anoMedio;
    } else {
        document.getElementById('kpi-ano').innerText = "N/A";
    }

    // KPI 5: Duración Total Estimada
    const duracionSegundos = repertorio.reduce((acc, m) => acc + (m.duracion_seg || 240), 0); // 4 min por defecto
    const horas = Math.floor(duracionSegundos / 3600);
    const minutos = Math.floor((duracionSegundos % 3600) / 60);
    document.getElementById('kpi-duracion').innerText = `${horas}h ${minutos}m`;

    // KPI 6: % Marchas Dedicadas (Algoritmo de Doble Coincidencia Estricta: Hermandad + Localidad)
    const normalizar = (txt) => txt ? txt.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
    
    // Lista ampliada de palabras ignoradas para evitar falsos positivos
    const palabrasIgnoradas = ["la", "el", "los", "las", "de", "del", "hermandad", "cofradia", "cristo", "virgen", "nuestra", "senora", "jesus", "san", "santa"];
    
    // 1. Extraemos palabras clave de la hermandad y de la localidad
    const termsHermandad = normalizar(hermandadStr).split(" ").filter(w => !palabrasIgnoradas.includes(w) && w.length > 3);
    
    // Controlamos si la localidadStr viene vacía o indefinida
    const termsLocalidadProcesion = localidadStr ? normalizar(localidadStr).split(" ").filter(w => !palabrasIgnoradas.includes(w) && w.length > 3) : [];
    
    let dedicadasContador = 0;
    
    repertorio.forEach(m => {
        const dedicatoria = normalizar(m.dedicatoria);
        const localidadComposicion = normalizar(m.localidad); 
        
        // CONDICIÓN 1: La dedicatoria debe contener alguna palabra clave de la Hermandad
        const coincideHermandad = termsHermandad.some(term => dedicatoria.includes(term));
        
        if (coincideHermandad) {
            // CONDICIÓN 2: Filtro estricto de localidad
            
            // Si por algún motivo no tenemos el dato de la localidad de la procesión, 
            // asumimos que es válida solo con la hermandad para no romper el contador.
            if (termsLocalidadProcesion.length === 0) {
                dedicadasContador++;
                return; // Pasa a la siguiente marcha
            }

            // A) ¿Aparece el pueblo de la procesión escrito textualmente dentro de la dedicatoria?
            const localidadEnDedicatoria = termsLocalidadProcesion.some(term => dedicatoria.includes(term));
            
            // B) ¿Coincide el pueblo de la procesión con la columna 'localidad' de la marcha?
            const localidadEnCampo = localidadComposicion && termsLocalidadProcesion.some(term => localidadComposicion.includes(term));
            
            // Si cumple el filtro de localidad por A o por B, es una dedicatoria real
            if (localidadEnDedicatoria || localidadEnCampo) {
                dedicadasContador++;
            }
        }
    });

    document.getElementById('kpi-dedicadas').innerText = ((dedicadasContador / n) * 100).toFixed(1) + "%";
}

/* ------------------------------------------------------------
   MÓDULO 3: PANEL DE REDUNDANCIA (REPETICIONES INFORMATIVAS)
------------------------------------------------------------ */
function analizarRepeticiones(repertorio) {
    const conteo = {};
    repertorio.forEach(m => {
        const titulo = m.titulo;
        conteo[titulo] = (conteo[titulo] || 0) + 1;
    });

    const repetidas = Object.entries(conteo).filter(([titulo, cantidad]) => cantidad > 1);
    const panel = document.getElementById('panel-repeticiones');

    if (repetidas.length > 0) {
        let htmlAlert = `
            <div style="font-size: 2rem;">🔁</div>
            <div style="width: 100%;">
                <strong style="color: var(--color-oro); font-size: 1.1rem; letter-spacing: 1px;">MARCHAS REITERADAS</strong>
                <p style="margin: 5px 0 10px 0; color: #aaa; font-size: 0.85rem;">Las siguientes composiciones sonaron en múltiples ocasiones durante el itinerario:</p>
                <ul style="margin: 0; padding-left: 20px; color: #f4f4f4; line-height: 1.6;">`;
        
        repetidas.forEach(([titulo, cantidad]) => {
            htmlAlert += `<li><strong>${titulo}</strong> fue interpretada <strong style="color: var(--color-oro);">${cantidad} veces</strong>.</li>`;
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
   MÓDULO 4: GRÁFICOS INTERACTIVOS (CHART.JS)
------------------------------------------------------------ */
function renderizarGraficos(repertorio) {
    Chart.defaults.color = 'rgba(255, 255, 255, 0.7)';
    Chart.defaults.font.family = 'Montserrat';

    // --- 1. Gráfico de Tiempos (Doughnut) ---
    if(instanciaTiempos) instanciaTiempos.destroy();
    const duraciones = repertorio.map(m => m.duracion_seg).filter(d => d > 0);
    const rangos = { '< 3m': 0, '3m - 4.5m': 0, '> 4.5m': 0 };
    duraciones.forEach(d => {
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

    // --- 2. Gráfico de Épocas (Bar Vertical) ---
    if(instanciaEpocas) instanciaEpocas.destroy();
    const anos = repertorio.map(m => m.ano).filter(a => a > 1800);
    const decadas = {};
    anos.forEach(a => {
        const decada = Math.floor(a / 10) * 10;
        decadas[`${decada}s`] = (decadas[`${decada}s`] || 0) + 1;
    });

    instanciaEpocas = new Chart(document.getElementById('chartEpocas'), {
        type: 'bar',
        data: { 
            labels: Object.keys(decadas).sort(), 
            datasets: [{ 
                label: 'Marchas', 
                data: Object.keys(decadas).sort().map(k => decadas[k]), 
                backgroundColor: '#d4af37',
                borderRadius: 4
            }] 
        },
        options: { maintainAspectRatio: false, responsive: true, plugins: { legend: { display: false } } }
    });

    // --- 3. Gráfico de Evolución Histórica ---
    if(instanciaEvolucion) instanciaEvolucion.destroy();
    const ordenMarchas = repertorio.map(m => `#${m.orden}`);
    const anosEvolucion = repertorio.map(m => {
        const year = parseInt(m.ano);
        return (!isNaN(year) && year > 1800) ? year : null;
    });

    const isSemanaSanta = datosProcesion.tipo === 'Semana Santa';
    const anotaciones = {};

    if (isSemanaSanta) {
        const idxCarreraOficial = repertorio.findIndex(m => m.fase === 'Carrera Oficial');
        const idxVuelta = repertorio.findIndex(m => m.fase === 'Vuelta');
        anotaciones.zonaIda = {
            type: 'box', xMin: 0, xMax: idxCarreraOficial !== -1 ? Math.max(0, idxCarreraOficial - 0.5) : repertorio.length,
            backgroundColor: 'rgba(255, 255, 255, 0.02)', borderWidth: 0,
            label: { display: true, content: 'IDA', position: 'start', color: 'rgba(255,255,255,0.3)', font: { size: 10, weight: 'bold' } }
        };
        if (idxCarreraOficial !== -1) {
            anotaciones.lineaCO = { type: 'line', xMin: Math.max(0, idxCarreraOficial - 0.5), xMax: Math.max(0, idxCarreraOficial - 0.5), borderColor: 'rgba(212, 175, 55, 0.8)', borderWidth: 2, borderDash: [5, 5] };
            anotaciones.zonaCO = { type: 'box', xMin: Math.max(0, idxCarreraOficial - 0.5), xMax: idxVuelta !== -1 ? Math.max(0, idxVuelta - 0.5) : repertorio.length, backgroundColor: 'rgba(212, 175, 55, 0.05)', borderWidth: 0, label: { display: true, content: 'CARRERA OFICIAL', position: 'start', color: 'rgba(212, 175, 55, 0.5)', font: { size: 10, weight: 'bold' } } };
        }
        if (idxVuelta !== -1) {
            anotaciones.lineaVuelta = { type: 'line', xMin: Math.max(0, idxVuelta - 0.5), xMax: Math.max(0, idxVuelta - 0.5), borderColor: 'rgba(255, 59, 59, 0.6)', borderWidth: 2, borderDash: [5, 5] };
            anotaciones.zonaVuelta = { type: 'box', xMin: Math.max(0, idxVuelta - 0.5), xMax: repertorio.length, backgroundColor: 'rgba(255, 59, 59, 0.05)', borderWidth: 0, label: { display: true, content: 'VUELTA', position: 'start', color: 'rgba(255, 59, 59, 0.5)', font: { size: 10, weight: 'bold' } } };
        }
    } else {
        const idxNoche = repertorio.findIndex(m => m.fase === 'Noche');
        anotaciones.zonaDia = {
            type: 'box', xMin: 0, xMax: idxNoche !== -1 ? Math.max(0, idxNoche - 0.5) : repertorio.length,
            backgroundColor: 'rgba(255, 255, 255, 0.02)', borderWidth: 0,
            label: { display: true, content: 'DÍA', position: 'start', color: 'rgba(255,255,255,0.3)', font: { size: 10, weight: 'bold' } }
        };
        if (idxNoche !== -1) {
            anotaciones.lineaNoche = { type: 'line', xMin: Math.max(0, idxNoche - 0.5), xMax: Math.max(0, idxNoche - 0.5), borderColor: 'rgba(100, 149, 237, 0.6)', borderWidth: 2, borderDash: [5, 5] };
            anotaciones.zonaNoche = { type: 'box', xMin: Math.max(0, idxNoche - 0.5), xMax: repertorio.length, backgroundColor: 'rgba(100, 149, 237, 0.05)', borderWidth: 0, label: { display: true, content: 'NOCHE', position: 'start', color: 'rgba(100, 149, 237, 0.6)', font: { size: 10, weight: 'bold' } } };
        }
    }

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
                annotation: { annotations: anotaciones }, 
                tooltip: {
                    callbacks: {
                        title: function(context) { return repertorio[context[0].dataIndex].titulo; },
                        afterTitle: function(context) { return "Fase: " + (repertorio[context[0].dataIndex].fase || 'N/A'); }
                    }
                }
            },
            scales: {
                y: { min: 1880, suggestedMax: new Date().getFullYear(), ticks: { stepSize: 10 } }
            }
        }
    });

    // --- 4. Gráfico de Compositores (Bar Horizontal) ---
    if(instanciaCompositores) instanciaCompositores.destroy();
    const autores = repertorio.map(m => m.autor).filter(a => a && a !== "Desconocido");
    const conteoAutores = {};
    autores.forEach(a => conteoAutores[a] = (conteoAutores[a] || 0) + 1);
    const topAutores = Object.entries(conteoAutores).sort((a, b) => b[1] - a[1]).slice(0, 5);

    instanciaCompositores = new Chart(document.getElementById('chartCompositores'), {
        type: 'bar',
        data: {
            labels: topAutores.map(a => a[0]),
            datasets: [{
                label: 'Obras Interpretadas',
                data: topAutores.map(a => a[1]),
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
   MÓDULO 5: LÍNEA DE TIEMPO (TIMELINE)
------------------------------------------------------------ */
function renderizarTimeline(repertorio) {
    const contenedor = document.getElementById('timeline-contenedor');
    contenedor.innerHTML = "";

    if (repertorio.length === 0) {
        return contenedor.innerHTML = `<p style="color: #ff3b3b; font-weight: bold;">No hay marchas registradas en este informe.</p>`;
    }

    repertorio.forEach(marcha => {
        const badgeDedicada = marcha.dedicatoria ? `<br><span style="font-size:0.75rem; color: rgba(212, 175, 55, 0.8); font-style:italic;">Dedicada a: ${marcha.dedicatoria}</span>` : '';
        
        contenedor.innerHTML += `
            <div class="timeline-item">
                <div class="timeline-punto"></div>
                <div class="t-hora">Nº ${marcha.orden}</div>
                <div class="t-fase">${marcha.fase || 'Itinerario'}</div>
                <h4 class="t-titulo">${marcha.titulo}</h4>
                <p class="t-autor">${marcha.autor || 'Autor no registrado'} ${badgeDedicada}</p>
            </div>
        `;
    });
}

/* ------------------------------------------------------------
   MÓDULO 6: EXPORTACIÓN PARA SOFTWARE R (CSV)
------------------------------------------------------------ */
const btnExportar = document.getElementById('btn-exportar-repertorio');
if (btnExportar) { // FIX: Evita el error null si el botón no está en el HTML
    btnExportar.addEventListener('click', () => {
        if (repertorioEnriquecido.length === 0) return alert("La matriz de datos está vacía.");

        const cabeceras = "orden,fase,titulo,autor,ano,duracion_seg,cornetas\n";
        const filas = repertorioEnriquecido.map(m => {
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

    // 1. Variabilidad de Autores (Tasa de Riqueza)
    const autores = new Set(repertorio.map(m => m.autor).filter(a => a && a !== "Desconocido"));
    const riquezaAutoral = ((autores.size / n) * 100).toFixed(1);
    document.getElementById('var-autores').innerText = riquezaAutoral + "%";

    // 2. Variabilidad de Años (Brecha Histórica)
    const anos = repertorio.map(m => parseInt(m.ano)).filter(a => !isNaN(a) && a > 1800);
    if (anos.length > 0) {
        const maxAno = Math.max(...anos);
        const minAno = Math.min(...anos);
        const brecha = maxAno - minAno;
        document.getElementById('var-anos').innerText = `${brecha} años`;
        document.getElementById('var-anos-detalle').innerText = `De ${minAno} a ${maxAno}`;
    }

    // 3. Variabilidad de Duración (Delta de Tiempos)
    const duraciones = repertorio.map(m => parseInt(m.duracion_seg)).filter(d => !isNaN(d) && d > 0);
    if (duraciones.length > 0) {
        const maxD = Math.max(...duraciones);
        const minD = Math.min(...duraciones);
        const diferencia = maxD - minD;
        const formatTime = s => `${Math.floor(s/60)}m ${s%60}s`;
        document.getElementById('var-duracion').innerText = formatTime(diferencia);
        document.getElementById('var-duracion-detalle').innerText = `Min: ${formatTime(minD)} | Max: ${formatTime(maxD)}`;
    }

    // 4. Densidad de Cornetas por Estrato Inteligente
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
            const marchasFase = repertorio.filter(m => m.fase === faseObj.idFase);
            const totalFase = marchasFase.length;
            const cornetasFase = marchasFase.filter(m => m.cornetas === 1).length;
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
                if(barra) barra.style.width = `${pct}%`;
            }, 100);
        });
    }
}

/* --- SISTEMA DE INVITACIÓN VISUAL EN ANÁLISIS --- */

/* --- SISTEMA DE INVITACIÓN VISUAL EN ANÁLISIS --- */

async function cargarDatosSociales() {
    // 1. LECTURA DE COMENTARIOS
    const { data: comentarios } = await clienteSupabase
        .from('procesion_comentarios')
        .select('*')
        .eq('id_procesion', idProcesion)
        .order('created_at', { ascending: true });

    // 2. LECTURA DE LIKES (AHORA DESDE LA TABLA 'valoraciones')
    const { data: valoraciones } = await clienteSupabase
        .from('valoraciones')
        .select('usuario_id')
        .eq('id_procesion', idProcesion);

    const totalLikes = valoraciones ? valoraciones.length : 0;
    const totalComentarios = comentarios ? comentarios.length : 0;

    // 3. COMPROBAR SI EL USUARIO HA VOTADO DIRECTO EN BASE DE DATOS
    const { data: { session } } = await clienteSupabase.auth.getSession();
    let yaVotado = false;
    
    if (session && valoraciones) {
        // Si su ID de usuario está en la lista de valoraciones, ya le dio a Me Gusta
        yaVotado = valoraciones.some(v => v.usuario_id === session.user.id);
    } else {
        // Respaldo visual en caché por si no ha iniciado sesión
        let votosRealizados = JSON.parse(localStorage.getItem('jc_votos_procesiones') || "[]");
        yaVotado = votosRealizados.includes(idProcesion);
    }

    // RENDERIZADO VISUAL
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

    // PINTAR COMENTARIOS
    const cont = document.getElementById('contenedor-comentarios-analisis');
    if (cont) {
        if (comentarios && comentarios.length > 0) {
            cont.innerHTML = comentarios.map(c => `
                <div style="background: rgba(255,255,255,0.03); padding: 15px; border-radius: 8px; margin-bottom: 12px; border-left: 3px solid var(--color-oro);">
                    <strong style="color: var(--color-oro); font-size: 0.9rem;">${c.usuario_nombre}:</strong> 
                    <span style="color: #ccc; font-size: 0.85rem; margin-left: 5px;">${c.comentario}</span>
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

    // Comprobamos en la base de datos si el usuario ya le había dado MG
    const { data: likeExistente } = await clienteSupabase
        .from('valoraciones')
        .select('*')
        .eq('id_procesion', idProcesion)
        .eq('usuario_id', session.user.id)
        .maybeSingle();

    try {
        let votosRealizados = JSON.parse(localStorage.getItem('jc_votos_procesiones') || "[]");

        if (likeExistente) {
            // SI YA LE DIO LIKE: Lo borramos de la tabla valoraciones
            const { error } = await clienteSupabase
                .from('valoraciones')
                .delete()
                .eq('id_procesion', idProcesion)
                .eq('usuario_id', session.user.id);

            if (error) throw error;
            votosRealizados = votosRealizados.filter(id => id !== idProcesion);
            
        } else {
            // SI NO LE HA DADO LIKE: Insertamos el registro nuevo
            const { error } = await clienteSupabase
                .from('valoraciones')
                .insert([{
                    id_procesion: idProcesion,
                    usuario_id: session.user.id
                }]);

            if (error) throw error;
            if (!votosRealizados.includes(idProcesion)) votosRealizados.push(idProcesion);
        }

        // Guardamos el caché y recargamos los números
        localStorage.setItem('jc_votos_procesiones', JSON.stringify(votosRealizados));
        cargarDatosSociales();

    } catch (err) {
        console.error("Error al actualizar MG en valoraciones:", err);
    }
}

// Función para cerrar el mensaje emergente
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

        // CAMBIO: Apuntamos a la nueva tabla dedicada
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

// Variable global para el ID de la procesión
const urlParams = new URLSearchParams(window.location.search);
const idProcesionActual = urlParams.get('id');

async function gestionarPanelYoutube(procData) {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    
    // 1. Verificar si es Administrador para mostrar el editor
    if (session) {
        const { data: perfil } = await clienteSupabase
            .from('perfiles')
            .select('rol')
            .eq('id', session.user.id)
            .maybeSingle();

        if (perfil && perfil.rol === 'admin') {
            document.getElementById('admin-panel-youtube').style.display = 'block';
            if (procData.url_youtube) {
                document.getElementById('input-url-youtube').value = procData.url_youtube;
            }
        }
    }

    // 2. Renderizar el vídeo para todo el mundo si existe la URL
    if (procData.url_youtube) {
        renderizarIframeYoutube(procData.url_youtube);
    }
}

// OJO: Le añadimos 'async' al principio porque ahora tiene que consultar datos a internet
async function renderizarIframeYoutube(input) {
    const contenedor = document.getElementById('contenedor-video-final');
    
    // CASO A: Galería (Varios IDs separados por comas)
    if (input.includes(',')) {
        const ids = input.split(',').map(id => id.trim()).filter(id => id.length > 0);
        
        // 1. Ponemos un mensaje de carga mientras va a buscar los títulos
        contenedor.innerHTML = `
            <h3 style="color: var(--color-oro); margin-bottom: 20px;">Recorrido Audiovisual 🎥</h3>
            <p style="color: #777; font-size: 0.9rem; font-style: italic;">Cargando títulos de los vídeos...</p>
        `;

        let htmlGaleria = `
            <h3 style="color: var(--color-oro); margin-bottom: 20px;">Recorrido Audiovisual 🎥</h3>
            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 20px;">
        `;

        // 2. Bucle inteligente: Preguntamos a internet por el título de CADA vídeo
        for (const id of ids) {
            let tituloVideo = "Marcha en Directo"; // Título por defecto por si falla internet
            
            try {
                // Truco OEmbed: Le preguntamos a este servicio gratuito cómo se llama el vídeo
                const respuesta = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${id}`);
                const datos = await respuesta.json();
                if (datos.title) {
                    tituloVideo = datos.title;
                }
            } catch (error) {
                console.warn(`No se pudo obtener el título para el vídeo ${id}`);
            }

            // 3. Montamos la tarjeta con el título real y un diseño flexible
            htmlGaleria += `
                <div style="background: rgba(18,18,18,0.8); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 8px; overflow: hidden; display: flex; flex-direction: column; transition: 0.3s;">
                    <a href="https://www.youtube.com/watch?v=${id}" target="_blank" style="text-decoration: none; flex: 1; display: flex; flex-direction: column;">
                        
                        <img src="https://img.youtube.com/vi/${id}/mqdefault.jpg" style="width: 100%; display: block; border-bottom: 1px solid rgba(212, 175, 55, 0.2);">
                        
                        <div style="padding: 15px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
                            <h4 style="color: white; font-size: 0.95rem; margin: 0 0 15px 0; font-weight: normal; line-height: 1.4;">${tituloVideo}</h4>
                            <span style="color: var(--color-oro); font-size: 0.75rem; font-weight: bold; letter-spacing: 1px; display: inline-block;">▶ VER VÍDEO</span>
                        </div>

                    </a>
                </div>
            `;
        }

        htmlGaleria += `</div>`;
        contenedor.innerHTML = htmlGaleria; // Sustituimos el mensaje de carga por la galería terminada

    } 
    // CASO B: Reproductor Individual (El código se queda exactamente igual)
    else {
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
                    src="${embedUrl}" 
                    frameborder="0" 
                    allowfullscreen>
                </iframe>
            </div>
        `;
    }
}

function procesarInputYoutube(inputRaw) {
    if (!inputRaw) return "";

    // Dividimos por comas por si el admin ha pegado varios enlaces
    const partes = inputRaw.split(',');
    
    const idsProcesados = partes.map(parte => {
        let cadena = parte.trim();
        
        // 1. Si es un enlace corto de móvil (youtu.be)
        if (cadena.includes('youtu.be/')) {
            return cadena.split('youtu.be/')[1].split(/[?#]/)[0];
        }
        // 2. Si es un enlace largo de PC (youtube.com/watch?v=...)
        if (cadena.includes('youtube.com/watch')) {
            try {
                const urlParams = new URL(cadena).searchParams;
                return urlParams.get('v') || cadena; // Extrae solo la variable 'v'
            } catch(e) { 
                return cadena; 
            }
        }
        // 3. Si ya es un ID puro o no lo reconoce, lo deja como estaba
        return cadena;
    });

    // Vuelve a unir los códigos limpios con comas
    return idsProcesados.filter(id => id.length > 0).join(', ');
}

// --- FUNCIÓN DE GUARDADO ACTUALIZADA ---
async function guardarUrlYoutube() {
    // Cogemos lo que ha escrito el usuario
    const inputUsuario = document.getElementById('input-url-youtube').value;
    
    // Lo pasamos por nuestra "lavadora" de código para sacar solo los IDs
    const nuevaUrlLimpia = procesarInputYoutube(inputUsuario);
    
    if (!idProcesionActual) return;

    try {
        const { error } = await clienteSupabase
            .from('maestro_procesiones')
            .update({ url_youtube: nuevaUrlLimpia })
            .eq('id_procesion', idProcesionActual);

        if (error) throw error;
        
        // Vaciamos la caja para que quede limpio y recargamos
        document.getElementById('input-url-youtube').value = '';
        window.location.reload(); 

    } catch (e) {
        alert("Error al guardar: " + e.message);
    }
}

// Arrancar motor al cargar la página
window.onload = () => {
    cargarDatosActuacion();
    
    // Asignar el listener al botón de la sección debate
    const btnLikeAnalisis = document.getElementById('btn-like-analisis');
    if (btnLikeAnalisis) {
        btnLikeAnalisis.addEventListener('click', gestionarLike);
    }
};