// Headless logic test with a minimal DOM adapter and the REAL HTTP server.
// This checks communication, not layout or browser rendering.
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const child=spawn(process.argv[2],[],{stdio:['pipe','pipe','inherit']});
try {
 const [line]=await once(child.stdout,'data');
 const [port,token]=String(line).trim().split(' ');
 const base=`http://127.0.0.1:${port}`;
 class Element {value='';textContent='';className='';style={};disabled=false;events={};children=[];addEventListener(n,f){this.events[n]=f}append(e){this.children.push(e)}}
 const els=Object.fromEntries(['speed','value','status','statustext','fill','pause','reset','instance','links'].map(id=>[id,new Element()]));
 els.speed.disabled=els.pause.disabled=els.reset.disabled=true;
 let infoAttempts=0;
 const context={document:{querySelector:s=>els[s.slice(1)],querySelectorAll:()=>[els.pause,els.reset],createElement:()=>new Element()},window:{addEventListener(){}},location:{hash:'#'+token},fetch:(path,opts)=>path==='/api/info'&&++infoAttempts===1?Promise.reject(Error('Temporary network failure')):fetch(base+path,opts),AbortSignal,setTimeout:(fn,ms)=>setTimeout(fn,ms).unref()};
 vm.createContext(context);
 const source=readFileSync(new URL('../web/panel.html',import.meta.url),'utf8').split('<script>')[1].split('</script>')[0];
 vm.runInContext(source,context);
 const wait=async check=>{for(let i=0;i<100;i++){if(check())return;await new Promise(r=>setTimeout(r,30))}throw Error('UI timeout')};
 await wait(()=>!els.speed.disabled);assert.equal(els.value.textContent,'0.49×');await wait(()=>els.links.children.length>0);assert(infoAttempts>=2);
 els.speed.value='0.5';els.speed.events.input();await wait(()=>els.statustext.textContent.includes('sincronizado'));
 await new Promise(r=>setTimeout(r,200));
 const state=await fetch(base+'/api/state',{headers:{'X-Souz-Token':token}}).then(r=>r.json());assert.equal(state.speed,.5);
 child.stdin.write('host 0.8\n');await wait(()=>Number(els.speed.value)===.8);assert.equal(els.value.textContent,'2.56×');
 els.pause.onclick();await wait(()=>els.value.textContent==='0.00×');
 child.stdin.write('stop1\n');await wait(()=>els.speed.disabled);
 const linkCount=els.links.children.length;await new Promise(r=>setTimeout(r,250));assert.equal(els.links.children.length,linkCount);
 console.log('PASS: instance links recover from transient failure without duplication; panel initial state, slider POST, host-to-panel sync, pause and disconnect');
} finally {child.stdin.write('quit\n');child.stdin.end();}
