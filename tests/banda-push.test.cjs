const test=require('node:test'),assert=require('node:assert/strict');
let endpoint,worker,utils;const key='x'.repeat(87),auth='a'.repeat(22),user='00000000-0000-4000-8000-000000000001';
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test.before(async()=>{utils=require('../netlify/functions/lib/push-utils');const vapid=utils.webpush.generateVAPIDKeys();Object.assign(process.env,{SUPABASE_URL:'https://db.example.invalid',SUPABASE_ANON_KEY:'public-test',SUPABASE_SERVICE_ROLE_KEY:'server-test',VAPID_PUBLIC_KEY:vapid.publicKey,VAPID_PRIVATE_KEY:vapid.privateKey,VAPID_SUBJECT:'mailto:test@example.invalid'});endpoint=await import('../netlify/functions/banda-push.mjs');worker=await import('../netlify/functions/banda-avisos.mjs');});
test('El endpoint push exige sesión y permiso Músico; rechaza destinos ajenos a proveedores push',async()=>{
 const original=global.fetch;try{global.fetch=async url=>String(url).includes('/auth/')?response({id:user}):response([{id:user,es_musico:false}]);assert.equal((await endpoint.default(new Request('https://site.invalid/api'))).status,403);assert.equal((await endpoint.default(new Request('https://site.invalid/api',{headers:{Authorization:'Bearer user-token'}}))).status,403);assert(!endpoint.validSubscription({endpoint:'https://127.0.0.1/internal',keys:{p256dh:key,auth}}));assert(endpoint.validSubscription({endpoint:'https://fcm.googleapis.com/fcm/send/device',keys:{p256dh:key,auth}}));}finally{global.fetch=original;}
});
test('Una suscripción se guarda para el usuario autenticado y desactivar filtra por su usuario',async()=>{
 const original=global.fetch,calls=[];try{global.fetch=async(url,options={})=>{calls.push({url:String(url),...options});if(String(url).includes('/auth/'))return response({id:user});if(String(url).includes('perfiles?'))return response([{id:user,es_musico:true}]);if(!options.method)return response([]);return response({ok:true});};
 const headers={Authorization:'Bearer user-token','Content-Type':'application/json'},subscription={endpoint:'https://fcm.googleapis.com/fcm/send/device',keys:{p256dh:key,auth}};
 assert.equal((await endpoint.default(new Request('https://site.invalid/api',{method:'POST',headers,body:JSON.stringify({subscription,usuario_id:'otro-usuario'})}))).status,200);
 const saved=calls.find(c=>c.method==='POST');assert.equal(JSON.parse(saved.body).usuario_id,user);
 assert.equal((await endpoint.default(new Request('https://site.invalid/api',{method:'DELETE',headers,body:JSON.stringify({endpoint:subscription.endpoint})}))).status,200);assert(calls.find(c=>c.method==='DELETE').url.includes('usuario_id=eq.'+user));
 }finally{global.fetch=original;}
});
test('El trabajador envía avisos privados al lote reclamado y elimina suscripciones caducadas',async()=>{
 const original=global.fetch,send=utils.webpush.sendNotification,delivered=[],calls=[];try{global.fetch=async(url,options={})=>{calls.push({url:String(url),...options});if(String(url).includes('rpc/banda_avisos_lote'))return response([{id:41,usuario_id:user,titulo:'Convocatoria actualizada',mensaje:'Revisa la convocatoria',suscripciones:[{endpoint:'https://fcm.googleapis.com/device1',p256dh:key,auth},{endpoint:'https://fcm.googleapis.com/expired',p256dh:key,auth}]}]);return response({ok:true});};utils.webpush.sendNotification=async(sub,payload)=>{if(sub.endpoint.endsWith('expired'))throw {statusCode:410};delivered.push({sub,payload:JSON.parse(payload)});};
 const result=await worker.default();assert.equal((await result.json()).sent,1);assert.equal(delivered.length,1);assert.equal(delivered[0].payload.url,'/templates/musicos.html#avisos');assert(calls.some(c=>c.method==='DELETE'&&c.url.includes('banda_push')));assert(calls.some(c=>c.method==='PATCH'&&JSON.parse(c.body).push_estado==='enviado'));assert.equal(worker.config.schedule,'*/5 * * * *');
 }finally{global.fetch=original;utils.webpush.sendNotification=send;}
});
