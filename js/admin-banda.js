(() => {
 const B=JCBanda,E=B.escape;
 let events=[],members=[],profiles=[],responses=[],attendance=[],roster=[],selected=null,manualUser=null,qrEvent=null,qrTimer=null,qrDeadline=0,qrBusy=false;
 const $=id=>document.getElementById(id);
 const member=id=>members.find(x=>x.usuario_id===id);
 const name=id=>member(id)?.nombre||profiles.find(x=>x.id===id)?.nombre_completo||profiles.find(x=>x.id===id)?.username||'Sin nombre';
 const instrument=id=>member(id)?.instrumento||'Sin instrumento';
 async function run(fn){try{await fn();}catch(e){B.notice(e.message,true);}}
 async function load() {
  [events,members,profiles]=await Promise.all([B.query('banda_eventos',q=>q.order('inicio')),B.query('banda_fichas'),B.query('perfiles',q=>q.order('username'))]);
  paintEvents();if(selected)await details(selected);
 }
 function paintEvents() {
  const list=events.filter(e=>$('ba-filter').value==='all'||Date.parse(e.fin)>=Date.now());
  $('ba-events').innerHTML=list.map(e=>`<article class="event ${e.id===selected?'selected':''}" style="margin-bottom:12px"><span class="badge">${e.tipo==='ensayo'?'Ensayo':'Actuación'}</span>${e.estado==='cancelado'?' <span class="badge warn">Cancelado</span>':''}<h3>${E(e.titulo)}</h3><p class="muted">${B.fecha(e.inicio)}<br>${E(e.lugar)}</p><button data-select="${e.id}" type="button">Respuestas y asistencia</button></article>`).join('')||'<p class="muted">No hay convocatorias. Crea la primera.</p>';
 }
 async function details(id) {
  selected=id;const ev=events.find(e=>e.id===id);if(!ev)return;
  const detailData=await Promise.all([B.query('banda_convocados',q=>q.eq('evento_id',id)),B.query('banda_respuestas',q=>q.eq('evento_id',id)),B.query('banda_asistencias',q=>q.eq('evento_id',id))]);
  if(selected!==id)return;[roster,responses,attendance]=detailData;
  const grouped={};
  roster.forEach(c=>{const k=instrument(c.usuario_id);grouped[k]??={total:0,voy:0,no:0};grouped[k].total++;const r=responses.find(x=>x.usuario_id===c.usuario_id);if(r?.respuesta==='voy')grouped[k].voy++;if(r?.respuesta==='no_voy')grouped[k].no++;});
  const voy=responses.filter(r=>r.respuesta==='voy').length,no=responses.filter(r=>r.respuesta==='no_voy').length,pres=attendance.filter(a=>a.estado==='presente').length;
  $('ba-detail').innerHTML=`<h2>${E(ev.titulo)}</h2><p class="muted">${B.fecha(ev.inicio)} · ${E(ev.lugar)}</p><div class="row"><div class="stat"><b>${voy}</b>Voy</div><div class="stat"><b>${no}</b>No voy</div><div class="stat"><b>${roster.length-responses.length}</b>Sin responder</div><div class="stat"><b>${pres}</b>Presentes</div></div><p class="muted">Fichaje: ${ev.fichaje_abierto&&Date.parse(ev.abierto_hasta)>Date.now()?'abierto hasta '+B.fecha(ev.abierto_hasta):'cerrado'}. Radio: ${ev.radio_m} m.</p><div class="row"><button data-action="edit">Editar</button><button data-action="convocar">Añadir nuevos músicos</button><button data-action="open" class="primary" ${ev.estado==='cancelado'?'disabled':''}>Abrir y mostrar QR</button><button data-action="close">Cerrar fichaje</button><button data-action="export">Exportar CSV</button><button data-action="cancel" ${ev.estado==='cancelado'?'disabled':''}>Cancelar evento</button></div><h3>Previsión por instrumento</h3><div class="table-scroll"><table><thead><tr><th>Instrumento</th><th>Voy</th><th>No voy</th><th>Sin responder</th></tr></thead><tbody>${Object.entries(grouped).sort((a,b)=>a[0].localeCompare(b[0],'es')).map(([k,v])=>`<tr><td>${E(k)}</td><td>${v.voy}</td><td>${v.no}</td><td>${v.total-v.voy-v.no}</td></tr>`).join('')}</tbody></table></div><h3>Músicos convocados (${roster.length})</h3><p class="muted">«Sin fichaje» no es una ausencia confirmada. Revisa los casos pendientes. Actualiza para ver nuevas respuestas.</p><div class="table-scroll"><table><thead><tr><th>Músico</th><th>Confirmación</th><th>Asistencia</th><th>Revisión</th></tr></thead><tbody>${roster.slice().sort((a,b)=>(instrument(a.usuario_id)+name(a.usuario_id)).localeCompare(instrument(b.usuario_id)+name(b.usuario_id),'es')).map(c=>{
   const r=responses.find(x=>x.usuario_id===c.usuario_id),a=attendance.find(x=>x.usuario_id===c.usuario_id);
   return `<tr><td>${E(name(c.usuario_id))}<br><small>${E(instrument(c.usuario_id))}</small></td><td>${r?(r.respuesta==='voy'?'Voy':'No voy'):'Sin responder'}${r?`<br><small>${B.fecha(r.actualizado_en)}</small>`:''}</td><td><span class="badge ${a?.estado==='presente'?'good':a?.estado==='incidencia'?'warn':''}">${E(B.asistencia(a))}</span>${a?`<br><small>${B.fecha(a.registrado_en)} · ${E(a.metodo)}${a.distancia_m!=null?` · ${a.distancia_m} m / precisión ${a.precision_m} m`:''}</small>${a.motivo?`<p class="muted">${E(a.motivo)}</p>`:''}`:''}</td><td><button data-manual="${c.usuario_id}">Revisar</button></td></tr>`;
  }).join('')}</tbody></table></div><details><summary>Historial de cambios del evento</summary><div id="ba-audit">Cargando…</div></details>`;
  paintEvents();
  const audit=await B.query('banda_auditoria',q=>q.eq('evento_id',id).order('creado_en',{ascending:false}).limit(100));
  if(selected!==id)return;
  $('ba-audit').innerHTML=audit.map(a=>`<p class="muted">${B.fecha(a.creado_en)} · ${E(name(a.actor_id))} · ${E(a.accion)}${a.usuario_id?' · '+E(name(a.usuario_id)):''}${a.detalle?.motivo?' · '+E(a.detalle.motivo):''}</p>`).join('')||'Sin cambios.';
 }
 function edit(ev) {
  const f=$('ba-form');f.reset();f.elements.id.value=ev?.id||'';
  if(ev){for(const k of ['titulo','tipo','lugar','notas','latitud','longitud','radio_m'])f.elements[k].value=ev[k]??'';for(const k of ['inicio','fin','limite_respuesta'])f.elements[k].value=B.localInput(ev[k]);}
  $('ba-editor-title').textContent=ev?'Editar convocatoria':'Nueva convocatoria';$('ba-editor').hidden=false;$('ba-editor').scrollIntoView({behavior:'smooth'});f.elements.titulo.focus();
 }
 function stopQr(){clearInterval(qrTimer);qrTimer=null;$('ba-qr-image').innerHTML='';qrDeadline=0;qrEvent=null;}
 async function refreshQr() {
  if(!qrEvent||qrBusy)return;qrBusy=true;$('ba-qr-image').innerHTML='';$('ba-qr-error').hidden=true;
  try {
   const data=await B.rpc('qr',{evento_id:qrEvent});
   if(!$('ba-qr-dialog').open)return;
   if(typeof qrcode!=='function')throw Error('No se ha podido cargar el generador QR. Recarga la página.');
   const url=new URL('/templates/musicos.html',location.origin);url.hash=new URLSearchParams({evento:qrEvent,token:data.token}).toString();
   const qr=qrcode(0,'M');qr.addData(url.href);qr.make();$('ba-qr-image').innerHTML=qr.createSvgTag({cellSize:5,margin:4,scalable:true});
   qrDeadline=performance.now()+(Date.parse(data.expira)-Date.parse(data.servidor));
  }catch(e){$('ba-qr-error').textContent=e.message;$('ba-qr-error').hidden=false;qrDeadline=0;$('ba-qr-count').textContent='QR no disponible. Pulsa renovar.';}
  finally{qrBusy=false;}
 }
 async function openQr(){await B.rpc('abrir',{evento_id:selected});qrEvent=selected;$('ba-qr-title').textContent=events.find(e=>e.id===selected).titulo;$('ba-qr-dialog').showModal();await refreshQr();clearInterval(qrTimer);qrTimer=setInterval(()=>{if(!qrDeadline)return;const seconds=Math.max(0,Math.ceil((qrDeadline-performance.now())/1000));$('ba-qr-count').textContent=`Se renueva en ${seconds} s`;if(seconds===0)refreshQr();},500);await load();}
 function exportCsv(){const ev=events.find(e=>e.id===selected);B.csv([['Evento','Inicio (Madrid)','Músico','Instrumento','Confirmación','Respuesta registrada','Asistencia','Método','Registro de llegada','Última revisión','Revisado por','Motivo'],...roster.map(c=>{const r=responses.find(x=>x.usuario_id===c.usuario_id),a=attendance.find(x=>x.usuario_id===c.usuario_id);return [ev.titulo,B.fecha(ev.inicio),name(c.usuario_id),instrument(c.usuario_id),r?.respuesta||'Sin responder',r?B.fecha(r.actualizado_en):'',B.asistencia(a),a?.metodo||'',a?B.fecha(a.registrado_en):'',a?B.fecha(a.actualizado_en):'',a?.revisado_por?name(a.revisado_por):'',a?.motivo||''];})],`asistencia-${B.dia(ev.inicio)}.csv`);}
 async function memberEdit(id){members=await B.query('banda_fichas');const f=$('ba-member-form'),m=member(id);f.reset();f.elements.usuario_id.value=id;f.elements.nombre.value=m?.nombre||profiles.find(p=>p.id===id)?.nombre_completo||'';f.elements.instrumento.value=m?.instrumento||'';f.elements.incorporacion.value=m?.incorporacion||'';$('ba-member-error').hidden=true;$('ba-member-dialog').showModal();}
 document.addEventListener('admin:ready',()=>run(async()=>{
  $('ba-new').onclick=()=>edit();$('ba-editor-close').onclick=()=>$('ba-editor').hidden=true;
  $('ba-refresh').onclick=()=>run(load);$('ba-filter').onchange=paintEvents;
  $('ba-events').onclick=e=>{const b=e.target.closest('[data-select]');if(b)run(()=>details(b.dataset.select));};
  $('ba-form').onsubmit=e=>{e.preventDefault();run(async()=>{const b=e.submitter;b.disabled=true;try{const data=Object.fromEntries(new FormData(e.target));for(const k of ['inicio','fin','limite_respuesta'])data[k]=B.madridISO(data[k]);if((data.latitud==='')!==(data.longitud===''))throw Error('Completa ambas coordenadas o deja las dos vacías.');const r=await B.rpc('evento',data);selected=r.id;$('ba-editor').hidden=true;await load();B.notice('Convocatoria guardada.');}finally{b.disabled=false;}});};
  $('ba-use-location').onclick=e=>run(async()=>{const b=e.target;b.disabled=true;try{const p=await B.geo();const f=$('ba-form');f.elements.latitud.value=p.latitud;f.elements.longitud.value=p.longitud;B.notice(`Ubicación incorporada. Precisión aproximada: ${Math.round(p.precision)} m.`);}finally{b.disabled=false;}});
  $('ba-detail').onclick=e=>run(async()=>{const b=e.target.closest('button');if(!b)return;
   if(b.dataset.manual){manualUser=b.dataset.manual;const a=attendance.find(x=>x.usuario_id===manualUser);$('ba-manual-name').textContent=name(manualUser);$('ba-manual-form').reset();$('ba-manual-form').elements.estado.value=a?.estado||'presente';$('ba-manual-error').hidden=true;$('ba-manual-dialog').showModal();return;}
   const act=b.dataset.action;if(!act)return;b.disabled=true;
   try{if(act==='edit')edit(events.find(e=>e.id===selected));else if(act==='export')exportCsv();else if(act==='open')await openQr();else{if(act==='cancel'&&!confirm('¿Cancelar esta convocatoria? Se conservarán las respuestas y el historial.'))return;await B.rpc({convocar:'convocar',close:'cerrar',cancel:'cancelar'}[act],{evento_id:selected});await load();B.notice('Convocatoria actualizada.');}}finally{b.disabled=false;}
  });
  $('ba-qr-hide').onclick=()=>$('ba-qr-dialog').close();$('ba-qr-dialog').addEventListener('close',stopQr);$('ba-qr-retry').onclick=()=>run(refreshQr);
  document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
  for(const [form,action,dialog,errorId] of [['ba-manual-form','manual','ba-manual-dialog','ba-manual-error'],['ba-member-form','perfil','ba-member-dialog','ba-member-error']]) {
   $(form).onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const data=Object.fromEntries(new FormData(e.target));if(action==='manual'){data.usuario_id=manualUser;data.evento_id=selected;}await B.rpc(action,data);$(dialog).close();await load();B.notice('Cambios guardados.');}catch(err){$(errorId).textContent=err.message;$(errorId).hidden=false;}finally{b.disabled=false;}};
  }
  $('tabla-usuarios-admin').addEventListener('click',e=>{const b=e.target.closest('[data-member-edit]');if(b)run(()=>memberEdit(b.dataset.memberEdit));});
  await load();
 }));
})();
