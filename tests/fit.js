const ROOT=require('path').resolve(__dirname,'..');
const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const er=[];
for (const [n,vp] of [['se',{width:375,height:600}],['ip',{width:390,height:664}],['max',{width:430,height:760}],['tall',{width:461,height:820}],['desk',{width:1280,height:860}]]){
 const p=await b.newPage({viewport:vp});p.on('pageerror',e=>er.push(n+': '+e.message));
 await p.goto('file://'+ROOT+'/dist/test.html');
 await p.evaluate(()=>{try{localStorage.clear()}catch(e){}}); await p.reload();await p.evaluate(()=>{try{localStorage.setItem("ww3ts.intro.v1","true");localStorage.setItem("ww3ts.tut.v1",JSON.stringify({event:1,summary:1,trader:1}));}catch(e){}});
 await p.click('#new');await p.click('#go');await p.waitForTimeout(300);
 const m=async(tag)=>{const r=await p.evaluate(()=>{const c=document.querySelector('.main > .card');return {page:document.documentElement.scrollHeight-innerHeight, cardOverflow:c?c.scrollHeight-c.clientHeight:0, scene:document.querySelector('.scene').getBoundingClientRect().height|0, hscroll:document.documentElement.scrollWidth>innerWidth};});console.log(n,tag,JSON.stringify(r));};
 await m('event'); await p.screenshot({path:`${ROOT}/dist/shots/fit-${n}-event.png`});
 // go to a templated event: play until event id > R020
 for(let i=0;i<12;i++){ const id=await p.evaluate(()=>{const s=window.__ww3.state;const q=s.queue[s.qi];return s.phase==='event'&&q?q.id:null}); if(id&&+id.slice(1)>20) break;
   const ph=await p.evaluate(()=>window.__ww3.state.phase); if(ph==='summary'){await p.click('.nopt[data-n=sleep]');await p.click('#nextday');continue;} if(ph==='night'){const enc=await p.$('.choice.enc:not([disabled])');if(enc){await enc.click();}await p.click('#nextday');continue;} if(ph==='event'){await p.click('.choice >> nth=0');} await p.click('#next'); }
 await m('event2'); await p.screenshot({path:`${ROOT}/dist/shots/fit-${n}-event2.png`});
 await p.click('.choice >> nth=2'); await m('result'); await p.screenshot({path:`${ROOT}/dist/shots/fit-${n}-result.png`});
 if(n==='ip'){ await p.click('#charSheet'); await p.waitForTimeout(200); await p.screenshot({path:`${ROOT}/dist/shots/fit-${n}-char.png`}); await p.click('#closeSheet');}
 while(await p.evaluate(()=>window.__ww3.state.phase)!=='summary'){ const ph=await p.evaluate(()=>window.__ww3.state.phase); if(ph==='event') await p.click('.choice >> nth=0'); await p.click('#next'); }
 await m('summary'); await p.screenshot({path:`${ROOT}/dist/shots/fit-${n}-summary.png`});
}
console.log(er);await b.close();})();
