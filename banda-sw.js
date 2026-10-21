/* Canal independiente de los avisos del directo público. No almacena páginas ni datos privados. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('push',event=>{
 let data={};try{data=event.data?.json()||{};}catch{data={};}
 event.waitUntil(self.registration.showNotification(data.title||'Portal músico · Julián Cerdán',{
  body:data.body||'Tienes un nuevo aviso en el portal.',icon:'/img/icon-192.png',badge:'/img/icon-192.png',tag:data.tag||'banda-portal',
  data:{url:'/templates/musicos.html#avisos'},actions:[{action:'open',title:'Abrir portal'}]
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();const url=new URL('/templates/musicos.html#avisos',self.location.origin).href;
 event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(async clients=>{
  const client=clients.find(c=>new URL(c.url).origin===self.location.origin&&new URL(c.url).pathname==='/templates/musicos.html');
  if(client){await client.navigate(url);return client.focus();}return self.clients.openWindow(url);
 }));
});
