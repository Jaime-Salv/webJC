(() => {
 const B=JCBanda, E=B.escape;
 let auth,events=[],responses=[],attendance=[],selectedDay=null;
 const today=B.dia(new Date());let year=Number(today.slice(0,4)),month=Number(today.slice(5,7))-1;
 const params=new URLSearchParams(location.hash.slice(1));
 const checkin={evento_id:params.get('evento'),token:params.get('token')};
 if(checkin.token) history.replaceState(null,'',location.pathname);
 function card(ev) {
  const r=responses.find(x=>x.evento_id===ev.id), a=attendance.find(x=>x.evento_id===ev.id);
  const closed=ev.estado==='cancelado'||Date.now()>Date.parse(ev.limite_respuesta)||Date.now()>=Date.parse(ev.fin);
  return `<article class="event" id="ev-${ev.id}"><span class="badge">${ev.tipo==='ensayo'?'Ensayo':'Actuación'}</span> ${ev.estado==='cancelado'?'<span class="badge warn">Cancelado</span>':''}<h3>${E(ev.titulo)}</h3><time>${B.fecha(ev.inicio)}</time><p>${E(ev.lugar)}</p>${ev.notas?`<p class="notes">${E(ev.notas)}</p>`:''}<p class="muted">Responde hasta ${B.fecha(ev.limite_respuesta)}</p><div class="row"><button data-response="voy" data-event="${ev.id}" aria-pressed="${r?.respuesta==='voy'}" ${closed?'disabled':''}>Voy</button><button data-response="no_voy" data-event="${ev.id}" aria-pressed="${r?.respuesta==='no_voy'}" ${closed?'disabled':''}>No voy</button><span class="badge ${r?'':'warn'}">${r?(r.respuesta==='voy'?'Confirmado: voy':'Confirmado: no voy'):'Sin responder'}</span></div><p class="muted">${closed?'Plazo cerrado · ':''}Asistencia: ${E(B.asistencia(a))}</p></article>`;
 }
 function paint() {
  document.getElementById('banda-mes').textContent=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month,1)));
  const calendar=document.getElementById('banda-calendar');let html=['L','M','X','J','V','S','D'].map(d=>`<div class="weekday">${d}</div>`).join('');
  const offset=(new Date(Date.UTC(year,month,1)).getUTCDay()+6)%7;
  html+='<div class="day empty"></div>'.repeat(offset);
  for(let d=1;d<=new Date(Date.UTC(year,month+1,0)).getUTCDate();d++) {
   const key=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
   const es=events.filter(e=>B.dia(e.inicio)===key);
   html+=`<div class="day ${key===today?'today':''}"><span>${d}</span>${es.map(e=>`<button data-day="${key}" title="${E(e.titulo)}" aria-label="${E(e.titulo)}, ${d}">${e.estado==='cancelado'?'× ':''}${E(e.titulo)}</button>`).join('')}</div>`;
  }
  calendar.innerHTML=html;
  const list=events.filter(e=>selectedDay?B.dia(e.inicio)===selectedDay:Date.parse(e.fin)>=Date.now());
  document.getElementById('banda-events').innerHTML=list.map(card).join('')||'<p class="muted">No hay convocatorias en esta selección.</p>';
  document.getElementById('banda-all').hidden=!selectedDay;
  document.getElementById('banda-list-title').textContent=selectedDay?`Convocatorias · ${selectedDay.split('-').reverse().join('/')}`:'Próximas convocatorias';
  const past=events.filter(e=>Date.parse(e.inicio)<=Date.now()).slice().reverse();
  document.getElementById('banda-history').innerHTML=past.length?`<div class="table-scroll"><table><thead><tr><th>Evento</th><th>Asistencia</th><th>Registro</th></tr></thead><tbody>${past.map(e=>{const a=attendance.find(x=>x.evento_id===e.id);return `<tr><td>${E(e.titulo)}<br><small>${B.fecha(e.inicio)}</small></td><td>${e.estado==='cancelado'?'Cancelado':E(B.asistencia(a))}${a?.motivo?`<br><small>${E(a.motivo)}</small>`:''}</td><td>${a?`${B.fecha(a.registrado_en)} · ${E(a.metodo)}`:'—'}</td></tr>`;}).join('')}</tbody></table></div>`:'<p class="muted">Todavía no hay asistencias que mostrar.</p>';
 }
 async function load() {
  const data=await Promise.all([B.query('banda_eventos',q=>q.order('inicio')),B.query('banda_respuestas',q=>q.eq('usuario_id',auth.user.id)),B.query('banda_asistencias',q=>q.eq('usuario_id',auth.user.id))]);
  [events,responses,attendance]=data;paint();
  if(checkin.token) {
   const ev=events.find(x=>x.id===checkin.evento_id);
   if(!ev) {B.notice('Este QR no corresponde a una convocatoria accesible para tu cuenta.',true);return;}
   document.getElementById('banda-checkin').hidden=false;
   document.getElementById('banda-checkin-event').textContent=`${ev.titulo} · ${B.fecha(ev.inicio)}`;
   const a=attendance.find(x=>x.evento_id===ev.id);document.getElementById('banda-fichar').disabled=!!a;
   if(a) B.notice(`Tu registro: ${B.asistencia(a)}.`);
  }
 }
 async function run(fn) {try{await fn();}catch(e){B.notice(e.message,true);}}
 window.addEventListener('hashchange',()=>run(async()=>{
  const next=new URLSearchParams(location.hash.slice(1));
  if(!next.get('token'))return;
  checkin.evento_id=next.get('evento');checkin.token=next.get('token');
  history.replaceState(null,'',location.pathname);
  if(auth)await load();
 }));
 document.addEventListener('DOMContentLoaded',()=>run(async()=> {
  // Conservar la vuelta de OAuth antes de retirar el token de la barra de dirección.
  if(checkin.token) sessionStorage.setItem('jc_banda_return',`/templates/musicos.html#evento=${encodeURIComponent(checkin.evento_id)}&token=${encodeURIComponent(checkin.token)}`);
  auth=await B.access();if(!auth)return;
  sessionStorage.removeItem('jc_banda_return');
  document.getElementById('banda-admin-link').hidden=!auth.admin;
  document.getElementById('banda-identidad').textContent=`Hola, ${auth.profile.username||'músico'}. Consulta tus convocatorias y confirma tu disponibilidad.`;
  await load();document.getElementById('banda-content').hidden=false;
 }));
 document.getElementById('banda-calendar').addEventListener('click',e=>{const b=e.target.closest('[data-day]');if(b){selectedDay=b.dataset.day;paint();document.getElementById('banda-events').scrollIntoView({behavior:'smooth',block:'start'});}});
 document.getElementById('banda-events').addEventListener('click',e=>run(async()=>{
  const b=e.target.closest('[data-response]');if(!b)return;b.disabled=true;
  try{await B.rpc('respuesta',{evento_id:b.dataset.event,respuesta:b.dataset.response});await load();B.notice('Tu respuesta ha quedado guardada.');}finally{b.disabled=false;}
 }));
 document.getElementById('banda-fichar').addEventListener('click',e=>run(async()=> {
  const b=e.currentTarget;b.disabled=true;B.notice('Obteniendo ubicación…');
  try{const pos=await B.geo();const r=await B.rpc('fichar',{...checkin,...pos});await load();B.notice(r.estado==='presente'?'Asistencia registrada correctamente.':'Incidencia registrada. Administración debe revisar la ubicación; todavía no cuenta como presencia.');}
  catch(err){b.disabled=false;throw err;}
 }));
 for(const [id,delta] of [['banda-prev',-1],['banda-next',1]])document.getElementById(id).onclick=()=>{const d=new Date(Date.UTC(year,month+delta,1));year=d.getUTCFullYear();month=d.getUTCMonth();paint();};
 document.getElementById('banda-hoy').onclick=()=>{year=Number(today.slice(0,4));month=Number(today.slice(5,7))-1;selectedDay=null;paint();};
 document.getElementById('banda-all').onclick=()=>{selectedDay=null;paint();};
 document.getElementById('banda-refresh').onclick=()=>run(load);
})();
