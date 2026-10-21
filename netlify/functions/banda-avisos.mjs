import utils from './lib/push-utils.js';
const {supabaseRequest,configureWebPush,webpush}=utils;
// Only the scheduler invokes this function. Queue claims are atomic in Postgres.
export default async()=>{
 const claim=await supabaseRequest('rpc/banda_avisos_lote',{method:'POST',body:'{}'});if(!claim.ok)throw Error('No se ha podido preparar el lote de avisos.');
 const notices=await claim.json();if(!notices.length)return Response.json({processed:0});
 configureWebPush();let sent=0,failed=0;
 await Promise.all(notices.map(async notice=>{
  let ok=false,retry=false;
  await Promise.all(notice.suscripciones.map(async sub=>{
   try{await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},JSON.stringify({title:'Portal músico · '+notice.titulo,body:notice.mensaje,url:'/templates/musicos.html#avisos',tag:'banda-aviso-'+notice.id}),{TTL:3600,timeout:4000});ok=true;}
   catch(error){if(error.statusCode===404||error.statusCode===410)await supabaseRequest('banda_push?endpoint=eq.'+encodeURIComponent(sub.endpoint),{method:'DELETE'});else retry=true;}
  }));
  const result=await supabaseRequest('banda_avisos?id=eq.'+notice.id,{method:'PATCH',body:JSON.stringify({push_estado:retry?'error':ok?'enviado':'sin_suscripcion',push_en:new Date().toISOString()})});if(!result.ok)throw Error('No se ha podido registrar el resultado del aviso.');if(ok)sent++;if(retry)failed++;
 }));
 return Response.json({processed:notices.length,sent,failed});
};
// Every five minutes in UTC, independent of daylight saving time.
export const config={schedule:'*/5 * * * *'};
