// Headless logic test with a minimal DOM adapter and the REAL HTTP server.
// It checks communication and control wiring, not layout or browser rendering.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const child=spawn(process.argv[2],[],{stdio:['pipe','pipe','inherit']});
const replies=[]; let buffer='';
child.stdout.on('data',d=>{buffer+=d;let n;while((n=buffer.indexOf('\n'))>=0){replies.push(buffer.slice(0,n).replace(/\r$/,''));buffer=buffer.slice(n+1)}});
const reply=async()=>{for(let i=0;i<200;i++){if(replies.length)return replies.shift();await new Promise(r=>setTimeout(r,20))}throw Error('harness timeout')};
const host=async cmd=>{child.stdin.write(cmd+'\n');return reply()};
try {
 const [port,token]=(await reply()).split(' ');
 const base=`http://127.0.0.1:${port}`, auth={headers:{'X-Souz-Token':token}};
 class Element{constructor(tag){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.style={};this.className='';this.textContent='';this.value='';this.parent=null}
  addEventListener(n,f){(this.listeners[n]??=[]).push(f)} setAttribute(k,v){this.attrs[k]=String(v)} getAttribute(k){return this.attrs[k]}
  append(...nodes){for(const n of nodes){const c=typeof n==='string'?Object.assign(new Element('#text'),{textContent:n}):n;c.parent=this;this.children.push(c)}}
  fire(n){(this.listeners[n]||[]).forEach(f=>f({}))}}
 const containers=Object.fromEntries(['blocks','status','instance','links'].map(id=>[id,new Element('div')]));
 const windowListeners={};
 let infoAttempts=0;
 const context={document:{getElementById:id=>containers[id],createElement:t=>new Element(t)},
  window:{addEventListener:(n,f)=>(windowListeners[n]??=[]).push(f)},location:{hash:'#'+token},
  fetch:(path,opts)=>path==='/api/info'&&++infoAttempts===1?Promise.reject(Error('Temporary network failure')):fetch(base+path,opts),
  AbortSignal,setTimeout:(fn,ms)=>setTimeout(fn,ms).unref()};
 vm.createContext(context);
 vm.runInContext(readFileSync(new URL('../web/panel.html',import.meta.url),'utf8').split('<script>')[1].split('</script>')[0],context);
 const wait=async(check,what='UI')=>{for(let i=0;i<150;i++){if(await check())return;await new Promise(r=>setTimeout(r,30))}throw Error('timeout: '+what)};
 const walk=(n,f,out=[])=>{if(f(n))out.push(n);n.children.forEach(c=>walk(c,f,out));return out};
 const blocks=containers.blocks, find=f=>walk(blocks,f)[0];
 const aria=l=>find(n=>n.attrs['aria-label']===l), text=(t)=>find(n=>n.tag==='button'&&n.textContent===t);
 const shown=label=>aria(label).parent.children[0].children[1].textContent;
 const server=async()=>(await fetch(base+'/api/state',auth).then(r=>r.json())).v;
 const on=b=>b.className.includes(' on');

 // Two blocks built from the schema, in the requested order; instance links recover without duplicates.
 await wait(()=>blocks.children.length===2&&blocks.attrs['data-offline']==='0','blocks built');
 const heads=blocks.children.map(c=>walk(c,n=>n.tag==='h2')[0].textContent);
 assert.deepEqual(heads,['Parâmetros do gerador','Parâmetros de cores']);
 const labels=c=>walk(c,n=>n.tag==='label').map(n=>n.textContent);
 assert.deepEqual(labels(blocks.children[0]),['Engine','Shape','Palette','Scale','Density','Smoothness','Blur','Speed','Warp','Seed','Rotation']);
 assert.deepEqual(labels(blocks.children[1]),['Brightness','Contrast','Saturation','ColorShift','Pulse','Cor 1','Cor 2','Cor 3','Cor 4']);
 await wait(()=>containers.links.children.length>0,'links');assert(infoAttempts>=2);
 assert.equal(shown('Speed'),'0.49×');assert(on(text('Fog')));assert(on(aria('Paleta Sunset')));
 assert(aria('Paleta Custom').children[0].style.background.startsWith('linear-gradient'));
 assert(!aria('Reverse').className.includes(' on'));

 // Browser -> plugin, every control type.
 text('Aurora').fire('click');await wait(async()=>(await server())[0]===3,'engine');assert(on(text('Aurora'))&&!on(text('Fog')));
 text('Hexagon').fire('click');await wait(async()=>(await server())[1]===3,'shape');
 aria('Paleta Ocean').fire('click');await wait(async()=>(await server())[2]===2,'palette');assert(on(aria('Paleta Ocean')));
 const speed=aria('Speed');speed.value='0.5';speed.fire('input');await wait(async()=>(await server())[7]===.5,'speed');assert.equal(shown('Speed'),'1.00×');
 const seed=aria('Seed');seed.value='0.5';seed.fire('input');await wait(async()=>Math.abs((await server())[9]-.5)<1e-4,'seed');assert.equal(shown('Seed'),'5000');
 const rot=aria('Rotation');rot.value='0.25';rot.fire('input');await wait(async()=>(await server())[10]===.25,'rotation');assert.equal(shown('Rotation'),'90°');
 aria('Reverse').fire('click');await wait(async()=>(await server())[16]===1,'reverse on');assert(on(aria('Reverse')));assert.equal(aria('Reverse').getAttribute('aria-checked'),'true');
 aria('Reverse').fire('click');await wait(async()=>(await server())[16]===0,'reverse off');
 aria('Invert').fire('click');await wait(async()=>(await server())[17]===1,'invert');
 const c1=aria('Cor 1');c1.value='#ff0000';c1.fire('input');
 await wait(async()=>{const v=await server();return Math.abs(v[18])<.01&&Math.abs(v[19]-1)<.01&&Math.abs(v[20]-1)<.01},'color');
 // Colors only matter with Custom: dimmed otherwise, normal once Custom is chosen.
 assert(find(n=>n.className.startsWith('ctl')&&n.children[0]?.textContent==='Cor 1').className.includes('muted'));
 aria('Paleta Custom').fire('click');await wait(async()=>(await server())[2]===0,'custom');
 assert(!find(n=>n.className.startsWith('ctl')&&n.children[0]?.textContent==='Cor 1').className.includes('muted'));
 // Several quick moves go out in batches and all arrive.
 for(const [l,x] of [['Scale',.11],['Density',.22],['Smoothness',.33],['Blur',.44],['Warp',.55]]){const s=aria(l);s.value=String(x);s.fire('input')}
 await wait(async()=>{const v=await server();return v[3]===.11&&v[4]===.22&&v[5]===.33&&v[6]===.44&&v[8]===.55},'batch');

 // Plugin/host -> browser, without touching a control the person is dragging.
 assert.equal(await host('host 3 0.9'),'ok');await wait(()=>Number(aria('Scale').value)===.9,'host scale');assert.equal(shown('Scale'),'90%');
 await host('host 0 7');await wait(()=>on(text('Gradient 4')),'host engine');
 await host('host 18 0.6');await wait(()=>aria('Cor 1').value!=='#ff0000','host color');
 for(const f of windowListeners.pointerup||[])f();
 const blur=aria('Blur');blur.fire('pointerdown');await host('host 6 0.9');await new Promise(r=>setTimeout(r,500));
 assert.equal(Number(blur.value),.44,'a dragged control must not jump');
 for(const f of windowListeners.pointerup||[])f();await wait(()=>Number(blur.value)===.9,'released control follows host');

 // Reset restores the block defaults only.
 walk(blocks.children[0],n=>n.tag==='button'&&n.textContent==='Restaurar padrão')[0].fire('click');
 await wait(async()=>{const v=await server();return v[0]===0&&v[1]===0&&v[2]===1&&v[3]===.5&&v[7]===.35&&v[9]===0&&v[16]===0},'reset block');
 assert.equal((await server())[17],1,'the colors block is untouched');
 assert.equal(shown('Speed'),'0.49×');

 // Instance goes away: controls lock, status flags it, links are not duplicated.
 await host('stop1');await wait(()=>blocks.attrs['data-offline']==='1'&&blocks.inert===true,'offline');
 assert(containers.status.className.includes('bad'));
 const linkCount=containers.links.children.length;await new Promise(r=>setTimeout(r,250));assert.equal(containers.links.children.length,linkCount);
 console.log('PASS: two blocks from the schema, every control type, batched writes, host-to-panel sync, drag protection, block reset, instance links recover, disconnect locks controls');
} finally {child.stdin.write('quit\n');child.stdin.end()}
