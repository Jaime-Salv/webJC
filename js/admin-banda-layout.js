/* Navegacion operativa del area de musicos. Reutiliza los formularios y servicios existentes. */
(() => {
 const init=()=>{
  const root=document.querySelector('[data-admin-view="banda"]');
  if(!root||root.querySelector('.jc-operations-tabs'))return;
  const sections=[
   {id:'agenda',label:'Agenda',icon:'▦',title:'Agenda y convocatorias',desc:'Consulta lo proximo y prepara cada actividad.'},
   {id:'control',label:'Asistencia',icon:'✓',title:'Control de asistencia',desc:'Revisa fichajes, respuestas e incidencias.'},
   {id:'miembros',label:'Músicos',icon:'♙',title:'Músicos de la banda',desc:'Consulta y edita las fichas desde Usuarios.'},
   {id:'historial',label:'Historial',icon:'◷',title:'Historial de eventos',desc:'Asistencia y distribución instrumental por actividad.'},
   {id:'estadisticas',label:'Estadísticas',icon:'%',title:'Estadísticas de asistencia',desc:'Porcentajes, comparativas y matriz 1/0 por período.'},
   {id:'informes',label:'Informes',icon:'▤',title:'Informes y exportaciones',desc:'Consulta por periodo y tipo de actividad.'}
  ];
  const header=root.querySelector('.admin-view-header');
  const nav=document.createElement('nav');nav.className='jc-operations-tabs';nav.setAttribute('aria-label','Secciones de gestión musical');
  nav.innerHTML=sections.map(s=>'<button type="button" data-section="'+s.id+'" aria-pressed="'+(s.id==='agenda')+'"><span aria-hidden="true">'+s.icon+'</span> '+s.label+'</button>').join('');
  header.insertAdjacentElement('afterend',nav);
  const panels={};
  sections.forEach(s=>{const el=document.createElement('section');el.className='jc-operation-panel';el.dataset.operationPanel=s.id;el.hidden=s.id!=='agenda';el.innerHTML='<header class="jc-operation-heading"><h2>'+s.title+'</h2><p>'+s.desc+'</p></header>';root.appendChild(el);panels[s.id]=el;});
  const move=(selector,key)=>{const el=root.querySelector(selector);if(el)panels[key].appendChild(el);};
  move('#ba-agenda','agenda');
  const creation=[...root.querySelectorAll(':scope > section.panel')];
  creation.filter(el=>el.querySelector('#bp-repeat-form')||el.querySelector('#agenda-new-procession')||el.querySelector('#ba-create-extra')).forEach(el=>panels.agenda.appendChild(el));
  move('#ba-editor','agenda');
  const today=root.querySelector('#bp-today')?.closest('section.panel');if(today)panels.control.appendChild(today);
  const events=root.querySelector('#ba-events')?.closest('.grid');if(events)panels.control.appendChild(events);
  move('#bp-editor','control');
  const reports=root.querySelector('#bp-report-form')?.closest('section.panel');if(reports)panels.informes.appendChild(reports);
  panels.miembros.innerHTML+='<div class="jc-member-shortcut"><p>Las fichas y permisos se administran desde Usuarios. Los asistentes a una convocatoria se consultan desde Asistencia.</p><button type="button" id="jc-go-users">Abrir gestión de usuarios</button></div>';
  panels.miembros.querySelector('button').addEventListener('click',()=>document.querySelector('[data-admin-target="usuarios"]')?.click());
  const switchTo=(id)=>{if(!panels[id])return;for(const [k,v] of Object.entries(panels))v.hidden=k!==id;nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.section===id)));};
  nav.addEventListener('click',e=>{const b=e.target.closest('[data-section]');if(b)switchTo(b.dataset.section);});
  document.addEventListener('banda:select',()=>switchTo('control'));
  document.addEventListener('banda:qr-evento',()=>switchTo('control'));
  document.addEventListener('banda:qr-publicacion',()=>switchTo('control'));
  const old=root.querySelector('.row.between:has(#ba-refresh)');if(old)header.insertAdjacentElement('afterend',old);
  // Landing counts: actual figures are recomputed by admin-banda.js.
  const stat=document.createElement('div');stat.id='jc-admin-quick-stats';stat.className='jc-admin-quick-stats';panels.agenda.querySelector('.jc-operation-heading').insertAdjacentElement('afterend',stat);
  window.JCBandaNavigate={open:switchTo};
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();