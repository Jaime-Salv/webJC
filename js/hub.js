/* ============================================================
   HUB PRINCIPAL - PORTADA USUARIO JULIÁN CERDÁN
   Auth, directo activo, última actuación, resumen y carruseles
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    inicializarHub();
    configurarScrollInmersivo();

    clienteSupabase.auth.onAuthStateChange((event, session) => {
        actualizarInterfazUsuarioCompleta(session);
    });

    clienteSupabase.auth.getSession().then(({ data: { session } }) => {
        actualizarInterfazUsuarioCompleta(session);
    });
});

/* ------------------------------------------------------------
   MÓDULO 1: ESTADO DE SESIÓN
------------------------------------------------------------ */

async function actualizarInterfazUsuarioCompleta(session) {
    const btnLogin = document.getElementById('btn-login-google');
    const btnLogout = document.getElementById('btn-logout');
    const linkAdmin = document.getElementById('link-admin');
    const linkAdminFooter = document.getElementById('link-admin-footer');
    const userZone = document.getElementById('user-header-zone');
    const avatarImg = document.getElementById('header-avatar-img');
    const nameLabel = document.getElementById('user-header-name');

    if (!btnLogin || !userZone) {
        return;
    }

    if (session) {
        btnLogin.style.display = 'none';
        userZone.style.display = 'flex';

        try {
            const { data: perfil } = await clienteSupabase
                .from('perfiles')
                .select('rol, username, avatar_url')
                .eq('id', session.user.id)
                .maybeSingle();

            const esAdmin = perfil && perfil.rol === 'admin';

            if (linkAdmin) {
                linkAdmin.style.display = esAdmin ? 'inline-flex' : 'none';
            }

            if (linkAdminFooter) {
                linkAdminFooter.style.display = esAdmin ? 'inline-flex' : 'none';
            }

            if (nameLabel) {
                nameLabel.innerText = perfil?.username || session.user.user_metadata?.full_name || 'Músico';
            }

            if (avatarImg) {
                const fotoPersonalizada = perfil?.avatar_url;
                const fotoGoogle = session.user.user_metadata?.avatar_url;

                if (fotoPersonalizada && fotoPersonalizada.trim() !== '') {
                    avatarImg.src = fotoPersonalizada;
                } else if (fotoGoogle && fotoGoogle.trim() !== '') {
                    avatarImg.src = fotoGoogle;
                } else {
                    avatarImg.src = 'img/escudo.png';
                }
            }

        } catch (err) {
            console.error('Error al cargar datos de usuario:', err);
        }

        if (btnLogout) {
            btnLogout.onclick = async () => {
                await clienteSupabase.auth.signOut();
                window.location.reload();
            };
        }

    } else {
        btnLogin.style.display = 'flex';
        userZone.style.display = 'none';

        if (linkAdmin) {
            linkAdmin.style.display = 'none';
        }

        if (linkAdminFooter) {
            linkAdminFooter.style.display = 'none';
        }

        btnLogin.onclick = () => {
            window.location.href = 'templates/login.html';
        };
    }
}

/* ------------------------------------------------------------
   MÓDULO 2: UX HEADER
------------------------------------------------------------ */

function configurarScrollInmersivo() {
    const mainHeader = document.getElementById('cabecera-principal');

    if (!mainHeader) {
        return;
    }

    let ultimoScroll = window.scrollY;

    window.addEventListener('scroll', () => {
        const scrollActual = window.scrollY;

        if (scrollActual <= 0) {
            mainHeader.classList.remove('oculta');
            ultimoScroll = scrollActual;
            return;
        }

        if (scrollActual > ultimoScroll && scrollActual > 110) {
            mainHeader.classList.add('oculta');
        } else if (scrollActual < ultimoScroll) {
            mainHeader.classList.remove('oculta');
        }

        ultimoScroll = scrollActual;
    });
}

/* ------------------------------------------------------------
   MÓDULO 3: CARGA DE DATOS DE PORTADA
------------------------------------------------------------ */

async function inicializarHub() {
    await Promise.all([
        verificarTelemetriaDirecto(),
        cargarUltimaActuacion(),
        cargarResumenCatalogo(),
        cargarActuacionesRecientes(),
        cargarConciertosHome()
    ]);
}

async function verificarTelemetriaDirecto() {
    const zonaDirecto = document.getElementById('zona-directo');

    if (!zonaDirecto) {
        return;
    }

    try {
        const { data, error } = await clienteSupabase
            .from('maestro_procesiones')
            .select('id_procesion, hermandad, localidad')
            .eq('estado', 'Activa')
            .limit(1);

        if (error) {
            throw error;
        }

        if (data && data.length > 0) {
            const directa = data[0];
            const textoDirecto = document.getElementById('texto-directo');
            const btnAccesoDirecto = document.getElementById('btn-acceso-directo');

            if (textoDirecto) {
                textoDirecto.innerText = `${directa.hermandad} · ${directa.localidad}`;
            }

            if (btnAccesoDirecto) {
                btnAccesoDirecto.href = `templates/live.html?id=${directa.id_procesion}`;
            }

            zonaDirecto.classList.add('activo');
        } else {
            zonaDirecto.classList.remove('activo');
        }

    } catch (error) {
        console.error('Error comprobando directo:', error);
        zonaDirecto.classList.remove('activo');
    }
}

