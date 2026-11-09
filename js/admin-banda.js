(() => {
 const B=JCBanda,E=B.escape;
 let events=[],members=[],profiles=[],extras=[],responses=[],attendance=[],roster=[],selected=null,manualUser=null,qrEvent=null,qrTimer=null,qrDeadline=0,qrBusy=false;
 const $=id=>document.getElementById(id);
 const member=id=>members.find(x=>x.usuario_id===id);
 const name=id=>member(id)?.nombre||profiles.find(x=>x.id===id)?.nombre_completo||profiles.find(x=>x.id===id)?.username||'Sin nombre';
 const instrument=id=>member(id)?.instrumento||'Sin instrumento';
 async function run(fn){try{await fn();}catch(e){B.notice(e.message,true);}}
 async function load() {
  [events,members,profiles,extras]=await Promise.all([B.query('banda_eventos',q=>q.order('inicio')),B.query('banda_fichas'),B.query('perfiles',q=>q.order('username')),B.query('banda_detalles')]);
  const finales=await B.query('maestro_procesiones',q=>q.eq('estado','Finalizada').order('fecha',{ascending:false}));
  events.forEach(e=>{e.finalizado=finales.some(p=>(e.procesion_id&&String(p.id_procesion)===String(e.procesion_id))||(e.concierto_id&&String(p.concierto_id)===String(e.concierto_id)));e.extra=extras.find(d=>d.evento_id===e.id)||{};e.convocatoria=e.extra.convocatoria||e.inicio;});
  paintEvents();if(selected)await details(selected);
 }
 function paintEvents() {
  const list=events.filter(e=>$('ba-kind').value==='all'||e.tipo===$('ba-kind').value).filter(e=>$('ba-filter').value==='all'||Date.parse(e.fin)>=Date.now()&&!e.finalizado);
  $('ba-events').innerHTML=list.map(e=>`<article class="event ${e.id===selected?'selected':''}" style="margin-bottom:12px"><span class="badge">${e.tipo==='ensayo'?'Ensayo':e.tipo==='extraordinario'?'Extraordinario · Privado':'Actuación'}</span>${e.finalizado?' <span class="badge">Finalizada</span>':''}${e.estado==='cancelado'?' <span class="badge warn">Cancelado</span>':''}<h3>${E(e.titulo)}</h3><p class="muted">${B.fecha(e.inicio)}<br>${E(e.lugar)}</p><div class="row"><button data-select="${e.id}" type="button">Respuestas y asistencia</button><button type="button" class="primary" data-qr="${e.id}" ${e.estado==='cancelado'||e.finalizado||Date.parse(e.fin)<=Date.now()?'disabled':''}>QR de fichaje</button></div></article>`).join('')||'<p class="muted">No hay convocatorias. Crea la primera.</p>';
 }
 async function details(id) {
  selected=id;const ev=events.find(e=>e.id===id);if(!ev)return;
  const detailData=await Promise.all([B.query('banda_convocados',q=>q.eq('evento_id',id)),B.query('banda_respuestas',q=>q.eq('evento_id',id)),B.query('banda_asistencias',q=>q.eq('evento_id',id))]);
  if(selected!==id)return;[roster,responses,attendance]=detailData;
  const grouped=new Map();
  roster.forEach(c=>{const label=instrument(c.usuario_id).trim().replace(/\s+/g,' ')||'Sin instrumento',key=label.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('es');
   if(!grouped.has(key))grouped.set(key,{label,total:0,voy:[],no:[],pending:[]});
   const group=grouped.get(key),r=responses.find(x=>x.usuario_id===c.usuario_id);group.total++;group[r?.respuesta==='voy'?'voy':r?.respuesta==='no_voy'?'no':'pending'].push(name(c.usuario_id));
  });
  for(const [label,needed] of Object.entries(ev.extra?.objetivos||{})){const key=JCPortal.normal(label);if(!grouped.has(key))grouped.set(key,{label,total:0,voy:[],no:[],pending:[]});grouped.get(key).objetivo=Number(needed);}
  const forecast=[...grouped.values()].sort((a,b)=>a.label.localeCompare(b.label,'es',{sensitivity:'base'})).map(g=>`<section class="ba-instrument"><h4>${E(g.label)} <span class="muted">${g.total} músico${g.total===1?'':'s'}</span></h4>${g.objetivo!=null?`<p class="bp-coverage ${g.voy.length<g.objetivo?'short':''}">Objetivo: ${g.objetivo} · Confirmados: ${g.voy.length} · Faltan: ${Math.max(0,g.objetivo-g.voy.length)}</p>`:''}<div class="ba-instrument-columns">${[['voy','Voy'],['no','No voy'],['pending','Sin responder']].map(([key,label])=>`<div class="ba-instrument-status" data-forecast-status="${key}"><h5>${label} <span class="badge">${g[key].length}</span></h5>${g[key].length?`<ul>${g[key].sort((a,b)=>a.localeCompare(b,'es',{sensitivity:'base'})).map(n=>`<li>${E(n)}</li>`).join('')}</ul>`:'<p class="muted">Nadie</p>'}</div>`).join('')}</div></section>`).join('')||'<p class="muted">Todavía no hay músicos convocados.</p>';
  const rehearsal=ev.tipo==='ensayo';
  const voy=responses.filter(r=>r.respuesta==='voy').length,no=responses.filter(r=>r.respuesta==='no_voy').length,pres=attendance.filter(a=>a.estado==='presente').length;
  $('ba-detail').innerHTML=`<h2>${E(ev.titulo)}</h2><p class="muted">${B.fecha(ev.inicio)} · ${E(ev.lugar)}</p><div class="row">${rehearsal?'<p class="muted">Ensayo sin confirmación previa. Solo se registra la asistencia.</p>':`<div class="stat"><b>${voy}</b>Voy</div><div class="stat"><b>${no}</b>No voy</div><div class="stat"><b>${roster.length-responses.length}</b>Sin responder</div>`}<div class="stat"><b>${pres}</b>Presentes</div></div><p class="muted">Fichaje: ${ev.fichaje_abierto&&Date.parse(ev.abierto_hasta)>Date.now()?'abierto hasta '+B.fecha(ev.abierto_hasta):'cerrado'}.</p><p class="muted">El QR de asistencia está disponible desde ${B.fecha(Date.parse(ev.convocatoria||ev.inicio)-2*60*60*1000)} hasta ${B.fecha(ev.fin)}. El músico solo necesita iniciar sesión y escanear el QR vigente. Cada evento tiene un QR único que permanece igual y puede imprimirse.</p><div class="row"><button data-action="edit">Ajustes de convocatoria</button>${ev.concierto_id||ev.procesion_id?`${ev.finalizado?'':'<button data-action="start-live" class="primary">Empezar directo</button>'}<button data-action="source">Editar publicación</button>`:''}<button data-action="convocar">Añadir nuevos músicos</button><button data-action="open" class="primary" ${ev.estado==='cancelado'?'disabled':''}>Ver QR / abrir fichaje</button><button data-action="close">Cerrar fichaje</button><button data-action="export">Exportar CSV</button><button data-action="cancel" ${ev.estado==='cancelado'?'disabled':''}>Cancelar evento</button></div><section id="bp-event-extra"></section>${rehearsal?'':`<h3>Previsión por instrumento</h3><div id="ba-instrument-forecast">${forecast}</div>`}<h3>Músicos convocados (${roster.length})</h3><p class="muted">«Sin fichaje» no es una ausencia confirmada. Revisa los casos pendientes. La lista se actualiza automáticamente.</p><div class="table-scroll"><table><thead><tr><th>Músico</th><th>Confirmación</th><th>Asistencia</th><th>Revisión</th></tr></thead><tbody>${roster.slice().sort((a,b)=>(instrument(a.usuario_id)+name(a.usuario_id)).localeCompare(instrument(b.usuario_id)+name(b.usuario_id),'es')).map(c=>{
   const r=responses.find(x=>x.usuario_id===c.usuario_id),a=attendance.find(x=>x.usuario_id===c.usuario_id);
   return `<tr><td>${E(name(c.usuario_id))}<br><small>${E(instrument(c.usuario_id))}</small></td><td>${rehearsal?'No requerida':r?(r.respuesta==='voy'?'Voy':'No voy'):'Sin responder'}${r?`<br><small>${B.fecha(r.actualizado_en)}</small>`:''}</td><td><span class="badge ${a?.estado==='presente'?'good':a?.estado==='incidencia'?'warn':''}">${E(B.asistencia(a))}</span>${a?`<br><small>${B.fecha(a.registrado_en)} · ${E(a.metodo)}</small>${a.motivo?`<p class="muted">${E(a.motivo)}</p>`:''}`:''}</td><td><button data-manual="${c.usuario_id}">Revisar</button></td></tr>`;
  }).join('')}</tbody></table></div><details><summary>Historial de cambios del evento</summary><div id="ba-audit">Cargando…</div></details>`;
  paintEvents();
  ev.memberNames=Object.fromEntries(roster.map(c=>[c.usuario_id,name(c.usuario_id)]));document.dispatchEvent(new CustomEvent('banda:detalle',{detail:ev}));
  const audit=await B.query('banda_auditoria',q=>q.eq('evento_id',id).order('creado_en',{ascending:false}).limit(100));
  if(selected!==id)return;
  $('ba-audit').innerHTML=audit.map(a=>`<p class="muted">${B.fecha(a.creado_en)} · ${E(name(a.actor_id))} · ${E(a.accion)}${a.usuario_id?' · '+E(name(a.usuario_id)):''}${a.detalle?.motivo?' · '+E(a.detalle.motivo):''}</p>`).join('')||'Sin cambios.';
 }
 function edit(ev) {
  const f=$('ba-form');f.reset();f.elements.id.value=ev?.id||'';
  if(ev){for(const k of ['titulo','tipo','lugar','notas'])f.elements[k].value=ev[k]??'';for(const k of ['inicio','fin','limite_respuesta'])f.elements[k].value=B.localInput(ev[k]);}
  const linked=ev&&(ev.concierto_id||ev.procesion_id);
  for(const k of ['titulo','inicio','fin','lugar'])f.elements[k].readOnly=!!linked;
  f.elements.tipo.value=ev?.tipo||'extraordinario';f.elements.tipo.disabled=true; $('ba-deadline-label').hidden=ev?.tipo==='ensayo';
  $('ba-source-info').hidden=!linked;$('ba-source-info').textContent=linked?'Actuación vinculada a una publicación. Fecha, título y lugar se editan en su ficha pública. Aquí puedes ajustar el plazo de respuesta y las notas privadas.':'';
  $('ba-editor-title').textContent=ev?'Ajustes de convocatoria':'Nuevo evento extraordinario · Privado';$('ba-editor').hidden=false;$('ba-editor').scrollIntoView({behavior:'smooth'});f.elements.titulo.focus();
 }
 function stopQr(){clearInterval(qrTimer);qrTimer=null;$('ba-qr-image').innerHTML='';qrDeadline=0;qrEvent=null;$('ba-qr-print').disabled=true;}
 async function refreshQr() {
  if(!qrEvent||qrBusy)return;qrBusy=true;$('ba-qr-image').innerHTML='';$('ba-qr-error').hidden=true;$('ba-qr-print').disabled=true;
  try {
   const data=await B.rpc('qr',{evento_id:qrEvent});
   if(!$('ba-qr-dialog').open)return;
   if(typeof qrcode!=='function')throw Error('No se ha podido cargar el generador QR. Recarga la página.');
   const url=new URL('/templates/musicos.html',location.origin);url.hash=new URLSearchParams({evento:qrEvent,token:data.token}).toString();
   const qr=qrcode(0,'M');qr.addData(url.href);qr.make();$('ba-qr-image').innerHTML=qr.createSvgTag({cellSize:5,margin:4,scalable:true});
   const evento=events.find(e=>e.id===qrEvent);
    qrDeadline=data.fijo?0:performance.now()+(Date.parse(data.expira)-Date.parse(data.servidor));
    $('ba-qr-count').textContent=data.fijo?'QR fijo de este evento. Puedes imprimirlo y colocarlo en la entrada. Solo permite fichar durante el horario autorizado.':'';
    $('ba-qr-print').disabled=!evento;
  }catch(e){$('ba-qr-error').textContent=e.message;$('ba-qr-error').hidden=false;qrDeadline=0;$('ba-qr-count').textContent='QR no disponible. Pulsa renovar.';}
  finally{qrBusy=false;}
 }
 async function openQr(id=selected){
  const ev=events.find(e=>e.id===id);if(!ev)throw Error('No se encuentra la convocatoria. Actualiza el listado.');
  if(ev.estado==='cancelado'||Date.parse(ev.fin)<=Date.now())throw Error('No se puede abrir el fichaje de un evento cancelado o finalizado.');
  const momentoApertura=Date.parse(ev.convocatoria||ev.inicio)-2*60*60*1000;
  if(Date.now()>=momentoApertura) await B.rpc('abrir',{evento_id:id});
  qrEvent=id;$('ba-qr-title').textContent=ev.titulo+' · '+ev.lugar;
  $('ba-qr-dialog').showModal();await refreshQr();
  clearInterval(qrTimer);

  await load();}
 function exportCsv(){const ev=events.find(e=>e.id===selected);B.csv([['Evento','Inicio (Madrid)','Músico','Instrumento','Confirmación','Respuesta registrada','Asistencia','Método','Registro de llegada','Última revisión','Revisado por','Motivo'],...roster.map(c=>{const r=responses.find(x=>x.usuario_id===c.usuario_id),a=attendance.find(x=>x.usuario_id===c.usuario_id);return [ev.titulo,B.fecha(ev.inicio),name(c.usuario_id),instrument(c.usuario_id),ev.tipo==='ensayo'?'No requerida':r?.respuesta||'Sin responder',r?B.fecha(r.actualizado_en):'',B.asistencia(a),a?.metodo||'',a?B.fecha(a.registrado_en):'',a?B.fecha(a.actualizado_en):'',a?.revisado_por?name(a.revisado_por):'',a?.motivo||''];})],`asistencia-${ev.tipo}-${B.dia(ev.inicio)}.csv`);}
 async function memberEdit(id){members=await B.query('banda_fichas');const f=$('ba-member-form'),m=member(id);f.reset();f.elements.usuario_id.value=id;f.elements.nombre.value=m?.nombre||profiles.find(p=>p.id===id)?.nombre_completo||'';f.elements.instrumento.value=m?.instrumento||'';f.elements.incorporacion.value=m?.incorporacion||'';$('ba-member-error').hidden=true;$('ba-member-dialog').showModal();}
 document.addEventListener('admin:ready',()=>run(async()=>{
  $('ba-editor-close').onclick=()=>$('ba-editor').hidden=true;
  $('ba-create-extra').onclick=()=>edit(null);
  $('ba-refresh').onclick=()=>run(load);$('ba-filter').onchange=paintEvents;$('ba-kind').onchange=paintEvents;
  $('ba-events').onclick=e=>{const b=e.target.closest('[data-select],[data-qr]');if(!b)return;run(async()=>{b.disabled=true;try{const id=b.dataset.qr||b.dataset.select;await details(id);if(b.dataset.qr)await openQr(id);}finally{if(b.isConnected)b.disabled=false;}});};
  document.addEventListener('banda:select',e=>run(async()=>{await load();await details(e.detail);$('ba-detail').scrollIntoView({behavior:'smooth'});}));
  document.addEventListener('banda:qr-evento',e=>run(async()=>{await load();await details(e.detail);await openQr(e.detail);}));
  document.addEventListener('banda:qr-publicacion',e=>run(async()=>{document.querySelector('[data-admin-target="banda"]').click();await load();const ev=events.find(x=>e.detail.concierto_id?String(x.concierto_id)===String(e.detail.concierto_id):String(x.procesion_id)===String(e.detail.procesion_id));if(!ev)throw Error('Publica primero la actuación con fecha, inicio, fin y lugar para generar su convocatoria y QR de asistencia.');await details(ev.id);await openQr(ev.id);}));
  $('ba-form').onsubmit=e=>{e.preventDefault();run(async()=>{const b=e.submitter;b.disabled=true;try{const data=Object.fromEntries(new FormData(e.target));data.tipo=events.find(ev=>ev.id===data.id)?.tipo||'extraordinario';for(const k of ['inicio','fin','limite_respuesta'])data[k]=B.madridISO(data[k]);const r=await B.rpc('evento',data);selected=r.id;$('ba-editor').hidden=true;await load();document.dispatchEvent(new Event('agenda:refresh'));B.notice('Convocatoria guardada.');}finally{b.disabled=false;}});};
  $('ba-detail').onclick=e=>run(async()=>{const b=e.target.closest('button');if(!b)return;
   if(b.dataset.manual){manualUser=b.dataset.manual;const a=attendance.find(x=>x.usuario_id===manualUser);$('ba-manual-name').textContent=name(manualUser);$('ba-manual-form').reset();$('ba-manual-form').elements.estado.value=a?.estado||'presente';$('ba-manual-error').hidden=true;$('ba-manual-dialog').showModal();return;}
   const act=b.dataset.action;if(!act)return;b.disabled=true;
   try{if(act==='start-live'){document.dispatchEvent(new CustomEvent('agenda:start-live',{detail:{evento_id:selected,button:b}}));return;}else if(act==='source'){const ev=events.find(e=>e.id===selected);if(ev.concierto_id){document.querySelector('[data-admin-target="conciertos"]').click();await cargarConciertosAdmin();$('select-concierto-admin').value=ev.concierto_id;seleccionarConciertoAdmin();}else document.dispatchEvent(new CustomEvent('agenda:edit-procession',{detail:ev.procesion_id}));}else if(act==='edit')edit(events.find(e=>e.id===selected));else if(act==='export')exportCsv();else if(act==='open')await openQr();else{if(act==='cancel'&&!confirm('¿Cancelar esta convocatoria? Se conservarán las respuestas y el historial.'))return;await B.rpc({convocar:'convocar',close:'cerrar',cancel:'cancelar'}[act],{evento_id:selected});await load();document.dispatchEvent(new Event('agenda:refresh'));B.notice('Convocatoria actualizada.');}}finally{b.disabled=false;}
  });
  $('ba-qr-stop').onclick=async e=>{const id=qrEvent,b=e.currentTarget;if(!id)return;b.disabled=true;try{await B.rpc('cerrar',{evento_id:id});$('ba-qr-dialog').close();await load();B.notice('Fichaje cerrado. El QR ya no permite registrar llegadas.');}catch(err){$('ba-qr-error').textContent=err.message;$('ba-qr-error').hidden=false;}finally{b.disabled=false;}};
  $('ba-qr-hide').onclick=()=>$('ba-qr-dialog').close();$('ba-qr-dialog').addEventListener('close',stopQr);$('ba-qr-retry').onclick=()=>run(refreshQr);
  $('ba-qr-print').onclick=()=>{
   const ev=events.find(e=>e.id===qrEvent),svg=$('ba-qr-image').querySelector('svg');
   if(!ev||!svg){B.notice('Abre primero el QR del evento para imprimirlo.',true);return;}
   const popup=window.open('','_blank','width=800,height=1000');
   if(!popup){B.notice('El navegador ha bloqueado la impresión. Permite las ventanas emergentes e inténtalo otra vez.',true);return;}
   const title=E(ev.titulo),place=E(ev.lugar),date=E(B.fecha(ev.inicio)),end=E(B.fecha(ev.fin));
   popup.document.open();
   popup.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR de asistencia</title><style>
    @page{size:A4;margin:18mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;text-align:center;color:#111;margin:0;padding:18px}
    h1{font-size:27px;margin:22px 0 12px}h2{font-size:21px;margin:0 0 12px}.info{font-size:17px;line-height:1.6}
    svg{display:block;width:95mm!important;height:95mm!important;margin:22px auto;max-width:100%}
    .notice{font-size:15px;max-width:480px;margin:15px auto;line-height:1.55}
    .print{padding:12px 22px;margin-bottom:20px;border:0;border-radius:8px;background:#d4af37;font-weight:bold}
    @media print{.print{display:none}body{padding:0}}
   </style></head><body><button class="print" onclick="window.print()">Imprimir</button>
   <h1>BANDA DE MÚSICA JULIÁN CERDÁN</h1><h2>${title}</h2>
   <div class="info"><strong>${date}</strong><br>Fin: ${end}<br>${place}</div>
   ${svg.outerHTML}
   <p class="notice">Escanea este código con el portal del músico e inicia sesión para registrar tu asistencia.
   Código exclusivo de este evento. El registro solo está disponible durante el horario habilitado.</p>
   </body></html>`);
   popup.document.close();popup.focus();
  };
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  for(const [form,action,dialog,errorId] of [['ba-manual-form','manual','ba-manual-dialog','ba-manual-error'],['ba-member-form','perfil','ba-member-dialog','ba-member-error']]) {
   $(form).onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const data=Object.fromEntries(new FormData(e.target));if(action==='manual'){data.usuario_id=manualUser;data.evento_id=selected;}await B.rpc(action,data);$(dialog).close();await load();B.notice('Cambios guardados.');}catch(err){$(errorId).textContent=err.message;$(errorId).hidden=false;}finally{b.disabled=false;}};
  }
  $('tabla-usuarios-admin').addEventListener('click',e=>{const b=e.target.closest('[data-member-edit]');if(b)run(()=>memberEdit(b.dataset.memberEdit));});
  document.addEventListener('agenda:refresh',()=>run(load));
  await load();
  const autoRefresh=()=>{if(document.hidden||!document.querySelector('[data-admin-view="banda"].activa')||!$('ba-editor').hidden||document.querySelector('dialog[open]')||document.activeElement?.matches('input,textarea,select'))return;run(load);};
  setInterval(autoRefresh,30000);document.addEventListener('visibilitychange',autoRefresh);
 }));
})();
