"use strict";
/* ═══════════ ConeWatch Pro Max — app.js ═══════════ */

const HZ_META = {
  construction_cones:{emoji:"🚧",color:"#FF6B1A",label:"Construction"},
  pothole:{emoji:"🕳",color:"#E5484D",label:"Pothole"},
  power_lines:{emoji:"\u26A1",color:"#FFD24A",label:"Power lines down"},
  accident:{emoji:"🚨",color:"#FF4D6D",label:"Accident"},
  police:{emoji:"👮",color:"#5B9CF6",label:"Police"},
  camera:{emoji:"📸",color:"#A78BFA",label:"Speed camera"},
  camera_flock:{emoji:"🦅",color:"#7C6BF5",label:"Flock camera"},
  speed_bump:{emoji:"🛑",color:"#F5A623",label:"Speed bump"},
  debris:{emoji:"🪵",color:"#FFC72C",label:"Debris"},
  road_closure:{emoji:"⛔",color:"#FF3B30",label:"Road closed"},
  emergency:{emoji:"🚑",color:"#FF4D6D",label:"Emergency vehicle"},
  stalled:{emoji:"🚗",color:"#F5A623",label:"Stalled vehicle"},
  flooding:{emoji:"🌊",color:"#0A84FF",label:"Flooding"},
  ice:{emoji:"❄️",color:"#5AC8FA",label:"Ice / slippery road"},
  animal:{emoji:"🦌",color:"#8B5E3C",label:"Animal on road"},
  traffic:{emoji:"🚦",color:"#FF9F0A",label:"Heavy traffic"},
  alert:{emoji:"📢",color:"#FFD60A",label:"Emergency alert"},
};
const APP_VERSION="v271";

/* ═══════════ seasonal theme (Halloween) ═══════════
   Deliberately narrow. The palette shifts and a few NON-hazard glyphs change, but every
   hazard marker keeps its year-round emoji and color: a driver at speed recognizes 🚨 and
   🕳 by shape and color before reading anything, and a seasonal skin is not worth costing
   recognition time on the alerts that matter. Only 'animal' changes (🦌→🦇 still reads
   "creature in the road") plus the destination flag and the map's own chrome.
   Mode: "auto" (Oct 1–Nov 1), "on", or "off" — stored in localStorage. */
const SEASON_SWAP = {
  animal:"🦇",           // creature in the road — still reads correctly
  debris:"🕸",           // something in your lane
  speed_bump:"⚰️",       // a bump you feel
  camera:"👁",           // being watched
  camera_flock:"🦇",
  traffic:"🧟",          // a crawl
  construction_cones:"🎃" // the cone IS the brand — pumpkin is the one wink we get
};
/* Untouched year-round, deliberately: pothole 🕳, accident 🚨, police 👮, road_closure ⛔,
   emergency 🚑, flooding 🌊, ice ❄️, stalled 🚗, alert 📢. A driver reads these by shape
   and color before they read anything else — a seasonal skin isn't worth that half-second. */
const _hzEmojiBase = {};
Object.keys(HZ_META).forEach(function(k){ _hzEmojiBase[k]=HZ_META[k].emoji; });

function seasonMode(){ try{ return localStorage.getItem("cw_season")||"auto"; }catch(e){ return "auto"; } }
function _inSeasonWindow(){
  var d=new Date(), m=d.getMonth(), day=d.getDate();
  return (m===9) || (m===10 && day===1);          // Oct 1 – Nov 1 inclusive
}
function seasonActive(){
  var mode=seasonMode();
  return mode==="on" || (mode==="auto" && _inSeasonWindow());
}
/* The season window was only ever read at boot and on a manual toggle, so an app left open
   across midnight Sep 30 -> Oct 1 stayed un-themed until the next reload. Re-check hourly and
   only act when the answer actually changed, so this costs nothing the other 364 days. */
var _seasonWatchLast=null;
function _seasonWatchTick(){
  try{
    var now=seasonActive();
    if(_seasonWatchLast===null){ _seasonWatchLast=now; return; }
    if(now!==_seasonWatchLast){ _seasonWatchLast=now; applySeason(); }
  }catch(e){}
}
try{ setInterval(_seasonWatchTick, 3600000); document.addEventListener("visibilitychange",function(){ if(!document.hidden) _seasonWatchTick(); }); }catch(e){}
function applySeason(){
  var on=seasonActive();
  try{
    if(on) document.documentElement.setAttribute("data-season","halloween");
    else document.documentElement.removeAttribute("data-season");
  }catch(e){}
  // swap the safe glyphs in place so every consumer (markers, popups, report grid, toasts) follows
  Object.keys(_hzEmojiBase).forEach(function(k){
    HZ_META[k].emoji = (on && SEASON_SWAP[k]) ? SEASON_SWAP[k] : _hzEmojiBase[k];
  });
  try{ if(destMarker){ var de=destMarker.getElement(); if(de) de.textContent = on?"🎃":"🏁"; } }catch(e){}
  // repaint any live hazard markers + the report-sheet tile so the swap shows without a reload
  try{ (S.hazards||[]).forEach(function(h){
    if(h._marker && SEASON_SWAP[h.type]){ var e2=h._marker.getElement(); if(e2) e2.textContent=HZ_META[h.type].emoji; }
  }); }catch(e){}
  try{ Object.keys(SEASON_SWAP).forEach(function(k){
    var tile=document.querySelector('#reportSheet [data-type="'+k+'"] .ic');
    if(tile) tile.textContent=HZ_META[k].emoji;
  }); }catch(e){}
  // the pumpkin badge is the interactive bit: tap it to cycle the theme
  try{ var vb=$("verBadge"); if(vb){ vb.style.cursor="pointer"; vb.onclick=function(ev){ ev.stopPropagation(); cycleSeason(); }; } }catch(e){}
  // the basemap tint lives in the style object, so the style has to be rebuilt to show it
  try{ applySeasonSky(); }catch(e){}
  /* This ran at boot BEFORE map.on("load") sets S.mapReady, so the swap was skipped and never
     retried — which is why the seasonal basemap never actually appeared. Retry once the map
     is genuinely ready, and only record _seasonPainted when a swap really happened. */
  /* Turning the season OFF has to actively restore the map, not merely stop applying the
     season — the tint lives in the style object, so the style must be rebuilt either way. */
  try{
    if(_seasonPainted!==on && typeof swapMapStyle==="function" && map){
      var _go=function(){ try{ _seasonPainted=on; swapMapStyle(S.themeMode==="light"?"light":"dark",true); }catch(e){} };
      if(S.mapReady) _go(); else map.once("load",_go);
    }
    if(!on){
      // tear down every seasonal map layer explicitly
      try{ stopRouteFlow(); if(map&&map.getLayer&&map.getLayer("route-flow")) map.removeLayer("route-flow"); }catch(e){}
      try{ applySeasonSky(); }catch(e){}
    }
  }catch(e){}
  // state pill so it's never a guess whether the season is live
  try{
    var sp=$("seasonPill");
    if(sp){
      sp.classList.toggle("on", !!on);        // .on carries the centred inline-flex geometry
      sp.style.display = "";                   // let the class own visibility
      sp.textContent = "\uD83C\uDF83";   // pumpkin alone — the pill was crowding the search field
    }
  }catch(e){}
  // one-time announcement so the update is obvious rather than something you might miss
  if(on){ try{
    if(localStorage.getItem("cw_season_seen")!==String(new Date().getFullYear())){
      localStorage.setItem("cw_season_seen",String(new Date().getFullYear()));
      setTimeout(function(){ toast("🎃 ConeWatch is haunted for Halloween — tap the version badge to switch it off",4600); },1800);
    }
  }catch(e){} }
  var st=$("seasonState");
  if(st) st.textContent = seasonMode()==="auto" ? (on?"Auto — on now (Oct 1–Nov 1)":"Auto — on Oct 1–Nov 1")
        : (seasonMode()==="on" ? "On — forced" : "Off");
}
function cycleSeason(){
  var next={auto:"on",on:"off",off:"auto"}[seasonMode()]||"auto";
  try{ localStorage.setItem("cw_season",next); }catch(e){}
  applySeason();
  /* applySeason gates its restyle on _seasonPainted, and that flag can desync from what the
     map is actually showing — which left the map stuck amber after switching the season off
     even though every other part of the UI reverted. An explicit toggle has no reason to be
     gated: rebuild the style unconditionally so the map always matches the setting. */
  try{
    _seasonPainted = (typeof seasonActive==="function") ? seasonActive() : null;
    paintSeasonTint();          // direct paint — no style rebuild, so nothing to race
  }catch(e){}
  toast(next==="auto"?"Halloween theme: Auto":next==="on"?"Halloween theme: On":"Halloween theme: Off",1400);
  /* The diagnostic proved paintSeasonTint works — it applied all six properties — but a later
     async caller (a style-swap callback firing after the toggle) re-ran it with stale state and
     overwrote the correct paint. Last writer wins, so make sure the last writer is a fresh read.
     The function is idempotent and reads live state, so re-asserting after everything settles
     always lands on the truth, whatever ran in between. */
  [60,300,900].forEach(function(ms){ setTimeout(function(){ try{ paintSeasonTint(); }catch(e){} },ms); });
}
const GENERIC_WORDS=/^(the|a|an|rooftop|lounge|bar|grill|cafe|coffee|restaurant|kitchen|pub|tavern|club|shop|store|center|centre|co|inc|llc|and)$/i;

/* ══════════════════════════════════════════════════════════════════
   ONE-TIME OWNER SETUP — paste your codes here once, they apply to
   EVERY user automatically. Drivers never see or touch any of this.
   Leave blank = app still works (keyless Esri map, reports stay local).
   ══════════════════════════════════════════════════════════════════ */
const CW_CONFIG = {
  maptilerKey: "",
  cartoKey: "",   // optional free key from carto.com/basemaps/apikey (else keyless Esri tiles are used)   // ← (optional) free MapTiler key → sharp HD satellite for ALL users
  supabaseUrl: "https://fcywpeulilndeinzckdl.supabase.co",   // shared network — LIVE
  supabaseKey: "sb_publishable_ToEAvzA2sQN269M3Lv8LOg_2wK55NWC",
  // Overture-backed POI coverage (finds local businesses OSM doesn't have). Same-origin
  // serverless proxy holds the secret key server-side — the browser never sees it.
  // Setup: (1) deploy /api/places.js with the repo, (2) set OPA_KEY env var in Vercel.
  // Until then this silently 404s → no-op, search falls back to OSM exactly as before.
  placesProxy: "/api/places",
  fsqProxy: "/api/fsq"
};
const PROFILES = { car:"routed-car/route/v1/driving", bike:"routed-bike/route/v1/driving", foot:"routed-foot/route/v1/driving", hike:"routed-foot/route/v1/driving" };
const ACCENT_BASE = { dark:{route:"#35E0C8",casing:"#0A3B33",core:"rgba(255,255,255,.82)"}, light:{route:"#1D6EF2",casing:"#0A2E66",core:"rgba(255,255,255,.82)"} };
/* The route line is the single most-looked-at element on the screen while driving, so leaving
   it teal/blue kept the whole thing feeling ordinary no matter what the chrome did. */
const ACCENT_HW   = { dark:{route:"#FF7A12",casing:"#3B0A5C",core:"rgba(255,241,219,.82)"}, light:{route:"#E2620A",casing:"#2E0847",core:"rgba(255,246,232,.82)"} };
const ACCENT = new Proxy({},{ get:function(_,k){
  var on=false; try{ on=(typeof seasonActive==="function")&&seasonActive(); }catch(e){}
  return (on?ACCENT_HW:ACCENT_BASE)[k];
}});

const S = {
  pos:null, lastPos:null, accuracy:null, course:null, compass:null,
  follow:true, headingUp:false, watchId:null, saver:false, audioAlerts:true, bumpOn:true, heatOn:true,
  mode:"car", dest:null, destName:"", stops:[],
  route:null, steps:[], stepIdx:0, navigating:false, offRouteCount:0, rerouting:false, avoidHandled:new Set(),
  hazards:[], alerted:new Set(), sb:{url:"",key:""},
  speedMph:0, tripM:0, is3d:false, mapReady:false,
  themeMode:"dark", themeNow:"dark", sun:{rise:7.0, set:19.2}, lux:null,
  torchMode:0, torchTrack:null, sosTimer:null, wakeLock:null, fbCat:"Bug",
  avoidTolls:false, avoidHwy:false, avoidApplied:false, avoidMode:"", avoidRatio:0, dispPos:null, goodFixes:0, origin:null, originName:"", originAddr:"", destLabel:"", remoteStart:false,
};
try{ S.avoidTolls=localStorage.getItem("cw_avoidTolls")==="1"; S.avoidHwy=localStorage.getItem("cw_avoidHwy")==="1"; }catch(e){}
const $ = (id)=>document.getElementById(id);
let toastTimer;
function toast(msg,ms=2800){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),ms);}

/* ═══════════ adaptive theme engine ═══════════ */
function isDayNow(){
  if(S.themeMode==="light") return true;
  if(S.themeMode==="dark") return false;
  const h=new Date().getHours()+new Date().getMinutes()/60;
  const rise=(S.sun&&isFinite(S.sun.rise))?S.sun.rise:7.0;
  const set =(S.sun&&isFinite(S.sun.set)) ?S.sun.set :19.5;
  const daylight = h>=rise && h<set;
  // ambient light can only DARKEN during a genuine tunnel/garage, never override real daylight hours
  if(daylight && S.lux!==null && S.lux<3 && h>rise+1 && h<set-1) return false;
  return daylight;
}
function applyTheme(force){
  const next=isDayNow()?"light":"dark";
  paintClock();
  var _tt=$("clockTheme");
  if(_tt){
    /* The glyph was appended as raw text, so the pill wrapped and the moon dropped onto a second
       line under the word. Own span, nowrap on the pill, and a hair of optical lift. */
    var _gl=(S.themeMode==="auto")?(next==="light"?"\u2600":"\u263e"):"";
    _tt.innerHTML=S.themeMode+(_gl?'<span style="font-size:10px;position:relative;top:-.5px">'+_gl+'</span>':"");
    _tt.className="cw-pill"+(S.themeMode==="auto"?"":" on");
  }

  if(S.mapReady && mapStyleTheme!==next) swapMapStyle(next); // heal UI/map mismatch anytime
  if(next===S.themeNow && !force) return;
  S.themeNow=next;
  document.documentElement.dataset.theme=next;
  if(!S.mapReady) S.queuedTheme=next;
  toast(next==="light"?"☀ Daylight mode — blue guidance arrows":"☾ Night mode — teal guidance arrows",2200);
}
setInterval(applyTheme,60000);
async function loadSunTimes(){
  if(!S.pos) return;
  try{
    const d=await (await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${S.pos.lat}&longitude=${S.pos.lng}&daily=sunrise,sunset&timezone=auto&forecast_days=1`)).json();
    const hr=(iso)=>{const t=new Date(iso);return t.getHours()+t.getMinutes()/60;};
    S.sun={rise:hr(d.daily.sunrise[0]), set:hr(d.daily.sunset[0])};
    applyTheme();
  }catch{}
}
// ambient light sensor (where supported), fully guarded
try{
  if("AmbientLightSensor" in window){
    const als=new AmbientLightSensor({frequency:0.5});
    als.addEventListener("reading",()=>{S.lux=als.illuminance; if(S.themeMode==="auto") applyTheme();});
    als.start();
  }
}catch{}

/* ═══════════ map boot (MapLibre v5) with per-theme styles ═══════════ */
function rasterStyle(dark){
  /* Everything seasonal until now recoloured the SAME street map, which is why it kept reading
     as a filter rather than a world. This swaps the basemap outright: Esri's dark canvas draws
     roads as thin pale lines on near-black with no landuse colour at all, so the city becomes a
     lit road network in the dark instead of a daylight map wearing orange. Same keyless Esri
     source family — no new provider, no key, and it reverts the instant the season ends. */
  var _hw=false; try{ _hw=(typeof seasonActive==="function")&&seasonActive(); }catch(e){}
  /* The seasonal dark-gray canvas is Esri-only by design; everything else follows whichever
     provider the probe has settled on. */
  const url = _hw
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"+TILE_CB
    : baseTileURL(dark);
  /* CARTO ships proper dark and light styles, so the filter that was compensating for Esri's
     daylight cartography would now crush an already-dark basemap. Leave CARTO nearly alone. */
  if(BASE_PROVIDER==="osm" && !_hw){
    /* Same filtered treatment the Esri basemap had — dark mode darkens luminance rather than
       killing saturation, which is what keeps road colours readable at night. */
    return {version:8,
      sources:{basemap:{type:"raster",tiles:[url],tileSize:256,minzoom:0,maxzoom:19,
        attribution:"© OpenStreetMap contributors"}},
      layers:[{id:"bg",type:"background",paint:{"background-color":dark?"#0d1013":"#eae7e0"}},
              {id:"basemap",type:"raster",source:"basemap",paint:dark
                ? {"raster-brightness-max":0.55,"raster-saturation":-0.15,"raster-contrast":0.12}
                : {"raster-brightness-max":1,"raster-saturation":0,"raster-contrast":0}}]};
  }
  if(BASE_PROVIDER==="carto" && !_hw){
    return {version:8,sources:{basemap:{type:"raster",tiles:[url],tileSize:256,minzoom:0,maxzoom:20,
      attribution:"© OpenStreetMap © CARTO"}},
      layers:[{id:"bg",type:"background",paint:{"background-color":dark?"#0d1013":"#eae7e0"}},
              {id:"basemap",type:"raster",source:"basemap",
               paint:{"raster-brightness-min":0,"raster-brightness-max":1,
                      "raster-saturation":dark?-0.06:0,"raster-contrast":dark?0.04:0}}]};
  }
  let paint = dark
    ? {"raster-brightness-max":0.42,"raster-brightness-min":0.02,"raster-saturation":-0.35,"raster-contrast":0.12}
    : {};
  let bg = dark?"#101215":"#E9ECEF";
  /* The theme only ever touched the chrome, leaving the map — most of the screen — untouched,
     which is why it read as a skin rather than a season. Shifting the raster hue toward amber
     and dropping the brightness turns the whole world dusk-lit. Road geometry, labels and
     hazard markers are unaffected: this only recolours the basemap tiles underneath them. */
  try{
    if(typeof seasonActive==="function" && seasonActive()){
      // Dusk in both themes: a Halloween map that stays daylight-bright will always read as a
      // sticker on top of a normal map rather than a season. Light mode gets a warm amber
      // twilight rather than full night, so the app is still legible in daylight.
      paint = {"raster-brightness-max":0.86,"raster-brightness-min":0.02,
               "raster-saturation":0.55,"raster-contrast":0.30,"raster-hue-rotate":-32,
               "raster-opacity":0.95};
      bg = "#0A0503";
    }
  }catch(e){}
  return { version:8,
    sources:{ basemap:{ type:"raster", tiles:[url], tileSize:256, maxzoom:19, attribution:"© Esri, © OpenStreetMap contributors" }},
    layers:[{id:"bg",type:"background",paint:{"background-color":bg}},{id:"basemap",type:"raster",source:"basemap",paint:paint}] };
}
function _offNow(){ try{ return navigator.onLine===false; }catch(e){ return false; } }
/* Even online a lookup can hang or fail. A placeholder that never resolves reads as a frozen
   app, so give both rows a deadline and let them say what actually happened. */
function _settleStat(id, ms){
  setTimeout(function(){
    try{
      var el=document.getElementById(id);
      if(el && /^(loading…)$/.test(el.textContent.trim())) el.textContent = _offNow()? "unavailable offline" : "unavailable";
    }catch(e){}
  }, ms||9000);
}

/* ═══════════ basemap LOD probe ═══════════
   "Zoom Level Not Supported" is an ERROR IMAGE that ArcGIS returns with HTTP 200. MapLibre
   cannot tell it from a real tile, so it paints the words across the map — and nothing
   downstream can filter it. I have now guessed twice at which zoom levels are affected and
   been wrong twice, so this stops guessing: ask the service directly, once, and set the
   source's minzoom to whatever it turns out to support.

   Detection: the error tile is the SAME image at every zoom, so its byte length repeats
   exactly across unrelated tiles. A real street tile at a different z/x/y essentially never
   matches another's length to the byte. Any length seen at two or more different zooms is
   therefore the error image, and the floor is the lowest zoom that does not return it. Below
   that floor MapLibre stretches the lowest good tile, which looks coarse but is correct. */
/* TILE_CB — cache buster, and the fix for "Zoom Level Not Supported".
   The probe settled this. Fetched fresh with cache:"no-store", Esri returns a real tile at
   every zoom 0-10, for BOTH services. So the map was never getting those bytes: it reads
   through the normal HTTP cache, which is still holding error PNGs from an earlier episode —
   almost certainly the v240-v254 window when 128px tiles quadrupled the request rate and Esri
   started refusing. Those refusals came back 200 OK and fully cacheable, so the phone stored
   them and has re-served them ever since, at exactly the zooms that were being hammered.
   That is why this survived every zoom-range change, every revert, and a fresh version each
   time: nothing I changed ever made the browser ASK again.
   Bumping this string changes the URL, which the cache has no entry for. Bump it again if
   poisoned tiles ever reappear. */
var TILE_CB = "?cw=3";
/* Which basemap provider to draw. Esri is the default for its look; CARTO is the fallback when
   the probe finds Esri refusing tiles in this area. Persisted, because a driver who has hit the
   gap once will hit it again tomorrow in the same place. */
/* v268 — the decision I should have made three versions ago.
   Facts we now have, all from the device rather than from my guessing: the tile cache is empty,
   the service worker is current, and live fetches of the tiles the probe samples come back as
   real images — yet the wallpaper is still on screen. Esri is serving "Zoom Level Not Supported"
   for SOME tiles, live, and I have failed three times to build a sampler that reliably catches
   which ones. World_Street_Map is a legacy ArcGIS service with genuine gaps in its cache, and
   every hour spent detecting those gaps is an hour not spent on the product.
   So stop detecting and stop using it. CARTO's raster basemap is complete, keyless, free, and
   the app already knew how to draw it. This removes the entire class of problem rather than
   one more instance of it. Esri remains available for anyone who prefers the look — the probe
   still runs and will flip them back to CARTO if it sees refusals — but it is no longer what a
   driver gets by default. A basemap with holes in it is not a basemap. */
var BASE_PROVIDER = (function(){
  try{
    /* One-time migration off Esri, including for anyone whose stored preference is the old
       default. Someone who deliberately picks Esri later keeps it. */
    /* v269 — reverted. CARTO's raster basemaps are no longer keyless: the tiles come back
       stamped "API KEY REQUIRED", which is worse than Esri's patchy coverage because it fails
       everywhere instead of somewhere. Esri is the default again. Anyone who supplies a CARTO
       key in Settings still gets CARTO through the existing keyed path. */
    if(localStorage.getItem("cw_baseMigrated")!=="271"){
      localStorage.setItem("cw_baseProvider","osm");
      localStorage.setItem("cw_baseMigrated","271");
      return "osm";
    }
    return localStorage.getItem("cw_baseProvider")||"osm";
  }catch(e){ return "osm"; }
})();
function baseTileURL(dark){
  if(BASE_PROVIDER==="osm"){
    /* v271 — the diagnosis, settled.
       The v268 build swapped the basemap to CARTO and the wallpaper vanished completely; only
       CARTO's own "API KEY REQUIRED" watermark appeared. That rules out every overlay theory I
       had — the refusals come from the BASEMAP source. What made them look like an overlay is
       MapLibre stretching a good parent tile underneath a refused child, so you see streets
       through the grey box.
       Esri's World_Street_Map is a legacy ArcGIS service that genuinely lacks tiles at some
       z/x/y, answers with a 200 OK error image, and cannot be detected client-side. CARTO now
       needs a key. So use OpenStreetMap's standard raster tiles: keyless, complete worldwide
       coverage, and no error-image behaviour. Light-only, which is fine — the dark theme has
       always been a filter over a light basemap anyway. */
    return "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  }
  if(BASE_PROVIDER==="osm")
    return {u:"https://tile.openstreetmap.org/{z}/{x}/{y}.png", yx:false};
  if(BASE_PROVIDER==="carto"){
    /* Keyless CARTO raster. Complete global coverage, and it already matches the app's dark
       and light themes without the luminance filter doing all the work. */
    /* Retina tiles and all four subdomains: CARTO serves @2x, which fixes the sharpness the
       v240 experiment was chasing — without quadrupling the request count, because the tile
       still covers 256 CSS pixels. */
    var ck=""; try{ ck=(CW_CONFIG&&CW_CONFIG.cartoKey||"").trim(); }catch(e){}
    return "https://a.basemaps.cartocdn.com/rastertiles/"+(dark?"dark_all":"voyager")+
           "/{z}/{x}/{y}@2x.png"+(ck?("?key="+ck):"");
  }
  return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"+TILE_CB;
}

/* v263 — why the v262 cache-buster did not work.
   There is a SERVICE WORKER with its own tile cache ("cw-tiles-v2"), and the app precaches
   tiles into it. A service worker sits IN FRONT of the HTTP cache, so changing the query string
   only helps if its fetch handler keys on the full URL; if it matches with ignoreSearch — or
   simply already holds an entry it considers good — the poisoned "Zoom Level Not Supported"
   PNGs keep being served no matter what URL we ask for.
   Routing around it clearly did not work, so delete the bytes instead. This runs once per
   purge version and drops every ConeWatch tile cache outright. The cost is re-downloading
   tiles the driver has already seen; the benefit is that a corrupted cache can no longer
   outlive any number of releases. */
/* What the app can see about the layer that is actually serving tiles. After several rounds of
   "the network says fine but the screen says otherwise", this reports which caches exist, how
   many entries each holds, and whether a service worker controls the page — so a stale worker,
   a stale cache and a live failure stop looking identical from a screenshot. */
var _swTxt="sw       checking…";
(async function reportSW(){
  try{
    var parts=[];
    if("caches" in window){
      var names=await caches.keys();
      for(var i=0;i<names.length;i++){
        try{ var c=await caches.open(names[i]); var k=await c.keys(); parts.push(names[i]+":"+k.length); }
        catch(e){ parts.push(names[i]+":?"); }
      }
    }
    var ctl=(navigator.serviceWorker && navigator.serviceWorker.controller)?"controlled":"none";
    _swTxt="sw       "+ctl+(parts.length?("\n         "+parts.join("  ")):"  (no caches)");
    /* Re-check sw.js and promote a waiting worker immediately. Without this a fixed worker can
       sit idle for days, because the default is to wait until every tab is closed. */
    if(navigator.serviceWorker){
      var reg=await navigator.serviceWorker.getRegistration();
      if(reg){
        try{ await reg.update(); }catch(e){}
        if(reg.waiting) reg.waiting.postMessage("skipWaiting");
      }
    }
  }catch(e){ _swTxt="sw       error: "+((e&&e.message)||"?"); }
})();

(async function purgePoisonedTiles(){
  try{
    if(!("caches" in window)) return;
    if(localStorage.getItem("cw_tilePurge")==="5") return;
    var names=await caches.keys();
    for(var i=0;i<names.length;i++){
      /* v264: this matched /^cw-tiles/ and the real cache is called "conewatch-tiles-v2", so it
         never matched anything and the purge did nothing at all. Match on the word instead of a
         guessed prefix — a rename on either side can no longer orphan a poisoned cache. */
      if(/tiles/i.test(names[i])) await caches.delete(names[i]);
    }
    /* And tell the service worker to forget them too, in case it holds its own handle. */
    try{
      if(navigator.serviceWorker && navigator.serviceWorker.controller)
        /* And the worker listens for "cw-clear-tiles" — the name I sent did not exist, so the
           message was silently dropped. Send both; sw.js now accepts either. */
        navigator.serviceWorker.controller.postMessage({type:"cw-clear-tiles"});
    }catch(e){}
    localStorage.setItem("cw_tilePurge","5");
    try{ console.log("ConeWatch: purged",names.filter(function(n){return /tiles/i.test(n);}).length,"tile cache(s)"); }catch(e){}
  }catch(e){}
})();
var BASE_MINZ = (function(){
  /* v260/v261 could persist a floor derived from a rate-limited survey. Discard anything stored
     by those builds; a wrong floor blanks the map at zooms that were always fine. */
  try{
    if(localStorage.getItem("cw_minzVer")!=="262"){
      localStorage.removeItem("cw_baseMinz"); localStorage.removeItem("cw_baseMinzAt");
      localStorage.setItem("cw_minzVer","262");
      return 0;
    }
    var v=parseInt(localStorage.getItem("cw_baseMinz"),10); return isFinite(v)?v:0;
  }catch(e){ return 0; }
})();
var _probeTxt = "basemap  not probed yet";
var _probeRan = false;
var _searchTxt = "";
/* Which raster layers are ACTUALLY in the style right now, with their visibility and zoom
   range. Every theory about the wallpaper has assumed which layer is drawing it; this stops the
   assuming. If a layer is listed as visible at a zoom where the words appear, that is the one. */
function _rasterTxt(){
  try{
    if(!map||!map.getStyle) return "";
    var ls=(map.getStyle().layers||[]).filter(function(l){ return l.type==="raster"; });
    if(!ls.length) return "raster   none";
    return "raster   "+ls.map(function(l){
      var vis="?"; try{ vis=map.getLayoutProperty(l.id,"visibility")||"visible"; }catch(e){}
      var z=(l.minzoom!==undefined?l.minzoom:0)+"-"+(l.maxzoom!==undefined?l.maxzoom:24);
      return l.id+"["+vis.charAt(0)+" z"+z+"]";
    }).join(" ");
  }catch(e){ return "raster   err"; }
}
function _tileXY(lat,lng,z){
  var n=Math.pow(2,z);
  var x=Math.floor((lng+180)/360*n);
  var r=lat*Math.PI/180;
  var y=Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*n);
  return [Math.max(0,Math.min(n-1,x)), Math.max(0,Math.min(n-1,y))];
}
async function probeBasemapFloor(force){
  /* v265 — the probe was asking the wrong question, and that is why it kept saying everything
     was fine while the map was covered in error tiles.
     It tested ONE tile per zoom: the one containing the driver. But the failures are not spread
     evenly across a zoom level — they are specific x/y tiles, in specific places, at otherwise
     working zooms. Downtown Detroit returns a real tile at z8 while a tile two columns north
     returns "Zoom Level Not Supported" at the same z8. Testing the centre could therefore never
     see the problem, no matter how carefully it measured.
     So: sample a GRID across the viewport at the zoom the driver is actually looking at, and
     judge coverage rather than a floor. If any meaningful share of the visible tiles come back
     as refusals, this provider does not cover this area properly and we switch to one that
     does. Esri World_Street_Map is a legacy service with genuine gaps in its cache; CARTO's
     raster basemap is complete, and the app already knows how to draw it. */
  try{
    _probeTxt="basemap  probing…";
    if(!navigator.onLine){ _probeTxt="basemap  offline — not probed"; return; }
    var done=0; try{ done=parseInt(localStorage.getItem("cw_baseMinzAt"),10)||0; }catch(e){}
    if(!force && Date.now()-done < 3*864e5){ _probeTxt="basemap  "+BASE_PROVIDER+" (cached)"; return; }

    /* v267 — third time I have sampled the wrong tiles, and the reason is the same each time:
       I kept probing around the DRIVER. The map is very often somewhere else entirely. In free
       roam you can be parked downtown while looking at Eight Mile, and that is exactly the case
       where the wallpaper shows up. Probing your position while the wallpaper sits on the other
       side of the county could only ever come back clean.
       Sample the tiles the MAP is showing: derive the range from the viewport bounds and take a
       spread across it, so what we measure is what you can see. */
    var z = Math.max(3, Math.min(16, Math.round((map&&map.getZoom&&map.getZoom())||9)));
    var n=Math.pow(2,z), cells=[];
    try{
      var b=map.getBounds();
      var nw=_tileXY(b.getNorth(), b.getWest(), z);
      var se=_tileXY(b.getSouth(), b.getEast(), z);
      var x0=Math.min(nw[0],se[0]), x1=Math.max(nw[0],se[0]);
      var y0=Math.min(nw[1],se[1]), y1=Math.max(nw[1],se[1]);
      /* Up to a 4x4 spread across whatever is on screen — enough to catch a patchy provider
         without hammering it, which is how the probe poisoned itself back in v260. */
      var sx=Math.max(1,Math.ceil((x1-x0+1)/4)), sy=Math.max(1,Math.ceil((y1-y0+1)/4));
      for(var x=x0; x<=x1; x+=sx) for(var y=y0; y<=y1; y+=sy){
        if(x<0||y<0||x>=n||y>=n) continue;
        cells.push([x,y]);
        if(cells.length>=16) break;
      }
    }catch(e){}
    if(!cells.length){
      var lat=(S.pos&&S.pos.lat)||42.331, lng=(S.pos&&S.pos.lng)||-83.045;
      var c=_tileXY(lat,lng,z);
      for(var dx=-1; dx<=1; dx++) for(var dy=-1; dy<=1; dy++){
        var xx=c[0]+dx, yy=c[1]+dy;
        if(xx<0||yy<0||xx>=n||yy>=n) continue;
        cells.push([xx,yy]);
      }
    }

    function grab(base,x,y){
      var u=base+"/"+z+"/"+y+"/"+x+TILE_CB;
      return Promise.race([
        fetch(u,{cache:"no-store"}).then(function(r){
          if(!r.ok) return -1;
          return r.arrayBuffer().then(function(b){ return b.byteLength; });
        }).catch(function(){ return -2; }),
        new Promise(function(res){ setTimeout(function(){ res(-3); },6000); })
      ]);
    }
    async function survey(base){
      var lens=[];
      for(var i=0;i<cells.length;i+=3){
        var batch=await Promise.all(cells.slice(i,i+3).map(function(p){ return grab(base,p[0],p[1]); }));
        lens=lens.concat(batch);
        await new Promise(function(r){ setTimeout(r,180); });
      }
      var clean=lens.every(function(v){ return v>0; });
      /* An error card is a flat box with one line of text — a couple of KB. A real street tile
         at any zoom we request is tens of KB. Same threshold the service worker uses. */
      var bad=lens.filter(function(v){ return v>0 && v<4096; }).length;
      var good=lens.filter(function(v){ return v>=4096; }).length;
      return {bad:bad, good:good, clean:clean, n:lens.length};
    }

    var STREET="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile";
    var a=await survey(STREET);
    _probeTxt="basemap  z"+z+"  "+a.good+" ok / "+a.bad+" refused of "+a.n+
              (a.clean?"":"  [network noise]");
    try{ localStorage.setItem("cw_baseMinzAt",String(Date.now())); }catch(e){}

    if(a.clean && a.bad>0){
      /* Esri is refusing tiles this driver can see. Switch providers rather than keep painting
         the refusals — a basemap with gaps is not a basemap. */
      /* Only auto-switch if a CARTO key exists, otherwise we swap a partly-broken map for a
         completely broken one. */
      if(BASE_PROVIDER!=="osm"){
        BASE_PROVIDER="osm";
        try{ localStorage.setItem("cw_baseProvider","osm"); }catch(e){}
        _probeTxt+="\n         switched to OSM";
        try{ applyTheme(S.theme||"dark"); }catch(e){}
        try{ toast("Map switched to a provider with full coverage here"); }catch(e){}
      }
    } else if(a.clean && a.bad===0 && BASE_PROVIDER==="carto"){
      _probeTxt+="\n         Esri healthy again (staying on CARTO)";
    }
  }catch(e){ _probeTxt="basemap  probe threw: "+((e&&e.message)||"?"); }
}

function rasterStyleObj(dark){
  // CARTO began requiring an API key (unauthenticated tiles get an "API KEY REQUIRED" watermark)
  // and is retiring its raster basemaps, so we use Esri's keyless tiles instead.
  // Optional: put a free CARTO key in CW_CONFIG.cartoKey to use CARTO styling instead.
  const ck=(CW_CONFIG&&CW_CONFIG.cartoKey||"").trim();
  if(ck){
    const base=dark?"dark_all":"voyager";
    return {version:8,
      sources:{carto:{type:"raster",tiles:["a","b","c","d"].map(s=>`https://${s}.basemaps.cartocdn.com/rastertiles/${base}/{z}/{x}/{y}.png?key=${ck}`),tileSize:256,maxzoom:20,attribution:"© OpenStreetMap © CARTO"}},
      layers:[{id:"bg",type:"background",paint:{"background-color":dark?"#0E1013":"#EAE6DF"}},{id:"carto",type:"raster",source:"carto"}]};
  }
  // ONE source for both themes: Esri's street map has tiles all the way to nav zoom (17-19).
  // The dark canvas basemap tops out ~z16, which produced "Map data not yet available" while driving.
  // Night mode is rendered by darkening these tiles instead of swapping to a shallower source.
  const url=baseTileURL(dark);
  /* Dark mode used to knock 35% of the saturation out of the tiles. That is what made parks,
     water and road classes collapse into the same grey — next to Apple Maps it reads as a dead
     map. Apple's night style keeps colour and darkens LUMINANCE instead, so that's what we do:
     brightness down, saturation slightly UP to hold colour through the darkening, contrast up
     so road hierarchy survives it. */
  let paint = dark
    ? {"raster-brightness-max":0.52,"raster-brightness-min":0.02,"raster-saturation":0.18,"raster-contrast":0.28,"raster-opacity":1}
    : {"raster-saturation":0.10,"raster-contrast":0.10,"raster-opacity":1};
  let bgc = dark?"#0E1013":"#EAE6DF";
  /* THIS is the function styleFor() actually calls. Every seasonal treatment I wrote before
     went into rasterStyle() instead — a dead twin — which is why none of it ever appeared.
     Note the comment above: the dark canvas basemap stops around z16 and breaks navigation,
     so we stay on the street source and push it to dusk with paint properties only. */
  try{
    if(typeof seasonActive==="function" && seasonActive()){
      /* The seasonal treatment used to hue-rotate the BASEMAP by -34deg, which swings every
         green toward brown and is why the map read as beige mud next to Apple's. A season is
         decoration; the map is the product. Tint the chrome, leave the map data legible — a
         very light warm push only, no hue rotation. */
      paint = dark
        ? {"raster-brightness-max":0.50,"raster-brightness-min":0.00,"raster-saturation":0.22,
           "raster-contrast":0.34,"raster-hue-rotate":-8,"raster-opacity":1}
        : {"raster-saturation":0.20,"raster-contrast":0.16,"raster-hue-rotate":-8,"raster-opacity":1};
      bgc = dark ? "#141017" : "#EDE7E2";
    }
  }catch(e){}
  /* THE SHARPNESS GAP. Esri serves 256px tiles and we declared tileSize 256, so one tile pixel
     was stretched across three device pixels on a modern phone — that soft, smeared look next
     to Apple's vector map. Declaring 128 makes MapLibre fetch one zoom level deeper for the
     same view, so twice the pixel density lands in the same space. Costs ~4x the tile requests,
     which is why it is applied only where the screen can actually show the difference. */
  var _dpr = (typeof window!=="undefined" && window.devicePixelRatio) || 1;
  var _vw  = (typeof window!=="undefined" && window.innerWidth) || 400;
  var _off = (typeof navigator!=="undefined" && navigator.onLine===false);
  /* v254: the 4x tile cost has to be earned. Three cases where it is not:
     - OFFLINE. Four times the tiles means four times the cache misses, which is why the map
       came up in black patches in airplane mode. 256 asks for a quarter as many, and the ones
       it asks for are the ones the browser is most likely to already hold.
     - BIG VIEWPORTS. An iPad shows several times a phone's area, so 4x on top of that is
       hundreds of simultaneous requests; Esri starts refusing them and MapLibre paints the
       refusal tiles, which is the "Zoom Level Not Supported" wallpaper.
     - SLOW RENDERING generally: every one of those tiles is a decode and an upload.
     A phone-sized retina screen online is exactly where the sharpness is visible and the cost
     is bearable, so that is the only place it stays. */
  /* v255: 128 is gone. It was my sharpness fix in v240 and it has now caused black patches
     offline, "Zoom Level Not Supported" wallpaper on two devices, and slow rendering — Esri
     serves error PNGs with a 200 status, so MapLibre cannot tell a refusal from a tile and
     paints it. A basemap that is reliably correct beats one that is occasionally sharper. */
  var _ts = 256; void _dpr; void _vw; void _off;
  return {version:8,
    /* minzoom comes from the probe above rather than an assumption. At 0 (the default until
       the probe runs) behaviour is exactly as before. */
    sources:{basemap:{type:"raster",tiles:[url],tileSize:_ts,minzoom:BASE_MINZ,maxzoom:19,attribution:"© Esri, © OpenStreetMap contributors"}},
    layers:[{id:"bg",type:"background",paint:{"background-color":bgc}},
            {id:"basemap",type:"raster",source:"basemap",paint:paint,layout:{visibility:"visible"}}]};
}
/* The tile-size decision depends on things that change while the app is open — going offline,
   rotating an iPad. Rebuild the basemap when they do, debounced so a flapping connection or a
   drag-resize doesn't thrash the style. */
var _tsLast=null, _tsT=null;
function _tileSizeNow(){
  var d=(window.devicePixelRatio||1), w=(window.innerWidth||400), off=(navigator.onLine===false);
  void d; void w; void off; return 256;
}
function _restyleIfTileSizeChanged(){
  clearTimeout(_tsT);
  _tsT=setTimeout(function(){
    try{
      var now=_tileSizeNow();
      if(_tsLast===null){ _tsLast=now; return; }
      if(now===_tsLast) return;
      _tsLast=now;
      var src=map&&map.getSource&&map.getSource("basemap");
      if(!src) return;
      applyTheme(S.theme||"dark");        // rebuilds the style object at the new tile size
    }catch(e){}
  }, 900);
}
try{
  window.addEventListener("online", _restyleIfTileSizeChanged);
  window.addEventListener("offline", _restyleIfTileSizeChanged);
  window.addEventListener("resize", _restyleIfTileSizeChanged);
}catch(e){}
async function styleFor(theme){
  return rasterStyleObj(theme!=="light");   // raster PNG = reliably cacheable offline
}
let map, meMarker, destMarker;
const stopMarkers=[]; const hzMarkers=[];
// time-to-live in minutes, grounded in real incident-clearance data (urban avg ~25-30 min, 45 = short/long threshold, rural/major longer).
// 0 = permanent infrastructure — stays until a driver confirms it's fixed/gone. User confirms FRESHEN the timer (self-correcting).
const HAZ_TTL={ power_lines:360, pothole:0, construction_cones:0, camera:0, camera_flock:0, road_closure:120, accident:45, police:20, emergency:15, traffic:30, stalled:45, debris:60, animal:30, flooding:180, ice:180, alert:60 };
function _ago(ts){ const m=Math.floor((Date.now()-(ts||Date.now()))/60000); return m<1?"just now":m<60?m+"m ago":Math.floor(m/60)+"h "+ (m%60) +"m ago"; }
function hazPopupHTML(h){
  const m=HZ_META[h.type]||HZ_META.debris;
  const perm=HAZ_TTL[h.type]===0;
  const goneLabel=perm?"✗ Fixed":"✗ Gone";
  return `<div style="min-width:150px"><b style="color:${m.color}">${m.emoji} ${m.label}</b><br>`+
    (laneText(h.lanes)?`<span style="font-size:12px;font-weight:700;color:${m.color}">🛣 ${laneText(h.lanes)}</span><br>`:``)+
    `<span style="font-size:12px">${h.note||"Driver report"}</span><br>`+
    `<span style="font-size:11px;opacity:.6">${h.reports||1} report${(h.reports||1)>1?"s":""} · ${_ago(h.ts)}</span>`+
    `<div style="display:flex;gap:6px;margin-top:8px">`+
    `<button onclick="cwConfirm('${h.id}')" style="flex:1;border:none;border-radius:8px;padding:7px;background:#34c759;color:#fff;font-weight:700;font-size:12px">✓ Still here</button>`+
    `<button onclick="cwGone('${h.id}')" style="flex:1;border:none;border-radius:8px;padding:7px;background:#e5484d;color:#fff;font-weight:700;font-size:12px">${goneLabel}</button>`+
    `</div></div>`;
}
function refreshHazPopup(h){ try{ if(h._marker&&h._marker.getPopup())h._marker.getPopup().setHTML(hazPopupHTML(h)); }catch(e){} }
// One popup at a time: when any popup opens, close whatever was open before it. Stops the
// hazard + inspect popups from stacking on top of each other.
let _cwOpenPopup=null;
function trackPopup(p){
  try{
    p.on("open",()=>{
      if(_cwOpenPopup && _cwOpenPopup!==p){ try{_cwOpenPopup.remove();}catch(e){} }
      if(typeof inspectPopup!=="undefined" && inspectPopup && inspectPopup!==p){ try{inspectPopup.remove();}catch(e){} inspectPopup=null; }
      _cwOpenPopup=p;
    });
    p.on("close",()=>{ if(_cwOpenPopup===p) _cwOpenPopup=null; });
  }catch(e){}
  return p;
}
// confirm = "still here": bumps count AND freshens the timer (crowd feedback keeps live reports alive, lets stale ones expire)
window.cwConfirm=function(id){
  const h=S.hazards.find(x=>x.id===id); if(!h)return;
  h.reports=(h.reports||1)+1; h.ts=Date.now(); refreshHazPopup(h);
  try{ restyleHazMarker(h); }catch(e){}
  toast(`Confirmed ✓ · ${h.reports} reports`); if(navigator.vibrate)navigator.vibrate(30);
};
// keep a marker's colour, size and ring in sync after its report count changes
function restyleHazMarker(h){
  if(!h||!h._marker) return;
  const el=h._marker.getElement(); if(!el) return;
  const m=HZ_META[h.type]||HZ_META.debris;
  const isPot=h.type==="pothole";
  const col=isPot?potColor(h):m.color;
  const sc=isPot?potScale(h):hazScale(h);
  const px=Math.round(markerBase()*sc);
  el.style.background=col;
  el.style.width=px+"px"; el.style.height=px+"px";
  el.style.fontSize=Math.round(markerBase()*0.52*sc)+"px";
  el.style.boxShadow="0 0 0 "+(2+sc*2).toFixed(0)+"px "+col+"33";
  el.dataset.basePx=px;
}
// gone/fixed: temporary needs 1 vote, permanent needs 2 (avoids accidental removal of a real pothole)
/* Cleared hazards used to come straight back: cwGone only spliced the local array, but
   loadSharedHazards does a full `S.hazards = rows` replace from Supabase, so the next sync
   re-added whatever you just dismissed. Keep a device-local dismiss list and filter every
   load through it. (A shared server-side "gone" vote is the eventual fix — needs a column.) */
const CW_DISMISS_KEY="cw_dismissed";
function _dismissed(){ try{ return JSON.parse(localStorage.getItem(CW_DISMISS_KEY)||"{}"); }catch(e){ return {}; } }
function _dismiss(id){
  try{ var d=_dismissed(); d[id]=Date.now();
    // keep the list from growing forever — drop entries older than 30 days
    var cut=Date.now()-30*864e5; Object.keys(d).forEach(function(k){ if(d[k]<cut) delete d[k]; });
    localStorage.setItem(CW_DISMISS_KEY,JSON.stringify(d));
  }catch(e){}
}
function notDismissed(h){ var d=_dismissed(); return !(h && h.id && d[h.id]); }
/* ═══════════ anonymous device id ═══════════
   A random string in localStorage. Not an account, not tied to a person, never sent anywhere
   except as a column on the reports this device files. Keeps the "no login, no download"
   promise while making a per-user count and a future leaderboard possible. */
/* ═══════════ share the app ═══════════
   There was no way to hand ConeWatch to someone else — and a community hazard network is only
   as good as the number of people in it, so this is closer to a core feature than a nicety.
   Uses the native share sheet where available, falls back to clipboard. */
/* Two-finger drag tilts the map — genuinely useful and completely undiscoverable, so nobody
   was using it. Show it once, the first few times someone drives, then never again. */
function maybeShowTiltHint(){
  try{
    var n=parseInt(localStorage.getItem("cw_tilt_hint")||"0",10);
    if(n>=3) return;
    localStorage.setItem("cw_tilt_hint",String(n+1));
    setTimeout(function(){ toast("Tip: drag with two fingers to tilt the map \u2014 swipe down to look further ahead",5200); },2600);
  }catch(e){}
}
function shareApp(){
  var url=location.origin+location.pathname;
  var data={ title:"ConeWatch",
    text:"ConeWatch — live potholes, cops and road hazards, reported by drivers. No download, no account, free.",
    url:url };
  try{
    if(navigator.share){ navigator.share(data).catch(function(){}); return; }
  }catch(e){}
  try{
    navigator.clipboard.writeText(url);
    toast("Link copied — paste it anywhere to share ConeWatch",3000);
  }catch(e){ toast(url,6000); }
}
function deviceId(){
  try{
    var d=localStorage.getItem("cw_device_id");
    if(!d){
      d=(crypto&&crypto.randomUUID)?crypto.randomUUID()
        :("dev-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2,10));
      localStorage.setItem("cw_device_id",d);
    }
    return d;
  }catch(e){ return null; }
}
function myReportCount(){ try{ return parseInt(localStorage.getItem("cw_my_reports")||"0",10)||0; }catch(e){ return 0; } }
function bumpReportCount(){
  try{ var n=myReportCount()+1; localStorage.setItem("cw_my_reports",String(n));
       var el=$("myReports"); if(el) el.textContent=n+(n===1?" report":" reports");
       return n; }catch(e){ return 0; }
}
window.cwGone=function(id){ const i=S.hazards.findIndex(x=>x.id===id); if(i<0)return; const h=S.hazards[i]; h.gone=(h.gone||0)+1; const need=HAZ_TTL[h.type]===0?2:1;
  // Tell the server too, so a clear reaches every driver instead of just this device. The
  // increment happens inside Postgres (cw_vote_gone) because two people clearing the same
  // pothole at once would both read the old count and both write the same new one.
  // Local dismissal still applies immediately either way — the network is never in the path
  // between tapping Gone and the marker disappearing.
  if(S.sb.url && S.sb.key && id && String(id).indexOf("-")>0){
    try{
      fetch(`${S.sb.url}/rest/v1/rpc/cw_vote_gone`,{
        method:"POST", headers:sbH({"Content-Type":"application/json"}),
        body:JSON.stringify({hazard_id:id, threshold:need})
      }).catch(function(){});
    }catch(e){}
  }
  if(h.gone>=need){ try{if(h._marker)h._marker.remove();}catch(e){} S.hazards.splice(i,1); _dismiss(id); toast("Cleared — thanks for the update"); }
  else { toast("Noted — one more confirmation will clear it"); }
  if(navigator.vibrate)navigator.vibrate(30);
};
// sweep expired temporary hazards every minute (timer measured from last confirmation)
function sweepHazards(){ const now=Date.now(); for(let i=S.hazards.length-1;i>=0;i--){ const h=S.hazards[i]; const ttl=HAZ_TTL[h.type]; if(ttl && now-(h.ts||now)>ttl*60000){ try{if(h._marker)h._marker.remove();}catch(e){} S.hazards.splice(i,1); } } }
setInterval(sweepHazards,60000);

let mapStyleTheme="dark";
(async function boot(){
  S.themeNow=isDayNow()?"light":"dark";
  document.documentElement.dataset.theme=S.themeNow;
  mapStyleTheme=S.themeNow;
  const style=await styleFor(S.themeNow);
  /* Tiles were dropping out at the horizon when pitched and lagging on zoom. MapLibre's
     default cache is small, so panning back over ground you just left re-fetches everything.
     A bigger cache keeps recent tiles in memory, no fade removes the "loading" shimmer that
     reads as lag, and not re-validating expired tiles stops needless refetches mid-drive. */
  map=new maplibregl.Map({ container:"map", style, center:[-83.0790,42.3316], zoom:14.5, pitch:0, bearing:0,
    /* fadeDuration:0 was my mistake in v164 — I set it to remove what looked like loading
       shimmer, but without a cross-fade tiles pop in as hard-edged rectangles, which is the
       blocky patchwork that appears when panning or pitching. A short fade blends them and
       reads as smooth rather than hesitant. The cache is what actually fixed the lag. */
    attributionControl:true, maxTileCacheSize:600, fadeDuration:180, refreshExpiredTiles:false,
    /* Full freedom to explore. The main map was on MapLibre's default 60° cap while the
       preview maps already went to 85, and nothing here should stop someone flying out to
       world view and back in. Rotation and pitch gestures explicitly on. */
    maxPitch:85, minZoom:0, maxZoom:22, dragRotate:true, pitchWithRotate:true,
    touchZoomRotate:true, touchPitch:true, doubleClickZoom:true, keyboard:true });
  try{ map.touchZoomRotate.enableRotation(); }catch(e){}
  try{ map.dragRotate.enable(); }catch(e){}
  map.on("load",()=>{ S.mapReady=true; addMapLayers(); initUserMarker(); try{ restoreRouteLocal(); }catch(e){}
    try{ ensureSignalLayer(); scheduleSignalFetch(); }catch(e){}
    setTimeout(function(){ try{ probeBasemapFloor(false); }catch(e){} }, 4000);
    /* Clear any satellite layer left behind by an earlier session before it can paint. */
    try{ pruneSat(); }catch(e){}
    /* Radar was writing cw_radar on every toggle and never reading it back, so it reset to off
       on every launch. Restore it — and default to ON, since precipitation is something a
       driver wants to see without having gone looking for a setting. */
    try{
      var _rp=null; try{ _rp=localStorage.getItem("cw_radar"); }catch(e){}
      if(_rp!=="0"){
        setTimeout(function(){ try{ if(!S.radarOn) toggleRadar(); }catch(e){} }, 2500);
      }
    }catch(e){}
    _cwAddMapModeBtn(); applyMapMode();
    if(S.queuedTheme&&S.queuedTheme!==mapStyleTheme) swapMapStyle(S.queuedTheme);
    if(seenWelcome()){ startGPS(); if(S.sb.url&&S.sb.key){ loadSharedHazards(); startHazardSync(); startRealtime(); } if(!tutSeen()){ setTimeout(startTutorial,700); } else { toast("ConeWatch Pro — search a destination, or tap ⋯ for tools."); } }
    else $("welcome").style.display="flex"; });
  const mc=map.getCanvasContainer();
  ["touchstart","mousedown"].forEach(ev=>mc.addEventListener(ev,()=>{S.touching=true;},{passive:true}));
  ["touchend","touchcancel","mouseup"].forEach(ev=>mc.addEventListener(ev,()=>{setTimeout(()=>{S.touching=false;},350);},{passive:true}));
  map.on("dragstart",()=>{ S.follow=false; updateFollowUI(); clearTimeout(_reCenterT);
    // auto-recenter after a few seconds of no interaction (no button needed)
    _reCenterT=setTimeout(()=>{ if(!S.touching){ S.follow=true; updateFollowUI(); hideRelock(); cameraFollow(); } }, S.navigating?6000:9000);
  });
  map.on("moveend",()=>{ if(!S.follow && S.mapReady) startRelock(); try{ scheduleSignalFetch(); }catch(e){}
    /* Coverage is a property of WHERE you are looking, so re-check when that changes. Heavily
       throttled: a probe is a burst of tile requests and must never ride along with panning. */
    try{
      if(!window._probeMoveAt || Date.now()-window._probeMoveAt > 120000){
        window._probeMoveAt=Date.now();
        setTimeout(function(){ try{ probeBasemapFloor(true); }catch(e){} }, 1500);
      }
    }catch(e){}
  });
  map.on("error",()=>{});
  applyTheme(true);
})();

function heatFeatures(){
  const f=[];
  // ROUGHNESS HEAT = road surface condition only. Potholes are the only reported hazard
  // that belongs here; cones, closures, police, debris, ice, accidents each get their own
  // visual language elsewhere, so the green→red heat always means "how rough is the road."
  (S.hazards||[]).forEach(hz=>{ if(hz.type==="pothole"){ f.push({type:"Feature",properties:{w:Math.min(1,(hz.reports||1)/4)},geometry:{type:"Point",coordinates:[hz.lng,hz.lat]}}); } });
  // plus this driver's own accelerometer-sensed roughness — recent only (last ~21 days), so
  // stale over-logged points age out instead of permanently painting the whole route.
  const _cut=Date.now()-21*864e5;
  (roughPts||[]).forEach(p=>{ if((p.t||0)>=_cut) f.push({type:"Feature",properties:{w:p.s||0.4},geometry:{type:"Point",coordinates:[p.lng,p.lat]}}); });
  return {type:"FeatureCollection",features:f};
}
function refreshHeat(){ try{ if(map.getSource("rough"))map.getSource("rough").setData(heatFeatures()); }catch(e){} }
function ensureHeatLayer(){
  if(!map.getSource("rough"))map.addSource("rough",{type:"geojson",data:heatFeatures()});
  if(!map.getLayer("rough-heat"))map.addLayer({id:"rough-heat",type:"heatmap",source:"rough",maxzoom:18,paint:{
    "heatmap-weight":["get","w"],
    "heatmap-intensity":["interpolate",["linear"],["zoom"],10,0.6,18,2],
    "heatmap-color":["interpolate",["linear"],["heatmap-density"],0,"rgba(0,0,0,0)",0.2,"#2ecc71",0.45,"#f1c40f",0.7,"#e67e22",1,"#e74c3c"],
    "heatmap-radius":["interpolate",["linear"],["zoom"],10,8,16,26],
    "heatmap-opacity":0.7
  }});
}
function toggleHeat(){
  S.heatOn=!S.heatOn;
  if(S.heatOn){ ensureHeatLayer(); refreshHeat(); try{map.setLayoutProperty("rough-heat","visibility","visible");}catch(e){} toast("🌡️ Road-quality heatmap ON — green=smooth, red=rough"); }
  else { try{map.setLayoutProperty("rough-heat","visibility","none");}catch(e){} toast("Heatmap off"); }
  const b=$("heatState"); if(b)b.textContent=S.heatOn?"On — pothole & rough-road density":"Off";
}
// ── Map detail modes: Full → Clean → Minimal → Full ────────────────────────────
// Declutters ConeWatch's own overlays (heat, glows, 3D, marker size). The raster basemap
// paint (land/water/labels) can't be restyled without swapping tile providers, so this
// controls what WE draw — which is where the visual noise actually lives.
const MAP_MODES=["full","clean","minimal"];
const MAP_MODE_LABEL={full:"🗺 Full detail",clean:"🧭 Clean — heat & 3D hidden",minimal:"▁ Minimal — just get me there"};
function applyMapMode(){
  const mode=S.mapMode||"full";
  try{document.body.classList.toggle("cw-minimal",mode==="minimal");}catch(e){}
  try{document.body.classList.toggle("cw-clean",mode==="clean");}catch(e){}
  // roughness heat: only in full (and only if the user has it on)
  try{ map.setLayoutProperty("rough-heat","visibility",(mode==="full"&&S.heatOn)?"visible":"none"); }catch(e){}
  // 3D buildings: only in full (best-effort — may not exist on the raster basemap)
  try{ if(map.getLayer("cw-3d")) map.setLayoutProperty("cw-3d","visibility",(mode==="full"&&S.is3d)?"visible":"none"); }catch(e){}
  // Discover POI markers: hidden in minimal
  try{ poiMarkers.forEach(m=>{ const el=m.getElement&&m.getElement(); if(el) el.style.display=(mode==="minimal")?"none":""; }); }catch(e){}
  // traffic signals: full only. Leaving full also means we stop spending Overpass requests
  // on them, so re-arm the fetch when we come back.
  try{ applySignalVis(); if(mode==="full") scheduleSignalFetch(); }catch(e){}
  const btn=$("fabMapMode"); if(btn){ btn.classList.toggle("active",mode!=="full"); btn.textContent=(mode==="minimal")?"▁":(mode==="clean")?"◐":"◑"; }
  try{ layout(); }catch(e){}   // header shrinks in minimal — re-measure --hdrH so the FAB rail follows
}
function cycleMapMode(){
  const i=MAP_MODES.indexOf(S.mapMode||"full");
  S.mapMode=MAP_MODES[(i+1)%MAP_MODES.length];
  applyMapMode();
  toast(MAP_MODE_LABEL[S.mapMode]);
  try{saveSettings();}catch(e){}
}
// inject the map-mode button into the tools tray, next to 3D / Satellite (same family)
function _cwAddMapModeBtn(){
  try{
    if($("fabMapMode")) return;
    const tray=$("moreFabs"); if(!tray) return;
    const b=document.createElement("button");
    b.className="fab"; b.id="fabMapMode"; b.setAttribute("aria-label","Map detail (Full / Clean / Minimal)");
    b.textContent="◑"; b.title="Map detail: tap to cycle Full → Clean → Minimal";
    b.onclick=cycleMapMode;
    const after=$("fab3d")||$("fabSat"); if(after&&after.parentNode===tray) tray.insertBefore(b,after.nextSibling); else tray.appendChild(b);
  }catch(e){}
}
function addMapLayers(){
  try{ applySeasonSky(); }catch(e){}
  setTimeout(function(){ try{ paintSeasonTint(); }catch(e){} },0);   // style swaps reset the sky — reapply every time
  const a=ACCENT[S.themeNow];
  if(!map.getSource("route")) map.addSource("route",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("route-casing")) map.addLayer({id:"route-casing",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":a.casing,"line-width":["interpolate",["linear"],["zoom"],10,7,14,13,18,22],"line-opacity":.95}});
  if(!map.getLayer("route-line")) map.addLayer({id:"route-line",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":a.route,"line-width":["interpolate",["linear"],["zoom"],10,4.5,14,9,18,15]}});
  // seasonal flow layer — a pale ember travelling the route, sitting on top of the solid line
  try{
    var _hw=false; try{ _hw=(typeof seasonActive==="function")&&seasonActive(); }catch(e){}
    if(_hw && !map.getLayer("route-flow")){
      map.addLayer({id:"route-flow",type:"line",source:"route",
        layout:{"line-cap":"butt","line-join":"round"},
        paint:{"line-color":"#FFD24A","line-opacity":.85,
          "line-width":["interpolate",["linear"],["zoom"],10,2.5,14,5,18,8],
          "line-dasharray":[0,0,2,6]}});
      startRouteFlow();
    } else if(!_hw && map.getLayer("route-flow")){
      stopRouteFlow(); map.removeLayer("route-flow");
    }
  }catch(e){}
  if(!map.getLayer("route-core")) map.addLayer({id:"route-core",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":a.core,"line-width":["interpolate",["linear"],["zoom"],10,1.4,14,2.6,18,4.2]}});
  // 3D buildings from whichever vector source the style ships
  try{
    const sources=map.getStyle().sources;
    const vecId=Object.keys(sources).find(k=>sources[k].type==="vector");
    if(vecId && !map.getLayer("cw-3d")) map.addLayer({id:"cw-3d",source:vecId,"source-layer":"building",type:"fill-extrusion",minzoom:14,
      paint:{"fill-extrusion-color":S.themeNow==="light"?"#D6DBE2":"#2A2E36",
        "fill-extrusion-height":["coalesce",["get","render_height"],["get","height"],10],
        "fill-extrusion-base":["coalesce",["get","render_min_height"],["get","min_height"],0],
        "fill-extrusion-opacity":0.8}});
  }catch{}
  // v5 sky / atmosphere
  try{
    map.setSky(S.themeNow==="light"
      ? {"sky-color":"#87B7E8","horizon-color":"#DCE8F2","fog-color":"#E8EEF4","sky-horizon-blend":.6,"horizon-fog-blend":.4}
      : {"sky-color":"#070B14","horizon-color":"#12203A","fog-color":"#0B1120","sky-horizon-blend":.65,"horizon-fog-blend":.5});
  }catch{}
  if(S.route){ try{ map.getSource("route").setData({type:"Feature",geometry:S.route.geometry}); }catch{} }
  // road-quality heatmap is on by default now — this is a pothole app first
  try{ if(S.heatOn){ ensureHeatLayer(); refreshHeat(); map.setLayoutProperty("rough-heat","visibility","visible"); } }catch(e){}
  ensureSat();
}
let styleSwapping=false;
function swapMapStyle(theme,force){
  if(styleSwapping)return;
  // NEVER restyle mid-navigation — setStyle wipes every layer (incl. the route line). Defer until the drive ends.
  if(S.navigating){ S.pendingTheme=theme; return; }
  styleSwapping=true;
  styleFor(theme).then(st=>{
    // register BEFORE setStyle so the restore can't be missed (this race was killing the route line)
    const done=()=>{ mapStyleTheme=theme; styleSwapping=false; addMapLayers(); ensureRouteLayers();
      /* Self-heal: a swap requested while another was still resolving was silently dropped by
         the styleSwapping guard, which left the map painted for the PREVIOUS season state —
         the theme appeared to be exactly one toggle behind. Rather than queue requests, just
         check reality once the swap lands and correct it if it disagrees. */
      try{
        var want=(typeof seasonActive==="function")?seasonActive():null;
        if(want!==null && _seasonPainted!==want && !S.navigating){
          _seasonPainted=want;
          setTimeout(function(){ try{ swapMapStyle(theme,true); }catch(e){} },0);
        }
      }catch(e){}
    };
    map.once("style.load",done);
    setTimeout(()=>{ if(styleSwapping){ try{ if(map.isStyleLoaded&&map.isStyleLoaded()) done(); }catch(e){} styleSwapping=false; } },2500);
    map.setStyle(st);
  }).catch(()=>{ styleSwapping=false; });
}

/* ═══════════ route line coloured by road condition (from our own reports) ═══════════
   Not live traffic — we don't have that. This is better for a pothole app: the line turns
   yellow where the road is rough and red where potholes cluster, so you can SEE the bad
   stretches before you drive them. */
function _routeConditionData(){
  const co=(S.route&&S.route.geometry&&S.route.geometry.coordinates)||[];
  if(co.length<2) return {type:"FeatureCollection",features:[]};
  const pots=(S.hazards||[]).filter(h=>h.type==="pothole"||h.type==="debris");
  const rough=(typeof roughPts!=="undefined"&&roughPts)||[];
  const feats=[];
  for(let i=0;i<co.length-1;i++){
    const a={lat:co[i][1],lng:co[i][0]}, b={lat:co[i+1][1],lng:co[i+1][0]};
    const mid={lat:(a.lat+b.lat)/2,lng:(a.lng+b.lng)/2};
    let score=0;
    for(const p of pots){ const d=distM(mid,p); if(d<70){ const w=(p.psev||1); score+=w*(1-d/70)*1.6; } }
    for(const r of rough){ const d=distM(mid,r); if(d<70) score+=(r.s||0.4)*(1-d/70); }
    const lvl = score>=2.2 ? 2 : score>=0.7 ? 1 : 0;   // 0 good · 1 rough · 2 bad
    feats.push({type:"Feature",properties:{lvl},geometry:{type:"LineString",coordinates:[co[i],co[i+1]]}});
  }
  return {type:"FeatureCollection",features:feats};
}
function refreshRouteCondition(){
  try{
    if(!S.mapReady||!map) return;
    const data=_routeConditionData();
    if(!map.getSource("routeCond")) map.addSource("routeCond",{type:"geojson",data:data});
    else map.getSource("routeCond").setData(data);
    if(!map.getLayer("route-cond")){
      map.addLayer({id:"route-cond",type:"line",source:"routeCond",
        layout:{"line-cap":"round","line-join":"round"},
        paint:{"line-color":["match",["get","lvl"],1,"#FFC72C",2,"#E5484D","rgba(0,0,0,0)"],
               "line-width":["interpolate",["linear"],["zoom"],10,5,14,10,18,17],
               "line-opacity":0.95}});
    }
  }catch(e){}
}
// safety net: if the route line ever goes missing (style swap, GL context loss), put it back
function ensureRouteLayers(){
  try{
    if(!S.mapReady||!map) return;
    // v185 briefly shipped a blurred bloom layer; strip it if a cached session still has one
    try{ if(map.getLayer("route-glow")) map.removeLayer("route-glow"); }catch(e){}
    if(!map.getSource("route")||!map.getLayer("route-line")) addMapLayers();
    try{ _addSignalImage(); }catch(e){}          // style swaps drop registered images
    /* A style swap rebuilds the sat layer from scratch — re-assert the zoom floor or the error
       tiles come straight back the next time the driver zooms out. */
    try{ if(S.sat) ensureSat(); else pruneSat(); }catch(e){}
    if(!map.getSource("signals")||!map.getLayer("signal-dots")) ensureSignalLayer();
    if(S.route&&S.route.geometry&&map.getSource("route")) map.getSource("route").setData({type:"Feature",geometry:S.route.geometry});
    refreshRouteCondition();
  }catch(e){}
}
/* ═══════════ smooth motion: glide between GPS fixes instead of teleporting ═══════════
   The GPS only reports ~1x/sec. Rendering only on those ticks makes the car jump a
   car-length at a time and feel "all over the place". We animate every frame using the
   last known speed + heading (dead reckoning), then gently correct to each real fix. */
let _dr={lat:null,lng:null,brg:0,t:0,raf:null};
function _drStep(){
  _dr.raf=requestAnimationFrame(_drStep);
  /* While the 3D preview is up there are TWO live WebGL maps: the preview on screen and the
     main map still repainting behind it on every GPS tick. On a phone with one GPU that is the
     whole lag story. The preview covers the screen, so nothing below it needs to draw. */
  if(S._previewOpen) return;
  if(!S.navigating||!S.pos||!meMarker||!S.mapReady) return;
  const now=performance.now();
  const dt=Math.min(0.5,(now-(_dr.t||now))/1000); _dr.t=now;
  const target=S.dispPos||S.pos;
  if(_dr.lat===null){ _dr.lat=target.lat; _dr.lng=target.lng; _dr.brg=(S.course||0); return; }
  // 1) predict forward along current heading at current speed
  const mps=Math.max(0,(S.speedMph||0)*0.44704);
  if(mps>0.6){
    const rad=(_dr.brg)*Math.PI/180, d=mps*dt;
    _dr.lat += (d*Math.cos(rad))/111111;
    _dr.lng += (d*Math.sin(rad))/(111111*Math.cos(_dr.lat*Math.PI/180)||1);
  }
  // 2) ease toward the real fix so prediction never drifts away from truth
  const k=Math.min(1,dt*3.2);
  _dr.lat += (target.lat-_dr.lat)*k;
  _dr.lng += (target.lng-_dr.lng)*k;
  // 3) smooth the heading (kills compass twitch)
  if(S.course!==null&&!isNaN(S.course)){
    let diff=((S.course-_dr.brg+540)%360)-180;
    _dr.brg=(_dr.brg+diff*Math.min(1,dt*4)+360)%360;
  }
  try{ meMarker.setLngLat([_dr.lng,_dr.lat]); meMarker.setRotation(_dr.brg); }catch(e){}
}
function startSmooth(){ if(!_dr.raf){ _dr.t=performance.now(); _dr.raf=requestAnimationFrame(_drStep); } }
function stopSmooth(){ if(_dr.raf){ cancelAnimationFrame(_dr.raf); _dr.raf=null; } _dr.lat=null; _dr.lng=null; }

function initUserMarker(){
  const el=document.createElement("div"); el.id="meArrow";
  meMarker=new maplibregl.Marker({element:el,rotationAlignment:"map",pitchAlignment:"map"}).setLngLat([-83.0790,42.3316]);
}

/* ═══════════ GPS ═══════════ */
function gpsOpts(){
  // ACCURACY FIRST. The old build asked for LOW accuracy whenever you weren't navigating, which
  // falls back to wifi/cell positioning and can sit 100m+ off — that's what made the dot look wrong
  // while just viewing the map. Real GPS now runs any time the app is open.
  if(S.navigating) return { enableHighAccuracy:true, maximumAge:0, timeout:15000 };
  /* maximumAge lets the OS answer instantly from its cache. Useful once we are running, but on
     the very first fix that cache is usually a stale cell-tower estimate — so demand a fresh
     reading until we have a real position. */
  if(!S.pos) return { enableHighAccuracy:true, maximumAge:0, timeout:15000 };
  return { enableHighAccuracy:true, maximumAge:S.saver?4000:1500, timeout:15000 };
}
function startGPS(){
  if(!("geolocation" in navigator)){ toast("No GPS available on this device."); return; }
  if(S.watchId!==null) navigator.geolocation.clearWatch(S.watchId);
  S.watchId=navigator.geolocation.watchPosition(onPos,onPosErr,gpsOpts());
}
let sunLoaded=false;
// auto-save the parked-car spot: once you have been driving and then come to a stop, remember where
let _drove=false,_stopSince=0;
function autoParkWatch(){
  if(S.mode!=="car"||!S.pos)return;
  if(S.speedMph>12){ _drove=true; _stopSince=0; return; }
  if(_drove && S.speedMph<2){
    if(!_stopSince)_stopSince=Date.now();
    else if(Date.now()-_stopSince>25000){            // stopped ~25s after driving → parked
      QK.park={lat:S.pos.lat,lng:S.pos.lng}; saveQK(); renderQuick();
      _drove=false; _stopSince=0;
      toast("🅿️ Parked spot saved — tap \u201CFind my car\u201D to walk back",4000);
    }
  } else if(S.speedMph>=2){ _stopSince=0; }
}
function onPos(p){
  const {latitude:lat,longitude:lng,accuracy,speed,heading}=p.coords;
  const _new={lat,lng,t:p.timestamp};
  // ── reject junk GPS fixes: poor accuracy or an impossible jump → hold last good position (kills teleport / circling / stuck marker) ──
  const _accBad=(accuracy!=null && accuracy>75);
  if(!S.pos){
    /* The first fix used to be accepted at anything under 2000m — a two-kilometre radius. Phones
       hand back a coarse cell-tower estimate instantly and only refine to real GPS over the next
       five to fifteen seconds, so the puck committed to whatever garbage arrived first and sat a
       block off the actual position. Hold out for a usable fix, but never hold out forever:
       after 12 seconds take the best one seen, because a slightly wrong position beats a map
       that never starts. */
    if(accuracy!=null){
      if(!S._firstAt) S._firstAt=Date.now();
      var _waited=Date.now()-S._firstAt;
      if(!S._bestFirst || accuracy < S._bestFirst.accuracy){
        S._bestFirst={lat:lat,lng:lng,t:p.timestamp,accuracy:accuracy};
      }
      if(accuracy>60 && _waited<12000){
        try{ var _gp=$("gpsHint");
          if(!_gp){ _gp=document.createElement("div"); _gp.id="gpsHint"; document.body.appendChild(_gp);
            _gp.style.cssText="position:fixed;left:50%;transform:translateX(-50%);z-index:2400;"+
              "bottom:calc(var(--dockH,150px) + var(--clusterH,120px) + 22px);"+
              "background:var(--panel-solid);border:1px solid var(--line);color:var(--text);"+
              "font-size:13px;padding:9px 15px;border-radius:20px;pointer-events:none;"+
              "box-shadow:0 8px 24px rgba(0,0,0,.4)";
          }
          _gp.textContent="Locking on GPS… \u00b1"+Math.round(accuracy)+"m";
        }catch(e){}
        return;                                                 // not good enough yet, keep waiting
      }
      // taking it: either it's a real fix or we've waited long enough for the best available
      if(accuracy>60 && S._bestFirst){
        lat=S._bestFirst.lat; lng=S._bestFirst.lng;
        _new.lat=lat; _new.lng=lng;
      }
      try{ var _g2=$("gpsHint"); if(_g2) _g2.remove(); }catch(e){}
    }
  } else {
    const _jump=distM(S.pos,_new), _dt=Math.max(0.001,(_new.t-S.pos.t)/1000);
    const _teleport=(_jump>150 && (_jump/_dt)>100);             // >~224 mph between fixes = not real
    /* A genuine GPS lock arriving after a coarse first fix looks exactly like a teleport. If we
       are still in the first 30 seconds and the new fix is far more accurate than the one we
       settled for, let it correct the position instead of rejecting it as junk. */
    var _earlyCorrect = _teleport && S._firstAt && (Date.now()-S._firstAt)<30000 &&
                        accuracy!=null && accuracy<=35 && (S.accuracy||999)>60;
    if(!_earlyCorrect && (_accBad || _teleport) && (S.goodFixes||0)>0){ S.accuracy=accuracy; return; }
  }
  if(!_accBad) S.goodFixes=(S.goodFixes||0)+1;
  if(!S.pos && typeof acCache!=="undefined" && acCache.clear) acCache.clear(); // first fix: drop any pre-lock typeahead entries
  S.lastPos=S.pos; S.pos=_new; S.accuracy=accuracy;
  /* At a standstill the GPS still reports a heading, but it's noise — consecutive fixes are
     metres apart in random directions, so the car marker spins to a diagonal while waiting at
     a light and only straightens once you're moving. Hold the last heading taken while
     genuinely in motion, and only accept a new one above walking pace. */
  var _mv = S.lastPos ? distM(S.lastPos,S.pos) : 0;
  var _movingEnough = (typeof speed==="number" && speed>1.4) || _mv>6;
  if(_movingEnough){
    if(heading!==null && !isNaN(heading)) S.course=heading;
    else if(S.lastPos && _mv>3) S.course=bearing(S.lastPos,S.pos);
  }
  // no else: stationary keeps whatever heading the last real movement established

  // speed: trust the GPS's own speed; when we must derive it, reject GPS scatter so a parked car never shows motion
  let moved = S.lastPos ? distM(S.lastPos,S.pos) : 0;
  let mph=0;
  if(speed!==null && !isNaN(speed) && speed>=0){ mph=speed*2.23694; if(mph<1.5) mph=0; }
  else if(S.lastPos){ const dt=(S.pos.t-S.lastPos.t)/1000, acc=accuracy||30; if(dt>0.4 && dt<12 && moved>Math.max(10,acc)) mph=(moved/dt)*2.23694; }
  if(!(mph>=0) || mph>120) mph=0;                 // reject NaN / impossible teleport jumps
  S.speedMph=S.speedMph*0.6+mph*0.4;
  if(S.speedMph<1) S.speedMph=0;
  const vm=Math.round(S.speedMph);
  $("speedV").textContent=S.units==="km"?Math.round(S.speedMph*1.60934):vm;
  $("speed").classList.toggle("over", S.limit ? vm>S.limit : vm>75);
  if(S.lastPos && mph>3 && moved<80){S.tripM+=moved;$("tripMi").textContent=S.units==="km"?(S.tripM/1000).toFixed(1):(S.tripM/1609.34).toFixed(1);}

  // snap-to-road while navigating: pin the dot AND the heading to the route line so GPS scatter can't drift it off-road.
  // BUT release the snap the moment you're clearly heading away — otherwise a wrong turn looks "on route" and never reroutes.
  let _dispLat=lat,_dispLng=lng;
  if(S.navigating){
    const _snap=snapToRoute(S.pos);
    if(_snap && _snap.dist<40){
      let _off=false;
      if(S.course!==null && !isNaN(S.course) && (S.speedMph||0)>4){
        const _d=Math.abs(((S.course-_snap.bearing+540)%360)-180);
        if(_d>55) _off=true;                    // pointing away from the route → don't fake being on it
      }
      if(!_off){ _dispLat=_snap.lat; _dispLng=_snap.lng; S.course=_snap.bearing; }
    }
  }
  S.dispPos={lat:_dispLat,lng:_dispLng};
  if(meMarker && !meMarker._map){ meMarker.addTo(map); map.easeTo({center:[_dispLng,_dispLat],zoom:16,duration:800}); toast("GPS locked ✓"); try{ setTimeout(maybeWarmArea,2500); }catch(e){} }
  try{ maybeWarmArea(); }catch(e){}
  if(meMarker && !S.navigating){ meMarker.setLngLat([_dispLng,_dispLat]); if(S.course!==null) meMarker.setRotation(S.course); }
  if(!sunLoaded){ sunLoaded=true; loadSunTimes(); }

  autoParkWatch();
  try{ _trackPoint(); }catch(e){}
  updateCompassUI(); cameraFollow();
  $("rsLoc").textContent=`You are at ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(accuracy)} m)`;
  $("sosCoords").textContent=`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if(S.navigating) navTick();
  try{ healRoughness(); }catch(e){}   // smooth re-drives heal old/false roughness points
  try{ learnSlowdown(); checkSlowAhead(); }catch(e){}   // learn + warn on recurring slow stretches
}
function onPosErr(e){
  const msgs={1:"Location denied — enable it in browser settings. (Previews often block GPS; the deployed HTTPS site works.)",2:"Position unavailable — move near a window.",3:"GPS timeout — retrying…"};
  toast(msgs[e.code]||"GPS error.");
  if(e.code===3) startGPS();
}
let lastFollow=0,lastFixT=0;
let _lastCamPos=null, _reCenterT=null;
// speed-based zoom: highway pulls back to see ahead, city tightens in — automatic, no control
/* Hard thresholds made the zoom ping-pong: GPS speed noise around 25/45/65 flipped the zoom
   every fix, and each flip restarted a fresh easeTo — that was the stutter. Hysteresis means
   a boundary has to be crossed by 4mph before the zoom moves, so noise can't trigger it. */
var _zoomStep=3;                                     // 0 fastest … 3 slowest
const _ZOOM_LEVELS=[15.2,15.8,16.4,17.0], _ZOOM_UP=[65,45,25,-1], _ZOOM_HYST=4;
function speedZoom(){
  var mph=S.speedMph||0;
  if(_zoomStep>0 && mph > _ZOOM_UP[_zoomStep-1]+_ZOOM_HYST) _zoomStep--;        // speeding up
  else if(_zoomStep<3 && mph < _ZOOM_UP[_zoomStep]-_ZOOM_HYST) _zoomStep++;     // slowing down
  return _ZOOM_LEVELS[_zoomStep];
}
/* ═══════════ thermal safeguard ═══════════
   The web has no temperature API, so this can't read the device directly. What it can see is
   the symptom: when iOS throttles a hot phone, sustained frame rate collapses. Watch for that
   and drop into saver (flat 2D, relaxed GPS cadence, no radar tiles) automatically, which cuts
   the GPU work that's generating the heat. GPS accuracy and hazard alerts are untouched —
   overheating is a reason to render less, never a reason to warn less. */
var _fpsRing=[], _thermalOn=false, _thermalLast=0;
(function watchFrames(){
  var last=performance.now(), frames=0;
  function tick(now){
    frames++;
    if(now-last>=1000){
      var fps=frames*1000/(now-last); frames=0; last=now;
      _fpsRing.push(fps); if(_fpsRing.length>8) _fpsRing.shift();
      if(_fpsRing.length===8 && Date.now()-_thermalLast>60000){
        var avg=_fpsRing.reduce(function(a,b){return a+b;},0)/8;
        // 8 consecutive seconds under 22fps while driving = sustained throttling, not a blip
        if(!_thermalOn && !S.saver && avg<22 && S.navigating){
          _thermalOn=true; _thermalLast=Date.now();
          try{ S.saver=true; startGPS(); }catch(e){}
          try{ var ss=$("saverState"); if(ss) ss.textContent="On — auto (device hot)"; }catch(e){}
          try{ if(S.radarOn){ S.radarOn=false; radarOff();
                var rs=$("radarState"); if(rs) rs.textContent="Off — paused, device hot"; } }catch(e){}
          try{ map.easeTo({pitch:0,duration:400}); }catch(e){}
          toast("Device running hot — Power Saver on automatically: flat 2D map to cool things down.",6000);
        } else if(_thermalOn && avg>40){
          _thermalOn=false; _thermalLast=Date.now();   // recovered; leave saver for the user to undo
        }
      }
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();
var _camDur=0;
function cameraFollow(){
  if(!S.follow||!S.pos||!S.mapReady||S.touching) return;
  const now=Date.now();
  const cp=S.dispPos||S.pos;
  if(S.navigating){
    // stationary (light/traffic) → skip re-centering; nothing moved, so don't repaint
    if(S.speedMph<1.2 && _lastCamPos && distM(_lastCamPos,cp)<3){ return; }
    _lastCamPos={lat:cp.lat,lng:cp.lng};
    var raw=Math.min(1600,Math.max(300,lastFixT?now-lastFixT:800));
    _camDur = _camDur ? (_camDur*0.7 + raw*0.3) : raw;    // rolling average — steady velocity
    const dur=Math.round(_camDur);
    lastFixT=now;
    map.easeTo({center:[cp.lng,cp.lat],
      zoom:speedZoom(),pitch:S.saver?0:60,   // auto speed-zoom; saver = flat 2D
      bearing:(S.headingUp&&S.course!==null)?S.course:map.getBearing(),
      offset:[0,map.getContainer().clientHeight*0.18],
      duration:dur,easing:t=>t,essential:true});
    return;
  }
  if(now-lastFollow<900) return; lastFollow=now;
  const opts={center:[cp.lng,cp.lat],duration:S.saver?0:850,essential:true};
  if(S.headingUp&&S.course!==null)opts.bearing=S.course;
  map.easeTo(opts);
}

/* ═══════════ geo utils ═══════════ */
function distM(a,b){const R=6371000,r=Math.PI/180,dLa=(b.lat-a.lat)*r,dLo=(b.lng-a.lng)*r;const s=Math.sin(dLa/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(s));}
function bearing(a,b){const r=Math.PI/180,y=Math.sin((b.lng-a.lng)*r)*Math.cos(b.lat*r),x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos((b.lng-a.lng)*r);return (Math.atan2(y,x)*180/Math.PI+360)%360;}
// project a lng/lat point onto a segment (local equirectangular meters) → nearest point on the segment
function _projPointToSeg(plng,plat,alng,alat,blng,blat){
  const latRef=(alat+blat)/2, mLat=111320, mLng=111320*Math.cos(latRef*Math.PI/180);
  const ax=alng*mLng, ay=alat*mLat, bx=blng*mLng, by=blat*mLat, px=plng*mLng, py=plat*mLat;
  const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
  let t = len2>0 ? ((px-ax)*dx+(py-ay)*dy)/len2 : 0;
  t=Math.max(0,Math.min(1,t));
  return { lng:(ax+t*dx)/mLng, lat:(ay+t*dy)/mLat };
}
// nearest point on the active route to pt → {lat,lng,dist(m),bearing(deg down-route)}
function snapToRoute(pt){
  const co = S.route && S.route.geometry && S.route.geometry.coordinates;
  if(!co || co.length<2) return null;
  // Score each segment by distance, but on divided/parallel roads several segments are
  // near — so add a penalty when a segment's heading disagrees with the driver's course.
  // This keeps the snap on YOUR carriageway instead of the oncoming one, which is what
  // used to fake a ~180° heading divergence and trigger a false "off route".
  const hasCourse = (S.course!==null && !isNaN(S.course) && (S.speedMph||0)>4);
  let best=null;
  for(let i=0;i<co.length-1;i++){
    const a=co[i], b=co[i+1];
    const q=_projPointToSeg(pt.lng,pt.lat,a[0],a[1],b[0],b[1]);
    const d=distM(q,pt);
    let score=d;
    if(hasCourse){
      const segB=bearing({lat:a[1],lng:a[0]},{lat:b[1],lng:b[0]});
      const hd=Math.abs(((S.course-segB+540)%360)-180);   // 0=same way, 180=opposite
      // only nudge, don't override: up to ~25m of penalty for a fully-opposed segment
      score += (hd/180)*25;
    }
    if(!best||score<best.score){ best={score:score,dist:d,lat:q.lat,lng:q.lng,a:a,b:b}; }
  }
  if(best){ best.bearing=bearing({lat:best.a[1],lng:best.a[0]},{lat:best.b[1],lng:best.b[0]}); }
  return best;
}
function fmtDist(m){
  if(S.units==="km")return m>=1000?(m/1000).toFixed(1)+" km":Math.max(10,Math.round(m/10)*10)+" m";
  return m>=400?(m/1609.34).toFixed(1)+" mi":Math.max(10,Math.round((m*3.28084)/10)*10)+" ft";
}
function fmtDur(s){
  const m=Math.round(s/60);
  if(m<60) return `${Math.max(1,m)} min`;
  if(m<1440){ const h=Math.floor(m/60),mm=m%60; return mm?`${h} hr ${mm} min`:`${h} hr`; }
  const d=Math.floor(m/1440),h=Math.floor((m%1440)/60); return h?`${d} day${d>1?'s':''} ${h} hr`:`${d} day${d>1?'s':''}`;
}
function setMode(m){S.mode=m;document.querySelectorAll(".mode").forEach(x=>x.classList.toggle("on",x.dataset.mode===m));}
function rushFactor(){const h=new Date().getHours()+new Date().getMinutes()/60;return (S.mode==="car"&&((h>=7&&h<=9)||(h>=16&&h<=18.5)))?1.13:1;}

/* ═══════════ live address autocomplete (debounced + cached + aborted) ═══════════ */
const acCache=new Map(); let acAbort=null, acTimer=null;
$("search").addEventListener("input",()=>{
  const q=$("search").value.trim();
  clearTimeout(acTimer);
  if(q.length<3){showRecentsPanel();return;}
  acTimer=setTimeout(()=>suggest(q),190);
});
$("search").addEventListener("focus",()=>{ if(!$("search").value.trim()) showRecentsPanel(); });
function offlineMatches(q){
  const ql=q.trim().toLowerCase();const out=[];
  try{const c=JSON.parse(localStorage.getItem("cw_geo")||"{}");
    for(const k in c){if(k.includes(ql)){out.push({name:c[k].label.split(",")[0],label:c[k].label,lat:c[k].lat,lng:c[k].lng});}}
  }catch{}
  try{const qn=_normPlace(q);(QK.recents||[]).forEach(r=>{const rn=_normPlace(r.name);
    if(rn&&qn&&(rn.includes(qn)||qn.includes(rn)))out.push({name:r.name,label:"Recent",lat:r.lat,lng:r.lng});});}catch{}
  // Discover results the patch layer already cached are real places with real coordinates —
  // offline they are just as navigable as a past geocode, and were being ignored.
  try{const p=JSON.parse(localStorage.getItem("cw_poi")||"{}");
    for(const pk in p){ const els=(p[pk]&&p[pk].els)||[];
      for(let i=0;i<els.length;i++){ const e=els[i];
        if(e&&e.name&&e.name.toLowerCase().includes(ql)&&isFinite(e.lat)&&isFinite(e.lng))
          out.push({name:e.name,label:"Nearby (saved)",lat:e.lat,lng:e.lng}); } }
  }catch{}
  if(QK.home&&"home".includes(ql))out.push({name:"Home",label:"Saved",lat:QK.home.lat,lng:QK.home.lng});
  if(QK.work&&"work".includes(ql))out.push({name:"Work",label:"Saved",lat:QK.work.lat,lng:QK.work.lng});
  return out.slice(0,8);
}
// Overture POI layer for the typeahead — same proxy as full search (apostrophe retry
// happens server-side). Quota guards: needs a fix, needs 4+ chars, aborts on new keystroke.
async function fsqSuggest(q, signal){
  if(!CW_CONFIG.fsqProxy || !S.pos || q.trim().length<4) return [];
  try{
    var u=CW_CONFIG.fsqProxy+"?q="+encodeURIComponent(q)
      +"&lat="+S.pos.lat+"&lon="+S.pos.lng+"&radius_mi=25&limit=10";
    var d=await (await fetch(u,{signal})).json();
    return ((d&&d.results)||[]).map(function(p){
      var a=p.address||{};
      return { name:p.name, label:[a.street,a.locality].filter(Boolean).join(", "), lat:p.lat, lng:p.lon, cc:a.country_code };
    }).filter(function(r){ return isFinite(r.lat)&&isFinite(r.lng)&&r.name&&_sameCountry(r.cc); });
  }catch(e){ if(e.name==="AbortError") throw e; return []; }
}
async function overtureSuggest(q, signal){
  if(!CW_CONFIG.placesProxy || !S.pos || q.trim().length<4) return [];
  try{
    var u=CW_CONFIG.placesProxy+"?q="+encodeURIComponent(q)
      +"&lat="+S.pos.lat+"&lon="+S.pos.lng+"&radius_mi=45&mode=name&limit=10";
    var d=await (await fetch(u,{signal})).json();
    return ((d&&d.results)||[]).map(function(p){
      var a=p.address||{};
      return { name:p.name, label:[a.street,a.locality].filter(Boolean).join(", "), lat:p.lat, lng:p.lon };
    }).filter(function(r){ return isFinite(r.lat)&&isFinite(r.lng)&&r.name; });
  }catch(e){ if(e.name==="AbortError") throw e; return []; }
}
// Collapse the same place arriving from Overture + OSM (within ~150m, name-similar).
// Keep the first (Overture is concatenated first = preferred name), upgrade to the longer label.
function dedupeSuggest(list){
  var out=[];
  var nm=function(s){ return String(s||"").toLowerCase().replace(/['\u2019]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim(); };
  list.forEach(function(r){
    var rn=nm(r.name);
    for(var i=0;i<out.length;i++){
      var k=out[i];
      if(isFinite(r.lat)&&isFinite(k.lat)&&distM({lat:r.lat,lng:r.lng},{lat:k.lat,lng:k.lng})<=150){
        var kn=nm(k.name);
        if(rn&&kn&&(rn===kn||rn.indexOf(kn)>-1||kn.indexOf(rn)>-1)){
          if(String(r.label||"").length>String(k.label||"").length) k.label=r.label;
          return;
        }
      }
    }
    out.push(r);
  });
  return out;
}
async function suggest(q){
  if(!navigator.onLine){
    var base=offlineMatches(q);
    renderResults(base);
    // the index may still be loading on the first offline search; repaint when it lands
    loadPoiIndex().then(function(idx){
      if(!idx) return;
      var extra=searchPoiIndex(q,6).map(function(p){
        return {name:p.name,label:(POI_CAT_ICON[p.cat]||"\uD83D\uDCCD")+" Offline map",lat:p.lat,lng:p.lng};
      });
      if(extra.length) renderResults(base.concat(extra));
    });
    return;
  }
  if(acCache.has(q)){renderResults(acCache.get(q));return;}
  if(acAbort) acAbort.abort();
  acAbort=new AbortController();
  const sig=acAbort.signal;
  // Overture POI search runs alongside OSM (kicked off now, awaited below).
  const ovP=overtureSuggest(q,sig);
  let items=[];
  try{
    let u=`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
    if(S.pos)u+=`&lat=${S.pos.lat}&lon=${S.pos.lng}`;
    const d=await (await fetch(u,{signal:sig})).json();
    items=(d.features||[]).map(f=>{
      const p=f.properties,co=f.geometry.coordinates;
      const name=[p.name||p.street,p.housenumber].filter(Boolean).join(" ")||p.street||p.city||"Unnamed place";
      const label=[p.street&&p.name&&p.name!==p.street?p.street:null,p.city||p.town||p.village,p.state].filter(Boolean).join(", ");
      return {name,label,lat:co[1],lng:co[0]};
    });
  }catch(e){ if(e.name==="AbortError")return; }
  if(!items.length){
    try{
      let url=`https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(q)}`;
      if(S.pos){const d2=0.15;url+=`&viewbox=${S.pos.lng-d2},${S.pos.lat+d2},${S.pos.lng+d2},${S.pos.lat-d2}&bounded=0`;}
      const list=await (await fetch(url,{signal:sig,headers:{Accept:"application/json"}})).json();
      items=(list||[]).map(r=>({name:r.display_name.split(",")[0],label:r.display_name.split(",").slice(1,4).join(",").trim(),lat:+r.lat,lng:+r.lon}));
    }catch(e){ if(e.name==="AbortError")return; }
  }
  // Merge Overture POIs ahead of OSM, then collapse cross-source duplicates.
  let ov=[]; try{ ov=await ovP; }catch(e){ if(e.name==="AbortError")return; }
  let all=dedupeSuggest(ov.concat(items));
  // Rank apostrophe-insensitively (so "hamiltons" credits "Hamilton's"), then by distance.
  const strip=s=>String(s||"").toLowerCase().replace(/['\u2019]/g,"");
  const toks=strip(q).split(/\s+/).filter(w=>w.length>1);
  all=all.map(r=>{ const lbl=strip((r.name||"")+" "+(r.label||"")); const nm=toks.filter(t=>lbl.indexOf(t)>-1).length; return {...r,_d:S.pos?distM(S.pos,r):0,_n:nm}; })
    .sort((a,b)=>(b._n-a._n)||(a._d-b._d));
  // Only cache when position was available (so an Overture-capable, distance-ranked
  // result is what gets stored). Caching a pre-GPS-lock result would poison this query
  // for the whole session — every retype would serve the OSM-only list.
  if(S.pos){ acCache.set(q,all); if(acCache.size>60) acCache.delete(acCache.keys().next().value); }
  /* Merge in fuzzy hits from this phone's own history. A typo the geocoder cannot resolve is
     usually a place the driver has already been. */
  try{
    var fz=localFuzzyMatches(q,4);
    if(fz.length){
      var have={};
      all.forEach(function(r){ have[_normPlace(r.name)]=1; });
      var add=fz.filter(function(f){ return !have[_normPlace(f.name)]; });
      if(add.length) all=add.concat(all);
    }
  }catch(e){}
  renderResults(all);
}
/* Every test here was a bare substring, so brand and category words matched inside unrelated
   names: "mobil" inside T-Mobile (the reported bug), "gas" inside Vegas, "inn" inside Dinner
   and Winner, "mall" inside Small, "bp" inside anything. Word boundaries throughout, and
   phone carriers get their own category since that's what T-Mobile actually is. Order still
   matters — the most specific test has to come first. */
function poiIcon(r){
  const s=((r.name||"")+" "+(r.label||"")).toLowerCase();
  if(/\bhome\b/.test(s))return["🏠","#3AA0FF"];
  if(/\b(work|office)\b/.test(s))return["💼","#2B6FE0"];
  if(/\b(t-?mobile|verizon|at&t|sprint|cricket wireless|boost mobile|xfinity|phone|wireless)\b/.test(s))return["📱","#E0219A"];
  if(/\b(coffee|cafe|caf\u00e9|starbucks|dunkin|espresso)\b/.test(s))return["☕","#B5651D"];
  if(/\b(gas|fuel|shell|marathon|bp|sunoco|mobil|exxon|chevron|citgo|speedway)\b/.test(s))return["⛽","#E8A020"];
  if(/\b(restaurant|grill|pizza|food|kitchen|diner|bbq|taco|sushi|deli)\b/.test(s))return["🍽","#E0602B"];
  if(/\b(hotel|motel|inn|suites|lodge|hostel)\b/.test(s))return["🛎","#8A5CF6"];
  if(/\b(hospital|clinic|medical|pharmacy|urgent care|dentist)\b/.test(s))return["➕","#E5484D"];
  if(/\b(park|trail|garden|greenway|preserve)\b/.test(s))return["🌳","#2F9E5B"];
  if(/\b(store|shop|mall|market|target|walmart|kroger|meijer|costco)\b/.test(s))return["🛍","#D0459B"];
  if(/\b(school|college|university|academy|library)\b/.test(s))return["🎓","#3B82F6"];
  if(/\b(bank|credit union|atm)\b/.test(s))return["🏦","#2FA37A"];
  return["📍","#FF4B6E"];
}


/* ═══════════ your own history is the best spellchecker ═══════════
   v224 ranked what the geocoder returned. It cannot rescue "Summerset mall", because the
   geocoder never returns Somerset Mall for that string — no amount of re-sorting an empty set
   helps. But the phone already knows the answer: Somerset Mall is sitting in this driver's
   recents. Nobody has a better dictionary of the places THIS person searches for than the list
   of places they have already searched for.

   So every online search also runs a fuzzy pass over recents, saved places, past geocodes and
   the Discover cache, and injects anything close to the top. Costs nothing — it is a few
   hundred strings in localStorage — and it fixes the typo case the network cannot. */
function localFuzzyMatches(q, limit){
  var s=_normPlace(q); if(!s||s.length<3) return [];
  var out=[], seen={};
  function consider(name,lat,lng,tag){
    if(!isFinite(lat)||!isFinite(lng)) return;
    var score=_nameScore(name,q);
    if(score>=90) return;
    var k=_normPlace(name)+"|"+(+lat).toFixed(3);
    if(seen[k]) return; seen[k]=1;
    out.push({name:name,label:tag,lat:+lat,lng:+lng,_fz:score,
              _d:S.pos?distM(S.pos,{lat:+lat,lng:+lng}):0});
  }
  try{ (QK.recents||[]).forEach(function(r){ consider(r.name,r.lat,r.lng,"Recent"); }); }catch(e){}
  try{ (QK.favorites||[]).forEach(function(r){ consider(r.name,r.lat,r.lng,"Saved"); }); }catch(e){}
  try{ if(QK.home) consider("Home",QK.home.lat,QK.home.lng,"Saved");
       if(QK.work) consider("Work",QK.work.lat,QK.work.lng,"Saved"); }catch(e){}
  try{ var c=JSON.parse(localStorage.getItem("cw_geo")||"{}");
    for(var k in c){ var v=c[k]; consider(v.label||k, v.lat, v.lng, "Searched before"); }
  }catch(e){}
  try{ var p=JSON.parse(localStorage.getItem("cw_poi")||"{}");
    for(var pk in p){ var els=(p[pk]&&p[pk].els)||[];
      for(var i=0;i<els.length;i++) consider(els[i].name, els[i].lat, els[i].lng, "Nearby"); }
  }catch(e){}
  out.sort(function(a,b){ return (a._fz-b._fz)||(a._d-b._d); });
  return out.slice(0, limit||4);
}

/* ═══════════ typo-tolerant, distance-aware result ranking ═══════════
   A driver searching "Zerbis" for Zerbo's got a list of villages in Lombardy, Corsica and
   Slovakia — every one of them a better *string* match than the local store, and every one of
   them four thousand miles away. Two things were missing: the geocoder ranks by name similarity
   with no idea that this is a driving app, and an exact-substring test cannot survive a single
   wrong letter.

   So: score every candidate on how close the name is (allowing for typos) AND how far away it
   is, and let distance dominate. Nothing 4000 miles away outranks something down the road. */

/* Levenshtein, capped early — we only care whether a name is within a couple of edits, so the
   moment the distance exceeds the cap we can stop instead of filling the whole matrix. */
function _edit(a,b,cap){
  a=a||""; b=b||"";
  if(a===b) return 0;
  var la=a.length, lb=b.length;
  if(Math.abs(la-lb)>cap) return cap+1;
  var prev=new Array(lb+1), cur=new Array(lb+1), i, j;
  for(j=0;j<=lb;j++) prev[j]=j;
  for(i=1;i<=la;i++){
    cur[0]=i; var best=cur[0];
    for(j=1;j<=lb;j++){
      var cost=(a.charCodeAt(i-1)===b.charCodeAt(j-1))?0:1;
      cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost);
      if(cur[j]<best) best=cur[j];
    }
    if(best>cap) return cap+1;                    // whole row already past the cap
    var t=prev; prev=cur; cur=t;
  }
  return prev[lb];
}

/* How well does this name answer the query, typos included? 0 is perfect. */
function _nameScore(name,q){
  var n=_normPlace(name), s=_normPlace(q);
  if(!n||!s) return 99;
  if(n===s) return 0;
  if(n.indexOf(s)===0) return 1;                  // "zerbos health foods" for "zerbos"
  if(n.indexOf(s)!==-1) return 2;
  // typo tolerance scales with word length: 1 edit for short words, 2 for longer ones
  /* 6 characters is enough context that two edits are still almost certainly the same word —
     "zerbis" vs "zerbo" is two edits and obviously the same place to a human. */
  /* Multi-word queries were compared whole against single stored words, so "moms spaghetti"
     could never fuzzy-match the word "spaghetti". Match token by token instead: every word the
     driver typed has to find a home in the name, allowing for typos in each. */
  var qw=s.split(" ").filter(Boolean), nw=n.split(" ").filter(Boolean);
  if(qw.length>1){
    var total=0, matched=0;
    for(var q=0;q<qw.length;q++){
      var t=qw[q], tcap = t.length>=6 ? 2 : (t.length>=4 ? 1 : 0), best=99;
      for(var w=0;w<nw.length;w++){
        if(nw[w]===t){ best=0; break; }
        if(nw[w].indexOf(t)===0){ best=Math.min(best,1); continue; }
        if(tcap){ var dd=_edit(nw[w],t,tcap); if(dd<=tcap) best=Math.min(best,1+dd); }
      }
      if(best<90){ matched++; total+=best; }
    }
    if(matched===qw.length) return 2+Math.min(3,total);   // every word found
    if(matched>=qw.length-0 && qw.length>2 && matched>=qw.length-1) return 4;
    return 99;
  }
  var cap = s.length>=6 ? 2 : (s.length>=4 ? 1 : 0);
  if(cap){
    var words=n.split(" ");
    for(var i=0;i<words.length;i++){
      var d=_edit(words[i],s,cap);
      if(d<=cap) return 2+d;                      // "zerbis" -> "zerbos" lands here
    }
    if(_edit(n.slice(0,s.length+2),s,cap)<=cap) return 3;
  }
  return 99;
}

/* Distance is not a tiebreak in a car — it is most of the answer. */
function smartRank(list,q){
  if(!list||!list.length) return list||[];
  var here=S.pos;
  var scored=list.map(function(r,i){
    var d = (here&&isFinite(r.lat)) ? distM(here,{lat:+r.lat,lng:+r.lng})/1609.34 : 9999;
    var ns=_nameScore(r.name||r.label||"",q);
    /* Distance bands rather than raw miles, so a place 3 miles away and one 8 miles away are treated
       as equally "here" and sorted by name quality instead. */
    var band = d<25 ? 0 : d<75 ? 1 : d<200 ? 3 : d<1000 ? 8 : 14;
    return {r:r, i:i, score: band*2 + ns, d:d};
  });
  /* If anything sane is within driving range, drop the far-flung noise entirely. Somebody in
     Detroit typing a store name does not want a hamlet in Emilia-Romagna. */
  var near=scored.filter(function(x){ return x.d<200 && x.score<90; });
  var use = near.length ? near : scored.filter(function(x){ return x.score<90; });
  if(!use.length) use=scored;
  use.sort(function(a,b){ return (a.score-b.score) || (a.d-b.d) || (a.i-b.i); });
  return use.map(function(x){ return x.r; });
}

function renderResults(list){
  const box=$("results"); box.innerHTML="";
  const q=$("search").value.trim();
  try{ if(q) list=smartRank(list,q); }catch(e){}
  if(!list||!list.length){
    if(q.length<3){box.style.display="none";return;}
    const div=document.createElement("div");div.className="result ricon";
    div.innerHTML=`<span class="pin" style="background:#2B6FE0">📍</span><span class="rtext"><b>Approximate "${q.slice(0,22)}"</b><small>Drop a pin at the best match</small></span>`;
    div.onclick=(e)=>{e.stopPropagation();forceGeocode(q);};
    box.appendChild(div);box.style.display="block";return;
  }
  list.forEach(r=>{
    const div=document.createElement("div"); div.className="result ricon";
    const near=r._d!==undefined?fmtDist(r._d)+" away":"";
    const ic=poiIcon(r);
    div.innerHTML=`<span class="pin" style="background:${ic[1]}">${ic[0]}</span>
      <span class="rtext"><b>${r.name}</b><small class="rmeta" data-lat="${r.lat}" data-lng="${r.lng}">${[near,r.label].filter(Boolean).join(" · ")}</small></span>
      <button class="addstop">+Stop</button>`;
    div.onclick=(e)=>{if(e.target.classList.contains("addstop"))return;box.style.display="none";$("search").value=r.name;
      confirmDestination({lat:r.lat,lng:r.lng,label:[r.name,r.label].filter(Boolean).join(", ")},r.name);};
    div.querySelector(".addstop").onclick=(e)=>{e.stopPropagation();addStop({lat:r.lat,lng:r.lng},r.name);};
    box.appendChild(div);
  });
  const q2=$("search").value.trim();
  if(q2.length>=3){
    const ap=document.createElement("div");ap.className="result ricon";
    ap.innerHTML=`<span class="pin" style="background:#2B6FE0">✎</span><span class="rtext"><b>Use "${q2.slice(0,20)}" as typed</b><small>Force an exact-match search</small></span>`;
    ap.onclick=(e)=>{e.stopPropagation();forceGeocode(q2);};
    box.appendChild(ap);
  }
  box.style.display="block";
  try{ upgradeResultDistances(list); }catch(e){}
}

/* ═══════════ road distance with layered fallback ═══════════
   Detroit signal gets ugly on game/concert nights, so this degrades instead of failing:
     1. race TWO routing servers, take whichever answers first
     2. if both are slow/busy → fall back to a calibrated estimate (marked with ~)
     3. cache every answer so repeat searches are instant and offline-friendly
*/
let _roadCache={}; try{ _roadCache=JSON.parse(localStorage.getItem("cw_roadcache")||"{}")||{}; }catch(e){ _roadCache={}; }
function _rcKey(a,b){ return a.lat.toFixed(4)+","+a.lng.toFixed(4)+">"+(+b.lat).toFixed(4)+","+(+b.lng).toFixed(4); }
function _rcSave(){ try{
  const k=Object.keys(_roadCache);
  if(k.length>400){ k.slice(0,k.length-400).forEach(x=>delete _roadCache[x]); }
  localStorage.setItem("cw_roadcache",JSON.stringify(_roadCache));
}catch(e){} }
// urban roads are rarely straight: this factor turns crow-flies into a realistic drive estimate
function estimateDrive(meters){
  const m=meters*1.32;                                  // typical street-grid detour
  const mph = m<1600?22 : m<8000?31 : 45;               // slower in town, faster on longer hauls
  return { m:m, sec:(m/1609.34)/mph*3600, est:true };
}
async function roadTable(origin,pts,signal){
  if(!origin||!pts||!pts.length) return null;
  const coords=[`${origin.lng},${origin.lat}`].concat(pts.map(p=>`${p.lng},${p.lat}`)).join(";");
  const q=`table/v1/driving/${coords}?sources=0&annotations=duration,distance`;
  const urls=[`https://router.project-osrm.org/${q}`,`https://routing.openstreetmap.de/routed-car/${q}`];
  const one=(u)=>{
    const ac=new AbortController();
    const timer=setTimeout(()=>{try{ac.abort();}catch(e){}},4500);       // don't hang on bad signal
    if(signal){ try{ signal.addEventListener("abort",()=>{try{ac.abort();}catch(e){}}); }catch(e){} }
    return fetch(u,{signal:ac.signal}).then(r=>{clearTimeout(timer); if(!r.ok) throw 0; return r.json();})
      .then(d=>{ if(d&&d.code==="Ok"&&d.distances&&d.distances[0]) return d; throw 0; });
  };
  try{
    const tasks=urls.map(one);
    return Promise.any ? await Promise.any(tasks)
      : await new Promise((res,rej)=>{let n=tasks.length;tasks.forEach(p=>p.then(res).catch(()=>{if(--n===0)rej(0);}));});
  }catch(e){ return null; }
}
// returns [{m,sec,est}] for each point — always returns something usable
async function roadDistances(origin,pts,signal){
  const out=new Array(pts.length).fill(null);
  const need=[], needIdx=[];
  pts.forEach((p,i)=>{
    const c=_roadCache[_rcKey(origin,p)];
    if(c && Date.now()-c.t < 7*86400000){ out[i]={m:c.m,sec:c.sec,est:!!c.est}; }
    else { need.push(p); needIdx.push(i); }
  });
  if(need.length && navigator.onLine){
    const d=await roadTable(origin,need,signal);
    if(d){
      const dist=d.distances[0], dur=(d.durations&&d.durations[0])||[];
      need.forEach((p,j)=>{
        const m=dist[j+1], sec=dur[j+1];
        if(m!=null&&isFinite(m)){
          out[needIdx[j]]={m:m,sec:(isFinite(sec)?sec:null),est:false};
          _roadCache[_rcKey(origin,p)]={m:m,sec:(isFinite(sec)?sec:null),est:false,t:Date.now()};
        }
      });
      _rcSave();
    }
  }
  // anything still missing → calibrated estimate so the user always sees a number
  pts.forEach((p,i)=>{ if(!out[i]){ const e=estimateDrive(distM(origin,{lat:+p.lat,lng:+p.lng})); out[i]={m:e.m,sec:e.sec,est:true}; } });
  return out;
}
function fmtDrive(r){
  if(!r) return "";
  const d=fmtDist(r.m), t=(r.sec!=null&&isFinite(r.sec))?fmtDur(r.sec*rushFactor())+" drive":"";
  const s=[d,t].filter(Boolean).join(" · ");
  return r.est ? "~ "+s : s;
}

/* ═══════════ real driving distance + time for search results ═══════════
   Straight-line distance misleads (a place "0.5 mi away" can be a 2 mi drive around a river or
   freeway). OSRM's table service measures road distance from you to EVERY result in ONE request,
   so the list shows what the drive actually costs without hammering the routing server. */
let _distAbort=null;
async function upgradeResultDistances(list){
  if(!S.pos||!list||!list.length) return;
  const pts=list.slice(0,8).filter(r=>isFinite(r.lat)&&isFinite(r.lng));
  if(!pts.length) return;
  if(_distAbort){ try{_distAbort.abort();}catch(e){} }
  _distAbort=new AbortController();
  const res=await roadDistances(S.pos,pts,_distAbort.signal);
  const box=$("results"); if(!box||box.style.display==="none") return;
  const metas=box.querySelectorAll(".rmeta");
  pts.forEach((r,i)=>{
    const info=res[i]; if(!info) return;
    for(const el of metas){
      if(Math.abs(parseFloat(el.dataset.lat)-r.lat)<1e-6 && Math.abs(parseFloat(el.dataset.lng)-r.lng)<1e-6){
        el.textContent=[fmtDrive(info), r.label].filter(Boolean).join(" · ");
        break;
      }
    }
  });
}

// same road-distance upgrade for the Discover list (Gas / Food / Coffee ...)
let _poiDistAbort=null;
async function upgradePoiDistances(els){
  if(!S.pos||!els||!els.length) return;
  const pts=els.slice(0,10).filter(e=>isFinite(e.lat)&&isFinite(e.lng));
  if(!pts.length) return;
  if(_poiDistAbort){ try{_poiDistAbort.abort();}catch(e){} }
  _poiDistAbort=new AbortController();
  const res=await roadDistances(S.pos,pts,_poiDistAbort.signal);
  const list=$("poiList"); if(!list) return;
  const metas=list.querySelectorAll(".rmeta");
  pts.forEach((e,i)=>{
    const info=res[i]; if(!info) return;
    for(const el of metas){
      if(Math.abs(parseFloat(el.dataset.lat)-e.lat)<1e-6 && Math.abs(parseFloat(el.dataset.lng)-e.lng)<1e-6){
        el.textContent=[fmtDrive(info), e.hours?e.hours.slice(0,22):""].filter(Boolean).join(" · ");
        break;
      }
    }
  });
}

/* The dock's orange arrow — the "force search" box — went straight to forceGeocode, which is
   the pipeline that keeps returning local matches. My last fix only covered the Search button
   inside the panel, so this one stayed broken. Both routes now go through the same place. */
function doSearch(){const q=$("search").value.trim();if(!q)return;$("results").style.display="none";const cat=poiCategory(q);if(cat){$("search").blur();openCategorySearch(cat);return;}forceGeocode(q);}
$("searchbtn").onclick=doSearch;
$("search").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();doSearch();}});
document.addEventListener("click",e=>{if(!$("searchwrap").contains(e.target))$("results").style.display="none";});

/* ═══════════ stops & destination ═══════════ */
function addStop(latlng,name){
  S.stops.push({...latlng,name});
  const el=document.createElement("div");el.className="stopdot";el.textContent=S.stops.length;
  stopMarkers.push(new maplibregl.Marker({element:el}).setLngLat([latlng.lng,latlng.lat]).addTo(map));
  toast(`Stop ${S.stops.length} added: ${name}`);
  if(S.dest) fetchRoute();
}
function clearStops(){S.stops=[];stopMarkers.forEach(m=>m.remove());stopMarkers.length=0;}
function setDestination(latlng,name){
  try{clearPoiMarkers();}catch(e){}
  try{clearStops();}catch(e){}                                   // drop leftover waypoints from the last trip
  S.route=null; S.steps=[]; S.stepIdx=0;                         // forget the old route entirely
  try{map.getSource("route").setData({type:"FeatureCollection",features:[]});}catch(e){}  // wipe the old line immediately
  S.dest=latlng;S.destName=name||"Destination";
  if(!latlng||!latlng._keepLabel) S.destLabel=S.destLabel||"";
  if(name&&!["Home","Work","My parked car"].includes(name)){
    QK.recents=[{lat:latlng.lat,lng:latlng.lng,name},...(QK.recents||[]).filter(r=>r.name!==name)].slice(0,6);
    saveQK();renderQuick();
try{if($("tripCount")&&TRIPS.length)$("tripCount").textContent=TRIPS.length+" drives logged";}catch{}
  }
  try{ learnVisit(name,latlng); }catch(e){}   // on-device pattern learning (frequency + time of day)
  if(destMarker)destMarker.remove();
  const el=document.createElement("div");el.className="dest-flag";el.textContent=(typeof seasonActive==="function"&&seasonActive())?"🎃":"🏁";
  destMarker=new maplibregl.Marker({element:el,anchor:"bottom"}).setLngLat([latlng.lng,latlng.lat]).addTo(map);
  if(!S.pos){toast("Waiting for GPS… if stuck, allow Location in browser settings…");map.easeTo({center:[latlng.lng,latlng.lat],zoom:15});return;}
  fetchRoute();
}

/* ═══════════ routing (OSRM multi-stop, multi-modal) ═══════════ */
/* ═══════════ v22: parallel-racing network layer ═══════════ */
// fetch with an abort timeout; rejects if it doesn't answer in `ms`
function fetchT(url,ms){
  ms=ms||6000;
  const ac=new AbortController();
  const t=setTimeout(()=>ac.abort(),ms);
  return fetch(url,{signal:ac.signal}).finally(()=>clearTimeout(t));
}
// race several url->json fetches; resolve with the FIRST that passes `ok(json)`
/* Resolve with the BEST result rather than the first. Waits for the first success, then gives
   the remaining requests a short grace period, and returns the lowest-duration route among
   whatever arrived. Falls back to first-wins behaviour if nothing else lands in time. */
async function raceBestRoute(urls,ok,ms,graceMs){
  ok=ok||(()=>true); graceMs=graceMs||1200;
  const results=[];
  const tasks=urls.map(u=>fetchT(u,ms).then(r=>r.json()).then(d=>{ if(!ok(d)) throw new Error("reject"); results.push(d); return d; }));
  const settled=Promise.allSettled(tasks);
  const first=await Promise.any(tasks);                    // throws only if every request failed
  await Promise.race([settled,new Promise(r=>setTimeout(r,graceMs))]);
  const dur=d=>{ try{ return d.routes[0].duration; }catch(e){ return Infinity; } };
  let best=first;
  results.forEach(function(d){ if(dur(d)<dur(best)) best=d; });
  return best;
}
async function raceJSON(urls,ok,ms){
  ok=ok||(()=>true);
  const tasks=urls.map(u=>fetchT(u,ms).then(r=>r.json()).then(d=>{ if(ok(d))return d; throw new Error("reject"); }));
  // Promise.any resolves on first fulfilled; falls through to all-failed
  if(Promise.any){ return await Promise.any(tasks); }
  // fallback for older engines
  return await new Promise((res,rej)=>{ let n=tasks.length; tasks.forEach(p=>p.then(res).catch(()=>{ if(--n===0)rej(new Error("all failed")); })); });
}

async function osrmFetch(coordsStr,alt){
  const q=`${coordsStr}?overview=full&geometries=geojson&steps=true${alt?"&alternatives=3":""}`;
  const primary=`https://routing.openstreetmap.de/${PROFILES[S.mode]}/${q}`;
  const isOk=d=>d&&d.code==="Ok";
  // car mode: race both public servers, take whichever answers first
  if(S.mode==="car"){
    const backup=`https://router.project-osrm.org/route/v1/driving/${q}`;
    try{ return await raceBestRoute([primary,backup],isOk,6000,1200); }
    catch{ /* both failed/timed out — one last try on primary, longer window */
      try{ return await (await fetchT(primary,9000)).json(); }catch{ return {code:"Error"}; }
    }
  }
  // bike/foot: only the .de server has the right profile — timeout then retry once
  try{ const d=await (await fetchT(primary,6000)).json(); if(isOk(d))return d; throw 0; }
  catch{ try{ return await (await fetchT(primary,9000)).json(); }catch{ return {code:"Error"}; } }
}
/* ═══════════ Valhalla routing (toll/highway avoidance) — keyless FOSSGIS instance, OSRM fallback ═══════════ */
function _decodePolyline(str, precision){
  let index=0,lat=0,lng=0,coords=[],shift,result,byte,factor=Math.pow(10,precision||6);
  while(index<str.length){
    shift=0;result=0;
    do{ byte=str.charCodeAt(index++)-63; result|=(byte&0x1f)<<shift; shift+=5; }while(byte>=0x20);
    lat += ((result&1)?~(result>>1):(result>>1));
    shift=0;result=0;
    do{ byte=str.charCodeAt(index++)-63; result|=(byte&0x1f)<<shift; shift+=5; }while(byte>=0x20);
    lng += ((result&1)?~(result>>1):(result>>1));
    coords.push([lng/factor, lat/factor]);   // [lng,lat] for geojson
  }
  return coords;
}
// Valhalla maneuver-type integer → OSRM {type, modifier, exit}
function _vMan(t, roundExit){
  switch(t){
    case 1: return {type:"depart"};
    case 2: return {type:"depart",modifier:"right"};
    case 3: return {type:"depart",modifier:"left"};
    case 4: return {type:"arrive"};
    case 5: return {type:"arrive",modifier:"right"};
    case 6: return {type:"arrive",modifier:"left"};
    case 7: return {type:"new name"};
    case 8: return {type:"continue",modifier:"straight"};
    case 9: return {type:"turn",modifier:"slight right"};
    case 10:return {type:"turn",modifier:"right"};
    case 11:return {type:"turn",modifier:"sharp right"};
    case 12:return {type:"turn",modifier:"uturn"};
    case 13:return {type:"turn",modifier:"uturn"};
    case 14:return {type:"turn",modifier:"sharp left"};
    case 15:return {type:"turn",modifier:"left"};
    case 16:return {type:"turn",modifier:"slight left"};
    case 17:return {type:"on ramp",modifier:"straight"};
    case 18:return {type:"on ramp",modifier:"right"};
    case 19:return {type:"on ramp",modifier:"left"};
    case 20:return {type:"off ramp",modifier:"right"};
    case 21:return {type:"off ramp",modifier:"left"};
    case 22:return {type:"fork",modifier:"straight"};
    case 23:return {type:"fork",modifier:"right"};
    case 24:return {type:"fork",modifier:"left"};
    case 25:return {type:"merge",modifier:"straight"};
    case 37:return {type:"merge",modifier:"right"};
    case 38:return {type:"merge",modifier:"left"};
    case 26:return {type:"roundabout",exit:roundExit||1};
    default:return {type:"continue",modifier:"straight"};
  }
}
// translate a Valhalla /route response into the OSRM shape the rest of the app expects
function valhallaToOSRM(vt){
  if(!vt||!vt.trip||!vt.trip.legs||!vt.trip.legs.length) return {code:"Error"};
  let legs=[], allCoords=[];
  vt.trip.legs.forEach(function(leg){
    const base=allCoords.length;
    const shape=_decodePolyline(leg.shape,6);
    allCoords=allCoords.concat(shape);
    const steps=(leg.maneuvers||[]).map(function(mn){
      const man=_vMan(mn.type, mn.roundabout_exit_count);
      let idx=base+(mn.begin_shape_index||0);
      if(idx>=allCoords.length) idx=allCoords.length-1;
      const loc=allCoords[idx]||allCoords[allCoords.length-1]||[0,0];
      return {
        name:(mn.street_names&&mn.street_names[0])||(mn.begin_street_names&&mn.begin_street_names[0])||"",
        distance:(mn.length||0)*1000,
        duration:(mn.time||0),
        ref:(mn.branch_sign_ref&&mn.branch_sign_ref[0])||"",
        exits:(mn.sign&&mn.sign.exit_number_elements&&mn.sign.exit_number_elements[0]&&mn.sign.exit_number_elements[0].text)||"",
        destinations:(mn.sign&&mn.sign.exit_toward_elements&&mn.sign.exit_toward_elements.map(x=>x.text).join(", "))||"",
        maneuver:{ type:man.type, modifier:man.modifier, exit:man.exit, location:[loc[0],loc[1]] }
      };
    });
    legs.push({steps:steps});
  });
  const dist=((vt.trip.summary&&vt.trip.summary.length)||0)*1000;
  const time=(vt.trip.summary&&vt.trip.summary.time)||0;
  return { code:"Ok", routes:[ { geometry:{type:"LineString",coordinates:allCoords}, legs:legs, distance:dist, duration:time } ] };
}
let _vhDownUntil=0;      // remember when the avoidance router is unreachable
async function valhallaFetch(ptsArr){
  if(Date.now()<_vhDownUntil) throw new Error("valhalla cooling down");
  const body={ locations:ptsArr.map(function(p){return {lat:p.lat,lon:p.lng};}),
    costing:"auto",
    costing_options:{auto:{ use_tolls:S.avoidTolls?0:1, use_highways:S.avoidHwy?0:1, use_ferry:0 }},
    directions_options:{units:"kilometers"} };
  const json=encodeURIComponent(JSON.stringify(body));
  // ONE attempt with a short leash. Chained 9-second retries used to exceed the overall routing
  // budget, so every request timed out before any fallback could run.
  const ac=new AbortController(); const timer=setTimeout(()=>{try{ac.abort();}catch(e){}},4500);
  try{
    const res=await fetch("https://valhalla1.openstreetmap.de/route?json="+json,{signal:ac.signal});
    clearTimeout(timer);
    if(!res.ok) throw new Error("valhalla http "+res.status);
    const out=valhallaToOSRM(await res.json());
    if(out&&out.code==="Ok") return out;
    throw new Error("valhalla bad payload");
  }catch(e){
    clearTimeout(timer);
    _vhDownUntil=Date.now()+10*60*1000;    // stop hammering it for 10 minutes
    throw e;
  }
}
/* ═══════════ highway-avoidance fallback that doesn't need Valhalla ═══════════
   If the avoidance router is unreachable, ask OSRM for several alternative routes and pick the
   one that spends the least distance on freeways. Not as surgical as true avoidance costing,
   but it genuinely gets you off the interstate instead of shrugging. */
function _isHighwayStep(st){
  const ref=String(st.ref||""), nm=String(st.name||"");
  if(/(^|[;,\s])(I|US)[\s-]?\d+/i.test(ref)) return true;
  if(/freeway|expressway|interstate|motorway|turnpike|tollway/i.test(nm)) return true;
  if(/^(motorway|trunk)/i.test(String(st.class||""))) return true;
  return false;
}
// Detroit's only real tolls are the international crossings, plus turnpikes/tollways elsewhere.
// Name matching catches them without needing a paid or unreachable routing service.
function _isTollStep(st){
  const nm=String(st.name||"")+" "+String(st.ref||"")+" "+String(st.destinations||"");
  if(/toll\s*(road|way|plaza|booth)|tollway|turnpike/i.test(nm)) return true;
  if(/ambassador\s+bridge|detroit[-\s]?windsor\s+tunnel|blue\s+water\s+bridge/i.test(nm)) return true;
  if(/\btoll\b/i.test(nm)) return true;
  return false;
}
function _tollRatio(rt){
  try{
    const steps=(rt.legs||[]).flatMap(l=>l.steps||[]);
    if(!steps.length) return 0;
    let tl=0,tot=0;
    steps.forEach(st=>{ const d=st.distance||0; tot+=d; if(_isTollStep(st)) tl+=d; });
    return tot? tl/tot : 0;
  }catch(e){ return 0; }
}
function _highwayRatio(rt){
  try{
    const steps=(rt.legs||[]).flatMap(l=>l.steps||[]);
    if(!steps.length) return 0;
    let hw=0,tot=0;
    steps.forEach(st=>{ const d=st.distance||0; tot+=d; if(_isHighwayStep(st)) hw+=d; });
    return tot? hw/tot : 0;
  }catch(e){ return 0; }
}
// pick whichever alternative uses the least freeway
async function avoidViaAlternatives(coordsStr){
  const data=await Promise.race([ osrmFetch(coordsStr,true),
    new Promise(res=>setTimeout(()=>res(null),6000)) ]);
  if(!data||data.code!=="Ok"||!data.routes||!data.routes.length) return null;
  const wantHwy=!!S.avoidHwy, wantToll=!!S.avoidTolls;
  const scored=data.routes.map(rt=>{
    const hw=_highwayRatio(rt), tl=_tollRatio(rt);
    // weight tolls heavily — a toll is a hard cost, freeway is a preference
    const pen=(wantHwy?hw:0)+(wantToll?tl*3:0);
    return {rt,hw,tl,pen};
  }).sort((a,b)=>a.pen-b.pen);
  const best=scored[0], worst=scored[scored.length-1];
  if(!best) return null;
  const clean = (!wantHwy||best.hw<0.05) && (!wantToll||best.tl<0.01);
  return { data:{code:"Ok",routes:[best.rt]}, ratio:best.hw, toll:best.tl,
           clean:clean, improved:(worst.pen-best.pen)>0.05 || clean };
}

async function routeFetch(ptsArr){
  const coordsStr=ptsArr.map(function(p){return p.lng+","+p.lat;}).join(";");
  S.avoidApplied=false; S.avoidMode="";
  if(S.mode==="car" && (S.avoidTolls||S.avoidHwy)){
    // 1st choice: the router that can truly avoid tolls/highways
    try{
      const v=await valhallaFetch(ptsArr);
      if(v&&v.code==="Ok"&&v.routes&&v.routes.length){ S.avoidApplied=true; S.avoidMode="exact"; return v; }
    }catch(e){}
    // 2nd choice: pick the best of OSRM's alternatives for whatever they asked to avoid
    if(S.avoidHwy||S.avoidTolls){
      try{
        const alt=await avoidViaAlternatives(coordsStr);
        if(alt&&alt.data){
          S.avoidApplied=true;
          S.avoidMode= alt.clean ? "clear" : (alt.improved?"best":"partial");
          S.avoidRatio=alt.ratio;
          const what=[S.avoidHwy?"freeway":null,S.avoidTolls?"tolls":null].filter(Boolean).join(" & ");
          toast(alt.clean ? ("Found a route avoiding "+what+" ✓")
               : alt.improved ? ("Using the best available route around "+what)
               : (what.charAt(0).toUpperCase()+what.slice(1)+" is hard to avoid here — showing the closest option"),3400);
          return alt.data;
        }
      }catch(e){}
    }
    toast("Couldn't apply avoidance — showing the normal route.",3000);
  }
  /* alternatives only when PLANNING. During an active reroute we skip them: one route computed
     fast beats three computed slowly when the driver is already past the turn. */
  return await osrmFetch(coordsStr, !(S.navigating && S.rerouting));
}
// toll/highway toggle chips in the route sheet (car mode only)
function renderRouteOpts(){
  const sl=$("stopsList"); if(!sl) return;
  let box=document.getElementById("routeOpts");
  if(S.mode!=="car"){ if(box)box.remove(); return; }
  if(!box){ box=document.createElement("div"); box.id="routeOpts"; box.style.cssText="display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 12px"; sl.parentNode.insertBefore(box,sl); }
  box.innerHTML="";
  [["🛣️ Avoid tolls","avoidTolls"],["🚗 Avoid highways","avoidHwy"]].forEach(function(o){
    const b=document.createElement("button");
    const wanted=S[o[1]];
    b.className="chip"+(wanted?" on":"");
    b.textContent=o[0]+((wanted&&!S.avoidApplied)?" (unavailable)":"");
    if(wanted&&!S.avoidApplied) b.style.opacity="0.62";
    b.onclick=function(){ S[o[1]]=!S[o[1]]; try{localStorage.setItem("cw_"+o[1],S[o[1]]?"1":"0");}catch(e){} renderRouteOpts(); toast("Recalculating route…",1500); fetchRoute(); };
    box.appendChild(b);
  });
}


/* ═══════════ offline resilience (Tier 1) ═══════════
   Every map ConeWatch competes with fails the same way: signal drops, tiles stop, the route
   dies. Three defences, all local, none of which change what the app does when online.
   1. When a route is built, warm the tiles along that corridor into a size-capped cache in the
      service worker, so the drive still renders through a dead zone.
   2. Persist the route line and its steps, so a reload mid-drive doesn't lose them.
   3. Don't spam an offline driver with reroute failures. */
function _tileXY(lat,lng,z){
  var n=Math.pow(2,z), la=lat*Math.PI/180;
  return [ Math.floor((lng+180)/360*n),
           Math.floor((1-Math.log(Math.tan(la)+1/Math.cos(la))/Math.PI)/2*n) ];
}
/* Mirrors whatever basemap is actually in use — caching Esri tiles while the map draws CARTO
   would warm the wrong cache and look like the feature simply didn't work. */
function _baseTileTpl(){
  try{
    var ck=(CW_CONFIG&&CW_CONFIG.cartoKey||"").trim();
    if(ck){ var base=(S.theme==="dark")?"dark_all":"voyager";
      return {u:"https://a.basemaps.cartocdn.com/rastertiles/"+base+"/{z}/{x}/{y}.png?key="+ck, yx:false}; }
  }catch(e){}
  /* Precache the provider the map is actually drawing. Warming Esri tiles while the map renders
     CARTO would fill the cache with bytes nothing ever reads, and leave the dead zone uncovered
     — which is the one thing this feature exists to prevent. */
  if(BASE_PROVIDER==="carto")
    return {u:"https://a.basemaps.cartocdn.com/rastertiles/"+((S.theme==="dark")?"dark_all":"voyager")+"/{z}/{x}/{y}@2x.png", yx:false};
  return {u:"https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}"+TILE_CB, yx:true};
}
function corridorTileURLs(coords){
  var tpl=_baseTileTpl(), seen={}, out=[], CAP=800;
  // low zooms first: they always render *something*, so they are the ones worth the budget
  var plan=[{z:13,halo:1},{z:14,halo:1},{z:15,halo:0},{z:16,halo:0}];
  for(var p=0;p<plan.length;p++){
    var z=plan[p].z, h=plan[p].halo;
    for(var i=0;i<coords.length;i++){
      var c=coords[i]; if(!c) continue;
      var t=_tileXY(c[1],c[0],z);
      for(var dx=-h;dx<=h;dx++) for(var dy=-h;dy<=h;dy++){
        var x=t[0]+dx, y=t[1]+dy, k=z+"/"+x+"/"+y;
        if(seen[k]) continue; seen[k]=1;
        var u=tpl.u.replace("{z}",z).replace("{x}",x).replace("{y}",y);
        out.push(u);
        if(out.length>=CAP) return out;
      }
    }
  }
  return out;
}
/* Corridor caching only covers where you were GOING. Pan anywhere else offline and you hit
   black, which is exactly what happens in a parking garage or on a detour. Warm a disc around
   wherever the driver actually is, so the map near them always renders with no signal. */
function precacheAround(pos,radiusM){
  try{
    if(!pos||!navigator.serviceWorker||!navigator.serviceWorker.controller) return;
    var R=radiusM||3000, tpl=_baseTileTpl(), seen={}, out=[];
    // metres per tile at this latitude, per zoom
    var latRad=pos.lat*Math.PI/180;
    var plan=[13,14,15,16];
    for(var p=0;p<plan.length;p++){
      var z=plan[p];
      var mPerTile=156543.03392*Math.cos(latRad)/Math.pow(2,z)*256;
      var span=Math.ceil(R/mPerTile);
      var t=_tileXY(pos.lat,pos.lng,z);
      for(var dx=-span;dx<=span;dx++) for(var dy=-span;dy<=span;dy++){
        var k=z+"/"+(t[0]+dx)+"/"+(t[1]+dy);
        if(seen[k]) continue; seen[k]=1;
        out.push(tpl.u.replace("{z}",z).replace("{x}",t[0]+dx).replace("{y}",t[1]+dy));
      }
    }
    navigator.serviceWorker.controller.postMessage({type:"cw-precache-tiles",urls:out});
  }catch(e){}
}
/* Re-warm only when the driver has actually moved somewhere new — otherwise this would refetch
   the same discs every GPS tick and fight the live map for bandwidth. */
function maybeWarmArea(){
  try{
    if(!S.pos||!navigator.onLine) return;
    var last=S._warmAt;
    if(last && distM(last,S.pos)<2000) return;
    /* Hundreds of tile requests during the first seconds of a first visit compete with the map
       for the same connection, which is exactly when the app feels broken. Warm only once the
       map has gone idle and the app has been open long enough to be in use. */
    if(!S._bootAt) S._bootAt=Date.now();
    if(Date.now()-S._bootAt < 12000) { setTimeout(maybeWarmArea, 12000); return; }
    S._warmAt={lat:S.pos.lat,lng:S.pos.lng};
    precacheAround(S.pos,3000);
  }catch(e){}
}
/* ═══════════ offline corridor graph (session 1 of 3: capture + storage) ═══════════
   Goal of the whole subproject: when you drift off-route and the network is gone, reroute
   locally instead of dying. This first piece only CAPTURES the raw material — it fetches the
   road network around a route while we still have signal and stores it. Nothing routes against
   it yet; A* and the reroute hook come next.

   Scoped deliberately to the route corridor rather than the whole city. A metro-wide graph is
   hundreds of thousands of segments, tens of MB, and a download wait — which would break the
   "free, no download, no account" promise the app is built on. The corridor is the part you
   can actually drive off of, and it's a few thousand segments.

   Stored in IndexedDB, not localStorage: localStorage is ~5MB total, synchronous (so writing a
   big graph would jank the map mid-drive), and already carrying the route library, POI cache
   and signal cache. */
var CWDB_NAME="conewatch", CWDB_VER=1, CWDB_STORE="corridors";
var _cwdb=null;
function cwdbOpen(){
  if(_cwdb) return Promise.resolve(_cwdb);
  return new Promise(function(res,rej){
    try{
      if(!window.indexedDB) return rej(new Error("no idb"));
      var rq=indexedDB.open(CWDB_NAME,CWDB_VER);
      rq.onupgradeneeded=function(e){
        var db=e.target.result;
        if(!db.objectStoreNames.contains(CWDB_STORE)){
          var st=db.createObjectStore(CWDB_STORE,{keyPath:"key"});
          st.createIndex("t","t");                 // lets us evict oldest without scanning values
        }
      };
      rq.onsuccess=function(){ _cwdb=rq.result; res(_cwdb); };
      rq.onerror=function(){ rej(rq.error||new Error("idb open failed")); };
    }catch(e){ rej(e); }
  });
}
function cwdbPut(rec){
  return cwdbOpen().then(function(db){
    return new Promise(function(res,rej){
      var tx=db.transaction(CWDB_STORE,"readwrite");
      tx.objectStore(CWDB_STORE).put(rec);
      tx.oncomplete=function(){ res(true); };
      tx.onerror=function(){ rej(tx.error); };
    });
  });
}
function cwdbGet(key){
  return cwdbOpen().then(function(db){
    return new Promise(function(res,rej){
      var tx=db.transaction(CWDB_STORE,"readonly");
      var rq=tx.objectStore(CWDB_STORE).get(key);
      rq.onsuccess=function(){ res(rq.result||null); };
      rq.onerror=function(){ rej(rq.error); };
    });
  });
}
function cwdbAll(){
  return cwdbOpen().then(function(db){
    return new Promise(function(res,rej){
      var tx=db.transaction(CWDB_STORE,"readonly");
      var rq=tx.objectStore(CWDB_STORE).getAll();
      rq.onsuccess=function(){ res(rq.result||[]); };
      rq.onerror=function(){ rej(rq.error); };
    });
  });
}
function cwdbDel(key){
  return cwdbOpen().then(function(db){
    return new Promise(function(res){
      var tx=db.transaction(CWDB_STORE,"readwrite");
      tx.objectStore(CWDB_STORE).delete(key);
      tx.oncomplete=function(){ res(true); };
      tx.onerror=function(){ res(false); };
    });
  });
}

/* Keep only a handful of corridors. Each is a few hundred KB; without eviction a month of
   commuting would quietly fill the origin's storage quota and start getting the whole app
   evicted by the browser rather than just the oldest corridor. */
var CORRIDOR_KEEP=6;
var AREA_KEEP=2;
async function corridorEvict(){
  try{
    var all=await cwdbAll();
    // Corridors and areas age out on separate budgets. A single shared list would let a busy
    // week of driving evict the home-area graph, which is exactly the record worth keeping.
    var cors=all.filter(function(x){ return x.kind!=="area"; }).sort(function(a,b){ return b.t-a.t; });
    var areas=all.filter(function(x){ return x.kind==="area"; }).sort(function(a,b){ return (b.hits||0)-(a.hits||0) || b.t-a.t; });
    for(var i=CORRIDOR_KEEP;i<cors.length;i++) await cwdbDel(cors[i].key);
    for(var j=AREA_KEEP;j<areas.length;j++) await cwdbDel(areas[j].key);
  }catch(e){}
}

/* Which OSM ways count as drivable, and what they cost. Weight is a speed proxy: A* multiplies
   segment length by it, so a residential street costs more per metre than a trunk road and the
   search prefers sensible roads instead of cutting through side streets. Service roads and
   alleys are included but heavily penalised — you sometimes genuinely need them to get out of a
   parking lot, but they should never be chosen for through travel. */
var ROAD_W={
  motorway:1.0, motorway_link:1.3, trunk:1.05, trunk_link:1.35,
  primary:1.15, primary_link:1.45, secondary:1.3, secondary_link:1.6,
  tertiary:1.5, tertiary_link:1.8, unclassified:1.9, residential:2.0,
  living_street:3.0, service:3.4
};
function corridorKey(r){
  try{
    var co=r.geometry.coordinates;
    var a=co[0], b=co[co.length-1];
    return "c:"+a[1].toFixed(3)+","+a[0].toFixed(3)+">"+b[1].toFixed(3)+","+b[0].toFixed(3);
  }catch(e){ return null; }
}
/* Overpass caps out on a single giant bbox for a long route, and a route bbox is mostly empty
   space anyway (a 10km diagonal trip spans a huge rectangle it never enters). So we walk the
   polyline and emit a chain of small boxes that actually hug the road. */
function corridorBoxes(coords,padDeg){
  var boxes=[], i=0, STRIDE=60;
  while(i<coords.length){
    var slice=coords.slice(i, Math.min(coords.length, i+STRIDE+1));
    if(slice.length<2){ break; }
    var minLat=90,maxLat=-90,minLng=180,maxLng=-180;
    slice.forEach(function(c){
      if(c[1]<minLat)minLat=c[1]; if(c[1]>maxLat)maxLat=c[1];
      if(c[0]<minLng)minLng=c[0]; if(c[0]>maxLng)maxLng=c[0];
    });
    boxes.push([minLat-padDeg,minLng-padDeg,maxLat+padDeg,maxLng+padDeg]);
    i+=STRIDE;
  }
  return boxes.slice(0,14);            // hard ceiling: a cross-country route is not a corridor
}
/* Build the node/edge graph. Nodes are deduped by OSM id, so a junction shared by two ways
   becomes ONE node with edges from both — which is the entire point; without that dedup the
   "graph" is a pile of disconnected polylines and A* can never turn a corner. */
function buildCorridorGraph(elements){
  /* Street names ride along as a string table with edges holding an index into it. A corridor
     repeats the same few dozen names thousands of times; storing the string on every edge would
     multiply the payload for no gain. Without names an offline reroute can only say "turn
     right", which is not navigation — it is a guess with a direction attached. */
  var nodes={}, adj={}, ways=0, names=[], nameIx={};
  function nameId(nm){
    if(!nm) return -1;
    if(nameIx[nm]!==undefined) return nameIx[nm];
    nameIx[nm]=names.length; names.push(nm); return names.length-1;
  }
  (elements||[]).forEach(function(el){
    if(el.type==="node" && isFinite(el.lat) && isFinite(el.lon)) nodes[el.id]=[+el.lon.toFixed(6),+el.lat.toFixed(6)];
  });
  (elements||[]).forEach(function(el){
    if(el.type!=="way" || !el.nodes || el.nodes.length<2) return;
    var t=el.tags||{};
    var w=ROAD_W[t.highway];
    if(!w) return;
    if(t.access==="private"||t.access==="no") return;
    // oneway:-1 means the way is digitised backwards; treat it as one-way in reverse
    var rev = (t.oneway==="-1");
    var one = rev || t.oneway==="yes" || t.oneway==="true" || t.oneway==="1" || t.junction==="roundabout";
    ways++;
    var ni=nameId(t.name||t.ref||"");
    for(var i=0;i<el.nodes.length-1;i++){
      var a=el.nodes[i], b=el.nodes[i+1];
      if(!nodes[a]||!nodes[b]) continue;
      if(rev){ var tmp=a; a=b; b=tmp; }
      (adj[a]||(adj[a]=[])).push([b,w,ni]);
      if(!one) (adj[b]||(adj[b]=[])).push([a,w,ni]);
    }
  });
  // drop nodes no drivable edge touches — they are most of the payload and none of the value
  var keep={};
  for(var k in adj){
    keep[k]=nodes[k];
    adj[k].forEach(function(e){ keep[e[0]]=nodes[e[0]]; });
  }
  for(var k2 in keep){ if(!keep[k2]) delete keep[k2]; }
  return {nodes:keep,adj:adj,ways:ways,names:names};
}
/* ═══════════ home-area graph ═══════════
   The corridor cache only covers roads you have already routed along, so offline routing to a
   place you have never driven returns nothing. This fixes that for the case that actually
   matters: trips that start near where you already are. Most driving is local, so a graph
   covering a few km around your usual spot covers most of what you would ever ask for offline
   — without a region download, a permission prompt, or a wait, which is what full metro-wide
   offline would cost and what the app's "free, nothing to install" promise cannot afford.

   Captured in the background, on wifi, while parked. Never while driving: bandwidth and CPU
   mid-drive belong to navigation. */
var AREA_RADIUS_M=3000;
var AREA_MAX_NODES=90000;                    // refuse a graph too big to hold or search quickly
var AREA_TTL=21*864e5;                       // roads change slowly; three weeks is conservative

/* Dwell tracking. We cache where you actually SPEND TIME, not wherever you happened to open the
   app — one visit to a suburb should not evict the graph around your own street. Cells are
   ~1.1km so a normal neighbourhood collapses to one or two of them. */
var AREA_CELL=0.01;
function _areaCellKey(lat,lng){ return Math.floor(lat/AREA_CELL)+"|"+Math.floor(lng/AREA_CELL); }
function _areaCellCentre(k){
  var p=k.split("|");
  return {lat:(+p[0]+0.5)*AREA_CELL, lng:(+p[1]+0.5)*AREA_CELL};
}
function noteDwell(){
  try{
    if(!S.pos) return;
    if(S.speedMph>4) return;                                   // moving through, not dwelling
    var k=_areaCellKey(S.pos.lat,S.pos.lng);
    var d={}; try{ d=JSON.parse(localStorage.getItem("cw_dwell")||"{}")||{}; }catch(e){ d={}; }
    var now=Date.now();
    var rec=d[k]||{n:0,t:0};
    if(now-rec.t < 240000) return;                             // one credit per 4 min, not per tick
    rec.n++; rec.t=now; d[k]=rec;
    var keys=Object.keys(d);
    if(keys.length>12){                                        // keep the table small and current
      keys.sort(function(a,b){ return (d[a].n-d[b].n) || (d[a].t-d[b].t); });
      while(keys.length>12) delete d[keys.shift()];
    }
    localStorage.setItem("cw_dwell",JSON.stringify(d));
  }catch(e){}
}
function topDwellCell(){
  try{
    var d=JSON.parse(localStorage.getItem("cw_dwell")||"{}")||{};
    var best=null,bn=0;
    for(var k in d){ if(d[k].n>bn){ bn=d[k].n; best=k; } }
    return (best && bn>=3) ? {key:best,hits:bn,centre:_areaCellCentre(best)} : null;
  }catch(e){ return null; }
}
/* Wifi only, as far as the platform will tell us. navigator.connection is absent on iOS Safari,
   so the honest fallback is: attempt it anyway, but only when parked and only once per TTL —
   a few MB every three weeks is not something to ask permission for. */
function _looksLikeWifi(){
  try{
    var c=navigator.connection||navigator.mozConnection||navigator.webkitConnection;
    if(!c) return true;                                        // unknowable (iOS) — see comment
    if(c.saveData) return false;                               // user asked for less data: obey
    if(c.type) return c.type==="wifi"||c.type==="ethernet";
    return c.effectiveType==="4g";                             // crude, but excludes 2g/3g
  }catch(e){ return true; }
}
function areaKeyFor(cell){ return "a:"+cell.key; }
/* Tile the radius into a grid of Overpass boxes. One 6km-wide query for every drivable way
   times out on every mirror; a dozen small ones succeed independently and a single failure
   costs one tile rather than the whole area. */
function areaBoxes(centre,radiusM){
  var dLat=radiusM/111320;
  var dLng=radiusM/(111320*Math.max(0.2,Math.cos(centre.lat*Math.PI/180)));
  var N=4, boxes=[];
  for(var i=0;i<N;i++) for(var j=0;j<N;j++){
    var s=centre.lat-dLat+(2*dLat)*(i/N),   n=centre.lat-dLat+(2*dLat)*((i+1)/N);
    var w=centre.lng-dLng+(2*dLng)*(j/N),   e=centre.lng-dLng+(2*dLng)*((j+1)/N);
    boxes.push([s,w,n,e]);
  }
  return boxes;
}
/* Named places inside the cached area, so offline search has something to resolve against.
   Stored as flat [name,lat,lng,kind] rows — an object per place would roughly triple the size
   for a few thousand entries and buy nothing. */
var AREA_PLACE_CAP=4000;
async function captureAreaPlaces(centre){
  var of=window.overpassFetch;
  if(typeof of!=="function") return [];
  var out=[], seen={};
  var dLat=AREA_RADIUS_M/111320;
  var dLng=AREA_RADIUS_M/(111320*Math.max(0.2,Math.cos(centre.lat*Math.PI/180)));
  var bbox=[centre.lat-dLat,centre.lng-dLng,centre.lat+dLat,centre.lng+dLng];
  /* nwr = nodes, ways and relations in one pass: a supermarket is often a building way and a
     mall a relation, so a node-only query would miss exactly the large destinations people
     actually drive to. `out center` gives ways and relations a single representative point. */
  var qs=[
    '[out:json][timeout:40];nwr('+bbox.join(",")+')["name"]["amenity"];out center tags;',
    '[out:json][timeout:40];nwr('+bbox.join(",")+')["name"]["shop"];out center tags;',
    '[out:json][timeout:40];nwr('+bbox.join(",")+')["name"]["tourism"];out center tags;',
    '[out:json][timeout:40];nwr('+bbox.join(",")+')["name"]["leisure"];out center tags;'
  ];
  for(var i=0;i<qs.length;i++){
    try{
      var d=await of(qs[i]);
      (d&&d.elements||[]).forEach(function(e){
        var t=e.tags||{}; var nm=t.name; if(!nm) return;
        var lat=e.lat!==undefined?e.lat:(e.center&&e.center.lat);
        var lng=e.lon!==undefined?e.lon:(e.center&&e.center.lon);
        if(!isFinite(lat)||!isFinite(lng)) return;
        var k=nm.toLowerCase()+"@"+lat.toFixed(4)+","+lng.toFixed(4);
        if(seen[k]) return; seen[k]=1;
        out.push([nm,+lat.toFixed(6),+lng.toFixed(6),t.amenity||t.shop||t.tourism||t.leisure||""]);
      });
    }catch(e){}
    await new Promise(function(r){ setTimeout(r,400); });
  }
  if(out.length>AREA_PLACE_CAP){
    // keep the closest to the centre: those are the ones a local search will actually want
    out.sort(function(a,b){ return distM(centre,{lat:a[1],lng:a[2]})-distM(centre,{lat:b[1],lng:b[2]}); });
    out=out.slice(0,AREA_PLACE_CAP);
  }
  return out;
}
/* Offline place lookup across every cached area. Same scoring shape as searchPoiIndex — exact,
   then prefix, then contains — with distance as the tiebreak. */
var _areaPlaceCache=null, _areaPlaceAt=0;
async function areaPlaces(){
  if(_areaPlaceCache && Date.now()-_areaPlaceAt<60000) return _areaPlaceCache;
  try{
    var all=await cwdbAll();
    var rows=[];
    all.forEach(function(x){ if(x.kind==="area" && Array.isArray(x.places)) rows=rows.concat(x.places); });
    _areaPlaceCache=rows; _areaPlaceAt=Date.now();
    return rows;
  }catch(e){ return []; }
}
async function searchAreaPlaces(typed,limit){
  var q=_normPlace(typed); if(!q||q.length<2) return [];
  var rows=await areaPlaces(); if(!rows.length) return [];
  var out=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i]; if(!r) continue;
    var nn=_normPlace(String(r[0]||"")); if(!nn) continue;
    var sc;
    if(nn===q) sc=0; else if(nn.indexOf(q)===0) sc=1; else if(nn.indexOf(q)!==-1) sc=2; else continue;
    out.push({name:r[0],lat:r[1],lng:r[2],cat:r[3]||"",_s:sc,_d:S.pos?distM(S.pos,{lat:r[1],lng:r[2]}):0});
  }
  out.sort(function(a,b){ return (a._s-b._s)||(a._d-b._d); });
  return out.slice(0,limit||8);
}
var _areaBusy=false;
async function captureAreaGraph(force){
  if(_areaBusy) return null;
  var of=window.overpassFetch;
  if(typeof of!=="function"||!navigator.onLine) return null;
  if(!force){
    if(S.navigating) return null;                              // never compete with a live drive
    if(S.speedMph>4) return null;
    if(!_looksLikeWifi()) return null;
  }
  var cell=topDwellCell();
  if(!cell) return null;                                       // not enough dwell to know where "home" is
  var key=areaKeyFor(cell);
  try{
    var have=await cwdbGet(key);
    if(have && have.v===2 && Date.now()-have.t<AREA_TTL && !force) return have;
  }catch(e){}
  _areaBusy=true;
  try{
    var boxes=areaBoxes(cell.centre,AREA_RADIUS_M);
    var all=[], failed=0;
    for(var i=0;i<boxes.length;i++){
      var b=boxes[i];
      /* Deliberately excludes `service`: alleys, driveways and parking aisles are a large share
         of nodes in a dense area and are almost never the road you want. Corridor capture keeps
         them, because there they are cheap and occasionally the way out of a lot. */
      var q="[out:json][timeout:40];way("+b.join(",")+')["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street)(_link)?$"];out body;>;out skel qt;';
      try{
        var d=await of(q);
        if(d&&d.elements) all=all.concat(d.elements);
      }catch(e){ failed++; }
      await new Promise(function(r){ setTimeout(r,400); });     // be a decent Overpass citizen
      if(document.hidden && !force){ /* keep going: backgrounded is the ideal time for this */ }
    }
    if(failed>boxes.length/2) return null;                     // too patchy to be trustworthy
    if(!all.length) return null;
    var g=buildCorridorGraph(all);
    var n=Object.keys(g.nodes).length;
    if(n<200) return null;
    if(n>AREA_MAX_NODES) return null;                          // would be slow to search and huge to store
    /* A road graph alone cannot answer "take me to Checker Bar" — routing needs a DESTINATION
       COORDINATE, and search geocodes online. So harvest the named places in the same area
       while we're here. This replaces the /poi-detroit.json approach, which required generating
       and shipping a static file per city (and never was — it 404s and fails silently). This
       version is self-maintaining and works wherever the driver actually is. */
    var places=await captureAreaPlaces(cell.centre);
    var rec={key:key,v:2,kind:"area",t:Date.now(),hits:cell.hits,
             centre:cell.centre,radius:AREA_RADIUS_M,destName:"home area",
             nodes:g.nodes,adj:g.adj,ways:g.ways,names:g.names||[],n:n,
             places:places||[]};
    await cwdbPut(rec);
    await corridorEvict();
    try{ console.log("ConeWatch area cached:",key,n,"nodes /",g.ways,"ways,",failed,"tiles failed"); }catch(e){}
    return rec;
  }catch(e){ return null; }
  finally{ _areaBusy=false; }
}
/* Try once shortly after launch, then a few times a day. The TTL check inside makes repeat
   calls nearly free, so this is a cheap way to catch the moment the phone lands on wifi. */
try{
  setInterval(noteDwell, 60000);
  /* Dwell needs ~12 minutes to qualify, so a flat 3-hour retry meant the FIRST area could sit
     uncaptured for hours after the user became eligible — which read as "it isn't working".
     Poll briskly until one area exists, then back off hard: the TTL check inside makes the
     steady-state calls nearly free, but there's no reason to keep asking once we have it. */
  var _areaTick=null;
  async function _areaPoll(){
    try{
      var got=await captureAreaGraph();
      if(got && _areaTick){ clearInterval(_areaTick); _areaTick=null;
        setInterval(function(){ try{ captureAreaGraph(); }catch(e){} }, 3*3600*1000); }
    }catch(e){}
  }
  setTimeout(function(){ _areaPoll(); _areaTick=setInterval(_areaPoll, 150000); }, 40000);
}catch(e){}
window.cwCacheAreaNow=function(){ return captureAreaGraph(true); };
window.cwDeclination=function(){ return {declination:_decl,samples:_declN,osCorrected:_declNative}; };

/* ═══════════ offline routing, session 2 of 3: local A* ═══════════
   Routes across a cached corridor graph with no network. Session 3 wires this to the off-route
   handler; for now it is callable and testable but nothing invokes it automatically.

   A* rather than Dijkstra because we always know the destination, and the straight-line
   heuristic prunes most of the graph. The heuristic must never overestimate or the result stops
   being the cheapest path — so it is pure haversine metres multiplied by the CHEAPEST possible
   road weight. Using an average weight would overestimate on motorway-heavy routes and quietly
   return worse paths than exist. */
var _H_MIN_W=1.0;                                  // = ROAD_W.motorway, the cheapest weight there is

/* Binary heap. An array with sort() on every push is O(n log n) per insertion and a corridor
   can hold thousands of nodes — that was measurably slower than the search itself in testing. */
function _MinHeap(){ this.a=[]; }
_MinHeap.prototype.push=function(item){
  var a=this.a; a.push(item); var i=a.length-1;
  while(i>0){ var p=(i-1)>>1; if(a[p].f<=a[i].f) break; var t=a[p]; a[p]=a[i]; a[i]=t; i=p; }
};
_MinHeap.prototype.pop=function(){
  var a=this.a; if(!a.length) return null;
  var top=a[0], last=a.pop();
  if(a.length){ a[0]=last; var i=0,n=a.length;
    for(;;){ var l=2*i+1,r=l+1,m=i;
      if(l<n&&a[l].f<a[m].f) m=l;
      if(r<n&&a[r].f<a[m].f) m=r;
      if(m===i) break; var t=a[m]; a[m]=a[i]; a[i]=t; i=m; }
  }
  return top;
};
_MinHeap.prototype.size=function(){ return this.a.length; };

/* Snap a GPS position to the nearest graph node. Linear scan is fine at corridor scale (a few
   thousand nodes, single-digit milliseconds) and avoids carrying a spatial index in storage. */
function graphSnap(g,pt,maxM){
  var best=null,bd=Infinity;
  for(var id in g.adj){
    var c=g.nodes[id]; if(!c) continue;
    var d=distM(pt,{lat:c[1],lng:c[0]});
    if(d<bd){ bd=d; best=id; }
  }
  if(best===null) return null;
  if(maxM && bd>maxM) return null;                 // too far from any cached road to trust
  return {id:best,dist:bd};
}
/* Returns {coords,distance,nodes} or null. coords is [lng,lat][] so it can go straight into the
   existing route source without translation. */
function graphRoute(g,from,to,opts){
  opts=opts||{};
  try{
    if(!g||!g.adj||!g.nodes) return null;
    var a=graphSnap(g,from,opts.maxSnapM||220);
    var b=graphSnap(g,to,opts.maxSnapM||400);
    if(!a||!b) return null;
    if(a.id===b.id) return null;
    var goal=g.nodes[b.id];
    function h(id){
      var c=g.nodes[id]; if(!c) return 0;
      return distM({lat:c[1],lng:c[0]},{lat:goal[1],lng:goal[0]})*_H_MIN_W;
    }
    var gScore={}, cameFrom={}, closed={}, edgeName={};
    gScore[a.id]=0;
    var open=new _MinHeap();
    open.push({id:a.id,f:h(a.id)});
    var guard=0, LIMIT=opts.limit||120000;         // hard stop: never hang the UI mid-drive
    while(open.size()){
      if(++guard>LIMIT) return null;
      var cur=open.pop();
      if(closed[cur.id]) continue;
      if(cur.id===b.id) break;
      closed[cur.id]=1;
      var edges=g.adj[cur.id]; if(!edges) continue;
      var cc=g.nodes[cur.id]; if(!cc) continue;
      for(var i=0;i<edges.length;i++){
        var nb=edges[i][0], w=edges[i][1];
        if(closed[nb]) continue;
        var nc=g.nodes[nb]; if(!nc) continue;
        var step=distM({lat:cc[1],lng:cc[0]},{lat:nc[1],lng:nc[0]})*w;
        var tentative=gScore[cur.id]+step;
        if(gScore[nb]===undefined || tentative<gScore[nb]){
          gScore[nb]=tentative; cameFrom[nb]=cur.id;
          edgeName[nb]=(edges[i].length>2?edges[i][2]:-1);   // name of the edge we ARRIVED on
          open.push({id:nb,f:tentative+h(nb)});
        }
      }
    }
    if(gScore[b.id]===undefined) return null;      // unreachable within the cached corridor
    var path=[], cur2=b.id, hops=0;
    while(cur2!==undefined && hops++<100000){
      path.push(cur2);
      if(cur2===a.id) break;
      cur2=cameFrom[cur2];
    }
    if(path[path.length-1]!==a.id) return null;
    path.reverse();
    var coords=[], metres=0, prev=null, legNames=[];
    for(var k=0;k<path.length;k++){
      var c2=g.nodes[path[k]]; if(!c2) continue;
      if(prev) metres+=distM({lat:prev[1],lng:prev[0]},{lat:c2[1],lng:c2[0]});
      coords.push([c2[0],c2[1]]); prev=c2;
      if(k>0){
        var ni=edgeName[path[k]];
        legNames.push((ni!==undefined && ni>=0 && g.names && g.names[ni]) ? g.names[ni] : "");
      }
    }
    if(coords.length<2) return null;
    return {coords:coords,distance:Math.round(metres),nodes:path.length,legNames:legNames};
  }catch(e){ return null; }
}
/* Pick the best cached corridor for a trip: the one whose graph actually contains both ends.
   Wrong-corridor selection is the likely failure mode once several are stored, so this checks
   reachability rather than guessing from the destination label. */
async function routeOffline(from,to){
  try{
    var all=await cwdbAll();
    if(!all||!all.length) return null;
    all.sort(function(a,b){ return b.t-a.t; });
    for(var i=0;i<all.length;i++){
      var r=graphRoute(all[i],from,to);
      if(r){ r.corridor=all[i].key; return r; }
    }
    return null;
  }catch(e){ return null; }
}
window.cwTestOffline=async function(){
  try{
    if(!S.pos) return "no GPS fix";
    var dest=S.dest; if(!dest) return "no destination set";
    var t0=Date.now();
    var r=await routeOffline(S.pos,dest);
    if(!r) return "no offline route found";
    return {ms:Date.now()-t0,points:r.coords.length,metres:r.distance,corridor:r.corridor};
  }catch(e){ return "error: "+e; }
};
var _corridorBusy=false;
async function captureCorridorGraph(r){
  if(_corridorBusy) return null;
  var of=window.overpassFetch;
  if(typeof of!=="function" || !navigator.onLine) return null;
  var key=corridorKey(r); if(!key) return null;
  try{
    var have=await cwdbGet(key);
    // v2 added the street-name table. A v1 record still routes, but its turns would be nameless,
    // so treat it as stale and re-capture rather than shipping "turn right onto nothing".
    if(have && have.v===2 && Date.now()-have.t < 7*864e5) return have;
  }catch(e){}
  _corridorBusy=true;
  try{
    var co=r.geometry.coordinates||[];
    if(co.length<2) return null;
    var boxes=corridorBoxes(co, 0.0042);                      // ~450m each side of the line
    var all=[];
    for(var i=0;i<boxes.length;i++){
      var b=boxes[i];
      var q="[out:json][timeout:25];way("+b.join(",")+')["highway"];out body;>;out skel qt;';
      try{
        var d=await of(q);
        if(d && d.elements) all=all.concat(d.elements);
      }catch(e){ /* one box failing shouldn't void the corridor — the rest still routes */ }
    }
    if(!all.length) return null;
    var g=buildCorridorGraph(all);
    var nodeCount=Object.keys(g.nodes).length;
    if(nodeCount<20) return null;                             // too thin to be useful
    var rec={key:key,v:2,t:Date.now(),dest:S.dest||null,destName:S.destName||"",
             nodes:g.nodes,adj:g.adj,ways:g.ways,names:g.names||[],n:nodeCount};
    await cwdbPut(rec);
    await corridorEvict();
    try{ console.log("ConeWatch corridor cached:",key,nodeCount,"nodes /",g.ways,"ways"); }catch(e){}
    return rec;
  }catch(e){ try{ console.log("corridor capture failed",e); }catch(_){} return null; }
  finally{ _corridorBusy=false; }
}
/* Console helper so this session's work is inspectable without a UI:
   await cwCorridors()  →  what is actually stored. */
window.cwCorridors=async function(){
  try{
    var all=await cwdbAll();
    return all.map(function(x){ return {key:x.key,dest:x.destName,nodes:x.n,ways:x.ways,age:Math.round((Date.now()-x.t)/60000)+"m"}; });
  }catch(e){ return "idb unavailable: "+e; }
};
function precacheCorridor(r){
  try{
    if(!r||!r.geometry||!r.geometry.coordinates) return;
    if(!navigator.serviceWorker||!navigator.serviceWorker.controller) return;
    var urls=corridorTileURLs(r.geometry.coordinates);
    if(urls.length) navigator.serviceWorker.controller.postMessage({type:"cw-precache-tiles",urls:urls});
  }catch(e){}
}
function saveRouteLocal(r){
  try{
    if(!r||!r.geometry) return;
    var co=r.geometry.coordinates||[];
    // a long route can carry thousands of coords; thin it rather than blow the storage quota
    if(co.length>3000){ var st=Math.ceil(co.length/3000), th=[]; for(var i=0;i<co.length;i+=st) th.push(co[i]); if(th[th.length-1]!==co[co.length-1]) th.push(co[co.length-1]); co=th; }
    var steps=(S.steps||[]).map(function(x){
      var m=x.maneuver||{};
      return {name:x.name,distance:x.distance,ref:x.ref,exits:x.exits,
              maneuver:{type:m.type,modifier:m.modifier,location:m.location}};
    });
    var rec={t:Date.now(),dest:S.dest,destName:S.destName,coords:co,
             dur:r.duration,dist:r.distance,steps:steps};
    localStorage.setItem("cw_lastroute",JSON.stringify(rec));
    /* One saved route only helps if you happen to want that exact trip again. Keeping the last
       few, keyed by destination, means an offline search for anywhere you have already routed
       to today comes back with real turn-by-turn instead of nothing. */
    try{
      var lib=JSON.parse(localStorage.getItem("cw_routes")||"[]");
      lib=lib.filter(function(x){ return !(x.dest&&S.dest&&distM(x.dest,S.dest)<200); });
      lib.unshift(rec);
      while(lib.length>5) lib.pop();
      localStorage.setItem("cw_routes",JSON.stringify(lib));
    }catch(e){
      try{ localStorage.setItem("cw_routes",JSON.stringify([rec])); }catch(_){}
    }
  }catch(e){}
}
/* Find a stored route whose destination is essentially the one being asked for. 200m is loose
   enough to survive a different geocode hit on the same place, tight enough not to hand back
   the wrong trip. */
function offlineRouteFor(dest){
  if(!dest) return null;
  try{
    var lib=JSON.parse(localStorage.getItem("cw_routes")||"[]");
    for(var i=0;i<lib.length;i++){
      var x=lib[i];
      if(x&&x.dest&&x.coords&&x.coords.length&&distM(x.dest,dest)<200) return x;
    }
  }catch(e){}
  return null;
}
function installStoredRoute(x){
  S.route={geometry:{type:"LineString",coordinates:x.coords},duration:x.dur,distance:x.dist,legs:[]};
  S.steps=x.steps||[]; S.stepIdx=0; S.peekIdx=null; S.offRouteCount=0;
  try{ S.alerted.clear(); }catch(e){}
  S._ri=undefined; S._riT=0;
  try{ ensureRouteLayers(); map.getSource("route").setData({type:"Feature",geometry:S.route.geometry}); }catch(e){}
  try{ refreshRouteCondition(); }catch(e){}
}
/* Last resort when nothing is stored: a straight line to the destination with distance and
   compass heading. It is not navigation and is never presented as navigation — but knowing
   "2.3 mi, northeast" beats a dead screen when you have no signal. */
function beelineTo(dest){
  if(!S.pos||!dest) return false;
  try{
    var geo={type:"LineString",coordinates:[[S.pos.lng,S.pos.lat],[dest.lng,dest.lat]]};
    ensureRouteLayers();
    map.getSource("route").setData({type:"Feature",geometry:geo});
    // _brg takes [lng,lat] arrays, not {lat,lng} objects — passing objects made b NaN,
    // which indexed the compass table with NaN and printed "undefined" as the heading
    var d=distM(S.pos,dest), b=_brg([S.pos.lng,S.pos.lat],[dest.lng,dest.lat]);
    var pts=["N","NE","E","SE","S","SW","W","NW"], dir=pts[Math.round(((b%360)+360)%360/45)%8];
    try{
      var bb=new maplibregl.LngLatBounds(geo.coordinates[0],geo.coordinates[0]);
      geo.coordinates.forEach(function(c){ bb.extend(c); });
      map.fitBounds(bb,{padding:{top:150,bottom:120,left:50,right:50}});
    }catch(e){}
    toast("Offline — no turn-by-turn. Direct line: "+fmtDist(d)+" "+dir+".",4600);
    return true;
  }catch(e){ return false; }
}
function restoreRouteLocal(){
  try{
    if(navigator.onLine) return false;            // online, a fresh route is always better
    var raw=localStorage.getItem("cw_lastroute"); if(!raw) return false;
    var d=JSON.parse(raw);
    if(!d||!d.coords||!d.coords.length) return false;
    if(Date.now()-(d.t||0) > 3*3600*1000) return false;   // stale enough to be misleading
    S.route={geometry:{type:"LineString",coordinates:d.coords},duration:d.dur,distance:d.dist,legs:[]};
    S.steps=d.steps||[]; S.stepIdx=0; S.peekIdx=null;
    S.dest=d.dest||null; S.destName=d.destName||"";
    try{ ensureRouteLayers(); map.getSource("route").setData({type:"Feature",geometry:S.route.geometry}); }catch(e){}
    /* Drawing the line without arming guidance left a driver staring at a route with no turn
       instructions — the one thing they actually needed. If the stored route carries steps,
       turn-by-turn works with no network at all: the maneuvers are already on the phone. */
    if((S.steps||[]).length){
      try{ openSheet("routeSheet"); renderRouteSheet(S.route); }catch(e){}
      toast("Offline — your last route is here, turn-by-turn included.",4000);
    } else {
      toast("Offline — your last route is still here.",3400);
    }
    return true;
  }catch(e){ return false; }
}

/* ═══════════ offline routing, session 3 of 3: turn instructions + the reroute hook ═══════════
   OSRM hands back maneuvers for free; a local graph does not, so we derive them. The rule that
   matters: emit a step when the STREET NAME changes, or when the geometry bends hard enough to
   be a real turn. Emitting on angle alone would announce a turn at every slight curve of a
   single road, which is worse than silence — a driver learns to ignore it. */
function _bearingDeg(a,b){
  var y=Math.sin((b[0]-a[0])*Math.PI/180)*Math.cos(b[1]*Math.PI/180);
  var x=Math.cos(a[1]*Math.PI/180)*Math.sin(b[1]*Math.PI/180)-
        Math.sin(a[1]*Math.PI/180)*Math.cos(b[1]*Math.PI/180)*Math.cos((b[0]-a[0])*Math.PI/180);
  return (Math.atan2(y,x)*180/Math.PI+360)%360;
}
function _turnMod(delta){
  var d=((delta+540)%360)-180;                       // normalise to -180..180
  var ad=Math.abs(d);
  if(ad<22) return null;                             // straight through — not a maneuver
  if(ad>150) return "uturn";
  if(ad>=110) return d>0?"sharp right":"sharp left";
  if(ad>=45)  return d>0?"right":"left";
  return d>0?"slight right":"slight left";
}
function deriveOfflineSteps(coords,legNames,destName){
  var steps=[];
  if(!coords||coords.length<2) return steps;
  var names=legNames||[];
  function push(type,mod,name,at,dist){
    steps.push({name:name||"",distance:Math.round(dist||0),
                maneuver:{type:type,modifier:mod||null,location:at}});
  }
  var curName=names[0]||"", runStart=0;
  push("depart",null,curName,coords[0],0);
  for(var i=1;i<coords.length-1;i++){
    var inB=_bearingDeg(coords[i-1],coords[i]);
    var outB=_bearingDeg(coords[i],coords[i+1]);
    var mod=_turnMod(outB-inB);
    var nm=names[i]||"";
    var nameChanged = nm && curName && nm!==curName;
    // A name change with no bend is a road renaming under you, not a turn — no announcement.
    if(!mod && !nameChanged) continue;
    if(!mod && nameChanged){ curName=nm; continue; }
    var run=0;
    for(var k=runStart;k<i;k++) run+=distM({lat:coords[k][1],lng:coords[k][0]},{lat:coords[k+1][1],lng:coords[k+1][0]});
    if(run<18 && steps.length>1) continue;           // two nodes a few metres apart is graph noise
    push("turn",mod,nm||curName,coords[i],run);
    curName=nm||curName; runStart=i;
  }
  var tail=0;
  for(var k2=runStart;k2<coords.length-1;k2++) tail+=distM({lat:coords[k2][1],lng:coords[k2][0]},{lat:coords[k2+1][1],lng:coords[k2+1][0]});
  push("arrive",null,destName||curName,coords[coords.length-1],tail);
  return steps;
}
/* Install a locally-computed route as the live route. Kept separate from installStoredRoute
   because this one must be honest about what it is: an offline reroute has no traffic, no
   live conditions and a corridor-limited view of the road network. It is labelled so the
   driver knows, and S.offlineRoute lets the rest of the app avoid treating it as authoritative. */
function installOfflineRoute(r){
  try{
    if(!r||!r.coords||r.coords.length<2) return false;
    var steps=deriveOfflineSteps(r.coords,r.legNames,S.destName);
    if(!steps.length) return false;
    // ~13 m/s is a reasonable urban average; without traffic data any ETA is an estimate and
    // this is not dressed up as more than that
    var dur=Math.round(r.distance/13);
    S.route={geometry:{type:"LineString",coordinates:r.coords},duration:dur,distance:r.distance,legs:[]};
    S.steps=steps; S.stepIdx=0; S.peekIdx=null; S.offRouteCount=0;
    S.offlineRoute=true;
    try{ S.alerted.clear(); }catch(e){}
    S._ri=undefined; S._riT=0;
    try{ ensureRouteLayers(); map.getSource("route").setData({type:"Feature",geometry:S.route.geometry}); }catch(e){}
    try{ refreshRouteCondition(); }catch(e){}
    try{ renderNav(); }catch(e){}
    return true;
  }catch(e){ return false; }
}
var _offRerouteAt=0;
async function tryOfflineReroute(){
  // Only worth attempting while actually navigating and actually offline.
  if(!S.navigating||!S.pos||!S.dest) return false;
  if(Date.now()-_offRerouteAt < 15000) return false;       // don't thrash the search mid-drive
  _offRerouteAt=Date.now();
  try{
    var r=await routeOffline(S.pos,S.dest);
    if(!r) return false;
    if(!installOfflineRoute(r)) return false;
    toast("Offline reroute — using cached roads",3000);
    try{ speak("Rerouting offline."); }catch(e){}
    return true;
  }catch(e){ return false; }
}
async function fetchRoute(silent){
  if(!S.pos||!S.dest) return;
  // A stuck "in flight" flag used to wedge routing permanently: if any routing request hung,
  // every later request returned instantly and the route card never opened. Now it expires.
  if(S.rerouting){
    if(Date.now()-(S._reroutingAt||0) < 20000) return;
    S.rerouting=false;                                   // previous attempt clearly died — move on
  }
  if(!navigator.onLine){
    /* This branch used to be the end of the road: off-route with no signal meant keeping the
       stale line on screen and hoping. With a cached corridor we can now actually reroute.
       Only on `silent` — that is the off-route path. A non-silent offline call is the driver
       planning a new trip, where the saved-route library below is the better answer. */
    if(silent && S.navigating){
      var did=await tryOfflineReroute();
      if(did) return;
    }
    // mid-drive: the route already on screen is the right answer, just stop nagging about it
    if(silent||S.navigating){
      if(!silent && Date.now()-(S._offToastAt||0) > 60000){
        S._offToastAt=Date.now();
        toast("Offline — showing your saved route. It stays active.",3200);
      }
      return;
    }
    // planning a NEW trip offline: a route we already drove to this destination is real
    // turn-by-turn and should be handed back rather than refused
    var stored=offlineRouteFor(S.dest);
    if(stored){
      installStoredRoute(stored);
      try{
        var bb=new maplibregl.LngLatBounds(stored.coords[0],stored.coords[0]);
        stored.coords.forEach(function(c){ bb.extend(c); });
        map.fitBounds(bb,{padding:{top:160,bottom:90,left:50,right:50}});
        openSheet("routeSheet"); try{ renderRouteSheet(S.route); }catch(e){}
      }catch(e){}
      toast("Offline — using your saved route to "+(stored.destName||"this place")+".",3600);
      return;
    }
    if(beelineTo(S.dest)) return;
    toast("Offline — no saved route here. Search this place once with signal.",4200);
    return;
  }
  S.rerouting=true; S._reroutingAt=Date.now();
  // During active turn-by-turn, a reroute MUST start from where you are now — never the
  // original planned origin. Using S.origin on a reroute sent drivers back toward their
  // start point (the "rerouting the wrong direction" bug). Planning (not navigating) still
  // honors an explicitly chosen start.
  const _startPt=(S.navigating||silent)?S.pos:(S.origin||S.pos);
  try{
    /* Mid-drive, an 18-second wait is worse than a fast failure: the driver has travelled a
       quarter mile by then and the answer is stale anyway. Reroutes time out at 6s and retry
       once immediately — two fast attempts beat one slow one. */
    const _navReroute = (S.navigating && silent);
    const _budget = _navReroute ? 6000 : 18000;
    let data=await Promise.race([
      routeFetch([_startPt,...S.stops,S.dest]),
      new Promise(res=>setTimeout(()=>res({code:"Timeout"}),_budget))
    ]);
    if(_navReroute && data && data.code==="Timeout"){
      data=await Promise.race([
        routeFetch([S.pos,...S.stops,S.dest]),          // retry from where we are NOW
        new Promise(res=>setTimeout(()=>res({code:"Timeout"}),7000))
      ]);
    }
    if(data&&data.code==="Timeout"){ toast("Routing is slow right now — try again.",3000); return; }
    if(!data||data.code!=="Ok"||!data.routes||!data.routes.length){toast("No route found for this mode.",2600);return;}
    // We already ask OSRM for alternatives=3 but only ever used routes[0] (the extras were
    // consumed internally for avoid-highway/tolls and otherwise thrown away). Keep them so
    // the driver can pick the corridor, the way Google does and Apple doesn't.
    /* Pick by what the drive will actually cost, not just what OSRM predicts. A route two
       minutes quicker on paper but running through a reported closure is not the better route. */
    var _rts=data.routes||[];
    var _scored;
    if(_rts.length<2){ _scored=_rts.slice(); }          // nothing to compare — skip the scoring pass
    else{
      _scored=_rts.slice().map(function(r){ r._sc=scoreRoute(r); return r; });
      _scored.sort(function(a,b){ return a._sc.total-b._sc.total; });
    }
    S.routeAlts = _scored.slice(0,3);
    S.routeAltIdx = 0;
    const r=S.routeAlts[0]||data.routes[0];
    S.route=r;S.steps=r.legs.flatMap(l=>l.steps);S.stepIdx=0;S.peekIdx=null;S.offRouteCount=0;S.alerted.clear();
    S.offlineRoute=false;                          // a live route supersedes any offline one
    S._ri=undefined;S._riT=0;                      // reset along-route progress cache for the new line
    try{map.getSource("route").setData({type:"Feature",geometry:r.geometry});}catch{}
    try{refreshRouteCondition();}catch(e){}
    try{ saveRouteLocal(r); precacheCorridor(r); }catch(e){}
    // graph capture is background work: delay it so it never contends with rendering the route
    try{ setTimeout(function(){ captureCorridorGraph(r); }, 4000); }catch(e){}
    if(!silent){
      const b=r.geometry.coordinates.reduce((bb,c)=>bb.extend(c),new maplibregl.LngLatBounds(r.geometry.coordinates[0],r.geometry.coordinates[0]));
      map.fitBounds(b,{padding:{top:160,bottom:90,left:50,right:50}});
      openSheet("routeSheet");                  // open first — a render hiccup can never block Start again
      try{ renderRouteSheet(r); }catch(e){ try{console.warn("route card render",e);}catch(_){} }
      loadWeather(); loadElevation(r);
    }
  }catch(e){ toast("Routing failed — check connection.",2600); }
  finally{ S.rerouting=false; }
}
/* ═══════════ traffic signals ═══════════
   Drawn as a GeoJSON circle layer, NOT DOM markers. Downtown viewports hold several hundred
   signals — an order of magnitude more than hazards — and every DOM marker is an element the
   browser repositions on each frame of a drag. That is exactly the sluggishness we already
   chased out of the hazard layer, so signals never get to reintroduce it: the GPU draws these.

   Deliberately NOT shown: signal state (red/green). There is no public phase feed for Detroit
   — SPaT data lives inside closed connected-vehicle pilots — so any colour we rendered would
   be a guess wearing the costume of a fact. A driver glancing at a "green" that is actually
   red is the one failure mode here that could get someone hurt. Locations only. */
var SIG_MINZ=15;                      // below this they're clutter, not information
var _sigFeat={};                      // id -> feature, deduped across overlapping fetches
var _sigDone=[];                      // bbox keys already fetched this session
var _sigT=null, _sigBusy=false;

function _sigCacheLoad(){
  try{
    var c=JSON.parse(localStorage.getItem("cw_sig")||"null");
    if(c && c.t && Date.now()-c.t < 14*864e5 && Array.isArray(c.f)){       // signals move rarely; a fortnight is safe
      c.f.forEach(function(p){ _sigFeat[p[0]]={type:"Feature",properties:{},geometry:{type:"Point",coordinates:[p[1],p[2]]}}; });
      /* Deliberately NOT restoring the covered-bbox list. It used to persist alongside the
         nodes, but the node cache is capped and drops the oldest entries — so after enough
         driving the app believed a box was covered while the nodes for it had been evicted,
         and the lights simply stopped appearing. Session-only: worst case we re-query one
         viewport on launch, which is cheap and self-correcting. */
      _sigDone=[]; _sigClusterDirty=true;
    }
  }catch(e){}
}
function _sigCacheSave(){
  try{
    var f=[];
    for(var id in _sigFeat){ var c=_sigFeat[id].geometry.coordinates; f.push([id,+c[0].toFixed(5),+c[1].toFixed(5)]); }
    if(f.length>4000) f=f.slice(-4000);                                    // hard cap so localStorage can't bloat
    localStorage.setItem("cw_sig",JSON.stringify({t:Date.now(),f:f}));
  }catch(e){}
}
/* WHY THE DOTS SIT OFF THE INTERSECTION
   OSM does not tag one signal per junction. `highway=traffic_signals` goes on the STOP LINE of
   each approaching way — so a normal four-way crossing carries three or four separate nodes,
   each set back 10-30m from the junction centre on its own arm. Rendered raw, that's what we
   shipped in v230: a scatter of lights leading up to the corner instead of one light ON it.
   Apple shows one glyph per intersection, and that's what this does: group nodes that are
   within CLUSTER_M of each other and draw a single marker at their centroid, which lands on
   the junction because the approaches surround it.
   Grid-hashed rather than pairwise — a downtown viewport is hundreds of nodes and O(n squared)
   would stall the frame. Each node hashes into a ~CLUSTER_M cell and we only compare against
   the 9 cells around it, which is linear in practice. */
var SIG_CLUSTER_M=38;
var _sigClustered=null, _sigClusterDirty=true;
function _sigClusters(){
  if(_sigClustered && !_sigClusterDirty) return _sigClustered;
  var pts=[];
  for(var id in _sigFeat){ var c=_sigFeat[id].geometry.coordinates; pts.push({lng:c[0],lat:c[1],used:false}); }
  var cell=SIG_CLUSTER_M/111320;                       // degrees of latitude per cell
  var grid={};
  function key(la,ln){ return Math.floor(la/cell)+"|"+Math.floor(ln/cell); }
  pts.forEach(function(p,i){ var k=key(p.lat,p.lng); (grid[k]||(grid[k]=[])).push(i); });
  var out=[];
  pts.forEach(function(p,i){
    if(p.used) return;
    var gi=Math.floor(p.lat/cell), gj=Math.floor(p.lng/cell);
    var members=[];
    for(var a=-1;a<=1;a++) for(var b=-1;b<=1;b++){
      var arr=grid[(gi+a)+"|"+(gj+b)]; if(!arr) continue;
      for(var n=0;n<arr.length;n++){
        var q=pts[arr[n]];
        if(q.used) continue;
        if(distM({lat:p.lat,lng:p.lng},{lat:q.lat,lng:q.lng})<=SIG_CLUSTER_M) members.push(arr[n]);
      }
    }
    if(!members.length) members=[i];
    var sla=0,sln=0;
    members.forEach(function(mi){ pts[mi].used=true; sla+=pts[mi].lat; sln+=pts[mi].lng; });
    out.push({lat:sla/members.length, lng:sln/members.length, n:members.length});
  });

  /* MERGE PASS. The greedy pass above seeds from whichever node happens to come first, which
     is never the junction itself — it is one arm's stop line, 20-30m out. A node on the
     OPPOSITE arm is then up to ~60m from that seed, past the 38m radius, so it starts a second
     cluster and the intersection renders as two half-lights flanking the corner instead of one
     sitting on it. Merging clusters whose centroids are close pulls those halves back together,
     and weighting by member count puts the result on the junction rather than between two
     arbitrary points. Repeated until stable, because a merge can bring a third arm in range. */
  for(var pass=0; pass<4; pass++){
    var merged=false;
    for(var x=0; x<out.length; x++){
      if(!out[x]) continue;
      for(var y=x+1; y<out.length; y++){
        if(!out[y]) continue;
        /* Cheap reject before the trig: distM is the hot call here and most pairs downtown are
           nowhere near each other. A latitude gate rules those out for the cost of a subtract. */
        if(Math.abs(out[x].lat-out[y].lat) > cell*2) continue;
        if(distM(out[x],out[y])>SIG_CLUSTER_M*1.5) continue;
        var tot=out[x].n+out[y].n;
        out[x]={ lat:(out[x].lat*out[x].n + out[y].lat*out[y].n)/tot,
                 lng:(out[x].lng*out[x].n + out[y].lng*out[y].n)/tot, n:tot };
        out[y]=null; merged=true;
      }
    }
    out=out.filter(function(c){ return !!c; });
    if(!merged) break;
  }

  _sigClustered=out.map(function(c){
    return {type:"Feature",properties:{n:c.n},
            geometry:{type:"Point",coordinates:[c.lng,c.lat]}};
  });
  _sigClusterDirty=false;
  return _sigClustered;
}
function _sigData(){
  return {type:"FeatureCollection",features:_sigClusters()};
}
/* The signal glyph is drawn to a canvas at boot rather than shipped as a PNG: one less file to
   keep in sync across the repo + service worker cache, it stays crisp at any device pixel ratio,
   and the housing colour can follow the theme. All three lamps are lit deliberately — this is a
   SIGN meaning "signalised intersection", not a claim about the current phase. Lighting only one
   would read as live state we do not have. */
function _signalIcon(){
  /* Proportions matched to Apple's: a stubbier housing (5:7, not the 5:11 tower v230 shipped),
     a generous corner radius so it reads as a rounded capsule rather than a bar, and small
     evenly-spaced lamps with real gaps between them. v230's lamps were oversized, crowded and
     wrapped in an alpha halo, which at map scale merged into one smear. No halo now — at 12px
     on screen, crispness IS the detail. */
  var r=Math.min(4,Math.max(2,Math.ceil(window.devicePixelRatio||2)));
  var SS=2;                                         // supersample, then let the GPU downfilter
  var w=21, h=29;                                   // logical size
  var c=document.createElement("canvas"); c.width=w*r*SS; c.height=h*r*SS;
  var x=c.getContext("2d"); x.scale(r*SS,r*SS);
  x.imageSmoothingEnabled=true; x.imageSmoothingQuality="high";
  function rrect(a,b,ww,hh,rad){
    x.beginPath();
    x.moveTo(a+rad,b);
    x.arcTo(a+ww,b,a+ww,b+hh,rad); x.arcTo(a+ww,b+hh,a,b+hh,rad);
    x.arcTo(a,b+hh,a,b,rad);       x.arcTo(a,b,a+ww,b,rad);
    x.closePath();
  }
  // soft drop shadow lifts it off the road surface the way Apple's does
  x.save();
  x.shadowColor="rgba(0,0,0,.45)"; x.shadowBlur=2.2; x.shadowOffsetY=.7;
  x.fillStyle="#F2F2F0"; rrect(1.2,1.2,w-2.4,h-2.4,7.2); x.fill();       // white rim, warm not pure
  x.restore();
  x.fillStyle="#1C1C1E"; rrect(3.6,3.6,w-7.2,h-7.2,5.2); x.fill();       // dark housing
  // three lamps, evenly spaced with breathing room top and bottom
  var lamps=[["#F0483E",9.1],["#F5A623",14.5],["#39B54A",19.9]];
  lamps.forEach(function(L){
    x.beginPath(); x.arc(w/2,L[1],2.35,0,Math.PI*2);
    x.fillStyle=L[0]; x.fill();
  });
  // downsample the supersampled render so the curves land smooth at map size
  var out=document.createElement("canvas"); out.width=w*r; out.height=h*r;
  var ox=out.getContext("2d");
  ox.imageSmoothingEnabled=true; ox.imageSmoothingQuality="high";
  ox.drawImage(c,0,0,out.width,out.height);
  return {canvas:out,w:w*r,h:h*r,ratio:r};
}
function _addSignalImage(){
  try{
    if(map.hasImage&&map.hasImage("cw-signal")) return true;
    var ic=_signalIcon();
    var d=ic.canvas.getContext("2d").getImageData(0,0,ic.w,ic.h);
    map.addImage("cw-signal",{width:ic.w,height:ic.h,data:new Uint8Array(d.data.buffer)},{pixelRatio:ic.ratio});
    return true;
  }catch(e){ return false; }
}
function ensureSignalLayer(){
  try{
    if(!S.mapReady||!map) return;
    if(!map.getSource("signals")) map.addSource("signals",{type:"geojson",data:_sigData()});
    var hasImg=_addSignalImage();
    if(!map.getLayer("signal-dots")){
      // Sits BELOW the route line: a signal must never obscure the line you're following.
      var before = map.getLayer("route-casing") ? "route-casing" : undefined;
      if(hasImg){
        map.addLayer({id:"signal-dots",type:"symbol",source:"signals",minzoom:SIG_MINZ,
          layout:{
            "icon-image":"cw-signal",
            "icon-size":["interpolate",["linear"],["zoom"],15,.26,17,.44,19,.62],
            "icon-anchor":"center",
            // declutter naturally: at wide zooms MapLibre drops the ones that would collide,
            // and only at close zoom do we let every signal through
            "icon-allow-overlap":["step",["zoom"],false,17,true],
            "icon-ignore-placement":["step",["zoom"],false,17,true],
            "icon-pitch-alignment":"viewport",       // stays upright when the map tilts for nav
            "icon-rotation-alignment":"viewport"
          },
          paint:{"icon-opacity":["interpolate",["linear"],["zoom"],15,.7,16.5,1]}
        }, before);
      } else {
        // canvas/addImage unavailable — fall back to a plain dot rather than showing nothing
        map.addLayer({id:"signal-dots",type:"circle",source:"signals",minzoom:SIG_MINZ,
          paint:{"circle-radius":["interpolate",["linear"],["zoom"],15,2.6,19,6.5],
                 "circle-color":"#FFB020","circle-stroke-width":1,"circle-stroke-color":"rgba(20,22,25,.85)"}}, before);
      }
    }
    applySignalVis();
  }catch(e){}
}
function applySignalVis(){
  // Full detail shows them (the default, so a new driver gets them without hunting for a
  // setting); Clean and Minimal hide them along with the other ConeWatch overlays.
  try{ if(map.getLayer("signal-dots")) map.setLayoutProperty("signal-dots","visibility",(S.mapMode||"full")==="full"?"visible":"none"); }catch(e){}
}
function _sigPush(els){
  var n=0;
  (els||[]).forEach(function(e){
    var lat=e.lat, lng=e.lon;
    if(!isFinite(lat)||!isFinite(lng)) return;
    var id="s"+e.id;
    if(_sigFeat[id]) return;
    _sigFeat[id]={type:"Feature",properties:{},geometry:{type:"Point",coordinates:[lng,lat]}};
    n++; _sigClusterDirty=true;
  });
  if(n){ try{ if(map.getSource("signals")) map.getSource("signals").setData(_sigData()); }catch(e){} _sigCacheSave(); }
  return n;
}
function _bboxKey(b){ return [b[0].toFixed(2),b[1].toFixed(2),b[2].toFixed(2),b[3].toFixed(2)].join(","); }
async function fetchSignals(bbox){
  // overpassFetch is defined in cw-patch.js, which loads AFTER app.js — so it only exists at
  // runtime, never at parse time. Bail quietly rather than throwing if the patch is absent.
  var of = window.overpassFetch;
  if(typeof of!=="function") return 0;
  var key=_bboxKey(bbox);
  if(_sigDone.indexOf(key)>-1) return 0;
  _sigDone.push(key); if(_sigDone.length>60) _sigDone.shift();
  var q="[out:json][timeout:18];node["+'"highway"="traffic_signals"'+"]("+bbox.join(",")+");out skel;";
  try{ var d=await of(q); return _sigPush(d&&d.elements); }
  catch(e){ var i=_sigDone.indexOf(key); if(i>-1) _sigDone.splice(i,1); return 0; }   // let a failed box retry later
}
async function runSignalFetch(){
  try{
    if(!S.mapReady||!map) return;
    if((S.mapMode||"full")!=="full") return;                 // hidden — don't spend the request
    if(map.getZoom()<SIG_MINZ) return;
    if(!navigator.onLine||document.hidden) return;
    if(_sigBusy) return;
    var b=map.getBounds();
    // pad the query past the viewport so a small pan doesn't trigger a fresh round trip
    var pad=0.004;
    var bbox=[b.getSouth()-pad,b.getWest()-pad,b.getNorth()+pad,b.getEast()+pad];
    _sigBusy=true;
    try{ await fetchSignals(bbox); } finally { _sigBusy=false; }
  }catch(e){ _sigBusy=false; }
}
function scheduleSignalFetch(){
  if(_sigT) clearTimeout(_sigT);
  _sigT=setTimeout(runSignalFetch, 700);                       // settle after the pan/zoom stops
}
/* A debounce alone cannot work while driving. cameraFollow() eases the camera on every GPS fix
   (300-1600ms per ease), so a `moveend` lands and the next ease begins well inside the 700ms
   window — the timer is cleared and re-armed forever and the fetch never fires. Signals loaded
   only when the car was stopped. This unconditional tick is the driving path: it ignores the
   debounce entirely, and fetchSignals() already no-ops on a bbox key it has covered, so a
   stationary car costs nothing. */
setInterval(function(){ try{ if(!document.hidden) runSignalFetch(); }catch(e){} }, 11000);
try{ _sigCacheLoad(); }catch(e){}

/* How many signals a candidate route actually passes through. This is the honest version of
   "avoid traffic lights": we can't know their timing, but we can count them, and a route with
   four lights genuinely drives differently from one with sixteen. */
/* "323 min" makes a driver do arithmetic to understand their own trip. Past an hour, say hours.
   The summary above the picker already reads "5h 23", so this also makes the two agree. */
function fmtDur(mins){
  var m=Math.max(0,Math.round(mins||0));
  if(m<60) return m+" min";
  var h=Math.floor(m/60), r=m%60;
  return r ? (h+"h "+r) : (h+"h");
}
function routeSignalCount(rt){
  try{
    var co=(rt.geometry&&rt.geometry.coordinates)||[];
    if(co.length<2) return null;
    // Count CLUSTERS, not raw nodes: a four-way junction carries three or four stop-line nodes
    // in OSM, so counting raw would report ~4x the lights a driver actually stops at.
    var cl=_sigClusters();
    if(!cl.length) return null;                                // nothing fetched yet — say nothing rather than "0 lights"
    var n=0;
    for(var i=0;i<cl.length;i++){
      var c=cl[i].geometry.coordinates, p={lat:c[1],lng:c[0]};
      for(var k=0;k<co.length;k+=2){
        if(distM({lat:co[k][1],lng:co[k][0]},p)<38){ n++; break; }
      }
    }
    /* COVERAGE. Signals are only fetched where the app has actually looked — the viewport and
       the route corridor. On a 285-mile route to Chicago that means Detroit and little else, so
       "6 lights" was not wrong so much as a count of the fraction we happen to know about,
       presented as if it were the whole trip. Work out how much of the route falls inside the
       area we have signal data for, and if a real part of it does not, say the number is a
       floor rather than a total. A driver can act on "at least 6"; they cannot act on a number
       that is silently short. */
    var bb=_sigBBox();
    if(!bb) return {n:n,partial:true};
    var inside=0, checked=0;
    for(var q=0;q<co.length;q+=Math.max(1,Math.floor(co.length/40))){
      checked++;
      var la=co[q][1], ln=co[q][0];
      if(la>=bb.s && la<=bb.n && ln>=bb.w && ln<=bb.e) inside++;
    }
    return {n:n, partial: checked>0 && (inside/checked)<0.9};
  }catch(e){ return null; }
}
/* The bounding box of everything we have signal data for. Cheap: the cluster list is already
   built, so this is one pass over points we have anyway. */
function _sigBBox(){
  try{
    var cl=_sigClusters(); if(!cl.length) return null;
    var n=-90,s2=90,e=-180,w=180;
    for(var i=0;i<cl.length;i++){
      var c=cl[i].geometry.coordinates;
      if(c[1]>n)n=c[1]; if(c[1]<s2)s2=c[1];
      if(c[0]>e)e=c[0]; if(c[0]<w)w=c[0];
    }
    /* Pad by roughly a kilometre so a route hugging the edge is not called uncovered. */
    return {n:n+0.01, s:s2-0.01, e:e+0.01, w:w-0.01};
  }catch(e){ return null; }
}
/* Fetch signals across the whole route corridor once, so the count on the picker reflects the
   entire route rather than only the part that happened to be on screen. */
var _sigRouteKey=null;
async function annotateRouteSignals(alts){
  try{
    if(!alts||!alts.length) return;
    if(typeof window.overpassFetch!=="function") return;
    var minLat=90,maxLat=-90,minLng=180,maxLng=-180;
    alts.forEach(function(rt){
      var co=(rt.geometry&&rt.geometry.coordinates)||[];
      for(var k=0;k<co.length;k+=4){
        if(co[k][1]<minLat)minLat=co[k][1]; if(co[k][1]>maxLat)maxLat=co[k][1];
        if(co[k][0]<minLng)minLng=co[k][0]; if(co[k][0]>maxLng)maxLng=co[k][0];
      }
    });
    if(minLat>maxLat) return;
    // A cross-country route would ask Overpass for an enormous box and time out; skip those
    // rather than hang the picker. Signal counting is a city-driving feature.
    if((maxLat-minLat)>0.9||(maxLng-minLng)>0.9) return;
    var key=[minLat.toFixed(3),minLng.toFixed(3),maxLat.toFixed(3),maxLng.toFixed(3)].join(",");
    if(_sigRouteKey===key) return; _sigRouteKey=key;
    var pad=0.006;
    var got=await fetchSignals([minLat-pad,minLng-pad,maxLat+pad,maxLng+pad]);
    if(got) try{ renderRouteAlts(); }catch(e){}                // counts changed — repaint the chips
  }catch(e){}
}

/* ═══════════ route alternatives ═══════════
   Name a route by a distinctive road it uses, so "via I-75" beats "Route 2". Pulled from the
   step names OSRM already returns — prefer a numbered highway, else the longest-used street. */
/* ═══════════ hazard-aware route scoring ═══════════
   Every navigation app picks by predicted duration. ConeWatch knows things they don't: which
   streets drivers have reported closed, jammed, flooded or torn up in the last hour, plus the
   road-roughness log this device has been building from its own accelerometer.
   So instead of picking the nominally-fastest line, score each alternative by
   duration + what the network says it'll actually cost you, and pick the best composite.

   Penalties are in SECONDS, chosen to reflect real time lost rather than how alarming the
   icon looks. Nothing disqualifies a route — a driver has to be able to get there even if
   every option is reported bad, so the worst case is a heavy penalty, never no route.

   Deliberately zero: police and cameras. They cost you nothing but your speed being legal,
   and routing around law enforcement is not a thing this app should do. Potholes are a light
   touch too — we warn about those on approach, which is the better answer than a detour. */
const ROUTE_PENALTY = {
  road_closure:300, flooding:240, power_lines:200, traffic:180, ice:180,
  accident:150, emergency:120, construction_cones:90, stalled:60, debris:45,
  animal:20, pothole:15, speed_bump:10, camera:0, camera_flock:0, police:0
};
function routeHazardCost(rt){
  var cost=0, hits=[];
  try{
    var co=(rt.geometry&&rt.geometry.coordinates)||[];
    if(!co.length||!S.hazards||!S.hazards.length) return {cost:0,hits:[]};
    S.hazards.forEach(function(h){
      var w=ROUTE_PENALTY[h.type];
      if(!w) return;                                  // zero-weight or unknown type
      var best=Infinity;
      for(var k=0;k<co.length;k+=3){                  // every 3rd vertex is plenty at this scale
        var d=distM({lat:co[k][1],lng:co[k][0]},h);
        if(d<best) best=d;
        if(best<30) break;
      }
      if(best<40){
        // a hazard several drivers have confirmed is more likely to be real, and worse
        var conf=Math.min(2.5,1+((h.reports||1)-1)*0.35);
        cost += w*conf;
        hits.push(h.type);
      }
    });
  }catch(e){}
  return {cost:cost,hits:hits};
}
function routeRoughCost(rt){
  // Road quality this device has measured itself. Capped low: rough pavement is worth
  // avoiding but never worth a big detour.
  var cost=0;
  try{
    if(!roughPts||!roughPts.length) return 0;
    var co=(rt.geometry&&rt.geometry.coordinates)||[];
    var recent=roughPts.filter(function(p){ return Date.now()-p.t < 30*864e5; });
    var n=0;
    recent.forEach(function(p){
      for(var k=0;k<co.length;k+=6){
        if(distM({lat:co[k][1],lng:co[k][0]},p)<35){ n+=p.s; break; }
      }
    });
    cost=Math.min(90,n*8);
  }catch(e){}
  return cost;
}
function scoreRoute(rt){
  var hz=routeHazardCost(rt);
  var rough=routeRoughCost(rt);
  return { total:(rt.duration||0)+hz.cost+rough, hazCost:hz.cost, hits:hz.hits, rough:rough };
}
function routeAltNote(sc){
  if(!sc.hits.length && sc.rough<20) return "clear";
  var counts={};
  sc.hits.forEach(function(t){ counts[t]=(counts[t]||0)+1; });
  var parts=Object.keys(counts).map(function(t){
    var lbl=(HZ_META[t]&&HZ_META[t].label)||t;
    return counts[t]>1?(counts[t]+" "+lbl.toLowerCase()):lbl.toLowerCase();
  });
  if(!parts.length && sc.rough>=20) return "rough surface";
  return parts.slice(0,2).join(", ");
}
function routeAltName(rt){
  try{
    var steps=(rt.legs||[]).flatMap(function(l){ return l.steps||[]; });
    var byName={};
    steps.forEach(function(st){
      var n=(st.name||"").trim(); if(!n) return;
      byName[n]=(byName[n]||0)+(st.distance||0);
    });
    var names=Object.keys(byName);
    if(!names.length) return "Alternate";
    var hwy=names.filter(function(n){ return /\b(I-|US-|M-|SR-|Hwy|Fwy|Freeway|Expressway)\b/i.test(n); })
                 .sort(function(a,b){ return byName[b]-byName[a]; })[0];
    var best=hwy||names.sort(function(a,b){ return byName[b]-byName[a]; })[0];
    return "via "+best;
  }catch(e){ return "Alternate"; }
}
function selectRouteAlt(i){
  var alts=S.routeAlts||[]; if(!alts[i]) return;
  S.routeAltIdx=i;
  var r=alts[i];
  S.route=r; S.steps=r.legs.flatMap(function(l){ return l.steps; });
  S.stepIdx=0; S.peekIdx=null; S.offRouteCount=0; S.alerted.clear();
  S._ri=undefined; S._riT=0;
  try{ map.getSource("route").setData({type:"Feature",geometry:r.geometry}); }catch(e){}
  try{ refreshRouteCondition(); }catch(e){}
  try{ renderRouteSheet(r); }catch(e){}
  try{ loadElevation(r); }catch(e){}
}
function renderRouteAlts(){
  var box=$("routeAlts"); if(!box) return;
  var alts=S.routeAlts||[];
  if(alts.length<2){ box.style.display="none"; box.innerHTML=""; return; }
  box.style.display="flex"; box.innerHTML="";
  try{ annotateRouteSignals(alts); }catch(e){}
  alts.forEach(function(rt,i){
    var mins=Math.max(1,Math.round(rt.duration*rushFactor()/60));
    var km=S.units==="km", dv=km?(rt.distance/1000):(rt.distance/1609.34);
    var b=document.createElement("button");
    b.className="chip"+(i===S.routeAltIdx?" on":"");
    var sc=rt._sc||scoreRoute(rt);
    var note=routeAltNote(sc);
    // Signal count is omitted entirely when we haven't fetched the corridor yet — showing
    // "0 lights" for "we don't know" would be worse than showing nothing.
    var sig=routeSignalCount(rt);
    var sigTxt="";
    if(sig && typeof sig==="object"){
      /* "6+ lights" when we only have data for part of the route — an honest floor beats a
         confident undercount. */
      sigTxt=" · "+sig.n+(sig.partial?"+":"")+" light"+(sig.n===1&&!sig.partial?"":"s");
    }
    b.innerHTML="<b>"+fmtDur(mins)+"</b><br><small>"+routeAltName(rt)+" · "+dv.toFixed(1)+(km?"km":"mi")+
      "</small><br><small style=\"opacity:.75\">"+(note==="clear"?"\u2713 clear":"\u26A0 "+note)+sigTxt+"</small>";
    b.onclick=function(){ selectRouteAlt(i); renderRouteAlts(); };
    box.appendChild(b);
  });
}
function renderRouteSheet(r){
  const el=(id)=>{ try{ return $(id); }catch(e){ return null; } };
  const setTxt=(id,v)=>{ const e=el(id); if(e) e.textContent=v; };
  setTxt("rsTitle",S.destName);
  try{ renderRouteAlts(); }catch(e){}
  const rush=rushFactor()>1?" · rush-hour adjusted":"";
  const secs=r.duration*rushFactor();
  const arrClock=new Date(Date.now()+secs*1000).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  // big glanceable numbers, Apple-style: time / arrival / distance
  const mins=Math.max(1,Math.round(secs/60));
  const timeTxt = mins<60 ? String(mins) : (Math.floor(mins/60)+"h "+(mins%60||"")).trim();
  const timeUnit= mins<60 ? "min" : "";
  try{
    setTxt("rsTime",timeTxt);
    const t0=el("rsTime"); if(t0&&t0.parentNode&&t0.parentNode.querySelector){ const tu=t0.parentNode.querySelector("small"); if(tu) tu.textContent=timeUnit||"total"; }
    setTxt("rsArrive",arrClock);
    const km=S.units==="km";
    const dv=km?(r.distance/1000):(r.distance/1609.34);
    setTxt("rsDist",dv>=100?Math.round(dv):dv.toFixed(1));
    setTxt("rsDistU",km?"km":"mi");
  }catch(e){}
  // legacy layout (older index.html): keep the summary line useful so nothing looks broken
  try{ if(!el("rsStats")) setTxt("rsMeta",`${fmtDist(r.distance)} · ${fmtDur(secs)} · arrive ${arrClock}`); }catch(e){}
  let avoidTxt="";
  if(S.mode==="car"&&(S.avoidTolls||S.avoidHwy)){
    const wants=[S.avoidHwy?"highways":null,S.avoidTolls?"tolls":null].filter(Boolean).join(" & ");
    if(!S.avoidApplied) avoidTxt=` · couldn't avoid ${wants}`;
    else if(S.avoidMode==="exact"||S.avoidMode==="clear") avoidTxt=` · avoiding ${wants}`;
    else if(S.avoidMode==="best") avoidTxt=` · least-freeway route`;
    else avoidTxt=` · freeway unavoidable here`;
  }
  if(el("rsStats")) setTxt("rsMeta",`${S.mode}${rush}${S.origin?" · custom start":""}${avoidTxt}`);
  try{
    // second line = full address, the way a maps app shows it
    const da=el("rsDestAddr");
    if(da){ let addr=(S.destLabel||"").replace(/^\s*/,""); 
      if(addr && S.destName && addr.toLowerCase().indexOf(S.destName.toLowerCase())===0) addr=addr.slice(S.destName.length).replace(/^[,\s]+/,"");
      da.textContent=addr.split(",").slice(0,3).join(",").trim(); }
    const fa=el("rsFromAddr");
    if(fa) fa.textContent = S.origin ? (S.originAddr||"") : (S.pos?"Current location":"");
  }catch(e){}
  try{ _setFromUI(); }catch(e){}
  try{ renderRouteOpts(); }catch(e){}
  const sl=el("stopsList"); if(sl) sl.innerHTML="";
  S.stops.forEach((s,i)=>{
    const b=document.createElement("button");b.className="row-btn";
    b.innerHTML=`<span class="ic">📍</span><span>Stop ${i+1}: ${s.name}<small>Tap to remove</small></span>`;
    b.onclick=()=>{S.stops.splice(i,1);stopMarkers.splice(i,1)[0].remove();stopMarkers.forEach((m,j)=>m.getElement().textContent=j+1);fetchRoute();};
    if(sl) sl.appendChild(b);
  });
  const mpg=parseFloat((el("mpg")||{}).value)||22,gas=parseFloat((el("gasPrice")||{}).value)||2.89;
  const gal=(r.distance/1609.34)/mpg,fuel=(gal*gas).toFixed(2);
  const curve=curveScore(r.geometry.coordinates);
  /* The route card listed fuel, curves, weather and elevation — everything except the thing this
     app exists for. Count the reports actually sitting on this line before the driver commits. */
  const onRoute=(function(){
    try{
      const co=r.geometry.coordinates||[];
      if(!co.length) return null;
      const hits=(S.hazards||[]).filter(function(h){
        if(!h||!isFinite(h.lat)||!notDismissed(h)) return false;
        for(let i=0;i<co.length;i+=3){                       // every 3rd vertex is plenty at 60m
          if(distM({lat:co[i][1],lng:co[i][0]},{lat:h.lat,lng:h.lng})<60) return true;
        }
        return false;
      });
      if(!hits.length) return {n:0,txt:"Clear — nothing reported"};
      const by={}; hits.forEach(function(h){ by[h.type]=(by[h.type]||0)+1; });
      /* The breakdown showed only the top THREE types but the total counted all of them, so
         "7 + 4 + 2 · 14 total" did not add up — a fourth category was being dropped in silence.
         Show every type present; if there are more than four, roll the tail into "+N" so the
         row still adds to the stated total. */
      const keys=Object.keys(by).sort(function(a,b){return by[b]-by[a];});
      const shown=keys.slice(0,4);
      const parts=shown.map(function(k){ const m=HZ_META[k]||{emoji:"⚠️",label:k}; return m.emoji+" "+by[k]; });
      const restN=keys.slice(4).reduce(function(a,k){ return a+by[k]; },0);
      if(restN) parts.push("+"+restN);
      return {n:hits.length,txt:parts.join("  ")+"  ·  "+hits.length+" total"};
    }catch(e){ return null; }
  })();
  if(el("tripStats")) $("tripStats").innerHTML=`
    <div class="kv"><span>Est. fuel cost</span><span>$${fuel} (${gal.toFixed(1)} gal @ ${mpg} mpg)</span></div>
    ${onRoute?`<div class="kv"><span>Hazards on route</span><span style="color:${onRoute.n?"var(--orange,#FF8A2B)":"var(--green,#46C08A)"}">${onRoute.txt}</span></div>`:""}
    <div class="kv"><span>Road character</span><span>${curve.label} · ${curve.turns} sharp turns</span></div>
    <div class="kv"><span>Weather at destination</span><span id="wxDest">${_offNow()?"unavailable offline":"loading…"}</span></div>
    <div class="kv"><span>Elevation</span><span id="elevStat">${_offNow()?"unavailable offline":"loading…"}</span></div>`;
  try{ _settleStat("wxDest"); _settleStat("elevStat"); }catch(e){}
  const ol=el("steps"); if(ol) ol.innerHTML="";
  S.steps.forEach((st,i)=>{
    const li=document.createElement("li");
    li.innerHTML=`<span class="n">${i+1}</span><span class="t">${stepText(st)}</span><span class="d">${fmtDist(st.distance)}</span>`;
    if(ol) ol.appendChild(li);
  });
  const sh=el("stepsHead"), sc=el("stepsCount");
  if(sh) sh.style.display = S.steps.length ? "flex" : "none";
  if(sc) sc.textContent = S.steps.length ? (S.steps.length+" steps") : "";
}
function curveScore(coords){
  let turns=0;
  for(let i=2;i<coords.length;i+=2){
    const a={lng:coords[i-2][0],lat:coords[i-2][1]},b={lng:coords[i-1][0],lat:coords[i-1][1]},c={lng:coords[i][0],lat:coords[i][1]};
    let d=Math.abs(bearing(a,b)-bearing(b,c));if(d>180)d=360-d;
    if(d>45)turns++;
  }
  return {turns,label:turns<4?"Mostly straight":turns<12?"Some curves":"Twisty — take it easy"};
}
function stepText(st){
  const m=st.maneuver,road=st.name?` onto ${st.name}`:"";
  const mod=m.modifier?m.modifier.replace("slight ","slightly "):"";
  switch(m.type){
    case "depart":return `Head ${mod||"out"}${st.name?" on "+st.name:""}`;
    case "arrive":return st===S.steps[S.steps.length-1]?"Arrive at your destination":"Arrive at stop";
    case "turn":return `Turn ${mod}${road}`;
    case "new name":case "continue":return `Continue${road}`;
    case "merge":return `Merge ${mod}${road}`;
    case "on ramp":return `Take the ramp${road}`;
    case "off ramp":return `Take the exit${road}`;
    case "fork":return `Keep ${mod}${road}`;
    case "roundabout":case "rotary":return `Roundabout${m.exit?` — exit ${m.exit}`:""}${road}`;
    case "end of road":return `End of road — ${mod}${road}`;
    default:return `${m.type} ${mod}${road}`.trim();
  }
}

/* ═══════════ weather + elevation ═══════════ */
async function loadWeather(){
  if(!S.dest) return;
  try{
    const u=`https://api.open-meteo.com/v1/forecast?latitude=${S.dest.lat}&longitude=${S.dest.lng}&current=temperature_2m,precipitation,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph`;
    const d=await (await fetchT(u,6000)).json();const c=d.current;
    const desc=wxDesc(c.weather_code);
    const el=document.getElementById("wxDest");
    if(el)el.textContent=`${Math.round(c.temperature_2m)}°F ${desc}${c.precipitation>0?" · precip":""} · wind ${Math.round(c.wind_speed_10m)} mph`;
    $("nbWx").textContent=`${Math.round(c.temperature_2m)}° ${desc}`;
  }catch{}
}
function wxDesc(c){if(c===0)return "clear";if(c<=3)return "partly cloudy";if(c<=48)return "fog";if(c<=57)return "drizzle";if(c<=67)return "rain";if(c<=77)return "snow";if(c<=82)return "showers";if(c<=86)return "snow showers";return "storms";}
async function loadElevation(r){
  try{
    const coords=r.geometry.coordinates;
    const step=Math.max(1,Math.floor(coords.length/80));
    const samp=coords.filter((_,i)=>i%step===0);
    const d=await (await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${samp.map(c=>c[1].toFixed(5)).join(",")}&longitude=${samp.map(c=>c[0].toFixed(5)).join(",")}`)).json();
    const ele=d.elevation;if(!ele?.length)return;
    let climb=0;for(let i=1;i<ele.length;i++){const g=ele[i]-ele[i-1];if(g>0)climb+=g;}
    const st=document.getElementById("elevStat");
    if(st)st.textContent=`${Math.round(Math.min(...ele)*3.28)}–${Math.round(Math.max(...ele)*3.28)} ft · +${Math.round(climb*3.28)} ft climb`;
    drawElev(ele);
  }catch{}
}
function drawElev(ele){
  const cv=$("elev"),ctx=cv.getContext("2d");
  ctx.clearRect(0,0,cv.width,cv.height);
  const min=Math.min(...ele),max=Math.max(...ele),rng=Math.max(1,max-min);
  ctx.beginPath();
  ele.forEach((e,i)=>{const x=(i/(ele.length-1))*cv.width,y=cv.height-8-((e-min)/rng)*(cv.height-24);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.strokeStyle="#46C08A";ctx.lineWidth=3;ctx.stroke();
  ctx.lineTo(cv.width,cv.height);ctx.lineTo(0,cv.height);ctx.closePath();
  ctx.fillStyle="rgba(70,192,138,.12)";ctx.fill();
}

/* ═══════════ navigation ═══════════ */
async function startNavigation(){
  if(!S.route)return;
  // Routing from a place you aren't is a legitimate thing to want (planning ahead, checking a trip
  // for someone else). Keep the route; just don't fight the driver with reroutes until they're
  // actually on it.
  S.remoteStart = !!S.origin;
  if(S.remoteStart) toast("Following the planned route — guidance starts when you reach it.",4200);
  // Navigation used to force heading-up every time, silently overriding a driver who had
  // deliberately chosen north-up. Respect the stored preference instead — this is the exact
  // thing Apple gets asked for and doesn't do.
  var _nu=false; try{ _nu=localStorage.getItem("cw_north_up")==="1"; }catch(e){}
  S.navigating=true;S.follow=true;S.headingUp=!_nu;
  if(_nu){ try{ map.easeTo({bearing:0}); }catch(e){} }
  updateFollowUI();updateCompassUI();
  try{$("confirmBar").style.display="none";}catch(e){}   // clean hand-off — no overlapping cards
  closeSheets();
  $("navbanner").style.display="block";
  S.peekIdx=null; S._bnFull=true; try{ $("navbanner").classList.remove("nb-collapsed"); }catch(e){}
  try{ _peekChrome(); }catch(e){}   // arm the ‹ › step-preview chrome
  try{ if(typeof wireBannerSwipe==="function") wireBannerSwipe(); }catch(e){}
  $("navPill").style.display="flex";
  $("roadPill").style.display="flex";
  try{cameraFollow();}catch(e){} try{navTick();}catch(e){} try{loadWeather();}catch(e){}
  try{startSmooth();}catch(e){} try{setDrivingChrome(true);}catch(e){}
  document.body.classList.add("driving"); layout();
  try{if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});}catch{}
  requestWakeLock(); requestMotion();
  pollLimit(); clearInterval(limitTimer);
  limitTimer=setInterval(function(){
    if(document.hidden) return;                       // no map on screen — nothing to update
    if(S.limit && (S.speedMph||0) < 3) return;        // stopped and we already know the limit
    pollLimit();
  },18000);
  speak("Starting navigation to "+S.destName+".");
  toast("Navigation started — drive safe. Screen will stay awake.");
  try{ maybeShowTiltHint(); }catch(e){}
}

/* ═══════════ pull-to-dismiss ═══════════
   One gesture language everywhere: whatever is covering the screen, dragging it down puts it
   away. Same commit threshold and same finger-following as the search sheet, so the whole app
   behaves the same way rather than each surface having its own rules.
   Guarded three ways: it only starts at the top of a scrollable, it only commits past 90px, and
   the click that would follow is swallowed so nothing fires behind the gesture. */
function attachPullToDismiss(el, onDismiss, opts){
  if(!el || el.__cwPull) return;
  el.__cwPull = true;
  opts = opts || {};
  var THRESH = opts.threshold || 90;
  var startY=0, armed=false, live=false, base="";
  function pos(e){ return e.clientY; }
  el.addEventListener("pointerdown", function(e){
    if(e.target.closest("input,textarea,select")) return;
    var sc=e.target.closest("[data-scroll],.sheet,#dockMore");
    if(sc && sc.scrollTop>0) return;                 // let content scroll first
    if(opts.canStart && !opts.canStart()) return;
    armed=true; live=false; startY=pos(e); base=el.style.transition;
    /* v259: the overflow lock used to go on HERE, at pointerdown, whenever the sheet was at
       scrollTop 0. That killed scrolling outright: to scroll a list you press and drag, and by
       the time you moved, overflow was already hidden — so an upward drag scrolled nothing and
       a tall sheet (Settings, the report grid) could never reach its own bottom. It read as
       "cut off" because the part below the fold was genuinely unreachable.
       The lock now waits until we KNOW the gesture is a downward pull, decided on first move. */
  });
  el.addEventListener("pointermove", function(e){
    if(!armed && !live) return;
    var dy=pos(e)-startY;
    if(!live){
      if(dy<-6){ armed=false; return; }              // upward: this is a scroll, hands off
      if(dy<10) return;                              // too small to call yet
      live=true; armed=false;
      /* Commit to the pull only now, and take the scroll surface with it. Locking at this
         point still stops the browser stealing the rest of the drag, without ever blocking a
         gesture that turned out to be a scroll. */
      if(el.scrollHeight>el.clientHeight && el.dataset.cwOv===undefined){
        el.dataset.cwOv=el.style.overflowY||""; el.style.overflowY="hidden";
      }
      el.style.transition="none";
      try{ el.setPointerCapture(e.pointerId); }catch(err){}
    }
    var eased=Math.min(dy, THRESH*2.2);
    el.style.transform="translateY("+eased+"px)";
    el.style.opacity=String(Math.max(.45, 1-(eased/(THRESH*3))));
  });
  function restoreScroll(){
    if(el.dataset.cwOv!==undefined){ el.style.overflowY=el.dataset.cwOv; delete el.dataset.cwOv; }
  }
  function end(e){
    restoreScroll();
    if(!live){ armed=false; return; }
    live=false; armed=false;
    var dy=pos(e||{clientY:startY})-startY;
    el.style.transition="transform .26s cubic-bezier(.32,.72,0,1),opacity .2s";
    el.style.transform=""; el.style.opacity="";
    window.addEventListener("click",function h(ev){
      ev.stopPropagation(); ev.preventDefault();
      window.removeEventListener("click",h,true);
    },true);
    if(dy>THRESH){ try{ onDismiss(); }catch(err){} }
  }
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", function(){ end(null); });
  el.addEventListener("pointerleave", function(){ if(!live) restoreScroll(); });
}

/* nav banner: pull down to end the drive. 130px rather than 90 — ending navigation mid-route is
   not something to trigger by brushing the screen. */
try{
  window.addEventListener("load",function(){
    try{
      attachPullToDismiss($("navbanner"), function(){
        endNavigation();
        toast("Navigation ended",2000);
      }, { threshold:130, canStart:function(){ return !!S.navigating; } });
      document.querySelectorAll(".sheet").forEach(function(sh){
        attachPullToDismiss(sh, function(){ try{ closeSheets(); }catch(e){} });
      });
    }catch(e){}
  });
}catch(e){}

function endNavigation(){
  S.navigating=false;S.headingUp=false;S.remoteStart=false;stopSmooth();try{setDrivingChrome(false);}catch(e){}
  try{ if(S.pendingTheme){ const t=S.pendingTheme; S.pendingTheme=null; swapMapStyle(t); } }catch(e){}

  try{speechSynthesis.cancel();}catch{}
  document.body.classList.remove("driving"); layout();
  try{if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});}catch{}
  hideRelock();
  $("navbanner").classList.remove("nb-collapsed");$("navbanner").style.display="none";$("navPill").style.display="none";$("roadPill").style.display="none";$("hud").style.display="none";
  releaseWakeLock();
  clearInterval(limitTimer); $("limitBadge").style.display="none"; S.limit=null;
  // Clear the trip itself — the line, destination pin and route state used to stay on the map
  // after exiting, so the app still looked like it was navigating.
  try{
    S.route=null; S.steps=[]; S.stepIdx=0; S.offRouteCount=0;
    if(S.alerted&&S.alerted.clear) S.alerted.clear();
    S.passedQueue=[];
    S.dest=null; S.destName=""; S.destLabel="";
    S.origin=null; S.originName=""; S.originAddr="";
    const empty={type:"FeatureCollection",features:[]};
    ["route","routeCond","routeArrows","routeCasing"].forEach(id=>{
      try{ if(map.getSource(id)) map.getSource(id).setData(empty); }catch(e){}
    });
    try{ if(destMarker){ destMarker.remove(); destMarker=null; } }catch(e){}
    try{ clearStops(); }catch(e){}
    try{ $("search").value=""; }catch(e){}
    try{ $("confirmBar").style.display="none"; }catch(e){}
    try{ _setFromUI(); }catch(e){}
  }catch(e){}
  map.easeTo({pitch:S.is3d?55:0,bearing:0});
  // A new version arrived mid-drive and the reload was held so it couldn't wipe the live route.
  // The trip is over and cleanup has run, so it's safe to apply now.
  if(S.pendingReload){ S.pendingReload=false; toast("Updating ConeWatch…",1500); setTimeout(function(){ location.reload(); },1700); }
}
$("endnav").onclick=endNavigation;
$("startNav").onclick=startNavigation;
$("closeRoute").onclick=closeSheets;

let _rtCheck=0;
function navTick(){
  if(!S.navigating||!S.pos||!S.route)return;
  if(Date.now()-_rtCheck>3000){ _rtCheck=Date.now(); ensureRouteLayers(); }   // route line can't stay missing
  // Advance by PROGRESS ALONG THE ROUTE, not a 28m circle. At 60mph you travel ~27m between GPS
  // fixes, so a small radius gets skipped entirely and the app stays stuck on step 1 forever
  // (which also made the remaining distance/ETA wildly wrong).
  const _sp=Math.max(28, (S.speedMph||0)*0.44704*2.2);   // speed-scaled catch radius
  while(S.stepIdx<S.steps.length-1){
    const st=S.steps[S.stepIdx];
    const [mlng,mlat]=st.maneuver.location;
    const dMan=distM(S.pos,{lat:mlat,lng:mlng});
    if(dMan<_sp){ S.stepIdx++; continue; }
    // passed it? compare our position along the route with the maneuver's position along the route
    let passed=false;
    try{
      const co=S.route.geometry.coordinates;
      if(co&&co.length>1){
        if(st._ri===undefined){                       // cache each maneuver's index on the line
          let bi=0,bd=Infinity;
          for(let i=0;i<co.length;i++){ const dd=distM({lat:mlat,lng:mlng},{lat:co[i][1],lng:co[i][0]}); if(dd<bd){bd=dd;bi=i;} }
          st._ri=bi;
        }
        if(S._ri===undefined||Date.now()-(S._riT||0)>500){
          let bi=0,bd=Infinity;
          for(let i=0;i<co.length;i++){ const dd=distM(S.pos,{lat:co[i][1],lng:co[i][0]}); if(dd<bd){bd=dd;bi=i;} }
          S._ri=bi; S._riT=Date.now(); S._riD=bd;
        }
        if(S._riD<60 && S._ri>st._ri) passed=true;     // we're on the route, beyond this maneuver
      }
    }catch(e){}
    if(passed) S.stepIdx++; else break;
  }
  const cur=S.steps[S.stepIdx];
  const [lng,lat]=cur.maneuver.location;
  const dNext=distM(S.pos,{lat,lng});
  // If a peeked step has been passed while previewing, drop back to live.
  if(S.peekIdx!=null && S.stepIdx>=S.peekIdx) clearPeek();
  if(S.peekIdx==null) paintManeuver(cur, fmtDist(dNext), S.stepIdx, dNext);
  try{ if($("turnSheet")&&$("turnSheet").classList.contains("open")) renderTurnList(); }catch(e){}
  $("hudDist").textContent=fmtDist(dNext);
  $("hudInstr").textContent=stepText(cur);
  $("hudSpeed").textContent=Math.round(S.speedMph);
  try{ hudPaint(cur); }catch(e){}

  // spoken guidance
  // Speed-aware guidance: at highway speed you need MILES of warning, not 380 metres.
  // Stages fire on time-to-maneuver so they scale from city streets to 70mph freeway.
  if(S.stepIdx!==S.annStep){S.annStep=S.stepIdx;S.annStage=0;}
  const _mps=Math.max(4,(S.speedMph||0)*0.44704);
  const _secs=dNext/_mps;                                  // seconds until the maneuver
  const _fast=(S.speedMph||0)>45;
  const _isExit=/ramp|exit|fork|merge/.test((cur.maneuver&&cur.maneuver.type)||"");
  const _lbl=(cur.exits?("exit "+String(cur.exits).split(";")[0]+", "):"")+stepText(cur);
  if(S.annStage<3 && dNext < (_fast?120:55)){            // final "act now": ~180ft city, ~400ft hwy
    S.annStage=3; turnCue(2); speak(stepText(cur));
  } else if(S.annStage<2 && _secs<15 && dNext<800){       // main heads-up: ~15s lead, capped ~0.5mi
    S.annStage=2; turnCue(2); speak("In "+spokenDist(dNext)+", "+_lbl);
  } else if(S.annStage<1 && _fast && (_secs<60 || dNext<1600) && (_isExit||dNext<1600)){
    S.annStage=1; turnCue(1); speak("In "+spokenDist(dNext)+", "+_lbl);   // ~1 mile heads-up (highway)
  } else if(S.annStage<0.5 && _fast && _isExit && _secs<130){
    S.annStage=0.5; speak("In "+spokenDist(dNext)+", "+_lbl);             // ~2 mile early warning (exits)
  }

  // remaining = distance to the next maneuver + every step AFTER it (the current step was being
  // double-counted, inflating distance and ETA)
  let rem=dNext;for(let i=S.stepIdx+1;i<S.steps.length;i++)rem+=S.steps[i].distance;
  const frac=S.route.distance?Math.min(1,rem/S.route.distance):0;
  const secsLeft=S.route.duration*frac*rushFactor();
  const arr=new Date(Date.now()+secsLeft*1000).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  S.etaArr=arr; S.etaMin=Math.max(1,Math.round(secsLeft/60));
  $("pillMin").textContent=fmtDur(secsLeft);
  $("pillSub").textContent=fmtDist(rem)+" • "+arr;

  // Two-stage pothole warning, deliberately restrained: one soft cue far out, a sharper one when
  // you're nearly on it. Only for hazards actually ON your path — no alarms for the next street over.
  let near=0;
  S.hazards.forEach((h,i)=>{
    const d=distM(S.pos,h);
    if(d<450)near++;
    /* Which hazards count as "ahead of me".
       With a route, match against the route line — that's exact.
       Without one, the old code matched NOTHING and alerted on everything within 520m,
       so a pothole on the freeway you're passing under fired while you were on the surface
       street below. Fall back to heading: a hazard you're actually approaching lies in a
       cone in front of you, not off to the side and not overhead. */
    let onPath=true;
    try{
      if(S.route&&S.route.geometry){
        const co=S.route.geometry.coordinates;
        let best=Infinity;
        for(let k=0;k<co.length;k+=2){ const dd=distM({lat:co[k][1],lng:co[k][0]},h); if(dd<best)best=dd; if(best<25)break; }
        onPath = best<45;
      } else if(isFinite(S.heading) && (S.speedMph||0) >= 8){
        const φ1=S.pos.lat*Math.PI/180, φ2=h.lat*Math.PI/180, Δλ=(h.lng-S.pos.lng)*Math.PI/180;
        const brg=(Math.atan2(Math.sin(Δλ)*Math.cos(φ2),
                   Math.cos(φ1)*Math.sin(φ2)-Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ))*180/Math.PI+360)%360;
        const off=Math.abs(((brg-S.heading+540)%360)-180);
        onPath = off<=42;                    // ±42° cone ahead of travel
      }
    }catch(e){}
    if(!onPath) return;
    const hid=h.id||("idx"+i);          // stable across syncs — index is not
    const k1="w1_"+hid, k2="w2_"+hid;
    if(d<70) notePassed(h);
    // Hazard warnings are for hazards you're APPROACHING. Parked or crawling, you aren't
    // closing on anything, and re-announcing is just noise.
    if((S.speedMph||0) < 5) return;
    if(d<160 && !S.alerted.has(k2)){
      S.alerted.add(k2); S.alerted.add(k1);
      hazardAlert(h,2);
    } else if(d<520 && !S.alerted.has(k1)){
      S.alerted.add(k1);
      hazardAlert(h,1);
    }
  });
  $("nbHz").textContent=near?`⚠ ${near} hazard${near>1?"s":""} ahead`:"";

  if(distM(S.pos,S.dest)<30){
    speak("You have arrived at "+S.destName+".");
    logTrip(S.destName,S.dest.lat,S.dest.lng,S.tripM/1609.34);
    if(S.mode==="car"){QK.park={lat:S.pos.lat,lng:S.pos.lng};saveQK();renderQuick();}
    toast("🏁 Arrived — "+S.destName+(S.mode==="car"?" · parking spot saved":""));
    clearStops();endNavigation();return;}

  // planned-from-elsewhere route: hold off on rerouting until the driver actually joins it
  if(S.remoteStart){
    if(minDistToRoute()<160){ S.remoteStart=false; S.origin=null; S.originName=""; S.originAddr=""; try{_setFromUI();}catch(e){} toast("On the route — guidance live",2200); }
    else { S.offRouteCount=0; }
  }
  const acc=S.accuracy||20;
  if(!S.remoteStart && acc<90 && navigator.onLine){
    const thresh=Math.max(45,acc*2);
    const dR=minDistToRoute();
    // Interchange ambiguity guard: on stacked ramps (I-375/Chrysler etc.) several route
    // vertices sit within a few meters of each other, so the position can snap to the wrong
    // parallel ramp and fake a "wrong turn." When the route folds back near itself like that,
    // hold off rerouting for a beat and let the ambiguity resolve — rerouting here is what sent
    // drivers the wrong way through downtown interchanges.
    let ambiguous=false;
    try{
      const co=S.route.geometry.coordinates;
      if(co&&co.length>2){
        let near=0;
        for(let i=0;i<co.length;i+=2){ if(distM(S.pos,{lat:co[i][1],lng:co[i][0]})<70) near++; if(near>=2)break; }
        // 2+ separate route stretches within 70m = folded/parallel geometry → ambiguous snap
        ambiguous = near>=2 && dR<70;
      }
    }catch(e){}
    // A WRONG TURN shows up as heading divergence long before distance does — catch it immediately.
    let turnedOff=false;
    try{
      const sn=snapToRoute(S.pos);
      if(sn && S.course!==null && (S.speedMph||0)>4){
        let diff=Math.abs(((S.course-sn.bearing+540)%360)-180);
        if(diff>55 && dR>20) turnedOff=true;      // pointing well away from the route = you left it
      }
    }catch(e){}
    if((dR>thresh || turnedOff) && !(ambiguous && dR<130)){
      // Distance far off → react fast (1-2 frames). Heading-only ("turnedOff") needs 2
      // sustained frames so one GPS blip on a divided road can't fake a wrong turn. And inside
      // an ambiguous interchange we only reroute if truly far off (dR>130), never on heading alone.
      /* GPS ticks about once a second, so every frame we wait is a second of driving. Anything
         clearly off the line fires on the FIRST frame; only the heading-based signal still waits
         for a second frame, because that is the one a single GPS blip can fake. */
      const need = (dR>thresh*1.4 || dR>130) ? 1 : (turnedOff && dR<=thresh ? 2 : 1);
      if(++S.offRouteCount>=need && Date.now()-(S.lastReroute||0)>2500){
        S.offRouteCount=0;S.lastReroute=Date.now();
        toast("Off route — rerouting…",1400);speak("Rerouting.");fetchRoute(true);
      }
    } else S.offRouteCount=0;
  }
  // proactive: a reported blockage on the path ahead → automatically route around it
  if(S.navigating && !S.rerouting && navigator.onLine){
    const block=hazardsBlockingAhead().filter(h=>!S.avoidHandled.has(h.id||(h.lat+","+h.lng)));
    if(block.length && Date.now()-(S.lastReroute||0)>12000){
      block.forEach(h=>S.avoidHandled.add(h.id||(h.lat+","+h.lng)));
      rerouteAvoiding(block);
    }
  }
}
// hazards of a blocking type sitting within ~35m of the route, up to ~1.8km ahead of you
function hazardsBlockingAhead(){
  if(!S.route||!S.route.geometry||!S.pos||!S.hazards.length)return [];
  const co=S.route.geometry.coordinates; if(!co||co.length<2)return [];
  let ni=0,nd=Infinity; for(let i=0;i<co.length;i++){const d=distM(S.pos,{lat:co[i][1],lng:co[i][0]});if(d<nd){nd=d;ni=i;}}
  const ahead=[]; let acc=0;
  for(let i=ni;i<co.length-1;i++){ ahead.push(co[i]); acc+=distM({lat:co[i][1],lng:co[i][0]},{lat:co[i+1][1],lng:co[i+1][0]}); if(acc>3000)break; }   // look ~3km ahead (was 1.8km) — more time to reroute smoothly
  const BLOCK=["accident","closure","road_closure","cone","cones","construction","debris","flooding"];
  return S.hazards.filter(h=>{
    if(!BLOCK.includes(String(h.type||"").toLowerCase()))return false;
    return ahead.some(c=>distM({lat:c[1],lng:c[0]},h)<35);
  });
}
function routeNearPoint(coords,h,thresh){ return coords.some(c=>distM({lat:c[1],lng:c[0]},h)<thresh); }
// ask OSRM for alternatives and pick the one that stays clear of the reported blockage(s)
async function rerouteAvoiding(avoid){
  if(!S.pos||!S.dest||S.rerouting)return;
  S.rerouting=true; S.lastReroute=Date.now();
  try{
    const pts=[S.pos,...S.stops,S.dest].map(p=>`${p.lng},${p.lat}`).join(";");
    const data=await osrmFetch(pts,true);
    if(data.code==="Ok"&&data.routes&&data.routes.length){
      if(clear.length){
        const r=clear[0];
        S.route=r;S.steps=r.legs.flatMap(l=>l.steps);S.stepIdx=0;S.peekIdx=null;S.offRouteCount=0;S.alerted.clear();
        try{map.getSource("route").setData({type:"Feature",geometry:r.geometry});}catch(e){}
        speak("Reported closure ahead. Rerouting around it."); toast("↩ Rerouted around a reported blockage",2800);
      } else {
        // No alternative avoids it — you're likely right on top of it. Don't silently keep the
        // blocked route pretending we rerouted; tell the driver the truth so they can react.
        speak("Heads up — reported closure ahead and no clear detour. Proceed with caution.");
        toast("⚠️ Closure ahead — no clear detour found",3200);
      }
    }
  }catch(e){}
  S.rerouting=false;
}
function distToSegM(p,a,b){
  const kx=Math.cos(p.lat*Math.PI/180)*111320,ky=110540;
  const ax=(a[0]-p.lng)*kx,ay=(a[1]-p.lat)*ky,bx=(b[0]-p.lng)*kx,by=(b[1]-p.lat)*ky;
  const dx=bx-ax,dy=by-ay,L=dx*dx+dy*dy;
  const t=L?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/L)):0;
  const x=ax+t*dx,y=ay+t*dy;return Math.sqrt(x*x+y*y);
}
function minDistToRoute(){
  if(!S.route)return 0;
  const c=S.route.geometry.coordinates;let min=Infinity;
  for(let i=0;i<c.length-1;i++){const d=distToSegM(S.pos,c[i],c[i+1]);if(d<min)min=d;if(min<15)break;}
  return min;
}
let audioCtx=null;
/* v25: REAL haptics — iOS Taptic Engine via the Safari 17.4+ switch trick, Android via vibrate, audio as universal backstop */
let _hapLbl=null,_hapSw=null;
function _hapBuild(){
  if(_hapLbl)return;
  _hapLbl=document.createElement("label");
  _hapLbl.setAttribute("aria-hidden","true");
  _hapLbl.style.cssText="position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;overflow:hidden;z-index:-1;pointer-events:none";
  _hapSw=document.createElement("input");
  _hapSw.type="checkbox"; _hapSw.setAttribute("switch",""); _hapSw.tabIndex=-1;
  _hapLbl.appendChild(_hapSw); document.body.appendChild(_hapLbl);
}
// one Taptic pulse: toggling the switch (via its label) fires the engine on iOS 17.4–26.4
function iosTap(){ try{ _hapBuild(); _hapLbl.click(); }catch(e){} }
// fire n haptic pulses spaced by gap ms — Android uses vibrate, iOS uses the switch trick
function hapticPulses(n,gap){ n=n||1; gap=gap||120;
  for(let i=0;i<n;i++) setTimeout(iosTap,i*gap);
}
function turnCue(stage){
  // Android / devices with the Vibration API
  try{ if(navigator.vibrate) navigator.vibrate(stage>=2?[90,55,90,55,150]:[70]); }catch(e){}
  // iOS Taptic Engine — 3 crisp pulses right before an exit, 1 for the advance warning
  hapticPulses(stage>=2?3:1, 130);
  // universal audio backstop (also covers iOS 26.5+ where Apple patched the haptic trick)
  if(S.audioAlerts){ try{
    if(stage>=2){ beep(720,.12,.22); setTimeout(()=>beep(960,.18,.26),140); }
    else { beep(600,.12,.16); }
  }catch(e){} }
}
function beep(freq=880,dur=.35,gain=.25){
  if(!S.audioAlerts)return;
  try{
    audioCtx=audioCtx||new (window.AudioContext||window.webkitAudioContext)();
    const o=audioCtx.createOscillator(),g=audioCtx.createGain();
    o.frequency.value=freq;o.type="sine";o.connect(g);g.connect(audioCtx.destination);
    g.gain.setValueAtTime(gain,audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+dur);
    o.start();o.stop(audioCtx.currentTime+dur);
  }catch{}
}
function hazardAlert(h,stage){
  const m=HZ_META[h.type]||HZ_META.debris;
  const sizeTxt = (h.type==="pothole"&&h.psev) ? (POT_SEV[h.psev].label.toLowerCase()+" ") : "";
  if(stage===1){
    // early heads-up: one soft tone, quiet toast, no speech — don't crowd the driver
    toast(`${m.emoji} ${sizeTxt}${m.label} ahead`,2400);
    try{ beep(560,.10,.14); }catch(e){}
    if(navigator.vibrate)navigator.vibrate(45);
    try{ pulseHazard(h); }catch(e){}
    try{ hudHazard(m.emoji+" "+sizeTxt+m.label+" ahead", 2600); }catch(e){}
    return;
  }
  // close now: sharper double tone + short spoken cue
  const _lnA=laneText(h.lanes);
  toast(`${m.emoji} ${sizeTxt}${m.label} — right ahead${_lnA?" · "+_lnA:""}`,3000);
  try{ beep(760,.11,.22); setTimeout(()=>beep(980,.14,.24),150); }catch(e){}
  try{ if(S.voiceOn)speak((sizeTxt?sizeTxt:"")+m.label+" ahead"+(_lnA?", "+_lnA:"")); }catch(e){}
  if(navigator.vibrate)navigator.vibrate([70,50,70]);
  try{ pulseHazard(h); }catch(e){}
  try{ hudHazard(m.emoji+" "+sizeTxt+m.label+" — RIGHT AHEAD", 3400); }catch(e){}
}
// visual cue on the map so the driver can glance instead of listen
function pulseHazard(h){
  try{
    if(!h._marker) return;
    const el=h._marker.getElement(); if(!el) return;
    // animate the ring, not the transform — transform belongs to MapLibre's positioning
    const col=(h.type==="pothole")?potColor(h):((HZ_META[h.type]||HZ_META.debris).color);
    const px=parseInt(el.dataset.basePx)||30;
    el.style.transition="box-shadow .18s ease, outline-color .18s ease";
    let n=0;
    const iv=setInterval(()=>{
      n++;
      const grow=(n%2)?Math.round(px*0.45):Math.round(px*0.12);
      el.style.boxShadow="0 0 0 "+grow+"px "+col+"55";
      if(n>5){ clearInterval(iv); el.style.boxShadow="0 0 0 "+Math.round(px*0.12)+"px "+col+"33"; }
    },190);
  }catch(e){}
}

/* ═══════════ hazards ═══════════ */
let _cwFxInjected=false;
function cwInjectFX(){
  if(_cwFxInjected) return; _cwFxInjected=true;
  try{
    const s=document.createElement("style");
    // Ice = a soft, cold frost aura that gently breathes. Two feathered layers, low opacity,
    // slow ease so it reads "cold" at a glance without ever looking neon or tacky.
    s.textContent=
      "@keyframes cwFrost{0%,100%{box-shadow:0 0 7px 3px rgba(90,200,250,.42),0 0 16px 7px rgba(130,215,255,.20)}"+
      "50%{box-shadow:0 0 11px 5px rgba(90,200,250,.60),0 0 24px 11px rgba(130,215,255,.32)}}"+
      ".hz.hz-ice{animation:cwFrost 3.4s ease-in-out infinite}"+
      // Police = a slow, smooth red↔blue cross-fade under the marker — evokes cruiser lights
      // without ever strobing. Colors swap glow dominance each half-cycle, feathered + low-opacity.
      "@keyframes cwCruiser{0%{box-shadow:0 0 8px 4px rgba(229,72,77,.60),0 0 20px 9px rgba(229,72,77,.28)}"+
      "50%{box-shadow:0 0 8px 4px rgba(59,130,246,.60),0 0 20px 9px rgba(59,130,246,.28)}"+
      "100%{box-shadow:0 0 8px 4px rgba(229,72,77,.60),0 0 20px 9px rgba(229,72,77,.28)}}"+
      ".hz.hz-police{animation:cwCruiser 2.2s ease-in-out infinite}"+
      // Nav banner: the Share/Map/HUD/End/mute buttons float absolutely at the top-right, so
      // reserve headroom for them — otherwise the freeway shield in the instruction row rides
      // up into the mute button (the M-10 overlap).
      "#navbanner{padding-top:42px;transition:padding .18s ease}"+
      // Compact "cruising" state (no turn imminent): hide non-critical rows so the driver can
      // see the map ahead. Expands automatically as a turn nears.
      "#navbanner.nb-collapsed{padding:12px 14px 10px}"+
      "#navbanner.nb-collapsed .nb-btns{display:none}"+
      "#navbanner.nb-collapsed #laneRow{display:none!important}"+
      "#navbanner.nb-collapsed .nb-meta{display:none}"+
      // Keep the EXIT prominent even when collapsed (like Google) — it's the one cue a driver
      // most needs at a glance. Bump its size a touch so it reads clearly in the slim bar.
      "#navbanner.nb-collapsed #nbExit{display:block!important;font-size:16px;padding:6px 13px}"+
      "#navbanner.nb-collapsed .nb-instr{font-size:17px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"+
      "#navbanner.nb-collapsed #nbGlyph{font-size:26px}"+
      // Minimal map mode: hazards collapse to small colored dots — no emoji, no glow (frost/
      // cruiser included). Never touch transform (MapLibre uses it to position the marker).
      "body.cw-minimal .hz{width:14px!important;height:14px!important;font-size:0!important;"+
      "box-shadow:none!important;animation:none!important;border-radius:50%!important;opacity:.9}";
    document.head.appendChild(s);
  }catch(e){}
}
try{ cwInjectFX(); }catch(e){}   // inject at load so the banner fix applies before any hazard renders
/* ═══════════ user-adjustable marker size ═══════════
   Map density varies enormously — downtown at night is nothing like a highway at rush hour,
   and what reads as "clear" depends on the phone, the mount distance, and the eyes. So this
   is a preference, not a constant. Base px per step; every marker path multiplies through it.
   Stored per-device; changes apply live to markers already on the map. */
const MARKER_SIZES = { s:17, m:23, l:30, xl:38 };
function markerBase(){
  try{ var v=localStorage.getItem("cw_marker_size"); if(v&&MARKER_SIZES[v]) return MARKER_SIZES[v]; }catch(e){}
  return MARKER_SIZES.m;
}
function markerSizeKey(){
  try{ var v=localStorage.getItem("cw_marker_size"); if(v&&MARKER_SIZES[v]) return v; }catch(e){}
  return "m";
}
function setMarkerSize(k){
  if(!MARKER_SIZES[k]) return;
  try{ localStorage.setItem("cw_marker_size",k); }catch(e){}
  try{ (S.hazards||[]).forEach(restyleHazMarker); }catch(e){}
  try{ document.querySelectorAll("#sizeChips .chip").forEach(function(c){ c.classList.toggle("on",c.dataset.size===k); }); }catch(e){}
  toast("Marker size: "+({s:"Small",m:"Medium",l:"Large",xl:"Extra large"}[k]),1300);
}
/* ═══════════ personalization: header, buttons, hazard filters ═══════════
   All three follow the same shape as marker size: a localStorage key, an apply() that can
   run at boot or live, and a control in Settings. Nothing here is destructive — filters
   hide markers, they never drop the underlying report. */
function _pref(k,d){ try{ return localStorage.getItem(k)||d; }catch(e){ return d; } }
function _setPref(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }

// ── compact header
function applyHdrCompact(){
  // Two ways the header goes compact: the user pinned it (pref), or navigation started
  // (auto). Auto is transient — it clears when the route ends, so the pref survives.
  var on=_pref("cw_hdr_compact","0")==="1" || document.body.dataset.hdrAuto==="1";
  try{ document.body.classList.toggle("hdr-compact",on);
       var t=$("hdrToggle"); if(t){ t.textContent = on?"\u25bc":"\u25b2";
         t.setAttribute("aria-label", on?"Expand header":"Collapse header"); }
  }catch(e){}
  try{ layout(); }catch(e){}          // re-measure --hdrH so the FAB rail follows
}
function toggleHdrCompact(){
  var cur=document.body.classList.contains("hdr-compact");
  // tapping the chevron while nav auto-collapsed it means "give it back" — drop the auto flag
  if(cur && document.body.dataset.hdrAuto==="1") delete document.body.dataset.hdrAuto;
  _setPref("cw_hdr_compact", cur?"0":"1");
  applyHdrCompact();
}

// ── tool menu style: "drawer" (grid above the dots) or "radial" (fan around the dots)
function toolsStyle(){ return _pref("cw_tools","drawer")==="radial" ? "radial" : "drawer"; }
function applyToolsStyle(){
  var v=toolsStyle();
  try{ document.body.setAttribute("data-tools",v);
       document.querySelectorAll("#toolsChips .chip").forEach(function(c){ c.classList.toggle("on",c.dataset.tools===v); });
  }catch(e){}
  try{ closeTools(); }catch(e){}     // never leave a half-laid-out tray behind a style switch
}
function setToolsStyle(v){ _setPref("cw_tools",v); applyToolsStyle(); toast("Tool menu: "+(v==="radial"?"Radial":"Drawer"),1200); }

/* Radial layout is measured, not hard-coded: the dots button moves with FAB size, safe-area
   and the short-screen media query, so we read its box at open time and fan from its centre.
   Eight buttons on one arc would collide, so they ride two arcs of four. */
function _radialGeom(){
  var anchor=$("fabMore"); if(!anchor) return null;
  var a=anchor.getBoundingClientRect();
  var kid=$("moreFabs")&&$("moreFabs").children[0];
  var sz=kid?(kid.getBoundingClientRect().width||50):50;
  return {cx:a.left+a.width/2, cy:a.top+a.height/2, sz:sz};
}
function layoutRadial(animate){
  var tray=$("moreFabs"); if(!tray) return;
  var g=_radialGeom(); if(!g) return;
  var kids=Array.prototype.slice.call(tray.children);
  var n=kids.length; if(!n) return;

  /* Tools are the whole screen while this is open, so lay them out as a centred panel rather
     than something tucked into a corner. Two failures to avoid, both shipped already:
       v244 fanned them on an arc, which had to sprawl across the map to fit eight and covered
       the driver's own puck;
       v246 gridded them but right-aligned the grid to the ⋯ button, so its right column shared
       x with the rail and the bottom-right tool landed on top of the 911 button.
     The fix for both is to compute the free space FIRST — everything left of the rail, below the
     header, above the dock — and centre an evenly-spaced grid inside it. Nothing is positioned
     relative to another control, so nothing can collide with one. */
  var vw=window.innerWidth, vh=window.innerHeight;
  var hdr=(parseFloat(getComputedStyle(document.body).getPropertyValue("--hdrH"))||160);
  var dockH=(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dockH"))||150);
  var railLeft=g.cx-g.sz/2;                       // the 911 / ⚠ / recentre column lives here
  var padX=16, padTop=14, padBot=14;
  var boxL=padX, boxR=railLeft-16;                // hard stop clear of the rail
  var boxT=hdr+padTop, boxB=vh-dockH-padBot;
  var boxW=Math.max(120,boxR-boxL), boxH=Math.max(120,boxB-boxT);

  // choose the column count that best fills the box without forcing the cells too tight
  var cols=Math.min(n, Math.max(2, Math.floor(boxW/(g.sz*1.34))));
  var rows=Math.ceil(n/cols);
  // shrink the step (never the button) if a tall grid would not otherwise fit
  var stepX=Math.min(g.sz*1.46, boxW/Math.max(1,cols));
  var stepY=Math.min(g.sz*1.46, boxH/Math.max(1,rows));

  var gridW=(cols-1)*stepX, gridH=(rows-1)*stepY;
  var startX=boxL+(boxW-gridW)/2;
  var startY=boxT+(boxH-gridH)/2;

  var scrim=$("radialScrim");
  if(scrim){
    scrim.style.setProperty("--rx",(startX+gridW/2)+"px");
    scrim.style.setProperty("--ry",(startY+gridH/2)+"px");
    scrim.classList.add("on");
  }
  kids.forEach(function(el,i){
    var r=Math.floor(i/cols), c=i%cols;
    /* Centre the final row's leftovers so a 3x3 holding 8 does not leave a lopsided gap —
       the row reads as deliberate instead of truncated. */
    var inRow=Math.min(cols, n-r*cols);
    var rowW=(inRow-1)*stepX;
    var x=boxL+(boxW-rowW)/2 + c*stepX;
    var y=startY + r*stepY;
    el.style.left=(g.cx-g.sz/2)+"px";
    el.style.top=(g.cy-g.sz/2)+"px";
    el.style.margin="0";
    var dx=x-g.cx, dy=y-g.cy;
    if(animate){
      el.style.transition="none";
      el.style.transform="translate(0,0) scale(.35)";
      el.style.opacity="0";
      /* Stagger outward from the ⋯ that opened it, nearest first, so the grid assembles from
         the thumb rather than all arriving at once. */
      var delay=(r*cols+c)*20;
      (function(el2,dx2,dy2,d){
        requestAnimationFrame(function(){ requestAnimationFrame(function(){
          el2.style.transition="transform .30s cubic-bezier(.18,.92,.26,1.14) "+d+"ms, opacity .18s linear "+d+"ms";
          el2.style.transform="translate("+dx2+"px,"+dy2+"px) scale(1)";
          el2.style.opacity="1";
        }); });
      })(el, dx, dy, delay);
    }else{
      el.style.transition="transform .16s ease-out";
      el.style.transform="translate("+dx+"px,"+dy+"px) scale(1)";
      el.style.opacity="1";
    }
  });
}
function clearRadial(){
  var tray=$("moreFabs"); if(!tray) return;
  Array.prototype.slice.call(tray.children).forEach(function(el){
    el.style.left=el.style.top=el.style.transform=el.style.opacity=el.style.transition=el.style.margin="";
  });
  var scrim=$("radialScrim"); if(scrim) scrim.classList.remove("on");
}
function toolsAreOpen(){ var t=$("moreFabs"); return !!(t&&t.classList.contains("open")); }
function openTools(){
  var tray=$("moreFabs"); if(!tray) return;
  tray.classList.add("open");
  if(toolsStyle()==="radial") layoutRadial(true); else clearRadial();
}
function closeTools(){
  var tray=$("moreFabs"); if(!tray) return;
  tray.classList.remove("open");
  clearRadial();
}
function toggleTools(){ openToolsPage(); }

/* The tools PAGE. Two behaviours the fan never had: it is a real sheet the driver can read,
   and picking something that opens another sheet comes BACK here afterwards instead of
   dumping them on the map. openSheet() closes every sheet before opening the next, so the
   return has to be remembered explicitly rather than relying on stacking. */
var _toolsReturn=false;
/* Show which toggles are currently ON. Without this the page is a list of verbs with no state,
   so a driver cannot tell whether satellite is already on without closing the sheet to look. */
function _syncToolRows(){
  try{
    document.querySelectorAll("#toolsList .tool-row").forEach(function(r){
      var b=document.getElementById(r.dataset.fab);
      var on=!!(b && (b.classList.contains("active")||b.classList.contains("lit")));
      r.classList.toggle("on",on);
      var f=r.querySelector(".tflag");
      if(!f){ f=document.createElement("span"); f.className="tflag"; r.appendChild(f); }
      f.textContent = on ? "ON" : "";
    });
  }catch(e){}
}
function openToolsPage(){ _toolsReturn=false; openSheet("toolsSheet"); _syncToolRows(); }
/* One place that opens a sheet from inside the tools page, on the next frame. The rAF matters:
   the tap that triggered this is still being processed, and anything that runs a closeSheets()
   as that gesture unwinds would otherwise close the sheet we just opened. */
function _openFromTools(sheetId, fn){
  _toolsDebug("tap->"+sheetId);
  /* Close the tools page FIRST and on its own, so the outgoing sheet's transition and any
     cleanup that rides on it are finished before the new sheet is added. Opening and closing
     in the same tick was producing the flip-up-then-revert. 180ms is the sheet transition. */
  try{ closeSheets(); }catch(e){}
  setTimeout(function(){
    try{
      if(fn) fn(); else openSheet(sheetId);
      var ok=!!(document.getElementById(sheetId)||{}).classList &&
              document.getElementById(sheetId).classList.contains("open");
      _toolsDebug((ok?"opened ":"FAILED ")+sheetId);
      _returnToToolsWhenClosed(sheetId);
    }catch(e){ _toolsDebug("threw "+sheetId+": "+(e&&e.message)); }
  }, 180);
}
try{
  var _tl=$("toolsList");
  if(_tl) _tl.addEventListener("click",function(ev){
    var row=ev.target.closest && ev.target.closest(".tool-row"); if(!row) return;
    /* Some tools have no tray button behind them — the compass only ever existed as a sheet
       reachable from the dock drawer, which is why it looked missing. Those carry data-act. */
    if(row.dataset.act==="compass"){ _toolsReturn=true; _openFromTools("compassSheet",openCompass); return; }
    var btn=document.getElementById(row.dataset.fab); if(!btn) return;
    var id=row.dataset.fab;
    /* Three kinds of tool, and my last build got the middle one wrong.
       MAP TOGGLES (satellite, 3D) change the map — and the sheet sits ON TOP of the map, so
       holding it open hid the only thing that changed and the button read as dead. They close
       the page so the driver can actually see what they turned on.
       SHEET OPENERS navigate somewhere and come back here when that place closes.
       IN-PLACE tools (torch, voice) change nothing behind the sheet, so it stays put. */
    var MAP_TOGGLE = ["fabSat","fab3d"];
    var SHEET_FOR  = {fabDiscover:"discoverSheet", fabSettings:"settingsSheet",
                      fabRoadside:"roadsideSheet", fabFeedback:"feedbackSheet"};
    if(SHEET_FOR[id]){
      /* Proxying through btn.click() was the bug. The synthetic click originates on a hidden
         button OUTSIDE the sheet, so it bubbles to document as a tap on nothing, and it lands
         in the same tick as openSheet's own closeSheets() — the new sheet got added and
         removed within a frame, which is the flip-up-and-stutter you saw. Open the sheet
         directly, and on the next frame so the current gesture is fully finished first. */
      _toolsReturn=true;
      _openFromTools(SHEET_FOR[id]);
      return;
    }
    btn.click();
    if(MAP_TOGGLE.indexOf(id)>-1) closeSheets();        // get out of the way of the result
    else{
      try{ row.animate([{opacity:1},{opacity:.45},{opacity:1}],{duration:260}); }catch(e){}
    }
    setTimeout(_syncToolRows,60);
  });
}catch(e){}
/* The MutationObserver that used to live here is gone. It fired on EVERY class change of five
   sheets, including the ones closeSheets() makes while opening a different sheet — so it could
   reopen the tools page 120ms after a sheet opened, closing that sheet again. That is a global
   watching a global, and it is the kind of thing that produces a bug you cannot reproduce by
   reading. Returning to tools is now driven by one explicit poll of a single flag, started only
   when we ourselves opened a sheet from the page, and stopped the moment it fires. */
function _returnToToolsWhenClosed(sheetId){
  var el=document.getElementById(sheetId); if(!el) return;
  var started=Date.now(), sawOpen=false;
  var iv=setInterval(function(){
    var open=el.classList.contains("open");
    if(open){ sawOpen=true; return; }
    if(!sawOpen){                                  // never opened — give up rather than guess
      if(Date.now()-started>2500){ clearInterval(iv); _toolsDebug("never-opened:"+sheetId); }
      return;
    }
    clearInterval(iv);
    if(_toolsReturn){ _toolsReturn=false; try{ openSheet("toolsSheet"); _syncToolRows(); }catch(e){} }
  }, 160);
}
/* A breadcrumb for the LIVE-badge debug panel. After three wrong guesses about this flow, the
   app should be able to say what it did rather than leave us inferring it from screenshots. */
var _toolsLog=[];
function _toolsDebug(msg){
  try{ _toolsLog.push(new Date().toTimeString().slice(0,8)+" "+msg); if(_toolsLog.length>8) _toolsLog.shift(); }catch(e){}
}
try{
  window.addEventListener("resize",function(){ if(toolsAreOpen()&&toolsStyle()==="radial") layoutRadial(false); });
  window.addEventListener("orientationchange",function(){ if(toolsAreOpen()&&toolsStyle()==="radial") setTimeout(function(){layoutRadial(false);},250); });
}catch(e){}

// ── button size
function applyFabSize(){
  var v=_pref("cw_fab_size","m");
  try{ document.body.setAttribute("data-fab",v);
       document.querySelectorAll("#fabChips .chip").forEach(function(c){ c.classList.toggle("on",c.dataset.fab===v); });
  }catch(e){}
}
function setFabSize(v){ _setPref("cw_fab_size",v); applyFabSize(); toast("Button size: "+({s:"Small",m:"Medium",l:"Large"}[v]),1200); }

// ── hazard type filters
function hiddenTypes(){ try{ return JSON.parse(_pref("cw_hidden_types","[]"))||[]; }catch(e){ return []; } }
function typeVisible(t){ return hiddenTypes().indexOf(t)<0; }
function applyHzFilters(){
  var hid=hiddenTypes();
  try{ (S.hazards||[]).forEach(function(h){
    if(!h._marker) return; var e2=h._marker.getElement(); if(!e2) return;
    e2.style.display = hid.indexOf(h.type)>-1 ? "none" : "";
  }); }catch(e){}
  var st=$("filterState");
  if(st) st.textContent = hid.length ? (hid.length+" type"+(hid.length>1?"s":"")+" hidden") : "All hazard types visible";
  try{ document.querySelectorAll("#hzFilters .chip").forEach(function(c){ c.classList.toggle("on",hid.indexOf(c.dataset.hz)<0); }); }catch(e){}
}
function toggleType(t){
  var hid=hiddenTypes(), i=hid.indexOf(t);
  if(i>-1) hid.splice(i,1); else hid.push(t);
  _setPref("cw_hidden_types",JSON.stringify(hid)); applyHzFilters();
}
function buildHzFilters(){
  var box=$("hzFilters"); if(!box||box.dataset.built) return; box.dataset.built="1";
  Object.keys(HZ_META).forEach(function(k){
    var b=document.createElement("button");
    b.className="chip"; b.dataset.hz=k;
    b.textContent=HZ_META[k].emoji+" "+HZ_META[k].label;
    b.onclick=function(){ toggleType(k); };
    box.appendChild(b);
  });
  applyHzFilters();
}
function addHazardMarker(h){
  cwInjectFX();
  if(!h.id)h.id="h"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  if(!h.ts)h.ts=h.created_at?Date.parse(h.created_at)||Date.now():Date.now();
  const m=HZ_META[h.type]||HZ_META.debris;
  const el=document.createElement("div");el.className="hz";
  try{ if(!typeVisible(h.type)) el.style.display="none"; }catch(e){}
  if(h.type==="pothole"){
    if(!h.psev && /size:\s*Large/i.test(h.note||"")) h.psev=3;
    else if(!h.psev && /size:\s*Medium/i.test(h.note||"")) h.psev=2;
    else if(!h.psev && /size:\s*Small/i.test(h.note||"")) h.psev=1;
    el.style.background=potColor(h);
    const sc=potScale(h);
    // Size via width/height — MapLibre writes `transform` on this element to position it,
    // so scaling with transform detached the marker and made it drift on zoom.
    const base=markerBase(), px=Math.round(base*sc);
    el.style.width=px+"px"; el.style.height=px+"px";
    el.style.fontSize=Math.round(markerBase()*0.52*sc)+"px";
    el.style.boxShadow="0 0 0 "+(2+sc*2).toFixed(0)+"px "+potColor(h)+"33";
    el.dataset.basePx=px;
  } else if(h.type==="ice"){
    // Ice gets the cold frost aura (glow only, gentle pulse) — NOT the hard ring the other
    // hazards use. Leave box-shadow to the .hz-ice CSS so the breathing animation drives it.
    el.classList.add("hz-ice");
    el.style.background=m.color;
    const sc=hazScale(h);
    const px=Math.round(markerBase()*sc);
    el.style.width=px+"px"; el.style.height=px+"px";
    el.style.fontSize=Math.round(markerBase()*0.52*sc)+"px";
    el.dataset.basePx=px;
  } else if(h.type==="police"){
    // Police gets the red↔blue cruiser cross-fade (glow only). Leave box-shadow to the
    // .hz-police CSS so the animation drives the color swap.
    el.classList.add("hz-police");
    el.style.background=m.color;
    const sc=hazScale(h);
    const px=Math.round(markerBase()*sc);
    el.style.width=px+"px"; el.style.height=px+"px";
    el.style.fontSize=Math.round(markerBase()*0.52*sc)+"px";
    el.dataset.basePx=px;
  } else {
    // Every other hazard: sized by how much it matters, with a matching solid glow ring.
    el.style.background=m.color;
    const sc=hazScale(h);
    const px=Math.round(markerBase()*sc);
    el.style.width=px+"px"; el.style.height=px+"px";
    el.style.fontSize=Math.round(markerBase()*0.52*sc)+"px";
    el.style.boxShadow="0 0 0 "+(2+sc*2).toFixed(0)+"px "+m.color+"33";
    el.dataset.basePx=px;
  }
  el.textContent=m.emoji;
  const mk=new maplibregl.Marker({element:el}).setLngLat([h.lng,h.lat])
    .setPopup(trackPopup(new maplibregl.Popup({offset:16}).setHTML(hazPopupHTML(h))))
    .addTo(map);
  hzMarkers.push(mk); h._marker=mk;
}
function sbH(extra){
  // Supabase auth headers that work for BOTH key types:
  //  • new publishable keys (sb_publishable_…) authorize via the apikey header ONLY (they are not JWTs — Bearer would 401)
  //  • legacy anon keys (eyJ…) are JWTs and use Bearer
  const H={apikey:S.sb.key};
  if(/^eyJ/.test(S.sb.key)) H.Authorization="Bearer "+S.sb.key;
  return Object.assign(H, extra||{});
}
// How prominent each hazard should look. Things that can hurt you or stop you get bigger;
// informational markers stay smaller so they don't shout over the dangerous ones.
const HZ_SCALE={
  accident:1.22, road_closure:1.22, flooding:1.18, ice:1.18, emergency:1.15,
  construction_cones:1.05, debris:1.02, stalled:1.02, animal:1.02, traffic:1.05,
  speed_bump:0.95, police:0.95, camera:0.92, camera_flock:0.92, alert:1.05
};
function hazScale(h){
  let sc=HZ_SCALE[h.type]!==undefined?HZ_SCALE[h.type]:1.0;
  // heavily-confirmed reports read as more certain, so nudge them up a little
  const r=h.reports||1;
  if(r>=5) sc*=1.12; else if(r>=2) sc*=1.06;
  return Math.max(0.85,Math.min(1.45,sc));
}
const POT_SEV={1:{label:"Small",color:"#FFC72C",scale:0.82},2:{label:"Medium",color:"#FF8A1E",scale:1.0},3:{label:"Large",color:"#E5484D",scale:1.22}};
function potColor(h){
  const s=Math.max(1,Math.min(3,h.psev||(h.reports>=5?3:h.reports>=2?2:1)));
  return POT_SEV[s].color;
}
function potScale(h){
  const s=Math.max(1,Math.min(3,h.psev||(h.reports>=5?3:h.reports>=2?2:1)));
  return POT_SEV[s].scale;
}
// which kind of camera did they spot?
function askCameraType(note){
  if(!S.pos){toast("Need a GPS lock to report.");return;}
  const wrap=document.createElement("div");
  wrap.style.cssText="position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom));z-index:1600;display:flex;gap:10px;background:var(--panel-solid);border:1px solid var(--line);border-radius:18px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.45)";
  wrap.innerHTML=
    '<button data-t="camera" style="border:none;border-radius:13px;padding:12px 16px;background:#A78BFA;color:#141619;font-weight:800;font-size:14px">📸 Speed</button>'+
    '<button data-t="camera_flock" style="border:none;border-radius:13px;padding:12px 16px;background:#7C6BF5;color:#fff;font-weight:800;font-size:14px">🦅 Flock</button>'+
    '<button data-t="" style="border:1px solid var(--line);border-radius:13px;padding:12px 13px;background:transparent;color:inherit;font-size:14px">✕</button>';
  document.body.appendChild(wrap);
  const kill=()=>{ try{wrap.remove();}catch(e){} clearTimeout(t); };
  const t=setTimeout(kill,9000);
  wrap.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    const ty=b.dataset.t; kill();
    if(ty) reportHazard(ty,note,null,true);
  });
}

// ask how bad it is — one tap, three choices, then it's on the map
function askPotholeSize(note){
  if(!S.pos){toast("Need a GPS lock to report.");return;}
  const wrap=document.createElement("div");
  wrap.id="potSize";
  wrap.style.cssText="position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom));z-index:1600;display:flex;gap:10px;background:var(--panel-solid);border:1px solid var(--line);border-radius:18px;padding:12px;box-shadow:0 12px 40px rgba(0,0,0,.45)";
  wrap.innerHTML=
    '<button data-s="1" style="border:none;border-radius:13px;padding:12px 15px;background:#FFC72C;color:#141619;font-weight:800;font-size:14px">Small</button>'+
    '<button data-s="2" style="border:none;border-radius:13px;padding:12px 15px;background:#FF8A1E;color:#141619;font-weight:800;font-size:14px">Medium</button>'+
    '<button data-s="3" style="border:none;border-radius:13px;padding:12px 15px;background:#E5484D;color:#fff;font-weight:800;font-size:14px">Large</button>'+
    '<button data-s="0" style="border:1px solid var(--line);border-radius:13px;padding:12px 13px;background:transparent;color:inherit;font-size:14px">✕</button>';
  document.body.appendChild(wrap);
  const kill=()=>{ try{wrap.remove();}catch(e){} clearTimeout(t); };
  const t=setTimeout(()=>{ kill(); },9000);
  wrap.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    const sv=+b.dataset.s; kill();
    if(sv>0) reportHazard("pothole", note||"", sv);
  });
}
// Which hazard types block specific lanes — for these we ask which lanes are affected, so the
// alert can say "right two lanes blocked" instead of a vague "construction ahead."
const LANE_TYPES=["construction_cones","road_closure","accident","debris","stalled"];
function askLanes(type,note){
  if(!S.pos){toast("Need a GPS lock to report.");return;}
  const wrap=document.createElement("div");
  wrap.id="lanePick";
  wrap.style.cssText="position:fixed;left:50%;transform:translateX(-50%);bottom:calc(96px + env(safe-area-inset-bottom));z-index:1600;background:var(--panel-solid);border:1px solid var(--line);border-radius:18px;padding:14px;box-shadow:0 12px 40px rgba(0,0,0,.45);max-width:92vw";
  const btn=(v,label)=>'<button data-l="'+v+'" style="border:1px solid var(--line);border-radius:13px;padding:11px 13px;background:transparent;color:inherit;font-weight:700;font-size:13.5px;white-space:nowrap">'+label+'</button>';
  wrap.innerHTML=
    '<div style="font-size:13px;color:var(--mute);margin-bottom:9px;text-align:center">Which lanes are blocked? <span style="opacity:.7">(tap all that apply)</span></div>'+
    '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">'+
      btn("left","⬅️ Left")+btn("center","⬆️ Center")+btn("right","➡️ Right")+btn("shoulder","🛑 Shoulder")+btn("all","🚧 All lanes")+
    '</div>'+
    '<div style="display:flex;gap:8px;justify-content:center;margin-top:11px">'+
      '<button id="laneGo" style="border:none;border-radius:13px;padding:11px 22px;background:#FF6B1A;color:#141619;font-weight:800;font-size:14px">Report</button>'+
      '<button id="laneSkip" style="border:1px solid var(--line);border-radius:13px;padding:11px 15px;background:transparent;color:inherit;font-size:14px">Skip</button>'+
    '</div>';
  document.body.appendChild(wrap);
  const picked=new Set();
  const kill=()=>{ try{wrap.remove();}catch(e){} clearTimeout(t); };
  const t=setTimeout(kill,15000);
  wrap.querySelectorAll("button[data-l]").forEach(b=>b.onclick=()=>{
    const v=b.dataset.l;
    if(v==="all"){ picked.clear(); picked.add("all"); wrap.querySelectorAll("button[data-l]").forEach(x=>x.style.background="transparent"); b.style.background="rgba(255,107,26,.35)"; return; }
    picked.delete("all"); const allBtn=wrap.querySelector('button[data-l="all"]'); if(allBtn)allBtn.style.background="transparent";
    if(picked.has(v)){ picked.delete(v); b.style.background="transparent"; }
    else { picked.add(v); b.style.background="rgba(255,107,26,.35)"; }
  });
  wrap.querySelector("#laneSkip").onclick=()=>{ kill(); reportHazard(type,note,null,true,"none"); };
  wrap.querySelector("#laneGo").onclick=()=>{ const lanes=[...picked].join(","); kill(); reportHazard(type,note,null,true,lanes||"none"); };
}
function laneText(lanes){
  if(!lanes||lanes==="none") return "";
  if(lanes==="all") return "all lanes blocked";
  const names={left:"left",center:"center",right:"right",shoulder:"shoulder"};
  const parts=String(lanes).split(",").map(x=>names[x]).filter(Boolean);
  if(!parts.length) return "";
  return parts.join(" + ")+(parts.length>1?" lanes":" lane")+" blocked";
}
async function reportHazard(type,note,psev,skipPick,lanes){
  if(!S.pos){toast("Need a GPS lock to report.");return;}
  if(type==="pothole" && !psev){ askPotholeSize(note); return; }
  if(type==="camera" && !skipPick){ askCameraType(note); return; }
  if(LANE_TYPES.indexOf(type)>-1 && lanes===undefined){ askLanes(type,note); return; }
  closeSheets(); if(navigator.vibrate)navigator.vibrate(40);
  // MERGE: an existing report of the SAME type within ~35m gets confirmed (count++), not duplicated.
  // Different hazard types at the same spot each keep their own pin.
  const near=S.hazards.find(x=>x.type===type && distM(S.pos,{lat:x.lat,lng:x.lng})<35);
  if(near){
    near.reports=(near.reports||1)+1; near.ts=Date.now(); refreshHazPopup(near);
    if(type==="pothole"&&near._marker){try{near._marker.getElement().style.background=(near.reports>=5?"#E5484D":(near.reports>=2?"#FF8A1E":"#FFC72C"));}catch(e){}}
    toast(`${HZ_META[type].label} confirmed ✓ · ${near.reports} reports`);
    if(S.sb.url&&S.sb.key){ try{ await fetch(`${S.sb.url}/rest/v1/hazards`,{method:"POST",headers:sbH({"Content-Type":"application/json"}),body:JSON.stringify({type,lat:S.pos.lat,lng:S.pos.lng,note:note||"confirm",sev:2,reports:1,device_id:deviceId()})}); }catch(e){} }
    return;
  }
  const _p=((type==="pothole"||type==="debris")&&S.course!=null&&!isNaN(S.course))?(function(){const rad=(S.course+90)*Math.PI/180,dM=4;return{lat:S.pos.lat+(dM*Math.cos(rad))/111111,lng:S.pos.lng+(dM*Math.sin(rad))/(111111*Math.cos(S.pos.lat*Math.PI/180))};})():{lat:S.pos.lat,lng:S.pos.lng};
  const h={id:"h"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),ts:Date.now(),gone:0,type,lat:_p.lat,lng:_p.lng,note:note||"Driver report",sev:type==="accident"?4:2,reports:1,psev:psev||undefined,lanes:(lanes&&lanes!=="none")?lanes:undefined};
  S.hazards.push(h);addHazardMarker(h);
  const _lt=laneText(h.lanes);
  toast(`${HZ_META[type].label} reported ✓${_lt?" · "+_lt:""}`);
  if(S.sb.url&&S.sb.key){
    try{
      const _ln=laneText(h.lanes);
      const payload={type:h.type,lat:h.lat,lng:h.lng,note:(h.psev?("size:"+POT_SEV[h.psev].label+(h.note?" · "+h.note:"")):(h.note||""))+(_ln?" · "+_ln:""),sev:h.psev||h.sev||2,reports:h.reports||1,device_id:deviceId()};
      try{ bumpReportCount(); }catch(e){}
      const r=await fetch(`${S.sb.url}/rest/v1/hazards`,{method:"POST",headers:sbH({"Content-Type":"application/json",Prefer:"return=minimal"}),body:JSON.stringify(payload)});
      if(!r.ok)toast("Saved on your map — cloud sync failed ("+r.status+")");
    }catch(e){ toast("Saved on your map — offline, will show for you"); }
  }
}
document.querySelectorAll("#reportSheet [data-type]").forEach(b=>b.onclick=()=>{
  try{if(navigator.vibrate)navigator.vibrate(40);}catch(e){}
  // confirmation pulse — visually distinct from the slide highlight so a fired report
  // never looks like a tile you merely passed over
  try{ b.classList.remove("fired"); void b.offsetWidth; b.classList.add("fired");
       setTimeout(function(){ b.classList.remove("fired"); },460); }catch(e){}
  if(b.dataset.closure){ closeSheets(); try{reportClosure();}catch(e){ reportHazard("road_closure"); } return; }
  reportHazard(b.dataset.type);
});

/* ═══════════ slide across the report grid ═══════════
   Drag a finger over the tiles and each lights as you reach it. Deliberately does NOT select:
   a touch that moves doesn't generate a click, so only a real tap files a report. Everything
   here is presentation — no preventDefault, no stopPropagation, no interference with the tap
   path above — so if any of it fails the grid still works exactly as it did. */
(function(){
  var grid=document.getElementById("reportSheet"); if(!grid) return;
  var lit=null;
  // Sweep every tile rather than trusting a single stored reference: a missed touchend —
  // finger lifted outside the sheet, a second finger landing, the sheet re-rendering — used
  // to strand the class on a tile the variable had already moved past, leaving two lit.
  function clearLit(){
    try{ grid.querySelectorAll(".rtile.lit").forEach(function(n){ n.classList.remove("lit"); }); }catch(e){}
    lit=null;
  }
  function light(el){
    if(el===lit && el && el.classList.contains("lit")) return;
    clearLit();
    lit=el;
    if(lit){
      lit.classList.add("lit");
      try{ if(navigator.vibrate) navigator.vibrate(8); }catch(e){}   // faint tick per tile
    }
  }
  function tileAt(t){
    if(!t) return null;
    var el=document.elementFromPoint(t.clientX,t.clientY);
    return el ? el.closest("#reportSheet [data-type]") : null;
  }
  grid.addEventListener("touchstart",function(e){ light(tileAt(e.touches[0])); },{passive:true});
  grid.addEventListener("touchmove", function(e){ light(tileAt(e.touches[0])); },{passive:true});
  // listen on document, not the grid: a finger that lifts outside the sheet still ends the
  // gesture, and that was one of the ways a tile got stranded lit
  ["touchend","touchcancel"].forEach(function(ev){
    document.addEventListener(ev,function(){ clearLit(); },{passive:true});
  });
  // belt and braces — reopening the sheet always starts clean
  try{ var fr=document.getElementById("fabReport");
       if(fr) fr.addEventListener("click",function(){ setTimeout(clearLit,0); }); }catch(e){}
  // pointer devices get the same treatment on hover, without the haptic
  grid.addEventListener("pointermove",function(e){
    if(e.pointerType==="touch") return;
    var el=e.target&&e.target.closest?e.target.closest("#reportSheet [data-type]"):null;
    if(el!==lit){ clearLit(); lit=el; if(lit)lit.classList.add("lit"); }
  });
  grid.addEventListener("pointerleave",function(){ clearLit(); });
})();
/* A hazard past its TTL should never come back from the server. Without this, sweepHazards
   removed an expired row locally and the next sync fetched it straight back — a police report
   from two weeks ago (TTL 20 minutes) reappearing every 60 seconds forever, which looked
   exactly like clearing was broken. Permanent types (TTL 0 — potholes, cones, cameras) never
   expire and are unaffected. */
function clusterHazards(rows){
  var out=[];
  rows.forEach(function(r){
    for(var i=0;i<out.length;i++){
      var k=out[i];
      if(k.type===r.type && distM({lat:r.lat,lng:r.lng},{lat:k.lat,lng:k.lng})<=25){
        k.reports=(k.reports||1)+(r.reports||1);
        if((r.sev||0)>(k.sev||0)) k.sev=r.sev;          // keep the worst severity reported
        if(r.created_at>k.created_at) k.created_at=r.created_at;
        return;
      }
    }
    out.push(Object.assign({},r));
  });
  return out;
}
function notExpired(r){
  try{
    var ttl=HAZ_TTL[r.type];
    if(!ttl) return true;                                  // 0 or undefined = permanent
    var t=r.created_at?Date.parse(r.created_at):NaN;
    if(!isFinite(t)) return true;                          // no timestamp — don't discard it
    return (Date.now()-t) <= ttl*60000;
  }catch(e){ return true; }
}
/* ═══════════ live sync ═══════════
   Shared hazards were only ever fetched at boot, on saving Supabase settings, and from the
   welcome screen — so a phone open on the passenger seat never saw a report filed thirty
   seconds ago on another device, and a cleared hazard never disappeared until reload. For a
   live hazard network that's the whole point, so poll while the app is actually in use.
   Quiet by design: skipped when the tab is hidden, when offline, and silent on success — the
   "Loaded N shared reports" toast stays on the manual/boot path only. */
var _syncTimer=null;
async function syncHazards(){
  if(document.hidden || !navigator.onLine) return;
  if(!S.sb.url || !S.sb.key) return;
  try{
    const rows=await (await fetch(`${S.sb.url}/rest/v1/hazards?select=*&order=created_at.desc&limit=300`,{headers:sbH()})).json();
    if(!Array.isArray(rows)) return;
    const keep=clusterHazards(rows.filter(function(r){ return !r.cleared_at && notExpired(r) && notDismissed(r); }));
    const before=new Set((S.hazards||[]).map(function(h){ return h.id; }));
    const after=new Set(keep.map(function(r){ return r.id; }));
    var added=0, removed=0;
    after.forEach(function(id){ if(!before.has(id)) added++; });
    before.forEach(function(id){ if(!after.has(id)) removed++; });
    if(!added && !removed) return;                  // nothing changed — don't touch the map
    hzMarkers.forEach(function(m){ m.remove(); }); hzMarkers.length=0;
    S.hazards=keep; keep.forEach(addHazardMarker);
    try{ if(S.heatOn) refreshHeat(); }catch(e){}
    try{ applyHzFilters(); }catch(e){}
    if(added) toast(added===1?"1 new report nearby":added+" new reports nearby",1800);
  }catch(e){}
}
/* ═══════════ realtime hazard push ═══════════
   Polling every 60s meant a report could sit unseen for most of a minute. Supabase Realtime
   pushes the change the instant it's written, so it lands in about a second.
   Implemented as a raw websocket rather than pulling in supabase-js: the app is offline-first
   with a precaching service worker, and a 40kb dependency for one socket isn't worth the
   cache churn. Entirely additive — if the socket never connects, or the table isn't in the
   publication, polling carries on exactly as before and nothing breaks. */
var _rtSock=null, _rtRef=0, _rtHeart=null, _rtRetry=0, _rtLive=false;
function _rtSend(o){ try{ _rtSock&&_rtSock.readyState===1&&_rtSock.send(JSON.stringify(o)); }catch(e){} }
function stopRealtime(){
  _rtLive=false;
  if(_rtHeart){ clearInterval(_rtHeart); _rtHeart=null; }
  try{ if(_rtSock){ _rtSock.onclose=null; _rtSock.close(); } }catch(e){}
  _rtSock=null;
}
function startRealtime(){
  if(!S.sb.url||!S.sb.key) return;
  if(_rtSock) return;
  var host;
  try{ host=new URL(S.sb.url).host; }catch(e){ return; }
  var url="wss://"+host+"/realtime/v1/websocket?apikey="+encodeURIComponent(S.sb.key)+"&vsn=1.0.0";
  try{ _rtSock=new WebSocket(url); }catch(e){ return; }

  _rtSock.onopen=function(){
    _rtRetry=0;
    _rtSend({topic:"realtime:public:hazards",event:"phx_join",ref:String(++_rtRef),
      payload:{config:{postgres_changes:[{event:"*",schema:"public",table:"hazards"}]}}});
    _rtHeart=setInterval(function(){
      _rtSend({topic:"phoenix",event:"heartbeat",payload:{},ref:String(++_rtRef)});
    },30000);
  };
  _rtSock.onmessage=function(ev){
    var m; try{ m=JSON.parse(ev.data); }catch(e){ return; }
    if(m.event==="phx_reply" && m.payload && m.payload.status==="ok" && m.topic.indexOf("hazards")>-1){
      _rtLive=true; startHazardSync();          // socket is up — relax the poll to a safety net
      return;
    }
    if(m.event==="postgres_changes" || m.event==="INSERT" || m.event==="UPDATE" || m.event==="DELETE"){
      // Refetch rather than applying the delta: the row still has to pass the cleared_at,
      // expiry and dismissal filters, and one small request is simpler than duplicating that.
      try{ syncHazards(); }catch(e){}
    }
  };
  _rtSock.onclose=function(){
    _rtSock=null; _rtLive=false;
    if(_rtHeart){ clearInterval(_rtHeart); _rtHeart=null; }
    startHazardSync();                          // back to the faster poll while disconnected
    var wait=Math.min(30000,1000*Math.pow(2,Math.min(5,_rtRetry++)));   // 1s,2s,4s… capped 30s
    setTimeout(function(){ if(!document.hidden&&navigator.onLine) startRealtime(); },wait);
  };
  _rtSock.onerror=function(){ try{ _rtSock&&_rtSock.close(); }catch(e){} };
}
function startHazardSync(){
  if(_syncTimer) clearInterval(_syncTimer);
  // 60s normally; once realtime is pushing, drop to a 5-minute safety net that only exists to
  // catch anything the socket missed while the tab was backgrounded
  _syncTimer=setInterval(syncHazards,_rtLive?300000:60000);
}
document.addEventListener("visibilitychange",function(){
  if(document.hidden){ stopRealtime(); }               // no socket held open in the background
  else { syncHazards(); startRealtime(); }
});
/* Building every marker in one pass is a single long task on the main thread — on a phone
   opening the link for the first time it lands right when the map is still painting, and the UI
   is frozen until it finishes. Twelve at a time, one batch per frame: same markers, no stall. */
function addMarkersChunked(list){
  var i=0;
  function batch(){
    var end=Math.min(i+12,list.length);
    for(;i<end;i++){ try{ addHazardMarker(list[i]); }catch(e){} }
    if(i<list.length) requestAnimationFrame(batch);
    else try{ cullMarkers(); }catch(e){}
  }
  requestAnimationFrame(batch);
}
async function loadSharedHazards(){
  if(!S.sb.url||!S.sb.key){toast("Add your Supabase URL + key first.");return;}
  try{
    const rows=await (await fetch(`${S.sb.url}/rest/v1/hazards?select=*&order=created_at.desc&limit=300`,{headers:sbH()})).json();
    if(Array.isArray(rows)){const keep=clusterHazards(rows.filter(function(r){ return !r.cleared_at && notExpired(r) && notDismissed(r); }));hzMarkers.forEach(m=>m.remove());hzMarkers.length=0;S.hazards=keep;addMarkersChunked(keep);if(S.heatOn)refreshHeat();toast(`Loaded ${keep.length} shared reports ✓`);}
  }catch{toast("Couldn't reach Supabase.");}
}

/* ═══════════ POI discovery ═══════════ */
/* ═══════════ v30: category POI search — nearest first, expandable radius, colored map labels ═══════════ */
const POI_TAGS={
  fuel:{q:'node["amenity"="fuel"]',emoji:"⛽",color:"#F5A623",label:"Gas"},
  charging_station:{q:'node["amenity"="charging_station"]',emoji:"⚡",color:"#10B981",label:"EV Charging"},
  restaurant:{q:'node["amenity"~"^(restaurant|fast_food)$"]',emoji:"🍽",color:"#E5484D",label:"Food"},
  cafe:{q:'node["amenity"="cafe"]',emoji:"☕",color:"#8B5E3C",label:"Coffee"},
  attraction:{q:'node["tourism"="attraction"]',emoji:"🎡",color:"#8B5CF6",label:"Attractions"},
  parking:{q:'node["amenity"="parking"]',emoji:"🅿️",color:"#2B5FD9",label:"Parking"},
  grocery:{q:'node["shop"~"^(supermarket|grocery|convenience)$"]',emoji:"🛒",color:"#2F9E5B",label:"Grocery"},
  pharmacy:{q:'node["amenity"="pharmacy"]',emoji:"💊",color:"#3B82F6",label:"Pharmacy"},
  hospital:{q:'node["amenity"~"^(hospital|clinic)$"]',emoji:"🏥",color:"#E5484D",label:"Hospital"},
  bank:{q:'node["amenity"~"^(bank|atm)$"]',emoji:"🏦",color:"#6366F1",label:"Bank / ATM"},
  hotel:{q:'node["tourism"~"^(hotel|motel)$"]',emoji:"🏨",color:"#8B5CF6",label:"Hotel"}
};
function poiCategory(q){
  const s=" "+q.trim().toLowerCase()+" ";
  const K=[[/\b(food|restaurants?|eat|eats|dinner|lunch|hungry)\b/,"restaurant"],[/\b(gas|fuel|petrol|gas station)\b/,"fuel"],
    [/\b(grocery|groceries|supermarket)\b/,"grocery"],[/\b(coffee|cafe|caf\u00e9)\b/,"cafe"],
    [/\b(pharmacy|drugstore|drug store|cvs|walgreens)\b/,"pharmacy"],[/\b(hospital|\ber\b|clinic|urgent care)\b/,"hospital"],
    [/\b(atm|bank)\b/,"bank"],[/\b(hotel|motel|lodging)\b/,"hotel"],[/\b(parking)\b/,"parking"],
    [/\b(ev charging|charger|charging station|charge station)\b/,"charging_station"],[/\b(attractions?|things to do|sightsee)\b/,"attraction"]];
  const wordCount=q.trim().split(/\s+/).length;
  if(wordCount<=3){ for(const [re,key] of K){ if(re.test(s))return Object.assign({key},POI_TAGS[key]); } }
  return null;
}
let poiMarkers=[],curCat=null,curRadius=8000;
function clearPoiMarkers(){ poiMarkers.forEach(m=>{try{m.remove();}catch(e){}}); poiMarkers=[]; }
function placeLabelMarker(lat,lng,text,color,emoji){
  try{
    const el=document.createElement("div");
    el.style.cssText="display:flex;flex-direction:column;align-items:center;pointer-events:none";
    el.innerHTML='<div style="font-size:15px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.55))">'+(emoji||"📍")+'</div>'+
      '<div style="margin-top:1px;font-size:11px;font-weight:800;color:'+color+';background:rgba(255,255,255,.94);padding:1px 6px;border-radius:7px;white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,.35);border:1px solid '+color+'">'+text+'</div>';
    return new maplibregl.Marker({element:el,anchor:"top"}).setLngLat([lng,lat]).addTo(map);
  }catch(e){return null;}
}
/* ═══════════ weather radar overlay ═══════════
   RainViewer public tiles: free, no key, ~10 min refresh. Nobody in the navigation space
   ships live precipitation on the driving map — it pairs naturally with the flooding and
   ice hazard types already here. Off by default; a raster layer under no circumstances
   goes above the route line or the hazard markers. */
var _radarTs=null, _radarTimer=null;
async function radarFrame(){
  try{
    var d=await (await fetch("https://api.rainviewer.com/public/weather-maps.json")).json();
    var past=(d&&d.radar&&d.radar.past)||[];
    return past.length ? past[past.length-1].path : null;
  }catch(e){ return null; }
}
async function radarOn(){
  var path=await radarFrame();
  if(!path){ toast("Radar unavailable right now",2200); return false; }
  _radarTs=path;
  try{
    if(map.getLayer("cw-radar")) map.removeLayer("cw-radar");
    if(map.getSource("cw-radar")) map.removeSource("cw-radar");
    map.addSource("cw-radar",{type:"raster",tiles:["https://tilecache.rainviewer.com"+path+"/256/{z}/{x}/{y}/2/1_1.png"],tileSize:256,maxzoom:10});
    // insert BENEATH the route line so navigation is never obscured by weather
    var before=null; try{ if(map.getLayer("route-line")) before="route-line"; }catch(e){}
    map.addLayer({id:"cw-radar",type:"raster",source:"cw-radar",paint:{"raster-opacity":0.55}}, before||undefined);
  }catch(e){ return false; }
  return true;
}
function radarOff(){
  try{ if(map.getLayer("cw-radar")) map.removeLayer("cw-radar"); }catch(e){}
  try{ if(map.getSource("cw-radar")) map.removeSource("cw-radar"); }catch(e){}
  if(_radarTimer){ clearInterval(_radarTimer); _radarTimer=null; }
}
document.addEventListener("visibilitychange",function(){
  if(!document.hidden && S.radarOn){ radarFrame().then(function(p){ if(p&&p!==_radarTs) radarOn(); }); }
});
async function toggleRadar(){
  var on=!(S.radarOn);
  if(on){
    var ok=await radarOn(); if(!ok) return;
    S.radarOn=true;
    _radarTimer=setInterval(function(){
      if(document.hidden) return;                     // don't pull tiles for a screen nobody sees
      radarFrame().then(function(p){ if(p&&p!==_radarTs) radarOn(); });
    },600000);
    toast("Weather radar on — precipitation, refreshes every 10 min",2600);
  } else {
    S.radarOn=false; radarOff(); toast("Weather radar off",1400);
  }
  try{ localStorage.setItem("cw_radar",S.radarOn?"1":"0"); }catch(e){}
  var st=$("radarState"); if(st) st.textContent=S.radarOn?"On — live precipitation":"Off — tap to show rain & snow";
}
function openCategorySearch(cat){ curCat=cat; curRadius=8000; openSheet("discoverSheet"); var t=$("discoverTitle"); if(t)t.textContent=cat.emoji+" "+cat.label+" — nearest first"; runCategory(); }
function discoverByPoi(tag){ var cat=POI_TAGS[tag]; if(cat){ cat=Object.assign({key:tag},cat); openCategorySearch(cat); } }
async function runCategory(){
  const cat=curCat; if(!cat)return;
  if(!S.pos){$("poiList").innerHTML='<p class="sub">Waiting for GPS lock…</p>';return;}
  const miTxt=(curRadius/1609).toFixed(0);
  $("poiList").innerHTML='<p class="sub">Searching within '+miTxt+' mi…</p>';
  const query=`[out:json][timeout:15];${cat.q}(around:${curRadius},${S.pos.lat},${S.pos.lng});out body 50;`;
  try{
    const d=await (await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:"data="+encodeURIComponent(query),headers:{"Content-Type":"application/x-www-form-urlencoded"}})).json();
    const els=(d.elements||[]).filter(e=>e.tags&&e.tags.name)
      .map(e=>({name:e.tags.name,lat:e.lat,lng:e.lon,hours:e.tags.opening_hours,dist:distM(S.pos,{lat:e.lat,lng:e.lon})}))
      .sort((a,b)=>a.dist-b.dist).slice(0,15);
    clearPoiMarkers();
    if(!els.length){ $("poiList").innerHTML='<p class="sub">Nothing found within '+miTxt+' mi.</p>'+expandHTML(); wireExpand(); return; }
    $("poiList").innerHTML="";
    els.forEach(e=>{
      const mk=placeLabelMarker(e.lat,e.lng,e.name,cat.color,cat.emoji); if(mk)poiMarkers.push(mk);
      const div=document.createElement("div");div.className="poi-item";
      div.innerHTML='<span><b>'+e.name+'</b><small class="rmeta" data-lat="'+e.lat+'" data-lng="'+e.lng+'">'+fmtDist(e.dist)+' away'+(e.hours?" · "+e.hours.slice(0,22):"")+'</small></span>'+
        '<span class="poi-acts"><button class="pgo" style="background:'+cat.color+';color:#fff">Go</button><button class="pstop" style="background:rgba(127,127,127,.2);color:inherit;border:1px solid rgba(127,127,127,.3)">+Stop</button></span>';
      div.querySelector(".pgo").onclick=()=>{closeSheets();setDestination({lat:e.lat,lng:e.lng},e.name);};
      div.querySelector(".pstop").onclick=()=>addStop({lat:e.lat,lng:e.lng},e.name);
      $("poiList").appendChild(div);
    });
    $("poiList").insertAdjacentHTML("beforeend",expandHTML()); wireExpand();
    try{ upgradePoiDistances(els); }catch(e){}
  }catch{ $("poiList").innerHTML='<p class="sub">Discovery service busy — try again in a moment.</p>'; }
}
function expandHTML(){ return curRadius<32000
  ? '<button class="btn ghost" id="poiExpand" style="width:100%;margin-top:10px">🔍 Expand search to '+((curRadius*2)/1609).toFixed(0)+' mi</button>'
  : '<p class="sub" style="margin-top:10px;text-align:center">Widest search area reached.</p>'; }
function wireExpand(){ var b=$("poiExpand"); if(b)b.onclick=()=>{ curRadius=Math.min(32000,curRadius*2); runCategory(); }; }
document.querySelectorAll("#discoverSheet .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#discoverSheet .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");discoverByPoi(c.dataset.poi);});

/* ═══════════ modes ═══════════ */
document.querySelectorAll(".mode").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".mode").forEach(x=>x.classList.remove("on"));b.classList.add("on");
  S.mode=b.dataset.mode;
  toast({car:"Driving — respects one-ways & restricted roads",bike:"Cycling — prefers bike infrastructure",foot:"Walking routes",hike:"Trail / mountain — foot paths preferred"}[S.mode]);
  if(S.dest)fetchRoute();
});

/* ═══════════ compass & motion sensors ═══════════ */
/* ═══════════ true north without a model, a key, or a network ═══════════
   The magnetometer reads MAGNETIC north. True north differs by the local declination — about
   7.5 deg in Detroit, over 20 in Alaska, near zero in Florida — so a raw magnetic heading
   labelled "N" is simply wrong, by a different amount everywhere.

   The usual fix is the World Magnetic Model, but NOAA's declination API requires registration,
   and a key shipped in a public PWA is a key that leaks. Embedding the model means carrying its
   coefficient table and reissuing the app every five years.

   There is a better source already on board. While the car is MOVING, two independent headings
   exist at once: GPS course over ground, which is true north by definition and needs no model,
   and the magnetometer, which is magnetic. Their difference IS the local declination. Learn it
   on the move, apply it when stopped. Self-calibrating, works anywhere on Earth, costs nothing.

   iOS is a special case worth honouring: webkitCompassHeading is ALREADY true-north corrected
   by the OS, so on iOS there is nothing to learn and nothing to add. */
var _decl=null, _declN=0, _declNative=false;
try{ var _dv=JSON.parse(localStorage.getItem("cw_decl")||"null");
     if(_dv && isFinite(_dv.d)){ _decl=_dv.d; _declN=_dv.n||1; } }catch(e){}
function _angDiff(a,b){ return ((a-b+540)%360)-180; }
/* A 12 mph floor would mean the compass NEVER calibrates on foot — and walking and hiking are
   exactly where a compass earns its keep, because there is no windscreen and no road to tell you
   which way you are pointing. The floor existed because INSTANTANEOUS GPS course is noise at
   walking pace; the fix is not to lower it but to stop using that signal.

   Instead derive the heading from displacement over a window: where you were ~14 seconds ago
   versus where you are now. Over 25+ metres that bearing is solid even at 3 mph, because the
   GPS error stays roughly constant while the baseline grows. Then require the path to have been
   roughly STRAIGHT across the window — a bearing taken around a corner is a lie regardless of
   how far you walked. */
var _trk=[];
function _trackPoint(){
  try{
    if(!S.pos) return;
    var now=Date.now();
    var last=_trk[_trk.length-1];
    if(last && now-last.t < 1500) return;
    _trk.push({lat:S.pos.lat,lng:S.pos.lng,t:now,acc:S.accuracy||999});
    while(_trk.length && now-_trk[0].t > 60000) _trk.shift();
  }catch(e){}
}
/* Bearing over the window, or null if the window can't be trusted. */
function windowedCourse(){
  try{
    if(_trk.length<4) return null;
    var now=Date.now();
    var a=null;
    /* Window and distance are sized for WALKING, which is the slowest thing that needs to
       calibrate. At 3 mph (1.34 m/s) a 16-second window covers only ~21m — so the first version
       of this demanded 25m and would essentially never have fired on foot. A 24-second window
       covers ~32m at the same pace, and 18m is comfortably above GPS noise on a good fix. */
    for(var i=0;i<_trk.length;i++){ if(now-_trk[i].t<=24000){ a=_trk[i]; break; } }
    if(!a) a=_trk[0];
    var b=_trk[_trk.length-1];
    if(b.t-a.t < 9000) return null;                       // too short a baseline to mean anything
    if(a.acc>25 || b.acc>25) return null;                 // fixes too loose to trust the endpoints
    var span=distM(a,b);
    if(span<18) return null;                              // standing still or shuffling
    /* Straightness. The obvious test — sum the per-fix path and compare it to the chord — does
       not survive contact with a walking pace: each fix carries several metres of GPS noise
       while each step advances only ~2m, so the measured path is mostly jitter and a perfectly
       straight walk scores as a wander. Compare HALVES instead: the bearing over the first half
       against the second. Averaging across many fixes cancels the noise, while a genuine corner
       still swings the two apart. */
    var mid=null, midT=(a.t+b.t)/2, bestDT=Infinity;
    for(var k=0;k<_trk.length;k++){
      if(_trk[k].t<a.t) continue;
      var dt=Math.abs(_trk[k].t-midT);
      if(dt<bestDT){ bestDT=dt; mid=_trk[k]; }
    }
    if(mid){
      var h1=_bearingDeg([a.lng,a.lat],[mid.lng,mid.lat]);
      var h2=_bearingDeg([mid.lng,mid.lat],[b.lng,b.lat]);
      if(Math.abs(_angDiff(h1,h2))>38) return null;      // turned mid-window: bearing is a lie
    }
    return _bearingDeg([a.lng,a.lat],[b.lng,b.lat]);
  }catch(e){ return null; }
}
function learnDeclination(){
  try{
    if(_declNative) return;                       // iOS already gives true north
    if(S.compass===null) return;
    var truth=null, weight=0.06;
    if(S.course!==null && S.speedMph>=12){
      truth=S.course;                             // driving: instantaneous course is reliable
    } else {
      /* On foot, on a bike, on a trail. The windowed bearing is slower to earn but just as true,
         so it is weighted lower per sample rather than excluded. */
      truth=windowedCourse();
      weight=0.035;
    }
    if(truth===null) return;
    var d=_angDiff(truth,S.compass);
    if(Math.abs(d)>45) return;                    // declination is never this large: bad sample
    _decl = (_decl===null) ? d : (_decl*(1-weight) + d*weight);
    _declN++;
    if(_declN%25===0){ try{ localStorage.setItem("cw_decl",JSON.stringify({d:_decl,n:_declN,t:Date.now()})); }catch(e){} }
  }catch(e){}
}
/* The heading we actually display: true north when we can justify it, magnetic otherwise —
   and the UI says which, rather than claiming true north it cannot deliver. */
function trueHeading(){
  /* Driving: instantaneous course is true north and needs no correction. Walking: it jitters
     badly, so prefer the corrected magnetic reading, which is steady and — once calibrated —
     just as true. */
  if(S.course!==null && S.speedMph>=8) return {deg:S.course,tn:true};
  if(S.compass===null) return {deg:null,tn:false};
  if(_declNative) return {deg:S.compass,tn:true};                          // iOS-corrected
  if(_decl!==null && _declN>=8) return {deg:(S.compass+_decl+360)%360,tn:true};
  return {deg:S.compass,tn:false};                                         // magnetic, still learning
}
function _compassTicks(){
  var g=document.getElementById("compTicks");
  if(!g||g.childNodes.length) return;
  var out="";
  for(var a=0;a<360;a+=15){
    var maj=(a%45===0);
    var r1=maj?31:34, r2=38;
    var rad=(a-90)*Math.PI/180;
    var x1=50+Math.cos(rad)*r1, y1=50+Math.sin(rad)*r1;
    var x2=50+Math.cos(rad)*r2, y2=50+Math.sin(rad)*r2;
    out+='<line class="cw-tick'+(maj?" maj":"")+'" x1="'+x1.toFixed(2)+'" y1="'+y1.toFixed(2)+
         '" x2="'+x2.toFixed(2)+'" y2="'+y2.toFixed(2)+'"/>';
  }
  g.innerHTML=out;
}
function compassOpen(){
  try{ var el=$("compassSheet"); return !!(el&&el.classList.contains("open")); }catch(e){ return false; }
}
function updateCompassUI(){
  /* The dial used to live on the map, so it repainted on every GPS and orientation event for a
     driver who was not looking at it. In a panel it only has to be right while it is visible —
     and the sweep animation stops costing frames the rest of the time. */
  if(!compassOpen()) return;
  try{ _compassTicks(); }catch(e){}
  var h=trueHeading();
  var deg=h.deg;
  var lab=$("compDeg"), dial=document.getElementById("compDial"), box=$("compass");
  if(deg===null){ if(lab) lab.textContent="—"; return; }
  const dirs=["N","NE","E","SE","S","SW","W","NW"];
  // The suffix is the honest part: T = true north, M = still magnetic while it calibrates.
  if(lab) lab.textContent=dirs[Math.round(deg/45)%8]+" "+Math.round(deg)+"°"+(h.tn?"":" M");
  /* The DIAL rotates, not the needle. A compass needle holds still against the world while the
     card turns under it — rotating the needle instead is the tell that it is a widget, not an
     instrument. So: counter-rotate the whole card by the heading and the map's bearing. */
  var rot = -(map?map.getBearing():0) - (S.headingUp?0:deg);
  if(dial) dial.style.transform="rotate("+rot.toFixed(1)+"deg)";
  if(box){ box.classList.toggle("hup",S.headingUp); box.classList.toggle("tn",!!h.tn); }
  var ro=$("compReadout");
  if(ro){
    var src = _declNative ? "True north \u00b7 corrected by iOS"
            : (h.tn ? (S.course!==null&&S.speedMph>=8 ? "True north \u00b7 from GPS course"
                                                      : "True north \u00b7 self-calibrated")
                    : "Magnetic north \u00b7 calibrating");
    var cal = _declNative ? "" :
              (_decl===null ? "No declination learned yet — walk or drive a straight stretch"
                            : ("Local declination "+(_decl>0?"+":"")+_decl.toFixed(1)+"\u00b0 \u00b7 "+_declN+" samples"));
    ro.innerHTML = Math.round(deg)+"\u00b0 "+dirs[Math.round(deg/45)%8]+"<br><span style=\"opacity:.72\">"+src+"</span>"+
                   (cal?"<br><span style=\"opacity:.55;font-size:11px\">"+cal+"</span>":"");
  }
}
async function toggleHeadingUp(){
  await requestMotion();
  S.headingUp=!S.headingUp;
  try{ localStorage.setItem("cw_north_up", S.headingUp?"0":"1"); }catch(e){}   // remembered across trips
  toast(S.headingUp?"Heading-up — map rotates with you":"North-up — locked, stays north while navigating");
  if(!S.headingUp)map.easeTo({bearing:0});
  cameraFollow();updateCompassUI();
  try{ var b=$("compHup"); if(b) b.classList.toggle("on",S.headingUp); }catch(e){}
}
if($("compass")) $("compass").onclick=toggleHeadingUp;
let motionGranted=false;
async function requestMotion(){
  if(motionGranted)return;
  try{
    if(typeof DeviceOrientationEvent!=="undefined"&&DeviceOrientationEvent.requestPermission){
      if(await DeviceOrientationEvent.requestPermission()!=="granted")return;
    }
    if(typeof DeviceMotionEvent!=="undefined"&&DeviceMotionEvent.requestPermission){
      try{await DeviceMotionEvent.requestPermission();}catch{}
    }
  }catch{}
  motionGranted=true;
  window.addEventListener("deviceorientation",(e)=>{
    if(e.webkitCompassHeading!==undefined){ S.compass=e.webkitCompassHeading; _declNative=true; }
    else if(e.alpha!==null)S.compass=(360-e.alpha)%360;
    if(S.speedMph<2&&S.compass!==null&&!S.navigating)S.course=S.compass;
    try{ learnDeclination(); }catch(err){}
    updateCompassUI();
  });
  window.addEventListener("devicemotion",onMotion);
}
// impact detection → road-roughness logging + pothole prompt (the road-quality moat)
let lastBump=0, _accBaseline=9.8;
function onMotion(e){
  if(!S.bumpOn||S.speedMph<8)return;
  const a=e.accelerationIncludingGravity;if(!a)return;
  const mag=Math.sqrt((a.x||0)**2+(a.y||0)**2+(a.z||0)**2);
  // Track a slow running baseline (the phone's resting orientation ≈ 1g in whatever direction
  // it's mounted). A real pothole is a SPIKE above that baseline — measuring the spike instead
  // of raw magnitude makes detection independent of how the phone is sitting, and kills the
  // constant low-level triggering from seams and freeway ripple.
  _accBaseline = _accBaseline*0.95 + mag*0.05;      // EMA, ~1-2s time constant
  const jolt = mag - _accBaseline;                  // deviation from baseline = the actual jolt
  if(jolt>_recentPeakJolt) _recentPeakJolt=jolt;    // rolling peak, decayed each GPS fix (for self-healing)
  if(jolt>7.5 && S.pos){
    // real jolt → log as a road-roughness point (feeds the heatmap). Raised from 4 → 7.5 so
    // only genuine rough spots plot, not every joint — this also stops the heatmap flooding.
    roughLog(S.pos.lat,S.pos.lng,Math.min(1,(jolt-7.5)/20));
  }
  /* The prompt was firing constantly on Detroit streets. Three changes:
     - threshold 15 → 22, because a genuine pothole hit is much harder than a bad seam
     - cooldown 15s → 35s, so one rough block can't produce a run of prompts
     - and the real fix: don't ask about a pothole that's ALREADY on the map. On a known-bad
       stretch the answer is already recorded, so asking again is pure noise. */
  if(jolt>22 && Date.now()-lastBump>35000 && S.pos){
    var alreadyKnown=false;
    try{
      alreadyKnown=(S.hazards||[]).some(function(h){
        return (h.type==="pothole"||h.type==="speed_bump") && distM(S.pos,h)<45;
      });
    }catch(e){}
    if(!alreadyKnown){
      lastBump=Date.now();
      $("bumpBar").style.display="flex";
      beep(520,.2);if(navigator.vibrate)navigator.vibrate(60);
      setTimeout(()=>{$("bumpBar").style.display="none";},9000);
    } else {
      lastBump=Date.now();                       // still start the cooldown — the hit was real
    }
  }
}
// ── Recurring-slowdown learner ────────────────────────────────────────────────
// No live-traffic feed exists on this stack, so instead of pretending, we learn YOUR pattern:
// when you crawl through the same stretch at the same sort of time repeatedly, the app starts
// warning you before you get there. Purely local, purely from your own drives.
let slowPts=[]; try{ slowPts=JSON.parse(localStorage.getItem("cw_slow")||"[]"); }catch(e){}
let _slowRun=0, _slowAnchor=null, _lastSlowWarn=0;
function _slowKey(lat,lng){ return lat.toFixed(3)+","+lng.toFixed(3); }          // ~110m cells
function _timeBucket(d){ const x=d||new Date(); return (x.getDay()>=1&&x.getDay()<=5?"wd":"we")+":"+x.getHours(); }
function learnSlowdown(){
  if(!S.pos) return;
  const lim=S.limit||45;
  const slow=(S.speedMph>1 && S.speedMph < lim*0.5);   // moving, but well under the limit = congestion
  if(slow){
    if(!_slowAnchor) _slowAnchor={lat:S.pos.lat,lng:S.pos.lng};
    _slowRun++;
    // sustained (~8 fixes) so a red light or a turn doesn't get logged as traffic
    if(_slowRun===8){
      const key=_slowKey(_slowAnchor.lat,_slowAnchor.lng), tb=_timeBucket();
      let rec=slowPts.find(p=>p.k===key && p.tb===tb);
      if(rec){ rec.n=(rec.n||1)+1; rec.t=Date.now(); }
      else slowPts.push({k:key,tb,lat:_slowAnchor.lat,lng:_slowAnchor.lng,n:1,t:Date.now()});
      try{ localStorage.setItem("cw_slow",JSON.stringify(slowPts.slice(-400))); }catch(e){}
    }
  } else { _slowRun=0; _slowAnchor=null; }
}
function checkSlowAhead(){
  if(!S.pos||!S.navigating||!slowPts.length) return;
  if(S.speedMph<15) return;                                  // already crawling — no point warning
  if(Date.now()-_lastSlowWarn<120000) return;                // at most one nudge every 2 min
  const tb=_timeBucket(), now=Date.now(), cut=now-90*864e5;  // only patterns seen in the last ~90 days
  for(const p of slowPts){
    if(p.tb!==tb || (p.n||1)<2 || (p.t||0)<cut) continue;    // must have happened 2+ times at this hour
    const d=distM(S.pos,{lat:p.lat,lng:p.lng});
    if(d<900 && d>250){                                      // roughly a half-mile heads-up
      // Soft, honest wording — a learned pattern from your own drives, not live traffic.
      toast("🕒 This stretch is usually slow around now",3200);
      _lastSlowWarn=now; return;
    }
  }
}
// rolling road-roughness log (kept local + drawn as a heatmap; recent points only)
let roughPts=[]; try{ roughPts=JSON.parse(localStorage.getItem("cw_rough")||"[]"); }catch(e){}
// ── Self-healing road sensor ──────────────────────────────────────────────────
// As you re-drive a road, smooth passes are a vote that the surface is fine now (pothole
// filled, or the original point was noise). Each smooth pass GENTLY lowers a nearby point's
// weight; a fresh jolt there re-arms it. Points that fade below a floor are dropped, so the
// heatmap becomes a living consensus of CURRENT road state — and old over-logged data clears
// itself as you drive familiar routes.
let _recentPeakJolt=0;
function healRoughness(){
  if(!S.pos||!roughPts.length||(S.speedMph||0)<8) return;
  const peak=_recentPeakJolt; _recentPeakJolt=0;    // was this stretch just driven smoothly?
  const smooth = peak < 5.0;
  let changed=false; const drop=[];
  for(let i=0;i<roughPts.length;i++){
    const p=roughPts[i];
    if(distM(S.pos,{lat:p.lat,lng:p.lng})>28) continue;   // only points we're passing over
    if(smooth){
      p.s=(p.s||0.4)-0.12;                          // gentle: ~3-4 clean passes to fade a point out
      if(p.s<=0.12) drop.push(i);                   // faded below the floor → heal it away
      changed=true;
    } else if(peak>7.5){
      p.s=Math.min(1,(p.s||0.4)+0.15); p.t=Date.now();   // still rough → re-arm (real potholes never heal)
      changed=true;
    }
  }
  if(drop.length){ for(let k=drop.length-1;k>=0;k--) roughPts.splice(drop[k],1); }
  if(changed){
    try{ localStorage.setItem("cw_rough",JSON.stringify(roughPts.slice(-1500))); }catch(e){}
    if(S.heatOn) refreshHeat();
  }
}
function roughLog(lat,lng,score){
  roughPts.push({lat,lng,s:score,t:Date.now()});
  if(roughPts.length>1500)roughPts=roughPts.slice(-1500);   // cap
  try{ localStorage.setItem("cw_rough",JSON.stringify(roughPts.slice(-1500))); }catch(e){}
  if(S.heatOn)refreshHeat();
}
$("bumpYes").onclick=()=>{$("bumpBar").style.display="none";reportHazard("pothole","Auto-detected impact");};
$("bumpNo").onclick=()=>{$("bumpBar").style.display="none";};

/* ═══════════ wake lock — keep the screen ON while navigating (belt + suspenders) ═══════════ */
let _wlWarned=false, _noSleepRAF=null, _noSleepStream=null;
async function requestWakeLock(){
  try{
    if("wakeLock" in navigator){
      S.wakeLock=await navigator.wakeLock.request("screen");
      S.wakeLock.addEventListener&&S.wakeLock.addEventListener("release",()=>{ if(S.navigating)setTimeout(requestWakeLock,500); });
      stopNoSleep();            // real lock held → don't waste power on the video fallback
      return;
    } else if(!_wlWarned){ _wlWarned=true; toast("⚠ Keep your screen from sleeping — turn off Low Power Mode for driving.",6000); }
  }catch(e){
    if(!_wlWarned){ _wlWarned=true; toast("⚠ Screen may sleep in Low Power Mode. Turn it off (Settings › Battery) for uninterrupted navigation.",7000); }
  }
  // only reached when the OS refused the lock — use the lightweight video fallback
  if(S.navigating) startNoSleep();
}
function releaseWakeLock(){ try{S.wakeLock&&S.wakeLock.release();S.wakeLock=null;}catch(e){} stopNoSleep(); }
// canvas→video stream: an actively-playing muted video keeps the display awake as a fallback
function startNoSleep(){
  try{
    const v=$("noSleepVid"); if(!v)return;
    if(!_noSleepStream){
      const c=document.createElement("canvas"); c.width=2; c.height=2; const ctx=c.getContext("2d");
      const draw=()=>{ ctx.fillStyle=(Date.now()>>9)&1?"#000":"#010101"; ctx.fillRect(0,0,2,2); _noSleepRAF=requestAnimationFrame(draw); };
      draw();
      if(c.captureStream){ _noSleepStream=c.captureStream(2); v.srcObject=_noSleepStream; }
    }
    const p=v.play(); if(p&&p.catch)p.catch(()=>{});
  }catch(e){}
}
function stopNoSleep(){ try{ const v=$("noSleepVid"); if(v)v.pause(); cancelAnimationFrame(_noSleepRAF); _noSleepRAF=null; }catch(e){} }
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible"&&S.navigating){ requestWakeLock(); } });
// re-grab on any touch, and on a periodic heartbeat, since the lock gets silently dropped
document.addEventListener("touchend",()=>{ if(S.navigating&&!S.wakeLock)requestWakeLock(); },{passive:true});
setInterval(()=>{ if(S.navigating&&!S.wakeLock)requestWakeLock(); },20000);

/* ═══════════ battery + network ═══════════ */
let battPct=null, _autoSaver=false;
try{
  if(navigator.getBattery)navigator.getBattery().then(b=>{
    const upd=()=>{
      battPct=Math.round(b.level*100);
      const el=$("battStat"); if(el)el.textContent=`${battPct}%${b.charging?" ⚡charging":""}`;
      // auto-enable Power Saver once when battery is low and unplugged
      if(!b.charging && b.level<=0.20 && !S.saver && !_autoSaver){
        _autoSaver=true; S.saver=true; try{startGPS();}catch(e){}
        const ss=$("saverState"); if(ss)ss.textContent="On — auto (low battery)";
        try{if(S.navigating)map.easeTo({pitch:0,duration:0});}catch(e){}
        toast("🔋 Low battery — Power Saver on automatically: 2D map + reduced GPS to stretch your charge.",7000);
      }
    };
    upd();b.addEventListener("levelchange",upd);b.addEventListener("chargingchange",upd);
  });
}catch{}
/* The clock is a display element now, not a text node: hours and minutes are separate spans so
   the colon can pulse on the second, and tabular figures keep the width fixed as digits change. */
function paintClock(){
  var el=$("clockTime"); if(!el) return;
  var d=new Date(), h=d.getHours(), m=d.getMinutes();
  var mer=h>=12?"PM":"AM"; var hh=h%12; if(hh===0) hh=12;
  el.innerHTML=(hh<10?"0":"")+hh+'<span class="cln">:</span>'+(m<10?"0":"")+m+
               '<span class="mer">'+mer+'</span>';
}
function updateNet(){const el=$("netDot");if(!el)return;
  el.innerHTML='<span class="dot"></span>'+(navigator.onLine?"live":"offline");
  el.className="cw-pill "+(navigator.onLine?"livep":"offp");
  el.style.color="";}
updateNet();
window.addEventListener("offline",()=>{updateNet();toast("📡 Offline — cached maps active. Your route keeps going.",3000);});
window.addEventListener("online",()=>{
  updateNet();
  toast("📡 Back online.");
  if(S.navigating&&S.route){ const d=minDistToRoute(); if(d>80){toast("Recalculating your route…",1500);fetchRoute(true);} }
});

/* ═══════════ flashlight — simple toggle ═══════════ */
async function torchHW(on){
  try{
    if(on&&!S.torchTrack){
      const st=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}});
      const tr=st.getVideoTracks()[0];
      if(tr.getCapabilities&&tr.getCapabilities().torch){await tr.applyConstraints({advanced:[{torch:true}]});S.torchTrack=tr;return true;}
      tr.stop();
    }else if(!on&&S.torchTrack){S.torchTrack.stop();S.torchTrack=null;}
  }catch{}
  return false;
}
$("fabFlash").onclick=async()=>{
  if(S.torchMode){ S.torchMode=0; $("lightscreen").style.display="none"; await torchHW(false);
    $("fabFlash").classList.remove("lit"); toast("Flashlight off"); return; }
  S.torchMode=1; $("fabFlash").classList.add("lit");
  const hw=await torchHW(true);
  if(!hw){ const ls=$("lightscreen"); ls.style.display="block"; ls.style.background="#fff"; }
  toast(hw?"🔦 Torch on — tap 🔦 to turn off":"🔦 Screen light — tap anywhere to turn off");
};
$("lightscreen").onclick=()=>{ if(S.torchMode) $("fabFlash").click(); };

/* ═══════════ emergency 911 ═══════════ */
$("fab911").onclick=()=>{pushUI();$("sosConfirm").style.display="flex";if(navigator.vibrate)navigator.vibrate([100,50,100]);};
$("sosCancel").onclick=()=>{$("sosConfirm").style.display="none";};

/* ═══════════ feedback ═══════════ */
document.querySelectorAll("#fbChips .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#fbChips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");S.fbCat=c.dataset.fb;});
$("fbSend").onclick=async()=>{
  const msg=$("fbText").value.trim();
  if(!msg){toast("Write a quick note first.");return;}
  const payload={category:S.fbCat,message:msg,lat:S.pos?.lat??null,lng:S.pos?.lng??null};
  if(S.sb.url&&S.sb.key){
    try{
      await fetch(`${S.sb.url}/rest/v1/feedback`,{method:"POST",headers:sbH({"Content-Type":"application/json"}),body:JSON.stringify(payload)});
      $("fbText").value="";closeSheets();toast("📣 Report sent — thank you for making the app better.");return;
    }catch{}
  }
  window.location.href=`mailto:feedback@giwg.org?subject=${encodeURIComponent("ConeWatch "+S.fbCat)}&body=${encodeURIComponent(msg+(S.pos?`\n\nNear: ${S.pos.lat.toFixed(5)}, ${S.pos.lng.toFixed(5)}`:""))}`;
  closeSheets();
};

/* ═══════════ 3D toggle ═══════════ */
$("fab3d").onclick=()=>{
  S.is3d=!S.is3d;
  $("fab3d").classList.toggle("active",S.is3d);
  map.easeTo({pitch:S.is3d?58:0,duration:600});
  toast(S.is3d?"🏙 3D city view — buildings + sky rendering":"2D map");
};

/* ═══════════ HUD ═══════════ */
let hudScale=1.5; try{const hs=parseFloat(localStorage.getItem("cw_hud")); if(hs)hudScale=hs;}catch(e){}
function applyHudScale(){ try{$("hud").style.setProperty("--hudScale",hudScale); localStorage.setItem("cw_hud",hudScale);}catch(e){} }
let hudFlip=true; try{ hudFlip=localStorage.getItem("cw_hudflip")!=="0"; }catch(e){}
function applyHudFlip(){ try{ $("hud").classList.toggle("noflip",!hudFlip); localStorage.setItem("cw_hudflip",hudFlip?"1":"0"); }catch(e){} }
/* A stroked SVG arrow rather than a text glyph. Two reasons: a glyph mirrored by the HUD's
   scaleX(-1) and scaled 1.5x rasterizes soft, where vector geometry stays sharp at any size;
   and a rounded, single-weight stroke reads as an instrument rather than as a character
   borrowed from the font. Geometry is keyed off the maneuver, so a slight right and a hard
   right no longer share one arrow. */
function hudArrowSVG(step){
  var m=(step&&step.maneuver)||{}, t=String(m.type||""), mod=String(m.modifier||"");
  var d;
  if(t==="arrive")      d="M32 54 L32 20 M20 32 L32 20 L44 32";          // straight up, journey end
  else if(t==="depart") d="M32 54 L32 22 M22 32 L32 22 L42 32";
  else if(mod.indexOf("uturn")>-1) d="M22 54 L22 32 A10 10 0 0 1 42 32 L42 44 M34 36 L42 44 L50 36";
  else if(mod.indexOf("sharp right")>-1) d="M22 54 L22 34 L46 34 M36 24 L46 34 L36 44";
  else if(mod.indexOf("sharp left")>-1)  d="M42 54 L42 34 L18 34 M28 24 L18 34 L28 44";
  else if(mod.indexOf("slight right")>-1)d="M24 54 L24 40 L42 22 M32 20 L44 20 L44 32";
  else if(mod.indexOf("slight left")>-1) d="M40 54 L40 40 L22 22 M32 20 L20 20 L20 32";
  else if(mod.indexOf("right")>-1)       d="M22 54 L22 30 L44 30 M34 20 L44 30 L34 40";
  else if(mod.indexOf("left")>-1)        d="M42 54 L42 30 L20 30 M30 20 L20 30 L30 40";
  else                                   d="M32 54 L32 20 M20 32 L32 20 L44 32";   // continue
  return '<svg viewBox="0 0 64 64" width="100%" height="100%" fill="none" '+
         'stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">'+
         '<path d="'+d+'"/></svg>';
}
function hudOpen(){ return $("hud") && $("hud").style.display!=="none" && $("hud").style.display!==""; }
/* Paint the fields the HUD gained in v230: turn glyph, speed-limit sign, over-limit colour, ETA.
   Cheap enough to run on every nav tick — it's a handful of textContent writes, and skipping it
   while closed keeps it free when the HUD isn't up. */
function hudPaint(step){
  if(!hudOpen()) return;
  try{
    var a=$("hudArrow"); if(a && step) a.innerHTML=hudArrowSVG(step);
    var vm=Math.round(S.speedMph||0);
    var sp=$("hud") && $("hud").querySelector(".h-speed");
    if(sp){
      sp.classList.remove("warn","over");
      if(S.limit){ if(vm>S.limit+8) sp.classList.add("over"); else if(vm>S.limit) sp.classList.add("warn"); }
      else if(vm>75) sp.classList.add("warn");
    }
    var lw=$("hudLimit");
    if(lw){
      if(S.limit){ $("hudLimitNum").textContent=S.limit; lw.style.display="block"; }
      else lw.style.display="none";
    }
    var eta=$("hudEta");
    // Drivers were exiting the HUD purely to check the arrival time — so put it on the glass.
    if(eta) eta.textContent = S.etaArr ? (S.etaArr+"  ·  "+(S.etaMin||0)+" min") : "";
  }catch(e){}
}
/* Hazard warnings on the glass. Before this they went to #toast (z-index 2500) which renders
   UNDERNEATH #hud (z-index 3000) — so in HUD mode a driver got the voice cue and nothing to
   look at, which defeats the point of a heads-up display. */
var _hudHazT=null;
function hudHazard(txt,ms){
  try{
    if(!hudOpen()) return;
    var el=$("hudHaz"); if(!el) return;
    el.textContent=txt; el.classList.add("show");
    if(_hudHazT) clearTimeout(_hudHazT);
    _hudHazT=setTimeout(function(){ try{ el.classList.remove("show"); el.textContent=""; }catch(e){} }, ms||3000);
  }catch(e){}
}
function hudShow(){
  pushUI(); $("hud").style.display="flex"; applyHudScale(); applyHudFlip();
  try{ hudPaint(S.steps&&S.steps[S.stepIdx]); }catch(e){}
}
function hudHide(){ try{ $("hud").style.display="none"; if(_hudHazT) clearTimeout(_hudHazT); }catch(e){} }
$("hudBtn").onclick=hudShow;
/* Exit used to be "tap anywhere". Repositioning the phone on the dash — the single most likely
   thing a driver does while it's up — dropped them straight out mid-drive. Now it takes a
   deliberate act: the Exit button, or a decisive downward swipe. */
$("hudExit")&&($("hudExit").onclick=(e)=>{e.stopPropagation();hudHide();});
(function(){
  var y0=null,t0=0;
  var h=$("hud"); if(!h) return;
  h.addEventListener("touchstart",function(e){ if(e.target.closest(".hud-ctrl")) return; y0=e.touches[0].clientY; t0=Date.now(); },{passive:true});
  h.addEventListener("touchend",function(e){
    if(y0===null) return;
    var y1=(e.changedTouches&&e.changedTouches[0].clientY)||y0;
    var dy=y1-y0, dt=Date.now()-t0;
    y0=null;
    if(dy>110 && dt<800) hudHide();          // long, quick, downward — not a nudge
  },{passive:true});
})();
$("hudBigger")&&($("hudBigger").onclick=(e)=>{e.stopPropagation();hudScale=Math.min(2.8,hudScale+0.3);applyHudScale();});
$("hudSmaller")&&($("hudSmaller").onclick=(e)=>{e.stopPropagation();hudScale=Math.max(0.9,hudScale-0.3);applyHudScale();});
$("hudFlip")&&($("hudFlip").onclick=(e)=>{e.stopPropagation();hudFlip=!hudFlip;applyHudFlip();});

/* ═══════════ voice ═══════════ */
let _rec=null,_recBusy=false;
$("fabVoice").onclick=()=>{
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){ toast("Voice isn't supported here — type your destination instead.",3200); try{$("search").focus();}catch(e){} return; }
  if(_recBusy){ try{_rec&&_rec.stop();}catch(e){} _recBusy=false; toast("Stopped listening"); return; }
  try{
    // NOTE: this must live outside the handler. A local `const rec` gets garbage-collected
    // while the mic is still open, which is what made recognition cut out and "glitch".
    _rec=new SR();
    _rec.lang="en-US"; _rec.continuous=false; _rec.interimResults=false; _rec.maxAlternatives=1;
    _recBusy=true;
    const fab=$("fabVoice"); if(fab) fab.classList.add("lit");
    const done=()=>{ _recBusy=false; const f=$("fabVoice"); if(f) f.classList.remove("lit"); };
    const guard=setTimeout(()=>{ try{_rec&&_rec.stop();}catch(e){} },9000);   // never hang the mic open
    _rec.onresult=(e)=>{
      clearTimeout(guard);
      const t=((e.results&&e.results[0]&&e.results[0][0]&&e.results[0][0].transcript)||"").toLowerCase().trim();
      if(!t){ toast("Didn't catch that — try again."); return; }
      if(/^(navigate to|take me to|go to|drive to|directions to)/.test(t)){
        const dest=t.replace(/^(navigate to|take me to|go to|drive to|directions to)\s*/,"");
        $("search").value=dest; forceGeocode(dest); toast("🎤 Finding "+dest);
      }
      else if(t.includes("pothole"))reportHazard("pothole");
      else if(t.includes("cone")||t.includes("construction"))reportHazard("construction_cones");
      else if(t.includes("accident")||t.includes("crash"))reportHazard("accident");
      else if(t.includes("police"))reportHazard("police");
      else if(t.includes("camera"))reportHazard("camera");
      else if(t.includes("flashlight")||t.includes("light"))$("fabFlash").click();
      else if(t.includes("gas"))discoverByPoi("fuel");
      else if(t.includes("coffee"))discoverByPoi("cafe");
      else if(t.includes("food")||t.includes("hungry"))discoverByPoi("restaurant");
      else if(t.includes("roadside"))openSheet("roadsideSheet");
      else if(t.includes("emergency"))$("fab911").click();
      else if(t.includes("end")||t.includes("stop nav"))endNavigation();
      else { $("search").value=t; toast('Heard "'+t+'" — tap → to search'); }
    };
    _rec.onerror=(e)=>{
      clearTimeout(guard); done();
      const err=(e&&e.error)||"";
      if(err==="not-allowed"||err==="service-not-allowed") toast("Microphone blocked — allow mic access in Settings › Safari.",4200);
      else if(err==="no-speech") toast("Didn't hear anything — tap 🎤 and speak.",2600);
      else if(err!=="aborted") toast("Voice hiccuped — try once more.",2400);
    };
    _rec.onend=()=>{ clearTimeout(guard); done(); };
    _rec.start();
    toast("Listening… 🎤 tap again to stop");
  }catch(e){ _recBusy=false; toast("Voice unavailable here — type instead."); }
};

/* ═══════════ roadside ═══════════ */
$("shareLoc").onclick=()=>{
  if(!S.pos){toast("Waiting for GPS…");return;}
  const link=`https://maps.google.com/?q=${S.pos.lat.toFixed(6)},${S.pos.lng.toFixed(6)}`;
  const batt=battPct!==null?` My phone battery: ${battPct}%.`:"";
  window.location.href=`sms:?&body=${encodeURIComponent("I need roadside help. My exact location: "+link+batt)}`;
};
$("copyLoc").onclick=async()=>{
  if(!S.pos){toast("Waiting for GPS…");return;}
  const txt=`${S.pos.lat.toFixed(6)}, ${S.pos.lng.toFixed(6)}`;
  try{await navigator.clipboard.writeText(txt);toast("Copied: "+txt);}catch{toast(txt,6000);}
};

/* ═══════════ sheets & settings ═══════════ */
function openSheet(id){
  closeSheets();
  // the "destination set" confirm card floats over the sheet and was eating taps on
  // Start navigation — get it out of the way as soon as a sheet opens
  try{ if(id==="routeSheet"){ $("confirmBar").style.display="none"; clearTimeout(window.__confT); } }catch(e){}
  /* Clear any residue from an interrupted pull. If a gesture is cut short — which happens
     whenever we close one sheet to open another — the sheet can keep a translateY and a hidden
     overflow forever, which looks exactly like "cut off and won't scroll". */
  try{
    var _sh=$(id);
    _sh.style.transform=""; _sh.style.opacity="";
    if(_sh.dataset.cwOv!==undefined){ _sh.style.overflowY=_sh.dataset.cwOv; delete _sh.dataset.cwOv; }
    else _sh.style.overflowY="";
  }catch(e){}
  $(id).classList.add("open");pushUI();try{window._cwSheetAt=Date.now();}catch(e){}
}
document.querySelectorAll(".sheet").forEach(s=>{
  const x=document.createElement("button");
  x.className="sheetX"; x.setAttribute("aria-label","Close"); x.textContent="✕";
  x.onclick=(e)=>{e.stopPropagation();closeSheets();};
  s.appendChild(x);
});
function closeSheets(){document.querySelectorAll(".sheet").forEach(s=>s.classList.remove("open"));try{closeTools();}catch(e){$("moreFabs").classList.remove("open");}}
$("fabReport").onclick=()=>openSheet("reportSheet");
$("fabRoadside").onclick=()=>openSheet("roadsideSheet");
$("fabSettings").onclick=()=>openSheet("settingsSheet");
$("fabDiscover").onclick=()=>openSheet("discoverSheet");
async function openCompass(){
  openSheet("compassSheet");
  /* iOS only grants DeviceOrientation on a user gesture. Opening the panel IS that gesture —
     asking here means the dial is live the moment it appears instead of stuck pointing north. */
  try{ await requestMotion(); }catch(e){}
  try{ var b=$("compHup"); if(b) b.classList.toggle("on",S.headingUp); }catch(e){}
  try{ updateCompassUI(); }catch(e){}
}
window.openCompass=openCompass;
try{
  var _ch=$("compHup");
  if(_ch) _ch.onclick=function(){ try{ toggleHeadingUp(); }catch(e){} };
}catch(e){}
$("fabFeedback").onclick=()=>openSheet("feedbackSheet");
$("fabMore").onclick=()=>toggleTools();
// tapping the scrim behind an open fan closes it, same as any sheet
$("radialScrim")&&($("radialScrim").onclick=()=>closeTools());
/* easeTo flies the camera across every intermediate zoom level, so re-centring from a far-out
   view made the map request a whole pyramid of tiles it would never show — you sat looking at
   the background while they loaded. jumpTo when the move is large: it goes straight there and
   only ever fetches the tiles you actually end up looking at. Short journeys still animate. */
$("fabLocate").onclick=()=>{hideRelock();S.follow=true;updateFollowUI();
  if(S.pos){
    var far=false;
    try{ var c=map.getCenter();
         far = Math.abs(map.getZoom()-16)>2.5 || distM({lat:c.lat,lng:c.lng},S.pos)>4000; }catch(e){}
    if(far) map.jumpTo({center:[S.pos.lng,S.pos.lat],zoom:16});
    else    map.easeTo({center:[S.pos.lng,S.pos.lat],zoom:16,duration:420});
  } else { startGPS(); toast("Acquiring GPS…"); }
};
document.querySelectorAll(".grabber").forEach(g=>g.onclick=closeSheets);
function updateFollowUI(){$("fabLocate").classList.toggle("active",S.follow);$("followState").textContent=S.follow?"On — map recenters as you drive":"Off — tap ◎ to re-center";}
$("toggleFollow").onclick=()=>{S.follow=!S.follow;updateFollowUI();};
$("toggleSaver").onclick=()=>{S.saver=!S.saver;$("saverState").textContent=S.saver?"On — reduced GPS rate, minimal animation":"Off — full GPS rate + animations";startGPS();toast(S.saver?"Battery saver on":"Battery saver off");};
$("toggleAlerts").onclick=()=>{S.audioAlerts=!S.audioAlerts;$("alertState").textContent=S.audioAlerts?"On — beeps near hazards while navigating":"Off — visual alerts only";};
$("toggleBump").onclick=()=>{S.bumpOn=!S.bumpOn;$("bumpState").textContent=S.bumpOn?"On — hard bumps prompt a pothole report":"Off";saveSettings();};
$("toggleHeat")&&($("toggleHeat").onclick=()=>{toggleHeat();saveSettings();});
$("toggleSeason")&&($("toggleSeason").onclick=()=>{cycleSeason();});
$("toggleRadar")&&($("toggleRadar").onclick=function(){ toggleRadar(); });
$("shareApp")&&($("shareApp").onclick=function(){ shareApp(); });
try{ var _ct=$("clockTheme"); if(_ct){ _ct.style.cursor="pointer";
  _ct.style.textDecorationStyle="dotted"; _ct.style.textUnderlineOffset="3px";
  _ct.title="Tap to switch theme";
  _ct.onclick=function(ev){ ev.stopPropagation(); cycleThemeLabel(); }; } }catch(e){}
document.querySelectorAll("#sizeChips .chip").forEach(function(c){ c.onclick=function(){ setMarkerSize(c.dataset.size); }; });
document.querySelectorAll("#fabChips .chip").forEach(function(c){ c.onclick=function(){ setFabSize(c.dataset.fab); }; });
document.querySelectorAll("#toolsChips .chip").forEach(function(c){ c.onclick=function(){ setToolsStyle(c.dataset.tools); }; });
$("hdrToggle")&&($("hdrToggle").onclick=function(ev){ ev.stopPropagation(); toggleHdrCompact(); });
$("toggleFilters")&&($("toggleFilters").onclick=function(){
  buildHzFilters();
  var b=$("hzFilters"); if(b) b.style.display = (b.style.display==="none"||!b.style.display) ? "flex" : "none";
});
try{ applyHdrCompact(); applyFabSize(); applyToolsStyle(); applyHzFilters(); }catch(e){}
try{ var _mr=$("myReports"); if(_mr){ var n=myReportCount(); _mr.textContent=n+(n===1?" report":" reports"); } }catch(e){}
try{ var _mk=markerSizeKey();
  document.querySelectorAll("#sizeChips .chip").forEach(function(c){ c.classList.toggle("on",c.dataset.size===_mk); });
}catch(e){}
try{ applySeason(); }catch(e){}
document.querySelectorAll("#themeChips .chip").forEach(c=>c.onclick=()=>{
  document.querySelectorAll("#themeChips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");
  S.themeMode=c.dataset.themeSet;applyTheme(true);
});
$("sbSave").onclick=()=>{S.sb.url=$("sbUrl").value.trim().replace(/\/$/,"");S.sb.key=$("sbKey").value.trim();if(S.sb.url&&S.sb.key){toast("Supabase connected.");loadSharedHazards();startHazardSync();startRealtime();}else toast("Cleared — reports stay on this device.");};
$("sbTest").onclick=loadSharedHazards;
$("dlOffline").onclick=downloadOfflineArea;
$("viewTrips").onclick=()=>{
  if(!TRIPS.length){toast("No trips logged yet — complete a drive first.");return;}
  const lines=TRIPS.slice(0,10).map(t=>{const d=new Date(t.t);return `• ${t.name} — ${t.miles} mi (${d.toLocaleDateString([],{month:"short",day:"numeric"})} ${d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})})`;}).join("\n");
  alert("Recent trips:\n\n"+lines);
};

setInterval(paintClock,10000); paintClock();


/* ═══════════ v3: persistence · welcome · relock · tap-inspect · satellite 360 · speed limits ═══════════ */
function saveSettings(){try{localStorage.setItem("cw",JSON.stringify({sb:S.sb,mpg:$("mpg").value,gas:$("gasPrice").value,theme:S.themeMode,saver:S.saver,alerts:S.audioAlerts,bump:S.bumpOn,heat:S.heatOn,units:S.units,voice:S.voiceOn,satKey:S.satKey,mapMode:S.mapMode}));}catch{}}
function loadSettings(){try{const c=JSON.parse(localStorage.getItem("cw")||"{}");
  if(c.sb){S.sb=c.sb;$("sbUrl").value=c.sb.url||"";$("sbKey").value=c.sb.key||"";}
  if(c.mpg)$("mpg").value=c.mpg; if(c.gas)$("gasPrice").value=c.gas;
  if(c.theme)S.themeMode=c.theme;
  // v75: auto (time-of-day, daylight by default) is the standard. Anyone carrying an old manual
  // pick from testing gets moved back to auto once; a deliberate choice after this sticks.
  /* Dark is the app's identity, not a night convenience — it flipping to light at sunrise made
     ConeWatch look like a different product twice a day. Dark is now the default and stays put;
     auto and light remain available, but only if the driver picks them. Existing installs get
     migrated once (new key, since the old reset already fired for them). */
  try{ if(!localStorage.getItem("cw_themeDarkDefault")){ S.themeMode="dark"; localStorage.setItem("cw_themeDarkDefault","1"); } }catch(e){}
  if(c.saver!==undefined)S.saver=c.saver;
  if(c.alerts!==undefined)S.audioAlerts=c.alerts;
  if(c.bump!==undefined)S.bumpOn=c.bump;
  if(c.mapMode)S.mapMode=c.mapMode;
  if(c.units)S.units=c.units;
  if(c.voice!==undefined)S.voiceOn=c.voice;
  if(c.satKey){S.satKey=c.satKey;var sk=$("satKey");if(sk)sk.value=c.satKey;}}catch{}}
S.units="mi";S.voiceOn=true;S.navZoom=16.6;S.annStep=-1;S.annStage=0;
loadSettings();
// apply baked-in owner config (invisible to drivers — sharp imagery + shared network just work)
try{ if(CW_CONFIG.maptilerKey) S.satKey=CW_CONFIG.maptilerKey; }catch(e){}
try{ if(CW_CONFIG.supabaseUrl&&CW_CONFIG.supabaseKey){ S.sb={url:CW_CONFIG.supabaseUrl.replace(/\/$/,""),key:CW_CONFIG.supabaseKey}; } }catch(e){}
/* v22: visible version stamp so we can confirm what's actually deployed */
try{ if($("appVer"))$("appVer").textContent=APP_VERSION; if($("verBadge"))$("verBadge").textContent=APP_VERSION; console.log("ConeWatch "+APP_VERSION+" loaded"); }catch(e){}

let lastSave=0;
document.addEventListener("click",()=>{const n=Date.now();if(n-lastSave>2000){lastSave=n;setTimeout(saveSettings,80);}},true);
function seenWelcome(){try{return localStorage.getItem("cw_welcome")==="1";}catch{return true;}}
/* ═══════════ v30: guided how-to tutorial (coach-marks) ═══════════ */
/* Was nine coach-marks before a first-time user could touch anything, which is where people
   quit. Three: the one action that makes the network work, the one that gets them moving, and
   the one that rescues them when they've panned away. Everything else is discoverable, and the
   full set is still one tap away in Settings. */
const TUT=[
  {sel:"#fabReport",title:"⚠️ Report a hazard",body:"Cone, pothole, accident, closure — one tap. Every driver behind you gets warned, and closures reroute them automatically. This is the whole point of ConeWatch."},
  {sel:"#search",title:"🔎 Search anything",body:"An address, or just \u201Cgas\u201D, \u201Cfood\u201D, \u201Ccoffee\u201D to find the nearest ones."},
  {sel:"#fabLocate",title:"\u25CE Recenter",body:"Panned away? Tap to snap back to your live GPS. You're set — there's a full tour in Settings whenever you want it."}
];
let tutI=0;
function tutSeen(){ try{return localStorage.getItem("cw_tut")==="1";}catch(e){return true;} }
function startTutorial(){ tutI=0; $("tutorial").style.display="block"; showTutStep(); }
function endTutorial(){ $("tutorial").style.display="none"; try{localStorage.setItem("cw_tut","1");}catch(e){} }
function showTutStep(){
  const s=TUT[tutI]; if(!s){endTutorial();return;}
  const ring=$("tutRing"), card=$("tutCard");
  let r=null; if(s.sel){ const el=document.querySelector(s.sel); if(el){ const bb=el.getBoundingClientRect(); if(bb.width)r=bb; } }
  if(r){
    ring.style.display="block";
    ring.style.left=(r.left-8)+"px"; ring.style.top=(r.top-8)+"px";
    ring.style.width=(r.width+16)+"px"; ring.style.height=(r.height+16)+"px";
    // element in the TOP half → card sits at the bottom; element in the BOTTOM half → card at the top. Never overlaps the target.
    if(r.top + r.height/2 < window.innerHeight*0.5){ card.style.bottom="calc(28px + env(safe-area-inset-bottom))"; card.style.top="auto"; }
    else { card.style.top="calc(24px + env(safe-area-inset-top))"; card.style.bottom="auto"; }
  } else {
    ring.style.display="none";
    ring.style.left="50%"; ring.style.top="-60px"; ring.style.width="0"; ring.style.height="0";
    card.style.bottom="calc(28px + env(safe-area-inset-bottom))"; card.style.top="auto";
  }
  $("tutTitle").textContent=s.title; $("tutBody").textContent=s.body;
  $("tutStep").textContent=(tutI+1)+" / "+TUT.length;
  $("tutBack").style.visibility=tutI>0?"visible":"hidden";
  $("tutNext").textContent=tutI===TUT.length-1?"Done":"Next";
}
$("tutNext")&&($("tutNext").onclick=()=>{ tutI++; if(tutI>=TUT.length)endTutorial(); else showTutStep(); });
$("tutBack")&&($("tutBack").onclick=()=>{ if(tutI>0){tutI--;showTutStep();} });
$("tutSkip")&&($("tutSkip").onclick=endTutorial);
$("replayTut")&&($("replayTut").onclick=()=>{ closeSheets&&closeSheets(); setTimeout(startTutorial,250); });
window.addEventListener("resize",()=>{ if($("tutorial").style.display==="block")showTutStep(); });

$("welcomeGo").onclick=async()=>{
  try{localStorage.setItem("cw_welcome","1");}catch{}
  $("welcome").style.display="none";
  await requestMotion(); startGPS();
  if(S.sb.url&&S.sb.key){ loadSharedHazards(); startHazardSync(); startRealtime(); }
  if(!tutSeen()) setTimeout(startTutorial,600);
  else toast("You're set — search a destination or tap ⚠️ to report.");
};
/* Skip used to mean "skip everything": no requestMotion() call, so a skipper permanently lost
   accelerometer road sensing and never found out. Skipping the TOUR is a fair choice; skipping
   a core sensor without being asked is not. Permission is still requested either way. */
$("welcomeSkip").onclick=async()=>{
  try{localStorage.setItem("cw_welcome","1");}catch{}
  $("welcome").style.display="none";
  try{ await requestMotion(); }catch(e){}
  startGPS();
  if(S.sb.url&&S.sb.key){ loadSharedHazards(); startHazardSync(); startRealtime(); }
  toast("You're set — search a destination or tap ⚠️ to report.",4200);
};

/* free roam as long as you like + one-tap GPS re-lock */
function hideRelock(){
  clearTimeout(_relockT);
  $("relock").style.display="none";
  try{ const fb=$("fabLocate"); if(fb) fb.classList.remove("pointing"); }catch(e){}
}
/* ═══════════ driving-mode declutter ═══════════
   Six-plus thumb targets is a lot at speed. While navigating, keep only what a driver could
   genuinely need — emergency, report a hazard, recenter, mute — and restore the rest on exit. */
const _drivingHide=["fabMore"];   // everything non-essential now lives behind ⋯, so hiding it declutters the whole stack
function setDrivingChrome(on){
  _drivingHide.forEach(id=>{
    const el=$(id); if(!el) return;
    if(on){ if(el.style.display!=="none"){ el.dataset._prevDisp=el.style.display||""; el.style.display="none"; } }
    else  { el.style.display=el.dataset._prevDisp!==undefined?el.dataset._prevDisp:""; }
  });
  try{ if(on) closeTools(); }catch(e){}
  // Hand the top third of the screen back to the map once a route is live: the header
  // collapses to the search row and the nav card carries the turn. Restored when nav ends,
  // unless the driver had already pinned it compact themselves.
  try{
    if(on) document.body.dataset.hdrAuto="1";
    else delete document.body.dataset.hdrAuto;
    applyHdrCompact();
  }catch(e){}
}

let _relockT=null;
function startRelock(){
  if(S.follow)return;
  // Only nag when it's actually useful: while navigating, or once you've panned far enough
  // that your own position is off-screen. Browsing the map nearby shouldn't trigger it.
  if(!S.navigating){
    if(!S.pos) return;
    let visible=false;
    try{
      const p=map.project([S.pos.lng,S.pos.lat]);
      const c=map.getContainer();
      visible = p.x>-40 && p.y>-40 && p.x<c.clientWidth+40 && p.y<c.clientHeight+40;
    }catch(e){}
    if(visible) return;                       // you can still see yourself — no prompt needed
  }
  const rl=$("relock");
  // Show the ACTUAL button glyph inline so there's no guessing which control to press —
  // and pulse the real button on the right so the eye connects the two.
  const chip='<span class="rl-key">◎</span>';
  rl.innerHTML = S.navigating
    ? ('🧭 Free roam — tap '+chip+' to resume')
    : ('🧲 Free roam — tap '+chip+' to re-center');
  rl.style.display="block";
  try{ const fb=$("fabLocate"); if(fb) fb.classList.add("pointing"); }catch(e){}
  // Sit under whatever is actually on screen (nav card while driving, header otherwise) so the
  // Dynamic Island / notch can never clip it.
  try{
    const safeTop=parseInt(getComputedStyle(document.documentElement).getPropertyValue("--safeTop"))||0;
    const anchor=document.body.classList.contains("driving")?$("navbanner"):$("hdr");
    let top=null;
    if(anchor&&anchor.getBoundingClientRect){
      const r=anchor.getBoundingClientRect();
      if(r.height>0) top=r.bottom+8;
    }
    if(top==null) top=(safeTop||60)+150;
    top=Math.max(top,(safeTop||0)+58);          // never under the status bar / island
    rl.style.top=Math.round(top)+"px";
  }catch(e){}
  clearTimeout(_relockT);
  if(!S.navigating) _relockT=setTimeout(hideRelock,6000);   // fades on its own when just browsing
}
$("relock").onclick=()=>{hideRelock();S.follow=true;updateFollowUI();cameraFollow();toast(S.navigating?"Resuming navigation view":"🧲 Locked onto GPS");};
// tapping the top instruction card while navigating recenters on the route (ignore its buttons)
/* Tapping anywhere on the banner that isn't a button now pulls the full turn list down —
   the whole bar is the handle, not just the instruction text. Recentering still lives on the
   dedicated recenter button, which is where a driver reaches for it anyway. */
$("navbanner")&&($("navbanner").addEventListener("click",(e)=>{ if(e.target.closest("button"))return; if(!S.navigating&&!S.pos)return; openTurnList(); }));

/* tap anywhere → identify place, act on it */
let inspectPopup=null;
map && null; // (map exists by the time clicks happen)
function bindInspect(){
  map.on("click",async(e)=>{
    if(S.navigating)return;
    // A tap on a hazard/POI marker must NOT also open the place-inspect popup — MapLibre lets
    // the marker click fall through to the map, which was opening BOTH popups from one tap and
    // stacking the place card on top of the hazard's "Still here / Gone" prompt.
    try{
      const oe=e.originalEvent;
      if(oe && oe.target && oe.target.closest && oe.target.closest(".hz, .maplibregl-marker, .maplibregl-popup")) return;
    }catch(err){}
    if(document.querySelector(".sheet.open")){closeSheets();return;}
    if(map.isMoving())return;
    if(Date.now()-(window.__lastInspect||0)<1200)return; window.__lastInspect=Date.now();
    const {lng,lat}=e.lngLat;
    try{
      const d=await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`)).json();
      const name=(d.name||d.display_name||"Dropped pin").split(",")[0];
      const div=document.createElement("div");
      div.innerHTML=`<b>${name}</b><br><span style="font-size:11px;opacity:.65">${(d.display_name||"").slice(0,72)}</span>
        <div style="display:flex;gap:6px;margin-top:8px">
          <button class="ipb" data-a="go" style="background:#FF6B1A;color:#141619;border:none;border-radius:12px;padding:6px 12px;font-weight:700;font-size:12px">Go</button>
          <button class="ipb" data-a="stop" style="background:rgba(127,127,127,.2);border:1px solid rgba(127,127,127,.35);color:inherit;border-radius:12px;padding:6px 12px;font-size:12px">+Stop</button>
          <button class="ipb" data-a="sat" style="background:#1D6EF2;color:#fff;border:none;border-radius:12px;padding:6px 12px;font-size:12px">🛰 360°</button>
        </div>`;
      if(inspectPopup)inspectPopup.remove();
      if(_cwOpenPopup){ try{_cwOpenPopup.remove();}catch(e){} _cwOpenPopup=null; }   // close any open hazard popup first so it can't hide behind this
      inspectPopup=trackPopup(new maplibregl.Popup({offset:10,maxWidth:"270px"}).setLngLat([lng,lat]).setDOMContent(div)).addTo(map);
      div.querySelectorAll(".ipb").forEach(b=>b.onclick=()=>{
        inspectPopup.remove();
        if(b.dataset.a==="go")setDestination({lat,lng},name);
        else if(b.dataset.a==="stop")addStop({lat,lng},name);
        else openSat(lat,lng,name);
      });
    }catch{}
  });
}
(function waitMap(){ if(typeof map!=="undefined"&&map){bindInspect();} else setTimeout(waitMap,300); })();

/* satellite — main-map layer + 360° orbit preview */
const ESRI=["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"+TILE_CB];
var SAT_MINZ=10;   // raised automatically if the probe finds a higher real floor   // below this Esri serves error tiles, and imagery is useless anyway
S.sat=false;
// HD satellite: if the user supplies a free MapTiler key, use its sharper/newer imagery; else keyless Esri
function satTiles(){ const k=(S.satKey||"").trim(); return k?["https://api.maptiler.com/tiles/satellite-v2/{z}/{x}/{y}.jpg?key="+k]:ESRI; }
function satMeta(){ const k=(S.satKey||"").trim(); return k?{size:512,attr:"© MapTiler · © Airbus, Maxar"}:{size:256,attr:"© Esri, Maxar, Earthstar Geographics"}; }
let _satProv=null;
function ensureSat(){
  try{
    const prov=(S.satKey&&S.satKey.trim())?"maptiler":"esri";
    if(map.getSource("esri") && prov!==_satProv){        // provider changed → rebuild source
      if(map.getLayer("esri-sat"))map.removeLayer("esri-sat");
      map.removeSource("esri");
    }
    _satProv=prov; const m=satMeta();
    /* SAT_MINZ: the fix for "Zoom Level Not Supported". Esri's World_Imagery cache is not
       populated at regional LODs across much of this area, and ArcGIS answers a missing LOD
       with an error IMAGE at HTTP 200 — indistinguishable from a real tile, so MapLibre
       happily paints the words across the map. Nothing downstream can filter it; the only
       cure is to never request those zooms. Aerial imagery below z10 shows no road detail
       anyway, so this costs nothing a driver would want. */
    /* v258 — why v257's minzoom did nothing. Both lines below are guarded by "if it does not
       already exist", and on your device the sat source and layer DID already exist: you had
       turned satellite on before updating. addSource/addLayer were skipped, so the minzoom was
       never applied to the objects actually doing the requesting. A source's zoom range also
       cannot be edited in place — it has to be torn down and rebuilt. */
    var _src=map.getSource("esri");
    if(_src && !(_src.minzoom>=SAT_MINZ)){          // legacy source with no floor — rebuild it
      try{ if(map.getLayer("esri-sat")) map.removeLayer("esri-sat"); }catch(e){}
      try{ map.removeSource("esri"); }catch(e){}
    }
    if(!map.getSource("esri"))map.addSource("esri",{type:"raster",tiles:satTiles(),minzoom:SAT_MINZ,maxzoom:19,tileSize:m.size,attribution:m.attr});
    if(!map.getLayer("esri-sat"))map.addLayer({id:"esri-sat",type:"raster",source:"esri",minzoom:SAT_MINZ},map.getLayer("route-casing")?"route-casing":undefined);
    /* Enforce the floor on every call, not just on creation. setLayerZoomRange works on a layer
       that already exists, which addLayer's guard does not. */
    try{ map.setLayerZoomRange("esri-sat", SAT_MINZ, 24); }catch(e){}
    map.setLayoutProperty("esri-sat","visibility",S.sat?"visible":"none");
  }catch(e){}
}
/* Satellite off means GONE, not hidden. A hidden layer still sits in the style, still gets its
   zoom range reset by any style rebuild, and is one stray setLayoutProperty away from painting
   again — which is exactly the kind of ghost that would explain error tiles appearing over a
   basemap that is itself fine. Called on every style load, not only when the driver toggles. */
function pruneSat(){
  try{
    if(!map||!map.getStyle) return;
    if(S.sat){ if(map.getLayer("esri-sat")) map.setLayerZoomRange("esri-sat",SAT_MINZ,24); return; }
    if(map.getLayer("esri-sat")) map.removeLayer("esri-sat");
    if(map.getSource("esri")) map.removeSource("esri");
  }catch(e){}
}
function _satTail(){
  try{
  }catch{}
}
$("fabSat").onclick=()=>{S.sat=!S.sat;$("fabSat").classList.toggle("active",S.sat);
  if(S.sat) ensureSat(); else pruneSat();
  toast(S.sat?(map&&map.getZoom&&map.getZoom()<SAT_MINZ?"🛰 Satellite on — zoom in to see it":"🛰 Satellite imagery on"):"Satellite off");};
$("testCue")&&($("testCue").onclick=()=>{ turnCue(2); toast("📳 Turn cue — if you felt a buzz, your iOS supports haptics"); });
$("satKeySave").onclick=()=>{
  S.satKey=($("satKey").value||"").trim(); saveSettings();
  // force the sat source to rebuild with the new provider on next toggle/view
  try{ if(map.getLayer("esri-sat"))map.removeLayer("esri-sat"); if(map.getSource("esri"))map.removeSource("esri"); _satProv=null; }catch(e){}
  if(satMapObj){ try{satMapObj.remove();}catch(e){} satMapObj=null; if($("satPreview").style.display==="block"&&S.dest)openSat(S.dest.lat,S.dest.lng,S.destName); }
  ensureSat();
  toast(S.satKey?"🛰 HD satellite on — tap 🛰 to view":"Cleared — using keyless Esri");
};

let satMapObj=null,orbitRAF=null;
function openSat(lat,lng,name){
  pushUI();
  $("satName").textContent="🛰 "+(name||"Destination");
  $("satPreview").style.display="block";
  if(satMapObj){satMapObj.remove();satMapObj=null;}
  satMapObj=new maplibregl.Map({container:"satMap",
    style:{version:8,sources:{esri:{type:"raster",tiles:satTiles(),tileSize:satMeta().size,maxzoom:19,attribution:satMeta().attr}},layers:[{id:"bg",type:"background",paint:{"background-color":"#0c1622"}},{id:"s",type:"raster",source:"esri"}]},
    center:[lng,lat],zoom:17.6,pitch:62,bearing:0,maxPitch:85,attributionControl:true});
  // highlight beacon so the exact building is unmistakable
  if(satPin){try{satPin.remove();}catch(e){}satPin=null;}
  const bel=document.createElement("div"); bel.className="sat-beacon";
  bel.innerHTML='<div class="sat-pulse"></div><div class="sat-pulse b"></div><div class="sat-dot"></div>';
  let touched=false, paused=false;
  function spinStep(){ if(!satMapObj||touched||paused)return; satMapObj.setBearing(satMapObj.getBearing()+0.13); orbitRAF=requestAnimationFrame(spinStep); }
  /* A map that is still fetching tiles fires dragstart-like events during its own settle, and
     stopSpin was treating any of them as the user grabbing the map. Only count a gesture once
     the map has actually been interactive for a moment. */
  var _spinArmedAt=Date.now()+1200;
  // only a real drag/zoom/rotate gesture stops it — NOT the tap that opened the preview
  const stopSpin=(e)=>{ if(e && !e.originalEvent) return;   // ignore programmatic setBearing/resize; only real finger gestures pause
    if(Date.now()<_spinArmedAt) return;                     // ...and not during the initial settle
    touched=true; cancelAnimationFrame(orbitRAF); orbitRAF=null; if(_tog)_tog.innerHTML="\u25B6\uFE0E&nbsp; Resume rotation"; };
  ["dragstart","zoomstart","rotatestart","pitchstart"].forEach(ev=>satMapObj.on(ev,stopSpin));
  var _tog=$("satOrbitToggle");
  if(_tog) _tog.onclick=()=>{ touched=false; paused=!paused; _tog.innerHTML=paused?"\u25B6\uFE0E&nbsp; Resume rotation":"\u2759\u2759&nbsp; Pause rotation"; cancelAnimationFrame(orbitRAF); if(!paused)spinStep(); };
  satMapObj.on("load",function(){
    try{ satMapObj.resize(); }catch(e){}
    setTimeout(function(){ try{ satMapObj&&satMapObj.resize(); }catch(e){} },250);
    try{ satPin=new maplibregl.Marker({element:bel,anchor:"center"}).setLngLat([lng,lat]).addTo(satMapObj); }catch(e){}
    spinStep();
  });
  /* The spin was started ONLY from the map's "load" event. If the style resolves before that
     handler is attached — which is exactly what happens when the tiles are already in cache,
     as they are the second time you preview a place — "load" never fires and the image just
     sits there. Start it independently too; spinStep is idempotent because it bails when an
     animation frame is already pending. */
  setTimeout(function(){ try{ if(!orbitRAF && !touched && !paused) spinStep(); }catch(e){} }, 900);
}
$("geoPickerX")&&($("geoPickerX").onclick=()=>{$("geoPicker").style.display="none";});
let satPin=null;
$("satClose").onclick=()=>{cancelAnimationFrame(orbitRAF);if(satPin){try{satPin.remove();}catch(e){}satPin=null;}if(satMapObj){satMapObj.remove();satMapObj=null;}$("satPreview").style.display="none";};

/* ═══════════ v26: cinematic 3D route flythrough (variable speed, stabilized) ═══════════ */
let tourMap=null,tourRAF=null,tourState=null,tourPuck=null,tourPins=[];
function _hav(a,b){const R=6371000,r=x=>x*Math.PI/180;const dLa=r(b[1]-a[1]),dLo=r(b[0]-a[0]);const s=Math.sin(dLa/2)**2+Math.cos(r(a[1]))*Math.cos(r(b[1]))*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(s));}
function _brg(a,b){const r=x=>x*Math.PI/180,d=x=>x*180/Math.PI;const y=Math.sin(r(b[0]-a[0]))*Math.cos(r(b[1]));const x=Math.cos(r(a[1]))*Math.sin(r(b[1]))-Math.sin(r(a[1]))*Math.cos(r(b[1]))*Math.cos(r(b[0]-a[0]));return (d(Math.atan2(y,x))+360)%360;}
function _lerpAng(a,b,t){let d=((b-a+540)%360)-180;return (a+d*t+360)%360;}
function _tourDist(m){ if(S.units==="km"){return m>=1000?(m/1000).toFixed(1)+" km":Math.round(m)+" m";} const ft=m*3.28084; return ft>=528?(m/1609.34).toFixed(1)+" mi":Math.round(ft/10)*10+" ft"; }
function _posAt(co,cum,d){ if(d<=0)return co[0]; const tot=cum[cum.length-1]; if(d>=tot)return co[co.length-1]; let i=1; while(i<cum.length&&cum[i]<d)i++; const t=(d-cum[i-1])/((cum[i]-cum[i-1])||1); return [co[i-1][0]+(co[i][0]-co[i-1][0])*t, co[i-1][1]+(co[i][1]-co[i-1][1])*t]; }
function _brgAt(co,cum,d){ let i=1; while(i<cum.length&&cum[i]<d)i++; const a=co[Math.max(0,i-1)],b=co[Math.min(co.length-1,i)]; return _brg(a,b); }

/* ═══════════ aerial view of a destination ═══════════
   Public photo coverage is thin outside landmarks, and for a driver an overhead is often the
   more useful picture anyway: which building, where the lot is, which side the entrance is on.
   Built from the satellite tiles the app already uses (keyless Esri, or the user's MapTiler
   key if set) as a 3x3 mosaic centred on the point — no new provider, no key required. */
function _lon2tile(lon,z){ return (lon+180)/360*Math.pow(2,z); }
function _lat2tile(lat,z){ var r=lat*Math.PI/180; return (1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z); }
function aerialMosaic(lat,lng,z,label){
  var tiles=satTiles(), meta=satMeta();
  var xf=_lon2tile(lng,z), yf=_lat2tile(lat,z);
  var x0=Math.floor(xf), y0=Math.floor(yf);
  var wrap=document.createElement("div");
  wrap.style.cssText="grid-column:1/-1;margin-bottom:10px";
  var cap=document.createElement("div");
  cap.className="sub";
  cap.style.cssText="margin:0 0 5px;font-size:12px";
  cap.textContent=label;
  wrap.appendChild(cap);
  var grid=document.createElement("div");
  grid.style.cssText="position:relative;display:grid;grid-template-columns:repeat(3,1fr);gap:0;border-radius:12px;overflow:hidden;background:#111;aspect-ratio:1/1";
  for(var dy=-1;dy<=1;dy++){
    for(var dx=-1;dx<=1;dx++){
      var url=tiles[0].replace("{z}",z).replace("{x}",x0+dx).replace("{y}",y0+dy);
      var im=document.createElement("img");
      im.src=url; im.loading="lazy"; im.referrerPolicy="no-referrer";
      im.style.cssText="width:100%;height:100%;object-fit:cover;display:block";
      im.onerror=function(){ this.style.opacity=".15"; };
      grid.appendChild(im);
    }
  }
  // crosshair on the exact point — it sits at a fraction across the CENTRE tile of the 3x3
  var fx=(1+(xf-x0))/3*100, fy=(1+(yf-y0))/3*100;
  var pin=document.createElement("div");
  pin.style.cssText="position:absolute;left:"+fx.toFixed(2)+"%;top:"+fy.toFixed(2)+"%;width:18px;height:18px;"+
    "margin:-9px 0 0 -9px;border:2.5px solid #FF6A1F;border-radius:50%;box-shadow:0 0 0 2px rgba(0,0,0,.55),0 0 12px rgba(255,106,31,.9);pointer-events:none";
  grid.appendChild(pin);
  wrap.appendChild(grid);
  var att=document.createElement("div");
  att.className="sub"; att.style.cssText="margin:4px 0 0;font-size:9px;opacity:.6";
  att.textContent=meta.attr;
  wrap.appendChild(att);
  return wrap;
}
function showAerial(lat,lng){
  var g=$("photoGrid"); if(!g) return;
  g.appendChild(aerialMosaic(lat,lng,18,"Overhead — building level"));
  g.appendChild(aerialMosaic(lat,lng,16,"Overhead — surrounding block"));
}

/* v33: keyless place photos via Wikimedia (landmarks/known places have best coverage) */
async function loadPlacePhotos(lat,lng,name){
  $("photoSheet").style.display="block";
  $("photoSheetName").textContent="📷 "+(name||"This place");
  $("photoGrid").innerHTML='<p class="sub" style="grid-column:1/-1">Searching photos…</p>';
  const nm=(name||"").replace(/,.*$/,"").trim();   // first part of the label = the place name
  let imgs=[];
  const add=a=>{ (a||[]).forEach(u=>{ if(u&&imgs.indexOf(u)<0&&!/\.(svg|pdf|ogv|webm)$/i.test(u))imgs.push(u); }); };
  const jobs=[];
  // A) Wikipedia article images by NAME (great for landmarks, universities, businesses)
  if(nm)jobs.push(fetch("https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=6&gsrsearch="+encodeURIComponent(nm)+"&prop=pageimages&piprop=thumbnail&pithumbsize=500")
    .then(r=>r.json()).then(d=>{ const p=(d.query&&d.query.pages)||{}; add(Object.values(p).map(x=>x.thumbnail&&x.thumbnail.source)); }).catch(()=>{}));
  // B) Openverse — Creative-Commons image search by name (keyless, huge Flickr/Wikimedia index)
  if(nm)jobs.push(fetch("https://api.openverse.org/v1/images/?q="+encodeURIComponent(nm)+"&page_size=12&mature=false")
    .then(r=>r.json()).then(d=>{ add((d.results||[]).map(x=>x.thumbnail||x.url)); }).catch(()=>{}));
  // C) Wikimedia Commons by COORDINATES — widening rings catch the surrounding area if the exact spot has none
  [800,3000,8000].forEach(function(rad){
    jobs.push(fetch("https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=geosearch&ggscoord="+lat+"|"+lng+"&ggsradius="+rad+"&ggslimit=14&prop=imageinfo|coordinates&iiprop=url&iiurlwidth=420")
      .then(r=>r.json()).then(d=>{ const p=(d.query&&d.query.pages)||{}; add(Object.values(p).map(x=>x.imageinfo&&x.imageinfo[0]&&x.imageinfo[0].thumburl)); }).catch(()=>{}));
  });
  await Promise.all(jobs);
  $("photoGrid").innerHTML="";
  try{ showAerial(lat,lng); }catch(e){}
  if(!imgs.length){
    var n=document.createElement("p");
    n.className="sub"; n.style.cssText="grid-column:1/-1;margin:2px 0 0";
    n.textContent="No public street-level photos here — showing the overhead instead.";
    $("photoGrid").appendChild(n);
    return;
  }
  imgs.slice(0,12).forEach(src=>{ const im=document.createElement("img"); im.src=src; im.loading="lazy"; im.referrerPolicy="no-referrer"; im.onerror=function(){this.style.display="none";}; im.style.cssText="width:100%;height:120px;object-fit:cover;border-radius:10px;display:block;background:#eee"; $("photoGrid").appendChild(im); });
}
$("placePhotos")&&($("placePhotos").onclick=()=>{ if(!S.dest)return toast("Pick a destination first."); loadPlacePhotos(S.dest.lat,S.dest.lng,S.destName); });
$("photoClose")&&($("photoClose").onclick=()=>{$("photoSheet").style.display="none";});

function openDriveTour(){
  if(!S.route||!S.route.geometry||!S.route.geometry.coordinates||S.route.geometry.coordinates.length<2){ toast("Building route…"); if(S.dest)fetchRoute(); return; }
  pushUI();
  const co=S.route.geometry.coordinates.slice();
  const cum=[0]; for(let i=1;i<co.length;i++)cum[i]=cum[i-1]+_hav(co[i-1],co[i]);
  const total=cum[cum.length-1]||1;
  /* OSRM routinely emits a near-duplicate first coordinate, and a bearing taken between two
     points a metre apart is noise — which started both the camera AND the car pointed wrong.
     Take the heading over the first ~20m of actual route instead. */
  const initBrg=_brg(co[0], _posAt(co,cum,Math.min(total,20)));
  /* The establishing shot doubles as the prefetch: whatever is in frame at the top of the
     descent has its low-zoom ancestors pulled, and ancestors are what MapLibre upscales when a
     detail tile is late. So a long route should open WIDER — a fixed z15.6 only ever covered the
     first stretch, which is why the back half of a long drive still went soft. */
  const _openZoom = total>12000 ? 13.2 : total>5000 ? 14.2 : total>1800 ? 15.1 : 15.9;
  /* On a weak GPU the preview renders every pixel twice at 2x DPR and shades a 76-degree
     horizon full of satellite tiles. Halving the pixel count and pulling the horizon in costs
     some polish and buys back most of the frame budget. */
  const _lite = (typeof liteMode==="function") ? liteMode() : false;
  const _drivePitch = _lite ? 62 : 76;
  S._drivePitch = _lite ? 64 : 78;
  const marks=(S.steps||[]).map(st=>{ const loc=st.maneuver&&st.maneuver.location; if(!loc)return null; let bi=0,bd=Infinity; for(let i=0;i<co.length;i++){const d=_hav(co[i],loc);if(d<bd){bd=d;bi=i;}} return {dist:cum[bi],text:stepText(st),loc:loc}; }).filter(m=>m&&m.text);
  $("drivePreview").style.display="block";
  S._previewOpen=true;
  try{ setTimeout(function(){ watchFrames(5000); }, 4500); }catch(e){}   // the heaviest screen in the app
  try{ map.stop(); }catch(e){}                       // kill any in-flight camera easing below
  if(tourMap){try{tourMap.remove();}catch(e){}tourMap=null;}
  tourPuck=null; tourPins.forEach(p=>{try{p.remove();}catch(e){}}); tourPins=[];
  tourMap=new maplibregl.Map({container:"driveMap",
    style:{version:8,
      sources:{
        sat:{type:"raster",tiles:satTiles(),tileSize:satMeta().size,maxzoom:19,attribution:satMeta().attr}
      },
      layers:[{id:"bg",type:"background",paint:{"background-color":"#bfe0ff"}},{id:"sat",type:"raster",source:"sat","paint":{"raster-fade-duration":140}}]},
    /* Was 85° pitch with terrain on satellite tiles — at that angle the horizon runs on
       almost forever, so MapLibre requests a huge tile set every frame and the DEM gets
       overzoomed past its z14 limit as well. 80° looks near-identical from the driver's
       seat but cuts the horizon draw substantially; the bigger cache stops re-fetching
       ground already flown over, and no fade removes the shimmer that reads as stutter. */
    center:co[0],zoom:_openZoom,pitch:44,bearing:initBrg,maxPitch:85,attributionControl:true,pixelRatio:(_lite?1:undefined),
    interactive:true,maxTileCacheSize:1500,fadeDuration:140,refreshExpiredTiles:false});
  tourMap.on("load",()=>{
    /* No terrain. The terrarium DEM tops out at z12; draping z17 satellite imagery over an
       overzoomed heightfield at 78 deg pitch is exactly the smeared, melted ground — and on
       flat Detroit it adds no relief to justify the cost. Flat ground renders sharp and cheap. */
    // denser ground fog = shorter visible horizon = far fewer tiles to fetch and draw
    try{ tourMap.setSky&&tourMap.setSky({"sky-color":"#8ec9ff","horizon-color":"#dbeeff","fog-color":"#eef6ff","fog-ground-blend":0.78,"sky-horizon-blend":0.8,"horizon-fog-blend":0.75,"atmosphere-blend":0.85}); }catch(e){}
    // terrain is the single most expensive thing here; ease it back without flattening the view
    try{ tourMap.setTerrain(null); }catch(e){}
    tourMap.addSource("tl",{type:"geojson",data:{type:"Feature",geometry:S.route.geometry}});
    tourMap.addLayer({id:"tl-cas",type:"line",source:"tl",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":"#06283d","line-width":10,"line-opacity":.92}});
    tourMap.addLayer({id:"tl-ln",type:"line",source:"tl",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":"#22d3aa","line-width":5.5}});
    // maneuver pins
    marks.forEach((m,i)=>{ if(i===0)return; const el=document.createElement("div"); el.textContent="↱"; el.style.cssText="width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:#ffb020;color:#111;font-weight:800;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);font-size:12px"; try{tourPins.push(new maplibregl.Marker({element:el}).setLngLat(m.loc).addTo(tourMap));}catch(e){} });
    // moving puck
    const pk=document.createElement("div"); pk.className="tour-car";
    pk.innerHTML='<div class="tc-rig"><div class="tc-beam"></div><div class="tc-smoke l"></div><div class="tc-smoke r"></div><div class="tc-shadow"></div><div class="tc-flame l"></div><div class="tc-flame r"></div><div class="tc-wheel l"></div><div class="tc-wheel r"></div><div class="tc-spoil"></div><div class="tc-cabin"></div><div class="tc-glass"></div><div class="tc-lower"></div><div class="tc-lamp l"></div><div class="tc-lamp r"></div><div class="tc-bar"></div><div class="tc-plate"></div><div class="tc-diff"></div><div class="tc-exh l"></div><div class="tc-exh r"></div></div>';
    try{ var _hr=new Date().getHours(); if(_hr<7||_hr>=19) pk.classList.add("night"); }catch(e){}
    /* setRotation was only ever called from _tourRender(), which doesn't run until after the
       traffic-light countdown — so for those first ~2.6s the marker sat at rotation 0, i.e.
       pointing true north while the camera already faced down the route. Align it up front. */
    /* viewport-aligned on both axes: the sprite never rotates or lies flat, it just stands there
       facing you. The chase cam is always behind the car, so "rear of vehicle, upright" is the
       correct view every frame — and steering is expressed by leaning the sprite, not spinning it. */
    try{ tourPuck=new maplibregl.Marker({element:pk,rotationAlignment:"viewport",pitchAlignment:"viewport",anchor:"bottom"}).setLngLat(co[0]).addTo(tourMap); }catch(e){}
    // start/finish flags
    const mk=(txt,at)=>{const e=document.createElement("div");e.textContent=txt;e.style.cssText="font-size:20px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))";try{tourPins.push(new maplibregl.Marker({element:e}).setLngLat(at).addTo(tourMap));}catch(_){}}; 
    // pulsing highlight beacon at the destination
    try{ const de=document.createElement("div"); de.className="sat-beacon"; de.innerHTML='<div class="sat-pulse"></div><div class="sat-pulse b"></div><div class="sat-dot"></div>'; tourPins.push(new maplibregl.Marker({element:de,anchor:"center"}).setLngLat(co[co.length-1]).addTo(tourMap)); }catch(e){}
    // wait until the map has actually drawn tiles (or 3s max) before the countdown, so it never starts on a blank screen
    var _begun=false;
    /* Opens wide and high, then descends into the driver's seat. Two jobs at once: it reads as
       a deliberate establishing shot instead of a black screen, and a wide low-zoom frame pulls
       the ANCESTOR tiles for the whole opening stretch. Those ancestors are exactly what MapLibre
       falls back to when a high-zoom tile hasn't landed — so a miss degrades to slightly soft
       rather than melted. */
    function warmRoute(done){
      /* Stays centred on the start line the whole way down and lands exactly on the drive
         camera, so there is no snap at the bottom — the previous version eased toward a point
         18% down the route and then jumped back, which is what threw the scaling off. */
      try{
        var _H=(tourMap.getContainer&&tourMap.getContainer().clientHeight)||600;
        tourMap.easeTo({center:co[0],bearing:initBrg,zoom:17.4,pitch:_drivePitch,
                        padding:{top:Math.round(_H*0.34),bottom:0,left:0,right:0},
                        duration:3200,essential:true,
                        easing:function(t){ return t<0.5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2; }});
      }catch(e){ }
      setTimeout(function(){ done&&done(); },3260);
    }
    function beginTour(){
      if(_begun)return; _begun=true;
      warmRoute(function(){ runStartLight(function(){
        startTour(co,cum,total,marks);
        var hint=$("tourHint"); if(hint){hint.style.opacity="1"; setTimeout(()=>{try{hint.style.opacity="0";}catch(e){}},5000);}
      }); });
    }
    try{ tourMap.once("idle",beginTour); }catch(e){}
    setTimeout(beginTour,3000);
  });
}

function runStartLight(done){
  var L=$("tourLight"),R=$("tlRed"),Y=$("tlYel"),G=$("tlGrn"),W=$("tlWord");
  if(!L){done&&done();return;}
  [R,Y,G].forEach(b=>b&&(b.className="tl-bulb"));
  L.style.display="flex";
  try{ if(S.audioAlerts)beep(440,.12,.18); }catch(e){}
  if(R)R.className="tl-bulb on-red"; if(W)W.textContent="GET READY";
  setTimeout(function(){ if(Y)Y.className="tl-bulb on-yel"; if(W)W.textContent="SET"; try{if(S.audioAlerts)beep(520,.12,.18);}catch(e){} },1000);
  setTimeout(function(){ if(R)R.className="tl-bulb"; if(Y)Y.className="tl-bulb"; if(G)G.className="tl-bulb on-grn"; if(W)W.textContent="GO!"; try{if(S.audioAlerts)beep(720,.16,.24);}catch(e){} try{if(navigator.vibrate)navigator.vibrate(120);}catch(e){} },2000);
  setTimeout(function(){ L.style.display="none"; done&&done(); },2650);
}
function startTour(co,cum,total,marks){
  cancelAnimationFrame(tourRAF);
  var _mm=$("driveMap"); if(_mm)_mm.style.transform="scale(1.08) rotate(0deg)";
  /* v262: the 60-second ceiling was the whole problem. A 285-mile route was being flown in one
     minute at 1x — roughly 17,000 mph of ground speed — so 0.5x only halved something already
     impossible to read. Duration now scales with distance up to five minutes, and the camera
     compensates for whatever speed remains (see _tourRender). */
  const baseDur=Math.min(480000,Math.max(14000, total*7)); // ~7ms per metre, 14s–8min
  /* Default 1x, not 0.5x. Duration now scales with distance, so 0.5x on top of that was
     genuinely sluggish on a short route — the two slowdowns were compounding. */
  tourState={co,cum,total,marks,baseDur,frac:0,speed:1,paused:false,done:false,curBrg:_brg(co[0],_posAt(co,cum,Math.min(total,20)))};
  $("tourSpeed").innerHTML="1&times;";
  try{ _applyTourCues(); }catch(e){}
  try{ var _g0=$("tourGear"); if(_g0) _g0.textContent="G1"; }catch(e){}
  $("tourPlay").innerHTML="&#10073;&#10073;";
  runTour();
}
function _tourRender(){
  const st=tourState; if(!st||!tourMap)return;
  const d=st.frac*st.total;
  const pos=_posAt(st.co,st.cum,d);                 // the car
  const ahead=_posAt(st.co,st.cum,Math.min(st.total,d+16));  // short look-ahead → car sits low, road fills the top
  const tgt=_brg(pos,ahead);
  const prevBrg=st.curBrg;
  st.curBrg=_lerpAng(st.curBrg,tgt,0.14);
  var dB=((st.curBrg-prevBrg+540)%360)-180;
  st._lean=(st._lean||0)*0.80 + (-dB*2.6)*0.20;
  var lean=Math.max(-6,Math.min(6,st._lean));
  var spd=st._eff||st.speed||1;
  /* Tile budget is the real limit at 4x: the camera outruns the network. Games solve this with
     LOD by velocity, so do the same — every zoom level back quarters the tiles needed to cover
     the same ground, and at speed nobody is reading rooftops anyway. */
  /* Camera altitude follows GROUND SPEED, not the speed multiplier. The old formula only knew
     about the 0.5x/1x/2x chip, so a long route flown at "0.5x" still had the camera down at
     street level while the world tore past — everything smeared. Compute how fast we are
     actually covering ground and pull the camera up and back as that rises: fast means higher,
     wider and flatter, which is exactly how the eye stays able to follow it. */
  var _mps = (st.total / (st.baseDur/1000)) * spd;      // metres of route per second of playback
  /* Linear was wrong: it saturated at 325 m/s and then stopped responding, so a 765 m/s flight
     got the same camera as a 325 m/s one. Speed varies over orders of magnitude here, so scale
     the response logarithmically — 45 m/s (about 100mph) is the reference where the close
     cinematic camera is right, and every doubling above that pulls the camera back further. At
     the top it becomes a regional map flyover, which is honest: you cannot show street detail
     at that speed, so show something legible instead of a smear. */
  /* v263: I over-corrected. Pulling the camera back 6.6 zoom levels turned the drive preview
     into a map flyover — you could see the route but you were no longer IN the car, which is
     the entire point of the feature. The pullback is now gentle (2.4 levels, floored at z15 so
     the road always fills the frame) and the speed problem is solved where it belongs: by
     slowing the flight down, not by retreating from it. */
  var _fast = Math.max(0, Math.min(1, Math.log2(Math.max(1,_mps)/45)/3.2));
  var zoom=Math.max(15.0, 17.7 - Math.max(0,Math.min(1.9,(spd-1)*0.62)) - _fast*2.4);
  st._fastness=_fast;
  // CHASE CAM: center between car and the near look-ahead, pitch ~78 so the horizon rises and the road stretches out ahead
  // push the camera target further down the road as speed rises: the ground enters the viewport
  // earlier, so its tiles are requested earlier and are in by the time we get there
  var _look=9+Math.max(0,Math.min(80,(spd-1)*24));
  var camCtr=_posAt(st.co,st.cum,Math.min(st.total,d+_look));
  var H=(tourMap.getContainer&&tourMap.getContainer().clientHeight)||600;
  /* Flatten the pitch as speed rises too. At 78 degrees the horizon is high and the road
     stretches away, which is lovely at city speed and unreadable at freeway-times-ten. */
  /* Keep the windshield angle. 78 degrees is what makes it feel like the driver's seat; the
     old flattening to 52 was the "high up" look you spotted. Never drop below 72. */
  var _pitch=Math.max(72,(S._drivePitch||78) - (st._fastness||0)*6);
  tourMap.jumpTo({center:camCtr,bearing:st.curBrg,pitch:_pitch,zoom:zoom,padding:{top:Math.round(H*0.34),bottom:0,left:0,right:0}});
  // apply the lean (scale hides rotation corners + adds cockpit-forward feel)
  var mm=$("driveMap"); if(mm) mm.style.transform="scale(1.08) rotate("+lean.toFixed(2)+"deg)";
  // ═══ SPEED WARP intensity: streaks + vignette ramp up with speed and in turns ═══
  var fx=$("tourFX"); if(fx) fx.style.opacity=(0.12 + Math.min(1,(spd-1)/3)*0.5 + Math.min(0.25,Math.abs(dB)*0.05)).toFixed(2);
  if(tourPuck){ try{
    tourPuck.setLngLat(pos);
    /* Body english: lean into the turn and squat as speed builds. Slide is deliberately small —
       the car should look planted ON the line, not swimming beside it. */
    var _tilt=(lean*2.0).toFixed(2), _slide=(lean*0.75).toFixed(1),
        _sq=(1+Math.min(0.08,(spd-1)*0.028)).toFixed(3);
    var _el=tourPuck.getElement();
    var _rig=_el.querySelector(".tc-rig");
    if(_rig) _rig.style.transform="translateX("+_slide+"px) rotate("+_tilt+"deg) scale("+_sq+")";
    /* GEARBOX: a virtual box that upshifts on an interval which tightens as the multiplier rises.
       Each shift throws flame out both tips and punches the brightness for a frame or two. */
    var _now=Date.now();
    if(!st._nextShift) st._nextShift=_now+800;
    if(_now>=st._nextShift){
      st._gear=Math.min(6,(st._gear||1)+1);
      if(st._gear>=6) st._gear=2;                       // roll back down the box and climb again
      try{ _el.classList.remove("shift"); void _el.offsetWidth; _el.classList.add("shift"); }catch(e){}
      st._nextShift=_now+Math.round((1400+Math.random()*700)/Math.max(0.6,spd*0.7));
      try{ var _g=$("tourGear"); if(_g) _g.textContent="G"+st._gear; }catch(e){}
    }
    // tyre smoke only when it is genuinely leaning on it, so it stays an event and not wallpaper
    try{ _el.classList.toggle("drift", Math.abs(lean)>3.4); }catch(e){}
  }catch(e){} }
  const up=st.marks.find(m=>m.dist>=d-15);
  if(up){ const rem=Math.max(0,up.dist-d); $("tourInstr").textContent=up.text; $("tourDist").textContent=rem>25?("in "+_tourDist(rem)):"now"; }
  $("tourProg").style.width=(st.frac*100).toFixed(1)+"%";
}
function runTour(){
  const st=tourState; if(!st||!tourMap)return;
  cancelAnimationFrame(arriveRAF); arriveRAF=null;
  let last=null;
  const frame=(ts)=>{
    if(!tourState||!tourMap||st.paused||st.done)return;
    if(last==null)last=ts;
    const dt=Math.min(50,ts-last); last=ts;
    var _boosting=st._boostUntil && Date.now()<st._boostUntil;
    if(st._boostOn && !_boosting) endBoost();
    st._eff=st.speed*(_boosting?2.4:1);
    st.frac=Math.min(1, st.frac+(dt/st.baseDur)*st._eff); // rate-based: speed changes never jump the camera
    _tourRender();
    if(st.frac>=1){ st.done=true; arriveCinematic(); return; }
    tourRAF=requestAnimationFrame(frame);
  };
  tourRAF=requestAnimationFrame(frame);
}
let arriveRAF=null;
function arriveCinematic(){
  const st=tourState; if(!st||!tourMap)return;
  const co=st.co, end=co[co.length-1], a=co[Math.max(0,co.length-2)];
  const brg=_brg(a,end);
  var mm=$("driveMap"); if(mm)mm.style.transform="scale(1) rotate(0deg)";
  var fx=$("tourFX"); if(fx)fx.style.opacity="0";
  $("tourInstr").textContent="You've arrived — "+(S.destName||"destination");
  $("tourDist").textContent="Pulling in…";
  $("tourPlay").innerHTML="&#8635;";
  try{
    // drop the camera in close, right in front of the destination
    tourMap.easeTo({center:end,bearing:brg,pitch:66,zoom:18.6,duration:2600,essential:true});
    setTimeout(()=>{ if(tourState&&tourState.done){ $("tourDist").textContent=""; arriveOrbit(end); } },2900);
  }catch(e){}
}
function arriveOrbit(center){
  cancelAnimationFrame(arriveRAF);
  let touched=false;
  const stop=()=>{touched=true;cancelAnimationFrame(arriveRAF);arriveRAF=null;};
  ["dragstart","zoomstart","touchstart","mousedown","wheel"].forEach(ev=>{try{tourMap.on(ev,stop);}catch(e){}});
  const step=()=>{ if(!tourMap||touched||!tourState){return;} tourMap.setBearing(tourMap.getBearing()+0.11); tourMap.setCenter(center); arriveRAF=requestAnimationFrame(step); };
  step();
}
function stopTour(){ S._previewOpen=false; try{ endBoost(); }catch(e){} cancelAnimationFrame(arriveRAF); arriveRAF=null; var _mm=$("driveMap"); if(_mm){_mm.style.transform="scale(1.08) rotate(0deg)"; _mm.style.opacity="1";} cancelAnimationFrame(tourRAF); tourState=null; if(tourPuck){try{tourPuck.remove();}catch(e){}tourPuck=null;} tourPins.forEach(p=>{try{p.remove();}catch(e){}}); tourPins=[]; if(tourMap){try{tourMap.remove();}catch(e){}tourMap=null;} $("drivePreview").style.display="none"; }

/* The 3D preview was opening on its own. The button sits in the route sheet, which slides up
   UNDER the finger that just picked a destination — so the release landed on the button and
   fired a click nobody meant. Two guards: the press must have STARTED on this button, and the
   sheet must have been on screen long enough for a human to have aimed at it. */
if($("drivePrev")){
  var _dpArmed=false;
  $("drivePrev").addEventListener("pointerdown",function(){ _dpArmed=true; });
  $("drivePrev").addEventListener("pointercancel",function(){ _dpArmed=false; });
  $("drivePrev").onclick=function(){
    var started=_dpArmed; _dpArmed=false;
    if(!started) return;                                   // click with no matching press = ghost
    if(Date.now()-(window._cwSheetAt||0) < 700) return;     // sheet still animating in
    if(S.route) openDriveTour(); else toast("Building route — try again in a second.");
  };
}
$("driveClose")&&($("driveClose").onclick=stopTour);
$("tourDrive")&&($("tourDrive").onclick=()=>{ stopTour(); startNavigation(); });
function tourSeek(clientX){
  const st=tourState, t=$("tourTrack"); if(!st||!t)return;
  const r=t.getBoundingClientRect(); let f=(clientX-r.left)/r.width; f=Math.max(0,Math.min(1,f));
  st.frac=f; st.done=false; cancelAnimationFrame(arriveRAF); arriveRAF=null;
  _tourRender();
  if(!st.paused){ cancelAnimationFrame(tourRAF); runTour(); }
  $("tourPlay").innerHTML=st.paused?"&#9654;":"&#10073;&#10073;";
}
$("tourTrack")&&$("tourTrack").addEventListener("pointerdown",(e)=>{ e.preventDefault(); tourSeek(e.clientX);
  const mv=(ev)=>tourSeek(ev.clientX); const up=()=>{ document.removeEventListener("pointermove",mv); document.removeEventListener("pointerup",up); };
  document.addEventListener("pointermove",mv); document.addEventListener("pointerup",up); });
var BOOST_MS=3600, BOOST_COOL=5200;
function startBoost(){
  var st=tourState; if(!st||st.done) return;
  if(st._boostUntil && Date.now()<st._boostUntil) return;              // already lit
  if(st._boostReady && Date.now()<st._boostReady) return;              // still recharging
  st._boostUntil=Date.now()+BOOST_MS; st._boostOn=true;
  st._boostReady=Date.now()+BOOST_MS+BOOST_COOL;
  try{ tourPuck.getElement().classList.add("boost"); }catch(e){}
  try{ var w=$("tourWarp"); if(w){ w.innerHTML='<div class="warp-rings"></div><div class="warp-streak"></div><div class="warp-vig"></div>'; w.classList.add("on"); } }catch(e){}
  try{ var b=$("tourBoost"); if(b){ b.classList.add("armed"); b.classList.remove("cooling"); } }catch(e){}
  try{ var g=$("tourGear"); if(g){ g.textContent="N2O"; g.style.color="#c9a4ff"; } }catch(e){}
  try{ if(navigator.vibrate) navigator.vibrate([18,40,26]); }catch(e){}
  if(st.paused){ st.paused=false; $("tourPlay").innerHTML="&#10073;&#10073;"; runTour(); }
}
function endBoost(){
  var st=tourState; if(!st) return;
  st._boostOn=false; st._boostUntil=0;
  try{ tourPuck.getElement().classList.remove("boost"); }catch(e){}
  try{ var w=$("tourWarp"); if(w){ w.classList.remove("on"); setTimeout(function(){ try{ if(!(tourState&&tourState._boostOn)) w.innerHTML=""; }catch(e){} },300); } }catch(e){}
  try{ var g=$("tourGear"); if(g){ g.style.color=""; g.textContent="G"+(st._gear||1); } }catch(e){}
  var b=$("tourBoost");
  if(b){ b.classList.remove("armed"); b.classList.add("cooling");
    setTimeout(function(){ try{ b.classList.remove("cooling"); }catch(e){} }, BOOST_COOL); }
}
$("tourBoost")&&($("tourBoost").onclick=function(){ startBoost(); });
/* 0.25x added: on a 285-mile route even 0.5x is covering ground faster than any real vehicle. */
/* Turn instructions OFF by default in the drive preview. You are previewing what the road
   looks like; a nav banner reading "Take the exit in 1.4 mi" is the regular GPS experience
   layered on top and it competes with the thing you came to see. One tap restores it, and the
   choice persists. */
var _tourCues = (function(){ try{ return localStorage.getItem("cw_tourCues")==="1"; }catch(e){ return false; } })();
function _applyTourCues(){
  try{
    var b=$("tourBanner"); if(b) b.style.display=_tourCues?"":"none";
    var t=$("tourCues"); if(t){ t.style.opacity=_tourCues?"1":".45"; t.title=_tourCues?"Hide turn instructions":"Show turn instructions"; }
  }catch(e){}
}
$("tourCues")&&($("tourCues").onclick=()=>{
  _tourCues=!_tourCues;
  try{ localStorage.setItem("cw_tourCues",_tourCues?"1":"0"); }catch(e){}
  _applyTourCues();
  try{ toast(_tourCues?"Turn instructions on":"Turn instructions off"); }catch(e){}
});
$("tourSpeed")&&($("tourSpeed").onclick=()=>{ const st=tourState; if(!st)return;
  st.speed = st.speed===0.25?0.5 : st.speed===0.5?1 : st.speed===1?2 : st.speed===2?4 : 0.25;
  $("tourSpeed").innerHTML=(st.speed<1?String(st.speed):st.speed)+"&times;"; });
$("tourRestart")&&($("tourRestart").onclick=()=>{ const st=tourState; if(!st)return; st.frac=0;st.done=false;st.paused=false;st.curBrg=_brg(st.co[0],st.co[1]);$("tourPlay").innerHTML="&#10073;&#10073;";runTour(); });
$("tourPlay")&&($("tourPlay").onclick=()=>{ const st=tourState; if(!st)return; if(st.done){ st.frac=0;st.done=false;st.paused=false;$("tourPlay").innerHTML="&#10073;&#10073;";runTour(); } else { st.paused=!st.paused; $("tourPlay").innerHTML=st.paused?"&#9654;":"&#10073;&#10073;"; if(!st.paused)runTour(); } });


$("satDest").onclick=()=>{if(S.dest)openSat(S.dest.lat,S.dest.lng,S.destName);else toast("Pick a destination first.");};

/* live speed limits from OpenStreetMap while navigating */
S.limit=null;let limitTimer=null,lastLimitQ=0;
async function pollLimit(){
  if(!S.pos||Date.now()-lastLimitQ<15000)return;lastLimitQ=Date.now();
  try{
    // Pull several nearby roads with their class + name, then pick the one we're ACTUALLY on.
    // (Old version grabbed the closest way within 25m — on a freeway that's often the service drive.)
    const q=`[out:json][timeout:8];way(around:40,${S.pos.lat},${S.pos.lng})["maxspeed"]["highway"];out tags 8;`;
    const d=await (await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:"data="+encodeURIComponent(q),headers:{"Content-Type":"application/x-www-form-urlencoded"}})).json();
    const els=(d.elements||[]).filter(e=>e&&e.tags&&e.tags.maxspeed);
    if(!els.length) return;
    // what road does the route say we're on?
    let curName="", curRef="";
    try{ const st=S.steps[S.stepIdx]||{}; curName=String(st.name||"").toLowerCase(); curRef=String(st.ref||"").toLowerCase(); }catch(e){}
    const CLASS={motorway:6,trunk:5,primary:4,secondary:3,tertiary:2,residential:1,service:0,unclassified:1};
    const fast=(S.speedMph||0)>45;
    let best=null,bestScore=-1e9;
    els.forEach(e=>{
      const t=e.tags, hw=String(t.highway||"").replace("_link","");
      let sc=0;
      const nm=String(t.name||"").toLowerCase(), rf=String(t.ref||"").toLowerCase();
      if(curName&&nm&&(nm===curName||nm.indexOf(curName)>-1||curName.indexOf(nm)>-1)) sc+=60;   // same street name
      if(curRef&&rf&&rf.indexOf(curRef.replace(/\s/g,""))>-1) sc+=60;                            // same route number
      sc+=(CLASS[hw]!==undefined?CLASS[hw]:1)*4;
      if(fast&&(hw==="motorway"||hw==="trunk")) sc+=40;      // doing 60+? you're on the freeway, not the service drive
      if(fast&&(hw==="service"||hw==="residential")) sc-=50;
      const n=parseInt(t.maxspeed,10);
      if(!isNaN(n)){ const mph=/mph/i.test(t.maxspeed)?n:Math.round(n*0.621371);
        if(fast&&mph<40) sc-=25;                              // a 25mph limit while doing 65 is the wrong road
        if(!fast&&mph>60) sc-=20; }
      if(sc>bestScore){bestScore=sc;best=t;}
    });
    if(best&&best.maxspeed){
      const n=parseInt(best.maxspeed,10);
      if(!isNaN(n)){ S.limit=/mph/i.test(best.maxspeed)?n:Math.round(n*0.621371);
        $("limitNum").textContent=S.limit;$("limitBadge").style.display="block"; }
    }
  }catch{}
}


/* ═══════════ v4: voice guidance · quick destinations · share ETA · overview · units ═══════════ */
function speak(t){ if(!S.voiceOn)return; try{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.rate=1.03;speechSynthesis.speak(u);}catch{} }
function spokenDist(m){
  if(S.units==="km")return m>=950?((m/1000).toFixed(1).replace(".0",""))+" kilometers":Math.round(m/10)*10+" meters";
  const ft=m*3.28084;
  if(ft>2400)return ((m/1609.34).toFixed(1).replace(".0",""))+" miles";
  if(ft>1100)return "a quarter mile";
  return Math.round(ft/50)*50+" feet";
}
$("voiceBtn").onclick=()=>{S.voiceOn=!S.voiceOn;$("voiceBtn").textContent=S.voiceOn?"🔊":"🔇";if(!S.voiceOn){try{speechSynthesis.cancel();}catch{}}toast(S.voiceOn?"Voice guidance on":"Voice guidance muted");};
$("voiceBtn").textContent=S.voiceOn?"🔊":"🔇";

$("shareEta").onclick=async()=>{
  const txt=`On my way to ${S.destName||"my destination"} — arriving ${S.etaArr||"soon"} (${S.etaMin||"a few"} min). Live road intel by ConeWatch: https://conewatch.vercel.app`;
  try{ if(navigator.share)await navigator.share({text:txt}); else{await navigator.clipboard.writeText(txt);toast("ETA copied — paste it anywhere");} }catch{}
};
function overviewRoute(){
  if(!S.route)return;
  S.follow=false;updateFollowUI();
  const c=S.route.geometry.coordinates;
  const b=c.reduce((bb,x)=>bb.extend(x),new maplibregl.LngLatBounds(c[0],c[0]));
  map.fitBounds(b,{padding:{top:180,bottom:130,left:50,right:50},pitch:0,bearing:0});
  startRelock();
}
$("ovBtn").onclick=overviewRoute;
$("pillOv").onclick=overviewRoute;
$("pillExit").onclick=()=>endNavigation();

/* quick destinations: home, work, parked car, recents */
let QK={home:null,work:null,recents:[],park:null,favorites:[]};
try{QK=Object.assign(QK,JSON.parse(localStorage.getItem("cw_quick")||"{}"));}catch{}
function saveQK(){try{localStorage.setItem("cw_quick",JSON.stringify(QK));}catch{}}
function renderQuick(){
  const q=$("quick");q.innerHTML="";
  // hard slicing produced things like "IO Godfrey Rooft" — clip on a word edge and mark it
  const clip=(t,n)=>{t=(t||"").trim();if(t.length<=n)return t;let c=t.slice(0,n);const sp=c.lastIndexOf(" ");if(sp>n*0.6)c=c.slice(0,sp);return c.replace(/[\s,.\-]+$/,"")+"\u2026";};
  const chip=(label,fn,full)=>{const b=document.createElement("button");b.className="chip";b.style.padding="5px 11px";b.style.fontSize="11px";b.textContent=label;if(full)b.title=full;b.onclick=fn;q.appendChild(b);};
  if(QK.home)chip("🏠 Home",()=>setDestination(QK.home,"Home"));
  if(QK.work)chip("💼 Work",()=>setDestination(QK.work,"Work"));
  if(QK.park)chip("🚶 Find my car",()=>walkToCar());
  (QK.favorites||[]).slice(0,4).forEach(f=>chip("⭐ "+clip(f.name,16),()=>setDestination({lat:f.lat,lng:f.lng},f.name),f.name));
  (QK.recents||[]).slice(0,3).forEach(r=>chip("🕘 "+clip(r.name,18),()=>setDestination({lat:r.lat,lng:r.lng},r.name),r.name));
  q.style.display=q.children.length?"flex":"none";
  layout();
}
renderQuick();

/* ═══════════ on-device personalization: learns which places you go, when ═══════════
   Everything stays in localStorage on this phone — nothing is uploaded.
   Score = how often you go + whether it matches this hour/day + how recently. */
let LEARN={}; try{ LEARN=JSON.parse(localStorage.getItem("cw_learn")||"{}")||{}; }catch(e){ LEARN={}; }
function saveLearn(){ try{
  const keys=Object.keys(LEARN);
  if(keys.length>60){ keys.sort((a,b)=>(LEARN[a].last||0)-(LEARN[b].last||0)); keys.slice(0,keys.length-60).forEach(k=>delete LEARN[k]); }
  localStorage.setItem("cw_learn",JSON.stringify(LEARN));
}catch(e){} }
function learnKey(name,ll){ return (name||"?").toLowerCase().trim()+"@"+(+ll.lat).toFixed(3)+","+(+ll.lng).toFixed(3); }
function learnVisit(name,ll){
  if(!name||!ll) return;
  const k=learnKey(name,ll), now=new Date();
  const e=LEARN[k]||{name:name,lat:+ll.lat,lng:+ll.lng,n:0,hours:{},days:{},last:0};
  e.n=(e.n||0)+1;
  e.hours[now.getHours()]=(e.hours[now.getHours()]||0)+1;
  e.days[now.getDay()]=(e.days[now.getDay()]||0)+1;
  e.last=Date.now(); e.name=name; e.lat=+ll.lat; e.lng=+ll.lng;
  LEARN[k]=e; saveLearn();
}
// score a learned place for RIGHT NOW
function learnScore(e){
  const now=new Date(), h=now.getHours(), d=now.getDay();
  let s=Math.min(10,(e.n||0))*2;                                  // frequency (capped so one place can't dominate forever)
  const hourHits=(e.hours&&((e.hours[h]||0)+(e.hours[(h+23)%24]||0)+(e.hours[(h+1)%24]||0)))||0;
  s+=Math.min(12,hourHits*4);                                     // goes here around this time of day
  s+=Math.min(6,((e.days&&e.days[d])||0)*2);                      // and on this weekday
  const daysAgo=(Date.now()-(e.last||0))/86400000;
  s+=daysAgo<1?5:daysAgo<7?3:daysAgo<30?1:0;                      // recency
  return s;
}
// the places this user most likely wants right now
function smartPlaces(limit){
  const out=Object.keys(LEARN).map(k=>({e:LEARN[k],sc:learnScore(LEARN[k])}))
    .filter(x=>x.e&&x.e.name).sort((a,b)=>b.sc-a.sc).slice(0,limit||5);
  return out.map(x=>({name:x.e.name,lat:x.e.lat,lng:x.e.lng,sc:x.sc,n:x.e.n}));
}
// Apple-Maps-style: tapping the empty search box shows Home / Work / favorites / recents — one tap to route, no retyping
function showRecentsPanel(){
  const box=$("results"); if(!box) return;
  const items=[], seen={};
  const add=(o)=>{ const k=(o.name||"").toLowerCase(); if(!o.name||seen[k])return; seen[k]=1; items.push(o); };
  if(QK.home) add({name:"Home",label:"Saved place",icon:"🏠",bg:"#34C98A",lat:QK.home.lat,lng:QK.home.lng});
  if(QK.work) add({name:"Work",label:"Saved place",icon:"💼",bg:"#5B9CF6",lat:QK.work.lat,lng:QK.work.lng});
  // learned suggestions for this time of day, ranked
  smartPlaces(4).forEach(p=>{ if(p.sc>=8) add({name:p.name,label:(p.n>2?"You often go here now":"Suggested for now"),icon:"✨",bg:"#FF6B1A",lat:p.lat,lng:p.lng}); });
  (QK.favorites||[]).slice(0,4).forEach(f=>add({name:f.name,label:"Favorite",icon:"⭐",bg:"#FF9F0A",lat:f.lat,lng:f.lng}));
  (QK.recents||[]).slice(0,6).forEach(r=>add({name:r.name,label:"Recent",icon:"🕘",bg:"#6B7280",lat:r.lat,lng:r.lng}));
  if(!items.length){ box.style.display="none"; return; }
  box.innerHTML="";
  const head=document.createElement("div");
  head.style.cssText="padding:9px 14px 5px;font-size:11px;letter-spacing:1px;color:var(--muted,#8a8d96);text-transform:uppercase";
  head.textContent="Recent & Saved";
  box.appendChild(head);
  items.slice(0,10).forEach(it=>{
    const div=document.createElement("div"); div.className="result ricon";
    div.innerHTML='<span class="pin" style="background:'+it.bg+'">'+it.icon+'</span><span class="rtext"><b>'+it.name+'</b><small>'+it.label+'</small></span>';
    div.onclick=(e)=>{ e.stopPropagation(); box.style.display="none"; $("search").blur(); $("search").value=it.name; setDestination({lat:it.lat,lng:it.lng},it.name); };
    box.appendChild(div);
  });
  box.style.display="block";
}
$("setHome").onclick=()=>{if(!S.dest)return toast("Pick a destination first.");QK.home={lat:S.dest.lat,lng:S.dest.lng};saveQK();renderQuick();toast("🏠 Home saved");};
$("setWork").onclick=()=>{if(!S.dest)return toast("Pick a destination first.");QK.work={lat:S.dest.lat,lng:S.dest.lng};saveQK();renderQuick();toast("💼 Work saved");};
$("setFav")&&($("setFav").onclick=()=>{ if(!S.dest)return toast("Pick a destination first."); const name=(S.destName||"Saved place").slice(0,40); QK.favorites=[{lat:S.dest.lat,lng:S.dest.lng,name},...(QK.favorites||[]).filter(f=>f.name!==name)].slice(0,20); saveQK(); renderQuick(); toast("⭐ Saved to Favorites"); });
// walk the user back to where they parked, on foot
function walkToCar(){ if(!QK.park)return toast("No parked car saved yet."); setMode("foot"); setDestination(QK.park,"My parked car"); toast("🚶 Walking you back to your car"); }

/* units */
document.querySelectorAll("#unitChips .chip").forEach(c=>c.onclick=()=>{
  document.querySelectorAll("#unitChips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");
  S.units=c.dataset.u;
  document.querySelector("#speed .u").textContent=S.units==="km"?"km/h":"mph";
  saveSettings();toast(S.units==="km"?"Metric units":"Imperial units");
});
document.querySelector("#speed .u").textContent=S.units==="km"?"km/h":"mph";
document.querySelectorAll("#unitChips .chip").forEach(c=>c.classList.toggle("on",c.dataset.u===S.units));


/* ═══════════ v5: back-gesture panel closing + dynamic header layout ═══════════ */
/* ═══════════ the dock sheet ═══════════
   Three detents, the way Apple Maps and Waze do it: collapsed to just the search bar, mid with
   search + recents + modes, expanded with the full drawer. The grip follows the finger during
   a drag and snaps to the nearest detent on release — a sheet that only toggles on tap feels
   like a menu, and a sheet that follows your thumb feels like an object. */
var DOCK_MIN=96;                      // collapsed: just the search bar
function dockMetrics(){
  var d=$("dock"), more=$("dockMore");
  if(!d) return null;
  var H=d.offsetHeight, M=more?more.offsetHeight+14:0;
  return { H:H, M:M, y2:0, y1:M, y0:Math.max(0,H-DOCK_MIN) };   // expanded / mid / collapsed
}
function setDockY(px){
  try{ document.documentElement.style.setProperty("--dockY",px+"px"); }catch(e){}
}
function dockState(){ var d=$("dock"); return d? (+d.dataset.detent||1) : 1; }
function setDock(n,persist){
  var d=$("dock"); if(!d) return;
  var m=dockMetrics(); if(!m) return;
  n=Math.max(0,Math.min(2,n));
  if(n===2){ try{ renderDockMore(); }catch(e){} }
  d.dataset.detent=n;
  d.classList.toggle("expanded", n===2);
  var dm=$("dockMore"); if(dm) dm.setAttribute("aria-hidden", n===2?"false":"true");
  setDockY(n===2?m.y2:(n===1?m.y1:m.y0));
  if(persist!==false){ try{ localStorage.setItem("cw_dock",String(n)); }catch(e){} }
  try{ layout(); setTimeout(layout,340); }catch(e){}
}
try{
  var _g=document.getElementById("dockGrip"), _dk=document.getElementById("dock");
  if(_g&&_dk){
    requestAnimationFrame(function(){
      var sv=null; try{ sv=localStorage.getItem("cw_dock"); }catch(e){}
      setDock(sv==="0"||sv==="2"?parseInt(sv,10):1,false);
    });
    /* Apple lets you drag the sheet from any non-interactive part of it, not only the grabber.
       Restricting it to a thin bar is most of why this felt like it was "struggling" — you were
       usually not touching the one element that listened. */
    /* Every part of the sheet is a drag surface, including the chips and mode buttons. Excluding
       them left only the thin gaps between controls as draggable, which is why it still felt
       hesitant — most of the block did nothing. The gesture only COMMITS after 10px of travel,
       so a tap on a chip is still a tap, and the click is suppressed once a drag has begun. */
    /* Even the search field drags the sheet. Excluding inputs meant a swipe that started on
       "Where to?" — the single largest target on the sheet, and the obvious place to grab —
       did nothing, or worse let iOS drag the caret instead. A tap under 10px still focuses it
       normally; past 10px the field blurs and the sheet takes the gesture. */
    function draggableFrom(t){
      if(!t) return false;
      var scroller=t.closest("#dockMore");
      if(scroller && scroller.scrollTop>0) return false;         // let content scroll first
      return true;
    }
    var _armed=false;                                            // pressed, not yet a drag
    function suppressNextClick(){
      window.addEventListener("click",function h(e){
        e.stopPropagation(); e.preventDefault();
        window.removeEventListener("click",h,true);
      },true);
    }
    var _y0=0,_startY=0,_from=1,_drag=false,_moved=0,_met=null;
    /* On-screen instrumentation. Long-press the version badge to toggle. It reports what the
       sheet actually receives, so a screenshot settles what is happening instead of me
       inferring it from a description. */
    var _dbg=null;
    /* No usable console on a phone, so the corridor cache reports itself here. IndexedDB reads
       are async and dbg() paints synchronously, so we keep the last summary in a string and
       kick a refresh alongside each paint. */
    var _corrTxt="corridor  reading…", _corrTick=null, _offTxt="", _offAt=0;
    function _corridorLine(){ return _corrTxt; }
    function _corridorRefresh(){
      /* Opening the debug panel forces a fresh probe. Waiting a week for the cache to expire is
         no use while we are actively hunting this. */
      try{ if(!_probeRan){ _probeRan=true; probeBasemapFloor(true); } }catch(e){}
      try{
        if(typeof cwdbAll!=="function"){ _corrTxt="corridor  n/a (old build)"; return; }
        cwdbAll().then(function(all){
          if(!all||!all.length){ _corrTxt="corridor  none cached yet\n(plan a route, wait ~5s)"; return; }
          all.sort(function(a,b){ return b.t-a.t; });
          var x=all.filter(function(z){ return z.kind!=="area"; })[0]||all[0];
          var _ar=all.filter(function(z){ return z.kind==="area"; })[0];
          _corrTxt=(_ar? ("area    "+_ar.n+" nodes / "+((_ar.places&&_ar.places.length)||0)+" places\n"+
                          "        "+Math.round((Date.now()-_ar.t)/3600000)+"h old\n")
                       : "area    not cached yet\n")+
                   "corridor  "+all.filter(function(z){return z.kind!=="area";}).length+" cached\n"+
                   "newest  "+(x.n||0)+" nodes / "+(x.ways||0)+" ways\n"+
                   "to      "+((x.destName||"?").slice(0,18))+"\n"+
                   "age     "+Math.round((Date.now()-x.t)/60000)+" min"+
                   (_offTxt?("\noffline "+_offTxt):"")+
                   /* Tools trail: long-press LIVE after tapping a tool row and this says whether
                      the sheet actually opened, so the next report is evidence not inference. */
                   ((typeof _probeTxt!=="undefined") ? ("\n"+_probeTxt) : "")+
                   ((typeof _searchTxt!=="undefined" && _searchTxt) ? ("\n"+_searchTxt) : "")+
                   ((typeof _rasterTxt==="function") ? ("\n"+_rasterTxt()) : "")+
                   ((typeof _swTxt!=="undefined") ? ("\n"+_swTxt) : "")+
                   ((typeof _toolsLog!=="undefined" && _toolsLog.length)
                      ? ("\n--- tools ---\n"+_toolsLog.join("\n")) : "")+
                   "\ndecl    "+(_declNative?"OS true north":
                      (_decl===null?"learning…":(_decl.toFixed(1)+"\u00B0 / "+_declN+" samples")));
          // probe the A* path against the live position so the panel proves the search works
          // on real OSM data, not just the synthetic grids it was unit-tested on
          try{
            if(S.pos&&S.dest&&typeof routeOffline==="function"&&Date.now()-_offAt>6000){
              _offAt=Date.now();
              var _t0=Date.now();
              routeOffline(S.pos,S.dest).then(function(rr){
                _offTxt = rr ? (rr.coords.length+" pts / "+rr.distance+"m / "+(Date.now()-_t0)+"ms")
                             : "no path in cache";
              }).catch(function(){ _offTxt="probe error"; });
            }
          }catch(e){}
        }).catch(function(e){ _corrTxt="corridor  idb error"; });
      }catch(e){ _corrTxt="corridor  unavailable"; }
    }
    function dbg(tag){
      if(!window.__cwDockDebug) return;
      if(!_dbg){
        _dbg=document.createElement("div"); _dbg.id="dockDbg";
        _dbg.style.cssText="position:fixed;left:8px;top:52%;z-index:9999;font:11px/1.45 ui-monospace,monospace;"+
          "background:rgba(0,0,0,.86);color:#5BF0C8;padding:8px 10px;border-radius:8px;"+
          /* The probe's per-zoom map is a long line and white-space:pre refuses to break it, so
             it ran off the panel and over the map. Wrap it, cap the height, and let it scroll —
             which needs pointer events back on. */
          "white-space:pre-wrap;word-break:break-word;max-width:min(92vw,560px);"+
          "max-height:64vh;overflow:auto;-webkit-overflow-scrolling:touch";
        document.body.appendChild(_dbg);
      }
      _corridorRefresh();
      var y=getComputedStyle(document.documentElement).getPropertyValue("--dockY").trim();
      _dbg.textContent =
        "evt   "+tag+"\n"+
        "drag  "+_drag+"  moved "+Math.round(_moved)+"\n"+
        "dockY "+y+"\n"+
        "from  "+_from+"  state "+dockState()+"\n"+
        (_met? ("y2/y1/y0  "+Math.round(_met.y2)+" / "+Math.round(_met.y1)+" / "+Math.round(_met.y0)+"\n"+
                "dockH "+Math.round(_met.H)+"  moreH "+Math.round(_met.M)) : "metrics null")+
        "\n────────────\n"+_corridorLine();
    }
    try{
      var _vb=document.getElementById("netDot")||document.getElementById("verBadge"), _vt=null, _swallow=false;
      if(_vb){
        // a long press on text summons Copy / Look Up / Translate; suppress it on the badge
        _vb.style.webkitUserSelect="none"; _vb.style.userSelect="none";
        _vb.style.webkitTouchCallout="none"; _vb.style.touchAction="manipulation";
        _vb.addEventListener("contextmenu",function(e){ e.preventDefault(); });
        _vb.addEventListener("pointerdown",function(){
          _vt=setTimeout(function(){
            window.__cwDockDebug=!window.__cwDockDebug;
            if(!window.__cwDockDebug && _dbg){ _dbg.remove(); _dbg=null; if(_corrTick){clearInterval(_corrTick);_corrTick=null;} }
            else {
              dbg("armed");
              // repaint on a timer: the corridor capture lands ~4s after a route, long after
              // the last drag event, so without this the panel would show a stale "none cached"
              if(_corrTick) clearInterval(_corrTick);
              _corrTick=setInterval(function(){ if(window.__cwDockDebug) dbg("armed"); },2000);
            }
            try{ if(navigator.vibrate) navigator.vibrate(20); }catch(e){}
            _swallow=true;                       // the release still fires a click — eat it
          },700);
        });
        ["pointerup","pointerleave","pointercancel"].forEach(function(ev){
          _vb.addEventListener(ev,function(){ clearTimeout(_vt); });
        });
        _vb.addEventListener("click",function(e){
          if(_swallow){ _swallow=false; e.stopPropagation(); e.preventDefault(); }
        },true);
      }
    }catch(e){}
    function onDown(e){
      if(e.currentTarget!==_g && !draggableFrom(e.target)) return;
      _met=dockMetrics(); if(!_met) return;
      _armed=true; _drag=false; _moved=0; _startY=e.clientY; _from=dockState();
      _y0=(_from===2?_met.y2:(_from===1?_met.y1:_met.y0));
      try{ (e.currentTarget||_g).setPointerCapture(e.pointerId); }catch(err){}
      dbg("down");
    }
    _g.addEventListener("pointerdown",onDown);
    _dk.addEventListener("pointerdown",onDown);
    function onMove(e){
      if((!_armed&&!_drag)||!_met) return;
      var dy=e.clientY-_startY; _moved=Math.max(_moved,Math.abs(dy));
      if(!_drag){
        if(_moved<10) return;                     // still could be a tap — don't hijack it
        _drag=true; _armed=false;
        // the gesture won: give up any caret the field may have taken
        try{ var af=document.activeElement;
          if(af&&af.tagName==="INPUT"&&_dk.contains(af)) af.blur(); }catch(err){}
        _dk.classList.add("dragging"); window.__cwDragging=true;
        try{ (e.currentTarget||_g).setPointerCapture(e.pointerId); }catch(err){}
      }
      setDockY(Math.max(_met.y2,Math.min(_met.y0,_y0+dy)));   // transform only — no layout
      dbg("move");
    }
    _g.addEventListener("pointermove",onMove);
    _dk.addEventListener("pointermove",onMove);
    function _end(e){
      if(!_drag){ _armed=false; return; }         // never moved — let the tap through untouched
      _drag=false; _armed=false; window.__cwDragging=false; _dk.classList.remove("dragging");
      suppressNextClick();
      dbg("up");
      if(!_met) return;
      if(_moved<8){ setDock(_from===2?1:(_from===0?1:2)); return; }   // grip tap = cycle
      /* Snap by INTENT, not proximity. Nearest-detent looks reasonable until you notice the gap
         between mid and expanded is the full drawer height — 530px on this phone — so anything
         short of a 265px drag fell back to where it started. That is what "resisting" was.
         A deliberate 44px pull now commits to the next detent in that direction, which is how
         every sheet you have ever used behaves. */
      var dyTotal=_startY-((e&&e.clientY)||_startY);        // positive = dragged UP
      var THRESH=44;
      if(dyTotal>THRESH) setDock(Math.min(2,_from+1));       // up  -> open further
      else if(dyTotal<-THRESH) setDock(Math.max(0,_from-1)); // down -> close further
      else setDock(_from);
    }
    _g.addEventListener("pointerup",_end);
    _dk.addEventListener("pointerup",_end);
    /* A cancel is not a tap. Ending without the tap branch stops a cancelled gesture from
       toggling the sheet under the user. */
    _g.addEventListener("pointercancel",function(){
      if(!_drag) return; _drag=false; _dk.classList.remove("dragging"); setDock(_from,false);
    });
    window.addEventListener("resize",function(){
      if(_drag) return;                      // never re-anchor the sheet mid-gesture
      try{ setDock(dockState(),false); }catch(e){}
    });
  }
}catch(e){}

/* Contents of the drawer. Everything here is already on the device — saved places, recents,
   the parked car — it just had nowhere to live except a cramped chip row. */
function renderDockMore(){
  var el=$("dockMore"); if(!el) return;
  var out="";


  /* Suggestions first — the section Apple fills with Siri guesses. Ours is grounded in things
     the app actually knows: an unfinished route, and live hazards on the road around you. */
  var sug=[];
  try{
    if(S.destName && S.route) sug.push({e:"\u21A9",t:"Continue to "+S.destName,
      s:fmtDist(S.route.distance||0)+" \u00b7 resume", go:function(){ setDock(1); openSheet("routeSheet"); }});
    // The compass moved off the map into its own panel, so it needs a way in from the drawer.
    sug.push({e:"\uD83E\uDDED",t:"Compass",
      s:(_declNative?"true north":(_decl!==null&&_declN>=8?"true north \u00b7 calibrated":"magnetic \u00b7 calibrating")),
      go:function(){ setDock(1); openCompass(); }});
    var near=(S.hazards||[]).filter(function(h){
      return S.pos && h && isFinite(h.lat) && distM(S.pos,{lat:h.lat,lng:h.lng})<3200 && notDismissed(h);
    });
    if(near.length){
      var by={};
      near.forEach(function(h){ by[h.type]=(by[h.type]||0)+1; });
      var top=Object.keys(by).sort(function(a,b){return by[b]-by[a];})[0];
      var meta=HZ_META[top]||{emoji:"\u26A0\uFE0F",label:"Hazards"};
      sug.push({e:meta.emoji,t:near.length+" hazard"+(near.length>1?"s":"")+" within 2 mi",
        s:"Most common: "+meta.label, go:function(){ setDock(1); }});
    }
  }catch(e){}
  var out2="";
  if(sug.length){
    out2+='<div class="dm-h">Suggestions</div><div class="dm-list">';
    sug.forEach(function(x,i){
      out2+='<button class="dm-row" data-s="'+i+'"><span class="ri">'+x.e+'</span>'+
            '<span class="rt"><b>'+x.t+'</b><small>'+x.s+'</small></span></button>';
    });
    out2+='</div>';
  }
  out+=out2;

  var places=[];
  if(QK.home) places.push({k:"home",e:"🏠",n:"Home",c:"linear-gradient(135deg,#4FC3F7,#0288D1)",p:QK.home});
  if(QK.work) places.push({k:"work",e:"💼",n:"Work",c:"linear-gradient(135deg,#5C6BC0,#303F9F)",p:QK.work});
  if(QK.park) places.push({k:"park",e:"🅿️",n:"My car",c:"linear-gradient(135deg,#66BB6A,#2E7D32)",p:QK.park});
  // (favorites appended below — every one of these is removable by long-press)
  (QK.favorites||[]).slice(0,6).forEach(function(f){
    places.push({k:"fav",e:"📍",n:f.name||"Saved",c:"linear-gradient(135deg,#FF7A9A,#E5484D)",p:f});
  });
  out+='<div class="dm-h">Places</div>';
  if(places.length){
    out+='<div class="dm-empty" style="padding:0 2px 8px;font-size:11px">Press and hold to unsave</div>';
    out+='<div class="dm-places">';
    places.forEach(function(p,i){
      var d=(S.pos&&isFinite(p.p.lat))?fmtDist(distM(S.pos,{lat:p.p.lat,lng:p.p.lng})):"";
      out+='<button class="dm-place" data-i="'+i+'"><span class="pc" style="background:'+p.c+'">'+p.e+'</span>'+
           '<span class="pn">'+p.n+'</span><span class="pd">'+d+'</span></button>';
    });
    out+='</div>';
  } else {
    out+='<div class="dm-empty">No saved places yet — search somewhere, then save it.</div>';
  }

  var rec=(QK.recents||[]).slice(0,8);
  out+='<div class="dm-h">Recents</div>';
  if(rec.length){
    out+='<div class="dm-empty" style="padding:0 2px 8px;font-size:11px">Press and hold to remove</div>';
    out+='<div class="dm-list">';
    rec.forEach(function(r,i){
      var d=(S.pos&&isFinite(r.lat))?fmtDist(distM(S.pos,{lat:r.lat,lng:r.lng}))+" away":"";
      var ic="\uD83D\uDD52", nm=(r.name||"Place");
      if(QK.home&&Math.abs((QK.home.lat||0)-(r.lat||0))<1e-4) ic="\uD83C\uDFE0";
      else if(QK.work&&Math.abs((QK.work.lat||0)-(r.lat||0))<1e-4) ic="\uD83D\uDCBC";
      else if(/airport|terminal/i.test(nm)) ic="\u2708\uFE0F";
      else if(/mall|shop|store|market/i.test(nm)) ic="\uD83D\uDECD\uFE0F";
      else if(/park|trail|beach/i.test(nm)) ic="\uD83C\uDF33";
      else if(/stadium|field|arena/i.test(nm)) ic="\uD83C\uDFDF\uFE0F";
      out+='<button class="dm-row" data-r="'+i+'"><span class="ri">'+ic+'</span>'+
           '<span class="rt"><b>'+nm+'</b><small>'+d+'</small></span></button>';
    });
    out+='</div>';
  } else {
    out+='<div class="dm-empty">Places you navigate to will show up here.</div>';
  }

  el.innerHTML=out;
  el.querySelectorAll("[data-s]").forEach(function(b){
    b.onclick=function(){ var x=sug[+b.dataset.s]; if(x&&x.go) x.go(); };
  });
  /* Home, Work and saved places could be set but never unset — the only way out was clearing
     site data. Long-press removes any of them, same gesture as recents. */
  el.querySelectorAll(".dm-place").forEach(function(b){
    var held=false,timer=null;
    function unsave(){
      var p=places[+b.dataset.i]; if(!p) return;
      if(p.k==="home") QK.home=null;
      else if(p.k==="work") QK.work=null;
      else if(p.k==="park") QK.park=null;
      else QK.favorites=(QK.favorites||[]).filter(function(f){
        return !(f.name===p.n && Math.abs((f.lat||0)-(p.p.lat||0))<1e-6); });
      saveQK(); renderDockMore(); try{ renderQuick(); }catch(e){}
      toast("Removed "+p.n,2400);
      try{ if(navigator.vibrate) navigator.vibrate(14); }catch(e){}
    }
    b.addEventListener("pointerdown",function(){ held=false; timer=setTimeout(function(){ held=true; unsave(); },550); });
    ["pointerup","pointerleave","pointercancel"].forEach(function(ev){
      b.addEventListener(ev,function(){ clearTimeout(timer); }); });
    b.addEventListener("contextmenu",function(e){ e.preventDefault(); clearTimeout(timer); unsave(); });
    b.onclick=function(){
      if(held){ held=false; return; }
      var p=places[+b.dataset.i]; if(!p)return;
      setDock(1); confirmDestination({lat:p.p.lat,lng:p.p.lng},p.n);
    };
  });
  el.querySelectorAll(".dm-row").forEach(function(b){
    var held=false,timer=null;
    function forget(){
      var r=rec[+b.dataset.r]; if(!r) return;
      QK.recents=(QK.recents||[]).filter(function(x){
        return !(x.name===r.name && Math.abs((x.lat||0)-(r.lat||0))<1e-6);
      });
      saveQK(); renderDockMore(); try{ renderQuick(); }catch(e){}
      toast("Removed \u201C"+(r.name||"place")+"\u201D from recents",2600);
      try{ if(navigator.vibrate) navigator.vibrate(14); }catch(e){}
    }
    function start(){ held=false; timer=setTimeout(function(){ held=true; forget(); },550); }
    function cancel(){ clearTimeout(timer); }
    b.addEventListener("pointerdown",start);
    b.addEventListener("pointerup",cancel);
    b.addEventListener("pointerleave",cancel);
    b.addEventListener("pointercancel",cancel);
    b.addEventListener("contextmenu",function(e){ e.preventDefault(); cancel(); forget(); });
    b.onclick=function(){
      if(held){ held=false; return; }          // the press already deleted it
      var r=rec[+b.dataset.r]; if(!r)return;
      setDock(1); confirmDestination({lat:r.lat,lng:r.lng},r.name);
    };
  });
}
/* Anything that shows or hides a stacked element has to re-measure, or the next element down
   keeps reserving space for something that is no longer on screen. */
try{
  var _loPend=false;
  var _mo=new MutationObserver(function(){
    if(_loPend) return; _loPend=true;
    requestAnimationFrame(function(){ _loPend=false; try{layout();}catch(e){} });
  });
  _mo.observe(document.body,{attributes:true,attributeFilter:["class"]});
}catch(e){}
/* Every hazard is a DOM marker, and MapLibre repositions all of them on every frame of every
   pan. At 58 reports that is 58 style writes per frame competing with the map itself. Markers
   outside the viewport cannot be seen, so hide them — hidden elements still get repositioned but
   cost nothing to paint, which is where the time actually goes. */
function cullMarkers(){
  try{
    if(!map||!S.mapReady) return;
    var b=map.getBounds();
    if(!b) return;
    var pad=0.02;
    var w=b.getWest()-pad, e=b.getEast()+pad, so=b.getSouth()-pad, n=b.getNorth()+pad;
    /* Culling used to be skipped mid-gesture because everything was hidden anyway. Markers stay
       visible now, so the viewport cull has to keep running — it is what keeps the paint cost
       proportional to what is actually on screen. */
    (S.hazards||[]).forEach(function(h){
      if(!h||!h._marker) return;
      var vis=(h.lng>=w&&h.lng<=e&&h.lat>=so&&h.lat<=n);
      var el=h._marker.getElement&&h._marker.getElement();
      if(el && el.style.visibility!==(vis?"":"hidden")) el.style.visibility=vis?"":"hidden";
    });
  }catch(e){}
}
try{
  var _cullT=null;
  window.addEventListener("load",function(){
    try{
      /* Culling on moveend only helped AFTER the gesture. During a pan, pinch or rotate MapLibre
         repositions every marker on every frame — 58 DOM elements fighting the map for the main
         thread, which is exactly the sluggish drag the driver feels. Park them for the duration
         of the gesture and bring them back when the hand comes off. */
      /* v248: stop hiding them. The cost we were paying for was PAINT — 27px circles with a
         blur-8 box-shadow, recomposited every frame of a drag. Promoting the markers to their
         own GPU layer for the duration of the gesture buys back the same frames without the
         markers vanishing, which is a worse experience than a slightly heavier drag: a driver
         panning to look at a hazard watched it disappear the moment they touched the screen. */
      map.on("movestart",function(){
        try{
          if(S._mkHidden) return; S._mkHidden=true;
          (S.hazards||[]).forEach(function(h){
            var el=h&&h._marker&&h._marker.getElement&&h._marker.getElement();
            if(el){ el.style.willChange="transform"; el.style.contain="layout paint"; }
          });
        }catch(e){}
      });
      function _unpark(){
        S._mkHidden=false;
        /* Drop the layer promotion when the gesture ends — leaving will-change on permanently
           keeps every marker in its own compositor layer, which costs memory for no benefit
           while the map is still. */
        try{
          (S.hazards||[]).forEach(function(h){
            var el=h&&h._marker&&h._marker.getElement&&h._marker.getElement();
            if(el){ el.style.willChange=""; el.style.contain=""; el.style.visibility=""; }
          });
        }catch(e){}
        clearTimeout(_cullT); _cullT=setTimeout(cullMarkers,60);
      }
      map.on("moveend",_unpark);
      map.on("zoomend",_unpark);
      map.on("rotateend",_unpark);
      map.on("pitchend",_unpark);
    }catch(e){}
  });
}catch(e){}
function layout(){
  try{ document.documentElement.style.setProperty("--hdrH",($("hdr").offsetHeight+10)+"px"); }catch{}
  /* The FAB rail is anchored to the dock, so the dock has to be measured too — and it reports
     zero while driving, when the dock slides off screen and the rail should reclaim that space. */
  try{
    var d=$("dock"), hh=0;
    if(d && !document.body.classList.contains("driving")){
      var yy=parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--dockY"))||0;
      hh=Math.max(DOCK_MIN, d.offsetHeight-yy);
    }
    document.documentElement.style.setProperty("--dockH",hh+"px");
    /* Toasts, the confirm bar and the install banner all used to sit at fixed offsets that
       predated the dock, so they landed on top of the speedometer cluster. Measure the cluster
       and let them stack above it. */
    var cl=$("cluster"), ch=0;
    if(cl && getComputedStyle(cl).display!=="none") ch=cl.offsetHeight;
    document.documentElement.style.setProperty("--clusterH",ch+"px");
  }catch{}
}
try{ window.addEventListener("resize",function(){ try{ if(!window.__cwDragging) layout(); }catch(e){} }); }catch(e){}
window.addEventListener("resize",layout); setTimeout(layout,300); setTimeout(layout,1500);
function closeAllUI(){
  closeSheets();
  $("hud").style.display="none";
  $("sosConfirm").style.display="none";
  if($("satPreview").style.display==="block"){cancelAnimationFrame(orbitRAF);if(satMapObj){satMapObj.remove();satMapObj=null;}$("satPreview").style.display="none";}
}
let histOpen=false;
function pushUI(){try{if(!histOpen){history.pushState({cw:1},"");histOpen=true;}}catch{}}
window.addEventListener("popstate",()=>{histOpen=false;closeAllUI();});


/* ═══════════ v6: Apple-style driving view — maneuver glyphs + lane guidance ═══════════ */
// Factored banner paint — used for the live step AND for peek-ahead previews. Identical
// output to the old inline code when called with the live step, so normal nav is unchanged.
function paintManeuver(step, distText, idx, gateDist){
  $("nbDist").textContent=distText;
  const destBig=step.destinations?String(step.destinations).split(",")[0].split(";")[0].trim():null;
  $("nbInstr").textContent=destBig||stepText(step);
  const ref=step.ref?String(step.ref).split(";")[0].trim():"";
  if(ref){$("nbRef").innerHTML=shieldHTML(ref);$("nbRef").style.cssText="display:flex;background:none;padding:0";}else $("nbRef").style.display="none";
  const rn=step.name||"";
  if(rn){$("roadName").textContent=rn;
    if(ref){$("roadRef").innerHTML=shieldHTML(ref);$("roadRef").style.cssText="display:flex;background:none;padding:0;min-width:auto;height:auto";}
    else $("roadRef").style.display="none";
    $("roadPill").style.display="flex";
  } else $("roadPill").style.display="none";
  $("nbGlyph").textContent=maneuverGlyph(step);
  if(step.exits){$("nbExit").textContent="Exit "+String(step.exits).split(";")[0];$("nbExit").style.display="block";}
  else $("nbExit").style.display="none";
  renderLanes(step, gateDist, idx);
  // Auto-collapse when no turn is imminent so the driver sees the map ahead. Hysteresis: expand
  // under ~0.28mi, collapse back over ~0.38mi. Never collapse while peeking (preview needs full).
  try{
    const bn=$("navbanner"); if(bn){
      if(gateDist===undefined || S.peekIdx!=null){ bn.classList.remove("nb-collapsed"); }
      else {
        const mi=gateDist/1609.34;
        if(mi<0.28) S._bnFull=true;
        else if(mi>0.38) S._bnFull=false;
        bn.classList.toggle("nb-collapsed", !S._bnFull);
      }
    }
  }catch(e){}
}
// ── Peek-ahead: step through upcoming maneuvers with ‹ › then auto-return to the live step ──
let _peekTimer=null;
function _peekChrome(){
  const bn=$("navbanner"); if(!bn) return null;
  let c=$("peekChrome");
  if(!c){
    c=document.createElement("div"); c.id="peekChrome";
    c.innerHTML=
      '<button id="peekPrev" aria-label="Previous step" style="position:absolute;left:-2px;top:50%;transform:translateY(-50%);width:34px;height:44px;border:none;background:transparent;color:var(--nav-accent);font-size:26px;font-weight:800;opacity:.85">‹</button>'+
      '<button id="peekNext" aria-label="Next step" style="position:absolute;right:-2px;top:50%;transform:translateY(-50%);width:34px;height:44px;border:none;background:transparent;color:var(--nav-accent);font-size:26px;font-weight:800;opacity:.85">›</button>'+
      '<div id="peekTag" style="display:none;position:absolute;left:50%;bottom:-11px;transform:translateX(-50%);background:var(--nav-accent);color:#08131f;font-size:10px;font-weight:800;letter-spacing:.4px;padding:3px 10px;border-radius:20px;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,.3)">PREVIEW · tap for live</div>';
    bn.appendChild(c);
    c.querySelector("#peekNext").onclick=(e)=>{ e.stopPropagation(); peekStep(1); };
    c.querySelector("#peekPrev").onclick=(e)=>{ e.stopPropagation(); peekStep(-1); };
    c.querySelector("#peekTag").onclick=(e)=>{ e.stopPropagation(); clearPeek(); };
  }
  return c;
}
function peekStep(dir){
  if(!S.navigating||!S.steps||!S.steps.length) return;
  const base=(S.peekIdx==null)?S.stepIdx:S.peekIdx;
  peekTo(base+dir);
}
/* ═══════════ full turn list ═══════════
   The banner only ever showed one instruction at a time, so there was no way to see the shape
   of the drive — which lane to be in three turns from now, whether the next exit is the one.
   This is the whole remaining route: current maneuver pinned at the top, every turn after it
   scrollable beneath, distance and street per row. Tapping a row peeks the map at that turn,
   reusing peekTo, so the list and the map stay in step. */
function turnRowHTML(st,dist,isCur){
  var badge="";
  try{
    var ex=st.exits||(st.maneuver&&st.maneuver.exit);
    if(ex) badge='<span class="tbadge">Exit '+String(ex).split(";")[0]+'</span>';
    else if(st.ref) badge='<span class="tbadge">'+String(st.ref).split(";")[0]+'</span>';
  }catch(e){}
  var name=st.name||(st.maneuver&&st.maneuver.type==="arrive"?(S.destName||"Destination"):"Continue");
  return '<span class="tg">'+maneuverGlyph(st)+'</span>'+
         '<span style="min-width:0"><span class="td">'+dist+'</span>'+
         '<div class="tn">'+String(name).replace(/</g,"&lt;")+'</div></span>'+badge;
}
function renderTurnList(){
  var head=$("turnHead"), list=$("turnList");
  if(!list||!S.steps||!S.steps.length) return;
  var cur=S.steps[S.stepIdx];
  if(cur){ $("turnHeadIcon").textContent=maneuverGlyph(cur); $("turnHeadText").textContent=stepText(cur); }
  list.innerHTML="";
  for(var i=S.stepIdx;i<S.steps.length;i++){
    var st=S.steps[i];
    // distance shown is the leg leading INTO this turn, matching how the banner counts down
    var d=st.distance||0;
    if(i===S.stepIdx && S.pos && st.maneuver && st.maneuver.location){
      try{ d=distM(S.pos,{lat:st.maneuver.location[1],lng:st.maneuver.location[0]}); }catch(e){}
    }
    var row=document.createElement("div");
    row.className="turn-row"+(i===S.stepIdx?" cur":"");
    row.innerHTML=turnRowHTML(st,fmtDist(d),i===S.stepIdx);
    (function(idx){ row.onclick=function(){ try{ peekTo(idx); }catch(e){} closeTurnList(); }; })(i);
    list.appendChild(row);
  }
}
function openTurnList(){
  if(!S.navigating||!S.steps||!S.steps.length){ toast("Start navigation to see the full route",1800); return; }
  renderTurnList();
  var el=$("turnSheet"); if(!el) return;
  el.classList.add("open"); el.setAttribute("aria-hidden","false");
  try{ pushUI(); }catch(e){}
}
function closeTurnList(){
  var el=$("turnSheet"); if(!el) return;
  el.classList.remove("open"); el.setAttribute("aria-hidden","true");
}
function peekTo(i){
  if(!S.steps||!S.steps.length) return;
  const maxI=S.steps.length-1;
  if(i>maxI) i=maxI;
  if(i<=S.stepIdx){ clearPeek(); return; }          // back at/before the live step → resume live
  S.peekIdx=i;
  let cum=0;
  try{ const loc=S.steps[S.stepIdx].maneuver.location; cum=S.pos?distM(S.pos,{lat:loc[1],lng:loc[0]}):0; }catch(e){}
  for(let k=S.stepIdx;k<i;k++) cum+=(S.steps[k].distance||0);
  paintManeuver(S.steps[i], "in "+fmtDist(cum), i, undefined);   // undefined gate → always show its lanes
  const c=_peekChrome(); if(c){ const t=c.querySelector("#peekTag"); if(t)t.style.display="block"; }
  const bn=$("navbanner"); if(bn) bn.style.outline="2px solid var(--nav-accent)";
  clearTimeout(_peekTimer); _peekTimer=setTimeout(clearPeek,6000);   // auto-return after 6s idle
}
function clearPeek(){
  S.peekIdx=null; clearTimeout(_peekTimer);
  const c=$("peekChrome"); if(c){ const t=c.querySelector("#peekTag"); if(t)t.style.display="none"; }
  const bn=$("navbanner"); if(bn) bn.style.outline="";
  // the live loop repaints the banner from the current step on its next frame
}
// Swipe the instruction banner to step through upcoming maneuvers (same engine as the ‹ ›
// buttons). Google convention: swipe LEFT = look ahead, swipe RIGHT = back. Bound to the
// banner only so it never fights the map; ignores taps, button presses, and vertical scrolls.
function wireBannerSwipe(){
  const bn=$("navbanner"); if(!bn||bn._swipeWired) return; bn._swipeWired=true;
  let x0=0,y0=0,active=false;
  bn.addEventListener("touchstart",(e)=>{
    if(!S.navigating) { active=false; return; }
    if(e.target.closest("button")) { active=false; return; }   // let ‹ › and Share/HUD/End work
    const t=e.touches&&e.touches[0]; if(!t){active=false;return;}
    x0=t.clientX; y0=t.clientY; active=true;
  },{passive:true});
  bn.addEventListener("touchend",(e)=>{
    if(!active) return; active=false;
    const t=e.changedTouches&&e.changedTouches[0]; if(!t) return;
    const dx=t.clientX-x0, dy=t.clientY-y0;
    if(Math.abs(dx)<50 || Math.abs(dx)<Math.abs(dy)*1.4) return;  // needs a real, mostly-horizontal swipe
    peekStep(dx<0 ? 1 : -1);   // swipe left (dx<0) → ahead; swipe right → back
  },{passive:true});
}
try{ wireBannerSwipe(); }catch(e){}
$("turnClose")&&($("turnClose").onclick=function(){ closeTurnList(); });
/* One tap anywhere on the sheet that isn't a turn row or a control sends it back up.
   Rows still peek their turn; the arrow button still works. */
try{
  var _ts=$("turnSheet");
  if(_ts) _ts.addEventListener("click",function(e){
    if(e.target.closest(".turn-row")||e.target.closest("button")) return;
    if(e.target.closest("#turnList")) return;      // don't fight a scroll fling in the list
    closeTurnList();
  });
}catch(e){}
try{
  var _bi=document.querySelector("#navbanner .nb-instr");
  if(_bi){ _bi.style.cursor="pointer"; }          // banner-level handler already opens the list
}catch(e){}
function maneuverGlyph(st){
  const m=st.maneuver,mod=m.modifier||"";
  if(m.type==="arrive")return "⚑";
  if(m.type==="roundabout"||m.type==="rotary")return "⟳";
  if(/uturn/.test(mod))return "⤴";
  if(m.type==="merge")return /left/.test(mod)?"↖":"↗";
  if(m.type==="on ramp"||m.type==="off ramp")return /left/.test(mod)?"↖":"↗";
  if(/sharp left/.test(mod))return "↰";
  if(/sharp right/.test(mod))return "↱";
  if(/slight left/.test(mod))return "↖";
  if(/slight right/.test(mod))return "↗";
  if(/left/.test(mod))return "←";
  if(/right/.test(mod))return "→";
  return "↑";
}
const LANE_GLYPH={straight:"↑",left:"←",right:"→","slight left":"↖","slight right":"↗","sharp left":"↰","sharp right":"↱",uturn:"⤴",merge:"↑",none:"↑"};
function _lanesForStep(idx){
  const st=S.steps&&S.steps[idx]; if(!st||!st.intersections) return null;
  for(const it of st.intersections){ if(it.lanes&&it.lanes.length) return it.lanes; }   // lanes can sit on any intersection of the step
  return null;
}
function renderLanes(st,dNext,idx){
  const row=$("laneRow"); if(!row) return;
  const at=(idx==null?S.stepIdx:idx);
  // OSRM may attach turn lanes to this step OR to the approach (previous step). Check both.
  let lanes=_lanesForStep(at) || _lanesForStep(at-1);
  // show lanes only as you approach the turn (~0.4 mi) — keeps the banner clean the rest of the time
  if(!lanes||!lanes.length || (dNext!==undefined && dNext>650)){ row.style.display="none"; return; }
  row.innerHTML="";
  lanes.forEach(l=>{
    const s=document.createElement("span");
    s.className="lane"+(l.valid?" ok":"");
    s.textContent=LANE_GLYPH[(l.indications&&l.indications[0])||"straight"]||"↑";
    row.appendChild(s);
  });
  row.style.display="flex";
}


/* ═══════════ v7: viewport lock (iOS keyboard shift) + distance-ranked search ═══════════ */
document.addEventListener("focusout",()=>{setTimeout(()=>{window.scrollTo(0,0);document.documentElement.scrollTop=0;document.body.scrollTop=0;},60);});
if(window.visualViewport){
  visualViewport.addEventListener("resize",()=>{ if(visualViewport.height>window.innerHeight-90){window.scrollTo(0,0);} });
}


/* ═══════════ v10: manual approximate geocoding when search comes up empty ═══════════ */
let localityCache=null;
async function getLocality(){
  if(localityCache||!S.pos)return localityCache;
  try{
    const d=await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${S.pos.lat}&lon=${S.pos.lng}&zoom=10`)).json();
    const a=d.address||{};
    localityCache=[a.city||a.town||a.village||a.county,a.state].filter(Boolean).join(", ");
    if(a.country_code) myCountry=String(a.country_code).toUpperCase();   // for the cross-border search filter
  }catch{}
  return localityCache;
}
/* ═══════════ cross-border search filter ═══════════
   In Detroit a 25-mile radius reaches well into Windsor, so "flower bowl" returned Ontario
   bowling alleys a driver would never mean. Filter results to the driver's OWN country rather
   than hardcoding US — worldwide search stays intact for anyone using this outside the States.
   Until the reverse geocode resolves, myCountry is null and nothing is filtered (fail-open). */
var myCountry=null;
function _sameCountry(cc){
  if(!myCountry||!cc) return true;                 // unknown either side → keep it
  return String(cc).toUpperCase()===myCountry;
}
// kick off the lookup early so the country is known before the first search
setTimeout(function(){ try{ if(S.pos) getLocality(); }catch(e){} }, 3000);
// OVERTURE POI FALLBACK — calls the same-origin serverless proxy (key stays server-side),
// normalizes Overture places into the row shape scoreRows() expects. Silent [] if the proxy
// isn't deployed yet, the key/quota is unavailable, or there's no fix — search just uses OSM.
// FOURSQUARE POI LAYER: a second business index alongside Overture. Open datasets (OSM,
// Overture) lag on new/small businesses; Foursquare carries them. Returns [] silently if the
// proxy or key isn't set up, so the app behaves exactly as before without it.
async function foursquarePOIs(q){
  if(!CW_CONFIG.fsqProxy || !S.pos) return [];
  try{
    var u=CW_CONFIG.fsqProxy+"?q="+encodeURIComponent(q)
      +"&lat="+S.pos.lat+"&lon="+S.pos.lng+"&radius_mi=25&limit=15";
    var d=await (await fetchT(u,8000)).json();
    var arr=(d&&d.results)||[];
    return arr.map(function(p){
      return { lat:p.lat, lon:p.lon, type:p.category||"poi", cc:(p.address&&p.address.country_code)||undefined,
        address:{ name:p.name, city:(p.address&&p.address.locality)||undefined },
        display_name:[p.name,(p.address&&p.address.locality)].filter(Boolean).join(", ") };
    }).filter(function(r){ return isFinite(r.lat)&&isFinite(r.lon)&&r.address.name&&_sameCountry(r.cc); });
  }catch(e){ return []; }
}
async function overturePOIs(q){
  if(!CW_CONFIG.placesProxy || !S.pos) return [];
  try{
    var u=CW_CONFIG.placesProxy+"?q="+encodeURIComponent(q)
      +"&lat="+S.pos.lat+"&lon="+S.pos.lng+"&radius_mi=45&mode=name&limit=15";
    var d=await (await fetchT(u,8000)).json();
    var arr=(d&&d.results)||[];
    return arr.map(function(p){
      return { lat:p.lat, lon:p.lon, type:p.category||"poi",
        address:{ name:p.name, city:(p.address&&p.address.locality)||undefined },
        display_name:[p.name,(p.address&&p.address.locality)].filter(Boolean).join(", ") };
    }).filter(function(r){ return isFinite(r.lat)&&isFinite(r.lon)&&r.address.name; });
  }catch(e){ return []; }
}
// gather candidates from 3 free geocoders (structured + free-text Nominatim + Photon), scored & merged
async function geocodeCandidates(q){
  var p=parseAddr(q), out=[];
  var qs=new URLSearchParams({format:"jsonv2",addressdetails:"1",limit:"10"});
  /* With no house number or street, "street" is an empty param and the structured search asks
     for nothing at all in that city. Fall back to the place name as free text. */
  qs.set("street",[p.housenumber,p.street].filter(Boolean).join(" "));
  /* The structured pass used to fall back to the DRIVER'S OWN city when the query named none —
     so "Godfrey Hotel Chicago" was literally sent to Nominatim as "Godfrey Hotel, in Detroit".
     That is a hard filter, not a bias: a Chicago hotel can never come back from it. Leave the
     city empty and let the proximity viewbox do the biasing, which is what it is for. */
  if(p.city)qs.set("city",p.city);
  if(p.state)qs.set("state",p.state);
  if(p.postalcode)qs.set("postalcode",p.postalcode);
  // bias every source toward where the user actually is → surfaces the NEAREST place they mean
  var b=S.pos, vb="", ll="";
  if(b){ var dd=0.7; vb="&viewbox="+(b.lng-dd)+","+(b.lat+dd)+","+(b.lng+dd)+","+(b.lat-dd); ll="&lat="+b.lat+"&lon="+b.lng; }
  var jobs=[
    fetchT("https://nominatim.openstreetmap.org/search?"+qs+vb,8000).then(r=>r.json()).then(a=>{out=out.concat(a||[]);}).catch(()=>{}),
    fetchT("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=12"+vb+"&q="+encodeURIComponent(q),8000).then(r=>r.json()).then(a=>{out=out.concat(a||[]);}).catch(()=>{}),
    fetchT("https://photon.komoot.io/api/?limit=12&lang=en"+ll+"&q="+encodeURIComponent(q),8000).then(r=>r.json()).then(d=>{out=out.concat(photonToRows(d.features||[]));}).catch(()=>{})
  ];
  // STRICTLY LOCAL pass: bounded=1 confines results to the box around the driver, so a nearby
  // business (bar, shop, venue) surfaces even when global indexes rank far-away name matches higher.
  if(b && !p.city && !p.state && !p.postalcode){
    var d2=0.45, vb2="&viewbox="+(b.lng-d2)+","+(b.lat+d2)+","+(b.lng+d2)+","+(b.lat-d2)+"&bounded=1";
    jobs.push(fetchT("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=12"+vb2+"&q="+encodeURIComponent(q),8000)
      .then(r=>r.json()).then(a=>{out=out.concat(a||[]);}).catch(()=>{}));
    jobs.push(fetchT("https://photon.komoot.io/api/?limit=12&lang=en&zoom=12"+ll+"&q="+encodeURIComponent(q),8000)
      .then(r=>r.json()).then(d=>{out=out.concat(photonToRows(d.features||[]));}).catch(()=>{}));
    // OVERTURE POI LAYER: Overture (OSM + Meta + Microsoft + …) carries local businesses
    // raw OSM lacks. Proximity-only, so it runs exactly here — a name search near the driver.
    jobs.push(overturePOIs(q).then(rows=>{out=out.concat(rows);}).catch(()=>{}));
    // Second POI index — fills Overture/OSM gaps on newer or smaller businesses.
    jobs.push(foursquarePOIs(q).then(rows=>{out=out.concat(rows);}).catch(()=>{}));
  }
  /* CITY-SPLIT PASS. The real reason "Godfrey chicago" kept returning Detroit: every pass
     treats the whole string as one name, and free-text ranking on a 2-word query is dominated
     by whichever index has more nearby matches — which downtown Detroit always will. Splitting
     the query so the trailing word becomes a STRUCTURED city ("Godfrey" in city "chicago")
     asks a different question entirely, and Nominatim answers it directly. Tried for the last
     one and last two words, since city names like "ann arbor" and "new york" are two tokens. */
  /* v258: the !p.city guard was killing this on the exact query it was written for. parseAddr
     DOES extract a bare trailing city from a comma-less string, so "The Godfrey Hotel Chicago"
     arrives with p.city already set — the split pass was skipped, and the structured pass above
     had no street to go with the city, so it searched for nothing in Chicago. Run the split
     regardless; duplicates are deduped and rescored anyway. */
  var _tk=q.trim().split(/\s+/);
  if(_tk.length>=2){
    [1,2].forEach(function(n){
      if(_tk.length<=n) return;
      var name=_tk.slice(0,_tk.length-n).join(" "), city=_tk.slice(-n).join(" ");
      if(name.length<2 || city.length<3) return;
      /* MUST be structured-only. Nominatim rejects any request that mixes free-form q with
         structured fields, so the q+city version of this pass returned nothing every single
         time it ran — which is why adding it in v256 changed absolutely nothing on screen.
         "amenity" is the structured field for a named place, and it pairs legally with city. */
      var sq=new URLSearchParams({format:"jsonv2",addressdetails:"1",limit:"6",amenity:name,city:city});
      jobs.push(fetchT("https://nominatim.openstreetmap.org/search?"+sq,8000)
        .then(r=>r.json()).then(a=>{out=out.concat(a||[]);}).catch(()=>{}));
    });
  }

  /* UNBIASED PASS. Every request above carries either a viewbox or a lat/lon, so all of them
     lean local — and when a driver names a distant place the correct answer was never in the
     candidate set for scoring to find. One pass with no geographic hint at all guarantees the
     far result is at least present; scoreRows still has to decide it beats the local ones. */
  jobs.push(fetchT("https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&q="+encodeURIComponent(q),8000)
    .then(r=>r.json()).then(a=>{out=out.concat(a||[]);}).catch(()=>{}));
  jobs.push(fetchT("https://photon.komoot.io/api/?limit=10&lang=en&q="+encodeURIComponent(q),8000)
    .then(r=>r.json()).then(d=>{out=out.concat(photonToRows(d.features||[]));}).catch(()=>{}));

  await Promise.all(jobs);
  return scoreRows(out,q);
}
// ── CROWD CROSS-CHECK: has the network already resolved this exact search near here? ──
async function crowdLookup(q){
  if(!S.sb.url||!S.sb.key||!S.pos)return null;
  try{
    const key=q.trim().toLowerCase();
    const rows=await (await fetch(`${S.sb.url}/rest/v1/geo_picks?q=eq.${encodeURIComponent(key)}&select=lat,lng,label&limit=50`,{headers:sbH()})).json();
    if(!Array.isArray(rows)||rows.length<2)return null;   // need at least 2 drivers agreeing
    // cluster picks ~60m; take the biggest cluster that's within 120mi of the user
    const cl=[];
    rows.forEach(r=>{ if(r.lat==null)return; let g=cl.find(c=>distM(c,{lat:r.lat,lng:r.lng})<60); if(g){g.n++;} else cl.push({lat:r.lat,lng:r.lng,label:r.label,n:1}); });
    cl.sort((a,b)=>b.n-a.n);
    const top=cl[0];
    if(top && top.n>=2 && distM(S.pos,top)/1609.34 < 120) return top;   // strong local consensus
  }catch(e){}
  return null;
}
function crowdSave(q,res){
  if(!S.sb.url||!S.sb.key)return;
  try{ fetch(`${S.sb.url}/rest/v1/geo_picks`,{method:"POST",headers:sbH({"Content-Type":"application/json"}),body:JSON.stringify({q:q.trim().toLowerCase(),lat:res.lat,lng:res.lng,label:res.label||q})}); }catch(e){}
}
/* The suggestion pipeline, minus the rendering — so the Search button and the typeahead can
   never disagree about what "Godfrey chicago" means. Deliberately shares _placeScore and the
   city-split pass with spSearch rather than reimplementing either. */
async function placeCandidates(q){
  var pool=[];
  var toks=q.toLowerCase().replace(/['\u2019]/g,"").split(/\s+/).filter(function(w){return w.length>1;});
  var typedPlace=(function(){ try{ var p=parseAddr(q); return !!(p.city||p.state||p.postalcode); }catch(e){ return false; } })();
  function add(rows){ if(rows&&rows.length) pool=pool.concat(rows); }

  /* v265: this list was missing the two POI indexes, and they are almost certainly the ones
     that find "The Godfrey Hotel Chicago 127" in the typeahead — which is why the Search button
     kept disagreeing with the suggestions above it. If the goal is that the two can never
     disagree, this has to query the same sources, not a subset of them. */
  var _ac=null; try{ _ac=new AbortController(); }catch(e){}
  var _sig=_ac?_ac.signal:undefined;
  var counts={photon:0,unbiased:0,fsq:0,overture:0,split:0,citybias:0};
  /* The POI indexes are radius searches around the driver. Held back rather than merged
     immediately, because if the query names a distant city they are not weak evidence — they
     are the wrong question, and no ranking tweak fixes that. See below. */
  var _local={fsq:[],ov:[]};
  var _farCity=false;
  var jobs=[
    fetch(_photonURL(q)).then(function(r){return r.json();})
      .then(function(d){ var m=_photonMap(d); counts.photon=m.length; add(m); }).catch(function(){}),
    /* Unbiased: no lat/lon at all, so a distant named place can actually reach the pool. */
    fetch("https://photon.komoot.io/api/?limit=10&lang=en&q="+encodeURIComponent(q))
      .then(function(r){return r.json();})
      .then(function(d){ var m=_photonMap(d); counts.unbiased=m.length; add(m); }).catch(function(){}),
    fsqSuggest(q,_sig).then(function(r){ counts.fsq=(r||[]).length; _local.fsq=r||[]; }).catch(function(){}),
    overtureSuggest(q,_sig).then(function(r){ counts.overture=(r||[]).length; _local.ov=r||[]; }).catch(function(){})
  ];
  /* CITY-BIASED PASS. The counts told us what was wrong: photon:1 unbiased:1 fsq:9 overture:0.
     Nine of the thirteen rows came from the POI index doing a category match on the word
     "hotel" near the driver, and the correct answer was never in the pool at all. Both photon
     passes returned a single row because a five-word string is a poor free-text query.
     So: resolve the trailing city to coordinates, then ask the same sources again with the
     search biased THERE instead of here. "The Godfrey Hotel" near Chicago is a question these
     services answer well; "The Godfrey Hotel Chicago" near Detroit is not. */
  var tk=q.trim().split(/\s+/);
  if(tk.length>=2){
    jobs.push((async function(){
      for(var n=1;n<=2;n++){
        if(tk.length<=n) break;
        var nm=tk.slice(0,tk.length-n).join(" "), city=tk.slice(-n).join(" ");
        if(nm.length<2 || city.length<3 || GENERIC_WORDS.test(city)) continue;
        try{
          /* v270 — the actual reason nothing I built for this ever worked.
             Every fix since v256 — the city split, the amenity pass, the city-bias lookup —
             went through Nominatim. Nominatim requires an identifying User-Agent and rate-limits
             hard; a browser fetch cannot set User-Agent, so those requests were being refused
             and I was reading empty responses as a ranking problem. The debug counts said so
             every time and I did not hear it: photon:1 unbiased:1 with Nominatim contributing
             nothing, build after build.
             Photon answers browsers without a key and geocodes cities perfectly well. Use it. */
          var cu="https://photon.komoot.io/api/?limit=1&lang=en&osm_tag=place:city&q="+encodeURIComponent(city);
          var cj=await (await fetch(cu)).json();
          var f=(cj&&cj.features&&cj.features[0]);
          if(!f||!f.geometry) continue;
          var clng=+f.geometry.coordinates[0], clat=+f.geometry.coordinates[1];
          if(!isFinite(clat)) continue;
          /* Only worth doing when the named city is somewhere else — otherwise this is just the
             local search again with extra steps. */
          if(S.pos && distM(S.pos,{lat:clat,lng:clng})<40000) continue;
          _farCity=true;   // the driver named a city that is not this one
          var pu="https://photon.komoot.io/api/?limit=8&lang=en&lat="+clat+"&lon="+clng+
                 "&q="+encodeURIComponent(nm);
          var pr=await (await fetch(pu)).json();
          var rows=_photonMap(pr);
          counts.citybias=(counts.citybias||0)+rows.length;
          add(rows);
        }catch(e){}
      }
    })());
    [1,2].forEach(function(n){
      if(tk.length<=n) return;
      var nm=tk.slice(0,tk.length-n).join(" "), city=tk.slice(-n).join(" ");
      if(nm.length<2 || city.length<3 || GENERIC_WORDS.test(city)) return;
      /* Also Photon: "<name> <city>" as free text with no local bias. Cheap, and it covers the
         case where the city-lookup above misses. */
      var u="https://photon.komoot.io/api/?limit=8&lang=en&q="+encodeURIComponent(nm+" "+city);
      jobs.push(fetch(u).then(function(r){return r.json();})
        .then(function(d){ var m=_photonMap(d); counts.split+=m.length; add(m); })
        .catch(function(){}));
    });
  }
  await Promise.all(jobs);
  /* THE DECISION. Nine of thirteen rows were Detroit hotels, because the POI index matched the
     word "hotel" within a few miles of the driver. I have tried three times to out-rank them
     and it has not worked, because they are not badly ranked — they are irrelevant. If someone
     types a city 280 miles away, results from a five-mile radius are noise by definition, and
     the right move is to exclude them rather than to score them down.
     So: when a distant city is named, the local POI indexes sit this one out. They still lead
     for every ordinary local search, which is the overwhelming majority. */
  if(!_farCity){ add(_local.fsq); add(_local.ov); }
  else { counts.fsq=-counts.fsq; counts.overture=-counts.overture; }   // negative = excluded
  /* Report what each source returned, so the next time this disagrees with the typeahead we can
     see WHICH source is missing rather than guessing at the ranking again. */
  try{ _searchTxt="search   "+Object.keys(counts).map(function(k){return k+":"+counts[k];}).join(" "); }catch(e){}
  if(!pool.length) return [];
  var out=dedupeSuggest(pool).map(function(r){
    var withD=Object.assign({},r,{_d:S.pos?distM(S.pos,r):undefined});
    return Object.assign({},withD,{_sc:_placeScore(withD,toks,typedPlace)});
  });
  out.sort(function(a,b){ return b._sc-a._sc; });
  return out.slice(0,10);
}
async function forceGeocode(q){
  $("results").style.display="none";
  // offline or instant: use a previously-cached result if we have one
  const cached=lookupCachedGeocode(q);
  if(cached && (!navigator.onLine || true)){
    if(!navigator.onLine){ confirmDestination(cached,q); toast("📍 Using saved location (offline)",3000); return; }
  }
  if(!navigator.onLine){
    if(cached){ confirmDestination(cached,q); toast("📍 Saved location (offline)",3000); return; }
    var local=lookupAnyLocal(q);
    if(local){ confirmDestination(local,q); toast("📍 "+local.label+" — from places saved on this phone",3400); return; }
    /* Nothing the driver has personally touched matches. Two device-side sources know about
       places they have never searched for. Try the AREA HARVEST first: it is captured from
       wherever this driver actually lives, whereas the bundled index below is a static
       per-city file that has to be generated and shipped — it covers only Detroit and today
       it 404s, which is why offline search used to dead-end here. */
    (async function(){
      try{
        var loc=await searchAreaPlaces(q,1);
        var p=loc&&loc[0];
        if(p){ confirmDestination({lat:p.lat,lng:p.lng},p.name);
               toast("\uD83D\uDCCD "+p.name+" — saved map data for your area",3400); return; }
      }catch(e){}
      try{
        var idx=await loadPoiIndex();
        var hit = idx ? searchPoiIndex(q,1)[0] : null;
        if(hit){ confirmDestination({lat:hit.lat,lng:hit.lng},hit.name);
                 toast("\uD83D\uDCCD "+hit.name+" — offline map data",3400); return; }
      }catch(e){}
      toast("Offline — no saved location for \""+q+"\" yet. Places near you save automatically on wifi.",5000);
    })();
    return;
  }
  toast("Locating address…",1600);
  // the network may already know this one — skip the guesswork entirely
  const crowd=await crowdLookup(q);
  if(crowd){ confirmDestination({lat:crowd.lat,lng:crowd.lng,label:crowd.label||q},q); toast("📍 Matched to where most drivers go",2600); return; }
  const want=parseAddr(q);
  /* v264: reading the typeahead's CACHE was too fragile — it only hits when the exact same
     string was typed into the panel, and the Search button is often pressed with a differently
     cased or trimmed query, so it silently fell through to the old pipeline every time. Run the
     suggestion pipeline directly instead. Same sources, same city-aware ranking, no dependence
     on what happened to be cached. */
  let cands=null;
  try{
    var _rows=await placeCandidates(q);
    if(_rows && _rows.length) cands=_rows.map(function(r){
      return {name:r.name, display_name:(r.name+(r.label?(", "+r.label):"")), lat:r.lat, lon:r.lng};
    });
  }catch(e){}
  if(!cands || !cands.length) cands=await geocodeCandidates(q);
  // Places often carry a longer official name than what people type ("Godfrey rooftop" vs
  // "I|O Godfrey Rooftop Lounge"). If the full phrase finds nothing, retry on the distinctive
  // words only — the same retry the search panel does.
  if(!cands || !cands.filter(c=>c.sc>-30).length){
    const strongToks=q.split(/\s+/).filter(w=>w.length>2 && !GENERIC_WORDS.test(w));
    if(strongToks.length && strongToks.join(" ").toLowerCase()!==q.trim().toLowerCase()){
      try{
        const retry=await geocodeCandidates(strongToks.join(" "));
        if(retry && retry.filter(c=>c.sc>-30).length){
          cands=retry;
          toast('Searching "'+strongToks.join(" ")+'"…',2000);
        }
      }catch(e){}
    }
  }
  // if a house number was typed, prefer exact-house matches; keep the rest as fallback options
  const exact=want.housenumber ? cands.filter(c=>c.exactHouse) : [];
  let pool=(exact.length?exact:cands).filter(c=>c.sc>-30);
  // local intent (no city/state/ZIP typed): don't show results in other states/countries
  if(!want.city && !want.state && !want.postalcode && S.pos){
    const near=pool.filter(c=>distM(S.pos,{lat:c.lat,lng:c.lng})/1609.34 <= 120);
    if(near.length) pool=near;
  }
  if(!pool.length){ toast("Couldn't locate that — add a city or ZIP and try again.",3600); return; }
  // confident: one clear exact-house winner well ahead of the next → go straight in
  const confident = pool[0].exactHouse && (pool.length===1 || pool[0].sc-pool[1].sc>40);
  if(confident){ confirmDestination({lat:pool[0].lat,lng:pool[0].lng,label:pool[0].label},q); return; }
  // otherwise: SHOW OPTIONS to choose from
  showGeoPicker(pool.slice(0,6),q);
}


/* ═══════════ v14: precision geocoding engine ═══════════ */
const US_STATES={alabama:"AL",alaska:"AK",arizona:"AZ",arkansas:"AR",california:"CA",colorado:"CO",connecticut:"CT",delaware:"DE",florida:"FL",georgia:"GA",hawaii:"HI",idaho:"ID",illinois:"IL",indiana:"IN",iowa:"IA",kansas:"KS",kentucky:"KY",louisiana:"LA",maine:"ME",maryland:"MD",massachusetts:"MA",michigan:"MI",minnesota:"MN",mississippi:"MS",missouri:"MO",montana:"MT",nebraska:"NE",nevada:"NV",ohio:"OH",oklahoma:"OK",oregon:"OR",pennsylvania:"PA",tennessee:"TN",texas:"TX",utah:"UT",vermont:"VT",virginia:"VA",washington:"WA",wisconsin:"WI",wyoming:"WY"};
const SUF={st:"street",str:"street",ave:"avenue",av:"avenue",rd:"road",dr:"drive",blvd:"boulevard",ln:"lane",ct:"court",pl:"place",hwy:"highway",pkwy:"parkway",cir:"circle",ter:"terrace",trl:"trail",sq:"square"};
function normStreet(s){
  return (s||"").toLowerCase().replace(/[.,'\u2019]/g,"").split(/\s+/)
    .map(function(w){return SUF[w]||w;})
    .filter(function(w){return ["n","s","e","w","north","south","east","west"].indexOf(w)===-1;})
    .join(" ").trim();
}
function parseAddr(q){
  var s=q.trim(), out={};
  // pull the house number FIRST (leading digits), so it's never mistaken for a ZIP
  var hn=s.match(/^(\d+[a-z]?)\s+(.+)$/i);
  var rest=s;
  if(hn){ out.housenumber=hn[1]; rest=hn[2]; }
  // now a trailing 5-digit group in the remainder is a ZIP
  var zip=rest.match(/\b(\d{5})(?:-\d{4})?\b/); if(zip){out.postalcode=zip[1];rest=rest.replace(zip[0],"").trim();}
  // strip a trailing state (2-letter or full name), then city, comma-separated OR space-separated
  var parts=rest.split(",").map(function(x){return x.trim();}).filter(Boolean);
  if(parts.length>=2){
    var last=parts[parts.length-1].toLowerCase().replace(/\./g,"");
    var abbr=US_STATES[last]||(/^[a-z]{2}$/.test(last)?last.toUpperCase():null);
    if(abbr){out.state=abbr; if(parts.length>=3)out.city=parts[parts.length-2]; else if(parts.length===2)out.city=parts[0].split(/\s+/).slice(1).join(" ")||undefined;}
    else out.city=parts[parts.length-1];
    out.street=parts[0];
  } else {
    // no commas — parse trailing "CITY ST" out of a single token run
    var toks=rest.split(/\s+/);
    var lastTok=(toks[toks.length-1]||"").toLowerCase().replace(/\./g,"");
    var stAbbr=US_STATES[lastTok]||(/^[a-z]{2}$/.test(lastTok)?lastTok.toUpperCase():null);
    if(stAbbr && toks.length>=3){
      out.state=stAbbr; toks.pop();
      // heuristic: last remaining token is the city (e.g. "...Ave Wayne" -> city Wayne)
      out.city=toks.pop();
      out.street=toks.join(" ");
    } else {
      out.street=rest;
    }
  }
  if(!out.street)out.street=rest;
  return out;
}
function photonToRows(feats){
  return feats.map(function(f){var p=f.properties,co=f.geometry.coordinates;
    return {lat:co[1],lon:co[0],type:p.osm_value||p.type,
      address:{house_number:p.housenumber,road:p.street||p.name,city:p.city||p.town||p.village,state:p.state,postcode:p.postcode},
      display_name:[p.name,p.street,p.city,p.state,p.postcode].filter(Boolean).join(", ")};});
}
// Collapse the same real place arriving from two sources (e.g. Overture + OSM both
// return "Hamilton's Propane" a few dozen meters apart). Same place = within ~150m AND
// one name contains the other. Keep the higher score (list is pre-sorted, so the first
// seen wins), but show the LONGER label since it carries the fuller address to tell
// near-identical spots apart. Coords barely differ (<150m), so navigation is unaffected.
function dedupeNear(list){
  var out=[];
  var nm=function(lb){ return String(lb||"").split(",")[0].toLowerCase().replace(/['\u2019]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim(); };
  list.forEach(function(r){
    var rn=nm(r.label);
    for(var i=0;i<out.length;i++){
      var k=out[i];
      if(distM({lat:r.lat,lng:r.lng},{lat:k.lat,lng:k.lng})<=150){
        var kn=nm(k.label);
        if(rn&&kn&&(rn===kn||rn.indexOf(kn)>-1||kn.indexOf(rn)>-1)){
          if(String(r.label||"").length>String(k.label||"").length){ k.label=r.label; k.lat=r.lat; k.lng=r.lng; }
          k.sc=Math.max(k.sc,r.sc);
          return; // merged into an existing kept row
        }
      }
    }
    out.push(r);
  });
  return out;
}
function scoreRows(rows,q){
  if(!rows||!rows.length)return [];
  var want=parseAddr(q), wStreet=normStreet(want.street), seen={};
  var scored=rows.map(function(r){
    var a=r.address||{}, sc=0, exactHouse=false;
    if(want.housenumber){
      if(a.house_number===want.housenumber){sc+=100;exactHouse=true;}
      else if(a.house_number)sc-=60;      // wrong house number = strongly penalized
      else sc-=45;                         // no house number (bare street) = strongly penalized
    }
    var rStreet=normStreet(a.road||a.pedestrian||a.name);
    if(wStreet&&rStreet){
      if(rStreet===wStreet)sc+=60;
      else if(rStreet.indexOf(wStreet)>-1||wStreet.indexOf(rStreet)>-1)sc+=34;
      else sc-=18;
    }
    if(want.postalcode&&a.postcode){ sc+=(String(a.postcode).indexOf(want.postalcode)===0)?55:-30; }
    var rCity=a.city||a.town||a.village;
    if(want.city&&rCity){ sc+= normStreet(rCity)===normStreet(want.city)?42:-22; }
    if(want.state&&a.state){
      var st=US_STATES[String(a.state).toLowerCase()]||a.state;
      sc+= st===want.state?26:-30;
    }
    var t=String(r.type||"").toLowerCase();
    if(["house","building","address","residential","yes"].indexOf(t)>-1)sc+=18;
    else if(["road","street"].indexOf(t)>-1)sc+=6;
    else if(["university","college","school","hospital","attraction","commercial","retail","supermarket","fuel","restaurant","cafe","pharmacy","bank","hotel","stadium","park","place_of_worship"].indexOf(t)>-1)sc+=22;
    else if(["city","town","state","administrative"].indexOf(t)>-1)sc-=12;
    // NAME MATCH: does the query text appear in the result name? (Wayne State University for "wayne state")
    var label=String(r.display_name||r.name||"").toLowerCase().replace(/['\u2019]/g,"").replace(/[^a-z0-9 ]/g," ");
    var toks=q.toLowerCase().replace(/[^a-z0-9 ]/g,"").split(/\s+/).filter(function(w){return w.length>1;});
    if(toks.length){ var matched=toks.filter(function(tk){return label.indexOf(tk)>-1;}).length; sc+=matched*14; if(matched===toks.length)sc+=42; }
    // PROXIMITY: when the user didn't name a city/state/ZIP they mean somewhere NEAR them.
    // The old capped penalty (-12) let a match 9,000 miles away out-score one down the street.
    if(S.pos){
      var d=distM(S.pos,{lat:+r.lat,lng:+r.lon})/1609.34;
      /* A city named INSIDE a business name — "Godfrey Hotel Chicago" — is not comma-separated,
         so parseAddr never saw it and the query looked purely local. The uncapped distance
         penalty then buried the correct result 280 miles away. If a word the driver typed also
         appears in this result's own city or state, they named the place: allow the distance. */
      var saidWhere = !!(want.city||want.state||want.postalcode);
      if(!saidWhere){
        try{
          var place=String(rCity||"")+" "+String(a.state||"")+" "+String(a.country||"");
          place=place.toLowerCase();
          for(var qi=0; qi<toks.length; qi++){
            if(toks[qi].length>3 && place.indexOf(toks[qi])>-1){ saidWhere=true; break; }
          }
        }catch(e){}
      }
      if(want.housenumber){ sc += d<60?Math.max(0,6-d/12):-8; }
      else if(saidWhere){ sc += Math.max(-25, 40 - d*0.6); }      // they named a place → allow distance
      else {
        // local intent: strong reward up close, UNCAPPED penalty far away
        if(d<=25) sc += 40 - d*0.8;
        else if(d<=120) sc += 20 - (d-25)*0.55;
        else sc -= 60 + (d-120)*0.25;
      }
    }
    return {lat:+r.lat,lng:+r.lon,label:r.display_name||q,sc:sc,exactHouse:exactHouse,type:String(r.type||"")};
  }).filter(function(x){ return isFinite(x.lat)&&isFinite(x.lng); })
    .sort(function(a,b){return b.sc-a.sc;});
  return dedupeNear(scored);
}
function pickBest(rows,q){
  var want=parseAddr(q), scored=scoreRows(rows,q);
  var pool=want.housenumber ? scored.filter(function(x){return x.exactHouse;}) : scored;
  if(!pool.length)return null;
  var top=pool[0]; if(top.sc<-20)return null;
  return {lat:top.lat,lng:top.lng,label:top.label,score:top.sc,exactHouse:top.exactHouse};
}
async function geocodeStructured(q){
  var p=parseAddr(q);
  if(!p.street)return null;
  var qs=new URLSearchParams({format:"jsonv2",addressdetails:"1",limit:"10"});
  qs.set("street",[p.housenumber,p.street].filter(Boolean).join(" "));
  if(p.city)qs.set("city",p.city);
  else{var loc=await getLocality(); if(loc)qs.set("city",loc.split(",")[0]);}
  if(p.state)qs.set("state",p.state);
  if(p.postalcode)qs.set("postalcode",p.postalcode);
  try{
    var rows=await (await fetchT("https://nominatim.openstreetmap.org/search?"+qs,6000)).json();
    var best=pickBest(rows||[],q);
    if(best)return best;
  }catch(e){ /* timed out or failed — fall through to Photon */ }
  // Photon fallback, normalized into the shape pickBest expects
  try{
    var pq=[p.housenumber,p.street,p.city,p.state,p.postalcode].filter(Boolean).join(" ");
    var pj=await (await fetchT("https://photon.komoot.io/api/?limit=10&lang=en&q="+encodeURIComponent(pq),6000)).json();
    var norm=(pj&&pj.features||[]).map(function(f){
      var pr=f.properties||{}, c=(f.geometry&&f.geometry.coordinates)||[0,0];
      return { lat:c[1], lon:c[0], display_name:[pr.housenumber,pr.street||pr.name,pr.city,pr.state,pr.postcode].filter(Boolean).join(", "),
               type:pr.osm_value||pr.type||"", address:{house_number:pr.housenumber,road:pr.street||pr.name,city:pr.city,state:pr.state,postcode:pr.postcode} };
    });
    return pickBest(norm,q);
  }catch(e){ return null; }
}
function cacheGeocode(typed,res){
  try{const k=typed.trim().toLowerCase();const c=JSON.parse(localStorage.getItem("cw_geo")||"{}");
    c[k]={lat:res.lat,lng:res.lng,label:res.label||typed};
    const keys=Object.keys(c); if(keys.length>200)delete c[keys[0]];
    localStorage.setItem("cw_geo",JSON.stringify(c));}catch{}
}
/* Strip punctuation, collapse whitespace, drop a trailing city/state tail — "Pasadena
   Apartments, Detroit, MI" and "pasadena  apartments" both need to land on the same key. */
function _normPlace(x){
  /* Apostrophes were not in the strip list, so "Mom's Spaghetti" normalised to "mom's spaghetti"
     and a driver typing "moms spaghetti" matched nothing. Curly and straight quotes both, plus
     ampersands and the rest of the punctuation that shows up in business names. */
  return String(x||"").toLowerCase()
    .replace(/[\u2018\u2019\u201C\u201D'"`]/g,"")
    .replace(/[.,#()\-\/&+:;!?]/g," ")
    .replace(/\s+/g," ")
    .trim();
}
function lookupCachedGeocode(typed){
  try{const c=JSON.parse(localStorage.getItem("cw_geo")||"{}");
    const hit=c[typed.trim().toLowerCase()]; if(hit) return hit;
  }catch{}
  return null;
}
/* Offline, the exact-key geocode cache is a narrow net — it only matches if you typed the query
   the same way last time. Widen it to everything on the device that has coordinates: past
   geocodes by partial name, Discover results cached by the patch layer, recents, home and work.
   None of this is a network call; it is all already sitting in localStorage. */

/* ═══════════ offline POI index ═══════════
   A packed, static list of named places for the metro, served same-origin so the service worker
   caches it with the app shell. This is the piece that makes search work with zero signal for a
   place you have never looked up before — the one gap v198 could not close, because a name the
   phone has never seen has no coordinates anywhere on the device.

   Format is deliberately dumb and small: a flat array of [name, lat, lng, cat], coordinates
   quantised to 5dp (~1m), sorted by name so a prefix scan can stop early. No index structure to
   build at load, no parse cost beyond JSON itself.

   Loading is lazy and one-shot: the file is only fetched the first time an offline lookup misses
   everything local, so a driver who never searches offline never pays for it. */
var POI_URL = "/poi-detroit.json";
var _poiIdx = null, _poiLoading = null, _poiFailed = false;

function loadPoiIndex(){
  if(_poiIdx) return Promise.resolve(_poiIdx);
  if(_poiFailed) return Promise.resolve(null);
  if(_poiLoading) return _poiLoading;
  _poiLoading = fetch(POI_URL, {cache:"force-cache"})
    .then(function(r){ if(!r.ok) throw new Error("http "+r.status); return r.json(); })
    .then(function(d){
      var rows = Array.isArray(d) ? d : (d && d.p) || [];
      _poiIdx = rows;
      try{ console.log("ConeWatch: POI index "+rows.length+" places"); }catch(e){}
      return _poiIdx;
    })
    .catch(function(){ _poiFailed=true; return null; })   // no index shipped yet: stay silent
    .finally(function(){ _poiLoading=null; });
  return _poiLoading;
}
/* Warm it once the app is idle and online, so the file is already in the SW cache by the time
   somebody actually needs it in a dead zone. Never on the critical path. */
try{
  window.addEventListener("load",function(){
    setTimeout(function(){ if(navigator.onLine) loadPoiIndex(); }, 15000);
  });
}catch(e){}

var POI_CAT_ICON = {
  fuel:"\u26FD", restaurant:"\uD83C\uDF7D\uFE0F", cafe:"\u2615", bar:"\uD83C\uDF7A",
  pharmacy:"\uD83D\uDC8A", hospital:"\uD83C\uDFE5", bank:"\uD83C\uDFE6",
  shop:"\uD83D\uDECD\uFE0F", grocery:"\uD83D\uDED2", hotel:"\uD83C\uDFE8",
  park:"\uD83C\uDF33", school:"\uD83C\uDFEB", police:"\uD83D\uDE94", parking:"\uD83C\uDD7F\uFE0F",
  /* Categories the shipped Detroit index actually contains. Without these the biggest groups in
     the file — parks, repair shops, rec centres, museums — came back with a blank pin. */
  fire:"\uD83D\uDE92", library:"\uD83D\uDCDA", post:"\u2709\uFE0F", venue:"\uD83C\uDFAD",
  civic:"\uD83C\uDFDB\uFE0F", museum:"\uD83C\uDFDB\uFE0F", attraction:"\uD83D\uDCCD",
  sport:"\u26BD", carrepair:"\uD83D\uDD27"
};

/* Scan the index for a query. Ranked the same way lookupAnyLocal ranks: exact, then prefix, then
   contains, distance as the tiebreak — so a result from the index and a result from a recent are
   ordered against each other consistently. */
function searchPoiIndex(typed, limit){
  var q=_normPlace(typed); if(!q||q.length<2||!_poiIdx) return [];
  var out=[], n=_poiIdx.length, cap=limit||8;
  for(var i=0;i<n;i++){
    var row=_poiIdx[i]; if(!row) continue;
    var nm=String(row[0]||""), nn=_normPlace(nm);
    if(!nn) continue;
    var score;
    if(nn===q) score=0;
    else if(nn.indexOf(q)===0) score=1;
    else if(nn.indexOf(q)!==-1) score=2;
    else continue;
    var lat=row[1], lng=row[2];
    var d=S.pos?distM(S.pos,{lat:lat,lng:lng}):0;
    out.push({name:nm,lat:lat,lng:lng,cat:row[3]||"",_s:score,_d:d});
  }
  out.sort(function(a,b){ return (a._s-b._s)||(a._d-b._d); });
  return out.slice(0,cap);
}

function lookupAnyLocal(typed){
  /* Matching was one-directional and raw: it only fired when the stored name CONTAINED the
     query, so a recent saved as "Pasadena Apartments, Detroit" missed when you typed the fuller
     string, and punctuation or double spaces broke it outright. Normalise both sides, match
     either direction, and rank exact over prefix over contains before falling back to distance. */
  var q=_normPlace(typed); if(!q) return null;
  var best=null;
  function consider(name,lat,lng,label){
    if(!isFinite(lat)||!isFinite(lng)) return;
    var n=_normPlace(name); if(!n) return;
    var score;
    if(n===q) score=0;
    else if(n.indexOf(q)===0||q.indexOf(n)===0) score=1;
    else if(n.indexOf(q)!==-1||q.indexOf(n)!==-1) score=2;
    else return;
    var d=S.pos?distM(S.pos,{lat:lat,lng:lng}):0;
    if(!best||score<best._s||(score===best._s&&d<best._d))
      best={lat:lat,lng:lng,label:label||name,_s:score,_d:d};
  }
  try{ var c=JSON.parse(localStorage.getItem("cw_geo")||"{}");
    for(var k in c){ var v=c[k]; consider(k,v.lat,v.lng,v.label); if(v&&v.label) consider(v.label,v.lat,v.lng,v.label); }
  }catch(e){}
  try{ var p=JSON.parse(localStorage.getItem("cw_poi")||"{}");
    for(var pk in p){ var els=(p[pk]&&p[pk].els)||[];
      for(var i=0;i<els.length;i++) consider(els[i].name,els[i].lat,els[i].lng,els[i].name); }
  }catch(e){}
  try{ (QK.recents||[]).forEach(function(r){ consider(r.name,r.lat,r.lng,r.name); }); }catch(e){}
  try{ (QK.saved||[]).forEach(function(r){ consider(r.name,r.lat,r.lng,r.name); }); }catch(e){}
  try{ if(QK.home) consider("home",QK.home.lat,QK.home.lng,"Home");
       if(QK.work) consider("work",QK.work.lat,QK.work.lng,"Work"); }catch(e){}
  return best;
}
function _milesFrom(lat,lng){ if(!S.pos)return ""; try{ var d=distM(S.pos,{lat:lat,lng:lng})/1609.34; return d<0.1?"":("≈ "+(d<10?d.toFixed(1):Math.round(d))+" mi away"); }catch(e){ return ""; } }
/* Does this candidate contain everything the driver typed? "flower bowl" matches
   "The Flower Bowl" but NOT "Seaviche Tacos & Bowls" (no "flower"). Used to tier the
   picker so a real name match can't be pushed down by a closer partial match. */
function _matchesAllWords(label,typed){
  var norm=function(s){ return String(s||"").toLowerCase().replace(/['\u2019]/g,"").replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim(); };
  var hay=norm(label), toks=norm(typed).split(" ").filter(Boolean);
  if(!hay||!toks.length) return false;
  return toks.every(function(t){ return hay.indexOf(t)>-1; });
}
function showGeoPicker(cands,typed){
  pushUI();
  // Sort in two tiers: places matching every word typed come first, then everything else —
  // nearest-first WITHIN each tier. Pure distance sorting put "Seaviche Tacos & Bowls" (0.6mi,
  // matches only "bowl") above "The Flower Bowl" (2.6mi, the actual thing searched for).
  if(S.pos){ try{
    var _d=function(c){ return distM(S.pos,{lat:c.lat,lng:c.lng}); };
    cands=cands.slice().sort(function(a,b){
      var am=_matchesAllWords(a.label,typed)?0:1, bm=_matchesAllWords(b.label,typed)?0:1;
      if(am!==bm) return am-bm;
      return _d(a)-_d(b);
    });
  }catch(e){} }
  var list=$("geoPickerList"); list.innerHTML="";
  $("geoPickerSub").textContent=cands.length>3?"Best matches first — tap the right one for \u201C"+typed+"\u201D":"Tap the correct address for \u201C"+typed+"\u201D";
  cands.forEach(function(c){
    var row=document.createElement("button");
    row.className="btn ghost";
    row.style.cssText="display:block;width:100%;text-align:left;margin-bottom:8px;padding:12px 14px;line-height:1.3";
    var mi=_milesFrom(c.lat,c.lng);
    var tag=c.exactHouse?'<span style="color:var(--nav-accent,#22d3aa);font-weight:700">✓ exact match</span> · ':'';
    row.innerHTML='<div style="font-weight:600;font-size:15px">'+(c.label||typed)+'</div>'+
                  '<div style="font-size:12px;color:var(--muted,#888);margin-top:3px">'+tag+(mi||"")+'</div>';
    row.onclick=function(){ $("geoPicker").style.display="none"; confirmDestination({lat:c.lat,lng:c.lng,label:c.label},typed); };
    list.appendChild(row);
  });
  $("geoPicker").style.display="block";
}
/* The DARK/LIGHT/AUTO label sat right next to the live dot doing nothing but reporting state.
   Making it the control removes a trip into Settings for the most-changed setting in the app. */
/* ═══════════ seasonal sky ═══════════
   Everything Halloween so far has been decoration layered ON the map. This is the map itself
   rendering differently: MapLibre's atmosphere, so when the view pitches you get a deep violet
   sky burning to blood-orange at the horizon, with the ground hazing into it. It's the same
   machinery that makes the 3D drive preview look like a real place — no stickers, no cartoon,
   and it only exists when you tilt, which is exactly when there's sky to see. */
/* A slow flow along the route line during the season. Dash offset only — no extra layers,
   no per-frame geometry work, and it stops dead when the tab is hidden or motion is reduced. */
var _flowRAF=null;
function startRouteFlow(){
  stopRouteFlow();
  var on=false; try{ on=(typeof seasonActive==="function")&&seasonActive(); }catch(e){}
  if(!on) return;
  try{ if(window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches) return; }catch(e){}
  var t=0;
  function step(){
    if(document.hidden){ _flowRAF=requestAnimationFrame(step); return; }
    t=(t+0.5)%16;
    try{ if(map.getLayer("route-flow")) map.setPaintProperty("route-flow","line-dasharray",[0,t/8,2,6-t/8]); }catch(e){}
    _flowRAF=requestAnimationFrame(step);
  }
  _flowRAF=requestAnimationFrame(step);
}
function stopRouteFlow(){ if(_flowRAF){ cancelAnimationFrame(_flowRAF); _flowRAF=null; } }
/* ═══════════ seasonal tint, applied directly ═══════════
   Three versions of this were routed through swapMapStyle/setStyle and kept losing to races
   and style diffing. The tint is nothing but paint properties on one raster layer, so set
   them on the live map instead. Instant, idempotent, and impossible to get out of sync — call
   it any number of times and the map matches the setting. */
function paintSeasonTint(){
  if(!map||!map.getLayer||!map.getLayer("basemap")) return;
  var on=false; try{ on=(typeof seasonActive==="function")&&seasonActive(); }catch(e){}
  var dark=(S.themeNow!=="light");
  var P = on
    ? {"raster-brightness-max":dark?0.34:0.46,"raster-brightness-min":0.00,
       "raster-saturation":dark?0.30:0.35,"raster-contrast":dark?0.42:0.40,
       "raster-hue-rotate":-34,"raster-opacity":1}
    : (dark
       ? {"raster-brightness-max":0.42,"raster-brightness-min":0.02,"raster-saturation":-0.35,
          "raster-contrast":0.12,"raster-hue-rotate":0,"raster-opacity":1}
       : {"raster-brightness-max":1,"raster-brightness-min":0,"raster-saturation":0,
          "raster-contrast":0,"raster-hue-rotate":0,"raster-opacity":1});
  window.__tintErr=null; window.__tintSet=0;
  Object.keys(P).forEach(function(k){
    try{ map.setPaintProperty("basemap",k,P[k]); window.__tintSet++; }
    catch(e){ if(!window.__tintErr) window.__tintErr=k+": "+e.message; }
  });
  try{ map.setPaintProperty("bg","background-color", on?(dark?"#1A0E06":"#C8A882"):(dark?"#0E1013":"#EAE6DF")); }catch(e){}

  /* The route layers are created with `if(!map.getLayer(...))`, so their colours are fixed at
     creation and never revisited — a route line built during the season stayed pumpkin-and-purple
     with the ember dashes running long after the theme was switched off. Repaint them here too,
     since this function already re-asserts on every toggle. */
  var A = on ? ACCENT_HW[dark?"dark":"light"] : ACCENT_BASE[dark?"dark":"light"];
  try{ if(map.getLayer("route-line"))   map.setPaintProperty("route-line","line-color",A.route); }catch(e){}
  try{ if(map.getLayer("route-casing")) map.setPaintProperty("route-casing","line-color",A.casing); }catch(e){}
  /* This used to paint the core with A.route — the same colour as the body — which silently
     erased the bright centre line the moment any season toggle ran (including at boot). */
  try{ if(map.getLayer("route-core"))   map.setPaintProperty("route-core","line-color",A.core); }catch(e){}
  try{
    if(!on){
      stopRouteFlow();
      if(map.getLayer("route-flow")) map.removeLayer("route-flow");
    } else if(!map.getLayer("route-flow") && map.getSource("route")){
      map.addLayer({id:"route-flow",type:"line",source:"route",
        layout:{"line-cap":"butt","line-join":"round"},
        paint:{"line-color":"#FFD24A","line-opacity":.85,
          "line-width":["interpolate",["linear"],["zoom"],10,2.5,14,5,18,8],
          "line-dasharray":[0,0,2,6]}});
      startRouteFlow();
    }
  }catch(e){}
}
function applySeasonSky(){
  if(!map||!map.setSky) return;
  var on=false; try{ on=(typeof seasonActive==="function")&&seasonActive(); }catch(e){}
  try{
    if(on){
      map.setSky({
        "sky-color":"#1A0730",            // deep violet overhead
        "horizon-color":"#FF6A12",        // burning amber at the skyline
        "fog-color":"#2B0F06",            // ground haze, warm and dark
        "sky-horizon-blend":0.62,
        "horizon-fog-blend":0.55,
        "fog-ground-blend":0.72,
        "atmosphere-blend":["interpolate",["linear"],["zoom"],0,0,8,0.85,14,0.9]
      });
    } else {
      map.setSky({"sky-color":"#0E1116","horizon-color":"#2A3340","fog-color":"#12161C",
        "sky-horizon-blend":0.5,"horizon-fog-blend":0.4,"fog-ground-blend":0.4,"atmosphere-blend":0.5});
    }
  }catch(e){}
}
function cycleThemeLabel(){
  var order=["auto","dark","light"];
  var i=order.indexOf(S.themeMode||"auto");
  var next=order[(i+1)%order.length];
  S.themeMode=next;
  try{ document.querySelectorAll("#themeChips .chip").forEach(function(c){
    c.classList.toggle("on",c.dataset.themeSet===next); }); }catch(e){}
  try{ applyTheme(true); }catch(e){}
  try{ saveSettings(); }catch(e){}
  toast("Theme: "+next.charAt(0).toUpperCase()+next.slice(1),1200);
}
async function confirmDestination(res,typed){
  S.destLabel=res.label||"";
  setDestination({lat:res.lat,lng:res.lng,_keepLabel:true},typed);
  cacheGeocode(typed,res);
  crowdSave(typed,res);   // teach the network this match for the next driver
  $("confAddr").textContent=res.label||typed;  // res.label is the ACTUAL matched address
  // sanity: flag if the match is suspiciously far (likely wrong match)
  if(S.pos){const mi=distM(S.pos,{lat:res.lat,lng:res.lng})/1609.34;
    if(mi>150){toast("⚠ Match is "+Math.round(mi)+" mi away — if that's wrong, add the ZIP code.",4500);}}
  var d=S.pos?distM(S.pos,{lat:res.lat,lng:res.lng}):null;
  $("confMeta").textContent=d!==null?fmtDist(d)+" away — calculating drive time…":"Location found";
  /* The route card opens immediately after a destination is set and explicitly hides this
     bar, so Correct/Wrong was never reachable — it appeared and vanished in the same beat.
     The route card already names the destination and offers Change, which covers the same
     need properly. crowdSave() above still records the match, so the learning is unaffected;
     only the explicit thumbs-down signal is lost, and it was never actually collectable. */
  $("confirmBar").style.display="none";
  // always-available way into navigation, even if the route card has trouble rendering
  try{
    const cb=$("confirmBar");
    if(cb && !cb.querySelector(".cbGo")){
      const go=document.createElement("button");
      go.className="cbGo";
      go.textContent="Start navigation";
      go.style.cssText="margin-top:10px;width:100%;border:none;border-radius:12px;padding:13px;background:var(--orange,#FF6B1A);color:#141619;font-weight:800;font-size:15px;cursor:pointer";
      go.onclick=(ev)=>{ ev.stopPropagation();
        if(S.route){ cb.style.display="none"; startNavigation(); }
        else { toast("Building the route…",1800); fetchRoute(); }
      };
      cb.appendChild(go);
    }
  }catch(e){}
  clearTimeout(window.__confT); window.__confT=setTimeout(function(){$("confirmBar").style.display="none";},20000);
  // real driving time from the actual route (fixes straight-line under-estimate)
  if(S.pos&&navigator.onLine){
    try{
      const seg=`${S.pos.lng},${S.pos.lat};${res.lng},${res.lat}?overview=false`;
      let data;
      try{ data=await raceJSON([`https://routing.openstreetmap.de/routed-car/route/v1/driving/${seg}`,`https://router.project-osrm.org/route/v1/driving/${seg}`],d=>d&&d.code==="Ok",6000); }
      catch{ data={code:"Error"}; }
      if(data.routes&&data.routes[0]){
        const rt=data.routes[0], durTxt=fmtDur(rt.duration*rushFactor());
        const arr=new Date(Date.now()+rt.duration*rushFactor()*1000).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
        $("confMeta").textContent=`${fmtDist(rt.distance)} • ${durTxt} • arrive ${arr}`;
      }
    }catch(e){}
  }
}
$("confOk").onclick=function(){$("confirmBar").style.display="none";};
$("confNo").onclick=function(){$("confirmBar").style.display="none";$("search").focus();$("search").select();toast("Add a city, state, or ZIP for a precise match.",3500);};


/* ═══════════ v15: offline map area download ═══════════ */
function tileXY(lat,lon,z){
  const n=Math.pow(2,z);
  return [Math.floor((lon+180)/360*n),
          Math.floor((1-Math.log(Math.tan(lat*Math.PI/180)+1/Math.cos(lat*Math.PI/180))/Math.PI)/2*n)];
}
async function downloadOfflineArea(){
  if(!("caches" in window)){toast("Offline caching not supported in this browser.");return;}
  if(!S.pos){toast("Need GPS lock first.");return;}
  const dark=S.themeNow!=="light";
  const ck=(CW_CONFIG&&CW_CONFIG.cartoKey||"").trim();
  const subs=["a","b","c","d"];
  const lat=S.pos.lat,lon=S.pos.lng;
  const cache=await caches.open("cw-tiles-v3");
  let total=0,okc=0;const jobs=[];
  for(let z=11;z<=17;z++){
    const [cx,cy]=tileXY(lat,lon,z);
    const r=z<=12?2:z<=14?3:z<=15?4:5;
    for(let x=cx-r;x<=cx+r;x++)for(let y=cy-r;y<=cy+r;y++){
      const n=Math.pow(2,z); if(x<0||y<0||x>=n||y>=n)continue;
      const url= ck
        ? `https://${subs[(x+y)%4]}.basemaps.cartocdn.com/rastertiles/${dark?"dark_all":"voyager"}/${z}/${x}/${y}.png?key=${ck}`
        : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`+TILE_CB;
      total++;
      jobs.push(fetch(url,{mode:"cors"}).then(res=>{if(res.ok){okc++;return cache.put(url,res.clone());}}).catch(()=>{}));
      if(jobs.length>=60){await Promise.all(jobs);jobs.length=0;$("dlOffline").querySelector("small").textContent=`Downloading… ${okc} tiles`;}
    }
  }
  await Promise.all(jobs);
  // also cache the app shell + both style fonts are inline, so just confirm
  $("dlOffline").querySelector("small").textContent=`✅ ${okc} tiles saved — works offline`;
  toast(`✅ Offline map saved (${okc} tiles). Airplane-mode ready around here.`,5000);
}


/* ═══════════ v16: trip history + freeway sign reads ═══════════ */
let TRIPS=[];
try{TRIPS=JSON.parse(localStorage.getItem("cw_trips")||"[]");}catch{}
function logTrip(name,lat,lng,miles){
  TRIPS.unshift({name,lat,lng,miles:+(miles||0).toFixed(1),t:Date.now()});
  TRIPS=TRIPS.slice(0,30);
  try{localStorage.setItem("cw_trips",JSON.stringify(TRIPS));}catch{}
}
/* v28: authentic US route shields (interstate / US / state) for maximum visual detail */
function shieldHTML(ref){
  if(!ref)return "";
  var m=String(ref).match(/([A-Za-z]{1,3})[\s-]?(\d+)/);
  var pre=(m?m[1]:"").toUpperCase(), num=m?m[2]:String(ref).replace(/\D/g,"")||ref;
  if(/^I/.test(pre)){
    return '<span style="display:inline-flex;flex-direction:column;align-items:center;justify-content:flex-end;min-width:36px;height:34px;background:linear-gradient(#c0111b 0 34%,#173a7a 34% 100%);border:2px solid #fff;border-radius:5px 5px 9px 9px;color:#fff;font-weight:800;font-family:var(--display,sans-serif);line-height:1;box-shadow:0 1px 3px rgba(0,0,0,.45);overflow:hidden">'
      +'<span style="font-size:6px;letter-spacing:.4px;margin-top:1px;opacity:.95">INTERSTATE</span>'
      +'<span style="font-size:16px;margin-bottom:2px">'+num+'</span></span>';
  }
  if(/^US/.test(pre)){
    return '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:34px;background:#fff;border:2px solid #111;border-radius:6px;color:#111;font-weight:800;font-family:var(--display,sans-serif);font-size:16px;box-shadow:0 1px 3px rgba(0,0,0,.45)">'+num+'</span>';
  }
  return '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:34px;height:31px;background:#2B5FD9;border:2px solid #fff;border-radius:7px;color:#fff;font-weight:800;font-family:var(--display,sans-serif);font-size:14px;padding:0 8px;box-shadow:0 1px 3px rgba(0,0,0,.45)">'+(pre?pre+" ":"")+num+'</span>';
}

/* freeway shield read — shows the ref of the road you're currently on */
let lastSignQ=0;
async function readRoadSign(){
  if(!S.pos||!S.navigating||Date.now()-lastSignQ<25000)return;
  lastSignQ=Date.now();
  try{
    const q=`[out:json][timeout:8];way(around:22,${S.pos.lat},${S.pos.lng})["ref"]["highway"~"motorway|trunk|primary"];out tags 1;`;
    const d=await (await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:"data="+encodeURIComponent(q),headers:{"Content-Type":"application/x-www-form-urlencoded"}})).json();
    const tags=d.elements&&d.elements[0]&&d.elements[0].tags;
    if(tags&&tags.ref){
      $("signShield").innerHTML=shieldHTML(tags.ref.split(";")[0]);
      $("signShield").style.cssText="display:flex;background:none;border:none;padding:0";
    } else $("signShield").style.display="none";
  }catch{}
}


/* ═══════════ v21: full-width search field while typing ═══════════ */
(function(){
  const s=$("search"), row=document.getElementById("brandrow");
  if(!s||!row)return;
  var dock=$("dock");
  s.addEventListener("focus",()=>{ row.classList.add("searching"); if(dock)dock.classList.add("searching"); });
  s.addEventListener("blur",()=>{ setTimeout(()=>{ if(!$("results").matches(":hover")){ row.classList.remove("searching"); if(dock)dock.classList.remove("searching"); } },180); });
  // keep the caret end in view as you type long addresses
  s.addEventListener("input",()=>{ try{s.scrollLeft=s.scrollWidth;}catch(e){} });
  const clr=$("searchClear");
  if(clr)clr.onclick=()=>{ s.value=""; s.focus(); $("results").style.display="none"; try{s.scrollLeft=0;}catch(e){} };
})();

/* ═══════════ PWA ═══════════ */
/* single-file build */

/* ═══════════ PWA service worker ═══════════ */
/* ═══════════ v34: Add-to-Home-Screen install prompt ═══════════ */
let deferredInstall=null;
/* Lite mode. An Android tester reported heavy lag, and the likeliest cause is compositing
   cost rather than JS: this stylesheet carries 39 backdrop-filters, and a blurred panel sitting
   over a map that repaints every frame forces the blur to be recomputed every frame too.
   Rather than guess at one device, key off what the browser will actually tell us about the
   hardware, and let it be overridden either way. */
function liteMode(){
  try{
    var v=localStorage.getItem("cw_lite");
    if(v==="1") return true;
    if(v==="0") return false;                   // explicit opt-out always wins
  }catch(e){}
  /* Android is lite by DEFAULT, not by spec check. The first version gated this on core count,
     but plenty of Android phones report 8 cores and 8GB and still choke — the bottleneck is GPU
     compositing of blurred layers over a repainting map, which Android handles far worse than
     iOS regardless of how fast the CPU is. A driver should never have to find a switch. */
  try{ if(/android/i.test(navigator.userAgent)) return true; }catch(e){}
  try{
    var cores=navigator.hardwareConcurrency||8;
    var mem=navigator.deviceMemory||8;
    if(cores<=4||mem<=4) return true;
  }catch(e){}
  return false;
}

/* Spec sniffing only ever approximates the thing we actually care about, which is whether THIS
   device is dropping frames right now. Watch real frame times and downgrade automatically if
   they're bad — that catches the phones no user-agent rule would have predicted. Only ever
   turns lite ON; it never flips back mid-drive, because a display that keeps changing under a
   driver is worse than one that stays plain. */
function watchFrames(ms){
  if(liteMode()) return;                        // already lite, nothing to measure for
  var frames=[], start=performance.now(), last=start, bad=0;
  function tick(now){
    var dt=now-last; last=now;
    if(dt>0&&dt<500) frames.push(dt);
    if(now-start < (ms||4000)){ requestAnimationFrame(tick); return; }
    if(frames.length<20) return;
    frames.sort(function(a,b){return a-b;});
    var median=frames[Math.floor(frames.length/2)];
    if(median>28){                              // slower than ~36fps sustained
      bad++;
      try{ localStorage.setItem("cw_lite","1"); }catch(e){}
      applyLite();
      try{ console.log("ConeWatch: lite mode on — median frame "+median.toFixed(1)+"ms"); }catch(e){}
    }
  }
  requestAnimationFrame(tick);
}
try{ setTimeout(function(){ watchFrames(4000); }, 6000); }catch(e){}
function applyLite(){
  try{ document.documentElement.setAttribute("data-lite", liteMode()?"1":"0"); }catch(e){}
}
try{ applyLite(); }catch(e){}
function isStandalone(){ return (window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true; }
function isIOSdev(){ return /iphone|ipad|ipod/i.test(navigator.userAgent); }
function isAndroidDev(){ return /android/i.test(navigator.userAgent); }
function installDismissed(){ try{return localStorage.getItem("cw_install")==="1";}catch(e){return false;} }
function _installClear(){
  if(S.navigating) return false;
  if($("confirmBar") && $("confirmBar").style.display==="flex") return false;
  if(document.querySelector(".sheet.open")) return false;
  if(["drivePreview","satPreview","photoSheet","geoPicker","tutorial","welcome","sosConfirm"].some(id=>{const e=$(id);return e && getComputedStyle(e).display!=="none";})) return false;
  return true;
}
function showInstallBanner(force){
  if(isStandalone())return;
  if(!force && installDismissed())return;
  if(!force && !_installClear())return;
  const b=$("installBanner"); if(!b)return;
  if(isIOSdev()){ $("installGo").style.display="none"; $("iosSteps").style.display="block"; $("installMsg").textContent="Opens like a real app — no browser bar, one tap to launch."; }
  else if(deferredInstall){ $("installGo").style.display=""; $("iosSteps").style.display="none"; var _a0=$("androidSteps"); if(_a0)_a0.style.display="none"; }
  else if(!force){ return; }
  else if(isAndroidDev() || /android/i.test(navigator.userAgent)){
    /* beforeinstallprompt is unreliable — it fires once per load, only when Chrome decides the
       install criteria are met, and never at all in Firefox or Samsung Internet. Android users
       were being handed a vague "check your browser menu" and nothing else. */
    $("installGo").style.display="none"; $("iosSteps").style.display="none";
    var _as=$("androidSteps"); if(_as) _as.style.display="block";
    $("installMsg").textContent="Opens like a real app — no browser bar, one tap to launch.";
    /* Chrome only fires beforeinstallprompt once per page load and only when it decides the
       criteria are met, so the button often never appears. Offer a reload as the second chance
       rather than leaving an Android user with nothing actionable. */
    try{
      var _as2=$("androidSteps");
      if(_as2 && !_as2.querySelector(".cw-reload")){
        var rb=document.createElement("button");
        rb.className="btn ghost cw-reload";
        rb.style.cssText="margin-top:10px;width:100%";
        rb.textContent="Reload — sometimes Chrome offers Install after a refresh";
        rb.onclick=function(){ location.reload(); };
        _as2.appendChild(rb);
      }
    }catch(e){}
  }
  else { $("installGo").style.display="none"; $("iosSteps").style.display="none"; $("installMsg").textContent="In your browser menu, choose \u201CInstall app\u201D or \u201CAdd to Home Screen.\u201D"; }
  b.style.display="block";
}
function dismissInstall(){ const b=$("installBanner"); if(b)b.style.display="none"; try{localStorage.setItem("cw_install","1");}catch(e){} }
window.addEventListener("beforeinstallprompt",(e)=>{ e.preventDefault(); deferredInstall=e; if(!installDismissed())showInstallBanner(); });
$("installGo")&&($("installGo").onclick=async()=>{ if(deferredInstall){ deferredInstall.prompt(); try{await deferredInstall.userChoice;}catch(e){} deferredInstall=null; dismissInstall(); } });
$("installX")&&($("installX").onclick=dismissInstall);
$("installBtn")&&($("installBtn").onclick=()=>{ closeSheets&&closeSheets(); setTimeout(()=>showInstallBanner(true),200); });
window.addEventListener("appinstalled",()=>{ dismissInstall(); toast("✓ ConeWatch installed"); });
function _tryInstalliOS(){
  if(!isIOSdev()||isStandalone()||installDismissed())return;
  if(_installClear()) showInstallBanner();
  else setTimeout(_tryInstalliOS,4000);   // wait for sheets/prompts to close
}
setTimeout(_tryInstalliOS,4200);
// keep the map filling the live viewport (iOS toolbar collapse, rotation)
window.addEventListener("resize",()=>{try{map&&map.resize();}catch(e){}});
window.addEventListener("orientationchange",()=>{setTimeout(()=>{try{map&&map.resize();}catch(e){}},250);});

if("serviceWorker" in navigator){
  window.addEventListener("load",function(){
    var hadController = !!navigator.serviceWorker.controller;   // was the app already controlled? (i.e. this is an UPDATE, not first install)
    navigator.serviceWorker.register("sw.js").then(function(reg){
      reg.update();                                             // check for a newer version right now
      document.addEventListener("visibilitychange",function(){ if(document.visibilityState==="visible"){try{reg.update();}catch(e){}} });
      setInterval(function(){ try{reg.update();}catch(e){} }, 30*60*1000);   // and every 30 min while open
    }).catch(function(){});
    // when a new service worker takes control, reload ONCE so the user is on the latest — no manual delete/re-add
    // NEVER reload mid-drive: a deploy landing while someone is navigating would wipe the live
    // route, possibly right at a turn. Hold it and apply when navigation ends (endNavigation).
    var _swReloaded=false;
    navigator.serviceWorker.addEventListener("controllerchange",function(){
      if(_swReloaded||!hadController)return;
      if(S.navigating){ S.pendingReload=true; return; }
      _swReloaded=true; location.reload();
    });
  });
}

/* ═══════════ plan A→B from the same search flow (Apple-style) ═══════════
   Pick a destination as usual, then edit the "From" row in the route card to check the drive
   between any two places. Blank = your current location. Starting navigation always routes live
   from where you actually are. */
function _setFromUI(){
  const el=$("tripFrom"); if(!el) return;
  el.value = S.origin ? (S.originName||"") : "";
  el.placeholder = "My location";
}
$("fromClear")&&($("fromClear").onclick=()=>{
  S.origin=null; S.originName=""; _setFromUI();
  if(S.dest){ toast("Routing from your location…",1400); fetchRoute(); }
});
$("tripFrom")&&($("tripFrom").addEventListener("change",async()=>{
  const q=($("tripFrom").value||"").trim();
  if(!q){ S.origin=null; S.originName=""; if(S.dest)fetchRoute(); return; }
  toast("Finding that starting point…",1600);
  let pt=null;
  const cached=lookupCachedGeocode(q);
  if(cached) pt={lat:cached.lat,lng:cached.lng,label:cached.label||q};
  else{
    try{
      const cands=await geocodeCandidates(q);
      let pool=(cands||[]).filter(c=>c.sc>-30);
      const want=parseAddr(q);
      if(!want.city&&!want.state&&!want.postalcode&&S.pos){
        const near=pool.filter(c=>distM(S.pos,{lat:c.lat,lng:c.lng})/1609.34<=120);
        if(near.length) pool=near;
      }
      if(pool.length) pt={lat:pool[0].lat,lng:pool[0].lng,label:pool[0].label||q};
    }catch(e){}
  }
  if(!pt){ toast("Couldn't find that start — add a city or ZIP.",3400); return; }
  S.origin={lat:pt.lat,lng:pt.lng}; S.originName=(pt.label||q).split(",")[0]; S.originAddr=(pt.label||"").split(",").slice(1,4).join(",").trim();
  _setFromUI();
  if(S.dest) fetchRoute(); else toast("Now pick a destination.",2200);
}));


/* ═══════════ ranking: a perfect name match 1,500 miles away is not the answer ═══════════
   The old sort put word-match first and used distance only to break ties, so "Hamiltons"
   returned Salt Lake City above the Dearborn one 12 miles away. Distance is now part of the
   score itself — unless the person actually typed a city or state. */
function _placeScore(r,toks,typedPlace){
  const lbl=((r.name||"")+" "+(r.label||"")).toLowerCase().replace(/['\u2019]/g,"");
  let nm=0, strong=0;
  toks.forEach(t=>{
    if(lbl.indexOf(t)<0) return;
    nm++;
    if(!GENERIC_WORDS.test(t)) strong++;      // "godfrey" counts for more than "rooftop"
  });
  let sc = strong*26 + nm*8;
  if((r.name||"").toLowerCase().startsWith(toks[0]||"")) sc+=14;
  /* A city named inside the query — "Godfrey chicago" — is not comma-separated, so parseAddr
     never sees it and typedPlace stays false. The distance penalty below then removes 77 points
     from the only correct answer. If a word the driver typed appears in THIS row's own place
     label, they named where they meant: treat it as a located search. */
  var _named = typedPlace;
  if(!_named && r.label){
    var _lb=String(r.label).toLowerCase();
    for(var _i=0;_i<toks.length;_i++){
      if(toks[_i].length>3 && !GENERIC_WORDS.test(toks[_i]) && _lb.indexOf(toks[_i])>-1){ _named=true; break; }
    }
  }
  typedPlace=_named;
  const mi = (r._d!==undefined && isFinite(r._d)) ? r._d/1609.34 : null;
  if(mi!==null && !typedPlace){
    // near things win. far things need to be a much better match to compete.
    if(mi<=15) sc+=30-mi;
    else if(mi<=60) sc+=12-(mi-15)*0.25;
    else sc-=Math.min(90,(mi-60)*0.35);
  } else if(mi!==null){
    sc+= mi<=40?8:0;
  }
  return sc;
}

/* ═══════════ full-screen search panel (Apple-style) ═══════════
   One entry point: tap the search bar (or the From row) and a real page opens with live
   suggestions, recents, saved places and an approximate-match option. */
/* Bump whenever suggestion ranking or sources change, so cached lists from the old logic are
   not served instead. */
var SEARCH_RANK_VER="v258";
let _spMode="dest", _spTimer=null, _spAbort=null;
function openSearchPanel(mode,seed){
  _spMode=mode||"dest";
  const p=$("searchPanel"); if(!p) return;
  p.classList.add("open"); p.setAttribute("aria-hidden","false");
  $("spWhich").textContent = _spMode==="from" ? "Starting point" : "Destination";
  $("spInput").placeholder = _spMode==="from" ? "Start — or leave blank for my location" : "Search a place or address";
  $("spInput").value = seed||"";
  spRender([]);
  /* Focus SYNCHRONOUSLY. iOS grants a keyboard only to a focus() call still inside the user
     gesture; a setTimeout, however short, lands after the gesture ends and the keyboard is
     silently refused. The timer below is a fallback for the non-gesture callers only. */
  try{ $("spInput").focus(); }catch(e){}
  setTimeout(()=>{ try{ if(document.activeElement!==$("spInput")) $("spInput").focus(); }catch(e){} },60);
}
try{
  var _sg=$("spGo");
  if(_sg) _sg.onclick=function(){
    var q=($("spInput").value||"").trim(); if(!q) { try{$("spInput").focus();}catch(e){} return; }
    /* v269: the Search button used to close this panel and open a separate "Which one?" sheet
       built by forceGeocode — a different pipeline that keeps returning local matches for a
       query naming a distant city. The list ALREADY ON SCREEN here is correct. So Search now
       commits to the top suggestion in front of the driver rather than throwing it away and
       asking a worse question. If nothing has come back yet, fall back to the old path so the
       button is never dead. */
    try{
      var first=document.querySelector("#spList .sp-row");
      if(first){ first.click(); return; }
    }catch(e){}
    try{ $("spInput").blur(); }catch(e){}
    closeSearchPanel();
    try{ $("search").value=q; }catch(e){}
    forceGeocode(q);
  };
}catch(e){}
function closeSearchPanel(){
  const p=$("searchPanel"); if(!p) return;
  p.classList.remove("open"); p.setAttribute("aria-hidden","true");
  try{$("spInput").blur();}catch(e){}
}
function spIcon(r){
  const ic=poiIcon(r); return '<span class="sp-ic" style="background:'+ic[1]+'">'+ic[0]+'</span>';
}
/* Match on coordinates rather than name: two different places can share a name, and the name is
   what the driver typed rather than a stable key. */
function removeRecent(r){
  try{
    QK.recents=(QK.recents||[]).filter(function(x){
      var same = Math.abs((x.lat||0)-(r.lat||0))<1e-6 && Math.abs((x.lng||0)-(r.lng||0))<1e-6;
      return !(same || (x.name===r.name && !isFinite(r.lat)));
    });
    saveQK();
  }catch(e){}
}
function spRender(items,note){
  const list=$("spList"); if(!list) return;
  const q=($("spInput").value||"").trim();
  list.innerHTML="";
  if(!q){
    // empty state → saved + recents, same data the quick chips use
    const rows=[];
    if(_spMode==="from" ) rows.push({name:"My location",label:"Use where I am now",icon:"◎",bg:"#34C98A",_me:true});
    if(QK.home) rows.push({name:"Home",label:"Saved place",icon:"🏠",bg:"#34C98A",lat:QK.home.lat,lng:QK.home.lng});
    if(QK.work) rows.push({name:"Work",label:"Saved place",icon:"💼",bg:"#5B9CF6",lat:QK.work.lat,lng:QK.work.lng});
    (QK.favorites||[]).slice(0,5).forEach(f=>rows.push({name:f.name,label:"Favorite",icon:"⭐",bg:"#FF9F0A",lat:f.lat,lng:f.lng}));
    (QK.recents||[]).slice(0,8).forEach(r=>rows.push({name:r.name,label:"Recent",icon:"🕘",bg:"#6B7280",lat:r.lat,lng:r.lng,_recent:true}));
    if(!rows.length){ list.innerHTML='<p class="sub" style="padding:18px 12px">Start typing a place or address.</p>'; return; }
    rows.forEach(r=>{
      const d=document.createElement("div"); d.className="sp-row";
      d.innerHTML='<span class="sp-ic" style="background:'+r.bg+'">'+r.icon+'</span><span class="sp-tx"><b>'+r.name+'</b><small>'+r.label+'</small></span>';
      d.onclick=()=>spPick(r);
      /* Recents are a convenience, and a convenience you cannot edit becomes clutter — one
         mistyped search sits at the top of the list for weeks. A recent gets an × right here on
         the row, where the driver is already looking, rather than buried in Settings. Saved
         places and Home/Work deliberately do NOT get one: those are deletable where they were
         created, and an × next to Home is a thing to hit by accident. */
      if(r._recent){
        const x=document.createElement("button");
        x.className="sp-del"; x.type="button";
        x.setAttribute("aria-label","Remove "+r.name+" from recents");
        x.textContent="✕";
        x.onclick=(ev)=>{
          ev.stopPropagation();                       // don't navigate to the thing being deleted
          removeRecent(r);
          spRender([]);                               // repaint the empty state without it
          try{ toast("Removed “"+r.name+"” from recents"); }catch(e){}
        };
        d.appendChild(x);
      }
      list.appendChild(d);
    });
    if((QK.recents||[]).length>1){
      const clr=document.createElement("button");
      clr.className="sp-clearall"; clr.type="button"; clr.textContent="Clear all recents";
      clr.onclick=()=>{
        QK.recents=[]; try{ saveQK(); }catch(e){}
        spRender([]);
        try{ toast("Recents cleared"); }catch(e){}
      };
      list.appendChild(clr);
    }
    return;
  }
  if(note){ const n=document.createElement("p"); n.className="sub"; n.style.padding="14px 12px"; n.textContent=note; list.appendChild(n); }
  (items||[]).forEach(r=>{
    const d=document.createElement("div"); d.className="sp-row";
    const near=(r._d!==undefined&&isFinite(r._d))?fmtDist(r._d)+" away":"";
    d.innerHTML=spIcon(r)+'<span class="sp-tx"><b>'+(r.name||q)+'</b><small class="rmeta" data-lat="'+r.lat+'" data-lng="'+r.lng+'">'+[near,r.label].filter(Boolean).join(" · ")+'</small></span>';
    d.onclick=()=>spPick(r);
    list.appendChild(d);
  });
  // always offer the approximate/as-typed match, like the old picker did
  const ap=document.createElement("div"); ap.className="sp-row";
  ap.innerHTML='<span class="sp-ic" style="background:#2B6FE0">✎</span><span class="sp-tx"><b>Use "'+q.slice(0,28)+'" as typed</b><small>Approximate match — best guess near you</small></span>';
  ap.onclick=()=>{ closeSearchPanel(); if(_spMode==="from"){ $("tripFrom").value=q; $("tripFrom").dispatchEvent(new Event("change")); } else { $("search").value=q; forceGeocode(q); } };
  list.appendChild(ap);
  try{ upgradeResultDistances(items||[]); }catch(e){}
}
function spPick(r){
  closeSearchPanel();
  if(r._me){ S.origin=null; S.originName=""; S.originAddr=""; try{_setFromUI();}catch(e){} if(S.dest)fetchRoute(); return; }
  if(_spMode==="from"){
    S.origin={lat:r.lat,lng:r.lng}; S.originName=(r.name||r.label||"Start").slice(0,40); S.originAddr=(r.label||"").split(",").slice(0,3).join(",").trim();
    try{_setFromUI();}catch(e){}
    if(S.dest) fetchRoute(); else toast("Now pick a destination.",2200);
    return;
  }
  $("search").value=r.name||"";
  confirmDestination({lat:r.lat,lng:r.lng,label:[r.name,r.label].filter(Boolean).join(", ")}, r.name||"Destination");
}
/* ═══════════ suggestions ═══════════
   Was strictly sequential: await Photon → maybe await a Photon retry → maybe await Nominatim →
   then await Overture and Foursquare → then render once. Nothing appeared until the SLOWEST
   provider finished, and the Nominatim fallback fired off Photon's result alone, before
   Overture/Foursquare were even awaited, so it often made a third call that wasn't needed.
   Now all three primaries run in parallel and the list paints as each one lands. Same final
   result set, same ranking — just visible sooner. Fallbacks run only if all three come back
   empty, which is also what stops the unnecessary Nominatim call. */
function _photonMap(d){
  return ((d&&d.features)||[]).map(function(f){
    var p=f.properties, co=f.geometry.coordinates;
    var name=[p.name||p.street,p.housenumber].filter(Boolean).join(" ")||p.street||p.city||"Unnamed place";
    var label=[p.street&&p.name&&p.name!==p.street?p.street:null,p.city||p.town||p.village,p.state].filter(Boolean).join(", ");
    return {name:name,label:label,lat:co[1],lng:co[0]};
  });
}
function _photonURL(q){
  var u="https://photon.komoot.io/api/?q="+encodeURIComponent(q)+"&limit=10&lang=en";
  if(S.pos) u+="&lat="+S.pos.lat+"&lon="+S.pos.lng;
  return u;
}
async function spSearch(q){
  if(_spAbort){ try{_spAbort.abort();}catch(e){} }
  _spAbort=new AbortController();
  var sig=_spAbort.signal;
  if(!navigator.onLine){ spRender(offlineMatches(q)); return; }
  /* acCache is why three consecutive builds returned an IDENTICAL list: the first answer for a
     query is kept for the session, so none of the ranking work was ever exercised on a repeat
     search. Version the cache so a build that changes ranking cannot be masked by it. */
  var _ck=SEARCH_RANK_VER+"|"+q;
  if(acCache.has(_ck)){ spRender(acCache.get(_ck)); return; }
  try{ closeTurnList(); }catch(e){}
  spRender([], "Searching…");

  var pool=[], painted=false;
  var toks=q.toLowerCase().replace(/['\u2019]/g,"").split(/\s+/).filter(function(w){return w.length>1;});
  var typedPlace=(function(){ try{ var p=parseAddr(q); return !!(p.city||p.state||p.postalcode); }catch(e){ return false; } })();

  function rank(list){
    var out=dedupeSuggest(list).map(function(r){
      var withD=Object.assign({},r,{_d:S.pos?distM(S.pos,r):undefined});
      return Object.assign({},withD,{_sc:_placeScore(withD,toks,typedPlace)});
    });
    out.sort(function(a,b){ return b._sc-a._sc; });
    return out;
  }
  function paint(rows){
    if(sig.aborted) return;                       // a newer keystroke owns the panel now
    if(rows&&rows.length) pool=pool.concat(rows);
    if(!pool.length) return;                      // nothing yet — leave "Searching…" up
    painted=true;
    spRender(rank(pool), null);
  }

  // all three primaries in flight at once; each paints the moment it lands
  var jobs=[
    fetch(_photonURL(q),{signal:sig}).then(function(r){return r.json();}).then(function(d){ paint(_photonMap(d)); }),
    overtureSuggest(q,sig).then(paint),
    fsqSuggest(q,sig).then(paint)
  ];
  /* CITY SPLIT. All three primaries above are proximity-biased — photon by lat/lon, the two POI
     indexes by radius — so for "Godfrey chicago" the correct row was never in the pool at all
     and no amount of rescoring could surface it. Splitting the query so the trailing word is a
     STRUCTURED city ("Godfrey" in city "chicago") asks a question those sources cannot answer,
     and it runs alongside them rather than as an empty-pool fallback, because the pool is never
     empty — it is full of the wrong city. Last one and last two words, since "ann arbor" and
     "new york" are two tokens. */
  var _tk=q.trim().split(/\s+/);
  if(_tk.length>=2){
    [1,2].forEach(function(n){
      if(_tk.length<=n) return;
      var nm2=_tk.slice(0,_tk.length-n).join(" "), city=_tk.slice(-n).join(" ");
      if(nm2.length<2 || city.length<3 || GENERIC_WORDS.test(city)) return;
      /* Structured-only for the same reason as above: q and city cannot coexist. */
      var u="https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=6"+
            "&amenity="+encodeURIComponent(nm2)+"&city="+encodeURIComponent(city);
      jobs.push(fetch(u,{signal:sig,headers:{Accept:"application/json"}})
        .then(function(r){return r.json();})
        .then(function(list){
          paint((list||[]).map(function(r){
            return {name:String(r.display_name).split(",")[0],
                    label:String(r.display_name).split(",").slice(1,4).join(",").trim(),
                    lat:+r.lat, lng:+r.lon};
          }));
        }));
    });
  }
  jobs=jobs.map(function(p){ return p.catch(function(e){ if(e&&e.name==="AbortError") throw e; }); });

  try{ await Promise.all(jobs); }catch(e){ if(e&&e.name==="AbortError") return; }
  if(sig.aborted) return;

  // Every primary came back empty — now, and only now, spend a request on the fallbacks.
  if(!pool.length){
    var strong=q.split(/\s+/).filter(function(w){ return w.length>2 && !GENERIC_WORDS.test(w); });
    if(strong.length && strong.join(" ")!==q.trim()){
      try{
        var d2=await (await fetch(_photonURL(strong.join(" ")),{signal:sig})).json();
        paint(_photonMap(d2));
      }catch(e){ if(e&&e.name==="AbortError") return; }
    }
  }
  if(!pool.length){
    try{
      var url="https://nominatim.openstreetmap.org/search?format=json&limit=10&q="+encodeURIComponent(q);
      if(S.pos){ var dd=0.15; url+="&viewbox="+(S.pos.lng-dd)+","+(S.pos.lat+dd)+","+(S.pos.lng+dd)+","+(S.pos.lat-dd)+"&bounded=0"; }
      var list=await (await fetch(url,{signal:sig,headers:{Accept:"application/json"}})).json();
      paint((list||[]).map(function(r){
        return {name:r.display_name.split(",")[0],label:r.display_name.split(",").slice(1,4).join(",").trim(),lat:+r.lat,lng:+r.lon};
      }));
    }catch(e){ if(e&&e.name==="AbortError") return; }
  }
  if(sig.aborted) return;
  var final=rank(pool);
  if(S.pos && final.length) acCache.set(_ck,final);   // don't cache pre-GPS-lock results
  if(!final.length) spRender([], "No matches — try adding a city or ZIP.");
  else if(!painted) spRender(final,null);
}
$("spInput")&&($("spInput").addEventListener("input",()=>{
  const q=$("spInput").value.trim();
  clearTimeout(_spTimer);
  if(q.length<2){ spRender([]); return; }
  _spTimer=setTimeout(()=>spSearch(q),200);
}));
$("spInput")&&($("spInput").addEventListener("keydown",e=>{
  if(e.key==="Enter"){ e.preventDefault(); const q=$("spInput").value.trim(); if(!q) return;
    closeSearchPanel();
    if(_spMode==="from"){ $("tripFrom").value=q; $("tripFrom").dispatchEvent(new Event("change")); }
    else { $("search").value=q; doSearch(); } }
}));
$("spClear")&&($("spClear").onclick=()=>{ $("spInput").value=""; spRender([]); $("spInput").focus(); });
$("spBack")&&($("spBack").onclick=closeSearchPanel);
// the main search bar and the From row both open the panel instead of typing inline
/* Hand focus straight to the panel input instead of blurring first — a focus TRANSFER inside
   one gesture keeps the keyboard, a blur-then-refocus loses it. */
$("search")&&($("search").addEventListener("focus",(e)=>{
  var v=$("search").value.trim();
  openSearchPanel("dest",v);
  try{ e.target.blur(); }catch(x){}
}));
$("tripFrom")&&($("tripFrom").addEventListener("focus",(e)=>{ try{e.target.blur();}catch(x){} openSearchPanel("from",S.originName||""); }));

/* ═══════════ both endpoints editable, plus swap ═══════════
   People change their minds. Either end of the trip can be retapped and replaced, and the whole
   trip can be reversed in one tap — no re-entering anything. */
$("reTo")&&($("reTo").addEventListener("click",()=>{ openSearchPanel("dest", S.destName||""); }));
$("reTo")&&($("reTo").addEventListener("keydown",e=>{ if(e.key==="Enter"||e.key===" ") { e.preventDefault(); openSearchPanel("dest", S.destName||""); } }));
$("reSwap")&&($("reSwap").onclick=async()=>{
  if(!S.dest){ toast("Pick a destination first.",2200); return; }
  const oldDest={lat:S.dest.lat,lng:S.dest.lng}, oldDestName=S.destName, oldDestLabel=S.destLabel;
  if(S.origin){
    const o={lat:S.origin.lat,lng:S.origin.lng}, oName=S.originName, oAddr=S.originAddr;
    S.origin=oldDest; S.originName=oldDestName; S.originAddr=oldDestLabel||"";
    S.destLabel=oAddr||""; setDestination({lat:o.lat,lng:o.lng,_keepLabel:true}, oName||"Destination");
  } else {
    if(!S.pos){ toast("Waiting for GPS — can't swap yet.",2600); return; }
    // reverse a trip that started from your live location
    S.origin=oldDest; S.originName=oldDestName; S.originAddr=oldDestLabel||"";
    S.destLabel="Current location"; setDestination({lat:S.pos.lat,lng:S.pos.lng,_keepLabel:true},"My location");
  }
  toast("↕ Trip reversed",1800);
});

/* ═══════════ "is it still there?" — asked only when it's safe ═══════════
   Confirmations keep the map honest, but a tap-decision at speed is dangerous. This waits until
   the driver is stopped (or the trip ends), then asks about ONE hazard they just passed. */
S.passedQueue = S.passedQueue || [];
function notePassed(h){
  if(!h||!h.id) return;
  if(S.passedQueue.some(x=>x.id===h.id)) return;
  // only things that genuinely come and go — a pothole doesn't vanish on its own
  if(!/^(traffic|construction_cones|road_closure|accident|police|stalled|emergency|debris|flooding|camera|camera_flock)$/.test(h.type)) return;
  S.passedQueue.push({id:h.id,type:h.type,t:Date.now()});
  if(S.passedQueue.length>6) S.passedQueue.shift();
}
let _askedAt=0;
function maybeAskStillThere(){
  if(!S.passedQueue.length) return;
  if(Date.now()-_askedAt < 60000) return;             // at most once a minute
  const mph=(S.speed||0)*2.23694;
  if(mph>3) return;                                    // never while moving
  if(document.querySelector(".sheet.open")) return;     // don't interrupt something else
  const item=S.passedQueue.shift();
  if(!item || Date.now()-item.t > 15*60000) return;     // too stale to be useful
  const h=S.hazards.find(x=>x.id===item.id); if(!h) return;
  const m=HZ_META[h.type]||HZ_META.debris;
  _askedAt=Date.now();
  const wrap=document.createElement("div");
  wrap.style.cssText="position:fixed;left:12px;right:12px;bottom:calc(112px + env(safe-area-inset-bottom));z-index:1500;background:var(--panel-solid);border:1px solid var(--line);border-radius:16px;padding:14px;box-shadow:0 12px 40px rgba(0,0,0,.45)";
  wrap.innerHTML='<div style="font-size:14px;font-weight:700;margin-bottom:4px">'+m.emoji+' Still there?</div>'+
    '<div style="font-size:12.5px;color:var(--mute);margin-bottom:10px">You just passed a reported '+m.label.toLowerCase()+'.</div>'+
    '<div style="display:flex;gap:8px">'+
    '<button data-a="yes" style="flex:1;border:none;border-radius:12px;padding:12px;background:var(--ok,#34C98A);color:#07231A;font-weight:800;font-size:14px">Still there</button>'+
    '<button data-a="no" style="flex:1;border:1px solid var(--line);border-radius:12px;padding:12px;background:transparent;color:inherit;font-weight:700;font-size:14px">All clear</button>'+
    '<button data-a="skip" style="border:1px solid var(--line);border-radius:12px;padding:12px 14px;background:transparent;color:var(--mute);font-size:14px">✕</button></div>';
  document.body.appendChild(wrap);
  const kill=()=>{ try{wrap.remove();}catch(e){} clearTimeout(tm); };
  const tm=setTimeout(kill,14000);
  wrap.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    const a=b.dataset.a; kill();
    if(a==="yes"){ try{window.cwConfirm(h.id);}catch(e){} }
    else if(a==="no"){ try{window.cwGone(h.id);}catch(e){} }
  });
}

/* ═══════════ report a freeway closure, with the nearest exits offered ═══════════
   Typing an exit while parked on a closed freeway is the last thing anyone wants to do, so this
   pulls the actual nearby ramps/exits from the map data using your GPS and offers them as taps. */
async function nearbyExits(){
  if(!S.pos) return [];
  const R=4000;
  const q='[out:json][timeout:12];(way(around:'+R+','+S.pos.lat+','+S.pos.lng+')["highway"~"motorway_link|trunk_link"];);out tags center 40;';
  try{
    const res=await Promise.race([
      fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:q}),
      new Promise((_,rj)=>setTimeout(()=>rj(new Error("slow")),8000))
    ]);
    const d=await res.json();
    const seen=new Set(), out=[];
    (d.elements||[]).forEach(e=>{
      const t=e.tags||{}; const c=e.center||e;
      if(!c||!isFinite(c.lat)) return;
      const name=[t["destination:ref"]||t.ref,t.destination||t.name].filter(Boolean).join(" → ")||t.name||t.ref;
      if(!name) return;
      const key=name.toLowerCase(); if(seen.has(key)) return; seen.add(key);
      out.push({name:name,lat:c.lat,lng:c.lon||c.lng,d:distM(S.pos,{lat:c.lat,lng:c.lon||c.lng})});
    });
    return out.sort((a,b)=>a.d-b.d).slice(0,8);
  }catch(e){ return []; }
}
async function reportClosure(){
  if(!S.pos){ toast("Need a GPS lock to report a closure."); return; }
  closeSheets&&closeSheets();
  const wrap=document.createElement("div");
  wrap.id="clsSheet";
  wrap.style.cssText="position:fixed;left:12px;right:12px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:2400;background:var(--panel-solid);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 14px 44px rgba(0,0,0,.5);max-height:52vh;overflow-y:auto;-webkit-overflow-scrolling:touch";
  // Lift the sheet above the on-screen keyboard so the input never hides behind it, and shrink
  // it so its top can't collide with the instruction banner. Restores on keyboard dismiss.
  const vv=window.visualViewport;
  const liftForKeyboard=()=>{
    if(!vv){ return; }
    const kb=Math.max(0,(window.innerHeight - vv.height - vv.offsetTop));
    if(kb>120){ wrap.style.bottom=(kb+12)+"px"; wrap.style.maxHeight="42vh"; }
    else { wrap.style.bottom="calc(96px + env(safe-area-inset-bottom))"; wrap.style.maxHeight="52vh"; }
  };
  if(vv){ vv.addEventListener("resize",liftForKeyboard); vv.addEventListener("scroll",liftForKeyboard); }
  wrap.innerHTML='<div style="font-size:15px;font-weight:800;margin-bottom:3px">⛔ Report a closure</div>'+
    '<div style="font-size:12.5px;color:var(--mute);margin-bottom:10px">Pick the closest exit or type where it is.</div>'+
    '<input id="clsInput" placeholder="e.g. I-94 at Livernois" autocomplete="off" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:transparent;color:inherit;font-size:15px;font-family:inherit">'+
    '<div id="clsList" style="margin-top:10px"><p class="sub">Finding exits near you…</p></div>'+
    '<div style="display:flex;gap:8px;margin-top:12px">'+
    '<button id="clsGo" style="flex:1;border:none;border-radius:12px;padding:13px;background:#FF3B30;color:#fff;font-weight:800;font-size:15px">Report closed</button>'+
    '<button id="clsX" style="border:1px solid var(--line);border-radius:12px;padding:13px 16px;background:transparent;color:inherit;font-size:15px">Cancel</button></div>';
  document.body.appendChild(wrap);
  const kill=()=>{ try{ if(vv){ vv.removeEventListener("resize",liftForKeyboard); vv.removeEventListener("scroll",liftForKeyboard); } }catch(e){} try{wrap.remove();}catch(e){} };
  wrap.querySelector("#clsX").onclick=kill;
  let picked=null;
  // ── live road/place search as you type (this was missing — typing found nothing) ──
  const inp=wrap.querySelector("#clsInput");
  const list0=()=>wrap.querySelector("#clsList");
  let clsTimer=null, clsAbort=null;
  const renderClsRows=(rows,emptyMsg)=>{
    const list=list0(); if(!list) return;
    if(!rows||!rows.length){ list.innerHTML='<p class="sub">'+(emptyMsg||"No matches — type a bit more.")+'</p>'; return; }
    list.innerHTML="";
    rows.forEach(x=>{
      const row=document.createElement("div");
      row.style.cssText="display:flex;align-items:center;gap:10px;padding:11px 8px;border-bottom:1px solid rgba(127,127,127,.14);cursor:pointer";
      const dist=(x.d!=null&&isFinite(x.d))?('<small style="color:var(--mute);font-size:12px">'+fmtDist(x.d)+' away</small>'):'';
      row.innerHTML='<span style="font-size:15px">'+(x.icon||"🛣")+'</span><span style="flex:1;min-width:0"><b style="display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+x.name+'</b>'+dist+'</span>';
      row.onclick=()=>{ picked=x; inp.value=x.name; list.querySelectorAll("div").forEach(r=>r.style.background=""); row.style.background="rgba(127,127,127,.14)"; };
      list.appendChild(row);
    });
  };
  const clsSearch=(q)=>{
    if(clsAbort){ try{clsAbort.abort();}catch(e){} }
    clsAbort=new AbortController();
    const ll=S.pos?("&lat="+S.pos.lat+"&lon="+S.pos.lng):"";
    fetch("https://photon.komoot.io/api/?limit=8&lang=en"+ll+"&q="+encodeURIComponent(q),{signal:clsAbort.signal})
      .then(r=>r.json())
      .then(d=>{
        const rows=(d.features||[]).map(f=>{
          const p=f.properties||{}, c=(f.geometry&&f.geometry.coordinates)||[0,0];
          const nm=[p.name||p.street,p.city||p.town||p.village,p.state].filter(Boolean).join(", ")||p.name||"Unnamed";
          return {name:nm,lat:c[1],lng:c[0],d:(S.pos?distM(S.pos,{lat:c[1],lng:c[0]}):null),icon:"📍"};
        }).filter(r=>r.name&&isFinite(r.lat));
        renderClsRows(rows,"No matches — try the road name.");
      })
      .catch(e=>{ if(e.name!=="AbortError") renderClsRows(null,"Search unavailable — type the location and tap Report."); });
  };
  inp.addEventListener("input",()=>{
    picked=null;
    const q=inp.value.trim();
    clearTimeout(clsTimer);
    if(q.length<3){ return; }   // keep the nearby-exits list until they actually type
    clsTimer=setTimeout(()=>clsSearch(q),200);
  });
  wrap.querySelector("#clsGo").onclick=()=>{
    const typed=(wrap.querySelector("#clsInput").value||"").trim();
    const where=picked?picked.name:typed;
    if(!where){ toast("Add an exit or description first.",2400); return; }
    kill();
    reportHazard("road_closure","Closed at "+where);
  };
  const exits=await nearbyExits();
  const list=wrap.querySelector("#clsList"); if(!list) return;
  if(!exits.length){ list.innerHTML='<p class="sub">No exits found nearby — type the location instead.</p>'; return; }
  list.innerHTML="";
  exits.forEach(x=>{
    const row=document.createElement("div");
    row.style.cssText="display:flex;align-items:center;gap:10px;padding:11px 8px;border-bottom:1px solid rgba(127,127,127,.14);cursor:pointer";
    row.innerHTML='<span style="font-size:15px">🛣</span><span style="flex:1;min-width:0"><b style="display:block;font-size:14.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+x.name+'</b><small style="color:var(--mute);font-size:12px">'+fmtDist(x.d)+' away</small></span>';
    row.onclick=()=>{
      picked=x;
      wrap.querySelector("#clsInput").value=x.name;
      list.querySelectorAll("div").forEach(r=>r.style.background="");
      row.style.background="rgba(127,127,127,.14)";
    };
    list.appendChild(row);
  });
}
