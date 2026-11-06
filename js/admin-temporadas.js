/* Gestión de temporadas de actividad, separadas de los repertorios musicales. */
(() => {
  'use strict';
  const db = () => window.clienteSupabase || (typeof clienteSupabase !== 'undefined' ? clienteSupabase : null);
  const e = (s) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let temporadas = [];
  async function cargar() {
    const cliente = db();
    if (!cliente) return;
    const {data,error} = await cliente.from('temporadas_actividad').select('anio,estado,abierta_en,cerrada_en').order('anio',{ascending:false});
    if(error) throw error;
    temporadas=data||[];
    pintar();
  }
  function mensaje(texto,fallo=false) {
    const salida=document.getElementById('temporadas-mensaje');
    if(salida) {salida.textContent=texto;salida.style.color=fallo?'#ff8989':'#a5d6a7';}
  }
  function pintar() {
    const lista=document.getElementById('temporadas-lista');
    if(!lista) return;
    lista.innerHTML=temporadas.map(t=>`
      <div style="padding:15px;border:1px solid #303030;border-radius:10px;margin-bottom:12px;background:#101010;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;">
          <strong style="color:white;font-size:1.1rem;">${t.anio}</strong>
          <span style="color:${t.estado==='Cerrada'?'#d4af37':'#69d799'};">${e(t.estado)}</span>
        </div>
        <p style="color:#aaa;font-size:.76rem;line-height:1.5;margin:9px 0;">Esta temporada de actividad es independiente del repertorio de marchas.</p>
        ${t.estado==='Abierta' ?
          `<button type="button" class="btn-secundario" data-cerrar-anio="${t.anio}">Cerrar temporada ${t.anio}</button>` :
          `<a class="btn-secundario" style="display:inline-block;text-decoration:none;" href="recuerda.html?anio=${t.anio}">Ver Recuerda ${t.anio}</a>`}
      </div>`).join('') || '<p style="color:#aaa;">Todavía no hay temporadas de actividad.</p>';
    const siguiente=Math.max(2027,...temporadas.map(t=>t.anio+1));
    const input=document.getElementById('temporadas-nuevo-anio');
    if(input && !input.value) input.value=String(siguiente);
    lista.querySelectorAll('[data-cerrar-anio]').forEach(b=>b.addEventListener('click',()=>cerrar(Number(b.dataset.cerrarAnio))));
  }
  async function gestionar(anio,accion) {
    const cliente=db();
    const {error}=await cliente.rpc('gestionar_temporada_actividad',{p_anio:anio,p_accion:accion});
    if(error) throw error;
    await cargar();
  }
  async function abrir() {
    const anio=Number(document.getElementById('temporadas-nuevo-anio')?.value);
    if(!Number.isInteger(anio)||anio<2000||anio>2100){mensaje('Introduce un año válido.',true);return;}
    if(!confirm(`¿Abrir la temporada de actividad ${anio}? Esto NO activará su repertorio musical ni archivará otros años.`))return;
    try {await gestionar(anio,'abrir');mensaje(`Temporada ${anio} abierta. El repertorio se puede activar más adelante.`);}
    catch(err){mensaje(err.message,true);}
  }
  async function cerrar(anio) {
    if(!confirm(`¿Cerrar la temporada de actividad ${anio}? Se publicará en «Recuerda ${anio}». No activará el repertorio del año siguiente. Antes deben estar cerradas todas las actuaciones.`))return;
    const confirmacion=prompt(`Para confirmar el cierre, escribe exactamente CERRAR ${anio}:`);
    if(confirmacion!==`CERRAR ${anio}`){mensaje('Cierre cancelado.');return;}
    try{await gestionar(anio,'cerrar');mensaje(`Temporada ${anio} cerrada. Ya aparece en Recuerda ${anio}.`);}
    catch(err){mensaje(err.message,true);}
  }
  function iniciar() {
    const nav=document.querySelector('.admin-nav');
    const area=document.querySelector('.admin-content');
    if(!nav||!area||document.querySelector('[data-admin-target="temporadas"]'))return;
    const boton=document.createElement('button');
    boton.type='button';boton.className='admin-nav-button';
    boton.dataset.adminTarget='temporadas';
    boton.innerHTML='<span class="admin-nav-icon">◷</span>Temporadas';
    const ref=nav.querySelector('[data-admin-target="repertorios"]');
    nav.insertBefore(boton,ref||null);
    const vista=document.createElement('section');
    vista.className='admin-view';vista.dataset.adminView='temporadas';
    vista.innerHTML=`
      <div class="admin-view-header"><div><span>Archivo histórico</span><h1>Temporadas</h1></div>
        <p>Cierra los años terminados y abre otros nuevos sin necesidad de tener aprobado el repertorio musical.</p></div>
      <div class="admin-module-grid">
        <div class="card-admin"><h3>Temporadas de actividad</h3><div id="temporadas-lista"></div></div>
        <div class="card-admin"><h3>Abrir otro año</h3>
          <p style="color:#aaa;font-size:.8rem;line-height:1.6;">Puedes abrir 2027 aunque el repertorio de 2026 siga activo. El repertorio musical de 2027 permanecerá en borrador hasta que lo publiques en Administración → Repertorio.</p>
          <label for="temporadas-nuevo-anio">Año</label>
          <input class="input-admin" type="number" min="2000" max="2100" id="temporadas-nuevo-anio" placeholder="2027">
          <button class="btn-send" type="button" id="temporadas-abrir">Abrir temporada de actividad</button>
          <p id="temporadas-mensaje" role="status" style="font-size:.8rem;margin-top:16px;color:#aaa;"></p>
          <hr style="border:0;border-top:1px solid #333;margin:20px 0;">
          <p style="color:#aaa;font-size:.75rem;line-height:1.6;">Cerrar una temporada publica su archivo histórico; abrir un año no cambia ninguna marcha ni su numeración. Las actuaciones seguirán vinculadas por la fecha en que tuvieron lugar.</p>
        </div>
      </div>`;
    area.appendChild(vista);
    boton.addEventListener('click',()=>{
      if(typeof window.mostrarVistaAdmin==='function')window.mostrarVistaAdmin('temporadas');
      else {
        document.querySelectorAll('[data-admin-view]').forEach(v=>v.classList.remove('activa'));
        vista.classList.add('activa');
      }
      cargar().catch(err=>mensaje(err.message,true));
    });
    document.getElementById('temporadas-abrir').addEventListener('click',abrir);
    cargar().catch(err=>mensaje(err.message,true));
  }
  document.addEventListener('admin:ready',iniciar,{once:true});
})();