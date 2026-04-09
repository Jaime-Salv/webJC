/* ============================================================
   MOTOR DEL CATÁLOGO MAESTRO (Corregido)
   ============================================================ */

let catalogoGlobal = []; 

document.addEventListener('DOMContentLoaded', () => {
    cargarCatalogoMaestro();

    // Listeners de los filtros sincronizados con el HTML
    document.getElementById('filtro-texto').addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-autor').addEventListener('change', aplicarFiltros);
    document.getElementById('filtro-estilo').addEventListener('change', aplicarFiltros);
    document.getElementById('filtro-ano-min').addEventListener('input', aplicarFiltros);
    document.getElementById('filtro-ano-max').addEventListener('input', aplicarFiltros);

    // Lógica de Cabecera Inteligente
    gestionarHeaderSmart();
});

async function cargarCatalogoMaestro() {
    try {
        const { data, error } = await clienteSupabase
            .from('catalogo_marchas')
            .select('*')
            .order('id_marcha', { ascending: true });

        if (error) throw error;

        catalogoGlobal = data;
        poblarSelectores(catalogoGlobal);
        renderizarTabla(catalogoGlobal);
        calcularKPIs(catalogoGlobal);

    } catch (error) {
        console.error("Error de conexión:", error);
        document.getElementById('tabla-catalogo-body').innerHTML = `<tr><td colspan="6" style="color:#ff3b3b; text-align:center;">Error: ${error.message}</td></tr>`;
    }
}

function poblarSelectores(datos) {
    const selectorAutor = document.getElementById('filtro-autor');
    const autoresUnicos = [...new Set(datos.map(m => m.autor).filter(a => a && a.trim() !== ''))].sort();

    selectorAutor.innerHTML = '<option value="TODOS">Todos los Compositores</option>';
    autoresUnicos.forEach(autor => {
        const option = document.createElement('option');
        option.value = autor;
        option.textContent = autor;
        selectorAutor.appendChild(option);
    });
}

function aplicarFiltros() {
    const textoBuscado = document.getElementById('filtro-texto').value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const autor = document.getElementById('filtro-autor').value;
    const estilo = document.getElementById('filtro-estilo').value;
    const minAno = parseInt(document.getElementById('filtro-ano-min').value) || 0;
    const maxAno = parseInt(document.getElementById('filtro-ano-max').value) || 9999;

    const resultados = catalogoGlobal.filter(marcha => {
        // Filtro de texto (Título)
        const tituloNorm = (marcha.titulo || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const matchTexto = tituloNorm.includes(textoBuscado);
        
        // Filtro de Autor
        const matchAutor = (autor === 'TODOS') || (marcha.autor === autor);
        
        // Filtro de Estilo (Cornetas)
        let matchEstilo = true;
        if (estilo === 'CORNETAS') matchEstilo = (marcha.cornetas === 1);
        if (estilo === 'SIN_CORNETAS') matchEstilo = (marcha.cornetas === 0 || marcha.cornetas === null);

        // Filtro de Año
        const year = parseInt(marcha.ano) || 0;
        const matchAno = (year === 0) || (year >= minAno && year <= maxAno);

        return matchTexto && matchAutor && matchEstilo && matchAno;
    });

    renderizarTabla(resultados);
    calcularKPIs(resultados);
}

function renderizarTabla(datosFiltrados) {
    const tbody = document.getElementById('tabla-catalogo-body');
    tbody.innerHTML = ''; 

    if (datosFiltrados.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding: 30px; color:#888;">0 resultados encontrados.</td></tr>`;
        return;
    }

    datosFiltrados.forEach(marcha => {
        const estiloCornetas = marcha.cornetas === 1 ? '<span style="color:var(--color-oro);">🎺 Con Cornetas</span>' : '<span style="color:#666;">Sin Cornetas</span>';
        const tiempoEst = marcha.duracion_seg ? `${Math.floor(marcha.duracion_seg / 60)}:${(marcha.duracion_seg % 60).toString().padStart(2, '0')}` : '--';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="color:#555;">#${marcha.id_marcha}</td>
            <td style="font-weight:bold; color:white;">${marcha.titulo}</td>
            <td style="color:#ccc;">${marcha.autor || '--'}</td>
            <td style="color:var(--color-oro);">${marcha.ano || '--'}</td>
            <td>${estiloCornetas}</td>
            <td style="color:#888;">${tiempoEst}</td>
        `;
        tbody.appendChild(tr);
    });
}

function calcularKPIs(datos) {
    document.getElementById('kpi-muestra').innerText = datos.length;
    
    if (datos.length === 0) {
        document.getElementById('kpi-cornetas').innerText = "0%";
        document.getElementById('kpi-duracion').innerText = "0:00";
        return;
    }

    const conCornetas = datos.filter(m => m.cornetas === 1).length;
    document.getElementById('kpi-cornetas').innerText = Math.round((conCornetas / datos.length) * 100) + "%";

    const duraciones = datos.filter(m => m.duracion_seg > 0);
    if (duraciones.length > 0) {
        const suma = duraciones.reduce((acc, m) => acc + m.duracion_seg, 0);
        const media = Math.round(suma / duraciones.length);
        document.getElementById('kpi-duracion').innerText = `${Math.floor(media / 60)}:${(media % 60).toString().padStart(2, '0')}`;
    } else {
        document.getElementById('kpi-duracion').innerText = "--";
    }
}

function gestionarHeaderSmart() {
    let ultimoScroll = window.scrollY;
    const cabecera = document.querySelector('.main-header-pro');

    window.addEventListener('scroll', () => {
        if (!cabecera) return;
        let scrollActual = window.scrollY;

        if (scrollActual <= 0) {
            cabecera.style.transform = "translateY(0)";
            return;
        }

        if (scrollActual > ultimoScroll && scrollActual > 100) {
            cabecera.style.transform = "translateY(-100%)";
        } else if (scrollActual < ultimoScroll) {
            cabecera.style.transform = "translateY(0)";
        }
        ultimoScroll = scrollActual;
    });
}