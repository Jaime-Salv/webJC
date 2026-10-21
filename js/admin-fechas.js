/* Fecha canónica para los formularios; selección y escritura sin depender del picker del móvil. */
(() => {
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid'}).format(new Date());
 const pad=n=>String(n).padStart(2,'0');
 const iso=(y,m,d)=>`${String(y).padStart(4,'0')}-${pad(m)}-${pad(d)}`;
 const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number(value.slice(0,4))>0&&!Number.isNaN(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
 document.addEventListener('DOMContentLoaded',()=>{
  const fields=[...document.querySelectorAll('input[type=date],input[type=datetime-local]')];if(!fields.length)return;
  const dialog=document.createElement('dialog');dialog.id='jc-date-dialog';dialog.className='jc-date-dialog';
  dialog.setAttribute('aria-labelledby','jc-date-title');
  dialog.innerHTML=`<form id="jc-date-form"><div class="jc-date-heading"><h2 id="jc-date-title">Elegir fecha</h2><button type="button" id="jc-date-close" aria-label="Cerrar calendario">✕</button></div><div class="jc-date-heading"><button type="button" id="jc-date-prev" aria-label="Mes anterior">←</button><strong id="jc-date-month" aria-live="polite"></strong><button type="button" id="jc-date-next" aria-label="Mes siguiente">→</button></div><div id="jc-date-days" class="jc-date-days"></div><label for="jc-date-text">Fecha (día/mes/año)</label><input id="jc-date-text" type="text" inputmode="numeric" placeholder="DD/MM/AAAA" maxlength="10" autocomplete="off" required><small class="jc-date-help">También puedes escribir sin barras: 25102026.</small><div id="jc-date-time-row"><label for="jc-date-time">Hora de España peninsular (24 h)</label><input id="jc-date-time" type="text" inputmode="numeric" placeholder="HH:MM" maxlength="5" autocomplete="off"></div><p id="jc-date-error" role="alert" hidden></p><div class="jc-date-actions"><button type="button" id="jc-date-today">Hoy</button><button type="submit" class="jc-date-apply">Usar fecha</button></div></form>`;
  document.body.append(dialog);
  const $=id=>document.getElementById(id);let active=null,year,month,selected;
  function choose(value){selected=value;$('jc-date-text').value=value.split('-').reverse().join('/');$('jc-date-error').hidden=true;paint();}
  function paint(){
   $('jc-date-month').textContent=new Intl.DateTimeFormat('es-ES',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${iso(year,month+1,1)}T12:00:00Z`));
   const first=new Date(`${iso(year,month+1,1)}T12:00:00Z`),last=new Date(first);last.setUTCMonth(month+1,0);const days=last.getUTCDate();
   let html=['L','M','X','J','V','S','D'].map(d=>`<span aria-hidden="true">${d}</span>`).join('')+'<span></span>'.repeat((first.getUTCDay()+6)%7);
   for(let d=1;d<=days;d++){const value=iso(year,month+1,d),disabled=(active.min&&value<active.min.slice(0,10))||(active.max&&value>active.max.slice(0,10));html+=`<button type="button" data-date="${value}" aria-label="${d}/${month+1}/${year}" aria-pressed="${value===selected}" ${value===today()?'aria-current="date"':''} ${disabled?'disabled':''}>${d}</button>`;}
   $('jc-date-days').innerHTML=html;$('jc-date-prev').disabled=year===1&&month===0;$('jc-date-next').disabled=year===9999&&month===11;
  }
  function open(input){
   if(input.disabled||input.readOnly)return;
   active=input;const value=validDate(input.value.slice(0,10))?input.value.slice(0,10):today();year=+value.slice(0,4);month=+value.slice(5,7)-1;
   $('jc-date-title').textContent=input.dataset.dateLabel||'Elegir fecha';$('jc-date-time-row').hidden=input.type!=='datetime-local';$('jc-date-time').value=input.value.slice(11,16)||'12:00';
   choose(value);dialog.showModal();$('jc-date-days').querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
  }
  fields.forEach((input,index)=>{
   input.dataset.dateLabel=input.labels?.[0]?.textContent.trim()||'Elegir fecha';if(!input.id)input.id=`jc-date-field-${index}`;
   const wrap=document.createElement('span');wrap.className='jc-date-control';input.before(wrap);wrap.append(input);
   const button=document.createElement('button');button.type='button';button.className='jc-date-open';button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls',dialog.id);button.setAttribute('aria-label','Elegir fecha: '+input.dataset.dateLabel);wrap.append(button);
   const sync=()=>{button.disabled=input.disabled||input.readOnly;button.textContent=input.readOnly?'Desde publicación':'Elegir';wrap.dataset.locked=String(input.readOnly);wrap.title=input.readOnly?'Esta fecha se cambia desde «Editar publicación».':'';};sync();new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['readonly','disabled']});
   button.addEventListener('click',e=>{e.preventDefault();open(input);});
   input.addEventListener('pointerdown',e=>{if(e.pointerType==='touch'&&!input.disabled&&!input.readOnly)e.preventDefault();});
   input.addEventListener('click',e=>{if(input.disabled||input.readOnly)return;e.preventDefault();open(input);});
  });
  $('jc-date-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{if(active){active.parentElement.querySelector('.jc-date-open')?.focus({preventScroll:true});active=null;}});
  $('jc-date-prev').onclick=()=>{if(--month<0){month=11;year--;}paint();};$('jc-date-next').onclick=()=>{if(++month>11){month=0;year++;}paint();};
  $('jc-date-days').onclick=e=>{const b=e.target.closest('[data-date]');if(b)choose(b.dataset.date);};
  $('jc-date-today').onclick=()=>{const value=today();year=+value.slice(0,4);month=+value.slice(5,7)-1;choose(value);};
  $('jc-date-form').onsubmit=e=>{
   e.preventDefault();if(!active||active.disabled||active.readOnly)return;
   const text=$('jc-date-text').value.trim(),match=text.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/);
   const parts=match||text.match(/^(\d{2})(\d{2})(\d{4})$/);
   const value=parts?iso(+parts[3],+parts[2],+parts[1]):'';let result=value,error='';
   if(!validDate(value))error='Escribe una fecha válida, por ejemplo 25/10/2026.';
   if(!error&&active.type==='datetime-local'){
    const time=$('jc-date-time').value.trim().match(/^(\d{1,2}):?(\d{2})$/);
    if(!time||+time[1]>23||+time[2]>59)error='Escribe una hora válida de 00:00 a 23:59.';else result+='T'+pad(+time[1])+':'+time[2];
   }
   if(!error&&((active.min&&result<active.min)||(active.max&&result>active.max)))error='La fecha está fuera del intervalo permitido.';
   if(error){$('jc-date-error').textContent=error;$('jc-date-error').hidden=false;return;}
   active.value=result;active.dispatchEvent(new Event('input',{bubbles:true}));active.dispatchEvent(new Event('change',{bubbles:true}));dialog.close();
  };
 });
})();
