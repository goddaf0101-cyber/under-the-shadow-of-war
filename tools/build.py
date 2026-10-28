"""Build both outputs from source.
   python3 tools/build.py         -> dist/game_single.html (everything inlined; Claude artifact / one-file sharing)
                                     dist/test.html          (same, wrapped as a full page for local Playwright tests)
                                     web/                    (public web: GitHub Pages — assets as files, PWA, offline)
"""
import base64, os, json, shutil, hashlib
from PIL import Image, ImageDraw
R=os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))+'/'
INL=['data/events.js','data/life_variants.js','data/branches.js','data/chapters.js','data/twists.js','data/nights.js','online/config.js','config/balance_draft.js','engine.js']
KINDS=['npc','bg','props','player','pets','walk','vo']   # vo = optional recorded narration (intro_1.mp3 …); empty folder = device TTS
MIME={'webp':'image/webp','mp3':'audio/mpeg','m4a':'audio/mp4','ogg':'audio/ogg'}
def ls(k): d=R+'assets/'+k; return sorted(f for f in os.listdir(d) if not f.startswith('.')) if os.path.isdir(d) else []
def source():
    s=open(R+'index.src.html',encoding='utf-8').read()
    for f in INL: s=s.replace('/*INLINE:%s*/'%f, open(R+f,encoding='utf-8').read().replace('</script','<\\/script'))
    return s
def assets(mode):
    A={k:{} for k in KINDS}
    for k in KINDS:
        for f in ls(k):
            key=f.rsplit('.',1)[0]
            A[k][key]=('data:'+MIME[f.rsplit('.',1)[1]]+';base64,'+base64.b64encode(open(R+'assets/%s/%s'%(k,f),'rb').read()).decode()) if mode=='inline' else 'assets/%s/%s'%(k,f)
    return A
os.makedirs(R+'dist/shots',exist_ok=True)
single=source().replace('/*INLINE:ASSETS*/',json.dumps(assets('inline')))
open(R+'dist/game_single.html','w',encoding='utf-8').write(single)
open(R+'dist/test.html','w',encoding='utf-8').write('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}</style></head><body>'+single)
print('dist/game_single.html %.2f MB'%(len(single)/1e6))
# ---- public web ----
W=R+'web/'; shutil.rmtree(W,ignore_errors=True); os.makedirs(W+'icons')
files=[]
for k in KINDS:
    os.makedirs(W+'assets/'+k)
    for f in ls(k):
        shutil.copy(R+'assets/%s/%s'%(k,f),W+'assets/%s/%s'%(k,f))
        if k!='props': files.append('assets/%s/%s'%(k,f))
s=source().replace('/*INLINE:ASSETS*/',json.dumps(assets('files')))
spr=Image.open(R+'assets/player/male_poor.webp').convert('RGBA'); bb=spr.getbbox(); spr=spr.crop((bb[0],bb[1],bb[2],bb[1]+int((bb[3]-bb[1])*0.42)))
for n in (192,512):
    ic=Image.new('RGBA',(n,n),(20,20,18,255)); d=ImageDraw.Draw(ic)
    d.rectangle([n*0.04,n*0.04,n*0.96,n*0.96],outline=(214,166,58,255),width=max(2,n//64))
    sp=spr.copy(); sp.thumbnail((int(n*0.78),int(n*0.86))); ic.alpha_composite(sp,((n-sp.width)//2,n-sp.height-int(n*0.04)))
    ic.convert('RGB').save(W+'icons/icon-%d.png'%n)
files+=['icons/icon-192.png','icons/icon-512.png']
title='WW3 Thailand Survival'
head=('<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
 '<meta name="theme-color" content="#141412"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">'
 '<meta name="description" content="เกมเอาชีวิตรอดแบบเล่าเรื่อง ประเทศไทยในสงครามโลกครั้งที่ 3">'
 '<link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icons/icon-192.png"><link rel="apple-touch-icon" href="icons/icon-192.png"><style>html,body{margin:0;background:#141412}</style>')
reg='<script>if("serviceWorker" in navigator&&(location.protocol==="https:"||location.hostname==="localhost")){addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){});});}</script>'
build=hashlib.sha1((s+''.join(files)).encode()).hexdigest()[:10]   # identity of this build, shown to running pages via version.json
html=head+'<script>window.WW3_BUILD="%s";</script>'%build+s+reg; open(W+'index.html','w',encoding='utf-8').write(html)
json.dump({'build':build},open(W+'version.json','w'))
files=['./','index.html','manifest.webmanifest']+files
ver=hashlib.sha1(html.encode()+''.join(files).encode()).hexdigest()[:10]
json.dump({"name":title,"short_name":"WW3 TH","lang":"th","start_url":"./","scope":"./","display":"standalone","orientation":"portrait","background_color":"#141412","theme_color":"#141412",
  "icons":[{"src":"icons/icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icons/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any"}]},open(W+'manifest.webmanifest','w',encoding='utf-8'),ensure_ascii=False,indent=1)
open(W+'sw.js','w').write("""/* offline cache — version changes on every build so players get updates */
const V='%s', CORE=%s;
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET') return;
  const u=new URL(r.url);
  if(u.hostname.endsWith('supabase.co')) return;
  if(u.pathname.endsWith('/version.json')) return;   /* always from the network: update notice */
  if(r.mode==='navigate'){ e.respondWith(fetch(r).then(res=>{caches.open(V).then(c=>c.put('index.html',res.clone()));return res;}).catch(()=>caches.match('index.html'))); return; }
  e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{ if(res.ok||res.type==='opaque'){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));} return res; })));
});
"""%(ver,json.dumps(files)))
open(W+'.nojekyll','w').write('')
print('web/index.html %.0f KB · cache %s · build %s'%(os.path.getsize(W+'index.html')/1024,ver,build))
