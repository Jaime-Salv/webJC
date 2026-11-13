/* ============================================================
   PWA Y NOTIFICACIONES DE DIRECTO
   ============================================================ */

(function inicializarPWA() {
    'use strict';

    const VAPID_PUBLIC_KEY = 'BD6xm9ZnsMUywalMZNWC-jMmKElpqucvIJZ9TfCzODu9TIR-d11QcpBO_nafnvdSdTIvyGqTH5COyrXzhCT-aWs';
    let eventoInstalacion = null;
    let registroSW = null;
    let recargarTrasActualizar = false;
    let avisoPospuesto = false;
    const CLAVE_POSPONER_VERSION = 'jc_actualizacion_pospuesta_hasta';
    function actualizacionPospuesta() {
        if (avisoPospuesto) return true;
        try { return Number(sessionStorage.getItem(CLAVE_POSPONER_VERSION)) > Date.now(); }
        catch (_) { return false; }
    }

    if (!('serviceWorker' in navigator)) return;

    window.addEventListener('beforeinstallprompt', (evento) => {
        evento.preventDefault();
        eventoInstalacion = evento;
        actualizarBotonInstalar(true);
    });

    window.addEventListener('appinstalled', () => {
        eventoInstalacion = null;
        actualizarBotonInstalar(false);
        mostrarEstadoPWA('Aplicación instalada correctamente.');
    });

    document.addEventListener('DOMContentLoaded', prepararControlesPWA);

    navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .then(async (registro) => {
            registroSW = registro;
            observarActualizaciones(registro);
            await actualizarEstadoNotificaciones();
        })
        .catch((error) => {
            console.error('No se ha podido registrar la aplicación:', error);
        });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
        document.getElementById('aviso-version-web')?.remove();
        if (recargarTrasActualizar) {
            recargarTrasActualizar = false;
            try { sessionStorage.removeItem(CLAVE_POSPONER_VERSION); } catch (_) {}
            window.location.reload();
        }
    });

    function observarActualizaciones(registro) {
        if (registro.waiting && navigator.serviceWorker.controller) mostrarActualizacion(registro);
        registro.addEventListener('updatefound', () => {
            const instalando = registro.installing;
            instalando?.addEventListener('statechange', () => {
                if (instalando.state === 'installed' && navigator.serviceWorker.controller) mostrarActualizacion(registro);
            });
        });
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden && navigator.onLine) registro.update().catch(() => {});
        });
    }

    function mostrarActualizacion(registro) {
        if (actualizacionPospuesta() || document.getElementById('aviso-version-web')) return;
        const aviso = document.createElement('aside');
        aviso.id = 'aviso-version-web';
        aviso.className = 'aviso-version-web';
        aviso.setAttribute('role', 'status');
        aviso.innerHTML = '<strong>Nueva versión disponible</strong><span>Hay mejoras de la web disponibles. Guarda lo que estés haciendo antes de actualizar.</span><div><button type="button" data-pwa-actualizar>Actualizar</button><button type="button" data-pwa-despues>Después</button></div>';
        aviso.querySelector('[data-pwa-despues]').addEventListener('click', () => {
            avisoPospuesto = true;
            try { sessionStorage.setItem(CLAVE_POSPONER_VERSION, String(Date.now() + 4 * 60 * 60 * 1000)); } catch (_) {}
            aviso.remove();
        });
        aviso.querySelector('[data-pwa-actualizar]').addEventListener('click', () => {
            if (!registro.waiting) { aviso.remove(); return; }
            recargarTrasActualizar = true;
            aviso.querySelector('[data-pwa-actualizar]').disabled = true;
            registro.waiting.postMessage({ type: 'ACTIVAR_ACTUALIZACION' });
        });
        document.body.appendChild(aviso);
    }

    function prepararControlesPWA() {
        document.getElementById('btn-instalar-app')?.addEventListener('click', instalarAplicacion);
        document.getElementById('btn-notificaciones-directo')?.addEventListener('click', alternarNotificaciones);

        const instalada = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
        actualizarBotonInstalar(!instalada && (Boolean(eventoInstalacion) || esIOS));
        actualizarEstadoNotificaciones();
    }

    async function instalarAplicacion() {
        if (!eventoInstalacion) {
            mostrarEstadoPWA('En iPhone: pulsa Compartir y después “Añadir a pantalla de inicio”.');
            return;
        }

        await eventoInstalacion.prompt();
        const resultado = await eventoInstalacion.userChoice;
        eventoInstalacion = null;
        actualizarBotonInstalar(false);

        if (resultado.outcome === 'accepted') {
            mostrarEstadoPWA('Instalación aceptada.');
        }
    }

    async function alternarNotificaciones() {
        if (!('Notification' in window) || !('PushManager' in window)) {
            mostrarEstadoPWA('Este navegador no admite avisos push.');
            return;
        }

        try {
            registroSW = registroSW || await navigator.serviceWorker.ready;
            const actual = await registroSW.pushManager.getSubscription();

            if (actual) {
                await fetch('/.netlify/functions/push-unsubscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ endpoint: actual.endpoint })
                });
                await actual.unsubscribe();
                mostrarEstadoPWA('Avisos de directo desactivados.');
            } else {
                const permiso = await Notification.requestPermission();
                if (permiso !== 'granted') {
                    mostrarEstadoPWA('No se han concedido permisos para avisos.');
                    return;
                }

                const suscripcion = await registroSW.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: convertirClave(VAPID_PUBLIC_KEY)
                });

                const respuesta = await fetch('/.netlify/functions/push-subscribe', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        subscription: suscripcion.toJSON(),
                        userAgent: navigator.userAgent
                    })
                });

                if (!respuesta.ok) {
                    await suscripcion.unsubscribe();
                    let mensaje = 'No se ha podido guardar la suscripción.';

                    try {
                        const errorServidor = await respuesta.json();
                        if (errorServidor.detail) {
                            mensaje += ` ${errorServidor.detail}`;
                        } else if (errorServidor.error) {
                            mensaje += ` ${errorServidor.error}`;
                        }
                    } catch (error) {
                        mensaje += ` Error ${respuesta.status}.`;
                    }

                    throw new Error(mensaje);
                }

                mostrarEstadoPWA('Te avisaremos cuando la banda entre en directo.');
            }

            await actualizarEstadoNotificaciones();
        } catch (error) {
            console.error('Error gestionando avisos:', error);
            mostrarEstadoPWA(error.message || 'No se han podido configurar los avisos.');
        }
    }

    async function actualizarEstadoNotificaciones() {
        const boton = document.getElementById('btn-notificaciones-directo');
        if (!boton || !registroSW) return;

        const suscripcion = await registroSW.pushManager.getSubscription();
        boton.classList.toggle('activo', Boolean(suscripcion));
        boton.textContent = suscripcion ? 'Avisos activados' : 'Avisarme del directo';
        actualizarVisibilidadTarjetaPWA(Boolean(suscripcion));
    }

    function actualizarBotonInstalar(visible) {
        const boton = document.getElementById('btn-instalar-app');
        if (boton) boton.hidden = !visible;
    }

    function actualizarVisibilidadTarjetaPWA(notificacionesActivas) {
        const bloque = document.getElementById('bloque-pwa-home');
        if (!bloque) return;

        // Si el usuario ya recibe avisos de directo, retiramos la tarjeta
        // de la portada para mantener la interfaz limpia.
        bloque.hidden = notificacionesActivas;
    }

    function mostrarEstadoPWA(mensaje) {
        const estado = document.getElementById('estado-pwa');
        if (estado) estado.textContent = mensaje;
    }

    function convertirClave(base64) {
        const padding = '='.repeat((4 - base64.length % 4) % 4);
        const base64Seguro = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
        const raw = window.atob(base64Seguro);
        return Uint8Array.from([...raw].map((caracter) => caracter.charCodeAt(0)));
    }
})();

