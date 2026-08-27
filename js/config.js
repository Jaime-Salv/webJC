/* ============================================================
   CONFIGURACIÓN DE CREDENCIALES - SUPABASE
   ============================================================ */
const supabaseUrl = 'https://kqbhqdttygoopuqzayja.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImtxYmhxZHR0eWdvb3B1cXpheWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTM4ODEsImV4cCI6MjA5MTA2OTg4MX0.5JWKWPoGfMrKJbPholJUKlemlKo1yxDNahAldHx9wEc';

const clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey);

if (/\/admin\.html$/i.test(window.location.pathname)) {
    const scriptRepertorios = document.createElement('script');
    scriptRepertorios.src = '../js/admin-repertorios.js?v=2';
    scriptRepertorios.defer = true;
    scriptRepertorios.addEventListener('load', () => {
        const scriptCompat = document.createElement('script');
        scriptCompat.src = '../js/admin-repertorios-compat.js?v=1';
        scriptCompat.defer = true;
        document.head.appendChild(scriptCompat);
    });
    document.head.appendChild(scriptRepertorios);
}

console.log('✅ Motor de Supabase inicializado y listo.');
