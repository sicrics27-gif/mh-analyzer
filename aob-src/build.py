import re, os, json, shutil, sys
D=os.path.dirname(os.path.abspath(__file__)); S=os.path.join(D,'src'); O=os.path.join(D,'dist')
os.makedirs(O,exist_ok=True)
r=lambda f: open(os.path.join(S,f),encoding='utf-8').read()
old=r('old.css').replace('<style>','').replace('</style>','')
old=re.sub(r':root\{.*?\}\n','',old,count=1,flags=re.S)
old=re.sub(r'@media \(prefers-color-scheme: dark\)\{:root.*?\}\}\n','',old,count=1,flags=re.S)
old=re.sub(r':root\[data-theme="dark"\]\{.*?\}\n','',old,count=1,flags=re.S)
css=old+'\n'+r('style.css')
js=['native.js','parser.js','analyzer.js','health.js','claims.js','coverage.js','benefit.js','products.js','xlscrypt.js','ingest.js','store.js','sync.js','access.js','nhc.js','afgdb.js','game.js','trail.js']
cfgp=os.path.join(D,'google.json'); gcfg=json.load(open(cfgp)) if os.path.exists(cfgp) else {}
def rr(f):
    t=r(f)
    if f=='sync.js' and gcfg.get('web'): t=t.replace('__WEB_CLIENT_ID__',gcfg['web'])
    return t
engine='\n'.join('<script>\n'+rr(f)+'\n</script>' for f in js)
ui='<script>\n'+r('ui.js')+'\n</script>'
body=r('body.html')
FONT='<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+KR:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap">'
CDN='''<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>'''
PFONT='<style>@font-face{font-family:"Pretendard Variable";font-weight:45 920;font-style:normal;font-display:swap;src:url(lib/PretendardVariable.woff2) format("woff2-variations")}</style>'
LOCAL='''<script src="lib/pdf.worker.min.js"></script>
<script src="lib/pdf.min.js"></script>
<script src="lib/jszip.min.js"></script>
<script src="lib/xlsx.full.min.js"></script>
<script src="lib/qrcode.js"></script>'''
title='<title>AOB9 · Authentic Ocean Branch · Team 9</title>'
# 1) 아티팩트 (조각)
art=title+'\n<meta name="claude:viewport-fit-sides" content="cover">\n'+FONT+'\n<style>\n'+css+'\n</style>\n'+body+'\n'+CDN+'\n'+engine+'\n'+ui
open(os.path.join(O,'artifact.html'),'w',encoding='utf-8').write(art)
# 2) PC용 단일 파일 (CDN)
head='<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'+title+'\n'
pc=head+FONT+'\n<style>\n'+css+'\n</style>\n</head>\n<body>\n'+body+'\n'+CDN+'\n'+engine+'\n'+ui+'\n</body>\n</html>\n'
open(os.path.join(O,'병력고지분석기.html'),'w',encoding='utf-8').write(pc)
# 3) PWA 폴더 (오프라인)
P=os.path.join(O,'pwa'); os.makedirs(os.path.join(P,'lib'),exist_ok=True)
nm=os.path.join(D,'node_modules')
LIBS=[('pdfjs-dist/build/pdf.min.js','pdf.min.js'),('pdfjs-dist/build/pdf.worker.min.js','pdf.worker.min.js'),('jszip/dist/jszip.min.js','jszip.min.js'),('xlsx/dist/xlsx.full.min.js','xlsx.full.min.js'),('pretendard/dist/web/variable/woff2/PretendardVariable.woff2','PretendardVariable.woff2'),('qrcode-generator/qrcode.js','qrcode.js'),('leaflet/dist/leaflet.js','leaflet.js'),('leaflet/dist/leaflet.css','leaflet.css')]
if not os.path.isdir(nm):  # npm install 안 한 곳(워크플로·다른 대화): 저장소에 이미 있는 pwa/lib 의 라이브러리를 그대로 씀
    for _s,dst in LIBS: shutil.copy(os.path.join(D,'..','pwa','lib',dst),os.path.join(P,'lib',dst))
