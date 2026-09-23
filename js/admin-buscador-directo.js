/* Entrada única del directo; conserva los campos internos usados por la cola offline. */
(() => {
    'use strict';
    const normalizar = (texto) => String(texto || '').normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();

    function mapaAnual() {
        try {
            const cache = JSON.parse(localStorage.getItem('jc_repertorio_activo_cache_v1') || 'null');
            return Array.isArray(cache?.marchas) ? cache.marchas : [];
        } catch (_) { return []; }
    }

    function seleccionar(marcha) {
        const buscador = document.getElementById('inp-buscar-marcha');
        if (!buscador) return;
        buscador.value = marcha.titulo;
        buscador.dataset.numero = marcha.numero ? String(marcha.numero) : '';
        document.getElementById('sugerencias-marchas').hidden = true;
        buscador.setAttribute('aria-expanded', 'false');
        sincronizar();
        buscador.focus();
    }

    function sincronizar() {
        const buscador = document.getElementById('inp-buscar-marcha');
        const numero = document.getElementById('inp-id-marcha');
        const titulo = document.getElementById('inp-titulo-marcha');
        if (!buscador || !numero || !titulo) return;
        const valor = buscador.value.trim();
        const mapa = mapaAnual();
        const porNumero = /^\d+$/.test(valor)
            ? mapa.find((m) => Number(m.numero_repertorio) === Number(valor)) : null;
        const exacta = mapa.find((m) => normalizar(m.catalogo_marchas?.titulo) === normalizar(valor));
        const seleccion = buscador.dataset.numero
            ? mapa.find((m) => Number(m.numero_repertorio) === Number(buscador.dataset.numero)) : null;
        const marcha = seleccion || porNumero || exacta;
        numero.value = marcha ? String(marcha.numero_repertorio) : /^\d+$/.test(valor) ? valor : '';
        titulo.readOnly = false;
        titulo.value = marcha?.catalogo_marchas?.titulo || (/^\d+$/.test(valor) ? '' : valor);
        if (numero.value) numero.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function sugerir() {
        const buscador = document.getElementById('inp-buscar-marcha');
        const lista = document.getElementById('sugerencias-marchas');
        if (!buscador || !lista) return;
        const valor = normalizar(buscador.value);
        lista.replaceChildren();
        if (!valor) { lista.hidden = true; buscador.setAttribute('aria-expanded', 'false'); return; }
        const coincidencias = mapaAnual().filter((m) =>
            String(m.numero_repertorio).startsWith(valor) || normalizar(m.catalogo_marchas?.titulo).includes(valor)
        ).slice(0, 7);
        const incluidos = new Set(coincidencias.map((m) => normalizar(m.catalogo_marchas?.titulo)));
        const fuera = /^\d+$/.test(valor) ? [] : (typeof catalogoCache === 'undefined' ? [] : catalogoCache).filter((m) =>
            normalizar(m.titulo).includes(valor) && !incluidos.has(normalizar(m.titulo))
        ).slice(0, Math.max(0, 7 - coincidencias.length));
        [...coincidencias.map((m) => ({ numero: m.numero_repertorio, titulo: m.catalogo_marchas?.titulo || `Marcha #${m.id_marcha}` })),
            ...fuera.map((m) => ({ titulo: m.titulo }))].forEach((m) => {
            const opcion = document.createElement('button');
            opcion.type = 'button';
            opcion.setAttribute('role', 'option');
            opcion.textContent = `${m.numero ? String(m.numero).padStart(3, '0') + ' · ' : ''}${m.titulo}`;
            opcion.addEventListener('click', () => seleccionar(m));
            lista.appendChild(opcion);
        });
        lista.hidden = !lista.childElementCount;
        buscador.setAttribute('aria-expanded', String(!lista.hidden));
    }

    window.sincronizarEntradaDirecto = sincronizar;
    window.reflejarMarchaDirecto = (titulo, numero = '') => {
        const buscador = document.getElementById('inp-buscar-marcha');
        if (!buscador) return;
        buscador.value = titulo || '';
        buscador.dataset.numero = numero ? String(numero) : '';
        document.getElementById('sugerencias-marchas').hidden = true;
    };
    window.limpiarEntradaDirecto = () => window.reflejarMarchaDirecto('', '');

    document.addEventListener('admin:ready', () => {
        const buscador = document.getElementById('inp-buscar-marcha');
        if (!buscador) return;
        buscador.addEventListener('input', () => { buscador.dataset.numero = ''; sincronizar(); sugerir(); });
        buscador.addEventListener('focus', sugerir);
        buscador.addEventListener('keydown', (evento) => {
            const lista = document.getElementById('sugerencias-marchas');
            if (evento.key === 'Escape') { lista.hidden = true; buscador.setAttribute('aria-expanded', 'false'); }
            if (evento.key === 'ArrowDown' && !lista.hidden) {
                evento.preventDefault();
                lista.querySelector('button')?.focus();
            }
            if (evento.key === 'Enter') {
                evento.preventDefault();
                if (!lista.hidden && lista.querySelector('button')) { lista.querySelector('button').click(); return; }
                sincronizar();
                if (!document.getElementById('btn-inyectar-marcha')?.disabled) window.inyectarMarcha();
            }
        });
        document.getElementById('sugerencias-marchas').addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape') { evento.preventDefault(); buscador.focus(); document.getElementById('sugerencias-marchas').hidden = true; }
        });
        document.addEventListener('click', (evento) => {
            if (!evento.target.closest('.directo-busqueda')) {
                document.getElementById('sugerencias-marchas').hidden = true;
                buscador.setAttribute('aria-expanded', 'false');
            }
        });
    }, { once: true });
})();
