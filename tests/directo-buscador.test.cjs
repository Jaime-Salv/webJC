const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function montarBuscador() {
    const mapa = [
        { id_marcha: 20, numero_repertorio: 27, catalogo_marchas: { titulo: '¡Caridad Soberana!' } },
        { id_marcha: 21, numero_repertorio: 54, catalogo_marchas: { titulo: 'Ángeles del Cielo' } }
    ];
    const controles = Object.fromEntries(['inp-buscar-marcha', 'inp-id-marcha', 'inp-titulo-marcha'].map((id) =>
        [id, { value: '', dataset: {}, readOnly: false, dispatchEvent() {} }]));
    controles['sugerencias-marchas'] = { hidden: true };
    const contexto = {
        document: { getElementById: (id) => controles[id], addEventListener() {} },
        localStorage: { getItem: () => JSON.stringify({ marchas: mapa }) },
        window: {}, Event, catalogoCache: []
    };
    vm.runInNewContext(fs.readFileSync('js/admin-buscador-directo.js', 'utf8'), contexto);
    return { controles, window: contexto.window };
}

test('resuelve un número anual escrito con ceros iniciales', () => {
    const { controles, window } = montarBuscador();
    controles['inp-buscar-marcha'].value = '027';
    window.sincronizarEntradaDirecto();
    assert.equal(controles['inp-id-marcha'].value, '27');
    assert.equal(controles['inp-titulo-marcha'].value, '¡Caridad Soberana!');
});

test('reconoce el título acentuado de una marcha del repertorio', () => {
    const { controles, window } = montarBuscador();
    controles['inp-buscar-marcha'].value = 'Angeles del Cielo';
    window.sincronizarEntradaDirecto();
    assert.equal(controles['inp-id-marcha'].value, '54');
    assert.equal(controles['inp-titulo-marcha'].value, 'Ángeles del Cielo');
});

test('acepta una marcha nueva sin inventar un número ni un ID', () => {
    const { controles, window } = montarBuscador();
    controles['inp-buscar-marcha'].value = 'Marcha fuera del repertorio';
    window.sincronizarEntradaDirecto();
    assert.equal(controles['inp-id-marcha'].value, '');
    assert.equal(controles['inp-titulo-marcha'].value, 'Marcha fuera del repertorio');
});

test('conserva el número elegido desde las sugerencias', () => {
    const { controles, window } = montarBuscador();
    controles['inp-buscar-marcha'].value = '¡Caridad Soberana!';
    controles['inp-buscar-marcha'].dataset.numero = '27';
    window.sincronizarEntradaDirecto();
    assert.equal(controles['inp-id-marcha'].value, '27');
    window.limpiarEntradaDirecto();
    assert.equal(controles['inp-buscar-marcha'].value, '');
});
