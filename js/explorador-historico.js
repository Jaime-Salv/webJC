/* Explorador público histórico de Julián Cerdán: únicamente tablas públicas musicales. */
(() => {
'use strict';
const $=id=>document.getElementById(id), esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const norm=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9ñ]+/g,' ').trim();
const date=x=>x?new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(x+'T12:00:00')):'Fecha no disponible';
const number=n=>Number(n||0).toLocaleString('es-ES');
let events=[],tracks=[],raw=[],loaded=false;
const origin=e=>'analisis.html?id='+encodeURIComponent(e.id_procesion);
const eventName=e=>e.hermandad||e.titulo||e.nombre||'Actuación sin título';
const eventYear=e=>Number(String(e.fecha||'').slice(0,4))||null;
async function read(table,setup=q=>q){
 const result=[];for(let offset=0;;offset+=700){
  const {data,error}=await setup(clienteSupabase.from(table).select('*')).range(offset,offset+699);
  if(error)throw new Error('No se pueden consultar los datos públicos de '+table+': '+error.message);
  result.push(...(data||[]));if((data||[]).length<700)break;
 }return result;
}
async function init(){
 $('explorer-status').textContent='Consultando el archivo musical público…';
 try{
  const [procs,catalog]=await Promise.all([read('maestro_procesiones',q=>q.order('fecha',{ascending:false})),read('catalogo_marchas')]);
  // Solo actuaciones con repertorio documentado. No se recuperan fichajes ni datos privados.
  events=procs.filter(e=>e.estado==='Finalizada'&&e.fecha).sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha)));
  const catalogById=new Map(catalog.map(c=>[String(c.id_marcha),c]));
  const concerts=await read('conciertos').catch(()=>[]);
  const concertById=new Map(concerts.map(c=>[String(c.id_concierto),c]));
  events.forEach(e=>{if(e.tipo==='Concierto'&&e.concierto_id){const c=concertById.get(String(e.concierto_id));if(c?.titulo)e.titulo=c.titulo;}});
  for(let i=0;i<events.length;i+=55){
   const ids=events.slice(i,i+55).map(e=>e.id_procesion);
   raw.push(...await read('repertorio_transaccional',q=>q.in('id_procesion',ids)));
  }
  const byEvent=new Map(events.map(e=>[String(e.id_procesion),e]));
  tracks=raw.map(r=>{
   const event=byEvent.get(String(r.id_procesion)),m=catalogById.get(String(r.id_marcha))||{};
   return {...r,event,titulo:m.titulo||r.titulo||'Marcha sin identificar',autor:m.autor||r.autor||'Compositor sin identificar'};
  }).filter(t=>t.event);
  loaded=true;
  const years=[...new Set(events.map(eventYear).filter(Boolean))].sort((a,b)=>b-a);
  $('filter-year').innerHTML='<option value="all">Todos los años registrados</option>'+years.map(y=>'<option value="'+y+'">'+y+'</option>').join('');
  $('explorer-status').textContent='Archivo consultado · '+events.length+' actuaciones finalizadas · '+tracks.length+' interpretaciones documentadas · '+(years.length?years.at(-1)+'–'+years[0]:'sin años disponibles');
  renderOverview();
  if(new URLSearchParams(location.search).has('year')){$('filter-year').value=new URLSearchParams(location.search).get('year');renderOverview();}
  $('ask-box').disabled=false;$('ask-send').disabled=false;$('filter-year').disabled=false;$('filter-type').disabled=false;
 }catch(error){$('explorer-status').textContent=error.message;$('answer').innerHTML='<p class="notice">No se ha podido cargar el archivo público. Recarga la página e inténtalo de nuevo.</p>';}
}
const filtered=()=>{
 const y=$('filter-year').value,k=$('filter-type').value;
 return events.filter(e=>(y==='all'||eventYear(e)===Number(y))&&(k==='all'||(k==='Concierto'?e.tipo==='Concierto':k==='Procesion'?e.tipo!=='Concierto':true)));
};
const trace=selected=>{
 const ids=new Set(selected.map(e=>String(e.id_procesion)));
 return tracks.filter(t=>ids.has(String(t.id_procesion)));
};
const occurrences=(items,key)=>[...items.reduce((map,item)=>{const name=String(item[key]||'Sin identificar').trim();const id=norm(name),v=map.get(id)||{name,count:0};v.count++;map.set(id,v);return map;},new Map()).values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'es'));
const showRows=(rows,unit='interpretaciones',max=40)=>rows.length?'<div class="ex-list">'+rows.slice(0,max).map((r,i)=>'<div class="ex-list-row"><span class="ex-rank">'+(i+1)+'</span><strong>'+esc(r.name)+'</strong><b>'+number(r.count)+' <small>'+esc(unit)+'</small></b></div>').join('')+'</div>'+ (rows.length>max?'<p class="ex-note">Se muestran los primeros '+max+' de '+rows.length+' resultados.</p>':''):'<p class="ex-note">No hay interpretaciones documentadas para esta consulta.</p>';
const cards=(list,max=24)=>list.length?'<div class="ex-event-grid">'+list.slice(0,max).map(e=>{
 const count=tracks.filter(t=>String(t.id_procesion)===String(e.id_procesion)).length;
 return '<article class="ex-event"><span>'+esc(e.tipo||'Actuación')+' · '+esc(date(e.fecha))+'</span><h3>'+esc(eventName(e))+'</h3><p>'+count+' interpretaciones documentadas</p><a href="'+esc(origin(e))+'">Consultar actuación</a><button data-event="'+esc(e.id_procesion)+'" type="button">Ver marchas aquí</button></article>';
 }).join('')+'</div>':'<p class="ex-note">No hay eventos registrados para este filtro.</p>';
