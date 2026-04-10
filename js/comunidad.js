/* ============================================================
   COMUNIDAD CON ESTADÍSTICAS Y PERFIL (Jaime Rubiales)
   ============================================================ */

let proyectosRaiz = [];
let idAbierto = null;

async function inicializarComunidad() {
    try {
        // 1. Cargamos el Feed Principal
        const { data, error } = await clienteSupabase
            .from('comunidad_repertorios')
            .select('*')
            .is('respuesta_a_id', null)
            .order('created_at', { ascending: false });

        if (error) throw error;
        proyectosRaiz = data;
        renderizarFeed();

        // 2. Comprobamos sesión para cargar el Sidebar de Usuario
        const { data: { session } } = await clienteSupabase.auth.getSession();
        if (session) {
            cargarDatosSidebar(session.user);
        }
    } catch (err) { console.error("Error:", err); }
}

// --- CARGA DE PERFIL Y ESTADÍSTICAS EN EL SIDEBAR ---
async function cargarDatosSidebar(user) {
    const userEmailPrefix = user.email.split('@')[0];

    // Obtener datos del perfil personalizado
    const { data: perfil } = await clienteSupabase
        .from('perfiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (perfil) {
        document.getElementById('user-name').innerText = perfil.username || userEmailPrefix;
        document.getElementById('user-bio').innerText = perfil.descripcion || "Músico de la familia Julián Cerdán.";
        document.getElementById('user-fav').innerText = perfil.marcha_favorita || "No definida";
        if (perfil.avatar_url) document.getElementById('user-avatar').src = perfil.avatar_url;
    } else {
        document.getElementById('user-name').innerText = userEmailPrefix;
    }

    // CALCULO DE ESTADÍSTICAS EN TIEMPO REAL
    // 1. Proyectos (Propuestas originales)
    const { count: nProyectos } = await clienteSupabase
        .from('comunidad_repertorios')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_nombre', userEmailPrefix)
        .is('respuesta_a_id', null);

    // 2. Mejoras (Propuestas que responden a otras)
    const { count: nMejoras } = await clienteSupabase
        .from('comunidad_repertorios')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_nombre', userEmailPrefix)
        .not('respuesta_a_id', 'is', null);

    // 3. Debates (Número de comentarios realizados)
    const { count: nDebates } = await clienteSupabase
        .from('comunidad_comentarios')
        .select('*', { count: 'exact', head: true })
        .eq('usuario_nombre', userEmailPrefix);

    // Inyectar resultados en el DOM
    document.getElementById('stat-proyectos').innerText = nProyectos || 0;
    document.getElementById('stat-mejoras').innerText = nMejoras || 0;
    document.getElementById('stat-debates').innerText = nDebates || 0;
}

// --- SISTEMA DE INVITACIÓN VISUAL ---
async function obtenerUsuario() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    
    if (!session) {
        document.getElementById('modal-auth-invitation').style.display = 'flex';
        return null;
    }
    return session.user;
}

function cerrarInvitacion() {
    document.getElementById('modal-auth-invitation').style.display = 'none';
}

function renderizarFeed() {
    const contenedor = document.getElementById('feed-contenedor');
    contenedor.innerHTML = '';
    const votosRealizados = JSON.parse(localStorage.getItem('jc_votos_realizados') || "[]");

    proyectosRaiz.forEach(post => {
        const yaVotado = votosRealizados.includes(post.id);
        const card = document.createElement('div');
        card.className = 'post-card';
        
        card.innerHTML = `
            <div class="post-header">
                <div class="autor-info">
                    <strong>${post.usuario_nombre}</strong>
                    <span>${new Date(post.created_at).toLocaleDateString()}</span>
                </div>
                <button class="btn-like ${yaVotado ? 'liked' : ''}" 
                        onclick="darLike('${post.id}', ${post.likes})">
                    ♥ ${post.likes || 0}
                </button>
            </div>
            <h3 style="margin:0 0 10px 0;">${post.proyecto_nombre}</h3>
            <div class="post-stats">
                <div class="stat-item"><span>Obras</span><strong>${post.repertorio_json.length}</strong></div>
                <div class="stat-item"><span>Horas</span><strong>${post.horas_estimadas}h</strong></div>
                <div class="stat-item"><span>Densidad</span><strong>${post.densidad_musical}%</strong></div>
            </div>
            <button class="btn-ver-cruceta" onclick="abrirModal('${post.id}')">Ver Proyecto e Hilo de Mejoras</button>
        `;
        contenedor.appendChild(card);
    });
}

async function abrirModal(id) {
    idAbierto = id;
    const post = proyectosRaiz.find(p => p.id === id);
    if (!post) return;

    document.getElementById('modal-titulo').innerText = post.proyecto_nombre;
    const lista = document.getElementById('modal-lista-marchas');
    lista.innerHTML = `
        <div style="background: rgba(212, 175, 55, 0.1); border: 1px dashed var(--color-oro); padding: 15px; border-radius: 6px; margin-bottom: 20px; font-size: 0.85rem; line-height: 1.4; color: #ccc;">
            <strong style="color:var(--color-oro); display:block; margin-bottom:5px;">NOTAS DEL AUTOR:</strong>
            ${post.descripcion || "Sin descripción proporcionada."}
        </div>
        <h4 style="color:#888; font-size:0.7rem; text-transform:uppercase;">Cruceta Original</h4>
    ` + post.repertorio_json.map((m, i) => `
        <div class="item-marcha">
            <span style="color:var(--color-oro); font-size:0.6rem;">#${i+1} - ${m.calle || 'S/E'}</span>
            <strong>${m.titulo}</strong>
        </div>
    `).join('');

    document.getElementById('btn-mejorar').onclick = async () => {
        const usuario = await obtenerUsuario();
        if (!usuario) return;

        localStorage.setItem('jc_simulacion_borrador', JSON.stringify(post.repertorio_json));
        localStorage.setItem('jc_simulacion_nombre', "Mejora de: " + post.proyecto_nombre);
        localStorage.setItem('jc_simulacion_parent_id', post.id); 
        window.location.href = "simulacion.html";
    };

    cargarHiloMejoras(id);
    cargarComentarios(id);
    document.getElementById('modal-cruceta').style.display = 'flex';
}

