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
  if(!records.length){target.innerHTML='<p class="muted">No hay eventos finalizados en este período y categoría.</p>';return;}
  target.innerHTML='<div class="jc-admin-quick-stats">'+summaryCard('Eventos',records.length)+summaryCard('Presencias',records.reduce((n,r)=>n+r.yes,0))+summaryCard('Sin fichaje por revisar',records.reduce((n,r)=>n+r.miss,0))+'</div>'+
   records.slice().reverse().map(r=>{
    const groups=new Map();r.rows.forEach(p=>{if(!groups.has(p.instrumento))groups.set(p.instrumento,[]);groups.get(p.instrumento).push(p);});
    const breakdown=[...groups].map(([inst,rows])=>{const yes=rows.filter(p=>p.valor===1).length,missing=rows.filter(p=>p.estado==='sin_fichaje').length;return '<tr><td>'+esc(inst)+'</td><td>'+yes+' / '+rows.length+'</td><td>'+fmt(pct(yes,rows.length))+'</td><td>'+missing+'</td></tr>';}).join('');
    return '<details class="panel"><summary><strong>'+esc(r.event.titulo)+'</strong> · '+esc(B.fecha(r.event.inicio))+' · '+esc(kindLabel(r.event.tipo))+' · '+fmt(r.coverage)+'</summary><div class="jc-admin-quick-stats">'+summaryCard('Convocados',r.total)+summaryCard('Presentes',r.yes)+summaryCard('Sin fichaje',r.miss)+(r.event.tipo==='ensayo'?'':summaryCard('Previsión: Voy',r.forecast))+'</div><div class="table-scroll"><table><thead><tr><th>Instrumento</th><th>Presentes</th><th>Asistencia</th><th>Sin fichaje</th></tr></thead><tbody>'+breakdown+'</tbody></table></div><button type="button" data-att-open="'+esc(r.event.id)+'">Ver ficha y revisar registros</button></details>';
   }).join('');
 }
 function matrix(records){
  const persons=new Map();records.forEach(r=>r.rows.forEach(p=>persons.set(p.id,p)));
  const members=[...persons.values()].sort((a,b)=>compare(a.instrumento,b.instrumento)||compare(a.nombre,b.nombre));
  const cells=new Map(records.map(r=>[String(r.event.id),new Map(r.rows.map(p=>[p.id,p]))]));
  const headers=records.map((r,i)=>'<th title="'+esc(r.event.titulo)+' · '+esc(B.fecha(r.event.inicio))+'">'+(i+1)+'<small> '+esc(day(r.event.inicio).slice(5))+'</small></th>').join('');
  const rows=members.map(p=>{
   const values=records.map(r=>{const x=cells.get(String(r.event.id)).get(p.id);return x?'<td title="'+esc(x.estado==='sin_fichaje'?'Sin fichaje: pendiente de revisión':B.asistencia({estado:x.estado}))+'">'+x.valor+'</td>':'<td title="No convocado">—</td>';}).join('');
   const active=records.reduce((n,r)=>n+Number(cells.get(String(r.event.id)).has(p.id)),0),present=records.reduce((n,r)=>n+Number(cells.get(String(r.event.id)).get(p.id)?.valor===1),0);
   return '<tr><th>'+esc(p.instrumento)+'</th><th>'+esc(p.nombre)+'</th>'+values+'<td><strong>'+present+'/'+active+'</strong></td><td>'+fmt(pct(present,active))+'</td></tr>';
  }).join('');
  const target=$('jc-att-matrix');
  target.innerHTML=records.length?'<div class="row"><button id="jc-att-export" type="button">Exportar matriz CSV (Excel)</button></div><p class="muted">Cada columna numerada es un evento. 1 = presencia registrada; 0 = sin presencia registrada; — = músico no convocado. Pasa el cursor por el 0 para saber si consta ausencia o si falta revisar el fichaje.</p><div class="table-scroll" style="max-height:65vh"><table class="bp-report-table"><thead><tr><th>Instrumento</th><th>Músico</th>'+headers+'<th>Presentes / convocados</th><th>%</th></tr></thead><tbody>'+rows+'</tbody></table></div><details><summary>Identificación de los eventos</summary><ol>'+records.map(r=>'<li>'+esc(B.fecha(r.event.inicio))+' · '+esc(r.event.titulo)+' ('+esc(kindLabel(r.event.tipo))+')</li>').join('')+'</ol></details>':'<p class="muted">No hay eventos para crear la matriz.</p>';
  const btn=$('jc-att-export');if(btn)btn.onclick=()=>B.csv([['Instrumento','Músico',...records.map(r=>day(r.event.inicio)+' '+r.event.titulo), 'Presencias','Convocatorias','Porcentaje'],...members.map(p=>{let present=0,active=0;const values=records.map(r=>{const x=cells.get(String(r.event.id)).get(p.id);if(!x)return '';active++;present+=x.valor;return x.valor;});return [p.instrumento,p.nombre,...values,present,active,pct(present,active)??''];})],'jc-matriz-asistencia-'+scope().desde+'-'+scope().hasta+'.csv');
 }
 function statistics(records){
  const total=records.reduce((n,r)=>n+r.total,0),present=records.reduce((n,r)=>n+r.yes,0),missing=records.reduce((n,r)=>n+r.miss,0);
  const byType=Object.keys(tipos).map(kind=>{const subset=records.filter(r=>r.event.tipo===kind);return {kind,n:subset.length,total:subset.reduce((n,r)=>n+r.total,0),yes:subset.reduce((n,r)=>n+r.yes,0),miss:subset.reduce((n,r)=>n+r.miss,0)};});
  const groups=new Map();records.forEach(r=>r.rows.forEach(p=>{const prev=groups.get(p.instrumento)||{total:0,yes:0,miss:0};prev.total++;prev.yes+=p.valor;prev.miss+=Number(p.estado==='sin_fichaje');groups.set(p.instrumento,prev);}));
  $('jc-att-stats').innerHTML='<div class="jc-admin-quick-stats">'+summaryCard('Eventos',records.length)+summaryCard('Asistencia registrada',fmt(pct(present,total)))+summaryCard('Presencias',present+' / '+total)+summaryCard('Sin fichaje por revisar',missing)+'</div><h3>Por actividad</h3><div class="table-scroll"><table><thead><tr><th>Tipo</th><th>Eventos</th><th>Presencias / convocatorias</th><th>%</th><th>Sin fichaje</th></tr></thead><tbody>'+byType.map(x=>'<tr><td>'+esc(kindLabel(x.kind))+'</td><td>'+x.n+'</td><td>'+x.yes+' / '+x.total+'</td><td>'+fmt(pct(x.yes,x.total))+'</td><td>'+x.miss+'</td></tr>').join('')+'</tbody></table></div><h3>Por instrumento</h3><div class="table-scroll"><table><thead><tr><th>Instrumento</th><th>Presencias / convocatorias</th><th>%</th><th>Sin fichaje</th></tr></thead><tbody>'+[...groups].sort((a,b)=>compare(a[0],b[0])).map(([k,x])=>'<tr><td>'+esc(k)+'</td><td>'+x.yes+' / '+x.total+'</td><td>'+fmt(pct(x.yes,x.total))+'</td><td>'+x.miss+'</td></tr>').join('')+'</tbody></table></div><h3>Matriz nominal de asistencia</h3><div id="jc-att-matrix"></div>';
  matrix(records);
 }
 async function update(){
  if(busy)return;
  const {desde,hasta,tipo}=scope();if(!desde||!hasta||desde>hasta){B.notice('Selecciona un intervalo de fechas válido.',true);return;}
  busy=true;$('jc-att-history').textContent='Cargando…';$('jc-att-stats').textContent='Cargando…';
  try{
   const key=desde+'|'+hasta;if(!loaded||lastKey!==key){loaded=await snapshot(desde,hasta);lastKey=key;}
   const rows=filter(loaded,tipo);history(rows);statistics(rows);
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
  hist.addEventListener('click',e=>{const button=e.target.closest('[data-att-open]');if(button){window.JCBandaNavigate?.open('control');document.dispatchEvent(new CustomEvent('banda:select',{detail:button.dataset.attOpen}));}});
  const nav=base.querySelector('.jc-operations-tabs');
  nav?.addEventListener('click',e=>{if(e.target.closest('[data-section="historial"],[data-section="estadisticas"]'))update();});
  // Los filtros se comparten entre las dos vistas; la pantalla de historial dispone de acceso rápido a ellos.
  const shortcut=document.createElement('button');shortcut.type='button';shortcut.textContent='Cambiar fechas y filtros';shortcut.onclick=()=>window.JCBandaNavigate?.open('estadisticas');hist.insertBefore(shortcut,$('jc-att-history'));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();