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

    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(inicializarModuloRepertorios, 0);
    });

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

                    <div style="overflow-x:auto;">
                        <table class="tabla-historial" style="min-width:620px;">
                            <thead>
                                <tr>
                                    <th style="width:75px;">Nº anual</th>
                                    <th>Marcha</th>
                                    <th>Autor</th>
                                    <th style="width:90px;">ID maestro</th>
                                    <th style="width:95px;">Acción</th>
                                </tr>
                            </thead>
                            <tbody id="rep-tabla-marchas"></tbody>
                        </table>
                    </div>
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
        const tabla = document.getElementById('rep-tabla-marchas');
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
            ? 'Puedes añadir o retirar marchas. Al ordenar A-Z se recalcularán los números anuales de esta temporada.'
            : 'Esta temporada está protegida. Para hacer cambios crea una nueva temporada en borrador.';
        if (form) form.style.display = editable ? 'block' : 'none';
        if (ordenar) ordenar.disabled = !editable || marchasTemporada.length === 0;
        if (activar) activar.disabled = repertorioSeleccionado.estado === 'Activo' || marchasTemporada.length === 0;

        if (tabla) {
            tabla.innerHTML = marchasTemporada.map((item) => {
                const marcha = item.catalogo_marchas || {};
                return `
                    <tr>
                        <td style="color:#d4af37;font-weight:900;">${numeroVisible(item.numero_repertorio)}</td>
                        <td style="color:white;font-weight:800;">${escapar(marcha.titulo || 'Marcha sin título')}</td>
                        <td>${escapar(marcha.autor || '--')}</td>
                        <td>#${item.id_marcha}</td>
                        <td>${editable ? `<button type="button" class="btn-mini-danger" data-rep-retirar="${item.id_marcha}">Retirar</button>` : '—'}</td>
                    </tr>
                `;
            }).join('');
            tabla.querySelectorAll('[data-rep-retirar]').forEach((boton) => {
                boton.addEventListener('click', () => retirarMarcha(Number(boton.dataset.repRetirar)));
            });
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
        estadoRepertorio('Marcha añadida. Pulsa “Ordenar A-Z y renumerar” cuando termines los cambios.');
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
        const { data, error } = await clienteSupabase
            .from('repertorio_temporada_marchas')
            .select('id_marcha,numero_repertorio,catalogo_marchas(titulo,autor)')
            .eq('id_repertorio', repertorioActivo.id_repertorio)
            .order('numero_repertorio', { ascending: true });
        if (error) throw error;
        return data || [];
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
            ? `Numeración activa: <strong style="color:#d4af37;">Repertorio ${repertorioActivo.temporada}</strong>. El número introducido se traduce internamente al ID maestro.`
            : '<strong style="color:#ff8585;">No hay repertorio activo.</strong> Activa una temporada antes de utilizar el directo.';

        const label = document.querySelector('label[for="inp-id-marcha"]');
        const input = document.getElementById('inp-id-marcha');
        if (input) input.placeholder = 'Nº anual (ej. 027)';
        const contenedor = input?.parentElement;
        const etiqueta = contenedor?.querySelector('label');
        if (etiqueta) etiqueta.textContent = 'Nº REPERTORIO';
    }

    function capturarComportamientoDirecto() {
        const originalIniciar = window.iniciarNuevaProcesion;
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
            }
            if (selectFase) selectFase.value = fase;
            if (btn) {
                btn.textContent = 'ACTUALIZAR';
                btn.style.background = '#3498db';
                btn.style.color = 'white';
            }
            document.getElementById('panel-inyeccion')?.scrollIntoView({ behavior: 'smooth' });
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

        window.inyectarMarcha = inyectarMarchaPorNumeroAnual;

        if (originalPreparar && typeof originalPreparar !== 'function') {
            console.warn('No se ha podido capturar el editor anterior del directo.');
        }
    }

    async function resolverNumeroEnFormulario() {
        const input = document.getElementById('inp-id-marcha');
        const titulo = document.getElementById('inp-titulo-marcha');
        if (!input || !titulo) return;
        const numero = Number(input.value);
        if (!Number.isInteger(numero) || numero <= 0) {
            if (!input.value) {
                titulo.value = '';
                titulo.style.color = 'var(--color-oro)';
            }
            return;
        }
        const mapa = await obtenerMapaActivo();
        const relacion = mapa.find((m) => Number(m.numero_repertorio) === numero);
        if (relacion) {
            titulo.value = relacion.catalogo_marchas?.titulo || `ID maestro ${relacion.id_marcha}`;
            titulo.style.color = '#27ae60';
            titulo.readOnly = true;
        } else {
            titulo.value = '';
            titulo.placeholder = `El nº ${numeroVisible(numero)} no existe en el repertorio activo`;
            titulo.style.color = '#ff3b3b';
            titulo.readOnly = true;
        }
    }

    async function inyectarMarchaPorNumeroAnual() {
        const numero = Number(document.getElementById('inp-id-marcha')?.value);
        const fase = document.getElementById('inp-fase-marcha')?.value;
        if (!Number.isInteger(numero) || numero <= 0) {
            alert('Introduce el número de la marcha en el repertorio activo.');
            return;
        }
        if (!repertorioActivo) await cargarRepertorioActivo();
        if (!repertorioActivo) {
            alert('No hay repertorio activo.');
            return;
        }

        const { data: relacion, error: errorRelacion } = await clienteSupabase
            .from('repertorio_temporada_marchas')
            .select('id_marcha,numero_repertorio,catalogo_marchas(titulo)')
            .eq('id_repertorio', repertorioActivo.id_repertorio)
            .eq('numero_repertorio', numero)
            .maybeSingle();
        if (errorRelacion) {
            alert('No se ha podido consultar el repertorio: ' + errorRelacion.message);
            return;
        }
        if (!relacion) {
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
        if (boton) {
            boton.disabled = true;
            boton.textContent = ordenEdicionDirecto !== null ? 'Actualizando…' : 'Guardando…';
        }

        try {
            if (ordenEdicionDirecto !== null) {
                const { error } = await clienteSupabase
                    .from('repertorio_transaccional')
                    .update({
                        id_marcha: Number(relacion.id_marcha),
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
                        id_marcha: Number(relacion.id_marcha),
                        numero_repertorio: numero,
                        fase,
                        orden
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
            if (boton) {
                boton.style.background = 'var(--color-oro)';
                boton.style.color = 'black';
            }
            document.getElementById('estado-inyeccion').textContent = `Marcha ${numeroVisible(numero)} · ${relacion.catalogo_marchas?.titulo || ''} guardada.`;
            if (typeof window.cargarHistorialTransaccional === 'function') await window.cargarHistorialTransaccional();
        } catch (error) {
            alert('No se ha podido guardar la marcha: ' + error.message);
        } finally {
            if (boton) {
                boton.disabled = false;
                boton.textContent = ordenEdicionDirecto !== null ? 'ACTUALIZAR' : 'Añadir';
            }
        }
    }
})();
