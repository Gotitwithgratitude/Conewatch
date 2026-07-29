/* ConeWatch service worker — offline shell + map tile cache */
const SHELL="cw-shell-v3", TILES="cw-tiles-v2";
const SHELL_FILES=["./","index.html","manifest.json"];
const TILE_HOSTS=["tiles.openfreemap.org","basemaps.cartocdn.com","fonts.openmaptiles.org","cdnjs.cloudflare.com","fonts.googleapis.com","fonts.gstatic.com","server.arcgisonline.com"];
const MAX_TILES=4000;
self.addEventListener("install",e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES)).then(()=>self.skipWaiting()).catch(()=>self.skipWaiting()));});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==SHELL&&k!==TILES).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener("fetch",e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=="GET")return;
  if(TILE_HOSTS.includes(url.host)){
    e.respondWith(caches.open(TILES).then(async c=>{
      const hit=await c.match(e.request);
      if(hit)return hit;
      try{const res=await fetch(e.request);if(res.ok){c.put(e.request,res.clone());c.keys().then(k=>{if(k.length>MAX_TILES)c.delete(k[0]);});}return res;}
      catch(err){return hit||Response.error();}
    }));
    return;
  }
  if(url.origin===self.location.origin){
    e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).catch(()=>caches.match("index.html"))));
  }
});
