const CACHE='thanaweya-shell-v11';
const CORE=['/','/manifest.webmanifest','/icons/thanaweya-192.png','/icons/thanaweya-512.png','/sw.js'];

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});

self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{}}catch{data={body:event.data?.text?.()||''}}
  const title=String(data.title||'ثانويه');
  const body=String(data.body||'');
  const icon=String(data.icon||'/icons/thanaweya-192.png');
  const badge=String(data.badge||icon);
  const target=typeof data.url==='string'&&data.url.startsWith('/')?data.url:'/';
  event.waitUntil(self.registration.showNotification(title,{
    body,
    icon,
    badge,
    dir:'rtl',
    lang:'ar',
    tag:String(data.tag||('thanaweya-'+Date.now())),
    renotify:true,
    data:{url:target}
  }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const target=event.notification?.data?.url||'/';
 event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
   for(const client of list){
     if('focus'in client){
       client.navigate(target).catch(()=>{});
       return client.focus();
     }
   }
   return clients.openWindow(target);
 }));
});

self.addEventListener('fetch',event=>{
 const req=event.request;
 const requestUrl=new URL(req.url);
 if(requestUrl.pathname.startsWith('/api/'))return;
 if(req.method!=='GET'||requestUrl.origin!==self.location.origin)return;
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