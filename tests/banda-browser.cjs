const {chromium}=require(process.env.JC_PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');
const fixture=require('./helpers/banda-fixture.cjs');

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
 await page.locator('.portal-tools [data-view="confirmaciones"]').click();
 await page.locator('[data-response="voy"]').click();
 await page.getByText('Confirmado: voy',{exact:true}).waitFor();
 await page.locator('[data-response="no_voy"]').click();await page.getByText('Confirmado: no voy',{exact:true}).waitFor();
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Músico móvil sin desbordamiento');
 await page.screenshot({path:'/tmp/jc-musicos-mobile.png',fullPage:true});
 const eid=await page.evaluate(()=>testData.eid);
 await page.goto(`http://127.0.0.1:8090/templates/musicos.html#evento=${eid}&token=00000000-0000-4000-8000-000000000020`);
 await page.locator('#banda-fichar').click();await page.getByText('Asistencia registrada correctamente.',{exact:true}).waitFor();
 assert.equal(await page.locator('#banda-fichar').isDisabled(),true);assert(await page.evaluate(()=>testData.calls.filter(c=>c.a==='fichar').every(c=>!('latitud' in c.d)&&!('longitud' in c.d)&&!('precision' in c.d))),'Fichaje sin enviar coordenadas');
 assert(!page.url().includes('token='),'Token fuera de la barra de dirección');
 await page.goto('http://127.0.0.1:8090/templates/admin.html#banda');


 await page.reload();
 await page.locator('[data-admin-view="banda"].activa').waitFor({state:'visible',timeout:20000});
 await page.evaluate(()=>{const s=testData,extra=['3','4','5'].map(n=>'00000000-0000-4000-8000-00000000000'+n);s.profiles.push(...extra.map((id,i)=>({id,rol:'musico',es_musico:true,username:['Luis pendiente','Marta trompeta','Sin ficha'][i]})));s.fichas.push({usuario_id:s.other,nombre:'Ana no asiste',instrumento:'clarinete '},{usuario_id:extra[0],nombre:'Luis pendiente',instrumento:'Clarinete'},{usuario_id:extra[1],nombre:'Marta trompeta',instrumento:'Trompeta'});s.roster=[s.uid,s.other,...extra].map(usuario_id=>({evento_id:s.eid,usuario_id}));s.responses=[{evento_id:s.eid,usuario_id:s.uid,respuesta:'voy',actualizado_en:new Date().toISOString()},{evento_id:s.eid,usuario_id:s.other,respuesta:'no_voy',actualizado_en:new Date().toISOString()},{evento_id:s.eid,usuario_id:extra[1],respuesta:'voy',actualizado_en:new Date().toISOString()}];});await page.locator('#ba-refresh').click();
 await page.locator('[data-select]').first().click();await page.locator('[data-action="open"]').waitFor();
 const clarinet=page.locator('.ba-instrument').filter({has:page.locator('h4',{hasText:'Clarinete'})});assert.equal(await clarinet.count(),1,'Agrupa instrumentos con diferencias de mayúsculas y espacios');assert.equal(await clarinet.locator('[data-forecast-status=voy] li').textContent(),'Jaime');assert.equal(await clarinet.locator('[data-forecast-status=no] li').textContent(),'Ana no asiste');assert.equal(await clarinet.locator('[data-forecast-status=pending] li').textContent(),'Luis pendiente');assert.equal(await page.locator('.ba-instrument').filter({has:page.locator('h4',{hasText:'Trompeta'})}).locator('[data-forecast-status=voy] li').textContent(),'Marta trompeta');assert.equal(await page.locator('.ba-instrument').filter({has:page.locator('h4',{hasText:'Sin instrumento'})}).locator('li').textContent(),'Sin ficha');
 await page.locator(`[data-qr="${eid}"]`).click();await page.locator('#ba-qr-image svg').waitFor();
 await page.locator('#ba-qr-image svg').screenshot({path:'/tmp/jc-qr.png'});
 await page.locator('#ba-qr-stop').click();await page.locator('#ba-qr-dialog').waitFor({state:'hidden'});assert(await page.evaluate(()=>testData.calls.some(c=>c.a==='cerrar')),'Cerrar fichaje desde pantalla QR');
 await page.evaluate(()=>{testData.events[0].concierto_id=72;testData.concerts=[{id_concierto:72,titulo:'Concierto de prueba',estado:'Publicado'}];});await page.locator('[data-admin-target="conciertos"]').click();await page.evaluate(()=>{conciertoAdminActual=testData.concerts[0];});await page.locator('#concierto-fichaje').click();await page.locator('#ba-qr-image svg').waitFor();assert(await page.evaluate(()=>testData.calls.filter(c=>c.a==='abrir').every(c=>c.d.evento_id===testData.eid)),'QR del concierto usa la convocatoria vinculada');await page.locator('#ba-qr-hide').click();
 await page.evaluate(()=>{testData.events[0].latitud=null;testData.events[0].longitud=null;});await page.locator(`[data-qr="${eid}"]`).click();await page.locator('#ba-qr-image svg').waitFor();await page.locator('#ba-qr-hide').click();assert.equal(await page.locator('#ba-use-location').count(),0,'Sin configuración GPS');await page.evaluate(()=>{testData.events[0].latitud=36.778;testData.events[0].longitud=-6.35;});

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
