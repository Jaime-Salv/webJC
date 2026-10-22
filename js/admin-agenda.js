/* Administración de ensayos y publicaciones que comparten calendario. */
(() => {
 const B=JCBanda,E=B.escape,$=id=>document.getElementById(id);
 const today=B.dia(new Date());let year=+today.slice(0,4),month=+today.slice(5,7)-1,events=[],processions=[],previewURL=null,uploadedFile=null;
 async function run(fn){try{await fn();}catch(e){B.notice(e.message,true);}}
 async function refresh(){
  [events,processions]=await Promise.all([B.query('banda_eventos',q=>q.order('inicio')),B.query('maestro_procesiones',q=>q.eq('estado','Programada').order('fecha'))]);
  paint();
  $('agenda-processions').innerHTML=processions.map(p=>`<article class="event"><span class="badge">Procesión programada</span><h3>${E(p.hermandad)}</h3><p>${E(p.fecha)} · ${E(p.hora?.slice(0,5)||'Hora pendiente')} · ${E(p.localidad)}</p><button type="button" class="primary" data-start-procession="${p.id_procesion}">Empezar directo</button><button type="button" data-procession="${p.id_procesion}">Editar publicación</button><button type="button" data-procession-qr="${p.id_procesion}">QR de fichaje</button></article>`).join('');
  $('agenda-live-select').innerHTML='<option value="">Selecciona una procesión…</option>'+processions.map(p=>`<option value="${p.id_procesion}">${E(p.fecha)} · ${E(p.hermandad)}</option>`).join('');
 }
 let starting=false;
 async function startLive(eventId,button){
  if(starting)return;if(!eventId)throw Error('Publica primero la actuación con fecha, horario y lugar.');
  if(!confirm('¿Empezar ahora el directo de esta actuación?'))return;
  starting=true;if(button)button.disabled=true;
  try{
   const {data,error}=await clienteSupabase.rpc('iniciar_directo_programado',{eid:eventId});if(error)throw error;
   procesionActiva=data.directo;activarModoInyeccion();
   document.querySelector('[data-admin-target="directo"]').click();
   if(!data.ya_activo)await enviarAvisoInicioDirecto(data.directo);
   document.dispatchEvent(new Event('agenda:refresh'));
  }finally{starting=false;if(button?.isConnected)button.disabled=false;}
 }
 document.addEventListener('agenda:start-live',e=>run(()=>startLive(e.detail.evento_id,e.detail.button)));
 function paint(){
  $('agenda-month').textContent=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(Date.UTC(year,month,1)));
  const chosen=$('agenda-rehearsal').elements.fecha.value;
  let html=['L','M','X','J','V','S','D'].map(d=>`<span class="muted">${d}</span>`).join('')+'<span></span>'.repeat((new Date(Date.UTC(year,month,1)).getUTCDay()+6)%7);
  for(let d=1;d<=new Date(Date.UTC(year,month+1,0)).getUTCDate();d++){
   const key=`${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`,es=events.filter(e=>B.dia(e.inicio)===key&&e.estado!=='cancelado');
   html+=`<button type="button" data-agenda-day="${key}" aria-pressed="${key===chosen}" aria-label="${key}: ${es.length} eventos"><b>${d}</b><small>${es.length?es.map(e=>E(e.titulo)).join('<br>'):''}</small></button>`;
  }
  $('agenda-days').innerHTML=html;
 }
 function photoPreview(url){const img=$('agenda-photo-preview');img.hidden=!url;if(url)img.src=url;else img.removeAttribute('src');}
 function resetPhoto(){if(previewURL)URL.revokeObjectURL(previewURL);previewURL=null;uploadedFile=null;}
 async function uploadPhoto(form){
  const file=form.elements.foto_archivo.files[0];if(!file||file===uploadedFile)return;
  if(!file.type.startsWith('image/'))throw Error('Selecciona un archivo de imagen.');
  if(file.size>10*1024*1024)throw Error('La imagen debe ocupar como máximo 10 MB.');
  const extension=file.name.split('.').pop().toLowerCase();
  const path=`procesion_${Date.now()}_${crypto.randomUUID()}.${/^[a-z0-9]{1,8}$/.test(extension)?extension:'jpg'}`;
  const bucket=clienteSupabase.storage.from('portadas');
  const {error}=await bucket.upload(path,file,{contentType:file.type,upsert:false});
  if(error)throw Error('No se ha podido subir la portada: '+error.message);
  const {data}=bucket.getPublicUrl(path);if(!data?.publicUrl)throw Error('No se ha podido obtener la portada subida.');
  form.elements.url_foto.value=data.publicUrl;uploadedFile=file;
 }
 function openProcession(p){const f=$('agenda-procession');resetPhoto();f.reset();for(const k of ['estado','id_procesion','hermandad','tipo','fecha','hora','fin_hora','localidad','lugar','descripcion','url_foto'])f.elements[k].value=p?.[k]??(k==='estado'?'Programada':k==='tipo'?'Semana Santa':k==='fecha'?$('agenda-rehearsal').elements.fecha.value:'');photoPreview(p?.url_foto);$('agenda-procession-title').textContent=p?'Editar procesión programada':'Nueva procesión programada';f.querySelector('[type=submit]').textContent=p?'Guardar y sincronizar':'Publicar y convocar músicos';f.hidden=false;f.scrollIntoView({behavior:'smooth'});}
 document.addEventListener('admin:ready',()=>run(async()=>{
  $('agenda-rehearsal').elements.fecha.value=today;
  $('agenda-days').onclick=e=>{const b=e.target.closest('[data-agenda-day]');if(b){$('agenda-rehearsal').elements.fecha.value=b.dataset.agendaDay;paint();}};
  $('agenda-prev').onclick=()=>{month--;if(month<0){month=11;year--;}paint();};$('agenda-next').onclick=()=>{month++;if(month>11){month=0;year++;}paint();};
  $('agenda-rehearsal').elements.fecha.onchange=e=>{if(!e.target.value)return;year=+e.target.value.slice(0,4);month=+e.target.value.slice(5,7)-1;paint();};
  for(const [id,action] of [['agenda-rehearsal','ensayo']])$(id).onsubmit=e=>{e.preventDefault();run(async()=>{const b=e.submitter;b.disabled=true;try{await B.rpc(action,Object.fromEntries(new FormData(e.target)));document.dispatchEvent(new Event('agenda:refresh'));B.notice('Ensayo colocado. No se pedirá confirmación previa.');}finally{b.disabled=false;}});};
  $('agenda-procession').elements.foto_archivo.onchange=e=>{resetPhoto();const file=e.target.files[0];if(file){previewURL=URL.createObjectURL(file);photoPreview(previewURL);}else photoPreview($('agenda-procession').elements.url_foto.value);};
  $('agenda-new-procession').onclick=()=>openProcession();$('agenda-procession-close').onclick=()=>$('agenda-procession').hidden=true;
  $('agenda-processions').onclick=e=>{const b=e.target.closest('[data-procession],[data-procession-qr],[data-start-procession]');if(!b)return;if(b.dataset.startProcession){run(()=>startLive(events.find(ev=>String(ev.procesion_id)===b.dataset.startProcession)?.id,b));return;}if(b.dataset.processionQr)document.dispatchEvent(new CustomEvent('banda:qr-publicacion',{detail:{procesion_id:b.dataset.processionQr}}));else openProcession(processions.find(p=>String(p.id_procesion)===b.dataset.procession));};
  $('concierto-fichaje').onclick=()=>document.dispatchEvent(new CustomEvent('banda:qr-publicacion',{detail:{concierto_id:conciertoAdminActual?.id_concierto||'sin-publicar'}}));
  document.addEventListener('agenda:edit-procession',e=>run(async()=>{const p=(await B.query('maestro_procesiones',q=>q.eq('id_procesion',e.detail)))[0];if(!p)throw Error('La publicación ya no existe. Su historial permanece en la convocatoria.');openProcession(p);}));
  $('agenda-procession').onsubmit=e=>{e.preventDefault();run(async()=>{const b=e.submitter;b.disabled=true;try{await uploadPhoto(e.target);const data=Object.fromEntries(new FormData(e.target)),id=data.id_procesion;delete data.id_procesion;delete data.foto_archivo;data.estado=data.estado||'Programada';data.url_foto=data.url_foto||null;let q=clienteSupabase.from('maestro_procesiones');q=id?q.update(data).eq('id_procesion',Number(id)):q.insert(data);const r=await q.select().single();if(r.error)throw r.error;e.target.hidden=true;document.dispatchEvent(new Event('agenda:refresh'));B.notice('Publicación y convocatoria musical sincronizadas.');}finally{b.disabled=false;}});};
  $('agenda-live-start').onclick=e=>run(()=>startLive(events.find(ev=>String(ev.procesion_id)===$('agenda-live-select').value)?.id,e.currentTarget));
  $('concierto-empezar-directo').onclick=e=>run(()=>startLive(events.find(ev=>String(ev.concierto_id)===String(conciertoAdminActual?.id_concierto))?.id,e.currentTarget));

  document.addEventListener('agenda:refresh',()=>run(refresh));await refresh();
 }));
})();
