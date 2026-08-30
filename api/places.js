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
// APOSTROPHE RETRY: people type "Hamiltons", but Overture stores "Hamilton's".
// A strict name search misses it. So if the as-typed query returns nothing, we
// retry ONCE with an apostrophe auto-inserted (Hamiltons → Hamilton's,
// Joes Pizza → Joe's Pizza). Max 2 upstream calls, and only when the first is
// empty — quota-friendly.
//
// SAFETY: every failure path returns HTTP 200 with { results: [] }, so the
// client never throws and search always degrades gracefully to OSM.

// Build one apostrophe variant of the query, or null if none makes sense.
function apostropheVariant(q) {
  if (q.indexOf("'") > -1 || q.indexOf("\u2019") > -1) return null; // already has one
  const words = q.trim().split(/\s+/);
  if (!words.length) return null;
  const insert = (w) => w.replace(/s$/i, (m) => "'" + m); // Hamiltons → Hamilton's (keeps case)
  const last = words.length - 1;
  if (/s$/i.test(words[last])) { words[last] = insert(words[last]); return words.join(" "); }
  if (/s$/i.test(words[0]))    { words[0]    = insert(words[0]);    return words.join(" "); }
  return null;
}

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

  // One call to Overture for a given query string. Returns parsed body, or a safe empty on failure.
  async function callOPA(qValue) {
    try {
      const u = new URL("https://api.openplacesapi.com/v1/places");
      u.searchParams.set("q", String(qValue).slice(0, 128));
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

      if (!r.ok) return { results: [], meta: { warnings: ["upstream_" + r.status] } };
      return await r.json();
    } catch (e) {
      return { results: [], meta: { warnings: ["proxy_error"] } };
    }
  }

  try {
    // 1) As typed.
    let body = await callOPA(q);
    const hit = (b) => b && Array.isArray(b.results) && b.results.length > 0;

    // 2) Empty? Retry ONCE with an apostrophe variant (Hamiltons → Hamilton's).
    if (!hit(body)) {
      const variant = apostropheVariant(String(q));
      if (variant && variant.toLowerCase() !== String(q).trim().toLowerCase()) {
        const retry = await callOPA(variant);
        if (hit(retry)) body = retry;
      }
    }

    // Edge-cache identical searches for a day so repeats don't burn quota.
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json(body);
  } catch (e) {
    res.status(200).json({ results: [], meta: { warnings: ["proxy_error"] } });
  }
}
