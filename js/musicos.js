(() => {
 const B=JCBanda,E=B.escape,$=id=>document.getElementById(id);
 const views=['resumen','calendario','confirmaciones','asistencias','escanear'];
 let auth,events=[],responses=[],attendance=[],profile=null,selectedDay=null,currentView='resumen',focusedEvent=null,loading=false;
 const today=B.dia(new Date());let year=Number(today.slice(0,4)),month=Number(today.slice(5,7))-1;
 const incoming=new URLSearchParams(location.hash.slice(1));
 const checkin={evento_id:incoming.get('evento'),token:incoming.get('token')};
 if(checkin.token)history.replaceState(null,'',location.pathname);
 const empty=(title,detail)=>`<div class="portal-empty"><strong>${E(title)}</strong><p>${E(detail)}</p></div>`;
 const response=id=>responses.find(x=>x.evento_id===id);
 const attended=id=>attendance.find(x=>x.evento_id===id);
 const upcoming=()=>events.filter(e=>Date.parse(e.fin)>=Date.now()&&e.estado!=='cancelado');
 const pending=()=>auth?.musico?upcoming().filter(e=>e.tipo==='actuacion'&&Date.parse(e.limite_respuesta)>=Date.now()&&!response(e.id)):[];
 const cameraStatus=(text,error=false)=>{$('portal-camera-status').textContent=text;$('portal-camera-status').dataset.error=String(error);};
 const reader=JCQRScanner.create({video:$('portal-camera'),onRead:acceptQR,onStatus:cameraStatus,onState:state=>{
  $('portal-camera-start').disabled=state==='starting'||state==='reading'||!auth?.musico;
  $('portal-camera-start').hidden=state==='scanning';$('portal-camera-stop').hidden=!['scanning','starting'].includes(state);
  $('portal-camera-placeholder').hidden=state==='scanning';
 }});
 function view(name,writeHash=true) {
  if(!views.includes(name))name='resumen';
  if(name!==currentView)B.notice('');
  if(currentView==='escanear'&&name!=='escanear')reader.stop();
  currentView=name;
  document.querySelectorAll('[data-portal-panel]').forEach(p=>p.hidden=p.dataset.portalPanel!==name);
  document.querySelectorAll('.portal-tools [data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
  const nav=document.querySelector('.portal-tools'),active=nav.querySelector('[aria-pressed="true"]');if(active)nav.scrollLeft=active.offsetLeft-nav.offsetLeft-nav.clientWidth/2+active.clientWidth/2;
  if(writeHash)history.replaceState(null,'',location.pathname+'#'+name);
 }
 function eventCard(ev,interactive=true) {
  const r=response(ev.id),a=attended(ev.id),cancelled=ev.estado==='cancelado';
  const closed=cancelled||Date.now()>Date.parse(ev.limite_respuesta)||Date.now()>=Date.parse(ev.fin);
  const map=ev.lugar;
  return `<article class="event" id="${interactive?'ev':'day'}-${ev.id}"><div class="portal-event-top"><span class="badge">${ev.tipo==='ensayo'?'Ensayo':'Actuación'}</span>${cancelled?'<span class="badge warn">Cancelado</span>':''}${ev.tipo==='actuacion'&&!r&&!closed?'<span class="badge warn">Por confirmar</span>':''}</div><h3>${E(ev.titulo)}</h3><time>${B.fecha(ev.inicio)} → ${new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'}).format(new Date(ev.fin))}</time><p class="portal-event-location">${E(ev.lugar)}<a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(map)}" target="_blank" rel="noopener noreferrer">Cómo llegar ↗</a></p>${ev.notas?`<p class="notes">${E(ev.notas)}</p>`:''}${interactive&&ev.tipo==='ensayo'?'<p class="muted">No requiere confirmación previa. Registra tu llegada con el QR del ensayo.</p>':interactive?`<p class="muted">${closed?'Plazo cerrado':'Responde hasta '+B.fecha(ev.limite_respuesta)}</p><div class="portal-response-row"><button data-response="voy" data-event="${ev.id}" aria-pressed="${r?.respuesta==='voy'}" ${closed||!auth.musico||!navigator.onLine?'disabled':''}>Voy</button><button data-response="no_voy" data-event="${ev.id}" aria-pressed="${r?.respuesta==='no_voy'}" ${closed||!auth.musico||!navigator.onLine?'disabled':''}>No voy</button></div><p class="portal-response-label"><span>${r?(r.respuesta==='voy'?'Confirmado: voy':'Confirmado: no voy'):'Sin responder'}</span>${r?` · <time>${B.fecha(r.actualizado_en)}</time>`:''}</p>`:`<button type="button" data-open-event="${ev.id}">Ver convocatoria</button>`}<div class="portal-event-footer">Asistencia: <b>${E(B.asistencia(a))}</b>${ev.fichaje_abierto&&Date.parse(ev.abierto_hasta)>Date.now()&&!cancelled?`<button type="button" data-view="escanear" class="portal-event-checkin">Escanear QR</button>`:''}</div></article>`;
 }
 function paintSummary() {
  const next=upcoming()[0],p=pending();
  $('portal-next-event').innerHTML=next?`<h2>${E(next.titulo)}</h2><p class="portal-next-time">${B.fecha(next.inicio)}</p><p class="portal-next-place">${E(next.lugar)}</p><p class="muted">${next.tipo==='ensayo'?'Ensayo sin confirmación previa. Ficha con el QR cuando llegues.':response(next.id)?(response(next.id).respuesta==='voy'?'Has confirmado que vas.':'Has indicado que no vas.'):'Todavía no has respondido a esta convocatoria.'}</p><button type="button" data-open-event="${next.id}">Ver convocatoria →</button>`:empty('Sin próximas convocatorias','Cuando administración publique un ensayo o actuación aparecerá aquí.');
  $('portal-stat-pending').textContent=p.length;$('portal-stat-upcoming').textContent=upcoming().length;
  $('portal-stat-present').textContent=attendance.filter(a=>a.estado==='presente').length;
  $('portal-stat-incidents').textContent=attendance.filter(a=>a.estado==='incidencia').length;
  $('portal-pending-badge').textContent=p.length;$('portal-pending-badge').hidden=!p.length;
  $('portal-profile').innerHTML=`<p class="portal-profile-name">${E(profile?.nombre||auth.profile.username||'Completa tu nombre')}</p><p class="portal-profile-detail">${E(profile?.instrumento||'Instrumento pendiente')}${profile?.incorporacion?`<br>En la banda desde ${E(profile.incorporacion)}`:''}</p>${!profile?.nombre||!profile?.instrumento?'<p class="muted">Completa tu nombre e instrumento para que administración pueda identificarte.</p>':''}`;
 }
 function paintCalendar() {
  $('banda-mes').textContent=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month,1)));
  let html=['L','M','X','J','V','S','D'].map(d=>`<div class="weekday">${d}</div>`).join('');
  const offset=(new Date(Date.UTC(year,month,1)).getUTCDay()+6)%7;html+='<div class="day empty" aria-hidden="true"></div>'.repeat(offset);
  for(let d=1;d<=new Date(Date.UTC(year,month+1,0)).getUTCDate();d++){
   const key=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
   const es=events.filter(e=>B.dia(e.inicio)===key&&e.estado!=='cancelado');
   html+=`<button type="button" class="day ${key===today?'today':''} ${key===selectedDay?'chosen':''}" data-day="${key}" aria-pressed="${key===selectedDay}" aria-label="${d}, ${es.length} convocatoria${es.length===1?'':'s'}"><span class="day-number">${d}</span><span class="day-dots">${es.slice(0,3).map(e=>`<span class="legend-dot ${e.tipo==='ensayo'?'rehearsal':'performance'}"></span>`).join('')}${es.length>3?'<small>+</small>':''}</span>${es[0]?`<span class="day-event-title">${E(es[0].titulo)}</span>`:''}</button>`;
  }
  $('banda-calendar').innerHTML=html;
  const prefix=`${year}-${String(month+1).padStart(2,'0')}`;
  const selected=events.filter(e=>selectedDay?B.dia(e.inicio)===selectedDay:B.dia(e.inicio).startsWith(prefix));
  $('banda-day-events').innerHTML=selected.map(e=>eventCard(e,false)).join('')||empty('No hay convocatorias',selectedDay?'No hay eventos para el día seleccionado.':'No hay convocatorias en este mes.');
  $('banda-day-title').textContent=selectedDay?`Convocatorias · ${selectedDay.split('-').reverse().join('/')}`:'Convocatorias del mes';$('banda-all').hidden=!selectedDay;
 }
 function paintConfirmations() {
  const filter=$('portal-event-filter').value,search=$('portal-event-search').value.trim().toLocaleLowerCase('es');
  const list=events.filter(e=>focusedEvent?e.id===focusedEvent:Date.parse(e.fin)>=Date.now()).filter(e=>filter==='all'||(filter==='pending'?pending().some(p=>p.id===e.id):e.tipo===filter)).filter(e=>!search||(e.titulo+' '+e.lugar).toLocaleLowerCase('es').includes(search));
  $('banda-events').innerHTML=list.map(e=>eventCard(e)).join('')||empty('No hay convocatorias en esta selección',filter==='pending'?'Has respondido a todas las convocatorias abiertas.':'Prueba con otro filtro o espera a que se publique una nueva convocatoria.');
 }
 function paintHistory() {
  const list=events.filter(e=>Date.parse(e.inicio)<=Date.now()||attended(e.id)).slice().reverse();
  $('banda-history').innerHTML=list.map(e=>{
   const a=attended(e.id),status=e.estado==='cancelado'?'Cancelado':B.asistencia(a);
   return `<article class="portal-history-item"><div><h3>${E(e.titulo)}</h3><p class="muted">${B.fecha(e.inicio)} · ${E(e.lugar)}</p>${a?`<p class="portal-history-meta">Registro: ${B.fecha(a.registrado_en)} · ${a.metodo==='qr'?'QR':'Registro manual'}</p>`:''}${a?.motivo?`<p class="portal-history-note">${E(a.motivo)}</p>`:''}</div><span class="badge ${a?.estado==='presente'?'good':a?.estado==='incidencia'?'warn':''}">${E(status)}</span></article>`;
  }).join('')||empty('Tu historial está por estrenar','Aquí aparecerán las asistencias de tus ensayos y actuaciones.');
 }
 function paint(){paintSummary();paintCalendar();paintConfirmations();paintHistory();paintCheckin();}
 function paintCheckin() {
  $('banda-checkin').hidden=!checkin.token;
  if(!checkin.token)return;
  const ev=events.find(e=>e.id===checkin.evento_id);
  if(!ev){$('banda-checkin').hidden=true;cameraStatus('Este QR no corresponde a una convocatoria accesible para tu cuenta.',true);return;}
  $('banda-checkin-event').textContent=`${ev.titulo} · ${B.fecha(ev.inicio)}`;
  const a=attended(ev.id);$('banda-fichar').disabled=!!a||!auth.musico||!navigator.onLine;
  $('banda-fichar').textContent=a?'Asistencia ya registrada':'Confirmar mi asistencia';
  $('portal-checkin-state').textContent=a?`Tu registro: ${B.asistencia(a)}.${a.estado==='incidencia'?' Consulta a administración para revisarlo.':''}`:'QR leído. Confirma tu llegada para guardar el registro de asistencia.';
 }
 async function load() {
  if(loading)return;loading=true;$('banda-refresh').disabled=true;
  try {
   const data=await Promise.all([B.query('banda_eventos',q=>q.order('inicio')),B.query('banda_respuestas',q=>q.eq('usuario_id',auth.user.id)),B.query('banda_asistencias',q=>q.eq('usuario_id',auth.user.id)),B.query('banda_fichas',q=>q.eq('usuario_id',auth.user.id))]);
   [events,responses,attendance]=data;profile=data[3][0]||null;paint();
   $('portal-last-update').textContent='Actualizado a las '+new Intl.DateTimeFormat('es-ES',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Madrid'}).format(new Date())+' · Hora peninsular';
  }finally{loading=false;$('banda-refresh').disabled=!navigator.onLine;}
 }
 async function run(fn){try{await fn();}catch(e){B.notice(e.message,true);}}
 function acceptQR(text) {
  try {
   const parsed=JCQRScanner.parse(text);Object.assign(checkin,parsed);reader.stop();view('escanear');
   cameraStatus('QR leído. Comprueba la convocatoria y confirma tu asistencia.');
   run(async()=>{await load();paintCheckin();$('banda-checkin').scrollIntoView({behavior:'smooth',block:'nearest'});});return true;
  }catch(error){checkin.token=null;checkin.evento_id=null;if(auth)paintCheckin();cameraStatus(error.message,true);return false;}
 }
 function route() {
  const p=new URLSearchParams(location.hash.slice(1));
  if(p.get('token')){acceptQR(location.href);return;}
  view(location.hash.slice(1)||'resumen',false);
 }
 document.addEventListener('DOMContentLoaded',()=>run(async()=>{
  if(checkin.token)sessionStorage.setItem('jc_banda_return',`/templates/musicos.html#evento=${encodeURIComponent(checkin.evento_id)}&token=${encodeURIComponent(checkin.token)}`);
  auth=await B.access();if(!auth)return;sessionStorage.removeItem('jc_banda_return');
  $('banda-admin-link').hidden=!auth.admin;$('banda-refresh').hidden=false;
  $('banda-identidad').textContent=auth.musico?`Hola, ${auth.profile.username||'músico'}. Este es tu espacio en la banda.`:'Acceso de administración. Activa también el permiso Músico para confirmar y fichar personalmente.';
  $('portal-camera-start').disabled=!auth.musico;
  await load();$('banda-content').hidden=false;
  if(checkin.token){view('escanear');cameraStatus('QR leído. Confirma tu llegada.');}else route();
  onlineState();
 }));
 document.addEventListener('click',event=>{
  const v=event.target.closest('[data-view]');
  if(v){if(v.dataset.view==='confirmaciones'){focusedEvent=null;paintConfirmations();}if(v.hasAttribute('data-pending-shortcut')){$('portal-event-filter').value='pending';focusedEvent=null;paintConfirmations();}view(v.dataset.view);document.querySelector('.portal-tools').scrollIntoView({block:'nearest',behavior:'smooth'});return;}
  const open=event.target.closest('[data-open-event]');if(open){focusedEvent=open.dataset.openEvent;$('portal-event-filter').value='all';$('portal-event-search').value='';paintConfirmations();view('confirmaciones');return;}
 });
 $('banda-calendar').addEventListener('click',event=>{const b=event.target.closest('[data-day]');if(b){selectedDay=b.dataset.day;paintCalendar();}});
 $('banda-events').addEventListener('click',event=>run(async()=>{
  const b=event.target.closest('[data-response]');if(!b)return;if(!navigator.onLine)throw Error('Necesitas conexión para guardar tu respuesta.');b.disabled=true;
  try{await B.rpc('respuesta',{evento_id:b.dataset.event,respuesta:b.dataset.response});await load();B.notice('Tu respuesta ha quedado guardada.');}finally{if(b.isConnected)b.disabled=false;}
 }));
 $('banda-fichar').addEventListener('click',event=>run(async()=>{
  const b=event.currentTarget;if(!navigator.onLine)throw Error('Necesitas conexión para registrar la asistencia.');b.disabled=true;b.textContent='Registrando asistencia…';B.notice('Registrando tu llegada…');
  try{const r=await B.rpc('fichar',{...checkin});await load();B.notice(r.estado==='presente'?'Asistencia registrada correctamente.':'Incidencia registrada. Administración debe revisar el registro; todavía no cuenta como presencia.');paintCheckin();}
  catch(error){b.disabled=false;b.textContent='Volver a intentar el fichaje';$('portal-checkin-state').textContent=error.message;if(/caducado|fichaje est[aá] cerrado/i.test(error.message)){checkin.token=null;paintCheckin();cameraStatus(error.message,true);}throw error;}
 }));
 $('portal-camera-start').onclick=()=>{if(auth?.musico){checkin.token=null;paintCheckin();reader.start();}};
 $('portal-camera-stop').onclick=()=>{reader.stop();cameraStatus('Cámara cerrada. Puedes abrirla de nuevo cuando quieras.');};
 $('portal-qr-image').addEventListener('change',event=>run(async()=>{const file=event.target.files[0];try{await reader.image(file);}catch(error){cameraStatus(error.message,true);}finally{event.target.value='';}}));
 $('portal-qr-submit').onclick=()=>acceptQR($('portal-qr-link').value);
 $('portal-scan-again').onclick=()=>{B.notice('');checkin.token=null;checkin.evento_id=null;paintCheckin();cameraStatus('Pulsa Abrir cámara para leer el QR actual.');$('portal-camera-stage').scrollIntoView({behavior:'smooth',block:'start'});};
 for(const [id,delta] of [['banda-prev',-1],['banda-next',1]])$(id).onclick=()=>{const date=new Date(Date.UTC(year,month+delta,1));year=date.getUTCFullYear();month=date.getUTCMonth();selectedDay=null;paintCalendar();};
 $('banda-hoy').onclick=()=>{year=Number(today.slice(0,4));month=Number(today.slice(5,7))-1;selectedDay=null;paintCalendar();};$('banda-all').onclick=()=>{selectedDay=null;paintCalendar();};
 for(const id of ['portal-event-filter','portal-event-search'])$(id).addEventListener(id.endsWith('search')?'input':'change',()=>{focusedEvent=null;paintConfirmations();});
 $('banda-refresh').onclick=()=>run(load);
 function onlineState(){$('portal-offline').hidden=navigator.onLine;$('banda-refresh').disabled=!navigator.onLine||loading;if(auth){paintConfirmations();paintCheckin();}}
 window.addEventListener('online',onlineState);window.addEventListener('offline',onlineState);
 window.addEventListener('hashchange',()=>{if(auth)route();});window.addEventListener('popstate',()=>{if(auth)route();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){reader.stop();cameraStatus('Cámara pausada. Pulsa Abrir cámara para continuar.');}});
 window.addEventListener('pagehide',()=>reader.stop());
})();
