/* ============================================================
   LÓGICA DEL HUB - ASOCIACIÓN MUSICAL JULIÁN CERDÁN
   Gestión de Auth, Scroll Inmersivo, Telemetría y DOM
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    // 1. INICIALIZACIÓN GENERAL
    inicializarHub();
    configurarScrollInmersivo();

    // 2. SISTEMA DE AUTENTICACIÓN DINÁMICO
    clienteSupabase.auth.onAuthStateChange((event, session) => {
        actualizarInterfazUsuario(session);
    });

    // Comprobación de sesión al cargar
    clienteSupabase.auth.getSession().then(({ data: { session } }) => {
        actualizarInterfazUsuario(session);
    });
});

/* ------------------------------------------------------------
   MÓDULO 1: ESTADO DE SESIÓN (LOGIN / LOGOUT / ROLES SUPABASE)
------------------------------------------------------------ */

async function actualizarInterfazUsuario(session) {
    const btnLogin = document.getElementById('btn-login-google');
    const btnLogout = document.getElementById('btn-logout');
    const linkAdmin = document.getElementById('link-admin');
    
    if (!btnLogin || !btnLogout) return;

    if (session) {
        // 1. GESTIÓN DE VISIBILIDAD (No borramos el HTML, solo ocultamos/mostramos)
        btnLogin.style.display = 'none';
        btnLogout.style.display = 'flex';

        const correoUsuario = session.user.email;

        try {
            // LECTURA DE PRIVILEGIOS
            const { data, error } = await clienteSupabase
                .from('perfiles')
                .select('rol')
                .eq('email', correoUsuario)
                .single();

            // Si es admin, mostramos el enlace que ya está diseñado en el HTML
            if (data && data.rol === 'admin' && linkAdmin) {
                linkAdmin.style.display = 'block';
            }
        } catch (err) {
            console.error("Fallo al consultar el perfil:", err);
        }

        // Configurar evento de cierre de sesión
        btnLogout.onclick = async () => {
            const { error } = await clienteSupabase.auth.signOut();
            if (error) console.error("Error al cerrar sesión:", error.message);
            window.location.reload();
        };

    } else {
        // ESTADO PÚBLICO: Solo mostramos el botón de Login de Google
        btnLogin.style.display = 'flex';
        if (btnLogout) btnLogout.style.display = 'none';
        if (linkAdmin) linkAdmin.style.display = 'none';
        
        btnLogin.onclick = () => {
            window.location.href = 'templates/login.html';
        };
    }
}

/* ------------------------------------------------------------
   MÓDULO 2: EFECTOS UX Y SCROLL
------------------------------------------------------------ */
function configurarScrollInmersivo() {
    const mainHeader = document.getElementById('cabecera-principal');
    
    // Comportamiento de ocultar cabecera al bajar
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

/* ------------------------------------------------------------
   MÓDULO 3: EXTRACCIÓN DE DATOS (TELEMETRÍA Y TARJETAS)
------------------------------------------------------------ */
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

async function cargarTarjetasProcesiones() {
    try {
        const { data: procesiones, error } = await clienteSupabase
            .from('maestro_procesiones')
            .select('*')
            .eq('estado', 'Finalizada')
            .order('creado_en', { ascending: false });

        if (error) throw error;

        const gridSS = document.getElementById('grid-semana-santa');
        const gridGlorias = document.getElementById('grid-glorias');

        if (!gridSS || !gridGlorias) return;

        // Limpiar grids antes de cargar (por rigor técnico)
        gridSS.innerHTML = '';
        gridGlorias.innerHTML = '';

        procesiones.forEach(p => {
            const tarjetaHTML = crearElementoTarjeta(p);
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

// Diseño de la Tarjeta Individual - SIN DEGRADADO (BANNER SÓLIDO)
function crearElementoTarjeta(p) {
    const foto = p.url_foto || 'img/foto-dashboard.jpg';
    // Formateamos la fecha para que se vea como en tu foto (ej: 4/4/2026)
    const fechaFormateada = new Date(p.creado_en).toLocaleDateString('es-ES');

    return `
        <a href="templates/analisis.html?id=${p.id_procesion}" class="tarjeta-procesion" style="background-image: url('${foto}')">
            <div class="tp-badge-fecha">${fechaFormateada}</div>
            
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
        // Intercambiar botones
        loginBtn.style.display = 'none';
        userZone.style.display = 'flex';
        
        // Consultar la foto real del usuario en la tabla de perfiles
        const { data: perfil } = await clienteSupabase
            .from('perfiles')
            .select('avatar_url')
            .eq('id', session.user.id)
            .maybeSingle();

        // Si el usuario tiene una foto guardada, la ponemos en el cuadrito
        if (perfil && perfil.avatar_url) {
            avatarImg.src = perfil.avatar_url;
        }
    } else {
        loginBtn.style.display = 'flex';
        userZone.style.display = 'none';
    }
}

// Asegúrate de que esta función se ejecute al cargar la página
document.addEventListener('DOMContentLoaded', actualizarAvatarEnHeader);