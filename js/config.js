/* ============================================================
   CONFIGURACIÓN DE CREDENCIALES - SUPABASE
   ============================================================ */
const supabaseUrl = 'https://kqbhqdttygoopuqzayja.supabase.co'; 
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtxYmhxZHR0eWdvb3B1cXpheWphIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU0OTM4ODEsImV4cCI6MjA5MTA2OTg4MX0.5JWKWPoGfMrKJbPholJUKlemlKo1yxDNahAldHx9wEc';

const clienteSupabase = supabase.createClient(supabaseUrl, supabaseKey);

console.log("✅ Motor de Supabase inicializado y listo.");