async function cargarUltimaActuacion() {
    const contenedor = document.getElementById('contenedor-ultima-actuacion');

    if (!contenedor) {
        return;
    }

    try {
        const { data, error } = await clienteSupabase
            .from('maestro_procesiones')
            .select('*')
            .eq('estado', 'Finalizada')
            .order('fecha', { ascending: false })
            .limit(1);

        if (error) {
            throw error;
        }

        if (!data || data.length === 0) {
            contenedor.innerHTML = `<div class="empty-state">Todavía no hay actuaciones finalizadas publicadas.</div>`;
            return;
        }

        const actuacion = data[0];

        const [likesRes, comentariosRes, repertorioRes] = await Promise.all([
            clienteSupabase
                .from('valoraciones')
                .select('id_procesion')
                .eq('id_procesion', actuacion.id_procesion),

            clienteSupabase
                .from('procesion_comentarios')
                .select('id_procesion')
                .eq('id_procesion', actuacion.id_procesion),

            clienteSupabase
                .from('repertorio_transaccional')
                .select('id_registro')
                .eq('id_procesion', actuacion.id_procesion)
        ]);

        const likes = likesRes.data ? likesRes.data.length : 0;
        const comentarios = comentariosRes.data ? comentariosRes.data.length : 0;
        const marchas = repertorioRes.data ? repertorioRes.data.length : 0;

        const foto = actuacion.url_foto || 'img/foto-dashboard.jpg';
        const fecha = formatearFecha(actuacion.fecha);

        contenedor.innerHTML = `
            <article class="latest-card">
                <div class="latest-image" style="background-image: url('${escaparAtributo(foto)}');"></div>

                <div class="latest-content">
                    <div class="latest-meta">${escaparHTML(fecha)} · ${escaparHTML(actuacion.tipo || 'Actuación')}</div>
                    <h3>${escaparHTML(actuacion.hermandad || 'Actuación sin título')}</h3>

                    <p style="color:#bbb; line-height:1.65; margin:0 0 18px;">
                        ${escaparHTML(actuacion.localidad || 'Localidad no registrada')}
                    </p>

                    <div class="latest-stats">
                        <span class="stat-pill">🎼 ${marchas} marchas</span>
                        <span class="stat-pill">❤️ ${likes}</span>
                        <span class="stat-pill">💬 ${comentarios}</span>
                    </div>

                    <div class="hero-actions">
                        <a class="btn-primary" href="templates/analisis.html?id=${actuacion.id_procesion}">Ver análisis</a>
                        <a class="btn-secondary" href="#actuaciones">Más actuaciones</a>
                    </div>
                </div>
            </article>
        `;

    } catch (error) {
        console.error('Error cargando última actuación:', error);
        contenedor.innerHTML = `<div class="empty-state">No se ha podido cargar la última actuación.</div>`;
    }
}

async function cargarResumenCatalogo() {
    const totalEl = document.getElementById('resumen-total-marchas');
    const audioEl = document.getElementById('resumen-marchas-audio');
    const enlacesEl = document.getElementById('resumen-marchas-enlaces');

    if (!totalEl || !audioEl || !enlacesEl) {
        return;
    }

    try {
        const { data, error } = await clienteSupabase
            .from('catalogo_marchas')
            .select('url_audio, url_youtube, spotify_uri, url_patrimonio');

        if (error) {
            throw error;
        }

        const marchas = data || [];

        const conAudio = marchas.filter((m) => campoRelleno(m.url_audio)).length;

        const conEnlaceExterno = marchas.filter((m) => {
            return campoRelleno(m.url_youtube) ||
                   campoRelleno(m.spotify_uri) ||
                   campoRelleno(m.url_patrimonio);
        }).length;

        totalEl.innerText = marchas.length;
        audioEl.innerText = conAudio;
        enlacesEl.innerText = conEnlaceExterno;

    } catch (error) {
        console.error('Error cargando resumen del catálogo:', error);
        totalEl.innerText = '--';
        audioEl.innerText = '--';
        enlacesEl.innerText = '--';
    }
}

/* ------------------------------------------------------------
   MÓDULO 4: ACTUACIONES EN CARRUSELES
------------------------------------------------------------ */

