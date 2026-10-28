#pragma once
namespace souz {
inline constexpr char PanelPage[] =
R"SOUZWEB(<!doctype html>
<html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Souz Content • Background Gen</title>
<style>
:root{color-scheme:dark;font-family:Arial,Helvetica,sans-serif;background:#090c12;color:#f4f7fc}*{box-sizing:border-box}body{margin:0;background:radial-gradient(ellipse at 90% 0%,#152d3c,transparent 55%);min-height:100vh}main{max-width:1080px;margin:auto;padding:36px 24px}header{display:flex;align-items:center;gap:14px;border-bottom:1px solid #27313e;padding-bottom:28px}.mark{width:40px;height:40px;border:2px solid #87f4c8;border-radius:10px;transform:rotate(-12deg);display:grid;place-items:center;font-size:26px;font-weight:bold;color:#87f4c8}.brand{font-size:20px;font-weight:800;letter-spacing:2px}.brand small{display:block;font-size:10px;letter-spacing:5px;margin-top:4px;color:#9baab8}.tag{margin-left:auto;color:#9baab8;font-size:12px}h1{font-size:clamp(32px,6vw,54px);letter-spacing:-2px;margin:50px 0 12px}p{color:#a7b4c5;line-height:1.6}.grid{display:grid;grid-template-columns:1.9fr 1fr;gap:20px;margin-top:32px;align-items:start}.card{background:#111821;border:1px solid #283342;border-radius:20px;padding:28px}label{font-size:16px;font-weight:bold}.eyebrow{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#87f4c8}button{border:1px solid #3c4b5a;border-radius:10px;background:#1b2934;color:#eef5ff;padding:12px 16px;cursor:pointer;font:inherit;font-size:14px}button:hover{border-color:#87f4c8}:focus-visible{outline:2px solid #87f4c8;outline-offset:2px}.status{margin-top:22px;color:#87f4c8;font-size:13px}.status.bad{color:#ff9a9a}#links a{display:block;color:#87f4c8;font-size:13px;overflow-wrap:anywhere;margin:15px 0}#instance{font-family:monospace;color:#b8c8d7}.note{font-size:12px}footer{margin-top:28px;color:#768698;font-size:12px}
.stack{display:grid;gap:20px;min-width:0}#blocks[data-offline="1"]{opacity:.4;pointer-events:none}
.aside{position:sticky;top:20px}
.bhead{display:flex;justify-content:space-between;align-items:flex-start;gap:14px}.bhead h2{margin:8px 0 0;font-size:26px;letter-spacing:-1px}.ghost{background:transparent;color:#a7b4c5;font-size:12px;padding:9px 12px;white-space:nowrap}
.controls{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:4px 30px;margin-top:14px}.ctl{padding:12px 0;min-width:0}.ctl.wide{grid-column:1/-1}
.row{display:flex;justify-content:space-between;align-items:baseline;gap:10px}.val{font-size:22px;font-weight:bold;letter-spacing:-1px;font-variant-numeric:tabular-nums}
input[type=range]{width:100%;accent-color:#87f4c8;margin:10px 0 2px;height:30px;cursor:pointer}
.hint{font-size:12px;color:#7f8fa1;line-height:1.4}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 4px}.chip{padding:9px 13px;font-size:13px}.chip.on,.sw.on,.toggle.on{border-color:#87f4c8;color:#87f4c8;background:#15302c}
.pal{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;margin:10px 0 4px}.sw{padding:8px;text-align:left;font-size:12px;border-radius:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sw i{display:block;height:20px;border-radius:6px;margin-bottom:7px}
.toggle{width:100%;display:flex;justify-content:space-between;align-items:center;margin-top:8px;padding:11px 14px}.toggle b{font-size:12px;font-weight:normal}
.colorrow{display:flex;align-items:center;gap:12px;margin-top:8px}input[type=color]{width:64px;height:42px;padding:2px;border:1px solid #3c4b5a;border-radius:10px;background:#1b2934;cursor:pointer}.hex{font-family:monospace;font-size:13px;color:#b8c8d7}.ctl.muted{opacity:.45}
@media(max-width:820px){.grid{grid-template-columns:1fr}.aside{position:static}}
@media(max-width:680px){.tag{display:none}main{padding:24px 16px}.card{padding:22px 18px}h1{margin-top:36px}.controls{grid-template-columns:1fr}.bhead{flex-direction:column;gap:6px}}
</style>
<main><header><div class="mark">S</div><div class="brand">SOUZ<small>CONTENT</small></div><span class="tag">VISUALS · LIVE CONTROL</span></header>
<div class="eyebrow" style="margin-top:38px">Background Gen / Painel de controle</div><h1>Seu visual. Seu ritmo.</h1><p>Controle os parâmetros desta instância em tempo real.</p>
<div class="grid"><div id="blocks" class="stack" data-offline="1"></div>
<aside class="card aside"><div class="eyebrow">Esta instância</div><p id="instance">—</p><p>Abra um dos links abaixo no celular ou em outro computador da mesma rede.</p><div id="links"></div><p class="note">O link dá acesso ao controle desta instância. No Windows, permita o Resolume no firewall apenas na sua rede privada.</p><p class="note">Automação ativa no Resolume pode substituir os ajustes do painel.</p><div id="status" class="status" role="status">Conectando…</div></aside></div><footer>Souz Content · Painel experimental 02 · Sem serviços externos</footer></main>
<script>
const $=id=>document.getElementById(id), blocksEl=$('blocks'), statusEl=$('status');
const token=location.hash.slice(1), headers={'X-Souz-Token':token};
const FMT={pct:v=>Math.round(v*100)+'%',speed:v=>(v*v*4).toFixed(2)+'×',seed:v=>String(Math.round(v*9999)),deg:v=>Math.round(v*360)+'°'};
const state=[], hold=[], ui=[], dragging=new Set(), pending=new Map(), colors=[], paletteBtns=[];
let schema=null, built=false, sending=false, infoLoaded=false, infoLoading=false, customSwatch=null, paletteIndex=-1;
function el(tag,props,...kids){const e=document.createElement(tag);for(const k in props||{}){if(k==='on'){for(const ev in props.on)e.addEventListener(ev,props.on[ev])}else if(k==='attrs'){for(const a in props.attrs)e.setAttribute(a,props.attrs[a])}else e[k]=props[k]}for(const c of kids)e.append(c);return e}
function connection(ok,text){statusEl.textContent=text;statusEl.className='status'+(ok?'':' bad');blocksEl.setAttribute('data-offline',ok?'0':'1');blocksEl.inert=!ok}
)SOUZWEB"
R"SOUZWEB(async function api(path,options={}){const r=await fetch(path,{...options,headers:{...headers,...options.headers},cache:'no-store',signal:AbortSignal.timeout(2500)});if(!r.ok)throw Error(r.status===403?'Link inválido. Clique em Abrir painel novamente.':'Falha de comunicação');return r.json()}
async function flush(){if(sending||!pending.size)return;sending=true;const batch=[...pending].slice(0,8);for(const [i] of batch)pending.delete(i);
 try{await api('/api/set',{method:'POST',headers:{'Content-Type':'text/plain'},body:batch.map(([i,v])=>i+' '+(+v.toFixed(5))).join('\n')});connection(true,'Conectado · alteração enviada')}catch(e){pending.clear();connection(false,e.message)}finally{sending=false;if(pending.size)flush()}}
function set(i,v){state[i]=v;hold[i]=Date.now()+450;pending.set(i,v);if(ui[i])ui[i](v);flush()}
function hsb2rgb(h,s,v){h=(((h%1)+1)%1)*6;const i=Math.floor(h),f=h-i,p=v*(1-s),q=v*(1-s*f),t=v*(1-s*(1-f));return [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i%6]}
function rgb2hsb(r,g,b){const mx=Math.max(r,g,b),d=mx-Math.min(r,g,b);let h=0;if(d){if(mx===r)h=((g-b)/d+6)%6;else if(mx===g)h=(b-r)/d+2;else h=(r-g)/d+4;h/=6}return [h,mx?d/mx:0,mx]}
const toHex=rgb=>'#'+rgb.map(x=>Math.round(Math.min(1,Math.max(0,x))*255).toString(16).padStart(2,'0')).join('');
const fromHex=hex=>[1,3,5].map(k=>parseInt(hex.slice(k,k+2),16)/255);
function customGradient(){return 'linear-gradient(90deg,'+colors.map(c=>toHex(hsb2rgb(state[c.h],state[c.s],state[c.b]))).join(',')+')'}
function refreshCustom(){if(customSwatch)customSwatch.style.background=customGradient();for(const c of colors)c.row.className='ctl'+(paletteIndex===0?'':' muted')}
function control(it){
 if(it.kind==='range'){const out=el('span',{className:'val'}),id='p'+it.i,inp=el('input',{id,type:'range',min:0,max:1,step:it.step||0.001,attrs:{'aria-label':it.label}});
  inp.addEventListener('input',()=>set(it.i,Number(inp.value)));inp.addEventListener('pointerdown',()=>dragging.add(it.i));
  ui[it.i]=v=>{inp.value=v;out.textContent=FMT[it.fmt](v)};
  return el('div',{className:'ctl'},el('div',{className:'row'},el('label',{textContent:it.label,attrs:{for:id}}),out),inp,el('div',{className:'hint',textContent:it.hint||''}))}
 if(it.kind==='option'){const btns=it.options.map(o=>el('button',{className:'chip',textContent:o.n,attrs:{'aria-pressed':'false'},on:{click:()=>set(it.i,o.v)}}));
  ui[it.i]=v=>btns.forEach((b,k)=>{const on=it.options[k].v===Math.round(v);b.className='chip'+(on?' on':'');b.setAttribute('aria-pressed',on?'true':'false')});
  return el('div',{className:'ctl wide'},el('div',{className:'row'},el('label',{textContent:it.label}),el('span',{className:'hint',textContent:it.hint||''})),el('div',{className:'chips'},...btns))}
 if(it.kind==='palette'){const btns=it.options.map(o=>{const strip=el('i',{});if(o.c)strip.style.background='linear-gradient(90deg,'+o.c.join(',')+')';else customSwatch=strip;
   return el('button',{className:'sw',attrs:{'aria-pressed':'false','aria-label':'Paleta '+o.n},on:{click:()=>set(it.i,o.v)}},strip,o.n)});
  ui[it.i]=v=>{paletteIndex=Math.round(v);btns.forEach((b,k)=>{const on=it.options[k].v===paletteIndex;b.className='sw'+(on?' on':'');b.setAttribute('aria-pressed',on?'true':'false')});refreshCustom()};
  return el('div',{className:'ctl wide'},el('div',{className:'row'},el('label',{textContent:it.label}),el('span',{className:'hint',textContent:it.hint||''})),el('div',{className:'pal'},...btns))}
 if(it.kind==='bool'){const st=el('b',{}),b=el('button',{className:'toggle',attrs:{role:'switch','aria-checked':'false','aria-label':it.label},on:{click:()=>set(it.i,state[it.i]>=0.5?0:1)}},el('span',{textContent:it.label}),st);
  ui[it.i]=v=>{const on=v>=0.5;b.className='toggle'+(on?' on':'');b.setAttribute('aria-checked',on?'true':'false');st.textContent=on?'Ligado':'Desligado'};
  return el('div',{className:'ctl'},b,el('div',{className:'hint',textContent:it.hint||''}))}
 const hex=el('span',{className:'hex'}),inp=el('input',{type:'color',attrs:{'aria-label':it.label}}),row=el('div',{className:'ctl'},el('label',{textContent:it.label}),el('div',{className:'colorrow'},inp,hex));
 const sync=()=>{if(!dragging.has(it.h)){const want=hsb2rgb(state[it.h],state[it.s],state[it.b]);let differs=true;
  if(inp.value){const have=fromHex(inp.value);differs=Math.max(...want.map((x,k)=>Math.abs(x-have[k])))>0.012}
  if(differs)inp.value=toHex(want)}hex.textContent=inp.value;refreshCustom()};
 inp.addEventListener('input',()=>{const [h,s,b]=rgb2hsb(...fromHex(inp.value));set(it.h,h);set(it.s,s);set(it.b,b)});
 inp.addEventListener('pointerdown',()=>{dragging.add(it.h);dragging.add(it.s);dragging.add(it.b)});
 ui[it.h]=ui[it.s]=ui[it.b]=sync;colors.push({h:it.h,s:it.s,b:it.b,row});return row}
function resetGroup(g){for(const it of g.items){if(it.kind==='color'){set(it.h,it.def[0]);set(it.s,it.def[1]);set(it.b,it.def[2])}else set(it.i,it.def)}}
function build(schema){
 for(const g of schema.groups)for(const it of g.items){if(it.kind==='color'){state[it.h]=it.def[0];state[it.s]=it.def[1];state[it.b]=it.def[2]}else state[it.i]=it.def}
 for(const g of schema.groups){const card=el('section',{className:'card'});
  card.append(el('div',{className:'bhead'},el('div',{},el('div',{className:'eyebrow',textContent:g.eyebrow}),el('h2',{textContent:g.title})),el('button',{className:'ghost',textContent:'Restaurar padrão',on:{click:()=>resetGroup(g)}})));
  if(g.note)card.append(el('p',{className:'note',textContent:g.note}));
  card.append(el('div',{className:'controls'},...g.items.map(control)));blocksEl.append(card)}
 for(let i=0;i<ui.length;i++)if(ui[i])ui[i](state[i]);
 built=true}
function applyState(v){const t=Date.now();for(let i=0;i<v.length;i++){if(hold[i]>t||dragging.has(i)||pending.has(i))continue;if(!(Math.abs(v[i]-state[i])<1e-6)){state[i]=v[i];if(ui[i])ui[i](v[i])}}}
for(const ev of ['pointerup','pointercancel','blur'])window.addEventListener(ev,()=>dragging.clear());
)SOUZWEB"
R"SOUZWEB(async function poll(){try{const s=await api('/api/state');connection(true,'Conectado · sincronizado com o plugin');if(!infoLoaded)loadInfo();if(!schema)await boot();if(built)applyState(s.v)}catch(e){connection(false,e.message||'Instância indisponível')}finally{setTimeout(poll,100)}}
async function boot(){if(schema)return;const s=await api('/api/schema');build(s);schema=s}
async function loadInfo(){if(infoLoading)return;infoLoading=true;try{const info=await api('/api/info');$('instance').textContent='Instância · porta '+info.port;for(const url of info.urls){const a=document.createElement('a');a.href=url+'/#'+token;a.textContent=url;$('links').append(a)}infoLoaded=true}catch(e){/* Retry instance links after the next successful state poll. */}finally{infoLoading=false}}
loadInfo();poll();
</script></html>
)SOUZWEB";
}
