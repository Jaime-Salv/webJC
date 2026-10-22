const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
function montar({ aceptar = true, online = true, data = [{ orden: 2 }], error = null } = {}) {
    const filtros = [], mensajes = [];
    let borrados = 0, recargas = 0;
    const contexto = vm.createContext({
        document: { addEventListener() {}, dispatchEvent() {} }, window: {},
        navigator: { onLine: online }, confirm: () => aceptar,
        CustomEvent: class {},
        clienteSupabase: { from(tabla) {
            assert.equal(tabla, 'repertorio_transaccional');
            return { delete() { borrados++; return this; }, eq(k,v) { filtros.push([k,v]); return this; }, async select() { return { data, error }; } };
        } }
    });
    vm.runInContext(fs.readFileSync('js/admin.js', 'utf8'), contexto);
    contexto.actualizarEstadoInyeccion = (m) => mensajes.push(m);
    contexto.limpiarFormularioMarcha = () => {};
    contexto.establecerGuardadoDirecto = () => {};
    contexto.cargarHistorialTransaccional = async () => { recargas++; };
    vm.runInContext("procesionActiva = {id_procesion: 123}; historialDirectoCache = [{orden: 2, id_marcha: 20, titulo: 'Marcha'}]", contexto);
    return { contexto, filtros, mensajes, contar: () => ({ borrados, recargas }) };
}
test('elimina solo la entrada elegida de la actuación y actualiza el historial', async () => {
    const m = montar(); await vm.runInContext('eliminarMarchaDirecto(2)', m.contexto);
    assert.deepEqual(m.filtros, [['id_procesion',123],['orden',2],['id_marcha',20]]);
    assert.deepEqual(m.contar(), { borrados: 1, recargas: 1 });
});
test('cancelar y estar sin conexión no borran ninguna entrada', async () => {
    for (const opciones of [{ aceptar: false }, { online: false }]) {
        const m = montar(opciones); await vm.runInContext('eliminarMarchaDirecto(2)', m.contexto);
        assert.equal(m.contar().borrados, 0);
    }
});
test('un borrado sin permisos o sin filas afectadas no muestra éxito', async () => {
    for (const opciones of [{ data: [] }, { error: { message: 'Permiso denegado' } }]) {
        const m = montar(opciones); await vm.runInContext('eliminarMarchaDirecto(2)', m.contexto);
        assert.equal(m.contar().recargas, 0);
        assert.match(m.mensajes.at(-1), /No se ha podido eliminar/);
    }
});
