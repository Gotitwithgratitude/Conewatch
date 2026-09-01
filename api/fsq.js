// ConeWatch — Foursquare Places proxy
// Second POI layer alongside Overture. Foursquare carries fresher small/new-business coverage
// that open datasets (OSM, Overture) often lack — the gap that made a 0.8mi dispensary invisible.
//
// Setup: add FSQ_KEY to Vercel env vars (Production + Preview + Development), then redeploy.
// Without the key this endpoint returns an empty result set, so the app degrades silently to
// its existing Overture + OSM behavior instead of breaking.

export default async function handler(req, res) {
  const key = process.env.FSQ_KEY;

  const q = (req.query.q || "").toString().trim();
  const lat = parseFloat(req.query.lat);
  const lon = parseFloat(req.query.lon);
  const limit = Math.min(parseInt(req.query.limit || "15", 10) || 15, 30);
  const radiusMi = parseFloat(req.query.radius_mi || "25");

  // edge-cache: same query near the same place is reused, keeps quota use low
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");

  if (!key || !q) {
    return res.status(200).json({ results: [], meta: { q, reason: key ? "no query" : "no key" } });
  }

  const radiusM = Math.round(Math.max(1, Math.min(radiusMi, 60)) * 1609.34);

  const params = new URLSearchParams({
    query: q,
    limit: String(limit),
    fields: "fsq_place_id,name,latitude,longitude,location,categories,tel,website,distance"
  });
  if (isFinite(lat) && isFinite(lon)) {
    params.set("ll", `${lat},${lon}`);
    params.set("radius", String(radiusM));
  }

  try {
    const r = await fetch(`https://places-api.foursquare.com/places/search?${params}`, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        "X-Places-Api-Version": "2025-06-17"
      }
    });

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return res.status(200).json({ results: [], meta: { q, upstream: r.status, body: body.slice(0, 180) } });
    }

    const d = await r.json();
    const raw = (d && d.results) || [];

    const results = raw.map((p) => {
      const loc = p.location || {};
      const lt = (p.latitude != null) ? p.latitude : (p.geocodes && p.geocodes.main && p.geocodes.main.latitude);
      const ln = (p.longitude != null) ? p.longitude : (p.geocodes && p.geocodes.main && p.geocodes.main.longitude);
      return {
        place_id: "fsq:" + (p.fsq_place_id || p.fsq_id || ""),
        name: p.name,
        lat: lt,
        lon: ln,
        distance_mi: (p.distance != null) ? +(p.distance / 1609.34).toFixed(2) : undefined,
        category: (p.categories && p.categories[0] && p.categories[0].name) || "poi",
        address: {
          formatted: loc.formatted_address || loc.address || "",
          street: loc.address || "",
          locality: loc.locality || loc.dma || "",
          region: loc.region || "",
          postal_code: loc.postcode || "",
          country_code: loc.country || ""
        },
        phone: p.tel || undefined,
        website: p.website || undefined
      };
    }).filter((x) => x.name && isFinite(x.lat) && isFinite(x.lon));

    return res.status(200).json({
      results,
      meta: { q, lat, lon, radius_mi: radiusMi, limit, count: results.length, data_source: "foursquare" }
    });
  } catch (e) {
    return res.status(200).json({ results: [], meta: { q, error: String(e && e.message || e).slice(0, 180) } });
  }
}
