/* ============================================================
   GOOGLE ANALYTICS 4
   Carga centralizada para las páginas públicas del sitio.
   ============================================================ */

(function inicializarModuloAnalytics() {
    'use strict';

    const GA_MEASUREMENT_ID = 'G-8CVCJ76VXK';
    const GA_SCRIPT_ID = 'jc-google-analytics-4';

    /**
     * Activa Google Analytics una sola vez.
     *
     * Esta función queda expuesta en window para poder llamarla
     * después de obtener consentimiento cuando se añada el futuro
     * banner de cookies.
     */
    function activarGoogleAnalytics() {
        if (window.__jcGoogleAnalyticsInicializado) {
            return;
        }

        // Evita contaminar la propiedad de producción durante pruebas locales.
        if (['localhost', '127.0.0.1', ''].includes(window.location.hostname)) {
            return;
        }

        window.__jcGoogleAnalyticsInicializado = true;
        window.dataLayer = window.dataLayer || [];

        window.gtag = window.gtag || function gtag() {
            window.dataLayer.push(arguments);
        };

        // Estado conservador por defecto: sin almacenamiento analítico.
        // consent.js lo actualiza a "granted" únicamente tras la aceptación.
        window.gtag('consent', 'default', {
            analytics_storage: window.JC_ANALYTICS_CONSENT_GRANTED === true ? 'granted' : 'denied',
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied'
        });

        // Evita descargar gtag.js de nuevo si este archivo se ejecuta más de una vez.
        if (!document.getElementById(GA_SCRIPT_ID)) {
            const scriptAnalytics = document.createElement('script');
            scriptAnalytics.id = GA_SCRIPT_ID;
            scriptAnalytics.async = true;
            scriptAnalytics.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
            document.head.appendChild(scriptAnalytics);
        }

        window.gtag('js', new Date());
        window.gtag('config', GA_MEASUREMENT_ID);
    }

    window.activarGoogleAnalytics = activarGoogleAnalytics;

    /*
     * Preparado para consentimiento futuro:
     * si antes de cargar este archivo se define
     * window.JC_ANALYTICS_REQUIERE_CONSENTIMIENTO = true,
     * Analytics esperará a que el banner llame a
     * window.activarGoogleAnalytics().
     */
    if (window.JC_ANALYTICS_REQUIERE_CONSENTIMIENTO !== true) {
        activarGoogleAnalytics();
    }
})();
