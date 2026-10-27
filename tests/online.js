const ROOT=require('path').resolve(__dirname,'..');
// mock window.claude.use with an in-memory db to exercise the online board
const {chromium}=require('playwright');(async()=>{const b=await chromium.launch();const er=[];
const mock=`window.claude={use:function(n){
  window.__docs=window.__docs||{"board/zz9":{name:"สมชาย",occ:"ครู",province:"น่าน",days:12,cause:"ขาดน้ำ"}};
  var subs=[];function emit(){var rows=Object.keys(__docs).filter(k=>k.indexOf("board/")===0).map(k=>({id:k.split("/")[1],exists:true,data:()=>__docs[k]})).sort((a,b)=>b.data().days-a.data().days);subs.forEach(f=>f({docs:rows}));}
  if(n==="db")return Promise.resolve({collection:function(c){return {orderBy:function(){return this},limit:function(){return this},onSnapshot:function(f){subs.push(f);setTimeout(emit,50);return function(){}},doc:function(id){var k=c+"/"+id;return {get:()=>Promise.resolve({exists:!!__docs[k],data:()=>__docs[k]}),set:d=>{__docs[k]=d;setTimeout(emit,10);return Promise.resolve();}}}}}});
  if(n==="user")return Promise.resolve({id:()=>Promise.resolve("me1")});return Promise.resolve(null);}};`;
for(const withMock of [false,true]){const p=await b.newPage({viewport:{width:390,height:664}});p.on('pageerror',e=>er.push(e.message));
 if(withMock) await p.addInitScript(mock);
 await p.goto('file://'+ROOT+'/dist/test.html');await p.waitForTimeout(300);
 const t1=await p.textContent('[data-online-board]');
 await p.click('#new');await p.click('#go');
 await p.evaluate(()=>{const s=window.__ww3.state;s.stats.health=3;s.stats.hydration=0;});
 for(let i=0;i<4&&!(await p.$('.card.dead'));i++){await p.click('.choice >> nth=1');await p.click('#next');}
 await p.waitForTimeout(400);
 const t2=await p.textContent('.card.dead [data-online-board]');
 const ov=await p.evaluate(()=>{const c=document.querySelector('.main > .card');return [c.scrollHeight-c.clientHeight,document.documentElement.scrollHeight-innerHeight]});
 await p.screenshot({path:ROOT+'/dist/shots/online_'+withMock+'.png'});
 console.log(withMock?'MOCK':'NO-CLAUDE','| title:',t1.slice(0,80),'| dead:',t2.replace(/\s+/g,' ').slice(0,160),'| overflow',ov, withMock?JSON.stringify(await p.evaluate(()=>window.__docs['board/me1'])):'');
 await p.close();}
console.log(er);await b.close();})();
