/* ============================================================
   CONSENTIMIENTO PARA COOKIES ANALÍTICAS
   Impide activar Google Analytics hasta que el usuario acepte.
   ============================================================ */

(function inicializarConsentimiento() {
    'use strict';

    const STORAGE_KEY = 'jc_consentimiento_analytics';
    const VERSION = '1';
    const VIGENCIA_MS = 24 * 30 * 24 * 60 * 60 * 1000;

    // analytics.js comprobará esta marca antes de activar GA4.
    window.JC_ANALYTICS_REQUIERE_CONSENTIMIENTO = true;

    document.addEventListener('DOMContentLoaded', () => {
        crearInterfazConsentimiento();

        if (obtenerDecision() === 'aceptado') {
            activarAnalyticsConConsentimiento();
        } else if (!obtenerDecision()) {
            mostrarPanelConsentimiento();
        }
    });

    function crearInterfazConsentimiento() {
        if (document.getElementById('jc-cookie-panel')) return;

        const panel = document.createElement('section');
        panel.id = 'jc-cookie-panel';
        panel.className = 'cookie-consent-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'jc-cookie-title');
        panel.innerHTML = `
            <div class="cookie-consent-content">
                <div>
                    <span class="cookie-consent-label">Tu privacidad</span>
                    <h2 id="jc-cookie-title">Cookies analíticas</h2>
                    <p>
                        Usamos Google Analytics para conocer visitas y mejorar la web.
                        Solo se activará si aceptas. Puedes cambiar tu decisión cuando quieras.
                        <a href="${obtenerRutaPoliticaCookies()}">Política de cookies</a>.
                    </p>
                    <details>
                        <summary>Más información</summary>
                        <p>
                            Google Analytics puede almacenar identificadores y recopilar información
                            sobre páginas visitadas, dispositivo, navegación y procedencia del tráfico.
                            No utilizamos estas cookies para publicidad personalizada.
                        </p>
                    </details>
                </div>
                <div class="cookie-consent-actions">
                    <button type="button" data-cookie-decision="rechazado">Rechazar</button>
                    <button type="button" data-cookie-decision="aceptado">Aceptar</button>
                </div>
            </div>
        `;

        panel.addEventListener('click', (evento) => {
            const boton = evento.target.closest('[data-cookie-decision]');
            if (boton) guardarDecision(boton.dataset.cookieDecision);
        });

        const configurar = document.createElement('button');
        configurar.id = 'jc-cookie-settings';
        configurar.className = 'cookie-settings-button';
        configurar.type = 'button';
        configurar.textContent = 'Cookies';
        configurar.setAttribute('aria-label', 'Cambiar preferencias de cookies');
        configurar.addEventListener('click', mostrarPanelConsentimiento);

        document.body.appendChild(panel);
        document.body.appendChild(configurar);
    }

    function guardarDecision(decision) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            decision,
            version: VERSION,
            fecha: new Date().toISOString()
        }));

        ocultarPanelConsentimiento();

        if (decision === 'aceptado') {
            activarAnalyticsConConsentimiento();
        } else {
            denegarAnalytics();
        }
    }

    function obtenerDecision() {
        try {
            const guardado = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
            const fecha = new Date(guardado?.fecha || 0).getTime();
            const vigente = fecha > 0 && (Date.now() - fecha) < VIGENCIA_MS;
            return guardado?.version === VERSION && vigente ? guardado.decision : null;
        } catch (error) {
            return null;
        }
    }

    function activarAnalyticsConConsentimiento() {
        window.JC_ANALYTICS_CONSENT_GRANTED = true;

        if (typeof window.activarGoogleAnalytics === 'function') {
            window.activarGoogleAnalytics();
        }

        if (typeof window.gtag === 'function') {
            window.gtag('consent', 'update', {
                analytics_storage: 'granted',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied'
            });
        }
    }

    function denegarAnalytics() {
        window.JC_ANALYTICS_CONSENT_GRANTED = false;

        if (typeof window.gtag === 'function') {
            window.gtag('consent', 'update', {
                analytics_storage: 'denied',
                ad_storage: 'denied',
                ad_user_data: 'denied',
                ad_personalization: 'denied'
            });
        }

        borrarCookiesAnalytics();
    }

    function mostrarPanelConsentimiento() {
        document.getElementById('jc-cookie-panel')?.classList.add('activo');
        document.body.classList.add('cookie-panel-abierto');
    }

    function ocultarPanelConsentimiento() {
        document.getElementById('jc-cookie-panel')?.classList.remove('activo');
        document.body.classList.remove('cookie-panel-abierto');
    }

    function obtenerRutaPoliticaCookies() {
        return window.location.pathname.includes('/templates/')
            ? 'cookies.html'
            : 'templates/cookies.html';
    }

    function borrarCookiesAnalytics() {
        document.cookie.split(';').forEach((cookie) => {
            const nombre = cookie.split('=')[0].trim();
            if (nombre === '_ga' || nombre.startsWith('_ga_')) {
                document.cookie = `${nombre}=; Max-Age=0; path=/; SameSite=Lax`;
                document.cookie = `${nombre}=; Max-Age=0; path=/; domain=${window.location.hostname}; SameSite=Lax`;
            }
        });
    }
})();
