/* ============================================================
   PWA Y NOTIFICACIONES DE DIRECTO
   ============================================================ */

(function inicializarPWA() {
    'use strict';

    const VAPID_PUBLIC_KEY = 'BD6xm9ZnsMUywalMZNWC-jMmKElpqucvIJZ9TfCzODu9TIR-d11QcpBO_nafnvdSdTIvyGqTH5COyrXzhCT-aWs';
    let eventoInstalacion = null;
    let registroSW = null;

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
            await actualizarEstadoNotificaciones();
        })
        .catch((error) => {
            console.error('No se ha podido registrar la aplicación:', error);
        });

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
