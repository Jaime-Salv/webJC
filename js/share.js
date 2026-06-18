/* ============================================================
   MENÚ GENERAL PARA COMPARTIR REPERTORIOS
   WhatsApp, Facebook, X, Instagram, enlace y códigos externos.
   ============================================================ */

(function inicializarCompartir() {
    'use strict';

    if (window.abrirCompartir) return;

    let contenidoActual = null;

    function abrirCompartir(opciones) {
        contenidoActual = normalizarOpciones(opciones);
        const modal = obtenerModal();

        modal.querySelector('[data-share-title]').textContent = contenidoActual.titulo;
        modal.querySelector('[data-share-url]').value = contenidoActual.url;
        modal.querySelector('[data-share-code="bbcode"]').value =
            `[url=${contenidoActual.url}]${contenidoActual.titulo}[/url]`;
        modal.querySelector('[data-share-code="html"]').value =
            `<a href="${escaparAtributo(contenidoActual.url)}">${escaparHTML(contenidoActual.titulo)}</a>`;

        modal.classList.add('activo');
        modal.setAttribute('aria-hidden', 'false');
        document.body.classList.add('share-modal-abierto');
    }

    function cerrarCompartir() {
        const modal = document.getElementById('jc-share-modal');
        if (!modal) return;

        modal.classList.remove('activo');
        modal.setAttribute('aria-hidden', 'true');
        document.body.classList.remove('share-modal-abierto');
    }

    function obtenerModal() {
        let modal = document.getElementById('jc-share-modal');
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'jc-share-modal';
        modal.className = 'share-modal-overlay';
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <section class="share-modal" role="dialog" aria-modal="true" aria-labelledby="jc-share-heading">
                <header class="share-modal-header">
                    <div>
                        <span>Compartir repertorio</span>
                        <h2 id="jc-share-heading" data-share-title>Repertorio</h2>
                    </div>
                    <button type="button" class="share-modal-close" data-share-action="close" aria-label="Cerrar">&times;</button>
                </header>

                <div class="share-platform-grid">
                    <button type="button" class="share-platform share-whatsapp" data-share-action="whatsapp">
                        <strong>WhatsApp</strong><span>Enviar por mensaje</span>
                    </button>
                    <button type="button" class="share-platform share-facebook" data-share-action="facebook">
                        <strong>Facebook</strong><span>Compartir publicación</span>
                    </button>
                    <button type="button" class="share-platform share-x" data-share-action="x">
                        <strong>X</strong><span>Publicar enlace</span>
                    </button>
                    <button type="button" class="share-platform share-instagram" data-share-action="instagram">
                        <strong>Instagram</strong><span>Copiar y abrir Instagram</span>
                    </button>
                </div>

                <div class="share-copy-row">
                    <input type="text" data-share-url readonly aria-label="Enlace del repertorio">
                    <button type="button" data-share-action="copy-link">Copiar enlace</button>
                </div>

                <details class="share-code-panel">
                    <summary>Código para foros o páginas web</summary>
                    <label>
                        Código para foros (BBCode)
                        <span>
                            <input type="text" data-share-code="bbcode" readonly>
                            <button type="button" data-share-action="copy-bbcode">Copiar</button>
                        </span>
                    </label>
                    <label>
                        Código para páginas web (HTML)
                        <span>
                            <input type="text" data-share-code="html" readonly>
                            <button type="button" data-share-action="copy-html">Copiar</button>
                        </span>
                    </label>
                </details>

                <div class="share-feedback" data-share-feedback role="status"></div>
            </section>
        `;

        modal.addEventListener('click', gestionarAccion);
        document.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape') cerrarCompartir();
        });
        document.body.appendChild(modal);
        return modal;
    }

    function gestionarAccion(evento) {
        if (evento.target.classList.contains('share-modal-overlay')) {
            cerrarCompartir();
            return;
        }

        const boton = evento.target.closest('[data-share-action]');
        if (!boton || !contenidoActual) return;

        const accion = boton.dataset.shareAction;
        if (accion === 'close') cerrarCompartir();
        if (accion === 'whatsapp') abrirVentana(`https://wa.me/?text=${encodeURIComponent(mensajeCompleto())}`);
        if (accion === 'facebook') abrirVentana(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(contenidoActual.url)}`);
        if (accion === 'x') {
            const textoX = contenidoActual.texto.replace(
                /Banda de Música Julián Cerdán/gi,
                '@BMjulianCerdan'
            );
            abrirVentana(`https://twitter.com/intent/tweet?text=${encodeURIComponent(textoX)}&url=${encodeURIComponent(contenidoActual.url)}`);
        }
        if (accion === 'instagram') compartirEnInstagram();
        if (accion === 'copy-link') copiarTexto(contenidoActual.url, 'Enlace copiado');
        if (accion === 'copy-bbcode') copiarCampo('bbcode', 'Código para foro copiado');
        if (accion === 'copy-html') copiarCampo('html', 'Código HTML copiado');
    }

    function compartirEnInstagram() {
        copiarTexto(contenidoActual.url, 'Enlace copiado. Pégalo en Instagram');
        abrirVentana('https://www.instagram.com/');
    }

    function copiarCampo(tipo, mensaje) {
        const campo = document.querySelector(`[data-share-code="${tipo}"]`);
        if (campo) copiarTexto(campo.value, mensaje);
    }

    async function copiarTexto(texto, mensaje) {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(texto);
            } else {
                const campoTemporal = document.createElement('textarea');
                campoTemporal.value = texto;
                campoTemporal.style.position = 'fixed';
                campoTemporal.style.opacity = '0';
                document.body.appendChild(campoTemporal);
                campoTemporal.select();
                document.execCommand('copy');
                campoTemporal.remove();
            }

            mostrarFeedback(mensaje);
        } catch (error) {
            mostrarFeedback('No se ha podido copiar automáticamente');
        }
    }

    function mostrarFeedback(mensaje) {
        const feedback = document.querySelector('[data-share-feedback]');
        if (!feedback) return;

        feedback.textContent = mensaje;
        window.clearTimeout(mostrarFeedback.temporizador);
        mostrarFeedback.temporizador = window.setTimeout(() => {
            feedback.textContent = '';
        }, 2600);
    }

    function mensajeCompleto() {
        return `${contenidoActual.texto}\n${contenidoActual.url}`;
    }

    function normalizarOpciones(opciones) {
        const titulo = String(opciones?.titulo || document.title || 'Repertorio').trim();
        const url = String(opciones?.url || window.location.href);
        const texto = String(
            opciones?.texto ||
            `🎼 Mira este repertorio de la Banda de Música Julián Cerdán:\n\n${titulo}`
        ).trim();

        return { titulo, texto, url };
    }

    function abrirVentana(url) {
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    function escaparHTML(valor) {
        return String(valor)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function escaparAtributo(valor) {
        return escaparHTML(valor);
    }

    window.abrirCompartir = abrirCompartir;
    window.cerrarCompartir = cerrarCompartir;
})();
