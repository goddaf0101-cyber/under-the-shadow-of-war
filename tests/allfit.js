const ROOT=require('path').resolve(__dirname,'..');
const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();
for (const [n,vp] of [['se',{width:375,height:600}]]){
 const p=await b.newPage({viewport:vp});
 await p.goto('file://'+ROOT+'/dist/test.html');await p.evaluate(()=>{try{localStorage.setItem("ww3ts.intro.v1","true");localStorage.setItem("ww3ts.tut.v1",JSON.stringify({event:1,summary:1,trader:1}));}catch(e){}}); await p.click('#new'); await p.click('#go');
 const res=await p.evaluate(async()=>{const W=window.__ww3,st=W.state,out=[];
   const ids=W.engine.D.events.map(e=>e.id);
   for(const id of ids){ st.phase='event'; st.qi=0; st.queue=[{id,hour:10}]; document.querySelector('#again'); 
     // trigger re-render via a harmless click path: use internal render by dispatching
     window.dispatchEvent(new Event('resize')); }
   return ids.length;});
 // re-render each by reloading state
 let worst=[];
 for(let i=1;i<=200;i++){ const id='R'+String(i).padStart(3,'0');
   await p.evaluate((id)=>{const st=window.__ww3.state; st.phase='event'; st.qi=0; st.queue=[{id,hour:10}]; localStorage.setItem('ww3ts.save.v1',JSON.stringify(st));},id);
   await p.reload(); await p.click('#cont');
   const o=await p.evaluate(()=>{const c=document.querySelector('.main > .card');return {ov:c.scrollHeight-c.clientHeight,sc:document.querySelector('.scene').getBoundingClientRect().height|0};});
   if(o.ov>0||o.sc<100) worst.push([id,o.ov,o.sc]);
 }
 console.log(n,'events with overflow or tiny scene:',worst.length,JSON.stringify(worst.slice(0,12)));
}
await b.close();})();
