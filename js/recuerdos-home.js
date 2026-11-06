document.addEventListener('DOMContentLoaded', async () => {
  const seccion=document.getElementById('recuerdos-home');
  const lista=document.getElementById('recuerdos-home-lista');
  if(!seccion||!lista||typeof clienteSupabase==='undefined')return;
  try {
    const {data,error}=await clienteSupabase.from('temporadas_actividad')
      .select('anio').eq('estado','Cerrada').order('anio',{ascending:false});
    if(error)throw error;
    if(!data?.length)return;
    lista.innerHTML=data.map(t=>`<a href="templates/recuerda.html?anio=${encodeURIComponent(t.anio)}"
      style="display:flex;align-items:center;justify-content:space-between;text-decoration:none;border:1px solid rgba(212,175,55,.35);border-radius:12px;padding:22px 18px;background:#101010;color:#d4af37;font-weight:800;">
      <span>Recuerda ${t.anio}</span><span aria-hidden="true">→</span></a>`).join('');
    seccion.hidden=false;
  } catch(error) {console.error('No se pudo cargar el archivo histórico:',error);}
});