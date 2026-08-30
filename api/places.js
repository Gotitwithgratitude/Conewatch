// api/places.js — ConeWatch → Open Places API (Overture) proxy
// ─────────────────────────────────────────────────────────────
// WHY THIS EXISTS: Open Places API uses a SECRET bearer key that must stay
// server-side. ConeWatch is a browser PWA, so the app calls THIS endpoint
// (same origin, no key) and this function adds the secret and forwards to OPA.
// The key never ships to any driver's device.
//
// SETUP (one time):
//   1. Sign up free at https://app.openplacesapi.com/signup  (no card, 10k/mo, hard cap)
//   2. In Vercel → your ConeWatch project → Settings → Environment Variables,
//      add:  OPA_KEY = <your Open Places API key>
//   3. Redeploy. Done. (Before this is set, the function returns empty and the
//      app quietly falls back to OSM-only search — nothing breaks.)
//
// SAFETY: every failure path returns HTTP 200 with { results: [] }, so the
// client never throws and search always degrades gracefully to OSM.

export default async function handler(req, res) {
  const key = process.env.OPA_KEY;

  // Not configured yet → no-op (app falls back to OSM).
  if (!key) {
    res.status(200).json({ results: [], meta: { warnings: ["no_key"] } });
    return;
  }

  const { q, lat, lon, radius_mi, mode, limit, min_confidence } = req.query;

  // Need a query + a coordinate; OPA is proximity-only.
  if (!q || !lat || !lon) {
    res.status(200).json({ results: [], meta: { warnings: ["bad_params"] } });
    return;
  }

  try {
    const u = new URL("https://api.openplacesapi.com/v1/places");
    u.searchParams.set("q", String(q).slice(0, 128));
    u.searchParams.set("lat", lat);
    u.searchParams.set("lon", lon);
    u.searchParams.set("radius_mi", radius_mi || "45");   // max is 50
    u.searchParams.set("mode", mode || "name");           // name-first for business search
    u.searchParams.set("limit", limit || "15");           // text-search max is 20
    if (min_confidence) u.searchParams.set("min_confidence", min_confidence);

    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 8000);
    const r = await fetch(u, {
      headers: { Authorization: `Bearer ${key}` },
      signal: controller.signal,
    }).finally(() => clearTimeout(t));

    // Quota (402), rate limit (429), auth (401/403), upstream (5xx) → degrade, don't error.
    if (!r.ok) {
      res.status(200).json({ results: [], meta: { warnings: ["upstream_" + r.status] } });
      return;
    }

    const body = await r.json();

    // Edge-cache identical searches for a day so repeats don't burn quota.
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(body);
  } catch (e) {
    res.status(200).json({ results: [], meta: { warnings: ["proxy_error"] } });
  }
}
