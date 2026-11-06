(() => {
  'use strict';
  const db=clienteSupabase;
  const el=(id)=>document.getElementById(id);
  const safe=(s)=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const anio=Number(new URLSearchParams(location.search).get('anio'));
  const fmt=(date)=>date?new Date(date+'T12:00:00').toLocaleDateString('es-ES',{day:'numeric',month:'long',year:'numeric'}):'Fecha desconocida';
  const sortCount=(map)=>[...map.entries()].sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'es'));
  const add=(map,key,n=1)=>map.set(key,(map.get(key)||0)+n);
  const listaRanking=(values,what)=>values.length?`<table class="rec-table"><thead><tr><th>${what}</th><th>Interpretaciones</th></tr></thead><tbody>${values.slice(0,12).map(([name,n])=>`<tr><td>${safe(name)}</td><td>${n}</td></tr>`).join('')}</tbody></table>`:'<p class="rec-muted">No hay interpretaciones registradas.</p>';
  function stat(n,label){return `<div class="rec-stat"><strong>${safe(n)}</strong><span>${safe(label)}</span></div>`;}
  async function cargar(){
    if(!Number.isInteger(anio)||anio<2000||anio>2100)throw Error('Indica un año válido.');
    el('rec-title').textContent='Recuerda '+anio;
    document.title='Recuerda '+anio+' · Julián Cerdán';
    const season=await db.from('temporadas_actividad').select('estado').eq('anio',anio).maybeSingle();
    if(season.error)throw season.error;
    if(season.data?.estado!=='Cerrada')throw Error('El archivo de esta temporada todavía no se ha publicado.');
    el('rec-status').textContent='Temporada cerrada · Archivo disponible';
    const start=anio+'-01-01',end=(anio+1)+'-01-01';
    const [proc,conc,rep]=await Promise.all([
      db.from('maestro_procesiones').select('id_procesion,concierto_id,tipo,fecha,hermandad,localidad,estado,hora,fin_hora,url_foto').gte('fecha',start).lt('fecha',end).eq('estado','Finalizada').order('fecha',{ascending:true}),
      db.from('conciertos').select('id_concierto,titulo,fecha,localidad,estado').gte('fecha',start).lt('fecha',end).eq('estado','Publicado').order('fecha',{ascending:true}),
      db.from('repertorios_temporada').select('id_repertorio,temporada').eq('temporada',anio).maybeSingle()
    ]);
    for(const r of [proc,conc,rep])if(r.error)throw r.error;
    const actuaciones=(proc.data||[]);
    const idsConciertos=new Set(actuaciones.filter(p=>p.concierto_id!=null).map(p=>String(p.concierto_id)));
    const conciertos=(conc.data||[]).filter(c=>!idsConciertos.has(String(c.id_concierto)));
    const cards=[
      ...actuaciones.map(p=>({date:p.fecha,name:p.hermandad||'Actuación',place:p.localidad,type:p.tipo||'Procesión',href:'analisis.html?id='+encodeURIComponent(p.id_procesion)})),
      ...conciertos.map(c=>({date:c.fecha,name:c.titulo||'Concierto',place:c.localidad,type:'Concierto',href:'concierto.html?id='+encodeURIComponent(c.id_concierto)}))
    ].sort((a,b)=>a.date.localeCompare(b.date));
    el('rec-events').innerHTML=cards.map(c=>`<a class="rec-card" href="${c.href}"><time>${safe(fmt(c.date))} · ${safe(c.type)}</time><h3>${safe(c.name)}</h3><p>${safe(c.place||'Localidad no indicada')} · Ver ficha y repertorio →</p></a>`).join('')||'<p class="rec-muted">No hay actuaciones publicadas.</p>';
    // Consultamos las interpretaciones de las actuaciones finalizadas; no confundimos marchas disponibles con interpretadas.
    const marchaCounts=new Map(), autorCounts=new Map();
    let interpretaciones=0;
    const ids=actuaciones.map(p=>p.id_procesion);
    if(ids.length){
      const {data,error}=await db.from('repertorio_transaccional').select('id_marcha,catalogo_marchas(titulo,autor)').in('id_procesion',ids);
      if(error)throw error;
      (data||[]).forEach(x=>{
        const m=x.catalogo_marchas||{};
        add(marchaCounts,m.titulo||'Marcha sin título');
        add(autorCounts,m.autor||'Autor desconocido');
        interpretaciones++;
      });
    }
    let duracion=0,conDuracion=0;
    actuaciones.forEach(p=>{
      if(!p.hora||!p.fin_hora)return;
      const parse=(x)=>{const bits=x.split(':');return Number(bits[0])*60+Number(bits[1]);};
      let minutos=parse(p.fin_hora)-parse(p.hora);
      if(minutos<0)minutos+=24*60;
      if(minutos>=0 && minutos<=24*60){duracion+=minutos;conDuracion++;}
    });
    el('rec-stats').innerHTML=stat(cards.length,'Actuaciones registradas')+stat(interpretaciones,'Marchas interpretadas')+stat(marchaCounts.size,'Marchas diferentes')+stat(conDuracion? (duracion/60).toLocaleString('es-ES',{maximumFractionDigits:1})+' h':'—','Horas registradas');
    el('rec-analysis').innerHTML=`
      <p class="rec-muted">Duración calculada para ${conDuracion} de ${actuaciones.length} actuaciones finalizadas que disponen de hora de inicio y fin. Los conciertos sin seguimiento de procesión se muestran en el archivo, pero no aportan interpretaciones al ranking.</p>
      <h3>Marchas más interpretadas</h3>${listaRanking(sortCount(marchaCounts),'Marcha')}
      <h3>Compositores más interpretados</h3>${listaRanking(sortCount(autorCounts),'Compositor')}
    `;
    if(!rep.data){el('rec-repertoire').innerHTML='<p class="rec-muted">No existe repertorio anual asociado a este año.</p>';return;}
    const {data:items,error}=await db.from('repertorio_temporada_marchas').select('numero_repertorio,catalogo_marchas(titulo,autor)').eq('id_repertorio',rep.data.id_repertorio).order('numero_repertorio',{ascending:true});
    if(error)throw error;
    el('rec-repertoire').innerHTML=`<p class="rec-muted">${(items||[]).length} marchas conservadas en la selección anual de ${anio}.</p>
      <table class="rec-table"><thead><tr><th>N.º</th><th>Marcha</th><th>Compositor</th></tr></thead><tbody>
      ${(items||[]).map(x=>`<tr><td>${safe(String(x.numero_repertorio).padStart(3,'0'))}</td><td>${safe(x.catalogo_marchas?.titulo)}</td><td>${safe(x.catalogo_marchas?.autor)}</td></tr>`).join('')}
      </tbody></table>`;
  }
  cargar().catch(err=>{el('rec-status').textContent='Archivo no disponible';el('rec-events').innerHTML='<p class="rec-muted">'+safe(err.message)+'</p>';console.error(err);});
})();