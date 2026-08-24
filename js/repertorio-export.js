/* Exportación reutilizable de repertorios en texto y PDF. */
(function () {
    function texto(valor, alternativo = 'Pendiente') {
        const limpio = String(valor ?? '').trim();
        return limpio || alternativo;
    }

    function formatearFecha(valor) {
        if (!valor) return 'Fecha pendiente';
        const fecha = new Date(`${valor}T12:00:00`);
        return Number.isNaN(fecha.getTime())
            ? texto(valor)
            : fecha.toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' });
    }

    function formatearDuracion(segundos) {
        const total = Number(segundos);
        if (!Number.isFinite(total) || total <= 0) return 'Pendiente';
        const minutos = Math.floor(total / 60);
        const resto = Math.round(total % 60);
        return `${minutos}:${String(resto).padStart(2, '0')}`;
    }

    function formatearCornetas(valor) {
        if (valor === 1 || valor === true || String(valor) === '1') return 'Sí';
        if (valor === 0 || valor === false || String(valor) === '0') return 'No';
        return 'Pendiente';
    }

    function nombreArchivo(meta, extension) {
        const base = `repertorio_${texto(meta.hermandad, 'actuacion')}`
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-zA-Z0-9]+/g, '_')
            .replace(/^_+|_+$/g, '')
            .toLowerCase();
        return `${base || 'repertorio'}.${extension}`;
    }

    function crearTexto(meta, marchas) {
        const cabecera = [
            `${texto(meta.tituloDocumento, 'REPERTORIO')} - ${texto(meta.organizacion, 'BANDA DE MÚSICA JULIÁN CERDÁN')}`,
            texto(meta.hermandad),
            `${texto(meta.localidad)} · ${formatearFecha(meta.fecha)}`,
            meta.tipo ? `Tipo: ${meta.tipo}` : '',
            ''
        ].filter((linea, indice) => linea || indice === 4);

        const filas = marchas.map((marcha, indice) => {
            const autor = texto(marcha.autor);
            const fase = texto(marcha.fase);
            return `${String(marcha.orden ?? indice + 1).padStart(2, '0')}. ${texto(marcha.titulo)} - ${autor} [${fase}]`;
        });

        return [...cabecera, ...filas, '', `Total: ${marchas.length} marchas`].join('\n');
    }

    function descargarBlob(contenido, tipo, nombre) {
        const enlace = document.createElement('a');
        const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
        enlace.href = url;
        enlace.download = nombre;
        enlace.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function copiarTexto(meta, marchas) {
        const contenido = crearTexto(meta, marchas);
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(contenido);
            return;
        }
        const area = document.createElement('textarea');
        area.value = contenido;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
    }

    function descargarTexto(meta, marchas) {
        descargarBlob(crearTexto(meta, marchas), 'text/plain;charset=utf-8', nombreArchivo(meta, 'txt'));
    }

    function crearPDF(meta, marchas) {
        const jsPDF = window.jspdf?.jsPDF;
        if (!jsPDF) throw new Error('El generador PDF no está disponible. Recarga la página e inténtalo de nuevo.');

        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const autoTable = typeof doc.autoTable === 'function'
            ? (opciones) => doc.autoTable(opciones)
            : (opciones) => window.jspdfAutoTable?.autoTable(doc, opciones);
        if (!autoTable) throw new Error('No se ha podido preparar la tabla del PDF.');

        const oro = [175, 137, 47];
        const oroSuave = [232, 221, 188];
        const negro = [24, 23, 21];
        const marfil = [250, 248, 241];
        const gris = [92, 89, 82];
        const ancho = 297;
        const alto = 210;

        function dibujarRombo(x, y, radio = 1.6) {
            doc.line(x, y - radio, x + radio, y);
            doc.line(x + radio, y, x, y + radio);
            doc.line(x, y + radio, x - radio, y);
            doc.line(x - radio, y, x, y - radio);
        }

        function dibujarEsquina(x, y, sx, sy) {
            doc.setDrawColor(...oro);
            doc.setLineWidth(0.35);
            doc.line(x, y, x + (8 * sx), y);
            doc.line(x, y, x, y + (8 * sy));
            doc.setLineWidth(0.15);
            doc.line(x + (2 * sx), y + (2 * sy), x + (7 * sx), y + (2 * sy));
            doc.line(x + (2 * sx), y + (2 * sy), x + (2 * sx), y + (7 * sy));
            dibujarRombo(x + (3.7 * sx), y + (3.7 * sy), 0.9);
        }

        function dibujarMotivoMusical() {
            const x1 = 235;
            const x2 = 281;
            const y = 13;
            doc.setDrawColor(113, 89, 29);
            doc.setLineWidth(0.18);
            for (let i = 0; i < 5; i += 1) {
                doc.line(x1, y + (i * 1.65), x2, y + (i * 1.65));
            }
            doc.setFillColor(...oro);
            doc.ellipse(246, 19.2, 1.35, 0.95, 'F');
            doc.line(247.25, 18.8, 247.25, 12.8);
            doc.ellipse(259, 16.1, 1.35, 0.95, 'F');
            doc.line(260.25, 15.7, 260.25, 10.1);
            doc.ellipse(272, 21.8, 1.35, 0.95, 'F');
            doc.line(273.25, 21.4, 273.25, 15.5);
        }

        function dibujarCabeceraPagina() {
            doc.setFillColor(...marfil);
            doc.rect(0, 0, ancho, alto, 'F');

            doc.setDrawColor(...oroSuave);
            doc.setLineWidth(0.25);
            doc.rect(7, 7, ancho - 14, alto - 14);
            doc.setLineWidth(0.12);
            doc.rect(9.2, 9.2, ancho - 18.4, alto - 18.4);

            dibujarEsquina(9.2, 9.2, 1, 1);
            dibujarEsquina(ancho - 9.2, 9.2, -1, 1);
            dibujarEsquina(9.2, alto - 9.2, 1, -1);
            dibujarEsquina(ancho - 9.2, alto - 9.2, -1, -1);

            doc.setFillColor(...negro);
            doc.roundedRect(11, 10.5, ancho - 22, 28.5, 1.5, 1.5, 'F');
            doc.setFillColor(...oro);
            doc.rect(11, 37.2, ancho - 22, 1.8, 'F');

            doc.setTextColor(...oro);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(17);
            doc.text(texto(meta.tituloDocumento, 'REPERTORIO').toUpperCase(), 16, 20);

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.text(texto(meta.organizacion, 'Banda de Música Julián Cerdán'), 16, 27.5);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.8);
            const detalle = `${texto(meta.hermandad)} · ${texto(meta.localidad)} · ${formatearFecha(meta.fecha)}`;
            doc.text(detalle, 16, 34.2);

            if (meta.tipo) {
                doc.setTextColor(...oroSuave);
                doc.setFontSize(7.5);
                doc.text(texto(meta.tipo).toUpperCase(), 281, 34.2, { align: 'right' });
            }

            dibujarMotivoMusical();
        }

        function crearFilasConFases() {
            const filas = [];
            let faseAnterior = null;

            marchas.forEach((marcha, indice) => {
                const fase = texto(marcha.fase);
                if (fase !== faseAnterior) {
                    filas.push([{
                        content: fase.toUpperCase(),
                        colSpan: 6,
                        styles: {
                            fillColor: oroSuave,
                            textColor: [73, 56, 20],
                            fontStyle: 'bold',
                            halign: 'center',
                            fontSize: 8.3,
                            cellPadding: 2.2,
                            lineColor: oro,
                            lineWidth: 0.2
                        }
                    }]);
                    faseAnterior = fase;
                }

                filas.push([
                    texto(marcha.orden ?? indice + 1, String(indice + 1)),
                    texto(marcha.titulo),
                    texto(marcha.autor),
                    fase,
                    formatearCornetas(marcha.cornetas),
                    formatearDuracion(marcha.duracion_seg)
                ]);
            });

            return filas;
        }

        autoTable({
            startY: 46,
            head: [['Nº', 'Marcha', 'Autor', texto(meta.etiquetaFase, 'Fase'), 'Cornetas', 'Duración']],
            body: crearFilasConFases(),
            theme: 'grid',
            margin: { top: 46, left: 14, right: 14, bottom: 18 },
            styles: {
                font: 'helvetica',
                fontSize: 8.3,
                cellPadding: 2.7,
                lineColor: [218, 213, 201],
                lineWidth: 0.13,
                textColor: [38, 37, 34],
                fillColor: [255, 254, 250],
                overflow: 'linebreak',
                valign: 'middle'
            },
            headStyles: {
                fillColor: oro,
                textColor: [18, 17, 15],
                fontStyle: 'bold',
                halign: 'left',
                lineColor: oro,
                lineWidth: 0.2
            },
            alternateRowStyles: { fillColor: [247, 243, 232] },
            columnStyles: {
                0: { cellWidth: 13, halign: 'center' },
                1: { cellWidth: 91, fontStyle: 'bold' },
                2: { cellWidth: 75 },
                3: { cellWidth: 34 },
                4: { cellWidth: 28, halign: 'center' },
                5: { cellWidth: 28, halign: 'center' }
            },
            rowPageBreak: 'avoid',
            showHead: 'everyPage',
            willDrawPage: dibujarCabeceraPagina
        });

        const paginas = doc.getNumberOfPages();
        for (let pagina = 1; pagina <= paginas; pagina += 1) {
            doc.setPage(pagina);

            doc.setDrawColor(...oro);
            doc.setLineWidth(0.25);
            doc.line(14, 194.5, 121, 194.5);
            doc.line(176, 194.5, 283, 194.5);
            dibujarRombo(148.5, 194.5, 1.3);
            doc.setDrawColor(...oroSuave);
            doc.setLineWidth(0.12);
            doc.line(121, 194.5, 144, 194.5);
            doc.line(153, 194.5, 176, 194.5);

            doc.setTextColor(...gris);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7.3);
            doc.text(`Total: ${marchas.length} marchas`, 14, 201.5);
            doc.text(texto(meta.organizacion, 'Banda de Música Julián Cerdán'), 148.5, 201.5, { align: 'center' });
            doc.text(`Página ${pagina} de ${paginas}`, 283, 201.5, { align: 'right' });
        }

        return doc;
    }

    function descargarPDF(meta, marchas) {
        crearPDF(meta, marchas).save(nombreArchivo(meta, 'pdf'));
    }

    window.RepertorioExport = { copiarTexto, crearPDF, crearTexto, descargarPDF, descargarTexto };
}());
