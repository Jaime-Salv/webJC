const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function montarCola(yaExiste) {
    const inserts = [];
    const contexto = vm.createContext({
        document: { addEventListener() {} },
        window: {},
        clienteSupabase: {
            from(tabla) {
                assert.equal(tabla, 'repertorio_transaccional');
                return {
                    select() { return this; },
                    eq() { return this; },
                    async maybeSingle() { return { data: yaExiste ? { id_registro: 9 } : null, error: null }; },
                    async insert(registros) { inserts.push(...registros); return { error: null }; }
                };
            }
        }
    });
    vm.runInContext(fs.readFileSync('js/admin.js', 'utf8'), contexto);
    vm.runInContext("catalogoCache = [{ id_marcha: 20, titulo: '¡Caridad Soberana!' }]", contexto);
    return { contexto, inserts };
}

const pendiente = { idProcesion: 123, idIntroducido: 20, idLocal: 'movil-prueba-1', titulo: '¡Caridad Soberana!', fase: 'Ida', numeroRepertorio: 27 };

test('el reintento reconoce una marcha que llegó al servidor sin respuesta al móvil', async () => {
    const { contexto, inserts } = montarCola(true);
    await vm.runInContext(`insertarMarchaPendiente(${JSON.stringify(pendiente)})`, contexto);
    assert.equal(inserts.length, 0);
});

test('una marcha pendiente conserva su identificador y su número anual al enviarse', async () => {
    const { contexto, inserts } = montarCola(false);
    await vm.runInContext(`insertarMarchaPendiente(${JSON.stringify(pendiente)})`, contexto);
    assert.equal(inserts.length, 1);
    assert.equal(inserts[0].id_operacion_cliente, pendiente.idLocal);
    assert.equal(inserts[0].numero_repertorio, 27);
    assert.equal(inserts[0].id_marcha, 20);
});

test('una marcha nueva guarda el autor al sincronizar una entrada manual pendiente', async () => {
    const { contexto, inserts } = montarCola(false);
    let creada;
    contexto.clienteSupabase.from = (tabla) => ({
        select() { return this; }, eq() { return this; }, limit() { return this; },
        async maybeSingle() { return { data: null, error: null }; },
        insert(registros) {
            if (tabla === 'catalogo_marchas') { creada = registros[0]; return this; }
            inserts.push(...registros); return Promise.resolve({ error: null });
        },
        async single() { return { data: { ...creada, id_marcha: 99 }, error: null }; }
    });
    await vm.runInContext(`insertarMarchaPendiente(${JSON.stringify({ ...pendiente, idIntroducido: null, titulo: 'Marcha nueva', autor: 'José Pérez' })})`, contexto);
    assert.equal(creada.autor, 'José Pérez');
    assert.equal(inserts[0].id_marcha, 99);
});