for src,dst in ([] if not os.path.isdir(nm) else LIBS) or []:
    shutil.copy(os.path.join(nm,src),os.path.join(P,'lib',dst))
if False:
    pass
ST=os.path.join(D,'static')
for f in os.listdir(ST):
    shutil.copy(os.path.join(ST,f),os.path.join(P,'lib' if f.endswith('.jpg') else '',f) if not f.endswith('.jpg') else os.path.join(P,'lib',f))
pwahead=head+'<meta name="theme-color" content="#090B10">\n<link rel="manifest" href="manifest.webmanifest">\n<link rel="icon" href="icon-192.png">\n<link rel="apple-touch-icon" href="icon-512.png">\n<meta name="apple-mobile-web-app-capable" content="yes">\n<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="AOB9">\n'
import hashlib
ver=hashlib.md5((css+body+engine+ui).encode('utf-8')).hexdigest()[:12]
# 새 버전 알아채기: 앱을 오래 켜 둬도 version.json 이 바뀌면 위에 '새 버전' 띠 → 누르면 적용 (30분 넘게 다른 앱에 있다 오면 자동 적용)
reg='<script>window.AOB_V="'+ver+'";if("serviceWorker" in navigator&&location.protocol!=="file:"){addEventListener("load",function(){navigator.serviceWorker.register("sw.js").then(function(r){try{r.update();}catch(e){}}).catch(function(){});});}'+\
 '(function(){if(location.protocol==="file:")return;var hid=0,shown=0;function busy(){return !!document.getElementById("cph")||!!document.querySelector("#dlg:not([hidden])");}'+\
 'function bar(){if(shown)return;shown=1;var b=document.createElement("button");b.type="button";b.id="verBar";b.textContent="🔄 새 버전이 나왔습니다 · 눌러서 바로 적용";b.style.cssText="position:fixed;left:50%;top:calc(env(safe-area-inset-top) + 8px);transform:translateX(-50%);z-index:99999;border:0;border-radius:999px;padding:10px 18px;background:#2f6bff;color:#fff;font:600 14px sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35)";b.onclick=function(){location.reload();};document.body.appendChild(b);}'+\
 'function chk(auto){fetch("version.json?t="+Date.now(),{cache:"no-store"}).then(function(r){return r.json();}).then(function(j){if(j&&j.v&&j.v!==window.AOB_V){if(auto&&!busy())location.reload();else bar();}}).catch(function(){});}'+\
 'document.addEventListener("visibilitychange",function(){if(document.hidden){hid=Date.now();return;}var away=hid?Date.now()-hid:0;hid=0;chk(away>30*60*1000);});setInterval(function(){if(!document.hidden)chk(false);},5*60*1000);setTimeout(function(){chk(false);},20000);})();</script>'
