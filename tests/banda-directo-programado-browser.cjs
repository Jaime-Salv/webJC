const {chromium}=require('playwright'),assert=require('node:assert/strict'),fixture=require('./helpers/banda-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.JC_BROWSER_EXECUTABLE,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']}),context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
 await context.route('https://**/*',r=>r.fulfill({status:200,body:'',contentType:'application/javascript'}));await context.route('**/js/config.js',r=>r.fulfill({status:200,body:'',contentType:'application/javascript'}));
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.addInitScript(fixture);
 await page.addInitScript(()=>{testData.events[0].procesion_id=71;testData.processions=[{id_procesion:71,hermandad:'Procesión programada',estado:'Programada',tipo:'Gloria',fecha:'2027-01-01',hora:'20:00',localidad:'Sanlúcar'}];});
 await page.goto('http://127.0.0.1:8090/templates/admin.html#banda');await page.locator('[data-start-procession="71"]').waitFor({state:'attached'});
 await page.evaluate(()=>{enviarAvisoInicioDirecto=async()=>{};});await page.locator('[data-start-procession="71"]').click();await page.waitForFunction(()=>procesionActiva?.id_procesion===71);assert(await page.locator('[data-admin-view="directo"]').evaluate(e=>e.classList.contains('activa')));assert(await page.evaluate(()=>testData.calls.some(c=>c.a==='empezar_directo'&&c.d.evento_id===testData.eid)));
 await page.evaluate(()=>{procesionActiva=null;testData.events[0].procesion_id=null;testData.events[0].concierto_id=72;testData.concerts=[{id_concierto:72,titulo:'Concierto',estado:'Publicado'}];document.dispatchEvent(new Event('agenda:refresh'));});
 await page.locator('[data-admin-target="conciertos"]').click();await page.evaluate(()=>{conciertoAdminActual=testData.concerts[0];});await page.locator('#concierto-empezar-directo').click();await page.waitForFunction(()=>procesionActiva?.concierto_id===72);assert.equal(await page.evaluate(()=>testData.calls.filter(c=>c.a==='empezar_directo').length),2);
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Directo sin desbordamiento '+width);}
 assert.deepEqual(errors,[]);await browser.close();console.log('OK: botones de directo de procesión y concierto, misma convocatoria, navegación y móvil.');
})().catch(e=>{console.error(e);process.exit(1)});
