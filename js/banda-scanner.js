/* Lectura local de QR: las imágenes y los fotogramas no se envían al servidor. */
window.JCQRScanner = (() => {
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 function parse(text,origin=location.origin) {
  const value=String(text||'').trim();
  if(!value || value.length>2048)throw Error('El QR no contiene un enlace de fichaje válido.');
  let url;try{url=new URL(value,origin);}catch{throw Error('No se reconoce el enlace del QR.');}
  if(url.origin!==origin || !['/templates/musicos.html','/templates/musicos'].includes(url.pathname))throw Error('Este QR no es un código de asistencia de esta web.');
  const p=new URLSearchParams(url.hash.slice(1));
  if(!uuid.test(p.get('evento')||'')||!uuid.test(p.get('token')||''))throw Error('El QR está incompleto. Escanea el código de asistencia que muestra administración.');
  return {evento_id:p.get('evento'),token:p.get('token')};
 }
 function cameraError(error) {
  if(['NotAllowedError','PermissionDeniedError','SecurityError'].includes(error?.name))return 'No hay permiso de cámara. Actívalo en los permisos del navegador o usa Leer una imagen.';
  if(['NotFoundError','DevicesNotFoundError'].includes(error?.name))return 'No se ha encontrado una cámara. Puedes leer una imagen del QR o pegar su enlace.';
  if(['NotReadableError','TrackStartError','AbortError'].includes(error?.name))return 'No se puede abrir la cámara. Cierra otras aplicaciones que la estén usando y vuelve a intentarlo.';
  return error?.message||'No se ha podido iniciar la cámara. Prueba con una imagen o con el enlace del QR.';
 }
 function create({video,onRead,onStatus=()=>{},onState=()=>{}}) {
  let stream=null,timer=null,generation=0,lastCode='',lastSeen=0;
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
  const decode=(source,width,height,maxSize=960)=>{
   if(typeof jsQR!=='function')throw Error('No se ha cargado el lector QR. Recarga el portal.');
   const scale=Math.min(1,maxSize/Math.max(width,height));canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
   ctx.drawImage(source,0,0,canvas.width,canvas.height);
   const frame=ctx.getImageData(0,0,canvas.width,canvas.height);
   return jsQR(frame.data,frame.width,frame.height,{inversionAttempts:'attemptBoth'})?.data||null;
  };
  function stop() {
   generation++;clearTimeout(timer);timer=null;
   if(stream)for(const track of stream.getTracks())track.stop();stream=null;
   video.pause();video.srcObject=null;onState('idle');
  }
  async function start() {
   stop();const current=++generation;onState('starting');onStatus('Solicitando permiso para usar la cámara…');
   try {
    if(!window.isSecureContext)throw Error('Abre el portal mediante HTTPS para poder usar la cámara.');
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Este navegador no permite abrir la cámara. Usa Leer una imagen o pega el enlace del QR.');
    const media=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
    if(current!==generation){media.getTracks().forEach(t=>t.stop());return;}
    stream=media;video.srcObject=media;await video.play();
    if(current!==generation)return;
    onState('scanning');onStatus('Cámara activa. Acerca el QR al encuadre y mantén el móvil quieto.');
    const tick=()=>{
     if(current!==generation)return;
     try {
      if(video.readyState>=2&&video.videoWidth&&video.videoHeight){
       const code=decode(video,video.videoWidth,video.videoHeight);
       if(code&&(code!==lastCode||Date.now()-lastSeen>4000)){
        lastCode=code;lastSeen=Date.now();
        if(onRead(code)){stop();return;}
       }
      }
     }catch(error){stop();onStatus(cameraError(error),true);return;}
     timer=setTimeout(tick,250);
    };tick();
   }catch(error){if(current===generation){stop();onStatus(cameraError(error),true);}}
  }
  async function image(file) {
   stop();if(!file)return;
   if(file.size>12*1024*1024)throw Error('La imagen es demasiado grande. Elige una imagen de menos de 12 MB.');
   onState('reading');onStatus('Leyendo el QR de la imagen en tu dispositivo…');
   const current=++generation;const url=URL.createObjectURL(file);
   try {
    const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('No se ha podido abrir la imagen. Prueba con una captura en JPG o PNG.'));img.src=url;});
    if(current!==generation)return;
    const code=decode(img,img.naturalWidth,img.naturalHeight,2000);
    if(!code)throw Error('No se reconoce un QR en esta imagen. Usa una imagen nítida donde se vea el código completo.');
    onRead(code);
   }finally{URL.revokeObjectURL(url);if(current===generation)onState('idle');}
  }
  return {start,stop,image};
 }
 return {parse,cameraError,create};
})();
