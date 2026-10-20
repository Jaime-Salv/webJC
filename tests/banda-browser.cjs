const {chromium}=require(process.env.JC_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fixture=()=>{
 const uid='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002',eid='00000000-0000-4000-8000-000000000010';
 const now=Date.now();
 const ev={id:eid,titulo:'Ensayo general de la banda',tipo:'ensayo',inicio:new Date(now+3600000).toISOString(),fin:new Date(now+7200000).toISOString(),limite_respuesta:new Date(now+3500000).toISOString(),lugar:'Local de ensayo',notas:'Traer partituras',estado:'publicado',radio_m:150,latitud:36.778,longitud:-6.35,fichaje_abierto:false,abierto_hasta:null};
 window.testData={uid,other,eid,role:location.pathname.includes('/admin.html')?'admin':'musico',events:[ev],profiles:[{id:uid,rol:'admin',es_musico:true,username:'Jaime',email:'test@example.invalid'},{id:other,rol:'musico',es_musico:true,username:'Músico de prueba'}],fichas:[{usuario_id:uid,nombre:'Jaime',instrumento:'Clarinete',incorporacion:2014}],responses:[],attendance:[],calls:[]};
 const state=window.testData;
 function from(table){let filters=[];let single=false;
  const q=new Proxy({}, {get(t,p){if(p==='then')return (resolve,reject)=>{
    let data=({perfiles:state.profiles,banda_eventos:state.events,banda_fichas:state.fichas,banda_respuestas:state.responses,banda_asistencias:state.attendance,banda_convocados:[{evento_id:eid,usuario_id:uid},{evento_id:eid,usuario_id:other}],banda_auditoria:[]}[table]||[]).filter(r=>filters.every(([k,v])=>r[k]===v));
    if(table==='perfiles'&&single)data=data.map(p=>({...p,rol:state.role}));
    return Promise.resolve({data:single?(data[0]||null):data,error:null,count:data.length}).then(resolve,reject);
   };
   return (...args)=>{if(p==='eq')filters.push(args);if(p==='maybeSingle'||p==='single')single=true;return q;};
  }});return q;
 }
 window.clienteSupabase={from,rpc:async(name,{p_accion:a,p_datos:d})=>{state.calls.push({a,d});let data={ok:true};
  if(a==='rol'){const p=state.profiles.find(p=>p.id===d.usuario_id);if(p){p.rol=d.rol;p.es_musico=d.es_musico;}if(d.usuario_id===uid)state.role=d.rol;}
  if(a==='respuesta'){state.responses=[{evento_id:d.evento_id,usuario_id:uid,respuesta:d.respuesta,actualizado_en:new Date().toISOString()}];}
  if(a==='fichar'){state.attendance=[{evento_id:d.evento_id,usuario_id:uid,estado:'presente',metodo:'qr',registrado_en:new Date().toISOString()}];data.estado='presente';}
  if(a==='abrir'){ev.fichaje_abierto=true;ev.abierto_hasta=new Date(now+3600000).toISOString();}
  if(a==='qr')data={token:'00000000-0000-4000-8000-000000000020',expira:new Date(Date.now()+60000).toISOString(),servidor:new Date().toISOString()};
  return {data,error:null};},auth:{getSession:async()=>({data:{session:{user:{id:uid,email:'test@example.invalid',user_metadata:{}}}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),signOut:async()=>({})}};
 navigator.geolocation.getCurrentPosition=(ok)=>ok({coords:{latitude:36.778,longitude:-6.35,accuracy:10}});
};
(async()=>{
 const options={headless:true};
 if(process.env.JC_BROWSER_EXECUTABLE){options.executablePath=process.env.JC_BROWSER_EXECUTABLE;options.args=['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage'];}
 const browser=await chromium.launch(options);
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('https://**/*',r=>r.fulfill({status:200,body:'',contentType:r.request().resourceType()==='stylesheet'?'text/css':'application/javascript'}));
 await context.route('**/js/config.js',r=>r.fulfill({status:200,body:'',contentType:'application/javascript'}));
 const page=await context.newPage();await page.addInitScript(fixture);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto('http://127.0.0.1:8090/templates/musicos.html');
 await page.locator('#banda-content').waitFor({state:'visible'});
 await page.locator('[data-response="voy"]').click();
 await page.getByText('Confirmado: voy',{exact:true}).waitFor();
 await page.locator('[data-response="no_voy"]').click();await page.getByText('Confirmado: no voy',{exact:true}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Músico móvil sin desbordamiento');
 await page.screenshot({path:'/tmp/jc-musicos-mobile.png',fullPage:true});
 const eid=await page.evaluate(()=>testData.eid);
 await page.goto(`http://127.0.0.1:8090/templates/musicos.html#evento=${eid}&token=00000000-0000-4000-8000-000000000020`);
 await page.locator('#banda-fichar').click();await page.getByText('Asistencia registrada correctamente.',{exact:true}).waitFor();
 assert.equal(await page.locator('#banda-fichar').isDisabled(),true);
 assert(!page.url().includes('token='),'Token fuera de la barra de dirección');
 await page.goto('http://127.0.0.1:8090/templates/admin.html#banda');


 await page.reload();
 await page.locator('[data-admin-view="banda"].activa').waitFor({state:'visible',timeout:20000});
 await page.locator('[data-select]').first().click();await page.locator('[data-action="open"]').waitFor();
 await page.locator('[data-action="open"]').click();await page.locator('#ba-qr-image svg').waitFor();
 await page.locator('#ba-qr-image svg').screenshot({path:'/tmp/jc-qr.png'});
 await page.locator('#ba-qr-hide').click();
 await page.locator('[data-action="edit"]').click();await page.locator('#ba-editor').waitFor({state:'visible'});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Admin móvil sin desbordamiento');
 await page.screenshot({path:'/tmp/jc-admin-mobile.png',fullPage:true});
 await page.locator('[data-admin-target="usuarios"]').click();
 await page.locator('[data-member-edit]').first().click();await page.locator('#ba-member-dialog').waitFor({state:'visible'});await page.locator('#ba-member-form input[name="incorporacion"]').fill('2015');await page.locator('#ba-member-form button[type="submit"]').click();await page.locator('#ba-member-dialog').waitFor({state:'hidden'});
 assert(await page.evaluate(()=>testData.calls.some(c=>c.a==='perfil'&&c.d.incorporacion==='2015')),'Año guardado por administración');
 await page.locator('[data-permiso-musico]').first().uncheck();
 assert(await page.evaluate(()=>testData.calls.some(c=>c.a==='rol'&&c.d.rol==='admin'&&c.d.es_musico===false)),'Desactivar músico conserva administrador');
 assert(await page.locator('[data-permiso-admin]').first().isDisabled(),'Administrador no puede quitarse a sí mismo ese permiso');
 assert.equal(errors.length,0,errors.join('\n'));
 await page.setViewportSize({width:1280,height:900});await page.locator('[data-admin-target="banda"]').click();await page.screenshot({path:'/tmp/jc-admin-desktop.png',fullPage:true});
 await browser.close();console.log('OK: confirmaciones, QR, fichaje, ficha y diseño móvil/escritorio.');
})().catch(e=>{console.error(e);process.exit(1)});
