/* ============================================================
   UTILIDADES COMUNES - WEB JULIÁN CERDÁN
   ============================================================ */

async function obtenerSesionActual() {
    const { data, error } = await clienteSupabase.auth.getSession();

    if (error) {
        console.error('Error obteniendo sesión:', error);
        return null;
    }

    return data.session;
}

async function obtenerPerfilActual() {
    const session = await obtenerSesionActual();

    if (!session) {
        return null;
    }

    const { data, error } = await clienteSupabase
        .from('perfiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle();

    if (error) {
        console.error('Error obteniendo perfil:', error);
        return null;
    }

    return data;
}

async function usuarioEsAdmin() {
    const perfil = await obtenerPerfilActual();

    if (!perfil) {
        return false;
    }

    return perfil.rol === 'admin';
}

async function exigirLogin(urlDestino = './login.html') {
    const session = await obtenerSesionActual();

    if (!session) {
        window.location.href = urlDestino;
        return null;
    }

    return session;
}

async function exigirAdmin(urlDestino = '../index.html') {
    const esAdmin = await usuarioEsAdmin();

    if (!esAdmin) {
        window.location.href = urlDestino;
        return false;
    }

    return true;
}

function textoSeguro(valor) {
    if (valor === null || valor === undefined) {
        return '';
    }

    return String(valor);
}

function escaparHTML(valor) {
    return textoSeguro(valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}