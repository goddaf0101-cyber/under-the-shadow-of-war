const ROOT=require('path').resolve(__dirname,'..');
global.window = global;
require(ROOT+'/data/events.js'); require(ROOT+'/config/balance_draft.js');
const E = require(ROOT+'/engine.js');
function run(policy, maxDays){
  const e = new E(WW3_DATA, WW3_BALANCE); const st = e.newGame();
  while(st.alive && st.day <= maxDays){
    if(st.phase==='event'){ const {ev}=e.currentEvent(st); e.choose(st, policy(e,st,ev)); }
    else if(st.phase==='result') e.next(st);
    else if(st.phase==='summary') e.nextDay(st);
  }
  return st.alive ? maxDays : e.daysSurvived(st);
}
const pol = {
  random:(e,st,ev)=>'ABCD'[Math.floor(Math.random()*4)],
  allA:()=> 'A', allB:()=>'B', allC:()=>'C', allD:()=>'D',
  greedy:(e,st,ev)=>{ let best,bs=-1e9; for(const k of 'ABCD'){ const d=e.effectsFor(ev,k); let s=0; for(const x in d){ const v=st.stats[x]; s+= d[x]*(x==='energy'?0.6:1)*(1.6-v/100);} if(s>bs){bs=s;best=k;} } return best; }
};
const N=+process.argv[2]||300, MAX=365;
for(const [n,p] of Object.entries(pol)){
  const r=[]; for(let i=0;i<N;i++) r.push(run(p,MAX)); r.sort((a,b)=>a-b);
  console.log(n.padEnd(7),'median',r[N>>1],'p10',r[Math.floor(N*.1)],'p90',r[Math.floor(N*.9)],'reach365', (r.filter(x=>x>=MAX).length/N*100).toFixed(0)+'%');
}
if(process.argv[3]==='diag'){
 for (const n of ['greedy','random']){
  const e=new E(WW3_DATA,WW3_BALANCE); const st=e.newGame(); const p=pol[n];
  while(st.alive && st.day<=365){ if(st.phase==='event'){const {ev}=e.currentEvent(st); e.choose(st,p(e,st,ev));} else if(st.phase==='result') e.next(st); else e.nextDay(st); }
  console.log(n, st.day, [10,20,30,40].map(d=>st.history[d-1]&&JSON.stringify(st.history[d-1].stats)).join('\n'), JSON.stringify(st.stats));
 }}
