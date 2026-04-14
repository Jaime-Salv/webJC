/* ============================================================
   LÓGICA DEL HUB - ASOCIACIÓN MUSICAL JULIÁN CERDÁN
   Gestión de Auth, Scroll Inmersivo, Telemetría y DOM
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    inicializarHub();
    configurarScrollInmersivo();

    clienteSupabase.auth.onAuthStateChange((event, session) => {
        actualizarInterfazUsuario(session);
    });

    clienteSupabase.auth.getSession().then(({ data: { session } }) => {
        actualizarInterfazUsuario(session);
    });
});

async function actualizarInterfazUsuario(session) {
    const btnLogin = document.getElementById('btn-login-google');
    const btnLogout = document.getElementById('btn-logout');
    const linkAdmin = document.getElementById('link-admin');
    
    if (!btnLogin || !btnLogout) return;

    if (session) {
        btnLogin.style.display = 'none';
        btnLogout.style.display = 'flex';

        try {
            const { data } = await clienteSupabase
                .from('perfiles')
                .select('rol')
                .eq('id', session.user.id)
                .maybeSingle();

            if (data && data.rol === 'admin' && linkAdmin) {
                linkAdmin.style.display = 'block';
            }
        } catch (err) {
            console.error("Fallo al consultar el perfil:", err);
        }

        btnLogout.onclick = async () => {
            await clienteSupabase.auth.signOut();
            window.location.reload();
        };

    } else {
        btnLogin.style.display = 'flex';
        if (btnLogout) btnLogout.style.display = 'none';
        if (linkAdmin) linkAdmin.style.display = 'none';
        
        btnLogin.onclick = () => {
            window.location.href = 'templates/login.html';
        };
    }
}

function configurarScrollInmersivo() {
    const mainHeader = document.getElementById('cabecera-principal');
    let ultimoScroll = window.scrollY;
    
    window.addEventListener('scroll', () => {
        let scrollActual = window.scrollY;
        if (scrollActual <= 0) {
            mainHeader.classList.remove('oculta');
            return;
        }
        if (scrollActual > ultimoScroll && scrollActual > 100) {
            mainHeader.classList.add('oculta');
        } else if (scrollActual < ultimoScroll) {
            mainHeader.classList.remove('oculta');
        }
        ultimoScroll = scrollActual;
    });
}

async function inicializarHub() {
    await verificarTelemetriaDirecto();
    await cargarTarjetasProcesiones();
}

async function verificarTelemetriaDirecto() {
    const zonaDirecto = document.getElementById('zona-directo');
    if (!zonaDirecto) return;

    try {
        const { data, error } = await clienteSupabase
            .from('maestro_procesiones')
            .select('id_procesion, hermandad, localidad')
            .eq('estado', 'Activa')
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            document.getElementById('texto-directo').innerText = `${data[0].hermandad} (${data[0].localidad})`;
            document.getElementById('btn-acceso-directo').href = `templates/live.html?id=${data[0].id_procesion}`;
            zonaDirecto.style.display = 'flex';
        } else {
            zonaDirecto.style.display = 'none';
        }
    } catch (e) {
        console.error("Error telemetría:", e);
    }
}

/* ------------------------------------------------------------
   CARGA DE TARJETAS (CORREGIDA PARA EVITAR ERROR 400)
------------------------------------------------------------ */
async function cargarTarjetasProcesiones() {
    try {
        // 1. CARGA BASE: Obtenemos solo las procesiones para evitar errores de relación
        const { data: procesiones, error: errorProc } = await clienteSupabase
            .from('maestro_procesiones')
            .select('*')
            .eq('estado', 'Finalizada')
            .order('fecha', { ascending: false }); // Usamos tu fecha manual

        if (errorProc) throw errorProc;

        // 2. CARGA DE ESTADÍSTICAS: Obtenemos todos los likes y comentarios para cruzar datos manualmente
        // Esto evita el Error 400 por falta de Foreign Keys configuradas en la DB.
        const [likesRes, comentariosRes] = await Promise.all([
            clienteSupabase.from('valoraciones').select('id_procesion'),
            clienteSupabase.from('procesion_comentarios').select('id_procesion')
        ]);

        const totalLikes = likesRes.data || [];
        const totalComentarios = comentariosRes.data || [];

        const gridSS = document.getElementById('grid-semana-santa');
        const gridGlorias = document.getElementById('grid-glorias');

        if (!gridSS || !gridGlorias) return;

        gridSS.innerHTML = '';
        gridGlorias.innerHTML = '';

        procesiones.forEach(p => {
            // Calculamos los conteos filtrando los arrays en memoria (muy rápido y seguro)
            const numLikes = totalLikes.filter(l => l.id_procesion === p.id_procesion).length;
            const numComentarios = totalComentarios.filter(c => c.id_procesion === p.id_procesion).length;

            const tarjetaHTML = crearElementoTarjeta(p, numLikes, numComentarios);
            
            if (p.tipo === 'Semana Santa') {
                gridSS.insertAdjacentHTML('beforeend', tarjetaHTML);
            } else {
                gridGlorias.insertAdjacentHTML('beforeend', tarjetaHTML);
            }
        });

    } catch (e) {
        console.error("Error cargando tarjetas:", e);
    }
}

function crearElementoTarjeta(p, likes, comentarios) {
    const foto = p.url_foto || 'img/foto-dashboard.jpg';
    
    // USAMOS EL CAMPO 'fecha' (rellenado a mano)
    const fechaManual = p.fecha ? new Date(p.fecha).toLocaleDateString('es-ES') : 'Fecha N/A';

    return `
        <a href="templates/analisis.html?id=${p.id_procesion}" class="tarjeta-procesion" style="background-image: url('${foto}')">
            <div class="tp-badge-fecha">${fechaManual}</div>
            
            <div class="tp-stats-badge">
                <div class="tp-stat-item">❤️ ${likes}</div>
                <div class="tp-stat-item">💬 ${comentarios}</div>
            </div>
            
            <div class="tp-gradiente-inmersivo">
                <div class="tp-content-text">
                    <div class="tp-titulo-bmm">${p.hermandad}</div>
                    <div class="tp-subtitulo-bmm">${p.localidad}</div>
                </div>
            </div>
        </a>
    `;
}

async function actualizarAvatarEnHeader() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    const userZone = document.getElementById('user-header-zone');
    const loginBtn = document.getElementById('btn-login-google');
    const avatarImg = document.getElementById('header-avatar-img');

    if (session) {
        loginBtn.style.display = 'none';
        userZone.style.display = 'flex';
        
        const { data: perfil } = await clienteSupabase
            .from('perfiles')
            .select('avatar_url')
            .eq('id', session.user.id)
            .maybeSingle();

        if (perfil && perfil.avatar_url) {
            avatarImg.src = perfil.avatar_url;
        }
    } else {
        loginBtn.style.display = 'flex';
        userZone.style.display = 'none';
    }
}

document.addEventListener('DOMContentLoaded', actualizarAvatarEnHeader);