async function cargarActuacionesRecientes() {
    const gridSemanaSanta = document.getElementById('grid-semana-santa-home');
    const gridGlorias = document.getElementById('grid-glorias-home');

    if (!gridSemanaSanta || !gridGlorias) {
        return;
    }

    try {
        const { data: procesiones, error } = await clienteSupabase
            .from('maestro_procesiones')
            .select('*')
            .eq('estado', 'Finalizada')
            .order('fecha', { ascending: false });

        if (error) {
            throw error;
        }

        const lista = procesiones || [];

        const semanaSanta = lista.filter((p) => p.tipo === 'Semana Santa');
        const glorias = lista.filter((p) => p.tipo !== 'Semana Santa');

        if (semanaSanta.length === 0) {
            gridSemanaSanta.innerHTML = `<div class="empty-state">Todavía no hay actuaciones de Semana Santa publicadas.</div>`;
        } else {
            gridSemanaSanta.innerHTML = semanaSanta.map((p) => crearTarjetaActuacion(p)).join('');
        }

        if (glorias.length === 0) {
            gridGlorias.innerHTML = `<div class="empty-state">Todavía no hay actuaciones de Glorias o Extraordinarias publicadas.</div>`;
        } else {
            gridGlorias.innerHTML = glorias.map((p) => crearTarjetaActuacion(p)).join('');
        }

    } catch (error) {
        console.error('Error cargando actuaciones recientes:', error);

        gridSemanaSanta.innerHTML = `<div class="empty-state">No se han podido cargar las actuaciones de Semana Santa.</div>`;
        gridGlorias.innerHTML = `<div class="empty-state">No se han podido cargar las actuaciones de Glorias.</div>`;
    }
}

async function cargarConciertosHome() {
    const gridConciertos = document.getElementById('grid-conciertos-home');

    if (!gridConciertos) {
        return;
    }

    try {
        const { data: conciertos, error } = await clienteSupabase
            .from('conciertos')
            .select('*')
            .eq('estado', 'Publicado')
            .order('fecha', { ascending: false });

        if (error) {
            throw error;
        }

        if (!conciertos || conciertos.length === 0) {
            gridConciertos.innerHTML = `<div class="empty-state">Todavía no hay conciertos publicados.</div>`;
            return;
        }

        gridConciertos.innerHTML = conciertos.map((concierto) => crearTarjetaConcierto(concierto)).join('');

    } catch (error) {
        console.error('Error cargando conciertos:', error);
        gridConciertos.innerHTML = `<div class="empty-state">No se han podido cargar los conciertos.</div>`;
    }
}

function crearTarjetaConcierto(concierto) {
    const foto = concierto.cartel_url || 'img/foto-dashboard.jpg';
    const fecha = formatearFecha(concierto.fecha);

    const lugar = [
        concierto.lugar || '',
        concierto.localidad || ''
    ].filter(Boolean).join(' · ');

    return `
        <a href="templates/concierto.html?id=${concierto.id_concierto}" class="tarjeta-procesion-home tarjeta-concierto-home" style="background-image: url('${escaparAtributo(foto)}')">
            <div class="card-date">${escaparHTML(fecha)}</div>
            <div class="card-gradient"></div>

            <div class="card-content">
                <h3>${escaparHTML(concierto.titulo || 'Concierto')}</h3>
                <p>${escaparHTML(lugar || 'Programa de concierto')}</p>
                <span class="tag-concierto">Ver programa</span>
            </div>
        </a>
    `;
}

function crearTarjetaActuacion(procesion) {
    const foto = procesion.url_foto || 'img/foto-dashboard.jpg';
    const fecha = formatearFecha(procesion.fecha);

    return `
        <a href="templates/analisis.html?id=${procesion.id_procesion}" class="tarjeta-procesion-home" style="background-image: url('${escaparAtributo(foto)}')">
            <div class="card-date">${escaparHTML(fecha)}</div>
            <div class="card-gradient"></div>

            <div class="card-content">
                <h3>${escaparHTML(procesion.hermandad || 'Actuación')}</h3>
                <p>${escaparHTML(procesion.localidad || '')} · ${escaparHTML(procesion.tipo || '')}</p>
            </div>
        </a>
    `;
}

/* ------------------------------------------------------------
   UTILIDADES
------------------------------------------------------------ */

function campoRelleno(valor) {
    return valor !== null && valor !== undefined && String(valor).trim() !== '';
}

function formatearFecha(fechaISO) {
    if (!fechaISO) {
        return 'Fecha no disponible';
    }

    try {
        return new Date(fechaISO).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: 'short',
            year: 'numeric'
        });
    } catch (error) {
        return fechaISO;
    }
}

function escaparHTML(valor) {
    if (valor === null || valor === undefined) {
        return '';
    }

    return String(valor)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function escaparAtributo(valor) {
    return escaparHTML(valor).replaceAll('`', '&#096;');
}