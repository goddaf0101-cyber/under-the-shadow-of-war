const ROOT=require('path').resolve(__dirname,'..');
// fit-test every branch version on small phones + scan life-mismatch words
global.window=global;require(ROOT+'/data/events.js');require(ROOT+'/data/branches.js');require(ROOT+'/config/balance_draft.js');
const R=WW3_BALANCE.eventRequires, BR=WW3_DATA.branches;
const terms={children:/เด็กในบ้าน|เด็กของคุณ|ลูกของคุณ|ลูกคุณ/,household:/คนในบ้าน|ทั้งบ้าน|ทุกคนในบ้าน/};
let scanBad=[];for(const id in BR)for(const p in BR[id]){const req=R[id]||[];const b=BR[id][p];const txt=[b.s,...Object.values(b.choices).flatMap(c=>[c.t,c.r])];
 for(const g in terms)if(txt.some(x=>terms[g].test(x))&&!(req.includes(g)||(g==='household'&&req.includes('children'))))scanBad.push(id+p+':'+g);}
console.log('life-mismatch',scanBad);
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const er=[],bad=[];let n=0;
const ids=WW3_DATA.events.map(e=>e.id);const ONLY=process.argv[2];
for(const [w,h] of [[375,600]]){const p=await b.newPage({viewport:{width:w,height:h}});p.on('pageerror',e=>er.push(e.message));
 await p.goto('file://'+ROOT+'/dist/test.html');await p.click('#new');await p.click('#go');
 for(const id of ids)for(const path of ['P1']){
  await p.evaluate(([id,path])=>{const W=window.__ww3,st=W.state;const ev=window.WW3_DATA.events.find(e=>e.id===id);st.char.family='มีลูกเล็ก';st.alive=true;Object.keys(st.stats).forEach(k=>st.stats[k]=80);const a=st.arcs[ev.arc];a.ptr=W.engine.arcEvents[ev.arc].findIndex(x=>x.id===id);a.path=path;st.memory=[{day:1,hour:9,id:'X',arc:ev.arc,title:'เหตุการณ์ก่อนหน้า',key:'B',text:'ชวนบ้านใกล้กันนับน้ำที่มีแล้วแบ่งกัน'}];st.queue=[{id,hour:10},{id,hour:11}];st.qi=0;st.phase='event';st.lastResult=null;W.render();},[id,path]);
  const m=await p.evaluate(()=>{const c=document.querySelector('.main > .card');return {t:document.querySelector('.card h3').textContent,o:c.scrollHeight-c.clientHeight,pg:document.documentElement.scrollHeight-innerHeight}});
  n++;if(!window.__seen)window.__seen=0;if(m.o>0||m.pg>0)bad.push([w,id,path,m]);
  for(const k of [0,1,2,3]){} 
  await p.click('.choice >> nth=3');const r=await p.evaluate(()=>{const c=document.querySelector('.main > .card');return [c.scrollHeight-c.clientHeight,document.documentElement.scrollHeight-innerHeight]});if(r[0]>0||r[1]>0)bad.push([w,id,path,'result',r]);
 }
 await p.close();}
console.log('checked',n,'bad',JSON.stringify(bad));console.log(er);await b.close();})();
