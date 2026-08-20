/* ═══════════ ConeWatch service worker ═══════════
   Strategy:
   • HTML + JS (index.html, app.js, cw-patch.js) → NETWORK-FIRST.
     Always fetch the latest code when online; fall back to cache only when offline.
     → the version badge and new features show up immediately, no manual cache-clearing.
   • Images / manifest → cache-first (fast, rarely change).
   • Map tiles / Supabase / Overpass / Photon / Valhalla / OSRM (cross-origin) → bypass, never cached here.
   • skipWaiting + clients.claim so a new version takes over promptly.
*/
const CACHE = "conewatch-cache-v2";
const PRECACHE = ["/","/index.html","/app.js","/cw-patch.js","/manifest.json","/apple-touch-icon.png","/icon-512.png"];

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
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
    // tell any open pages a fresh worker is now in control
    const cs = await self.clients.matchAll({ type: "window" });
    cs.forEach((client) => client.postMessage({ type: "cw-updated" }));
  })());
});

self.addEventListener("message", (e) => { if (e.data === "skipWaiting") self.skipWaiting(); });

function isCode(url) {
  return url.pathname.endsWith(".js") || url.pathname.endsWith(".html") || url.pathname === "/" || url.pathname.endsWith(".json");
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // only manage our own origin; let tiles/APIs go straight to network
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