const setAnswer=(title,body,foot='')=>{
 $('answer').innerHTML='<div class="ex-answer"><h2>'+esc(title)+'</h2>'+body+(foot?'<p class="ex-note">'+esc(foot)+'</p>':'')+'</div>';
 $('answer').scrollIntoView({behavior:'smooth',block:'start'});
};
const scopeText=sel=>sel.length?'Período de los registros seleccionados: '+Math.min(...sel.map(eventYear).filter(Boolean))+'–'+Math.max(...sel.map(eventYear).filter(Boolean))+'. Solo incluye interpretaciones registradas.':'No hay eventos en el período solicitado.';
function renderOverview(){
 if(!loaded)return;
 const selected=filtered(),t=trace(selected),years=[...new Set(selected.map(eventYear).filter(Boolean))];
 $('summary').innerHTML=[
 ['Actuaciones',selected.length],['Interpretaciones',t.length],['Marchas distintas',new Set(t.map(x=>norm(x.titulo))).size],['Años consultados',years.length]
 ].map(([label,value])=>'<div class="ex-stat"><strong>'+number(value)+'</strong><span>'+esc(label)+'</span></div>').join('');
 $('top-marches').innerHTML=showRows(occurrences(t,'titulo').slice(0,8),'veces',8);
 $('top-authors').innerHTML=showRows(occurrences(t,'autor').slice(0,8),'veces',8);
 $('recent-events').innerHTML=cards(selected,8);
}
function eventDetail(ev){
 const t=tracks.filter(x=>String(x.id_procesion)===String(ev.id_procesion));
 const lines=t.map((x,i)=>'<div class="ex-track"><span>'+String(i+1).padStart(2,'0')+'</span><div><strong>'+esc(x.titulo)+'</strong><small>'+esc(x.autor)+'</small></div></div>').join('');
 setAnswer(eventName(ev)+' · '+eventYear(ev),'<p class="ex-subtitle">'+esc(date(ev.fecha))+' · '+esc(ev.tipo||'Actuación')+' · '+t.length+' marchas registradas</p><div class="ex-tracks">'+(lines||'<p>No hay marchas documentadas para este evento.</p>')+'</div><a class="ex-primary-link" href="'+esc(origin(ev))+'">Abrir análisis original de la actuación</a>');
}
function findEvent(query,year){
 const n=norm(query),selected=events.filter(e=>year==null||eventYear(e)===year);
 const sorted=selected.map(e=>{const name=norm(eventName(e)),tokens=name.split(' ').filter(x=>x.length>3),score=n.includes(name)&&name.length>3?500+name.length:tokens.filter(x=>n.includes(x)).reduce((sum,x)=>sum+x.length,0);return {e,score};}).filter(x=>x.score>=4).sort((a,b)=>b.score-a.score||String(b.e.fecha).localeCompare(String(a.e.fecha)));
 if(!sorted.length)return null;
 const name=norm(eventName(sorted[0].e));
 return sorted.filter(x=>norm(eventName(x.e))===name).sort((a,b)=>String(b.e.fecha).localeCompare(String(a.e.fecha)))[0].e;
}
function answerQuestion(value){
 if(!loaded)return;
 const text=String(value||'').trim(),n=norm(text);if(!n)return;
 $('ask-box').value=text;
 const years=[...text.matchAll(/\b(19\d{2}|20\d{2}|21\d{2})\b/g)].map(m=>Number(m[1]));
 const specific=years[0]||null, sel=events.filter(e=>specific==null||eventYear(e)===specific);
 const t=trace(sel);
 const isCompare=/compar|diferenc|versus| vs /.test(n);
 const isAuthor=/compositor|autor|autores/.test(n);
 const isMarch=/marcha|marchas|obra|obras|pieza|repertorio|toc[oó]|interpret/.test(n);
 const isRanking=/mas tocad|mas interpretad|ranking|top |frecuent|cuantas veces|cuantos veces/.test(n);
 const isEvent=/procesion|hermandad|concierto|soledad|santo entierro|actuacion|gloria/.test(n);
 if(isCompare&&years.length>=2){
  const [a,b]=years.slice(0,2),x=events.filter(e=>eventYear(e)===a),y=events.filter(e=>eventYear(e)===b);
  const tx=trace(x),ty=trace(y);
  const rows=[['Actuaciones',x.length,y.length],['Interpretaciones documentadas',tx.length,ty.length],['Marchas distintas',new Set(tx.map(z=>norm(z.titulo))).size,new Set(ty.map(z=>norm(z.titulo))).size],['Compositores distintos',new Set(tx.map(z=>norm(z.autor))).size,new Set(ty.map(z=>norm(z.autor))).size]];
  setAnswer('Comparativa '+a+' / '+b,'<div class="ex-table-wrap"><table><thead><tr><th>Indicador</th><th>'+a+'</th><th>'+b+'</th></tr></thead><tbody>'+rows.map(r=>'<tr><td>'+esc(r[0])+'</td><td>'+number(r[1])+'</td><td>'+number(r[2])+'</td></tr>').join('')+'</tbody></table></div>', 'Las comparaciones solo consideran actuaciones finalizadas e interpretaciones registradas.');
  return;
 }
 if(isEvent){
  const ev=findEvent(n,specific);
  if(ev && (isMarch||/que se toc|se tocaron|repertorio|que son[oó]/.test(n))){eventDetail(ev);return;}
  if(ev&&!isRanking){eventDetail(ev);return;}
 }
 if(/conciertos|concierto/.test(n)&&!isMarch){
  setAnswer('Conciertos registrados'+(specific?' en '+specific:''),cards(sel.filter(e=>e.tipo==='Concierto'),30),scopeText(sel));return;
 }
 if(/procesiones|hermandades|actuaciones/.test(n)&&!isMarch&&!isRanking){
  setAnswer('Actuaciones registradas'+(specific?' en '+specific:''),cards(sel,30),scopeText(sel));return;
 }
 if(isAuthor){
  const ranks=occurrences(t,'autor');
  setAnswer('Compositores por número de interpretaciones'+(specific?' · '+specific:''),showRows(ranks,'interpretaciones'),scopeText(sel));return;
 }
 if(isMarch||isRanking){
  // Busca una obra concreta antes de mostrar el ranking general.
  const names=occurrences(t,'titulo');
  const match=names.filter(x=>norm(x.name).length>3&&n.includes(norm(x.name))).sort((a,b)=>b.name.length-a.name.length)[0];
  if(match){
   const hits=t.filter(x=>norm(x.titulo)===norm(match.name));
   setAnswer(match.name,'<div class="ex-highlight"><strong>'+hits.length+'</strong><span>interpretaciones documentadas</span></div>'+cards([...new Map(hits.map(x=>[String(x.id_procesion),x.event])).values()].sort((a,b)=>String(b.fecha).localeCompare(String(a.fecha))),30),scopeText(sel));return;
  }
  setAnswer('Marchas más interpretadas'+(specific?' · '+specific:''),showRows(names,'interpretaciones'),scopeText(sel));return;
 }
 setAnswer('Explora el archivo musical','<p>Prueba con una pregunta como «¿Qué marchas se tocaron en la Soledad?», «Compositores más interpretados», «¿Cuántas veces se tocó Amarguras?» o «Compara 2026 y 2027».</p><p>También puedes utilizar los filtros de año y tipo de actividad, o seleccionar directamente una actuación en el listado.</p>');
}
document.addEventListener('DOMContentLoaded',()=>{
 const form=$('ask-form');form.onsubmit=e=>{e.preventDefault();answerQuestion($('ask-box').value);};
 document.querySelectorAll('[data-example]').forEach(b=>b.onclick=()=>answerQuestion(b.dataset.example));
 $('filter-year').onchange=renderOverview;$('filter-type').onchange=renderOverview;
 document.addEventListener('click',e=>{const b=e.target.closest('[data-event]');if(b){const ev=events.find(x=>String(x.id_procesion)===b.dataset.event);if(ev)eventDetail(ev);}});
 init();
});
})();