/* KalkPro TGA: Originalformeln werden interpretiert, nicht über eval ausgeführt.
 * IF/IFERROR werten Zweige verzögert aus. Excel-Fehler sind eigene Werte.
 * Keine pauschale Nullsetzung fachlicher Fehlermeldungen. */
(function(root){
'use strict';
class ExcelError extends Error { constructor(code){super(code);this.code=code;} }
const err=c=>{throw new ExcelError(c)},num=x=>{if(x===null||x===undefined||x==='')return 0;if(typeof x==='boolean')return +x;if(typeof x==='number')return x;if(typeof x==='string'&&x.trim()!==''&&Number.isFinite(Number(x)))return Number(x);return err('#VALUE!');};
const truth=x=>typeof x==='string'?(/^true$/i.test(x)?true:/^false$/i.test(x)?false:err('#VALUE!')):!!x;
const str=x=>x==null?'':typeof x==='boolean'?(x?'TRUE':'FALSE'):String(x);
function column(s){return [...s.replace(/\$/g,'')].reduce((a,c)=>a*26+c.charCodeAt(0)-64,0)}
function colName(n){let s='';while(n){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26)}return s}
function address(a){let m=/^\$?([A-Z]+)\$?(\d+)$/i.exec(a);if(!m)err('#REF!');return [column(m[1].toUpperCase()),+m[2]]}
function range(a,b){const [c1,r1]=address(a),[c2,r2]=address(b);let out=[];for(let r=Math.min(r1,r2);r<=Math.max(r1,r2);r++)for(let c=Math.min(c1,c2);c<=Math.max(c1,c2);c++)out.push(colName(c)+r);return out}
function tokenize(s){let a=[],p=0;while(p<s.length){let tail=s.slice(p),m;if(/^\s/.test(tail)){p++;continue}if(tail[0]==='"'){m=/^"(?:[^"]|"")*"/.exec(tail);if(!m)err('#PARSE!');a.push({t:'string',v:m[0].slice(1,-1).replace(/""/g,'"')});}else if(tail[0]==="'"){m=/^'(?:[^']|'')*'/.exec(tail);if(!m)err('#PARSE!');a.push({t:'sheet',v:m[0].slice(1,-1).replace(/''/g,"'")});}else if((m=/^(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?/i.exec(tail))){a.push({t:'number',v:+m[0]});}else if((m=/^\$?[A-Z]+\$?\d+\b/i.exec(tail))){a.push({t:'ref',v:m[0].replace(/\$/g,'').toUpperCase()});}else if((m=/^[A-Z_][A-Z0-9_.]*/i.exec(tail))){a.push({t:'name',v:m[0].toUpperCase().replace(/^_XLFN\./,'')});}else if((m=/^(?:<>|<=|>=|[+\-*/^&=<>(),:!%])/ .exec(tail))){a.push({t:m[0],v:m[0]});}else err('#PARSE! '+tail.slice(0,12));p+=m[0].length}a.push({t:'end'});return a}
const prec={'=':1,'<>':1,'<':1,'>':1,'<=':1,'>=':1,'&':2,'+':3,'-':3,'*':4,'/':4,'^':5};
function parse(s){const ts=tokenize(s.replace(/^=/,''));let p=0;const take=t=>{if(ts[p].t!==t)err('#PARSE! expected '+t);return ts[p++]};
 function expr(min=0){let t=ts[p++],n;if(t.t==='+'||t.t==='-')n={k:'unary',op:t.t,a:expr(6)};else if(t.t==='number'||t.t==='string')n={k:'literal',v:t.v};else if(t.t==='('){n=expr();take(')')}else if(t.t==='sheet'||t.t==='ref'){
 let sheet=null,cell=t.v;if(t.t==='sheet'){sheet=t.v;take('!');cell=take('ref').v}n={k:'ref',sheet,cell};if(ts[p].t===':'){p++;if(ts[p].t==='sheet'){const rs=ts[p++].v;take('!');if(rs!==sheet)err('#REF! range sheets')}n.end=take('ref').v}
 }else if(t.t==='name'){
 if(ts[p].t==='('){p++;let args=[];while(ts[p].t!==')'){if(ts[p].t===','){args.push({k:'literal',v:null});p++;continue}args.push(expr());if(ts[p].t===','){p++;if(ts[p].t===')')args.push({k:'literal',v:null});}else break}take(')');n={k:'fn',name:t.v,args};}
 else if(t.v==='TRUE'||t.v==='FALSE')n={k:'literal',v:t.v==='TRUE'};else err('#NAME? '+t.v)
 }else err('#PARSE! '+t.t);
 while(true){let op=ts[p].t;if(op==='%'){p++;n={k:'binary',op:'/',a:n,b:{k:'literal',v:100}};continue}if(!(op in prec)||prec[op]<min)break;p++;n={k:'binary',op,a:n,b:expr(prec[op]+(op==='^'?0:1))}}
 return n}
 const ast=expr();if(ts[p].t!=='end')err('#PARSE! remaining '+ts[p].t);return ast}
const AST=new Map();
function compare(a,b){if(a==null)a=typeof b==='string'?'':0;if(b==null)b=typeof a==='string'?'':0;
 const ta=typeof a,tb=typeof b;if(ta!==tb){const rank={number:1,string:2,boolean:3};return Math.sign((rank[ta]||0)-(rank[tb]||0));}if(ta==='string'){a=a.toUpperCase();b=b.toUpperCase()}return a<b?-1:a>b?1:0}
class Engine {
 constructor(sheets,overrides={}){this.sheets=sheets;this.overrides=overrides;this.cache=new Map();this.active=new Set();}
 get(sheet,cell){const key=sheet+'!'+cell;if(this.cache.has(key)){let x=this.cache.get(key);if(x instanceof ExcelError)throw x;return x;}if(this.active.has(key))err('#CYCLE!');if(!this.sheets[sheet])err('#REF! '+sheet);
 this.active.add(key);try{let entry=this.sheets[sheet][cell],x;if(Object.hasOwn(this.overrides[sheet]||{},cell))x=this.overrides[sheet][cell];else if(!entry)x=null;else if(!entry.f)x=entry.v;else{let ast=AST.get(entry.v);if(!ast){ast=parse(entry.v);AST.set(entry.v,ast)}x=this.run(ast,sheet);if(x===null)x=0;}
 this.cache.set(key,x);return x;}catch(e){if(!(e instanceof ExcelError))throw e;this.cache.set(key,e);throw e;}finally{this.active.delete(key)}}
 safe(sheet,cell){try{return this.get(sheet,cell)}catch(e){return e.code||e.message}}
 run(n,sheet){const ev=x=>this.run(x,sheet),flat=x=>Array.isArray(x)?x.flat(Infinity):[x];if(n.k==='literal')return n.v;if(n.k==='ref'){let s=n.sheet||sheet;return n.end?range(n.cell,n.end).map(c=>this.get(s,c)):this.get(s,n.cell)}if(n.k==='unary')return n.op==='-'?-num(ev(n.a)):ev(n.a);if(n.k==='binary'){let a=ev(n.a),b=ev(n.b);switch(n.op){case '&':return str(a)+str(b);case '=':return compare(a,b)===0;case '<>':return compare(a,b)!==0;case '>':return compare(a,b)>0;case '<':return compare(a,b)<0;case '>=':return compare(a,b)>=0;case '<=':return compare(a,b)<=0;case '+':return num(a)+num(b);case '-':return num(a)-num(b);case '*':return num(a)*num(b);case '/':return num(b)===0?err('#DIV/0!'):num(a)/num(b);case '^':return Math.pow(num(a),num(b))}}
 let args=n.args;if(n.name==='IF')return truth(ev(args[0]))?(args[1]?ev(args[1]):true):(args[2]?ev(args[2]):false);if(n.name==='IFERROR'){try{return ev(args[0])}catch(e){if(!(e instanceof ExcelError))throw e;return ev(args[1])}}
 let vals=args.map(ev);switch(n.name){case 'TRUE':return true;case 'FALSE':return false;case 'AND':case 'OR':{let vs=vals.flat().filter(x=>typeof x==='boolean'||typeof x==='number');if(!vs.length)err('#VALUE!');return n.name==='AND'?vs.every(truth):vs.some(truth)}case 'SUM':return vals.reduce((a,x)=>a+(Array.isArray(x)?x.filter(v=>typeof v==='number').reduce((s,v)=>s+v,0):num(x)),0);case 'COUNTIF':{let test=vals[1];return flat(vals[0]).filter(x=>compare(x,test)===0).length}case 'TEXTJOIN':{const [sep,ignore,...rest]=vals;return rest.flat().filter(x=>!truth(ignore)||x!==null&&x!=='').map(str).join(str(sep))}case 'HYPERLINK':return vals[1]??vals[0];default:err('#NAME? '+n.name)}
 }
}
root.KPEngine={Engine,parse,ExcelError,range,num,compare};
if(typeof module!=='undefined')module.exports=root.KPEngine;
})(globalThis);
