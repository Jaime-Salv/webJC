/* ============================================================
   REPERTORIOS ANUALES - NUMERACIÓN INDEPENDIENTE DEL CATÁLOGO
   ============================================================ */

(() => {
    'use strict';

    let repertorios = [];
    let repertorioActivo = null;
    let repertorioSeleccionado = null;
    let marchasTemporada = [];
    let catalogoRepertorio = [];
    let ordenEdicionDirecto = null;
    let guardandoOrden = false;
    let mapaActivoCache = null;
    let mapaActivoId = null;

    const normalizar = (texto) => String(texto || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLocaleLowerCase('es');

    const escapar = (texto) => String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const numeroVisible = (numero) => String(Number(numero) || 0).padStart(3, '0');

    document.addEventListener('admin:ready', inicializarModuloRepertorios, { once: true });

    async function inicializarModuloRepertorios() {
        if (!document.querySelector('.admin-shell') || typeof clienteSupabase === 'undefined') return;

        inyectarVistaRepertorios();
        capturarComportamientoDirecto();

        try {
            await Promise.all([
                cargarCatalogoRepertorio(),
                cargarRepertorios()
            ]);
            await cargarRepertorioActivo();
            await seleccionarRepertorioInicial();
            actualizarIndicadorDirecto();
        } catch (error) {
            console.error('Error inicializando repertorios anuales:', error);
            estadoRepertorio('No se ha podido cargar la gestión de repertorios: ' + error.message, true);
        }
    }

    function inyectarVistaRepertorios() {
        const nav = document.querySelector('.admin-nav');
        const content = document.querySelector('.admin-content');
        if (!nav || !content || document.querySelector('[data-admin-target="repertorios"]')) return;

        const botonNav = document.createElement('button');
        botonNav.type = 'button';
        botonNav.className = 'admin-nav-button';
        botonNav.dataset.adminTarget = 'repertorios';
        botonNav.innerHTML = '<span class="admin-nav-icon">≡</span>Repertorio';
        const botonCatalogo = nav.querySelector('[data-admin-target="catalogo"]');
        nav.insertBefore(botonNav, botonCatalogo || null);

        botonNav.addEventListener('click', () => {
            if (typeof window.mostrarVistaAdmin === 'function') {
                window.mostrarVistaAdmin('repertorios');
            } else {
                document.querySelectorAll('[data-admin-view]').forEach((vista) => vista.classList.remove('activa'));
                document.querySelector('[data-admin-view="repertorios"]')?.classList.add('activa');
            }
            cargarRepertorios().then(seleccionarRepertorioInicial);
        });

        const vista = document.createElement('section');
        vista.className = 'admin-view';
        vista.dataset.adminView = 'repertorios';
        vista.innerHTML = `
            <div class="admin-view-header">
                <div>
                    <span>Temporadas y numeración</span>
                    <h1>Repertorio</h1>
                </div>
                <p>Gestiona qué marchas forman parte de cada temporada sin modificar el catálogo maestro ni el histórico.</p>
            </div>

            <div class="admin-module-grid">
                <div class="card-admin">
                    <h3>Temporadas</h3>
                    <label style="font-size:.65rem;color:#888;text-transform:uppercase;display:block;margin-bottom:6px;">Repertorio</label>
                    <select id="rep-select-temporada" class="input-admin"></select>

                    <div id="rep-resumen" style="padding:14px;border:1px solid #292929;border-radius:8px;background:#0b0b0b;margin-bottom:16px;color:#aaa;font-size:.78rem;line-height:1.6;"></div>

                    <label style="font-size:.65rem;color:#888;text-transform:uppercase;display:block;margin-bottom:6px;">Nueva temporada</label>
                    <input id="rep-nueva-temporada" type="number" min="2000" max="2100" class="input-admin" placeholder="2027">
                    <button id="rep-crear-copia" type="button" class="btn-send" style="margin-bottom:10px;">Crear copiando la activa</button>
                    <button id="rep-crear-vacio" type="button" class="btn-secundario">Crear repertorio vacío</button>

                    <hr style="border:0;border-top:1px solid #252525;margin:22px 0;">

                    <button id="rep-ordenar" type="button" class="btn-secundario">Ordenar A-Z y renumerar</button>
                    <button id="rep-activar" type="button" class="btn-send">Publicar y activar temporada</button>

                    <div id="rep-estado" class="estado-inyeccion" style="margin-top:15px;">Selecciona una temporada.</div>
                </div>

                <div class="card-admin">
                    <h3>Marchas de la temporada</h3>
                    <div id="rep-solo-borrador" style="margin-bottom:14px;color:#888;font-size:.72rem;line-height:1.5;"></div>

                    <div id="rep-form-anadir" style="padding:14px;border:1px solid rgba(212,175,55,.2);border-radius:8px;background:rgba(212,175,55,.04);margin-bottom:18px;">
                        <label style="font-size:.65rem;color:#888;text-transform:uppercase;display:block;margin-bottom:6px;">Añadir desde catálogo</label>
                        <input id="rep-buscar-catalogo" class="input-admin" list="rep-catalogo-list" placeholder="Busca por título">
                        <datalist id="rep-catalogo-list"></datalist>
                        <button id="rep-anadir-existente" type="button" class="btn-send" style="margin-bottom:14px;">Añadir marcha existente</button>

                        <details>
                            <summary style="cursor:pointer;color:#d4af37;font-size:.72rem;font-weight:800;">La marcha no existe en el catálogo</summary>
                            <div style="padding-top:14px;">
                                <input id="rep-nueva-marcha-titulo" class="input-admin" placeholder="Título de la nueva marcha">
                                <input id="rep-nueva-marcha-autor" class="input-admin" placeholder="Autor (opcional)">
                                <button id="rep-crear-marcha" type="button" class="btn-secundario">Crear en catálogo y añadir</button>
                            </div>
                        </details>
                    </div>

                    <p id="rep-ayuda" class="rep-ayuda">Usa las flechas para mover una posición o escribe el número de destino para ir directamente.</p>
                    <div class="rep-busqueda">
                        <label for="rep-filtrar">Buscar en esta temporada
                            <input id="rep-filtrar" class="input-admin" type="search" placeholder="Título, autor o número" autocomplete="off">
                        </label>
                        <label for="rep-ir-numero">Ir al nº
                            <input id="rep-ir-numero" class="input-admin" type="number" min="1" inputmode="numeric" placeholder="Nº">
                        </label>
                        <button id="rep-ir-boton" type="button" class="btn-secundario">Ir</button>
                    </div>
                    <p id="rep-coincidencias" class="rep-ayuda" role="status"></p>
                    <ol id="rep-lista-marchas" class="rep-lista-marchas" aria-label="Marchas de la temporada"></ol>
                </div>
            </div>
        `;
        content.appendChild(vista);

        document.getElementById('rep-select-temporada')?.addEventListener('change', async (evento) => {
            repertorioSeleccionado = repertorios.find((r) => r.id_repertorio === evento.target.value) || null;
            await cargarMarchasTemporada();
            renderizarGestion();
        });
        document.getElementById('rep-crear-copia')?.addEventListener('click', () => crearTemporada(true));
        document.getElementById('rep-crear-vacio')?.addEventListener('click', () => crearTemporada(false));
        document.getElementById('rep-ordenar')?.addEventListener('click', ordenarTemporada);
        document.getElementById('rep-activar')?.addEventListener('click', activarTemporada);
        document.getElementById('rep-anadir-existente')?.addEventListener('click', anadirMarchaExistente);
        document.getElementById('rep-crear-marcha')?.addEventListener('click', crearMarchaYAnadir);
        document.getElementById('rep-filtrar')?.addEventListener('input', filtrarListaMarchas);
        document.getElementById('rep-ir-boton')?.addEventListener('click', irANumero);
        document.getElementById('rep-ir-numero')?.addEventListener('keydown', (evento) => {
            if (evento.key === 'Enter') { evento.preventDefault(); irANumero(); }
        });
        document.getElementById('rep-lista-marchas')?.addEventListener('click', (evento) => {
            const boton = evento.target.closest('button');
            if (!boton || guardandoOrden) return;
            const fila = boton.closest('[data-rep-id]');
            if (!fila) return;
            const idMarcha = Number(fila.dataset.repId);
            if (boton.matches('[data-rep-retirar]')) retirarMarcha(idMarcha);
            if (boton.matches('[data-rep-subir]')) moverMarcha(idMarcha, -1);
            if (boton.matches('[data-rep-bajar]')) moverMarcha(idMarcha, 1);
            if (boton.matches('[data-rep-ir]')) {
                const destino = Number(fila.querySelector('[data-rep-destino]')?.value);
                moverMarcha(idMarcha, destino - 1, true);
            }
        });
        document.getElementById('rep-lista-marchas')?.addEventListener('keydown', (evento) => {
            if (evento.key !== 'Enter' || !evento.target.matches('[data-rep-destino]')) return;
            evento.preventDefault();
            evento.target.closest('[data-rep-id]')?.querySelector('[data-rep-ir]')?.click();
        });
    }

    async function cargarCatalogoRepertorio() {
        const { data, error } = await clienteSupabase
            .from('catalogo_marchas')
            .select('id_marcha,titulo,autor')
            .order('titulo', { ascending: true });
        if (error) throw error;
        catalogoRepertorio = data || [];
        const datalist = document.getElementById('rep-catalogo-list');
        if (datalist) {
            datalist.innerHTML = catalogoRepertorio.map((m) =>
                `<option value="${escapar(m.titulo)}">${escapar(m.autor || '')}</option>`
            ).join('');
        }
    }

    async function cargarRepertorios() {
        const { data, error } = await clienteSupabase
            .from('repertorios_temporada')
            .select('*')
            .order('temporada', { ascending: false });
        if (error) throw error;
        repertorios = data || [];
        repertorioActivo = repertorios.find((r) => r.estado === 'Activo') || null;

        const select = document.getElementById('rep-select-temporada');
        if (select) {
            const seleccionado = repertorioSeleccionado?.id_repertorio;
            select.innerHTML = repertorios.map((r) =>
                `<option value="${r.id_repertorio}">${r.temporada} · ${r.estado}${r.estado === 'Activo' ? ' ✓' : ''}</option>`
            ).join('');
            if (seleccionado && repertorios.some((r) => r.id_repertorio === seleccionado)) select.value = seleccionado;
        }
    }

    async function cargarRepertorioActivo() {
        const { data, error } = await clienteSupabase
            .from('repertorios_temporada')
            .select('*')
            .eq('estado', 'Activo')
            .maybeSingle();
        if (error) throw error;
        repertorioActivo = data || null;
    }

    async function seleccionarRepertorioInicial() {
        if (!repertorios.length) return;
        if (!repertorioSeleccionado) repertorioSeleccionado = repertorioActivo || repertorios[0];
        const select = document.getElementById('rep-select-temporada');
        if (select && repertorioSeleccionado) select.value = repertorioSeleccionado.id_repertorio;
        await cargarMarchasTemporada();
        renderizarGestion();
    }

    async function cargarMarchasTemporada() {
        if (!repertorioSeleccionado) {
            marchasTemporada = [];
            return;
        }
        const { data, error } = await clienteSupabase
            .from('repertorio_temporada_marchas')
            .select('id_repertorio,id_marcha,numero_repertorio,catalogo_marchas(titulo,autor)')
            .eq('id_repertorio', repertorioSeleccionado.id_repertorio)
            .order('numero_repertorio', { ascending: true });
        if (error) throw error;
        marchasTemporada = data || [];
    }

    function renderizarGestion() {
        const resumen = document.getElementById('rep-resumen');
        const aviso = document.getElementById('rep-solo-borrador');
        const lista = document.getElementById('rep-lista-marchas');
        const form = document.getElementById('rep-form-anadir');
        const ordenar = document.getElementById('rep-ordenar');
        const activar = document.getElementById('rep-activar');
        if (!repertorioSeleccionado) return;

        const editable = repertorioSeleccionado.estado === 'Borrador';
        if (resumen) resumen.innerHTML = `
            <strong style="color:white;">${repertorioSeleccionado.nombre}</strong><br>
            Estado: <strong style="color:${repertorioSeleccionado.estado === 'Activo' ? '#67db91' : '#d4af37'};">${repertorioSeleccionado.estado}</strong><br>
            Marchas: <strong style="color:white;">${marchasTemporada.length}</strong><br>
            ${repertorioSeleccionado.estado === 'Activo' ? 'Este es el repertorio utilizado para buscar por número durante los directos.' : 'Los cambios aquí no afectan al catálogo maestro ni a actuaciones anteriores.'}
        `;
        if (aviso) aviso.textContent = editable
            ? 'Puedes añadir, retirar y mover marchas. La numeración se guarda al moverlas. “Ordenar A-Z” sustituye el orden manual.'
            : 'Esta temporada está protegida. Para hacer cambios crea una nueva temporada en borrador.';
        if (form) form.style.display = editable ? 'block' : 'none';
        const ayuda = document.getElementById('rep-ayuda');
        if (ayuda) ayuda.hidden = !editable;
        if (ordenar) ordenar.disabled = !editable || marchasTemporada.length === 0;
        if (activar) activar.disabled = repertorioSeleccionado.estado === 'Activo' || marchasTemporada.length === 0;

        if (lista) {
            lista.innerHTML = marchasTemporada.map((item, indice) => {
                const marcha = item.catalogo_marchas || {};
                return `
                    <li class="rep-marcha-item" data-rep-id="${item.id_marcha}" data-rep-numero="${item.numero_repertorio}" tabindex="-1">
                        <span class="rep-marcha-numero" aria-label="Número anual ${item.numero_repertorio}">${numeroVisible(item.numero_repertorio)}</span>
                        <div class="rep-marcha-detalle">
                            <strong>${escapar(marcha.titulo || 'Marcha sin título')}</strong>
                            <span>${escapar(marcha.autor || 'Autor desconocido')} · ID #${item.id_marcha}</span>
                        </div>
                        ${editable ? `<div class="rep-marcha-acciones" aria-label="Cambiar orden de ${escapar(marcha.titulo || 'Marcha')}">
                            <button type="button" class="rep-mover" data-rep-subir aria-label="Subir ${escapar(marcha.titulo || 'Marcha')}" title="Subir" ${indice === 0 ? 'disabled' : ''}>↑</button>
                            <button type="button" class="rep-mover" data-rep-bajar aria-label="Bajar ${escapar(marcha.titulo || 'Marcha')}" title="Bajar" ${indice === marchasTemporada.length - 1 ? 'disabled' : ''}>↓</button>
                            <label class="rep-ir-label">Nº <input data-rep-destino type="number" inputmode="numeric" min="1" max="${marchasTemporada.length}" aria-label="Nuevo número para ${escapar(marcha.titulo || 'Marcha')}" placeholder="${indice + 1}"></label>
                            <button type="button" class="rep-mover rep-ir" data-rep-ir aria-label="Mover ${escapar(marcha.titulo || 'Marcha')} al número indicado">Ir</button>
                            <button type="button" class="btn-mini-danger rep-retirar" data-rep-retirar aria-label="Retirar ${escapar(marcha.titulo || 'Marcha')}">Retirar</button>
                        </div>` : ''}
                    </li>
                `;
            }).join('');
            filtrarListaMarchas();
        }
    }

    function filtrarListaMarchas() {
        const lista = document.getElementById('rep-lista-marchas');
        const texto = normalizar(document.getElementById('rep-filtrar')?.value);
        if (!lista) return;
        let visibles = 0;
        lista.querySelectorAll('.rep-marcha-item').forEach((fila) => {
            fila.hidden = Boolean(texto && !normalizar(fila.textContent).includes(texto));
            if (!fila.hidden) visibles += 1;
        });
        const resultado = document.getElementById('rep-coincidencias');
        if (resultado) resultado.textContent = texto ? `${visibles} de ${marchasTemporada.length} marchas` : `${marchasTemporada.length} marchas`;
    }

    function irANumero() {
        const numero = Number(document.getElementById('rep-ir-numero')?.value);
        const fila = Number.isInteger(numero) && numero > 0
            ? document.querySelector(`#rep-lista-marchas [data-rep-numero="${numero}"]`) : null;
        if (!fila) { estadoRepertorio('No existe ese número en esta temporada.', true); return; }
        const filtro = document.getElementById('rep-filtrar');
        if (filtro) filtro.value = '';
        filtrarListaMarchas();
        fila.scrollIntoView({ behavior: 'smooth', block: 'center' });
        fila.focus({ preventScroll: true });
    }

    async function moverMarcha(idMarcha, posicion, posicionAbsoluta = false) {
        if (!asegurarBorrador() || guardandoOrden) return;
        const origen = marchasTemporada.findIndex((m) => Number(m.id_marcha) === idMarcha);
        const destino = posicionAbsoluta ? posicion : origen + posicion;
        if (origen < 0 || !Number.isInteger(destino) || destino < 0 || destino >= marchasTemporada.length) {
            estadoRepertorio(`Introduce un número entre 1 y ${marchasTemporada.length}.`, true);
            return;
        }
        if (origen === destino) return;
        const orden = [...marchasTemporada];
        orden.splice(destino, 0, ...orden.splice(origen, 1));
        guardandoOrden = true;
        document.querySelectorAll('#rep-lista-marchas button, #rep-lista-marchas input').forEach((control) => { control.disabled = true; });
        document.querySelectorAll('#rep-select-temporada, #rep-ordenar, #rep-activar, #rep-anadir-existente, #rep-crear-marcha').forEach((control) => { control.disabled = true; });
        estadoRepertorio('Guardando el nuevo orden...');
        try {
            const { error } = await clienteSupabase.rpc('reordenar_repertorio_personalizado', {
                p_id_repertorio: repertorioSeleccionado.id_repertorio,
                p_ids_marchas: orden.map((m) => Number(m.id_marcha))
            });
            if (error) throw error;
            await cargarMarchasTemporada();
            estadoRepertorio(`Marcha movida al número ${destino + 1}. Orden guardado.`);
        } catch (error) {
            estadoRepertorio('No se pudo guardar el orden: ' + error.message, true);
            try { await cargarMarchasTemporada(); } catch (recargaError) { console.error(recargaError); }
        } finally {
            guardandoOrden = false;
            renderizarGestion();
            document.querySelectorAll('#rep-select-temporada, #rep-anadir-existente, #rep-crear-marcha').forEach((control) => { control.disabled = false; });
        }
    }

    async function crearTemporada(copiarActiva) {
        const temporada = Number(document.getElementById('rep-nueva-temporada')?.value);
        if (!Number.isInteger(temporada) || temporada < 2000 || temporada > 2100) {
            estadoRepertorio('Introduce un año de temporada válido.', true);
            return;
        }
        if (repertorios.some((r) => Number(r.temporada) === temporada)) {
            estadoRepertorio(`Ya existe el repertorio ${temporada}.`, true);
            return;
        }
        estadoRepertorio('Creando temporada...');
        const { data, error } = await clienteSupabase.rpc('crear_repertorio_temporada', {
            p_temporada: temporada,
            p_copiar_desde: copiarActiva ? repertorioActivo?.id_repertorio || null : null
        });
        if (error) {
            estadoRepertorio(error.message, true);
            return;
        }
        await cargarRepertorios();
        repertorioSeleccionado = repertorios.find((r) => r.id_repertorio === data) || repertorios.find((r) => Number(r.temporada) === temporada);
        await cargarMarchasTemporada();
        renderizarGestion();
        const select = document.getElementById('rep-select-temporada');
        if (select && repertorioSeleccionado) select.value = repertorioSeleccionado.id_repertorio;
        estadoRepertorio(`Repertorio ${temporada} creado en borrador.`);
    }

    async function anadirMarchaExistente() {
        if (!asegurarBorrador()) return;
        const titulo = document.getElementById('rep-buscar-catalogo')?.value?.trim();
        const marcha = catalogoRepertorio.find((m) => normalizar(m.titulo) === normalizar(titulo));
        if (!marcha) {
            estadoRepertorio('Selecciona una marcha existente del catálogo.', true);
            return;
        }
        if (marchasTemporada.some((m) => Number(m.id_marcha) === Number(marcha.id_marcha))) {
            estadoRepertorio('Esa marcha ya forma parte de la temporada.', true);
            return;
        }
        await insertarEnTemporada(marcha.id_marcha);
        document.getElementById('rep-buscar-catalogo').value = '';
    }

    async function crearMarchaYAnadir() {
        if (!asegurarBorrador()) return;
        const titulo = document.getElementById('rep-nueva-marcha-titulo')?.value?.trim();
        const autor = document.getElementById('rep-nueva-marcha-autor')?.value?.trim();
        if (!titulo) {
            estadoRepertorio('Escribe el título de la nueva marcha.', true);
            return;
        }
        const existente = catalogoRepertorio.find((m) => normalizar(m.titulo) === normalizar(titulo));
        if (existente) {
            estadoRepertorio('Esa marcha ya existe en el catálogo. Añádela desde el buscador superior.', true);
            return;
        }
        const payload = { titulo };
        if (autor) payload.autor = autor;
        const { data, error } = await clienteSupabase
            .from('catalogo_marchas')
            .insert([payload])
            .select('id_marcha,titulo,autor')
            .single();
        if (error) {
            estadoRepertorio('No se ha podido crear la marcha: ' + error.message, true);
            return;
        }
        catalogoRepertorio.push(data);
        catalogoRepertorio.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'));
        await insertarEnTemporada(data.id_marcha);
        document.getElementById('rep-nueva-marcha-titulo').value = '';
        document.getElementById('rep-nueva-marcha-autor').value = '';
        await cargarCatalogoRepertorio();
        if (typeof window.cargarCatalogoEnMemoria === 'function') await window.cargarCatalogoEnMemoria();
    }

    async function insertarEnTemporada(idMarcha) {
        const siguiente = marchasTemporada.length
            ? Math.max(...marchasTemporada.map((m) => Number(m.numero_repertorio) || 0)) + 1
            : 1;
        const { error } = await clienteSupabase
            .from('repertorio_temporada_marchas')
            .insert([{
                id_repertorio: repertorioSeleccionado.id_repertorio,
                id_marcha: Number(idMarcha),
                numero_repertorio: siguiente
            }]);
        if (error) {
            estadoRepertorio(error.message, true);
            return;
        }
        await cargarMarchasTemporada();
        renderizarGestion();
        estadoRepertorio('Marcha añadida al final. Puedes moverla al número deseado o pulsar “Ordenar A-Z”.');
    }

    async function retirarMarcha(idMarcha) {
        if (!asegurarBorrador()) return;
        const item = marchasTemporada.find((m) => Number(m.id_marcha) === Number(idMarcha));
        const titulo = item?.catalogo_marchas?.titulo || `ID maestro ${idMarcha}`;
        if (!confirm(`¿Retirar “${titulo}” de ${repertorioSeleccionado.temporada}?\n\nNo se borrará del catálogo ni del histórico.`)) return;
        const { error } = await clienteSupabase
            .from('repertorio_temporada_marchas')
            .delete()
            .eq('id_repertorio', repertorioSeleccionado.id_repertorio)
            .eq('id_marcha', idMarcha);
        if (error) {
            estadoRepertorio(error.message, true);
            return;
        }
        await cargarMarchasTemporada();
        renderizarGestion();
        estadoRepertorio('Marcha retirada únicamente de esta temporada.');
    }

    async function ordenarTemporada() {
        if (!asegurarBorrador()) return;
        estadoRepertorio('Ordenando y renumerando...');
        const { error } = await clienteSupabase.rpc('reordenar_repertorio_alfabetico', {
            p_id_repertorio: repertorioSeleccionado.id_repertorio
        });
        if (error) {
            estadoRepertorio(error.message, true);
            return;
        }
        await cargarMarchasTemporada();
        renderizarGestion();
        estadoRepertorio('Repertorio ordenado alfabéticamente y renumerado.');
    }

    async function activarTemporada() {
        if (!repertorioSeleccionado || repertorioSeleccionado.estado === 'Activo') return;
        if (!confirm(`¿Publicar y activar el repertorio ${repertorioSeleccionado.temporada}?\n\nEl repertorio activo anterior quedará archivado. El catálogo y el histórico no se modificarán.`)) return;
        estadoRepertorio('Activando temporada...');
        const { error } = await clienteSupabase.rpc('activar_repertorio_temporada', {
            p_id_repertorio: repertorioSeleccionado.id_repertorio
        });
        if (error) {
            estadoRepertorio(error.message, true);
            return;
        }
        await cargarRepertorios();
        await cargarRepertorioActivo();
        mapaActivoCache = null;
        repertorioSeleccionado = repertorioActivo;
        await cargarMarchasTemporada();
        renderizarGestion();
        actualizarIndicadorDirecto();
        estadoRepertorio(`Repertorio ${repertorioActivo.temporada} activado. Desde ahora sus números se usarán en los directos.`);
    }

    function asegurarBorrador() {
        if (!repertorioSeleccionado || repertorioSeleccionado.estado !== 'Borrador') {
            estadoRepertorio('Solo se puede modificar una temporada en borrador.', true);
            return false;
        }
        return true;
    }

    function estadoRepertorio(mensaje, error = false) {
        const estado = document.getElementById('rep-estado');
        if (!estado) return;
        estado.textContent = mensaje;
        estado.className = `estado-inyeccion ${error ? 'error' : 'correcto'}`;
    }

    async function obtenerMapaActivo() {
        if (!repertorioActivo) await cargarRepertorioActivo();
        if (!repertorioActivo) return [];
        if (mapaActivoCache && mapaActivoId === repertorioActivo.id_repertorio) return mapaActivoCache;
        if (!navigator.onLine) {
            try {
                const cache = JSON.parse(localStorage.getItem('jc_repertorio_activo_cache_v1') || 'null');
                if (cache?.idRepertorio === repertorioActivo.id_repertorio && Array.isArray(cache.marchas)) {
                    mapaActivoId = repertorioActivo.id_repertorio;
                    mapaActivoCache = cache.marchas;
                    return mapaActivoCache;
                }
            } catch (_) { /* La entrada puede estar incompleta. */ }
        }
        const { data, error } = await clienteSupabase
            .from('repertorio_temporada_marchas')
            .select('id_marcha,numero_repertorio,catalogo_marchas(titulo,autor)')
            .eq('id_repertorio', repertorioActivo.id_repertorio)
            .order('numero_repertorio', { ascending: true });
        if (error) throw error;
        mapaActivoId = repertorioActivo.id_repertorio;
        mapaActivoCache = data || [];
        return mapaActivoCache;
    }

    function actualizarIndicadorDirecto() {
        const panel = document.getElementById('panel-inyeccion');
        if (!panel || document.getElementById('directo-repertorio-activo')) return;
        const indicador = document.createElement('div');
        indicador.id = 'directo-repertorio-activo';
        indicador.style.cssText = 'margin:-8px 0 14px;padding:10px 12px;border:1px solid rgba(212,175,55,.25);border-radius:7px;background:rgba(212,175,55,.05);color:#aaa;font-size:.7rem;line-height:1.45;';
        panel.querySelector('h3')?.insertAdjacentElement('afterend', indicador);
        pintarIndicadorDirecto();
    }

    function pintarIndicadorDirecto() {
        const indicador = document.getElementById('directo-repertorio-activo');
        if (!indicador) return;
        indicador.innerHTML = repertorioActivo
            ? `Numeración activa: <strong style="color:#d4af37;">Repertorio ${repertorioActivo.temporada}</strong>. Busca por número o título. Si no aparece, escribe el nombre de la nueva marcha.`
            : '<strong style="color:#ff8585;">No hay repertorio activo.</strong> Activa una temporada antes de utilizar el directo.';

        const label = document.querySelector('label[for="inp-id-marcha"]');
        const input = document.getElementById('inp-id-marcha');
        if (input) input.placeholder = 'Nº anual (ej. 027)';
        const contenedor = input?.parentElement;
        const etiqueta = contenedor?.querySelector('label');
        if (etiqueta) etiqueta.textContent = 'Nº REPERTORIO (OPCIONAL)';
    }

    function capturarComportamientoDirecto() {
        const originalIniciar = window.iniciarNuevaProcesion;
        const originalInyectar = window.inyectarMarcha;
        const originalPreparar = window.prepararEdicion;
        const input = document.getElementById('inp-id-marcha');

        if (input) {
            input.addEventListener('input', () => {
                resolverNumeroEnFormulario().catch((error) => console.error(error));
            });
        }

        window.autocompletarTitulo = function() {
            resolverNumeroEnFormulario().catch((error) => console.error(error));
        };

        window.prepararEdicion = async function(orden, idMarcha, fase) {
            ordenEdicionDirecto = Number(orden);
            const mapa = await obtenerMapaActivo();
            const relacion = mapa.find((m) => Number(m.id_marcha) === Number(idMarcha));
            const inputNumero = document.getElementById('inp-id-marcha');
            const inputTitulo = document.getElementById('inp-titulo-marcha');
            const selectFase = document.getElementById('inp-fase-marcha');
            const btn = document.getElementById('btn-inyectar-marcha');
            if (inputNumero) inputNumero.value = relacion ? relacion.numero_repertorio : '';
            if (inputTitulo) {
                const catalogo = catalogoRepertorio.find((m) => Number(m.id_marcha) === Number(idMarcha));
                inputTitulo.value = relacion?.catalogo_marchas?.titulo || catalogo?.titulo || `ID maestro ${idMarcha}`;
                inputTitulo.style.color = relacion ? '#27ae60' : '#ffb84d';
                inputTitulo.readOnly = Boolean(relacion);
            }
            window.reflejarMarchaDirecto?.(inputTitulo?.value, relacion?.numero_repertorio);
            if (selectFase) selectFase.value = fase;
            if (btn) {
                btn.textContent = 'ACTUALIZAR';
                btn.style.background = '#3498db';
                btn.style.color = 'white';
            }
            document.getElementById('panel-inyeccion')?.scrollIntoView({ behavior: 'smooth' });
        };

        window.seleccionarMarchaRecienteDirecto = async function(marcha) {
            const inputNumero = document.getElementById('inp-id-marcha');
            const inputTitulo = document.getElementById('inp-titulo-marcha');
            const mapa = await obtenerMapaActivo();
            const relacion = mapa.find((m) => Number(m.id_marcha) === Number(marcha.id_marcha));
            if (inputNumero) inputNumero.value = relacion ? relacion.numero_repertorio : '';
            if (inputTitulo) {
                inputTitulo.value = marcha.titulo;
                inputTitulo.readOnly = Boolean(relacion);
                inputTitulo.style.color = relacion ? '#27ae60' : 'var(--color-oro)';
            }
            window.reflejarMarchaDirecto?.(marcha.titulo, relacion?.numero_repertorio);
        };

        window.iniciarNuevaProcesion = async function() {
            if (!repertorioActivo) {
                alert('No hay ningún repertorio activo. Activa una temporada desde Administración > Repertorio.');
                return;
            }
            await originalIniciar?.();
            const { data: activa } = await clienteSupabase
                .from('maestro_procesiones')
                .select('id_procesion,id_repertorio')
                .eq('estado', 'Activa')
                .maybeSingle();
            if (activa && !activa.id_repertorio) {
                await clienteSupabase
                    .from('maestro_procesiones')
                    .update({ id_repertorio: repertorioActivo.id_repertorio })
                    .eq('id_procesion', activa.id_procesion);
            }
        };

        window.inyectarMarcha = function() {
            window.sincronizarEntradaDirecto?.();
            const numero = document.getElementById('inp-id-marcha')?.value.trim();
            // El alta sin número conserva también la cola local del directo sin cobertura.
            if (!numero && ordenEdicionDirecto === null) return originalInyectar();
            return inyectarMarchaPorNumeroAnual();
        };

        if (originalPreparar && typeof originalPreparar !== 'function') {
            console.warn('No se ha podido capturar el editor anterior del directo.');
        }
    }

    async function resolverNumeroEnFormulario() {
        const input = document.getElementById('inp-id-marcha');
        const titulo = document.getElementById('inp-titulo-marcha');
        if (!input || !titulo) return;
        const valor = input.value.trim();
        const numero = Number(valor);
        if (!Number.isInteger(numero) || numero <= 0) {
            titulo.readOnly = false;
            if (!valor) {
                titulo.placeholder = 'Título de la marcha';
                titulo.style.color = 'var(--color-oro)';
            }
            return;
        }
        const mapa = await obtenerMapaActivo();
        if (input.value.trim() !== valor) return;
        const relacion = mapa.find((m) => Number(m.numero_repertorio) === numero);
        if (relacion) {
            titulo.value = relacion.catalogo_marchas?.titulo || `ID maestro ${relacion.id_marcha}`;
            titulo.style.color = '#27ae60';
            titulo.readOnly = true;
        } else {
            titulo.value = '';
            titulo.placeholder = `Nº ${numeroVisible(numero)} no encontrado: borra el número y escribe el título`;
            titulo.style.color = '#ff3b3b';
            titulo.readOnly = false;
        }
    }

    async function inyectarMarchaPorNumeroAnual() {
        window.sincronizarEntradaDirecto?.();
        const valorNumero = document.getElementById('inp-id-marcha')?.value.trim() || '';
        const numero = valorNumero ? Number(valorNumero) : null;
        const tituloManual = document.getElementById('inp-titulo-marcha')?.value.trim() || '';
        const fase = document.getElementById('inp-fase-marcha')?.value;
        if (valorNumero && (!Number.isInteger(numero) || numero <= 0)) {
            alert('Introduce un número anual válido o déjalo vacío para escribir el título.');
            return;
        }
        if (!valorNumero && !tituloManual) {
            alert('Escribe el título de la marcha. El número anual es opcional.');
            return;
        }
        if (!repertorioActivo) await cargarRepertorioActivo();
        if (!repertorioActivo) {
            alert('No hay repertorio activo.');
            return;
        }

        let relacion = null;
        if (valorNumero) {
            const { data, error } = await clienteSupabase
                .from('repertorio_temporada_marchas')
                .select('id_marcha,numero_repertorio,catalogo_marchas(titulo)')
                .eq('id_repertorio', repertorioActivo.id_repertorio)
                .eq('numero_repertorio', numero)
                .maybeSingle();
            if (error) {
                alert('No se ha podido consultar el repertorio: ' + error.message);
                return;
            }
            relacion = data;
        }
        if (valorNumero && !relacion) {
            alert(`El número ${numeroVisible(numero)} no existe en el repertorio ${repertorioActivo.temporada}.`);
            return;
        }

        const { data: procesion, error: errorProcesion } = await clienteSupabase
            .from('maestro_procesiones')
            .select('id_procesion,id_repertorio')
            .eq('estado', 'Activa')
            .maybeSingle();
        if (errorProcesion || !procesion) {
            alert('No hay ninguna actuación activa.');
            return;
        }

        if (!procesion.id_repertorio) {
            await clienteSupabase
                .from('maestro_procesiones')
                .update({ id_repertorio: repertorioActivo.id_repertorio })
                .eq('id_procesion', procesion.id_procesion);
        }

        const boton = document.getElementById('btn-inyectar-marcha');
        const idOperacion = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        if (boton) {
            boton.disabled = true;
            boton.textContent = ordenEdicionDirecto !== null ? 'Actualizando…' : 'Guardando…';
        }

        try {
            const marcha = relacion || await obtenerOCrearMarcha(null, tituloManual);
            if (ordenEdicionDirecto !== null) {
                const { error } = await clienteSupabase
                    .from('repertorio_transaccional')
                    .update({
                        id_marcha: Number(marcha.id_marcha),
                        numero_repertorio: numero,
                        fase
                    })
                    .eq('id_procesion', procesion.id_procesion)
                    .eq('orden', ordenEdicionDirecto);
                if (error) throw error;
                ordenEdicionDirecto = null;
            } else {
                const { data: ultimo, error: errorOrden } = await clienteSupabase
                    .from('repertorio_transaccional')
                    .select('orden')
                    .eq('id_procesion', procesion.id_procesion)
                    .order('orden', { ascending: false })
                    .limit(1);
                if (errorOrden) throw errorOrden;
                const orden = (ultimo?.[0]?.orden || 0) + 1;
                const { error } = await clienteSupabase
                    .from('repertorio_transaccional')
                    .insert([{
                        id_procesion: procesion.id_procesion,
                        id_marcha: Number(marcha.id_marcha),
                        numero_repertorio: numero,
                        fase,
                        orden,
                        id_operacion_cliente: idOperacion
                    }]);
                if (error) throw error;
            }

            const input = document.getElementById('inp-id-marcha');
            const titulo = document.getElementById('inp-titulo-marcha');
            if (input) input.value = '';
            if (titulo) {
                titulo.value = '';
                titulo.readOnly = false;
                titulo.placeholder = 'Título de la marcha';
                titulo.style.color = 'var(--color-oro)';
            }
            window.limpiarEntradaDirecto?.();
            if (boton) {
                boton.style.background = 'var(--color-oro)';
                boton.style.color = 'black';
            }
            document.getElementById('estado-inyeccion').textContent = valorNumero
                ? `Marcha ${numeroVisible(numero)} · ${relacion.catalogo_marchas?.titulo || ''} guardada.`
                : `Marcha «${marcha.titulo}» guardada sin número anual.`;
            if (typeof window.cargarHistorialTransaccional === 'function') await window.cargarHistorialTransaccional();
        } catch (error) {
            const problemaRed = !navigator.onLine || /fetch|network|conexi|Failed to fetch/i.test(error.message || '');
            if (ordenEdicionDirecto === null && problemaRed && relacion && typeof window.encolarMarchaPendiente === 'function') {
                window.encolarMarchaPendiente({
                    idProcesion: procesion.id_procesion,
                    idIntroducido: Number(relacion.id_marcha),
                    numeroRepertorio: numero,
                    titulo: relacion.catalogo_marchas?.titulo || tituloManual,
                    fase,
                    idLocal: idOperacion
                });
                document.getElementById('inp-id-marcha').value = '';
                document.getElementById('inp-titulo-marcha').value = '';
                window.limpiarEntradaDirecto?.();
                document.getElementById('estado-inyeccion').textContent = 'Guardada en este dispositivo. Se reintentará cuando haya conexión.';
            } else {
                alert('No se ha podido guardar la marcha: ' + error.message);
            }
        } finally {
            if (boton) {
                boton.disabled = false;
                boton.textContent = ordenEdicionDirecto !== null ? 'ACTUALIZAR' : 'Añadir';
            }
        }
    }
})();
