/* Datos privados: nunca se guardan respuestas ni ubicación en localStorage. */
window.JCBanda = (() => {
 const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fecha = value => new Intl.DateTimeFormat('es-ES',{timeZone:'Europe/Madrid',dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
 const dia = value => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
 const localInput = value => {
  const p = new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
  const v = Object.fromEntries(p.map(x=>[x.type,x.value])); return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
 };
 // Convierte la hora de convocatoria de Madrid incluso si el móvil está en otra zona.
 function madridISO(value) {
  if (!value) throw Error('Completa todas las fechas.');
  const base = Date.parse(value+'Z');
  let result=base;
  for(let i=0;i<3;i++) {
   const parts=localInput(result);
   const delta=Date.parse(parts+'Z')-base;
   if(!delta) break;
   result-=delta;
  }
  if(localInput(result)!==value) throw Error('Esa hora no existe por el cambio de horario. Elige otra.');
  return new Date(result).toISOString();
 }
 async function rpc(action,data={}) {
  const {data:result,error}=await clienteSupabase.rpc('banda_accion',{p_accion:action,p_datos:data});
  if(error) throw Error(error.message); return result;
 }
 async function query(table,configure=q=>q) {
  const {data,error}=await configure(clienteSupabase.from(table).select('*'));
  if(error) throw Error(error.message); return data||[];
 }
 async function access() {
  const {data:{session},error}=await clienteSupabase.auth.getSession();
  if(error) throw error;
  if(!session) {
   if(location.pathname.endsWith('/musicos.html') && !sessionStorage.getItem('jc_banda_return')) sessionStorage.setItem('jc_banda_return',location.pathname+location.hash);
   location.replace('/templates/login.html'); return null;
  }
  const {data:profile,error:pe}=await clienteSupabase.from('perfiles').select('id,rol,username').eq('id',session.user.id).maybeSingle();
  if(pe) throw pe;
  if(!profile || !['admin','musico'].includes(profile.rol)) throw Error('Tu cuenta no tiene acceso al área de músicos. El rol lo asigna administración.');
  return {user:session.user,profile,admin:profile.rol==='admin'};
 }
 function geo() {
  return new Promise((resolve,reject)=> {
   if(!navigator.geolocation) return reject(Error('Este navegador no permite obtener la ubicación. Solicita registro manual.'));
   navigator.geolocation.getCurrentPosition(p=>resolve({latitud:p.coords.latitude,longitud:p.coords.longitude,precision:p.coords.accuracy}),e=>reject(Error(e.code===1?'Permite el acceso a la ubicación para fichar. Si no puedes, solicita registro manual.':'No se ha conseguido una ubicación precisa. Vuelve a intentarlo o solicita registro manual.')),{enableHighAccuracy:true,timeout:18000,maximumAge:0});
  });
 }
 function notice(text,error=false,id='banda-status') {
  const el=document.getElementById(id); if(!el) return;
  el.textContent=text; el.hidden=!text; el.className='notice'+(error?' error':'');
 }
 function csv(rows,filename) {
  const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replace(/"/g,'""')+'"';
  const blob=new Blob(['\ufeff'+rows.map(r=>r.map(cell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob); const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 }
 const asistencia=a=>a?({presente:'Presente',incidencia:'Incidencia pendiente',ausente:'Ausente',justificada:'Ausencia justificada'}[a.estado]||a.estado):'Sin fichaje';
 return {escape,fecha,dia,localInput,madridISO,rpc,query,access,geo,notice,csv,asistencia};
})();
