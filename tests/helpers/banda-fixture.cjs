module.exports=()=>{
 const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',eid='00000000-0000-4000-8000-000000000010';
 const now=Date.now();
 const ev={id:eid,titulo:'Ensayo general de la banda',tipo:'actuacion',inicio:new Date(now+3600000).toISOString(),fin:new Date(now+7200000).toISOString(),limite_respuesta:new Date(now+3500000).toISOString(),lugar:'Local de ensayo',notas:'Traer partituras',estado:'publicado',radio_m:150,latitud:36.778,longitud:-6.35,fichaje_abierto:false,abierto_hasta:null};
 window.testData={uid,other,eid,role:location.pathname.includes('/admin.html')?'admin':'musico',events:[ev],profiles:[{id:uid,rol:'admin',es_musico:true,username:'Jaime',email:'test@example.invalid'},{id:other,rol:'musico',es_musico:true,username:'Músico de prueba'}],fichas:[{usuario_id:uid,nombre:'Jaime',instrumento:'Clarinete',incorporacion:2014}],responses:[],attendance:[],calls:[]};
 const state=window.testData;state.processions=[];state.concerts=[];state.settings=[{id:1,latitud:null,longitud:null,radio_m:150}];
 function from(table){let filters=[];let single=false;let mutation=null;
  const q=new Proxy({}, {get(t,p){if(p==='then')return (resolve,reject)=>{
    if(mutation){state.calls.push({a:table+':'+mutation.action,d:mutation.data});if(table==='maestro_procesiones'){if(mutation.action==='insert')state.processions.push({...mutation.data,id_procesion:51});else state.processions.filter(r=>filters.every(([k,v])=>r[k]===v)).forEach(r=>Object.assign(r,mutation.data));}}
    let data=({conciertos:state.concerts,maestro_procesiones:state.processions,banda_ajustes:state.settings,perfiles:state.profiles,banda_eventos:state.events,banda_fichas:state.fichas,banda_respuestas:state.responses,banda_asistencias:state.attendance,banda_convocados:[{evento_id:eid,usuario_id:uid},{evento_id:eid,usuario_id:other}],banda_auditoria:[]}[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v));
    if(table==='perfiles'&&single)data=data.map(p=>({...p,rol:state.role}));
    return Promise.resolve({data:single?(data[0]||null):data,error:null,count:data.length}).then(resolve,reject);
   };
   return (...args)=>{if(p==='insert'||p==='update')mutation={action:p,data:Array.isArray(args[0])?args[0][0]:args[0]};if(p==='eq')filters.push(args);if(p==='maybeSingle'||p==='single')single=true;return q;};
  }});return q;
 }
 window.clienteSupabase={from,storage:{from:bucket=>({upload:async(path,file)=>{state.calls.push({a:'storage:upload',d:{bucket,path,name:file.name,type:file.type}});return state.uploadError?{error:{message:'Fallo de subida de prueba'}}:{error:null};},getPublicUrl:path=>({data:{publicUrl:'https://example.invalid/'+bucket+'/'+path}})})},rpc:async(name,{p_accion:a,p_datos:d})=>{state.calls.push({a,d});let data={ok:true};
  if(a==='ensayo'){data.id='00000000-0000-4000-8000-000000000011';}
  if(a==='rol'){const p=state.profiles.find(p=>p.id===d.usuario_id);if(p){p.rol=d.rol;p.es_musico=d.es_musico;}if(d.usuario_id===uid)state.role=d.rol;}
  if(a==='respuesta'){state.responses=[{evento_id:d.evento_id,usuario_id:uid,respuesta:d.respuesta,actualizado_en:new Date().toISOString()}];}
  if(a==='fichar'){state.attendance=[{evento_id:d.evento_id,usuario_id:uid,estado:'presente',metodo:'qr',registrado_en:new Date().toISOString()}];data.estado='presente';}
  if(a==='abrir'){ev.fichaje_abierto=true;ev.abierto_hasta=new Date(now+3600000).toISOString();}
  if(a==='qr')data={token:'00000000-0000-4000-8000-000000000020',expira:new Date(Date.now()+60000).toISOString(),servidor:new Date().toISOString()};
  return {data,error:null};},auth:{getSession:async()=>({data:{session:{user:{id:uid,email:'test@example.invalid',user_metadata:{}}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})}};
 navigator.geolocation.getCurrentPosition=()=>{throw Error('No debe solicitarse geolocalización.');};
};