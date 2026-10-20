const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
function common(){const context={window:{},Intl,Date,URL,Error,Promise,String,Object,Number,Blob,setTimeout};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'js/banda-common.js'),'utf8'),context);return context.window.JCBanda;}
test('Madrid: fechas de verano, invierno y hora inexistente',()=>{const B=common();assert.equal(B.madridISO('2026-10-20T19:30'),'2026-10-20T17:30:00.000Z');assert.equal(B.madridISO('2026-12-20T19:30'),'2026-12-20T18:30:00.000Z');assert.throws(()=>B.madridISO('2026-03-29T02:30'));});
test('El texto aportado por usuarios se escapa antes de insertarse en HTML',()=>{assert.equal(common().escape('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');});
