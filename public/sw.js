const CACHE='thanaweya-shell-v7';
const CORE=['/','/manifest.webmanifest','/icons/thanaweya-192.png','/icons/thanaweya-512.png'];

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('fetch',event=>{
 const req=event.request;
 if(req.method!=='GET'||new URL(req.url).origin!==self.location.origin)return;
 const isDocument=req.mode==='navigate';
 const isAsset=/\.(?:js|css|json|webmanifest)$/.test(new URL(req.url).pathname);
 event.respondWith(
  (isDocument||isAsset
   ? fetch(req).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}
      return response;
    }).catch(()=>caches.match(req).then(cached=>cached||(isDocument?caches.match('/'):new Response('',{status:503,statusText:'Offline'}))))
   : caches.match(req).then(cached=>cached||fetch(req).then(response=>{
      if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});}
      return response;
    }).catch(()=>new Response('',{status:503,statusText:'Offline'})))
  )
 );
});