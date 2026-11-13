/* Histórico y analítica de asistencia. Solo se carga en Admin Músico. */
(() => {
 'use strict';
 const B=window.JCBanda, esc=B.escape, $=id=>document.getElementById(id);
 const tipos={ensayo:'Ensayo',actuacion:'Actuación',extraordinario:'Extraordinario'};
 let loaded=null, lastKey='', busy=false;
 const day=v=>B.dia(v);
 const today=()=>day(new Date());
 const addDay=s=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);};
 const pct=(n,d)=>d?Math.round(n*1000/d)/10:null;
 const fmt=n=>n==null?'—':String(n).replace('.',',')+' %';
 const kindLabel=k=>tipos[k]||k;
 const compare=(a,b)=>String(a||'').localeCompare(String(b||''),'es',{sensitivity:'base'});
 const enc=s=>encodeURIComponent(String(s));
 const chunk=(a,n=75)=>Array.from({length:Math.ceil(a.length/n)},(_,i)=>a.slice(i*n,(i+1)*n));
 async function readAll(table,filter){
  const all=[];for(let offset=0;;offset+=800){
   const page=await B.query(table,q=>filter(q).range(offset,offset+799));
   all.push(...page);if(page.length<800)break;
  }return all;
 }
 async function snapshot(desde,hasta){
  const ev=await readAll('banda_eventos',q=>q.gte('inicio',desde+'T00:00:00').lt('inicio',addDay(hasta)+'T00:00:00').order('inicio'));
  const events=ev.filter(e=>e.estado!=='cancelado'&&Date.parse(e.fin)<=Date.now());
  const fichas=await readAll('banda_fichas',q=>q.order('instrumento'));
  const profiles=await readAll('perfiles',q=>q.order('username'));
  const members=new Map(fichas.map(f=>[String(f.usuario_id),f]));
  const people=new Map(profiles.map(p=>[String(p.id),p]));
  const info=id=>{const k=String(id),m=members.get(k),p=people.get(k);return {id:k,nombre:m?.nombre||p?.nombre_completo||p?.username||'Sin nombre',instrumento:m?.instrumento||'Sin instrumento'};};
  let roster=[],answers=[],attendance=[];
  for(const ids of chunk(events.map(e=>e.id))){
   if(!ids.length)continue;
   const [r,a,t]=await Promise.all([
    readAll('banda_convocados',q=>q.in('evento_id',ids)),
    readAll('banda_respuestas',q=>q.in('evento_id',ids)),
    readAll('banda_asistencias',q=>q.in('evento_id',ids))
   ]);roster.push(...r);answers.push(...a);attendance.push(...t);
  }
  const byEvent=(arr)=>{const map=new Map();arr.forEach(x=>{const k=String(x.evento_id);if(!map.has(k))map.set(k,[]);map.get(k).push(x);});return map;};
  const rs=byEvent(roster),as=byEvent(answers),ts=byEvent(attendance);
  const records=events.map(e=>{
   const registered=rs.get(String(e.id))||[],responses=new Map((as.get(String(e.id))||[]).map(x=>[String(x.usuario_id),x])),visits=new Map((ts.get(String(e.id))||[]).map(x=>[String(x.usuario_id),x]));
   const rows=registered.map(c=>{const p=info(c.usuario_id),a=visits.get(p.id),r=responses.get(p.id);return {...p,estado:a?.estado||'sin_fichaje',respuesta:r?.respuesta||null,valor:a?.estado==='presente'?1:0};}).sort((a,b)=>compare(a.instrumento,b.instrumento)||compare(a.nombre,b.nombre));
   const yes=rows.filter(x=>x.estado==='presente').length,miss=rows.filter(x=>x.estado==='sin_fichaje').length;
   const forecast=rows.filter(x=>x.respuesta==='voy').length;
   return {event:e,rows,total:rows.length,yes,miss,forecast,coverage:pct(yes,rows.length)};
  });
  return {records,info,desde,hasta};
 }
 const scope=()=>({desde:$('jc-att-from').value,hasta:$('jc-att-to').value,tipo:$('jc-att-kind').value});
 const filter=(data,tipo)=>data.records.filter(r=>tipo==='all'||r.event.tipo===tipo);
 function controls(){
  return '<form id="jc-att-query" class="panel"><div class="grid"><label>Desde<input id="jc-att-from" type="date" required></label><label>Hasta<input id="jc-att-to" type="date" required></label><label>Actividad<select id="jc-att-kind"><option value="all">Todas las actividades</option><option value="ensayo">Ensayos</option><option value="actuacion">Actuaciones</option><option value="extraordinario">Extraordinarios</option></select></label></div><div class="row"><button type="submit" class="primary">Consultar período</button><button type="button" id="jc-att-month">Este mes</button><button type="button" id="jc-att-season">Temporada sep.–ago.</button></div><p class="muted">Los informes contienen solo eventos finalizados y no cancelados. El 0 indica que no consta una presencia, no necesariamente una ausencia confirmada. Se distinguen los casos sin fichaje.</p></form>';
 }
 function summaryCard(label,value){return '<div class="jc-admin-stat"><strong>'+esc(value)+'</strong><span>'+esc(label)+'</span></div>';}
 function history(records){
  const target=$('jc-att-history');
  if(!records.length){target.innerHTML='<p class="muted">No hay eventos finalizados en este período y categoría. Puedes cambiar las fechas en Estadísticas.</p>';return;}
  const cards=records.slice().reverse().map(r=>{
   const groups=new Map();
   r.rows.forEach(p=>{const key=p.instrumento.trim()||'Sin instrumento';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);});
   const instruments=[...groups].sort((a,b)=>compare(a[0],b[0]));
   const distribution=instruments.map(([inst,people])=>bar(inst,people.filter(p=>p.valor===1).length,people.length)).join('');
   const totalConfirmed=r.rows.filter(p=>p.respuesta==='voy').length,declined=r.rows.filter(p=>p.respuesta==='no_voy').length;
   const pending=r.total-totalConfirmed-declined;
   const forecast=r.event.tipo==='ensayo'?'':('<section class="jc-att-section"><div class="jc-att-section-title"><h3>Previsión antes del evento</h3><small>Confirmaciones registradas</small></div><div class="jc-att-forecast-cards">'+
    '<div><strong>'+totalConfirmed+'</strong><small>Confirmaron que iban</small></div>'+
    '<div><strong>'+declined+'</strong><small>Indicaron que no iban</small></div>'+
    '<div><strong>'+pending+'</strong><small>Sin respuesta</small></div></div><p class="jc-att-small-note">La previsión corresponde al estado de las respuestas guardadas, no necesariamente al que existía antes del evento.</p></section>');
   const roster=instruments.map(([inst,people])=>'<details class="jc-att-roster-group"><summary><strong>'+esc(inst)+'</strong><span>'+people.filter(p=>p.valor===1).length+' / '+people.length+' presentes</span></summary><div class="jc-att-roster-list">'+people.map(p=>'<div class="jc-att-roster-person"><span>'+esc(p.nombre)+'</span><span class="'+(p.valor===1?'jc-att-present':'jc-att-no-presence')+'">'+(p.valor===1?'Presente':p.estado==='justificada'?'Justificada':p.estado==='ausente'?'Ausente':p.estado==='incidencia'?'Incidencia':'Sin presencia registrada')+'</span></div>').join('')+'</div></details>').join('');
   return '<details class="jc-att-history-event" id="jc-history-'+esc(r.event.id)+'"><summary><div class="jc-att-event-title"><strong>'+esc(r.event.titulo)+'</strong><small>'+esc(B.fecha(r.event.inicio))+' · '+esc(kindLabel(r.event.tipo))+'</small></div><div class="jc-att-history-result"><b>'+fmt(r.coverage)+'</b><small>'+r.yes+' de '+r.total+' presentes</small></div><span class="jc-att-history-chevron" aria-hidden="true">▾</span></summary>'+
    '<div class="jc-att-event-detail"><div class="jc-att-event-kpis">'+
    '<div class="jc-att-kpi"><span class="jc-att-kpi-title">Índice de asistencia</span><strong>'+fmt(r.coverage)+'</strong><div class="jc-att-progress"><span style="width:'+(r.coverage??0)+'%"></span></div></div>'+
    '<div class="jc-att-kpi"><span class="jc-att-kpi-title">Músicos presentes</span><strong>'+r.yes+' / '+r.total+'</strong><small>Presencias registradas entre los convocados</small></div></div>'+
    '<div class="jc-att-split"><section class="jc-att-section"><div class="jc-att-section-title"><h3>Asistencia por instrumento</h3><small>'+instruments.length+' instrumentos</small></div><div class="jc-att-instruments">'+(distribution||'<p class="muted">Sin músicos convocados.</p>')+'</div></section>'+
    '<section class="jc-att-section"><div class="jc-att-section-title"><h3>Músicos convocados</h3><small>Ordenados por instrumento</small></div><div class="jc-att-roster-scroll">'+(roster||'<p class="muted">No hay músicos.</p>')+'</div></section></div>'+forecast+
    '<div class="jc-att-detail-footer"><button type="button" data-att-open="'+esc(r.event.id)+'">Abrir gestión y corregir asistencias</button></div></div></details>';
  }).join('');
  target.innerHTML='<div class="jc-att-dashboard"><section class="jc-att-hero"><div class="jc-att-hero-head"><div><h3>Historial de eventos</h3><p>Selecciona un evento para consultar sus indicadores y el detalle por instrumento.</p></div><div class="jc-att-pill">'+records.length+' eventos</div></div><div class="jc-att-kpi-grid">'+
   '<div class="jc-att-kpi"><span class="jc-att-kpi-title">Asistencia media por evento</span><strong>'+fmt(avg(records))+'</strong><small>Media de porcentajes, cada evento tiene el mismo peso</small></div>'+
   '<div class="jc-att-kpi"><span class="jc-att-kpi-title">Presencias registradas</span><strong>'+records.reduce((n,r)=>n+r.yes,0)+'</strong><small>En '+records.length+' actividades finalizadas</small></div></div></section>'+
   '<div class="jc-att-history-list">'+cards+'</div></div>';
 }
 function matrix(records){
  const persons=new Map();records.forEach(r=>r.rows.forEach(p=>persons.set(p.id,p)));
  const members=[...persons.values()].sort((a,b)=>compare(a.instrumento,b.instrumento)||compare(a.nombre,b.nombre));
  const cells=new Map(records.map(r=>[String(r.event.id),new Map(r.rows.map(p=>[p.id,p]))]));
  const headers=records.map(r=>'<th style="min-width:145px;max-width:220px;white-space:normal" title="'+esc(r.event.titulo)+' · '+esc(B.fecha(r.event.inicio))+'"><strong>'+esc(r.event.titulo)+'</strong><small style="display:block">'+esc(day(r.event.inicio))+'</small></th>').join('');
  const rows=members.map(p=>{
   const values=records.map(r=>{const x=cells.get(String(r.event.id)).get(p.id);return x?'<td title="'+esc(x.estado==='sin_fichaje'?'Sin fichaje: pendiente de revisión':B.asistencia({estado:x.estado}))+'">'+x.valor+'</td>':'<td title="No convocado">—</td>';}).join('');
   const active=records.reduce((n,r)=>n+Number(cells.get(String(r.event.id)).has(p.id)),0),present=records.reduce((n,r)=>n+Number(cells.get(String(r.event.id)).get(p.id)?.valor===1),0);
   return '<tr><th>'+esc(p.instrumento)+'</th><th>'+esc(p.nombre)+'</th>'+values+'<td><strong>'+present+'/'+active+'</strong></td><td>'+fmt(pct(present,active))+'</td></tr>';
  }).join('');
  const target=$('jc-att-matrix');
  target.innerHTML=records.length?'<div class="row"><button id="jc-att-excel" type="button">Exportar Excel (.xlsx)</button><button id="jc-att-pdf" type="button">Exportar PDF</button></div><p class="muted">Los encabezados muestran el nombre y fecha de cada evento. 1 = presencia registrada; 0 = sin presencia registrada; — = no convocado. Un 0 sin fichaje no equivale a ausencia confirmada.</p><div class="table-scroll" style="max-height:65vh"><table class="bp-report-table"><thead><tr><th>Instrumento</th><th>Músico</th>'+headers+'<th>Presentes / convocados</th><th>%</th></tr></thead><tbody>'+rows+'</tbody></table></div>':'<p class="muted">No hay eventos para crear la matriz.</p>';
  const data=()=>[ ['Instrumento','Músico',...records.map(r=>day(r.event.inicio)+' · '+r.event.titulo),'Presencias','Convocatorias','Porcentaje (%)'], ...members.map(p=>{let present=0,active=0;const values=records.map(r=>{const x=cells.get(String(r.event.id)).get(p.id);if(!x)return '';active++;present+=x.valor;return x.valor;});return [p.instrumento,p.nombre,...values,present,active,pct(present,active)??''];}) ];
  const file='jc-matriz-asistencia-'+scope().desde+'-'+scope().hasta;
  const excel=$('jc-att-excel');if(excel)excel.onclick=()=>{
   if(!window.XLSX){B.notice('No se ha cargado el módulo Excel. Recarga la página.',true);return;}
   const book=XLSX.utils.book_new(), sheet=XLSX.utils.aoa_to_sheet(data());
   sheet['!cols']=[{wch:23},{wch:32},...records.map(()=>({wch:32})),{wch:12},{wch:16},{wch:17}];
   sheet['!freeze']={xSplit:2,ySplit:1};
   XLSX.utils.book_append_sheet(book,sheet,'Asistencia');
   const list=XLSX.utils.aoa_to_sheet([['Fecha','Evento','Tipo','Convocados','Presentes','Pendientes sin fichaje','Confirmaron asistencia'],...records.map(r=>[day(r.event.inicio),r.event.titulo,kindLabel(r.event.tipo),r.total,r.yes,r.miss,r.forecast])]);
   list['!cols']=[{wch:15},{wch:45},{wch:20},{wch:15},{wch:15},{wch:24},{wch:24}];
   XLSX.utils.book_append_sheet(book,list,'Eventos');
   XLSX.writeFile(book,file+'.xlsx');
  };
  const pdf=$('jc-att-pdf');if(pdf)pdf.onclick=()=>{
   const JsPDF=window.jspdf?.jsPDF;
   if(!JsPDF){B.notice('No se ha cargado el módulo PDF. Recarga la página.',true);return;}
   const doc=new JsPDF({orientation:'landscape',unit:'mm',format:'a4'});
   if(typeof doc.autoTable!=='function'){B.notice('No se ha cargado el generador de tablas PDF.',true);return;}
   const all=data(), base=all.slice(1), width=8;
   for(let offset=0;offset<records.length;offset+=width){
    if(offset)doc.addPage();
    const part=records.slice(offset,offset+width),head=['Instrumento','Músico',...part.map(r=>day(r.event.inicio)+'\n'+r.event.titulo),'Pres.','Conv.','%'];
    const body=base.map(r=>[r[0],r[1],...r.slice(2+offset,2+offset+part.length),...r.slice(-3)]);
    doc.setFontSize(12);doc.text('Julián Cerdán · Matriz de asistencia',12,12);
    doc.setFontSize(8);doc.text(scope().desde+' a '+scope().hasta+' · Eventos '+(offset+1)+'–'+(offset+part.length)+' de '+records.length,12,18);
    doc.autoTable({head:[head],body,startY:23,margin:{left:9,right:9},styles:{fontSize:6,cellPadding:1.6,overflow:'linebreak'},headStyles:{fontSize:6},columnStyles:{0:{cellWidth:24},1:{cellWidth:34}},theme:'grid'});
   }
   doc.save(file+'.pdf');
  };
 }
 function bar(label,numerator,denominator,subtitle=''){
  const value=pct(numerator,denominator);
  return '<div class="jc-att-bar-row"><div class="jc-att-bar-head"><strong>'+esc(label)+'</strong><span>'+fmt(value)+'</span></div><div class="jc-att-progress" role="progressbar" aria-label="'+esc(label)+'" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+(value??0)+'"><span style="width:'+(value??0)+'%"></span></div><small>'+esc(subtitle||numerator+' presencias de '+denominator+' convocatorias')+'</small></div>';
 }
 const avg=items=>{
  const valid=items.filter(r=>r.total>0);
  return valid.length?Math.round(valid.reduce((sum,r)=>sum+100*r.yes/r.total,0)*10/valid.length)/10:null;
 };
 function statistics(records,allRecords=records){
  const total=records.reduce((n,r)=>n+r.total,0),present=records.reduce((n,r)=>n+r.yes,0);
  const kinds=['ensayo','actuacion'];
  const indicators=kinds.map(kind=>{
   const list=allRecords.filter(r=>r.event.tipo===kind),average=avg(list);
   return '<div class="jc-att-kpi"><span class="jc-att-kpi-icon">'+(kind==='ensayo'?'♫':'★')+'</span><span class="jc-att-kpi-title">Asistencia media a '+(kind==='ensayo'?'ensayos':'actuaciones')+'</span><strong>'+fmt(average)+'</strong><div class="jc-att-progress"><span style="width:'+(average??0)+'%"></span></div><small>'+list.length+' evento'+(list.length===1?'':'s')+' finalizado'+(list.length===1?'':'s')+'</small></div>';
  }).join('');
  const groups=new Map();
  records.forEach(r=>r.rows.forEach(p=>{
   const key=p.instrumento.trim()||'Sin instrumento',old=groups.get(key)||{total:0,yes:0};
   old.total++;old.yes+=p.valor;groups.set(key,old);
  }));
  const instr=[...groups].sort((a,b)=>compare(a[0],b[0]));
  const eventCards=records.slice().reverse().map(r=>{
   const value=r.coverage;
   return '<article class="jc-att-event-card"><div class="jc-att-event-main"><div class="jc-att-event-title"><strong>'+esc(r.event.titulo)+'</strong><small>'+esc(B.fecha(r.event.inicio))+' · '+esc(kindLabel(r.event.tipo))+'</small></div><div class="jc-att-event-percent">'+fmt(value)+'</div></div><div class="jc-att-progress"><span style="width:'+(value??0)+'%"></span></div><div class="jc-att-event-foot"><span>'+r.yes+' / '+r.total+' asistentes</span><button type="button" data-att-inspect="'+esc(r.event.id)+'">Analizar evento</button></div></article>';
  }).join('');
  const byType=Object.keys(tipos).map(kind=>{
   const list=records.filter(r=>r.event.tipo===kind);
   return list.length?bar(kindLabel(kind),list.reduce((sum,r)=>sum+r.yes,0),list.reduce((sum,r)=>sum+r.total,0),list.length+' eventos · '+list.reduce((sum,r)=>sum+r.yes,0)+' presencias'):'';
  }).join('');
  $('jc-att-stats').innerHTML=
   '<div class="jc-att-dashboard">'+
   '<section class="jc-att-hero"><div class="jc-att-hero-head"><div><h3>Resumen de asistencia</h3><p>Promedio de los porcentajes de cada evento finalizado dentro del período seleccionado.</p></div><div class="jc-att-pill">'+allRecords.length+' eventos</div></div><div class="jc-att-kpi-grid">'+indicators+'</div></section>'+
   '<div class="jc-att-split"><section class="jc-att-section"><div class="jc-att-section-title"><h3>Asistencia por actividad</h3><small>Registros del filtro seleccionado</small></div>'+(byType||'<p class="muted">No hay actividades en este período.</p>')+'</section>'+
   '<section class="jc-att-section"><div class="jc-att-section-title"><h3>Distribución por instrumento</h3><small>'+instr.length+' instrumentos</small></div><div class="jc-att-instruments">'+(instr.map(([k,v])=>bar(k,v.yes,v.total)).join('')||'<p class="muted">No hay músicos convocados.</p>')+'</div></section></div>'+
   '<section class="jc-att-section"><div class="jc-att-section-title"><h3>Resultado de cada evento</h3><small>'+records.length+' eventos · '+present+' presencias de '+total+' convocatorias</small></div><div class="jc-att-event-grid">'+(eventCards||'<p class="muted">No hay eventos en el filtro seleccionado.</p>')+'</div></section>'+
   '<details class="jc-att-matrix-details"><summary><span><strong>Matriz individual de asistencia</strong><small>Relación músico × evento, con exportación a Excel y PDF</small></span><span aria-hidden="true">▾</span></summary><div class="jc-att-matrix-body"><div id="jc-att-matrix"></div></div></details>'+
   '</div>';
  matrix(records);
 }
 async function update(){
  if(busy)return;
  const {desde,hasta,tipo}=scope();if(!desde||!hasta||desde>hasta){B.notice('Selecciona un intervalo de fechas válido.',true);return;}
  busy=true;$('jc-att-history').textContent='Cargando…';$('jc-att-stats').textContent='Cargando…';
  try{
   const key=desde+'|'+hasta;if(!loaded||lastKey!==key){loaded=await snapshot(desde,hasta);lastKey=key;}
   const rows=filter(loaded,tipo);history(rows);statistics(rows,loaded.records);
  }catch(e){$('jc-att-history').textContent='No se ha podido cargar el historial: '+e.message;$('jc-att-stats').textContent='No se han podido cargar las estadísticas: '+e.message;}
  finally{busy=false;}
 }
 function init(){
  const base=document.querySelector('[data-admin-view="banda"]');if(!base)return;
  const hist=base.querySelector('[data-operation-panel="historial"]'),stats=base.querySelector('[data-operation-panel="estadisticas"]');
  if(!hist||!stats)return;
  hist.insertAdjacentHTML('beforeend','<p>Consulta el resultado de cada evento, sus instrumentos y la previsión inicial.</p><div id="jc-att-history"></div>');
  stats.insertAdjacentHTML('beforeend','<p>Analiza asistencia global, por actividad, por instrumento y por músico.</p><div id="jc-att-stats"></div>');
  stats.querySelector('.jc-operation-heading')?.insertAdjacentHTML('afterend',controls());
  const form=$('jc-att-query'),now=today();$('jc-att-from').value=now.slice(0,4)+'-01-01';$('jc-att-to').value=now;
  form.onsubmit=e=>{e.preventDefault();update();};
  $('jc-att-month').onclick=()=>{$('jc-att-from').value=now.slice(0,7)+'-01';$('jc-att-to').value=now;update();};
  $('jc-att-season').onclick=()=>{$('jc-att-from').value=String(+now.slice(0,4)-(Number(now.slice(5,7))<9?1:0))+'-09-01';$('jc-att-to').value=now;update();};
  $('jc-att-kind').onchange=update;
  stats.addEventListener('click',e=>{const inspect=e.target.closest('[data-att-inspect]');if(inspect){window.JCBandaNavigate?.open('historial');const detail=document.getElementById('jc-history-'+inspect.dataset.attInspect);if(detail){detail.open=true;detail.scrollIntoView({behavior:'smooth',block:'start'});}return;}const btn=e.target.closest('[data-att-open]');if(btn){window.JCBandaNavigate?.open('control');document.dispatchEvent(new CustomEvent('banda:select',{detail:btn.dataset.attOpen}));}});
  hist.addEventListener('click',e=>{const button=e.target.closest('[data-att-open]');if(button){window.JCBandaNavigate?.open('control');document.dispatchEvent(new CustomEvent('banda:select',{detail:button.dataset.attOpen}));}});
  const nav=base.querySelector('.jc-operations-tabs');
  nav?.addEventListener('click',e=>{if(e.target.closest('[data-section="historial"],[data-section="estadisticas"]'))update();});
  // Los filtros se comparten entre las dos vistas; la pantalla de historial dispone de acceso rápido a ellos.
  const shortcut=document.createElement('button');shortcut.type='button';shortcut.textContent='Cambiar fechas y filtros';shortcut.onclick=()=>window.JCBandaNavigate?.open('estadisticas');hist.insertBefore(shortcut,$('jc-att-history'));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();