/* Menú móvil público: evita que el distintivo de alojamiento tape los enlaces. */
(() => {
    const ruta = window.location.pathname.toLowerCase().replace(/\/$/, '') || '/';
    const paginasConNavegacion = new Set([
        '/', '/index.html',
        '/templates/catalogo', '/templates/catalogo.html',
        '/templates/comunidad', '/templates/comunidad.html',
        '/templates/simulacion', '/templates/simulacion.html',
        '/templates/perfil', '/templates/perfil.html',
        '/templates/musicos', '/templates/musicos.html'
    ]);
    if (!paginasConNavegacion.has(ruta)) return;

    const destinos = [
        { clave: 'inicio', icono: '⌂', texto: 'Inicio', href: '/' },
        { clave: 'actuaciones', icono: '♪', texto: 'Actuaciones', href: '/#actuaciones' },
        { clave: 'catalogo', icono: '▤', texto: 'Catálogo', href: '/templates/catalogo' },
        { clave: 'crear', icono: '+', texto: 'Crear', href: '/templates/simulacion' },
        { clave: 'musicos', icono: '♫', texto: 'Portal músico', href: '/templates/musicos.html' }
    ];

    function detectarSeccionActiva() {
        if (ruta.includes('musicos')) return 'musicos';
        if (ruta.includes('catalogo')) return 'catalogo';
        if (ruta.includes('simulacion')) return 'crear';
        if (window.location.hash === '#actuaciones') return 'actuaciones';
        return 'inicio';
    }

    function montarMenu() {
        if (document.querySelector('.mobile-menu-jc')) return;
        const envoltorio = document.createElement('div');
        envoltorio.className = 'mobile-menu-jc';
        envoltorio.innerHTML = `
            <button type="button" class="mobile-menu-jc-trigger" aria-controls="mobile-menu-jc-panel"
                    aria-expanded="false" aria-label="Abrir menú de navegación">
                <span class="mobile-menu-jc-bars" aria-hidden="true"><span></span><span></span><span></span></span>
                <span>Menú</span>
            </button>
            <div class="mobile-menu-jc-backdrop" hidden></div>
            <nav id="mobile-menu-jc-panel" class="mobile-menu-jc-panel"
                 aria-label="Navegación principal móvil" hidden>
                <strong class="mobile-menu-jc-heading">Navegación</strong>
                ${destinos.map((destino) => `
                    <a class="mobile-menu-jc-link" data-seccion="${destino.clave}" href="${destino.href}">
                        <span class="mobile-menu-jc-icon" aria-hidden="true">${destino.icono}</span>
                        <span>${destino.texto}</span>
                    </a>
                `).join('')}
            </nav>`;
        document.body.appendChild(envoltorio);

        const boton = envoltorio.querySelector('.mobile-menu-jc-trigger');
        const panel = envoltorio.querySelector('.mobile-menu-jc-panel');
        const fondo = envoltorio.querySelector('.mobile-menu-jc-backdrop');
        const enlaces = [...panel.querySelectorAll('a')];
        let abierto = false;

        function actualizarActivo() {
            const seccion = detectarSeccionActiva();
            enlaces.forEach((enlace) => {
                const activo = enlace.dataset.seccion === seccion;
                enlace.classList.toggle('activo', activo);
                if (activo) enlace.setAttribute('aria-current', 'page');
                else enlace.removeAttribute('aria-current');
            });
        }
        function cambiarEstado(abrir, devolverFoco = false) {
            abierto = abrir;
            panel.hidden = !abrir;
            fondo.hidden = !abrir;
            boton.setAttribute('aria-expanded', String(abrir));
            boton.setAttribute('aria-label', abrir ? 'Cerrar menú de navegación' : 'Abrir menú de navegación');
            envoltorio.classList.toggle('abierto', abrir);
            document.body.classList.toggle('mobile-menu-jc-abierto', abrir);
            if (abrir) {
                actualizarActivo();
                panel.querySelector('a')?.focus();
            } else if (devolverFoco) {
                boton.focus();
            }
        }

        boton.addEventListener('click', () => cambiarEstado(!abierto));
        fondo.addEventListener('click', () => cambiarEstado(false, true));
        panel.addEventListener('click', (evento) => {
            if (evento.target.closest('a')) cambiarEstado(false);
        });
        document.addEventListener('keydown', (evento) => {
            if (!abierto) return;
            if (evento.key === 'Escape') cambiarEstado(false, true);
            if (evento.key === 'Tab') {
                const controles = [boton, ...enlaces];
                const indice = controles.indexOf(document.activeElement);
                if (evento.shiftKey && indice === 0) {
                    evento.preventDefault();
                    enlaces[enlaces.length - 1].focus();
                } else if (!evento.shiftKey && indice === controles.length - 1) {
                    evento.preventDefault();
                    boton.focus();
                }
            }
        });
        window.addEventListener('hashchange', actualizarActivo);
        window.matchMedia('(min-width: 681px)').addEventListener('change', (evento) => {
            if (evento.matches && abierto) cambiarEstado(false);
        });
        actualizarActivo();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', montarMenu, { once: true });
    } else {
        montarMenu();
    }
})();
