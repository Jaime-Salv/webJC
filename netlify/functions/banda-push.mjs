import utils from './lib/push-utils.js';
const {supabaseRequest}=utils;
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function member(req){
 const authorization=req.headers.get('authorization');if(!authorization?.startsWith('Bearer '))return null;
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_ANON_KEY;if(!url||!key)throw Error('Configuración de acceso incompleta.');
 const response=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:authorization}});if(!response.ok)return null;
 const user=await response.json(),profiles=await supabaseRequest('perfiles?id=eq.'+encodeURIComponent(user.id)+'&select=id,es_musico');if(!profiles.ok)throw Error('No se han podido comprobar los permisos.');
 return (await profiles.json())?.[0]?.es_musico?user:null;
}
export function validSubscription(subscription){
 try{const u=new URL(subscription.endpoint),host=u.hostname;
  const known=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host.endsWith('.push.services.mozilla.com')||host==='web.push.apple.com'||host.endsWith('.notify.windows.com');
  return u.protocol==='https:'&&!u.username&&!u.password&&known&&subscription.endpoint.length<=2000&&/^[A-Za-z0-9_-]{40,200}={0,2}$/.test(subscription.keys?.p256dh||'')&&/^[A-Za-z0-9_-]{16,100}={0,2}$/.test(subscription.keys?.auth||'');
 }catch{return false;}
}
export default async req=>{
 if(!['GET','POST','DELETE'].includes(req.method))return json({error:'Método no permitido.'},405);
 try{
  const user=await member(req);if(!user)return json({error:'Inicia sesión con una cuenta de músico.'},403);
  if(req.method==='GET'){if(!process.env.VAPID_PUBLIC_KEY)return json({error:'Los avisos push todavía no están configurados.'},503);return json({publicKey:process.env.VAPID_PUBLIC_KEY});}
  const body=await req.json();let result;
  if(req.method==='POST'){
   if(!validSubscription(body.subscription))return json({error:'La suscripción de este navegador no es válida.'},400);
   const s=body.subscription;const devices=await supabaseRequest('banda_push?usuario_id=eq.'+encodeURIComponent(user.id)+'&select=endpoint&limit=5');if(!devices.ok)throw Error('No se pueden consultar los dispositivos.');const owned=await devices.json();if(owned.length>=5&&!owned.some(x=>x.endpoint===s.endpoint))return json({error:'Ya tienes cinco dispositivos registrados. Desactiva los avisos en uno antes de añadir otro.'},400);result=await supabaseRequest('banda_push?on_conflict=endpoint',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({endpoint:s.endpoint,usuario_id:user.id,p256dh:s.keys.p256dh,auth:s.keys.auth,actualizado_en:new Date().toISOString()})});
  }else{if(typeof body.endpoint!=='string'||body.endpoint.length>2000)return json({error:'Suscripción no válida.'},400);result=await supabaseRequest('banda_push?usuario_id=eq.'+encodeURIComponent(user.id)+'&endpoint=eq.'+encodeURIComponent(body.endpoint),{method:'DELETE'});}
  if(!result.ok)throw Error('No se ha podido guardar la preferencia de avisos.');return json({ok:true});
 }catch(error){console.error('Preferencias de avisos del portal:',error.message);return json({error:'No se ha podido actualizar la suscripción. Vuelve a intentarlo.'},500);}
};
export const config={rateLimit:{windowLimit:20,windowSize:60,aggregateBy:'ip'}};
