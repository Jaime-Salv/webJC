/* ============================================================
   LÓGICA DE PERFIL VINCULADA A BASE DE DATOS (Jaime Rubiales)
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    cargarDatosPerfil();

    // Listener para previsualizar la imagen antes de subirla
    document.getElementById('input-avatar').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('avatar-preview').src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    });
});

async function cargarDatosPerfil() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (!session) return window.location.href = "login.html";

    const user = session.user;

    // Obtener datos actuales del perfil
    const { data: perfil, error } = await clienteSupabase
        .from('perfiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();

    if (perfil) {
        document.getElementById('perf-nombre').value = perfil.username || "";
        document.getElementById('perf-bio').value = perfil.descripcion || "";
        document.getElementById('perf-marcha').value = perfil.marcha_favorita || "";
        if (perfil.avatar_url) {
            document.getElementById('avatar-preview').src = perfil.avatar_url;
        }
    }
}

async function guardarPerfil() {
    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (!session) return;
    
    const user = session.user;
    const btn = document.querySelector('.btn-accion');
    const inputArchivo = document.getElementById('input-avatar').files[0];
    
    try {
        btn.innerText = "GUARDANDO...";
        btn.disabled = true;

        let url_avatar = document.getElementById('avatar-preview').src;

        // 1. GESTIÓN DE SUBIDA DE IMAGEN (Si hay archivo nuevo)
        if (inputArchivo) {
            const fileExt = inputArchivo.name.split('.').pop();
            const fileName = `${user.id}_${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await clienteSupabase.storage
                .from('avatars')
                .upload(filePath, inputArchivo);

            if (uploadError) throw uploadError;

            const { data: urlData } = clienteSupabase.storage
                .from('avatars')
                .getPublicUrl(filePath);
            
            url_avatar = urlData.publicUrl;
        }

        // 2. ACTUALIZACIÓN DE DATOS EN TABLA 'PERFILES'
        const updates = {
            id: user.id,
            username: document.getElementById('perf-nombre').value.trim(),
            descripcion: document.getElementById('perf-bio').value.trim(),
            marcha_favorita: document.getElementById('perf-marcha').value.trim(),
            avatar_url: url_avatar,
            updated_at: new Date()
        };

        const { error: upsertError } = await clienteSupabase
            .from('perfiles')
            .upsert(updates);

        if (upsertError) throw upsertError;

        alert("✅ Perfil actualizado correctamente.");
        window.location.href = "comunidad.html";

    } catch (e) {
        alert("❌ Error al guardar: " + e.message);
    } finally {
        btn.innerText = "GUARDAR CAMBIOS";
        btn.disabled = false;
    }
}