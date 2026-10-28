const ROOT=require('path').resolve(__dirname,'..');
const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:390,height:844}});const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+ROOT+'/dist/test.html');await p.evaluate(()=>{try{localStorage.setItem("ww3ts.intro.v1","true");localStorage.setItem("ww3ts.tut.v1",JSON.stringify({event:1,summary:1,trader:1}));}catch(e){}});await p.click('#new');await p.click('#go');
await p.evaluate(()=>{const s=window.__ww3.state;s.stats.health=2;s.stats.fullness=0;s.stats.hydration=0;});
while(await p.evaluate(()=>window.__ww3.state.phase==='event')){await p.click('.choice >> nth=0');await p.click('#next');}
console.log('phase',await p.evaluate(()=>window.__ww3.state.phase));
await p.screenshot({path:ROOT+'/dist/shots/dead.png',fullPage:false});
await p.reload();console.log('cont after death',!!(await p.$('#cont')), await p.textContent('.board'));console.log(errs);await b.close();})();
