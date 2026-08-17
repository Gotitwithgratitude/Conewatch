/* ConeWatch service worker — offline shell + raster tile cache (cache ver in SHELL below) */
const SHELL="cw-shell-v42", TILES="cw-tiles-v2";
const SHELL_FILES=["./","index.html","app.js","manifest.json","icon-512.png","apple-touch-icon.png",
  "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.3.0/maplibre-gl.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.3.0/maplibre-gl.min.css"];
const TILE_HOSTS=["a.basemaps.cartocdn.com","b.basemaps.cartocdn.com","c.basemaps.cartocdn.com","d.basemaps.cartocdn.com","basemaps.cartocdn.com","fonts.openmaptiles.org","cdnjs.cloudflare.com","fonts.googleapis.com","fonts.gstatic.com","server.arcgisonline.com"];
const MAX_TILES=6000;

self.addEventListener("install",e=>{
  e.waitUntil(caches.open(SHELL).then(c=>Promise.allSettled(SHELL_FILES.map(f=>c.add(f)))).then(()=>self.skipWaiting()));
});
self.addEventListener("activate",e=>{
  e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==SHELL&&k!==TILES).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
  const url=new URL(e.request.url);
  if(e.request.method!=="GET")return;
  // never cache API calls (routing, geocode, weather, overpass, supabase) — must stay live
  if(/routing|nominatim|photon|open-meteo|overpass|supabase|api\./.test(url.host)){return;}
  // map tiles + fonts + libs: cache-first (this is what makes offline work)
  const isTile=TILE_HOSTS.includes(url.host);
  if(isTile){
    e.respondWith(caches.open(TILES).then(async c=>{
      const hit=await c.match(e.request);
      if(hit)return hit;
      try{const res=await fetch(e.request);if(res&&res.ok){c.put(e.request,res.clone());c.keys().then(k=>{if(k.length>MAX_TILES)c.delete(k[0]);});}return res;}
      catch(err){return hit||new Response("",{status:504});}
    }));
    return;
  }
  // app shell: stale-while-revalidate — instant from cache, but always refetch to auto-update to the latest deploy
  if(url.origin===self.location.origin){
    e.respondWith((async()=>{
      const cache=await caches.open(SHELL);
      const cached=await cache.match(e.request,{ignoreSearch:true});
      const fresh=fetch(e.request).then(res=>{ if(res&&res.ok)cache.put(e.request,res.clone()); return res; }).catch(()=>null);
      return cached || (await fresh) || (await cache.match("index.html"));
    })());
  }
});
