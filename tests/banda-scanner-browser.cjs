const {chromium}=require(process.env.JC_PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');const path=require('node:path');const fixture=require('./helpers/banda-fixture.cjs');const qrcode=require('../js/vendor/qrcode-generator.js');
(async()=>{
 const options={headless:true};if(process.env.JC_BROWSER_EXECUTABLE){options.executablePath=process.env.JC_BROWSER_EXECUTABLE;options.args=['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage'];}
 const browser=await chromium.launch(options),context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('https://**/*',r=>r.fulfill({status:200,body:'',contentType:'application/javascript'}));await context.route('**/js/config.js',r=>r.fulfill({status:200,body:'',contentType:'application/javascript'}));
 const page=await context.newPage();await page.addInitScript(fixture);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8090/templates/musicos.html');await page.locator('#banda-content').waitFor({state:'visible'});
 assert.equal(await page.locator('#portal-stat-pending').textContent(),'1');
 for(const width of [320,390,768,1280]){
  await page.setViewportSize({width,height:900});
  for(const name of ['resumen','calendario','confirmaciones','asistencias','escanear']){
   await page.locator(`.portal-tools [data-view="${name}"]`).click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Sin desbordamiento: '+name+' '+width);
  }
  await page.locator('.portal-tools [data-view="resumen"]').click();if([390,1280].includes(width))await page.screenshot({path:`/tmp/jc-portal-v2-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await page.locator('.portal-tools [data-view="escanear"]').click();
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});
 await page.locator('#portal-camera-start').click();await page.getByText(/No hay permiso de cámara/).waitFor();assert(await page.locator('#portal-camera-start').isEnabled());
 const code=await page.evaluate(()=>location.origin+'/templates/musicos.html#evento='+testData.eid+'&token=00000000-0000-4000-8000-000000000020');
 await page.locator('#portal-qr-link').evaluate(el=>el.closest('details').open=true);await page.locator('#portal-qr-link').fill('https://otra-web.invalid/');await page.locator('#portal-qr-submit').click();await page.getByText('Este QR no es un código de asistencia de esta web.',{exact:true}).waitFor();assert(await page.locator('#banda-checkin').isHidden());
 const qr=qrcode(0,'M');qr.addData(code);qr.make();
 const png=await page.evaluate(async svg=>{
  const image=new Image();await new Promise((ok,no)=>{image.onload=ok;image.onerror=no;image.src='data:image/svg+xml;base64,'+btoa(svg);});
  const canvas=document.createElement('canvas');canvas.width=640;canvas.height=640;canvas.getContext('2d').drawImage(image,0,0,640,640);window.fakeQRCanvas=canvas;return canvas.toDataURL('image/png');
 },qr.createSvgTag({cellSize:8,margin:4}));
 await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{const stream=fakeQRCanvas.captureStream(12);window.qrTracks=stream.getTracks();window.fakeCameraTick=setInterval(()=>fakeQRCanvas.getContext('2d').drawImage(fakeQRCanvas,0,0),80);return stream;};});
 await page.locator('#portal-camera-start').click();try{await page.locator('#banda-checkin').waitFor({state:'visible',timeout:15000});}catch(e){console.error(await page.evaluate(()=>({status:document.getElementById('portal-camera-status').textContent,video:document.getElementById('portal-camera').readyState,width:document.getElementById('portal-camera').videoWidth})));throw e;}
 assert(await page.evaluate(()=>qrTracks.every(t=>t.readyState==='ended')),'Cámara apagada después de leer QR');
 assert.equal(await page.evaluate(()=>testData.calls.filter(c=>c.a==='fichar').length),0,'Leer QR no ficha sin confirmar');
 await page.locator('#banda-fichar').click();await page.getByText('Asistencia registrada correctamente.',{exact:true}).waitFor();assert(await page.locator('#banda-fichar').isDisabled());
 await page.locator('#portal-scan-again').click();
 await page.locator('#portal-qr-image').setInputFiles({name:'qr-asistencia.png',mimeType:'image/png',buffer:Buffer.from(png.split(',')[1],'base64')});await page.locator('#banda-checkin').waitFor({state:'visible'});await page.getByText(/Tu registro: Presente/).waitFor();
 await page.locator('#portal-scan-again').click();
 await page.evaluate(()=>{const blank=document.createElement('canvas');blank.width=320;blank.height=320;blank.getContext('2d').fillRect(0,0,320,320);navigator.mediaDevices.getUserMedia=async()=>{const stream=blank.captureStream(12);window.qrTracks=stream.getTracks();return stream;};});
 await page.locator('#portal-camera-start').click();await page.locator('#portal-camera-stop').waitFor({state:'visible'});await page.locator('.portal-tools [data-view="resumen"]').click();assert(await page.evaluate(()=>qrTracks.every(t=>t.readyState==='ended')),'Salir de escáner cierra la cámara');
 await page.locator('.portal-tools [data-view="escanear"]').click();await page.screenshot({path:'/tmp/jc-portal-v2-scanner.png',fullPage:true});
 assert.equal(errors.length,0,errors.join('\n'));await browser.close();console.log('OK: 5 vistas, móvil/escritorio, cámara denegada, QR real en vídeo e imagen, confirmación y cierre de cámara.');
})().catch(e=>{console.error(e);process.exit(1);});