async function cargarHiloMejoras(idPadre) {
    const { data } = await clienteSupabase.from('comunidad_repertorios').select('*').eq('respuesta_a_id', idPadre).order('created_at', { ascending: true });
    const seccionComentarios = document.getElementById('contenedor-comentarios');
    
    const viejoHilo = document.getElementById('contenedor-hilo-mejoras');
    if(viejoHilo) viejoHilo.remove();

    const contenedorMejoras = document.createElement('div');
    contenedorMejoras.id = "contenedor-hilo-mejoras";
    contenedorMejoras.innerHTML = `<h4 style="color:#3498db; font-size:0.7rem; text-transform:uppercase; margin-top:20px;">Hilo de Mejoras Propuestas</h4>`;

    if (data && data.length > 0) {
        data.forEach(mejora => {
            contenedorMejoras.innerHTML += `
                <div style="border-left: 2px solid #3498db; margin-left:10px; padding:10px; background:rgba(52, 152, 219, 0.05); margin-bottom:10px; border-radius:0 4px 4px 0;">
                    <div style="font-size:0.65rem; color:#3498db;">Propuesta por ${mejora.usuario_nombre} el ${new Date(mejora.created_at).toLocaleDateString()}</div>
                    <div style="font-size:0.8rem; font-weight:bold; margin:5px 0;">${mejora.proyecto_nombre}</div>
                    <button onclick="verDetalleMejora('${mejora.id}')" style="background:none; border:1px solid #3498db; color:#3498db; font-size:0.6rem; padding:3px 8px; border-radius:3px; cursor:pointer;">Ver esta versión</button>
                </div>`;
        });
    } else {
        contenedorMejoras.innerHTML += `<p style="font-size:0.7rem; color:#444;">Nadie ha propuesto mejoras todavía.</p>`;
    }
    seccionComentarios.parentNode.insertBefore(contenedorMejoras, seccionComentarios);
}

async function verDetalleMejora(idMejora) {
    const { data } = await clienteSupabase.from('comunidad_repertorios').select('*').eq('id', idMejora).single();
    if(data) {
        const lista = document.getElementById('modal-lista-marchas');
        lista.innerHTML = `
            <div style="background: rgba(52, 152, 219, 0.1); border: 1px dashed #3498db; padding: 15px; border-radius: 6px; margin-bottom: 20px; font-size: 0.85rem; line-height: 1.4; color: #ccc;">
                <strong style="color:#3498db; display:block; margin-bottom:5px;">ARGUMENTO DE LA MEJORA:</strong>
                ${data.descripcion || "Sin explicación."}
            </div>` + data.repertorio_json.map((m, i) => `<div class="item-marcha" style="border-left-color:#3498db;"><strong>${m.titulo}</strong></div>`).join('') + 
        `<button onclick="abrirModal('${idAbierto}')" style="width:100%; margin-top:10px; background:#444; color:white; border:none; padding:8px; border-radius:4px; font-size:0.7rem; cursor:pointer; font-weight:bold;">VOLVER A LA ORIGINAL</button>`;
    }
}

async function darLike(id, likesActuales) {
    const usuario = await obtenerUsuario();
    if (!usuario) return;

    let votosRealizados = JSON.parse(localStorage.getItem('jc_votos_realizados') || "[]");
    const yaVotado = votosRealizados.includes(id);
    let nuevoTotal = yaVotado ? Math.max(0, likesActuales - 1) : likesActuales + 1;
    
    try {
        const { error } = await clienteSupabase.from('comunidad_repertorios').update({ likes: nuevoTotal }).eq('id', id);
        if (error) throw error;
        if (yaVotado) votosRealizados = votosRealizados.filter(vId => vId !== id);
        else votosRealizados.push(id);
        localStorage.setItem('jc_votos_realizados', JSON.stringify(votosRealizados));
        inicializarComunidad();
    } catch (err) { console.error(err); }
}

async function enviarComentario() {
    const usuario = await obtenerUsuario();
    if (!usuario) return;

    // Intentamos sacar el nombre del perfil, si no, usamos el email
    const { data: perfil } = await clienteSupabase
        .from('perfiles')
        .select('username')
        .eq('id', usuario.id)
        .maybeSingle();

    const nombreAMostrar = (perfil && perfil.username) ? perfil.username : usuario.email.split('@')[0];

    const input = document.getElementById('input-comentario');
    if (!input.value) return;

    await clienteSupabase.from('comunidad_comentarios').insert([{ 
        repertorio_id: idAbierto, 
        comentario: input.value, 
        usuario_nombre: nombreAMostrar 
    }]);
    
    input.value = '';
    cargarComentarios(idAbierto);
}
async function cargarComentarios(id) {
    const { data } = await clienteSupabase.from('comunidad_comentarios').select('*').eq('repertorio_id', id).order('created_at', { ascending: true });
    const cont = document.getElementById('contenedor-comentarios');
    cont.innerHTML = data.length ? data.map(c => `<div class="comentario-item"><strong>${c.usuario_nombre}:</strong> ${c.comentario}</div>`).join('') : '<p style="font-size:0.7rem; color:#444;">Sin comentarios técnicos aún.</p>';
}

function cerrarModal() { document.getElementById('modal-cruceta').style.display = 'none'; }
window.onload = inicializarComunidad;