/* Entity serialization. No company data or Firebase credentials. */
(function(root){'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)),canonical=x=>JSON.stringify(sort(x));
function sort(x){if(Array.isArray(x))return x.map(sort);if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).sort().filter(k=>x[k]!==undefined).map(k=>[k,sort(x[k])]));return x;}
const equal=(a,b)=>canonical(a??null)===canonical(b??null);
function splitProject(p){const plan=clone(p),meta={};for(const k of ['history','revisions','snapshot','created','modified','creator']){if(k in plan){meta[k]=plan[k];delete plan[k];}}
for(const k of ['actual','parameters','priceOverrides','pdsCatalog','priceName','parameterVersion','priceVersion','status','protected','locked','cloud'])delete plan[k];
// Global sheets are always obtained from the protected version documents.
for(const sheet of Object.keys(plan.inputs||{}))if(sheet!=='2 - Auftragsparameter')delete plan.inputs[sheet];
const actual=p.actual?clone(p.actual):null;if(actual)delete actual.plannedProject;
return {plan,actual,meta,status:p.actual?.status==='Abgeschlossen'?'Abgeschlossen':p.status==='Vorkalkulation gesichert'?'In Bearbeitung':p.status||'Entwurf',protected:!!p.protected,locked:!!p.locked,parameterId:p.parameterVersion,priceId:p.priceVersion};}
function basis(p,parameterId,priceId,state){const ap=state.parameterVersions.find(x=>x.id===parameterId),pr=state.priceVersions.find(x=>x.id===priceId);if(!ap||!pr)throw Error('Der gespeicherte Preis- oder Parameterstand fehlt.');p.inputs={'2 - Auftragsparameter':clone(p.inputs?.['2 - Auftragsparameter']||{})};p.parameterVersion=ap.id;p.parameters=clone(ap.overrides||{});p.priceVersion=pr.id;p.priceName=pr.name;p.priceOverrides=clone(pr.overrides||{});p.pdsCatalog=clone(pr.pdsCatalog||null);return p;}
function joinProject(h,plan,actual,meta,planned,state){const p=basis({...clone(plan),...clone(meta),id:h.id,status:h.status,protected:h.protected,locked:h.locked},h.parameterId,h.priceId,state);p.actual=actual?clone(actual):null;if(p.actual){p.actual.status=h.actualClosed?'Abgeschlossen':'In Bearbeitung';p.actual.plannedProject=basis({...clone(planned),actual:null,status:'In Bearbeitung',protected:true,locked:true},h.plannedParameterId,h.plannedPriceId,state);}return p;}
function validateState(s,sourceHash){if(!s||s.format!=='KalkPro-TGA'||s.schema!==1||s.sourceHash!==sourceHash||!Array.isArray(s.projects)||!Array.isArray(s.priceVersions)||!Array.isArray(s.parameterVersions))throw Error('Keine kompatible KalkPro-TGA-Datensicherung.');
for(const [list,name]of [[s.projects,'Projekte'],[s.priceVersions,'Preisstände'],[s.parameterVersions,'Parameterstände'],[s.matrixHistory||[],'Matrixstände']]){const ids=new Set();for(const item of list){if(!item||typeof item.id!=='string'||!item.id||item.id.includes('/')||ids.has(item.id))throw Error('Ungültige oder doppelte Kennung: '+name);ids.add(item.id);}}
if(!s.priceVersions.some(x=>x.id===s.activePrice)||!s.parameterVersions.some(x=>x.id===s.activeParameters)||!Number.isInteger(s.lastNumber)||s.lastNumber<0)throw Error('Aktive Grundlagen oder Projektzähler fehlen.');const nums=new Set();for(const p of s.projects){const key=numberKey(p.number);if(!key||nums.has(key))throw Error('Leere oder doppelte Projektnummer.');nums.add(key);if(!p.inputs||!p.optimizer||!Array.isArray(p.history))throw Error('Unvollständiges Projekt.');}return s;}
const numberKey=x=>String(x||'').trim().normalize('NFC').toLowerCase();
async function hash(text){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
function chunks(text,size=48000){const out=[];for(let i=0;i<text.length;i+=size){let end=Math.min(i+size,text.length);if(end<text.length&&text.charCodeAt(end-1)>=0xD800&&text.charCodeAt(end-1)<=0xDBFF)end--;out.push(text.slice(i,end));i=end-size;}return out;}
root.KPCloudModel={clone,canonical,equal,splitProject,joinProject,basis,validateState,numberKey,hash,chunks};
})(globalThis);
