/* ============================================================
   CONFIGURACIÓN DE CREDENCIALES - SUPABASE
   ============================================================ */
const supabaseUrl = 'https://kqbhqdttygoopuqzayja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYmhxZHR0eWdvb3B1cXpheWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTM4ODEsImV4cCI6MjA5MTA2OTg4MX0.5JWKWPoGfMrKJbPholJUKlemlKo1yxDNahAldHx9wEc';

const clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey);

// El Admin necesita estos módulos registrados antes de DOMContentLoaded.
// config.js se ejecuta al final del HTML, mientras el documento aún se está parseando,
// por lo que document.write los inserta en orden antes de que continúe admin.js.
if (document.querySelector('.admin-shell')) {
    document.write('<script src="../js/admin-repertorios.js?v=3"><\/script>');
    document.write('<script src="../js/admin-repertorios-compat.js?v=2"><\/script>');
}

console.log('✅ Motor de Supabase inicializado y listo.');
