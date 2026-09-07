/* ═══════════ ConeWatch service worker ═══════════
   Strategy:
   • HTML + JS (index.html, app.js, cw-patch.js) → NETWORK-FIRST.
     Always fetch the latest code when online; fall back to cache only when offline.
     → the version badge and new features show up immediately, no manual cache-clearing.
   • Images / manifest → cache-first (fast, rarely change).
   • MAP TILES (arcgis / maptiler / carto) → cache-first in a separate, size-capped cache, so a
     drive through a dead zone still renders. Tiles are immutable, so a cache hit is never stale.
   • Supabase / Overpass / Photon / Valhalla / OSRM → bypass, never cached (live data).
   • skipWaiting + clients.claim so a new version takes over promptly.
*/
const CACHE = "conewatch-cache-v2";
const TILES = "conewatch-tiles-v2";   // v1 purged: it held unverifiable opaque responses
const TILE_CAP = 1400;                 // ~50-90MB of 256px tiles; trimmed oldest-first
const PRECACHE = ["/","/index.html","/app.js","/cw-patch.js","/manifest.json","/apple-touch-icon.png","/icon-512.png"];

/* Only these hosts serve map tiles. Everything else cross-origin is live data and must not be
   served from cache — a cached hazard or a cached route would be worse than no answer at all. */
const TILE_HOSTS = ["server.arcgisonline.com","api.maptiler.com","basemaps.cartocdn.com"];
function isTile(url){ return TILE_HOSTS.indexOf(url.hostname) !== -1; }

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    // best-effort precache — don't fail install if one asset is missing
    await Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { cache: "reload" }))));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    // keep both of ours; drop anything older
    await Promise.all(keys.filter((k) => k !== CACHE && k !== TILES).map((k) => caches.delete(k)));
    await self.clients.claim();
    // tell any open pages a fresh worker is now in control
    const cs = await self.clients.matchAll({ type: "window" });
    cs.forEach((client) => client.postMessage({ type: "cw-updated" }));
  })());
});

/* Cache.keys() returns insertion order, so trimming from the front is a serviceable LRU without
   keeping a side index. Runs after a precache batch, not per request. */
async function trimTiles(){
  try{
    const c = await caches.open(TILES);
    const keys = await c.keys();
    const over = keys.length - TILE_CAP;
    if (over > 0) await Promise.all(keys.slice(0, over).map((k) => c.delete(k)));
  }catch(err){}
}

/* Warm the corridor the driver is about to cover. Concurrency is deliberately low — this runs
   while they are still looking at the route card and must not starve the live map's own tiles. */
async function precacheTiles(urls){
  if (!Array.isArray(urls) || !urls.length) return 0;
  const c = await caches.open(TILES);
  let i = 0, ok = 0;
  async function worker(){
    while (i < urls.length){
      const u = urls[i++];
      try{
        if (await c.match(u)) { ok++; continue; }          // already have it
        /* CORS, not no-cors. An opaque response hides its status code, so a 404 page, a
           rate-limit body and a real tile are indistinguishable — and caching one poisons that
           tile forever, which is what was painting garbled fragments over the map. */
        const res = await fetch(u, { mode: "cors", credentials: "omit" });
        if (res && res.ok && (res.headers.get("content-type") || "").indexOf("image") === 0) {
          await c.put(u, res.clone()); ok++;
        }
      }catch(err){}
    }
  }
  /* Two workers, not four. This runs while the driver is still using the app, and four parallel
     tile fetches on one cell connection starve the live map of the tiles it needs right now. */
  await Promise.all([worker(), worker()]);
  await trimTiles();
  return ok;
}

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") { self.skipWaiting(); return; }
  const d = e.data || {};
  if (d.type === "cw-precache-tiles") {
    e.waitUntil(precacheTiles(d.urls).then((n) => {
      try{ e.source && e.source.postMessage({ type: "cw-tiles-ready", count: n }); }catch(err){}
    }));
  }
  if (d.type === "cw-clear-tiles") { e.waitUntil(caches.delete(TILES)); }
});

function isCode(url) {
  return url.pathname.endsWith(".js") || url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname.endsWith(".json");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // map tiles → cache-first, fill on miss. This is what carries a drive through a dead zone.
  if (url.origin !== self.location.origin && isTile(url)) {
    e.respondWith((async () => {
      const c = await caches.open(TILES);
      const hit = await c.match(req);
      if (hit) return hit;
      try{
        const res = await fetch(req);
        // only ever store a response we could actually verify
        if (res && res.ok && res.type !== "opaque") c.put(req, res.clone());
        return res;
      }catch(err){
        return hit || Response.error();
      }
    })());
    return;
  }

  // all other cross-origin (routing, geocoding, Supabase, Overpass) → live network, never cached
  if (url.origin !== self.location.origin) return;

  // navigations + code + json → network-first (fresh code wins; cache is the offline safety net)
  if (req.mode === "navigate" || isCode(url)) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req, { cache: "no-store" });
        const c = await caches.open(CACHE);
        c.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cached = await caches.match(req);
        return cached || caches.match("/index.html");
      }
    })());
    return;
  }

  // everything else same-origin (images, css) → cache-first, refresh in background
  e.respondWith((async () => {
    const cached = await caches.match(req);
    const fetchP = fetch(req).then((res) => {
      caches.open(CACHE).then((c) => c.put(req, res.clone()));
      return res;
    }).catch(() => cached);
    return cached || fetchP;
  })());
});
