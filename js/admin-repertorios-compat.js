/* ============================================================
   COMPATIBILIDAD DEL DIRECTO CON REPERTORIOS ANUALES
   - Conserva la cola offline existente.
   - Traduce atajos recientes a números anuales.
   - Completa numero_repertorio al recuperar registros pendientes.
   ============================================================ */

(() => {
    'use strict';

    const CLAVE_MAPA = 'jc_repertorio_activo_cache_v1';
    const CLAVE_DIRECTO = 'jc_directo_activo_id';
    const CLAVE_PENDIENTES = 'jc_marchas_directo_pendientes';

    const normalizar = (texto) => String(texto || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es');

    const numeroVisible = (numero) => String(Number(numero) || 0).padStart(3, '0');

    document.addEventListener('admin:ready', inicializarCompatibilidad, { once: true });

    async function inicializarCompatibilidad() {
        if (typeof clienteSupabase === 'undefined') return;

        await refrescarCache().catch((error) => {
            console.warn('No se ha podido refrescar la caché del repertorio:', error);
        });

        protegerEntradaOffline();
        corregirAtajosRecientes();
        envolverInicioDirecto();
        envolverInyeccionOffline();

        if (navigator.onLine) {
            setTimeout(completarNumerosPendientes, 1200);
        }

        window.addEventListener('online', () => {
            refrescarCache()
                .then(() => setTimeout(completarNumerosPendientes, 1000))
                .catch((error) => console.warn('No se pudo refrescar la caché al recuperar conexión:', error));
        });
    }

    async function refrescarCache() {
        const { data: activo, error: errorActivo } = await clienteSupabase
            .from('repertorios_temporada')
            .select('id_repertorio,temporada')
            .eq('estado', 'Activo')
            .maybeSingle();

        if (errorActivo) throw errorActivo;

        if (activo) {
            const { data: mapa, error: errorMapa } = await clienteSupabase
                .from('repertorio_temporada_marchas')
                .select('id_marcha,numero_repertorio,catalogo_marchas(titulo,autor)')
                .eq('id_repertorio', activo.id_repertorio)
                .order('numero_repertorio', { ascending: true });

            if (errorMapa) throw errorMapa;
            localStorage.setItem(CLAVE_MAPA, JSON.stringify({
                idRepertorio: activo.id_repertorio,
                temporada: activo.temporada,
                marchas: mapa || [],
                actualizadoEn: new Date().toISOString()
            }));
        }

        const { data: directo, error: errorDirecto } = await clienteSupabase
            .from('maestro_procesiones')
            .select('id_procesion,id_repertorio')
            .eq('estado', 'Activa')
            .maybeSingle();

        if (errorDirecto) throw errorDirecto;
        if (directo) {
            localStorage.setItem(CLAVE_DIRECTO, JSON.stringify(directo));
        } else {
            localStorage.removeItem(CLAVE_DIRECTO);
        }
    }

    function leerMapa() {
        try {
            const cache = JSON.parse(localStorage.getItem(CLAVE_MAPA) || 'null');
            return cache && Array.isArray(cache.marchas) ? cache : null;
        } catch (_) {
            return null;
        }
    }

    function leerDirecto() {
        try {
            return JSON.parse(localStorage.getItem(CLAVE_DIRECTO) || 'null');
        } catch (_) {
            return null;
        }
    }

    function protegerEntradaOffline() {
        const inputNumero = document.getElementById('inp-id-marcha');
        const inputTitulo = document.getElementById('inp-titulo-marcha');
        if (!inputNumero || !inputTitulo) return;

        inputNumero.addEventListener('input', () => {
            if (navigator.onLine) return;
            const numero = Number(inputNumero.value);
            const cache = leerMapa();
            const relacion = cache?.marchas?.find((item) => Number(item.numero_repertorio) === numero);

            inputTitulo.readOnly = true;
            if (relacion) {
                inputTitulo.value = relacion.catalogo_marchas?.titulo || `ID maestro ${relacion.id_marcha}`;
                inputTitulo.style.color = '#27ae60';
                inputTitulo.placeholder = 'Título de la marcha';
            } else if (inputNumero.value) {
                inputTitulo.value = '';
                inputTitulo.style.color = '#ff3b3b';
                inputTitulo.placeholder = `El nº ${numeroVisible(numero)} no está en la caché del repertorio`;
            } else {
                inputTitulo.value = '';
                inputTitulo.style.color = 'var(--color-oro)';
                inputTitulo.placeholder = 'Título de la marcha';
            }
        }, true);
    }

    function corregirAtajosRecientes() {
        const contenedor = document.getElementById('accesos-marchas-recientes');
        if (!contenedor) return;

        contenedor.addEventListener('click', (evento) => {
            const boton = evento.target.closest('.marcha-reciente-btn');
            if (!boton) return;

            const cache = leerMapa();
            const relacion = cache?.marchas?.find((item) =>
                normalizar(item.catalogo_marchas?.titulo) === normalizar(boton.textContent)
            );

            if (!relacion) return;

            evento.preventDefault();
            evento.stopImmediatePropagation();

            const inputNumero = document.getElementById('inp-id-marcha');
            const inputTitulo = document.getElementById('inp-titulo-marcha');
            if (inputNumero) {
                inputNumero.value = relacion.numero_repertorio;
                inputNumero.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (inputTitulo) {
                inputTitulo.value = relacion.catalogo_marchas?.titulo || '';
                inputTitulo.style.color = '#27ae60';
            }
            document.getElementById('inp-fase-marcha')?.focus();
        }, true);
    }

    function envolverInicioDirecto() {
        const iniciarActual = window.iniciarNuevaProcesion;
        if (typeof iniciarActual !== 'function') return;

        window.iniciarNuevaProcesion = async function(...args) {
            const resultado = await iniciarActual.apply(this, args);
            if (navigator.onLine) {
                await refrescarCache().catch((error) => console.warn('No se pudo guardar el contexto del directo:', error));
            }
            return resultado;
        };
    }

    function envolverInyeccionOffline() {
        const inyectarOnline = window.inyectarMarcha;
        if (typeof inyectarOnline !== 'function') return;

        window.inyectarMarcha = async function(...args) {
            if (navigator.onLine) {
                return inyectarOnline.apply(this, args);
            }

            const numero = Number(document.getElementById('inp-id-marcha')?.value);
            const fase = document.getElementById('inp-fase-marcha')?.value;
            const cache = leerMapa();
            const directo = leerDirecto();

            if (!Number.isInteger(numero) || numero <= 0) {
                alert('Introduce el número de la marcha en el repertorio activo.');
                return;
            }

            const relacion = cache?.marchas?.find((item) => Number(item.numero_repertorio) === numero);
            if (!relacion) {
                alert(`El número ${numeroVisible(numero)} no está disponible en la copia offline del repertorio.`);
                return;
            }

            if (!directo?.id_procesion) {
                alert('No hay un directo activo guardado en este dispositivo. Necesitas conexión para iniciar una actuación.');
                return;
            }

            const pendientes = leerPendientes();
            pendientes.push({
                idProcesion: directo.id_procesion,
                idIntroducido: Number(relacion.id_marcha),
                titulo: relacion.catalogo_marchas?.titulo || '',
                fase,
                numeroRepertorio: numero,
                idLocal: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
                creadaEn: new Date().toISOString()
            });
            localStorage.setItem(CLAVE_PENDIENTES, JSON.stringify(pendientes));

            const inputNumero = document.getElementById('inp-id-marcha');
            const inputTitulo = document.getElementById('inp-titulo-marcha');
            if (inputNumero) inputNumero.value = '';
            if (inputTitulo) {
                inputTitulo.value = '';
                inputTitulo.placeholder = 'Título de la marcha';
                inputTitulo.style.color = 'var(--color-oro)';
            }

            const estado = document.getElementById('estado-inyeccion');
            if (estado) {
                estado.textContent = `Sin conexión: ${numeroVisible(numero)} · ${relacion.catalogo_marchas?.titulo || ''} queda pendiente de sincronizar.`;
                estado.className = 'estado-inyeccion pendiente';
            }

            const indicador = document.getElementById('marchas-pendientes');
            if (indicador) {
                const total = pendientes.filter((item) => String(item.idProcesion) === String(directo.id_procesion)).length;
                indicador.hidden = false;
                indicador.textContent = total === 1 ? '1 marcha pendiente de sincronizar' : `${total} marchas pendientes de sincronizar`;
            }
        };
    }

    function leerPendientes() {
        try {
            const datos = JSON.parse(localStorage.getItem(CLAVE_PENDIENTES) || '[]');
            return Array.isArray(datos) ? datos : [];
        } catch (_) {
            return [];
        }
    }

    async function completarNumerosPendientes() {
        const directo = leerDirecto();
        const cache = leerMapa();
        if (!directo?.id_procesion || !cache?.marchas?.length) return;

        const { data, error } = await clienteSupabase
            .from('repertorio_transaccional')
            .select('id_registro,id_marcha,numero_repertorio')
            .eq('id_procesion', directo.id_procesion)
            .is('numero_repertorio', null);

        if (error || !data?.length) return;

        for (const registro of data) {
            const relacion = cache.marchas.find((item) => Number(item.id_marcha) === Number(registro.id_marcha));
            if (!relacion) continue;
            await clienteSupabase
                .from('repertorio_transaccional')
                .update({ numero_repertorio: Number(relacion.numero_repertorio) })
                .eq('id_registro', registro.id_registro);
        }
    }
})();