pwa=pwahead+PFONT+FONT+'\n<style>\n'+css+'\n</style>\n</head>\n<body>\n'+body+'\n'+LOCAL+'\n'+engine+'\n'+ui+'\n'+reg+'\n</body>\n</html>\n'
open(os.path.join(P,'index.html'),'w',encoding='utf-8').write(pwa)
open(os.path.join(P,'version.json'),'w').write(json.dumps({'v':ver}))
open(os.path.join(P,'manifest.webmanifest'),'w',encoding='utf-8').write(json.dumps({"name":"AOB9 · Authentic Ocean Branch · Team 9","short_name":"AOB9","description":"어센틱 오션브랜치 9팀 고객관리 (병력고지·보장분석·싯플랜)","share_target":{"action":"./share-target","method":"POST","enctype":"multipart/form-data","params":{"files":[{"name":"file","accept":["application/pdf",".pdf","application/zip",".zip"]}]}},"lang":"ko","start_url":"./","scope":"./","display":"standalone","background_color":"#090B10","theme_color":"#090B10","icons":[{"src":"icon-192.png","sizes":"192x192","type":"image/png"},{"src":"icon-512.png","sizes":"512x512","type":"image/png"},{"src":"icon-512.png","sizes":"512x512","type":"image/png","purpose":"maskable"}]},ensure_ascii=False,indent=1))
sw='''const V="mhs-%s";const ASSETS=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png","lib/pdf.min.js","lib/pdf.worker.min.js","lib/jszip.min.js","lib/xlsx.full.min.js","lib/PretendardVariable.woff2","lib/qrcode.js","lib/bg-afg.jpg","lib/bg-afg-tall.jpg","lib/bg-afg-hero.jpg","lib/bg-concrete-side.jpg","lib/bg-main.jpg","lib/afg-mark.jpg","lib/leaflet.js","lib/leaflet.css"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{const u=new URL(e.request.url);
 if(e.request.method==="POST"&&u.pathname.endsWith("/share-target")){e.respondWith((async()=>{const f=await e.request.formData();const fs=f.getAll("file");const c=await caches.open("mhs-share");const idx=[];for(let i=0;i<fs.length;i++){const k="./__share/"+Date.now()+"_"+i;await c.put(k,new Response(fs[i],{headers:{"x-name":encodeURIComponent(fs[i].name||("공유파일"+i+".pdf"))}}));idx.push(k);}await c.put("./__share/index",new Response(JSON.stringify(idx)));return Response.redirect("./?shared=1",303);})());return;}
 if(e.request.method!=="GET")return;
 if(u.origin===location.origin){if(u.pathname.endsWith("version.json"))return;e.respondWith((e.request.mode==="navigate"?fetch(e.request.url,{cache:"no-cache",credentials:"same-origin"}):fetch(e.request,{cache:"no-cache"})).then(r=>{const c=r.clone();caches.open(V).then(x=>x.put(e.request,c));return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match("index.html"))));return;}
 if(/fonts\\.(googleapis|gstatic)\\.com$/.test(u.hostname)){e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const c=res.clone();caches.open(V).then(x=>x.put(e.request,c));return res;})));}
});
''' % ver
open(os.path.join(P,'sw.js'),'w',encoding='utf-8').write(sw)
print('built', len(art), len(pc), len(pwa))
# 4) 데스크톱(Tauri) 프런트엔드: 로컬 라이브러리, 서비스워커 없음
W=os.path.join(O,'desktop'); os.makedirs(os.path.join(W,'lib'),exist_ok=True)
for f in os.listdir(os.path.join(P,'lib')): shutil.copy(os.path.join(P,'lib',f),os.path.join(W,'lib',f))
desk=head+PFONT+FONT+'\n<style>\n'+css+'\n</style>\n</head>\n<body>\n'+body+'\n'+LOCAL+'\n'+engine+'\n'+ui+'\n</body>\n</html>\n'
open(os.path.join(W,'index.html'),'w',encoding='utf-8').write(desk)
print('desktop ok')

# --install : 만든 결과를 저장소의 pwa/ · web/ 에 바로 넣기 (배포 전 마지막 단계)
if '--install' in sys.argv:
    R=os.path.join(D,'..')
    for sub,dst in (('pwa','pwa'),('desktop','web')):
        src=os.path.join(O,sub)
        for root,dirs,files in os.walk(src):
            rel=os.path.relpath(root,src); os.makedirs(os.path.join(R,dst,rel),exist_ok=True)
            for f in files: shutil.copy(os.path.join(root,f),os.path.join(R,dst,rel,f))
    print('installed to pwa/ web/')
# --check : 저장소의 pwa/index.html 이 원본(aob-src)으로 만든 결과와 같은지 (누가 pwa/index.html 을 직접 고치면 실패)
if '--check' in sys.argv:
    norm=lambda t: re.sub(r'window\.AOB_V="[0-9a-f]+"','',t)
    a=norm(open(os.path.join(O,'pwa','index.html'),encoding='utf-8').read()); b=norm(open(os.path.join(D,'..','pwa','index.html'),encoding='utf-8').read())
    if a!=b:
        print('::error::pwa/index.html 이 원본(aob-src/src)과 다릅니다. pwa/index.html 을 직접 고치지 말고 aob-src/src 를 고친 뒤 python3 aob-src/build.py --install 하세요.'); sys.exit(1)
    print('check ok: pwa/index.html == build(aob-src)')
