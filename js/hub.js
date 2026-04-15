/* ============================================================
   LÓGICA DEL HUB - ASOCIACIÓN MUSICAL JULIÁN CERDÁN
   Gestión de Auth, Scroll Inmersivo, Telemetría y DOM
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    inicializarHub();
    configurarScrollInmersivo();

    // SISTEMA DE AUTENTICACIÓN DINÁMICO
    clienteSupabase.auth.onAuthStateChange((event, session) => {
        actualizarInterfazUsuarioCompleta(session);
    });

    clienteSupabase.auth.getSession().then(({ data: { session } }) => {
        actualizarInterfazUsuarioCompleta(session);
    });
});

/* ------------------------------------------------------------
   MÓDULO 1: ESTADO DE SESIÓN (LOGIN / LOGOUT / DATOS PERFIL)
------------------------------------------------------------ */

async function actualizarInterfazUsuarioCompleta(session) {
    const btnLogin = document.getElementById('btn-login-google');
    const btnLogout = document.getElementById('btn-logout');
    const linkAdmin = document.getElementById('link-admin');
    const userZone = document.getElementById('user-header-zone');
    const avatarImg = document.getElementById('header-avatar-img');
    const nameLabel = document.getElementById('user-header-name');
    
    if (!btnLogin || !btnLogout) return;

    if (session) {
        btnLogin.style.display = 'none';
        userZone.style.display = 'flex';

        // CARGA DE DATOS DESDE TABLA 'perfiles'
        try {
            const { data: perfil } = await clienteSupabase
                .from('perfiles')
                // CAMBIO APLICADO: 'nombre' cambiado a 'username'
                .select('rol, username, avatar_url')
                .eq('id', session.user.id)
                .maybeSingle();

            // 1. Mostrar ADMIN si corresponde
            if (perfil && perfil.rol === 'admin' && linkAdmin) {
                linkAdmin.style.display = 'block';
            }

            // 2. Cargar Nombre (elegido por él o predeterminado de Google)
            if (nameLabel) {
                // CAMBIO APLICADO: 'perfil?.nombre' cambiado a 'perfil?.username'
                nameLabel.innerText = perfil?.username || session.user.user_metadata.full_name || 'Músico';
            }

           // 3. Cargar Avatar (Prioridad: Personalizada > Google > Predeterminada)
            if (avatarImg) {
                const fotoPersonalizada = perfil?.avatar_url;
                const fotoGoogle = session.user.user_metadata?.avatar_url;

                if (fotoPersonalizada && fotoPersonalizada.trim() !== '') {
                    // 1º Prioridad: La foto que el usuario subió a la base de datos
                    avatarImg.src = fotoPersonalizada;
                } else if (fotoGoogle && fotoGoogle.trim() !== '') {
                    // 2º Prioridad: La foto de su cuenta de Google
                    avatarImg.src = fotoGoogle;
                } else {
                    // 3º Prioridad: Escudo por defecto
                    avatarImg.src = 'img/escudo.png';
                }
            }
            
        } catch (err) {
            console.error("Error al cargar datos de usuario:", err);
        }

        // Configurar Logout
        btnLogout.onclick = async () => {
            await clienteSupabase.auth.signOut();
            window.location.reload();
        };

    } else {
        // ESTADO PÚBLICO
        btnLogin.style.display = 'flex';
        if (userZone) userZone.style.display = 'none';
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
    let ultimoScroll = window.scrollY;
    
    window.addEventListener('scroll', () => {
        let scrollActual = window.scrollY;
        if (scrollActual <= 0) { mainHeader.classList.remove('oculta'); return; }
        if (scrollActual > ultimoScroll && scrollActual > 100) { mainHeader.classList.add('oculta'); } 
        else if (scrollActual < ultimoScroll) { mainHeader.classList.remove('oculta'); }
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
        const { data } = await clienteSupabase
            .from('maestro_procesiones')
            .select('id_procesion, hermandad, localidad')
            .eq('estado', 'Activa')
            .limit(1);

        if (data && data.length > 0) {
            document.getElementById('texto-directo').innerText = `${data[0].hermandad} (${data[0].localidad})`;
            document.getElementById('btn-acceso-directo').href = `templates/live.html?id=${data[0].id_procesion}`;
            zonaDirecto.style.display = 'flex';
        } else {
            zonaDirecto.style.display = 'none';
        }
    } catch (e) { console.error("Error telemetría:", e); }
}

async function cargarTarjetasProcesiones() {
    try {
        const { data: procesiones, error: errorProc } = await clienteSupabase
            .from('maestro_procesiones')
            .select('*')
            .eq('estado', 'Finalizada')
            .order('fecha', { ascending: false });

        if (errorProc) throw errorProc;

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
            const numLikes = totalLikes.filter(l => l.id_procesion === p.id_procesion).length;
            const numComentarios = totalComentarios.filter(c => c.id_procesion === p.id_procesion).length;
            const tarjetaHTML = crearElementoTarjeta(p, numLikes, numComentarios);
            if (p.tipo === 'Semana Santa') gridSS.insertAdjacentHTML('beforeend', tarjetaHTML);
            else gridGlorias.insertAdjacentHTML('beforeend', tarjetaHTML);
        });
    } catch (e) { console.error("Error cargando tarjetas:", e); }
}

function crearElementoTarjeta(p, likes, comentarios) {
    const foto = p.url_foto || 'img/foto-dashboard.jpg';
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