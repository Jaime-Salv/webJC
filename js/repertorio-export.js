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

        const oro = [182, 145, 38];
        doc.setFillColor(15, 15, 15);
        doc.rect(0, 0, 297, 36, 'F');
        doc.setTextColor(...oro);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(17);
        doc.text(texto(meta.tituloDocumento, 'REPERTORIO').toUpperCase(), 14, 15);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(10);
        doc.text(texto(meta.organizacion, 'Banda de Música Julián Cerdán'), 14, 23);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`${texto(meta.hermandad)} · ${texto(meta.localidad)} · ${formatearFecha(meta.fecha)}`, 14, 31);

        const filas = marchas.map((marcha, indice) => [
            texto(marcha.orden ?? indice + 1, String(indice + 1)),
            texto(marcha.titulo),
            texto(marcha.autor),
            texto(marcha.fase),
            formatearCornetas(marcha.cornetas),
            formatearDuracion(marcha.duracion_seg)
        ]);

        autoTable({
            startY: 43,
            head: [['Nº', 'Marcha', 'Autor', texto(meta.etiquetaFase, 'Fase'), 'Cornetas', 'Duración']],
            body: filas,
            theme: 'grid',
            margin: { left: 14, right: 14, bottom: 16 },
            styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, lineColor: [218, 218, 218], lineWidth: 0.15, textColor: [35, 35, 35], overflow: 'linebreak', valign: 'middle' },
            headStyles: { fillColor: oro, textColor: [10, 10, 10], fontStyle: 'bold', halign: 'left' },
            alternateRowStyles: { fillColor: [247, 244, 235] },
            columnStyles: {
                0: { cellWidth: 13, halign: 'center' },
                1: { cellWidth: 91, fontStyle: 'bold' },
                2: { cellWidth: 75 },
                3: { cellWidth: 34 },
                4: { cellWidth: 28, halign: 'center' },
                5: { cellWidth: 28, halign: 'center' }
            },
            rowPageBreak: 'avoid'
        });

        const paginas = doc.getNumberOfPages();
        for (let pagina = 1; pagina <= paginas; pagina += 1) {
            doc.setPage(pagina);
            doc.setDrawColor(...oro);
            doc.line(14, 198, 283, 198);
            doc.setTextColor(95, 95, 95);
            doc.setFontSize(7.5);
            doc.text(`Total: ${marchas.length} marchas`, 14, 203);
            doc.text(`Página ${pagina} de ${paginas}`, 283, 203, { align: 'right' });
        }

        return doc;
    }

    function descargarPDF(meta, marchas) {
        crearPDF(meta, marchas).save(nombreArchivo(meta, 'pdf'));
    }

    window.RepertorioExport = { copiarTexto, crearPDF, crearTexto, descargarPDF, descargarTexto };
}());
