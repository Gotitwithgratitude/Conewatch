"use strict";
/* ═══════════ ConeWatch Pro Max — app.js ═══════════ */

const HZ_META = {
  construction_cones:{emoji:"🚧",color:"#FF6B1A",label:"Construction"},
  pothole:{emoji:"🕳",color:"#E5484D",label:"Pothole"},
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
const APP_VERSION="v92";

/* ══════════════════════════════════════════════════════════════════
   ONE-TIME OWNER SETUP — paste your codes here once, they apply to
   EVERY user automatically. Drivers never see or touch any of this.
   Leave blank = app still works (keyless Esri map, reports stay local).
   ══════════════════════════════════════════════════════════════════ */
const CW_CONFIG = {
  maptilerKey: "",
  cartoKey: "",   // optional free key from carto.com/basemaps/apikey (else keyless Esri tiles are used)   // ← (optional) free MapTiler key → sharp HD satellite for ALL users
  supabaseUrl: "https://fcywpeulilndeinzckdl.supabase.co",   // shared network — LIVE
  supabaseKey: "sb_publishable_ToEAvzA2sQN269M3Lv8LOg_2wK55NWC"
};
const PROFILES = { car:"routed-car/route/v1/driving", bike:"routed-bike/route/v1/driving", foot:"routed-foot/route/v1/driving", hike:"routed-foot/route/v1/driving" };
const ACCENT = { dark:{route:"#35E0C8",casing:"#0A3B33"}, light:{route:"#1D6EF2",casing:"#0A2E66"} };

const S = {
  pos:null, lastPos:null, accuracy:null, course:null, compass:null,
  follow:true, headingUp:false, watchId:null, saver:false, audioAlerts:true, bumpOn:true, heatOn:true,
  mode:"car", dest:null, destName:"", stops:[],
  route:null, steps:[], stepIdx:0, navigating:false, offRouteCount:0, rerouting:false, avoidHandled:new Set(),
  hazards:[], alerted:new Set(), sb:{url:"",key:""},
  speedMph:0, tripM:0, is3d:false, mapReady:false,
  themeMode:"auto", themeNow:"dark", sun:{rise:7.0, set:19.2}, lux:null,
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
  $("clockTime").textContent=new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
  $("clockTheme").textContent=S.themeMode.toUpperCase()+(S.themeMode==="auto"?(next==="light"?" ☀":" ☾"):"");
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
  const url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
  const paint = dark
    ? {"raster-brightness-max":0.42,"raster-brightness-min":0.02,"raster-saturation":-0.35,"raster-contrast":0.12}
    : {};
  return { version:8,
    sources:{ basemap:{ type:"raster", tiles:[url], tileSize:256, maxzoom:19, attribution:"© Esri, © OpenStreetMap contributors" }},
    layers:[{id:"bg",type:"background",paint:{"background-color":dark?"#101215":"#E9ECEF"}},{id:"basemap",type:"raster",source:"basemap",paint:paint}] };
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
  const url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}";
  const paint = dark
    ? {"raster-brightness-max":0.42,"raster-brightness-min":0.02,"raster-saturation":-0.35,"raster-contrast":0.12,"raster-opacity":1}
    : {"raster-opacity":1};
  return {version:8,
    sources:{basemap:{type:"raster",tiles:[url],tileSize:256,minzoom:0,maxzoom:19,attribution:"© Esri, © OpenStreetMap contributors"}},
    layers:[{id:"bg",type:"background",paint:{"background-color":dark?"#0E1013":"#EAE6DF"}},
            {id:"basemap",type:"raster",source:"basemap",paint:paint}]};
}
async function styleFor(theme){
  return rasterStyleObj(theme!=="light");   // raster PNG = reliably cacheable offline
}
let map, meMarker, destMarker;
const stopMarkers=[]; const hzMarkers=[];
// time-to-live in minutes, grounded in real incident-clearance data (urban avg ~25-30 min, 45 = short/long threshold, rural/major longer).
// 0 = permanent infrastructure — stays until a driver confirms it's fixed/gone. User confirms FRESHEN the timer (self-correcting).
const HAZ_TTL={ pothole:0, construction_cones:0, camera:0, road_closure:120, accident:45, police:20, emergency:15, traffic:30, stalled:45, debris:60, animal:30, flooding:180, ice:180, alert:60 };
function _ago(ts){ const m=Math.floor((Date.now()-(ts||Date.now()))/60000); return m<1?"just now":m<60?m+"m ago":Math.floor(m/60)+"h "+ (m%60) +"m ago"; }
function hazPopupHTML(h){
  const m=HZ_META[h.type]||HZ_META.debris;
  const perm=HAZ_TTL[h.type]===0;
  const goneLabel=perm?"✗ Fixed":"✗ Gone";
  return `<div style="min-width:150px"><b style="color:${m.color}">${m.emoji} ${m.label}</b><br>`+
    `<span style="font-size:12px">${h.note||"Driver report"}</span><br>`+
    `<span style="font-size:11px;opacity:.6">${h.reports||1} report${(h.reports||1)>1?"s":""} · ${_ago(h.ts)}</span>`+
    `<div style="display:flex;gap:6px;margin-top:8px">`+
    `<button onclick="cwConfirm('${h.id}')" style="flex:1;border:none;border-radius:8px;padding:7px;background:#34c759;color:#fff;font-weight:700;font-size:12px">✓ Still here</button>`+
    `<button onclick="cwGone('${h.id}')" style="flex:1;border:none;border-radius:8px;padding:7px;background:#e5484d;color:#fff;font-weight:700;font-size:12px">${goneLabel}</button>`+
    `</div></div>`;
}
function refreshHazPopup(h){ try{ if(h._marker&&h._marker.getPopup())h._marker.getPopup().setHTML(hazPopupHTML(h)); }catch(e){} }
// confirm = "still here": bumps count AND freshens the timer (crowd feedback keeps live reports alive, lets stale ones expire)
window.cwConfirm=function(id){ const h=S.hazards.find(x=>x.id===id); if(!h)return; h.reports=(h.reports||1)+1; h.ts=Date.now(); refreshHazPopup(h); if(h.type==="pothole"&&h._marker){try{h._marker.getElement().style.background=(h.reports>=5?"#E5484D":(h.reports>=2?"#FF8A1E":"#FFC72C"));}catch(e){}} toast(`Confirmed ✓ · ${h.reports} reports`); if(navigator.vibrate)navigator.vibrate(30); };
// gone/fixed: temporary needs 1 vote, permanent needs 2 (avoids accidental removal of a real pothole)
window.cwGone=function(id){ const i=S.hazards.findIndex(x=>x.id===id); if(i<0)return; const h=S.hazards[i]; h.gone=(h.gone||0)+1; const need=HAZ_TTL[h.type]===0?2:1;
  if(h.gone>=need){ try{if(h._marker)h._marker.remove();}catch(e){} S.hazards.splice(i,1); toast("Cleared — thanks for the update"); }
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
  map=new maplibregl.Map({ container:"map", style, center:[-83.0790,42.3316], zoom:14.5, pitch:0, bearing:0, attributionControl:true });
  map.on("load",()=>{ S.mapReady=true; addMapLayers(); initUserMarker();
    if(S.queuedTheme&&S.queuedTheme!==mapStyleTheme) swapMapStyle(S.queuedTheme);
    if(seenWelcome()){ startGPS(); if(S.sb.url&&S.sb.key) loadSharedHazards(); if(!tutSeen()){ setTimeout(startTutorial,700); } else { toast("ConeWatch Pro — search a destination, or tap ⋯ for tools."); } }
    else $("welcome").style.display="flex"; });
  const mc=map.getCanvasContainer();
  ["touchstart","mousedown"].forEach(ev=>mc.addEventListener(ev,()=>{S.touching=true;},{passive:true}));
  ["touchend","touchcancel","mouseup"].forEach(ev=>mc.addEventListener(ev,()=>{setTimeout(()=>{S.touching=false;},350);},{passive:true}));
  map.on("dragstart",()=>{ S.follow=false; updateFollowUI(); clearTimeout(_reCenterT);
    // auto-recenter after a few seconds of no interaction (no button needed)
    _reCenterT=setTimeout(()=>{ if(!S.touching){ S.follow=true; updateFollowUI(); hideRelock(); cameraFollow(); } }, S.navigating?6000:9000);
  });
  map.on("moveend",()=>{ if(!S.follow && S.mapReady) startRelock(); });
  map.on("error",()=>{});
  applyTheme(true);
})();

function heatFeatures(){
  const f=[];
  // reported potholes/impacts weigh heavy
  (S.hazards||[]).forEach(hz=>{ if(hz.type==="pothole"||hz.type==="debris"){ f.push({type:"Feature",properties:{w:Math.min(1,(hz.reports||1)/4)},geometry:{type:"Point",coordinates:[hz.lng,hz.lat]}}); } });
  // plus this driver's own sensed roughness
  (roughPts||[]).forEach(p=>{ f.push({type:"Feature",properties:{w:p.s||0.4},geometry:{type:"Point",coordinates:[p.lng,p.lat]}}); });
  return {type:"FeatureCollection",features:f};
}
function refreshHeat(){ try{ if(map.getSource("rough"))map.getSource("rough").setData(heatFeatures()); }catch(e){} }
function ensureHeatLayer(){
  if(!map.getSource("rough"))map.addSource("rough",{type:"geojson",data:heatFeatures()});
  if(!map.getLayer("rough-heat"))map.addLayer({id:"rough-heat",type:"heatmap",source:"rough",maxzoom:18,paint:{
    "heatmap-weight":["get","w"],
    "heatmap-intensity":["interpolate",["linear"],["zoom"],10,1,18,3],
    "heatmap-color":["interpolate",["linear"],["heatmap-density"],0,"rgba(0,0,0,0)",0.2,"#2ecc71",0.45,"#f1c40f",0.7,"#e67e22",1,"#e74c3c"],
    "heatmap-radius":["interpolate",["linear"],["zoom"],10,12,16,34],
    "heatmap-opacity":0.75
  }});
}
function toggleHeat(){
  S.heatOn=!S.heatOn;
  if(S.heatOn){ ensureHeatLayer(); refreshHeat(); try{map.setLayoutProperty("rough-heat","visibility","visible");}catch(e){} toast("🌡️ Road-quality heatmap ON — green=smooth, red=rough"); }
  else { try{map.setLayoutProperty("rough-heat","visibility","none");}catch(e){} toast("Heatmap off"); }
  const b=$("heatState"); if(b)b.textContent=S.heatOn?"On — pothole & rough-road density":"Off";
}
function addMapLayers(){
  const a=ACCENT[S.themeNow];
  if(!map.getSource("route")) map.addSource("route",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("route-casing")) map.addLayer({id:"route-casing",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":a.casing,"line-width":["interpolate",["linear"],["zoom"],10,7,14,13,18,22],"line-opacity":.95}});
  if(!map.getLayer("route-line")) map.addLayer({id:"route-line",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":a.route,"line-width":["interpolate",["linear"],["zoom"],10,4.5,14,9,18,15]}});
  if(!map.getLayer("route-core")) map.addLayer({id:"route-core",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":"rgba(255,255,255,.82)","line-width":["interpolate",["linear"],["zoom"],10,1.4,14,2.6,18,4.2]}});
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
function swapMapStyle(theme){
  if(styleSwapping)return;
  // NEVER restyle mid-navigation — setStyle wipes every layer (incl. the route line). Defer until the drive ends.
  if(S.navigating){ S.pendingTheme=theme; return; }
  styleSwapping=true;
  styleFor(theme).then(st=>{
    // register BEFORE setStyle so the restore can't be missed (this race was killing the route line)
    const done=()=>{ mapStyleTheme=theme; styleSwapping=false; addMapLayers(); ensureRouteLayers(); };
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
    if(!map.getSource("route")||!map.getLayer("route-line")) addMapLayers();
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
    if(accuracy!=null && accuracy>2000){ return; }              // wait for a usable first fix
  } else {
    const _jump=distM(S.pos,_new), _dt=Math.max(0.001,(_new.t-S.pos.t)/1000);
    const _teleport=(_jump>150 && (_jump/_dt)>100);             // >~224 mph between fixes = not real
    if((_accBad || _teleport) && (S.goodFixes||0)>0){ S.accuracy=accuracy; return; }
  }
  if(!_accBad) S.goodFixes=(S.goodFixes||0)+1;
  S.lastPos=S.pos; S.pos=_new; S.accuracy=accuracy;
  if(heading!==null && !isNaN(heading)) S.course=heading;
  else if(S.lastPos && distM(S.lastPos,S.pos)>3) S.course=bearing(S.lastPos,S.pos);

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
  if(meMarker && !meMarker._map){ meMarker.addTo(map); map.easeTo({center:[_dispLng,_dispLat],zoom:16,duration:800}); toast("GPS locked ✓"); }
  if(meMarker && !S.navigating){ meMarker.setLngLat([_dispLng,_dispLat]); if(S.course!==null) meMarker.setRotation(S.course); }
  if(!sunLoaded){ sunLoaded=true; loadSunTimes(); }

  autoParkWatch();
  updateCompassUI(); cameraFollow();
  $("rsLoc").textContent=`You are at ${lat.toFixed(5)}, ${lng.toFixed(5)} (±${Math.round(accuracy)} m)`;
  $("sosCoords").textContent=`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  if(S.navigating) navTick();
}
function onPosErr(e){
  const msgs={1:"Location denied — enable it in browser settings. (Previews often block GPS; the deployed HTTPS site works.)",2:"Position unavailable — move near a window.",3:"GPS timeout — retrying…"};
  toast(msgs[e.code]||"GPS error.");
  if(e.code===3) startGPS();
}
let lastFollow=0,lastFixT=0;
let _lastCamPos=null, _reCenterT=null;
// speed-based zoom: highway pulls back to see ahead, city tightens in — automatic, no control
function speedZoom(){ const mph=S.speedMph||0; if(mph>65)return 15.2; if(mph>45)return 15.8; if(mph>25)return 16.4; return 17.0; }
function cameraFollow(){
  if(!S.follow||!S.pos||!S.mapReady||S.touching) return;
  const now=Date.now();
  const cp=S.dispPos||S.pos;
  if(S.navigating){
    // stationary (light/traffic) → skip re-centering; nothing moved, so don't repaint
    if(S.speedMph<1.2 && _lastCamPos && distM(_lastCamPos,cp)<3){ return; }
    _lastCamPos={lat:cp.lat,lng:cp.lng};
    const dur=Math.min(1600,Math.max(300,lastFixT?now-lastFixT:800));
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
  let best=null;
  for(let i=0;i<co.length-1;i++){
    const a=co[i], b=co[i+1];
    const q=_projPointToSeg(pt.lng,pt.lat,a[0],a[1],b[0],b[1]);
    const d=distM(q,pt);
    if(!best||d<best.dist){ best={dist:d,lat:q.lat,lng:q.lng,a:a,b:b}; }
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
function rushFactor(){const h=new Date().getHours()+new Date().getMinutes()/60;return (S.mode==="car"&&((h>=7&&h<=9)||(h>=16&&h<=18.5)))?1.28:1;}

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
  try{(QK.recents||[]).forEach(r=>{if(r.name.toLowerCase().includes(ql))out.push({name:r.name,label:"Recent",lat:r.lat,lng:r.lng});});}catch{}
  if(QK.home&&"home".includes(ql))out.push({name:"Home",label:"Saved",lat:QK.home.lat,lng:QK.home.lng});
  if(QK.work&&"work".includes(ql))out.push({name:"Work",label:"Saved",lat:QK.work.lat,lng:QK.work.lng});
  return out.slice(0,8);
}
async function suggest(q){
  if(!navigator.onLine){ renderResults(offlineMatches(q)); return; }
  if(acCache.has(q)){renderResults(acCache.get(q));return;}
  if(acAbort) acAbort.abort();
  acAbort=new AbortController();
  let items=[];
  try{
    let u=`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`;
    if(S.pos)u+=`&lat=${S.pos.lat}&lon=${S.pos.lng}`;
    const d=await (await fetch(u,{signal:acAbort.signal})).json();
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
      const list=await (await fetch(url,{signal:acAbort.signal,headers:{Accept:"application/json"}})).json();
      items=(list||[]).map(r=>({name:r.display_name.split(",")[0],label:r.display_name.split(",").slice(1,4).join(",").trim(),lat:+r.lat,lng:+r.lon}));
    }catch(e){ if(e.name==="AbortError")return; }
  }
  const toks=q.toLowerCase().split(/\s+/).filter(w=>w.length>1);
  items=items.map(r=>{ const lbl=((r.name||"")+" "+(r.label||"")).toLowerCase(); const nm=toks.filter(t=>lbl.indexOf(t)>-1).length; return {...r,_d:S.pos?distM(S.pos,r):0,_n:nm}; })
    .sort((a,b)=>(b._n-a._n)||(a._d-b._d));
  acCache.set(q,items); if(acCache.size>60) acCache.delete(acCache.keys().next().value);
  renderResults(items);
}
function poiIcon(r){
  const s=((r.name||"")+" "+(r.label||"")).toLowerCase();
  if(/\bhome\b/.test(s))return["🏠","#3AA0FF"];
  if(/\bwork|office\b/.test(s))return["💼","#2B6FE0"];
  if(/coffee|cafe|starbucks|dunkin/.test(s))return["☕","#B5651D"];
  if(/gas|fuel|shell|marathon|bp|sunoco|mobil/.test(s))return["⛽","#E8A020"];
  if(/restaurant|grill|pizza|food|kitchen|diner/.test(s))return["🍽","#E0602B"];
  if(/hotel|motel|inn|suites/.test(s))return["🛎","#8A5CF6"];
  if(/hospital|clinic|medical|pharmacy/.test(s))return["➕","#E5484D"];
  if(/park|trail|garden/.test(s))return["🌳","#2F9E5B"];
  if(/store|shop|mall|market|target|walmart/.test(s))return["🛍","#D0459B"];
  if(/school|college|university/.test(s))return["🎓","#3B82F6"];
  return["📍","#FF4B6E"];
}
function renderResults(list){
  const box=$("results"); box.innerHTML="";
  const q=$("search").value.trim();
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
  const el=document.createElement("div");el.className="dest-flag";el.textContent="🏁";
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
    try{ return await raceJSON([primary,backup],isOk,6000); }
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
  return await osrmFetch(coordsStr);
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

async function fetchRoute(silent){
  if(!S.pos||!S.dest) return;
  // A stuck "in flight" flag used to wedge routing permanently: if any routing request hung,
  // every later request returned instantly and the route card never opened. Now it expires.
  if(S.rerouting){
    if(Date.now()-(S._reroutingAt||0) < 20000) return;
    S.rerouting=false;                                   // previous attempt clearly died — move on
  }
  if(!navigator.onLine){ if(!silent)toast("Offline — showing your saved route. It stays active.",3200); return; }
  S.rerouting=true; S._reroutingAt=Date.now();
  try{
    const data=await Promise.race([
      routeFetch([(S.origin||S.pos),...S.stops,S.dest]),
      new Promise(res=>setTimeout(()=>res({code:"Timeout"}),18000))     // never wait forever
    ]);
    if(data&&data.code==="Timeout"){ toast("Routing is slow right now — try again.",3000); return; }
    if(!data||data.code!=="Ok"||!data.routes||!data.routes.length){toast("No route found for this mode.",2600);return;}
    const r=data.routes[0];
    S.route=r;S.steps=r.legs.flatMap(l=>l.steps);S.stepIdx=0;S.offRouteCount=0;S.alerted.clear();
    S._ri=undefined;S._riT=0;                      // reset along-route progress cache for the new line
    try{map.getSource("route").setData({type:"Feature",geometry:r.geometry});}catch{}
    try{refreshRouteCondition();}catch(e){}
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
function renderRouteSheet(r){
  const el=(id)=>{ try{ return $(id); }catch(e){ return null; } };
  const setTxt=(id,v)=>{ const e=el(id); if(e) e.textContent=v; };
  setTxt("rsTitle",S.destName);
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
  if(el("tripStats")) $("tripStats").innerHTML=`
    <div class="kv"><span>Est. fuel cost</span><span>$${fuel} (${gal.toFixed(1)} gal @ ${mpg} mpg)</span></div>
    <div class="kv"><span>Road character</span><span>${curve.label} · ${curve.turns} sharp turns</span></div>
    <div class="kv"><span>Weather at destination</span><span id="wxDest">loading…</span></div>
    <div class="kv"><span>Elevation</span><span id="elevStat">loading…</span></div>`;
  const ol=el("steps"); if(ol) ol.innerHTML="";
  S.steps.forEach((st,i)=>{
    const li=document.createElement("li");
    li.innerHTML=`<span class="n">${i+1}</span><span>${stepText(st)}</span><span class="d">${fmtDist(st.distance)}</span>`;
    if(ol) ol.appendChild(li);
  });
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
  S.navigating=true;S.follow=true;S.headingUp=true;updateFollowUI();updateCompassUI();
  try{$("confirmBar").style.display="none";}catch(e){}   // clean hand-off — no overlapping cards
  closeSheets();
  $("navbanner").style.display="block";
  $("navPill").style.display="flex";
  $("roadPill").style.display="flex";
  try{cameraFollow();}catch(e){} try{navTick();}catch(e){} try{loadWeather();}catch(e){}
  try{startSmooth();}catch(e){} try{setDrivingChrome(true);}catch(e){}
  document.body.classList.add("driving"); layout();
  try{if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});}catch{}
  requestWakeLock(); requestMotion();
  pollLimit(); clearInterval(limitTimer); limitTimer=setInterval(pollLimit,18000);
  speak("Starting navigation to "+S.destName+".");
  toast("Navigation started — drive safe. Screen will stay awake.");
}
function endNavigation(){
  S.navigating=false;S.headingUp=false;S.remoteStart=false;stopSmooth();try{setDrivingChrome(false);}catch(e){}
  try{ if(S.pendingTheme){ const t=S.pendingTheme; S.pendingTheme=null; swapMapStyle(t); } }catch(e){}
  try{speechSynthesis.cancel();}catch{}
  document.body.classList.remove("driving"); layout();
  try{if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});}catch{}
  hideRelock();
  $("navbanner").style.display="none";$("navPill").style.display="none";$("roadPill").style.display="none";$("hud").style.display="none";
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
  $("nbDist").textContent=fmtDist(dNext);
  const destBig=cur.destinations?String(cur.destinations).split(",")[0].split(";")[0].trim():null;
  $("nbInstr").textContent=destBig||stepText(cur);
  const ref=cur.ref?String(cur.ref).split(";")[0].trim():"";
  if(ref){$("nbRef").innerHTML=shieldHTML(ref);$("nbRef").style.cssText="display:flex;background:none;padding:0";}else $("nbRef").style.display="none";
  const rn=cur.name||"";
  if(rn){$("roadName").textContent=rn;
    if(ref){$("roadRef").innerHTML=shieldHTML(ref);$("roadRef").style.cssText="display:flex;background:none;padding:0;min-width:auto;height:auto";}
    else $("roadRef").style.display="none";
    $("roadPill").style.display="flex";
  } else $("roadPill").style.display="none";
  $("nbGlyph").textContent=maneuverGlyph(cur);
  if(cur.exits){$("nbExit").textContent="Exit "+String(cur.exits).split(";")[0];$("nbExit").style.display="block";}
  else $("nbExit").style.display="none";
  renderLanes(cur);
  $("hudDist").textContent=fmtDist(dNext);
  $("hudInstr").textContent=stepText(cur);
  $("hudSpeed").textContent=Math.round(S.speedMph);

  // spoken guidance
  // Speed-aware guidance: at highway speed you need MILES of warning, not 380 metres.
  // Stages fire on time-to-maneuver so they scale from city streets to 70mph freeway.
  if(S.stepIdx!==S.annStep){S.annStep=S.stepIdx;S.annStage=0;}
  const _mps=Math.max(4,(S.speedMph||0)*0.44704);
  const _secs=dNext/_mps;                                  // seconds until the maneuver
  const _fast=(S.speedMph||0)>45;
  const _isExit=/ramp|exit|fork|merge/.test((cur.maneuver&&cur.maneuver.type)||"");
  const _lbl=(cur.exits?("exit "+String(cur.exits).split(";")[0]+", "):"")+stepText(cur);
  if(S.annStage<3 && dNext<75){                            // final: act now
    S.annStage=3; turnCue(2); speak(stepText(cur));
  } else if(S.annStage<2 && (_secs<22 || dNext<380)){      // ~quarter mile at speed
    S.annStage=2; turnCue(2); speak("In "+spokenDist(dNext)+", "+_lbl);
  } else if(S.annStage<1 && _fast && (_secs<60 || dNext<1600) && (_isExit||dNext<1600)){
    S.annStage=1; turnCue(1); speak("In "+spokenDist(dNext)+", "+_lbl);   // ~1 mile heads-up
  } else if(S.annStage<0.5 && _fast && _isExit && _secs<130){
    S.annStage=0.5; speak("In "+spokenDist(dNext)+", "+_lbl);             // ~2 mile early warning
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
    let onPath=true;
    try{
      if(S.route&&S.route.geometry){
        const co=S.route.geometry.coordinates;
        let best=Infinity;
        for(let k=0;k<co.length;k+=2){ const dd=distM({lat:co[k][1],lng:co[k][0]},h); if(dd<best)best=dd; if(best<25)break; }
        onPath = best<45;
      }
    }catch(e){}
    if(!onPath) return;
    const k1="w1_"+i, k2="w2_"+i;
    if(d<70) notePassed(h);
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
    // A WRONG TURN shows up as heading divergence long before distance does — catch it immediately.
    let turnedOff=false;
    try{
      const sn=snapToRoute(S.pos);
      if(sn && S.course!==null && (S.speedMph||0)>4){
        let diff=Math.abs(((S.course-sn.bearing+540)%360)-180);
        if(diff>55 && dR>20) turnedOff=true;      // pointing well away from the route = you left it
      }
    }catch(e){}
    if(dR>thresh || turnedOff){
      const need=(dR>130||turnedOff)?1:2;          // far off, or clearly turned away → reroute now
      if(++S.offRouteCount>=need && Date.now()-(S.lastReroute||0)>7000){
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
  for(let i=ni;i<co.length-1;i++){ ahead.push(co[i]); acc+=distM({lat:co[i][1],lng:co[i][0]},{lat:co[i+1][1],lng:co[i+1][0]}); if(acc>1800)break; }
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
      const clear=data.routes.filter(rt=>!avoid.some(h=>routeNearPoint(rt.geometry.coordinates,h,45)));
      const r=clear[0]||data.routes[0];
      S.route=r;S.steps=r.legs.flatMap(l=>l.steps);S.stepIdx=0;S.offRouteCount=0;S.alerted.clear();
      try{map.getSource("route").setData({type:"Feature",geometry:r.geometry});}catch(e){}
      if(clear.length){ speak("Reported closure ahead. Rerouting around it."); toast("↩ Rerouted around a reported blockage",2800); }
      else { speak("Rerouting."); toast("Rerouting…",1600); }
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
    return;
  }
  // close now: sharper double tone + short spoken cue
  toast(`${m.emoji} ${sizeTxt}${m.label} — right ahead`,3000);
  try{ beep(760,.11,.22); setTimeout(()=>beep(980,.14,.24),150); }catch(e){}
  try{ if(S.voiceOn)speak((sizeTxt?sizeTxt:"")+m.label+" ahead"); }catch(e){}
  if(navigator.vibrate)navigator.vibrate([70,50,70]);
  try{ pulseHazard(h); }catch(e){}
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
function addHazardMarker(h){
  if(!h.id)h.id="h"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  if(!h.ts)h.ts=h.created_at?Date.parse(h.created_at)||Date.now():Date.now();
  const m=HZ_META[h.type]||HZ_META.debris;
  const el=document.createElement("div");el.className="hz";
  if(h.type==="pothole"){
    if(!h.psev && /size:\s*Large/i.test(h.note||"")) h.psev=3;
    else if(!h.psev && /size:\s*Medium/i.test(h.note||"")) h.psev=2;
    else if(!h.psev && /size:\s*Small/i.test(h.note||"")) h.psev=1;
    el.style.background=potColor(h);
    const sc=potScale(h);
    // Size via width/height — MapLibre writes `transform` on this element to position it,
    // so scaling with transform detached the marker and made it drift on zoom.
    const base=30, px=Math.round(base*sc);
    el.style.width=px+"px"; el.style.height=px+"px";
    el.style.fontSize=Math.round(15*sc)+"px";
    el.style.boxShadow="0 0 0 "+(2+sc*2).toFixed(0)+"px "+potColor(h)+"33";
    el.dataset.basePx=px;
  } else el.style.background=m.color;
  el.textContent=m.emoji;
  const mk=new maplibregl.Marker({element:el}).setLngLat([h.lng,h.lat])
    .setPopup(new maplibregl.Popup({offset:16}).setHTML(hazPopupHTML(h)))
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
async function reportHazard(type,note,psev,skipPick){
  if(!S.pos){toast("Need a GPS lock to report.");return;}
  if(type==="pothole" && !psev){ askPotholeSize(note); return; }
  if(type==="camera" && !skipPick){ askCameraType(note); return; }
  closeSheets(); if(navigator.vibrate)navigator.vibrate(40);
  // MERGE: an existing report of the SAME type within ~35m gets confirmed (count++), not duplicated.
  // Different hazard types at the same spot each keep their own pin.
  const near=S.hazards.find(x=>x.type===type && distM(S.pos,{lat:x.lat,lng:x.lng})<35);
  if(near){
    near.reports=(near.reports||1)+1; near.ts=Date.now(); refreshHazPopup(near);
    if(type==="pothole"&&near._marker){try{near._marker.getElement().style.background=(near.reports>=5?"#E5484D":(near.reports>=2?"#FF8A1E":"#FFC72C"));}catch(e){}}
    toast(`${HZ_META[type].label} confirmed ✓ · ${near.reports} reports`);
    if(S.sb.url&&S.sb.key){ try{ await fetch(`${S.sb.url}/rest/v1/hazards`,{method:"POST",headers:sbH({"Content-Type":"application/json"}),body:JSON.stringify({type,lat:S.pos.lat,lng:S.pos.lng,note:note||"confirm",sev:2,reports:1})}); }catch(e){} }
    return;
  }
  const _p=((type==="pothole"||type==="debris")&&S.course!=null&&!isNaN(S.course))?(function(){const rad=(S.course+90)*Math.PI/180,dM=4;return{lat:S.pos.lat+(dM*Math.cos(rad))/111111,lng:S.pos.lng+(dM*Math.sin(rad))/(111111*Math.cos(S.pos.lat*Math.PI/180))};})():{lat:S.pos.lat,lng:S.pos.lng};
  const h={id:"h"+Date.now().toString(36)+Math.random().toString(36).slice(2,6),ts:Date.now(),gone:0,type,lat:_p.lat,lng:_p.lng,note:note||"Driver report",sev:type==="accident"?4:2,reports:1,psev:psev||undefined};
  S.hazards.push(h);addHazardMarker(h);
  toast(`${HZ_META[type].label} reported ✓`);
  if(S.sb.url&&S.sb.key){
    try{
      const payload={type:h.type,lat:h.lat,lng:h.lng,note:(h.psev?("size:"+POT_SEV[h.psev].label+(h.note?" · "+h.note:"")):(h.note||"")),sev:h.psev||h.sev||2,reports:h.reports||1};
      const r=await fetch(`${S.sb.url}/rest/v1/hazards`,{method:"POST",headers:sbH({"Content-Type":"application/json",Prefer:"return=minimal"}),body:JSON.stringify(payload)});
      if(!r.ok)toast("Saved on your map — cloud sync failed ("+r.status+")");
    }catch(e){ toast("Saved on your map — offline, will show for you"); }
  }
}
document.querySelectorAll("#reportSheet [data-type]").forEach(b=>b.onclick=()=>{
  try{if(navigator.vibrate)navigator.vibrate(40);}catch(e){}
  if(b.dataset.closure){ closeSheets(); try{reportClosure();}catch(e){ reportHazard("road_closure"); } return; }
  reportHazard(b.dataset.type);
});
async function loadSharedHazards(){
  if(!S.sb.url||!S.sb.key){toast("Add your Supabase URL + key first.");return;}
  try{
    const rows=await (await fetch(`${S.sb.url}/rest/v1/hazards?select=*&order=created_at.desc&limit=300`,{headers:sbH()})).json();
    if(Array.isArray(rows)){hzMarkers.forEach(m=>m.remove());hzMarkers.length=0;S.hazards=rows;S.alerted.clear();rows.forEach(addHazardMarker);if(S.heatOn)refreshHeat();toast(`Loaded ${rows.length} shared reports ✓`);}
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
function updateCompassUI(){
  const deg=S.course!==null?S.course:(S.compass!==null?S.compass:null);
  if(deg===null){$("compDeg").textContent="N";return;}
  const dirs=["N","NE","E","SE","S","SW","W","NW"];
  $("compDeg").textContent=`${dirs[Math.round(deg/45)%8]} ${Math.round(deg)}°`;
  $("needle").style.transform=`rotate(${-(map?map.getBearing():0)+(S.headingUp?0:deg)}deg)`;
  $("compass").classList.toggle("hup",S.headingUp);
}
$("compass").onclick=async()=>{
  await requestMotion();
  S.headingUp=!S.headingUp;
  toast(S.headingUp?"Heading-up — map rotates with you":"North-up");
  if(!S.headingUp)map.easeTo({bearing:0});
  cameraFollow();updateCompassUI();
};
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
    if(e.webkitCompassHeading!==undefined)S.compass=e.webkitCompassHeading;
    else if(e.alpha!==null)S.compass=(360-e.alpha)%360;
    if(S.speedMph<2&&S.compass!==null&&!S.navigating)S.course=S.compass;
    updateCompassUI();
  });
  window.addEventListener("devicemotion",onMotion);
}
// impact detection → road-roughness logging + pothole prompt (the road-quality moat)
let lastBump=0;
function onMotion(e){
  if(!S.bumpOn||S.speedMph<8)return;
  const a=e.accelerationIncludingGravity;if(!a)return;
  const mag=Math.sqrt((a.x||0)**2+(a.y||0)**2+(a.z||0)**2);
  // baseline gravity ~9.8; anything well above = a jolt. Scale to a 0..1 roughness score.
  const jolt=mag-9.8;
  if(jolt>9 && S.pos){
    // silently log every real jolt as a road-roughness point (feeds the heatmap) — no prompt, no spam
    roughLog(S.pos.lat,S.pos.lng,Math.min(1,(jolt-9)/22));
  }
  if(mag>26&&Date.now()-lastBump>8000){
    lastBump=Date.now();
    // strong hit → offer to report a pothole (severity scales with the impact)
    $("bumpBar").style.display="flex";
    beep(520,.2);if(navigator.vibrate)navigator.vibrate(60);
    setTimeout(()=>{$("bumpBar").style.display="none";},9000);
  }
}
// rolling road-roughness log (kept local + drawn as a heatmap; recent points only)
let roughPts=[]; try{ roughPts=JSON.parse(localStorage.getItem("cw_rough")||"[]"); }catch(e){}
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
function updateNet(){const el=$("netDot");if(!el)return;
  if(navigator.onLine){el.textContent="● live";el.style.color="#46C08A";}
  else{el.textContent="● offline";el.style.color="#E5A020";}}
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
$("hudBtn").onclick=()=>{pushUI();$("hud").style.display="flex";applyHudScale();};
// tap the readout area (not the buttons) to exit HUD
$("hud").addEventListener("click",(e)=>{ if(e.target.closest(".hud-ctrl"))return; $("hud").style.display="none"; });
$("hudBigger")&&($("hudBigger").onclick=(e)=>{e.stopPropagation();hudScale=Math.min(2.8,hudScale+0.3);applyHudScale();});
$("hudSmaller")&&($("hudSmaller").onclick=(e)=>{e.stopPropagation();hudScale=Math.max(0.9,hudScale-0.3);applyHudScale();});

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
  $(id).classList.add("open");pushUI();
}
document.querySelectorAll(".sheet").forEach(s=>{
  const x=document.createElement("button");
  x.className="sheetX"; x.setAttribute("aria-label","Close"); x.textContent="✕";
  x.onclick=(e)=>{e.stopPropagation();closeSheets();};
  s.appendChild(x);
});
function closeSheets(){document.querySelectorAll(".sheet").forEach(s=>s.classList.remove("open"));$("moreFabs").classList.remove("open");}
$("fabReport").onclick=()=>openSheet("reportSheet");
$("fabRoadside").onclick=()=>openSheet("roadsideSheet");
$("fabSettings").onclick=()=>openSheet("settingsSheet");
$("fabDiscover").onclick=()=>openSheet("discoverSheet");
$("fabFeedback").onclick=()=>openSheet("feedbackSheet");
$("fabMore").onclick=()=>$("moreFabs").classList.toggle("open");
$("fabLocate").onclick=()=>{hideRelock();S.follow=true;updateFollowUI();if(S.pos)map.easeTo({center:[S.pos.lng,S.pos.lat],zoom:16});else{startGPS();toast("Acquiring GPS…");}};
document.querySelectorAll(".grabber").forEach(g=>g.onclick=closeSheets);
function updateFollowUI(){$("fabLocate").classList.toggle("active",S.follow);$("followState").textContent=S.follow?"On — map recenters as you drive":"Off — tap ◎ to re-center";}
$("toggleFollow").onclick=()=>{S.follow=!S.follow;updateFollowUI();};
$("toggleSaver").onclick=()=>{S.saver=!S.saver;$("saverState").textContent=S.saver?"On — reduced GPS rate, minimal animation":"Off — full GPS rate + animations";startGPS();toast(S.saver?"Battery saver on":"Battery saver off");};
$("toggleAlerts").onclick=()=>{S.audioAlerts=!S.audioAlerts;$("alertState").textContent=S.audioAlerts?"On — beeps near hazards while navigating":"Off — visual alerts only";};
$("toggleBump").onclick=()=>{S.bumpOn=!S.bumpOn;$("bumpState").textContent=S.bumpOn?"On — hard bumps prompt a pothole report":"Off";saveSettings();};
$("toggleHeat")&&($("toggleHeat").onclick=()=>{toggleHeat();saveSettings();});
document.querySelectorAll("#themeChips .chip").forEach(c=>c.onclick=()=>{
  document.querySelectorAll("#themeChips .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");
  S.themeMode=c.dataset.themeSet;applyTheme(true);
});
$("sbSave").onclick=()=>{S.sb.url=$("sbUrl").value.trim().replace(/\/$/,"");S.sb.key=$("sbKey").value.trim();if(S.sb.url&&S.sb.key){toast("Supabase connected.");loadSharedHazards();}else toast("Cleared — reports stay on this device.");};
$("sbTest").onclick=loadSharedHazards;
$("dlOffline").onclick=downloadOfflineArea;
$("viewTrips").onclick=()=>{
  if(!TRIPS.length){toast("No trips logged yet — complete a drive first.");return;}
  const lines=TRIPS.slice(0,10).map(t=>{const d=new Date(t.t);return `• ${t.name} — ${t.miles} mi (${d.toLocaleDateString([],{month:"short",day:"numeric"})} ${d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})})`;}).join("\n");
  alert("Recent trips:\n\n"+lines);
};

setInterval(()=>{$("clockTime").textContent=new Date().toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"});},10000);


/* ═══════════ v3: persistence · welcome · relock · tap-inspect · satellite 360 · speed limits ═══════════ */
function saveSettings(){try{localStorage.setItem("cw",JSON.stringify({sb:S.sb,mpg:$("mpg").value,gas:$("gasPrice").value,theme:S.themeMode,saver:S.saver,alerts:S.audioAlerts,bump:S.bumpOn,heat:S.heatOn,units:S.units,voice:S.voiceOn,satKey:S.satKey}));}catch{}}
function loadSettings(){try{const c=JSON.parse(localStorage.getItem("cw")||"{}");
  if(c.sb){S.sb=c.sb;$("sbUrl").value=c.sb.url||"";$("sbKey").value=c.sb.key||"";}
  if(c.mpg)$("mpg").value=c.mpg; if(c.gas)$("gasPrice").value=c.gas;
  if(c.theme)S.themeMode=c.theme;
  // v75: auto (time-of-day, daylight by default) is the standard. Anyone carrying an old manual
  // pick from testing gets moved back to auto once; a deliberate choice after this sticks.
  try{ if(!localStorage.getItem("cw_themeReset")){ S.themeMode="auto"; localStorage.setItem("cw_themeReset","1"); } }catch(e){}
  if(c.saver!==undefined)S.saver=c.saver;
  if(c.alerts!==undefined)S.audioAlerts=c.alerts;
  if(c.bump!==undefined)S.bumpOn=c.bump;
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
const TUT=[
  {sel:"#search",title:"🔎 Search anything",body:"Type an address — or just \u201Cgas\u201D, \u201Cfood\u201D, \u201Cgrocery\u201D, \u201Ccoffee\u201D to find the nearest ones, with a tap to widen the search radius."},
  {sel:"#modes",title:"🚗 Choose your mode",body:"Drive, bike, walk, or trail. Routes adapt to each — one-ways for cars, footpaths for walking."},
  {sel:"#fabReport",title:"⚠️ Report a hazard",body:"Drop a cone, pothole, accident, or closure. Nearby drivers get warned — and automatically rerouted around closures."},
  {sel:"#fabDiscover",title:"🧭 Discover nearby",body:"Browse gas, food, EV charging, parking and more around you, each sorted by distance with colored map labels."},
  {sel:"#fab911",title:"🆘 Emergency",body:"One tap shows 911 with your exact coordinates ready to read to a dispatcher."},
  {sel:"#fabSettings",title:"⚙️ Settings & tools",body:"HD satellite, offline map download, turn-cue test, units — and you can replay this tour anytime."},
  {sel:"#fabLocate",title:"\u25CE Recenter",body:"Panned away? Tap to snap back to your live GPS and resume follow mode."},
  {title:"🧭 On the road",body:"You get steady 3D guidance, spoken turns, a buzz or tone right before every exit, interstate shields, live speed limits, and automatic rerouting."},
  {title:"🎬 Preview in 3D",body:"Set a destination, then tap \u201CPreview the drive in 3D\u201D to fly the whole route first, turn by turn — perfect for unfamiliar trips. You're all set!"}
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
  if(S.sb.url&&S.sb.key)loadSharedHazards();
  if(!tutSeen()) setTimeout(startTutorial,600);
  else toast("You're set — search a destination or tap ⚠️ to report.");
};
$("welcomeSkip").onclick=()=>{try{localStorage.setItem("cw_welcome","1");}catch{};$("welcome").style.display="none";startGPS();};

/* free roam as long as you like + one-tap GPS re-lock */
function hideRelock(){ clearTimeout(_relockT); $("relock").style.display="none"; }
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
  try{ if(on) $("moreFabs")&&$("moreFabs").classList.remove("open"); }catch(e){}
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
  rl.textContent=S.navigating?"🧭 Free roam — tap to resume navigation":"🧲 Free roam — tap to lock onto GPS";
  rl.style.display="block";
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
$("navbanner")&&($("navbanner").addEventListener("click",(e)=>{ if(e.target.closest("button"))return; if(!S.navigating&&!S.pos)return; hideRelock(); S.follow=true; updateFollowUI(); cameraFollow(); toast("Back on route"); }));

/* tap anywhere → identify place, act on it */
let inspectPopup=null;
map && null; // (map exists by the time clicks happen)
function bindInspect(){
  map.on("click",async(e)=>{
    if(S.navigating)return;
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
      inspectPopup=new maplibregl.Popup({offset:10,maxWidth:"270px"}).setLngLat([lng,lat]).setDOMContent(div).addTo(map);
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
const ESRI=["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"];
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
    if(!map.getSource("esri"))map.addSource("esri",{type:"raster",tiles:satTiles(),tileSize:m.size,maxzoom:19,attribution:m.attr});
    if(!map.getLayer("esri-sat"))map.addLayer({id:"esri-sat",type:"raster",source:"esri"},map.getLayer("route-casing")?"route-casing":undefined);
    map.setLayoutProperty("esri-sat","visibility",S.sat?"visible":"none");
  }catch{}
}
$("fabSat").onclick=()=>{S.sat=!S.sat;$("fabSat").classList.toggle("active",S.sat);ensureSat();toast(S.sat?"🛰 Satellite imagery on":"Satellite off");};
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
  // only a real drag/zoom/rotate gesture stops it — NOT the tap that opened the preview
  const stopSpin=(e)=>{ if(e && !e.originalEvent) return;   // ignore programmatic setBearing/resize; only real finger gestures pause
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
  if(!imgs.length){ $("photoGrid").innerHTML='<p class="sub" style="grid-column:1/-1">No public photos found nearby. Well-known spots have the best coverage.</p>'; return; }
  $("photoGrid").innerHTML="";
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
  const marks=(S.steps||[]).map(st=>{ const loc=st.maneuver&&st.maneuver.location; if(!loc)return null; let bi=0,bd=Infinity; for(let i=0;i<co.length;i++){const d=_hav(co[i],loc);if(d<bd){bd=d;bi=i;}} return {dist:cum[bi],text:stepText(st),loc:loc}; }).filter(m=>m&&m.text);
  $("drivePreview").style.display="block";
  if(tourMap){try{tourMap.remove();}catch(e){}tourMap=null;}
  tourPuck=null; tourPins.forEach(p=>{try{p.remove();}catch(e){}}); tourPins=[];
  tourMap=new maplibregl.Map({container:"driveMap",
    style:{version:8,
      sources:{
        sat:{type:"raster",tiles:satTiles(),tileSize:satMeta().size,maxzoom:19,attribution:satMeta().attr},
        dem:{type:"raster-dem",tiles:["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],encoding:"terrarium",tileSize:256,maxzoom:14}
      },
      layers:[{id:"bg",type:"background",paint:{"background-color":"#bfe0ff"}},{id:"sat",type:"raster",source:"sat","paint":{"raster-fade-duration":0}}]},
    center:co[0],zoom:18,pitch:85,bearing:_brg(co[0],co[1]),maxPitch:85,attributionControl:true,interactive:true});
  tourMap.on("load",()=>{
    try{ tourMap.setTerrain({source:"dem",exaggeration:0.9}); }catch(e){}
    try{ tourMap.setSky&&tourMap.setSky({"sky-color":"#8ec9ff","horizon-color":"#dbeeff","fog-color":"#eef6ff","fog-ground-blend":0.5,"sky-horizon-blend":0.65,"horizon-fog-blend":0.5,"atmosphere-blend":0.7}); }catch(e){}
    tourMap.addSource("tl",{type:"geojson",data:{type:"Feature",geometry:S.route.geometry}});
    tourMap.addLayer({id:"tl-cas",type:"line",source:"tl",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":"#06283d","line-width":10,"line-opacity":.92}});
    tourMap.addLayer({id:"tl-ln",type:"line",source:"tl",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":"#22d3aa","line-width":5.5}});
    // maneuver pins
    marks.forEach((m,i)=>{ if(i===0)return; const el=document.createElement("div"); el.textContent="↱"; el.style.cssText="width:22px;height:22px;display:flex;align-items:center;justify-content:center;background:#ffb020;color:#111;font-weight:800;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.5);font-size:12px"; try{tourPins.push(new maplibregl.Marker({element:el}).setLngLat(m.loc).addTo(tourMap));}catch(e){} });
    // moving puck
    const pk=document.createElement("div"); pk.className="tour-car";
    pk.innerHTML='<div class="tc-body"></div><div class="tc-glass"></div><div class="tc-tail l"></div><div class="tc-tail r"></div>';
    try{ tourPuck=new maplibregl.Marker({element:pk,rotationAlignment:"map",pitchAlignment:"map"}).setLngLat(co[0]).addTo(tourMap); }catch(e){}
    // start/finish flags
    const mk=(txt,at)=>{const e=document.createElement("div");e.textContent=txt;e.style.cssText="font-size:20px;filter:drop-shadow(0 2px 3px rgba(0,0,0,.6))";try{tourPins.push(new maplibregl.Marker({element:e}).setLngLat(at).addTo(tourMap));}catch(_){}}; 
    // pulsing highlight beacon at the destination
    try{ const de=document.createElement("div"); de.className="sat-beacon"; de.innerHTML='<div class="sat-pulse"></div><div class="sat-pulse b"></div><div class="sat-dot"></div>'; tourPins.push(new maplibregl.Marker({element:de,anchor:"center"}).setLngLat(co[co.length-1]).addTo(tourMap)); }catch(e){}
    // wait until the map has actually drawn tiles (or 3s max) before the countdown, so it never starts on a blank screen
    var _begun=false;
    function beginTour(){
      if(_begun)return; _begun=true;
      runStartLight(function(){
        startTour(co,cum,total,marks);
        var hint=$("tourHint"); if(hint){hint.style.opacity="1"; setTimeout(()=>{try{hint.style.opacity="0";}catch(e){}},5000);}
      });
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
  const baseDur=Math.min(60000,Math.max(14000, total*7)); // slower base = clearer; ~7ms per meter, 14–60s
  tourState={co,cum,total,marks,baseDur,frac:0,speed:0.5,paused:false,done:false,curBrg:_brg(co[0],co[1])};
  $("tourSpeed").innerHTML="0.5&times;";
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
  var spd=st.speed||1;
  var zoom=17.7 - Math.min(0.7,(spd-1)*0.22);
  // CHASE CAM: center between car and the near look-ahead, pitch ~78 so the horizon rises and the road stretches out ahead
  var camCtr=_posAt(st.co,st.cum,Math.min(st.total,d+9));
  var H=(tourMap.getContainer&&tourMap.getContainer().clientHeight)||600;
  tourMap.jumpTo({center:camCtr,bearing:st.curBrg,pitch:78,zoom:zoom,padding:{top:Math.round(H*0.34),bottom:0,left:0,right:0}});
  // apply the lean (scale hides rotation corners + adds cockpit-forward feel)
  var mm=$("driveMap"); if(mm) mm.style.transform="scale(1.08) rotate("+lean.toFixed(2)+"deg)";
  // ═══ SPEED WARP intensity: streaks + vignette ramp up with speed and in turns ═══
  var fx=$("tourFX"); if(fx) fx.style.opacity=(0.12 + Math.min(1,(spd-1)/3)*0.5 + Math.min(0.25,Math.abs(dB)*0.05)).toFixed(2);
  if(tourPuck){ try{tourPuck.setLngLat(pos); tourPuck.setRotation(st.curBrg);}catch(e){} }
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
    st.frac=Math.min(1, st.frac+(dt/st.baseDur)*st.speed); // rate-based: speed changes never jump the camera
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
function stopTour(){ cancelAnimationFrame(arriveRAF); arriveRAF=null; var _mm=$("driveMap"); if(_mm)_mm.style.transform="scale(1.08) rotate(0deg)"; cancelAnimationFrame(tourRAF); tourState=null; if(tourPuck){try{tourPuck.remove();}catch(e){}tourPuck=null;} tourPins.forEach(p=>{try{p.remove();}catch(e){}}); tourPins=[]; if(tourMap){try{tourMap.remove();}catch(e){}tourMap=null;} $("drivePreview").style.display="none"; }

$("drivePrev")&&($("drivePrev").onclick=()=>{ if(S.route)openDriveTour(); else toast("Building route — try again in a second."); });
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
$("tourSpeed")&&($("tourSpeed").onclick=()=>{ const st=tourState; if(!st)return; st.speed=st.speed===0.5?1:st.speed===1?2:st.speed===2?4:0.5; $("tourSpeed").innerHTML=(st.speed===0.5?"0.5":st.speed)+"&times;"; });
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
  const chip=(label,fn)=>{const b=document.createElement("button");b.className="chip";b.style.padding="5px 11px";b.style.fontSize="11px";b.textContent=label;b.onclick=fn;q.appendChild(b);};
  if(QK.home)chip("🏠 Home",()=>setDestination(QK.home,"Home"));
  if(QK.work)chip("💼 Work",()=>setDestination(QK.work,"Work"));
  if(QK.park)chip("🚶 Find my car",()=>walkToCar());
  (QK.favorites||[]).slice(0,4).forEach(f=>chip("⭐ "+f.name.slice(0,14),()=>setDestination({lat:f.lat,lng:f.lng},f.name)));
  (QK.recents||[]).slice(0,3).forEach(r=>chip("🕘 "+r.name.slice(0,16),()=>setDestination({lat:r.lat,lng:r.lng},r.name)));
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
function layout(){try{document.documentElement.style.setProperty("--hdrH",($("hdr").offsetHeight+10)+"px");}catch{}}
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
function renderLanes(st){
  const lanes=st.intersections&&st.intersections[0]&&st.intersections[0].lanes;
  const row=$("laneRow");
  if(!lanes||!lanes.length){row.style.display="none";return;}
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
  }catch{}
  return localityCache;
}
// gather candidates from 3 free geocoders (structured + free-text Nominatim + Photon), scored & merged
async function geocodeCandidates(q){
  var p=parseAddr(q), out=[];
  var qs=new URLSearchParams({format:"jsonv2",addressdetails:"1",limit:"10"});
  qs.set("street",[p.housenumber,p.street].filter(Boolean).join(" "));
  if(p.city)qs.set("city",p.city); else {var loc=await getLocality(); if(loc)qs.set("city",loc.split(",")[0]);}
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
  }
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
async function forceGeocode(q){
  $("results").style.display="none";
  // offline or instant: use a previously-cached result if we have one
  const cached=lookupCachedGeocode(q);
  if(cached && (!navigator.onLine || true)){
    if(!navigator.onLine){ confirmDestination(cached,q); toast("📍 Using saved location (offline)",3000); return; }
  }
  if(!navigator.onLine){
    if(cached){ confirmDestination(cached,q); toast("📍 Saved location (offline)",3000); return; }
    toast("Offline — can only navigate to saved/recent places. Search online first.",4500);
    return;
  }
  toast("Locating address…",1600);
  // the network may already know this one — skip the guesswork entirely
  const crowd=await crowdLookup(q);
  if(crowd){ confirmDestination({lat:crowd.lat,lng:crowd.lng,label:crowd.label||q},q); toast("📍 Matched to where most drivers go",2600); return; }
  const want=parseAddr(q);
  let cands=await geocodeCandidates(q);
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
  return (s||"").toLowerCase().replace(/[.,]/g,"").split(/\s+/)
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
    var label=String(r.display_name||r.name||"").toLowerCase();
    var toks=q.toLowerCase().replace(/[^a-z0-9 ]/g,"").split(/\s+/).filter(function(w){return w.length>1;});
    if(toks.length){ var matched=toks.filter(function(tk){return label.indexOf(tk)>-1;}).length; sc+=matched*14; if(matched===toks.length)sc+=42; }
    // PROXIMITY: when the user didn't name a city/state/ZIP they mean somewhere NEAR them.
    // The old capped penalty (-12) let a match 9,000 miles away out-score one down the street.
    if(S.pos){
      var d=distM(S.pos,{lat:+r.lat,lng:+r.lon})/1609.34;
      var saidWhere = !!(want.city||want.state||want.postalcode);
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
  }).filter(function(x){ if(!isFinite(x.lat)||!isFinite(x.lng))return false; var k=x.lat.toFixed(4)+","+x.lng.toFixed(4); if(seen[k])return false; seen[k]=1; return true; })
    .sort(function(a,b){return b.sc-a.sc;});
  return scored;
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
function lookupCachedGeocode(typed){
  try{const c=JSON.parse(localStorage.getItem("cw_geo")||"{}");return c[typed.trim().toLowerCase()]||null;}catch{return null;}
}
function _milesFrom(lat,lng){ if(!S.pos)return ""; try{ var d=distM(S.pos,{lat:lat,lng:lng})/1609.34; return d<0.1?"":("≈ "+(d<10?d.toFixed(1):Math.round(d))+" mi away"); }catch(e){ return ""; } }
function showGeoPicker(cands,typed){
  pushUI();
  // sort nearest → furthest so the list reads by distance
  if(S.pos){ try{ cands=cands.slice().sort((a,b)=>distM(S.pos,{lat:a.lat,lng:a.lng})-distM(S.pos,{lat:b.lat,lng:b.lng})); }catch(e){} }
  var list=$("geoPickerList"); list.innerHTML="";
  $("geoPickerSub").textContent=cands.length>3?"Nearest first — tap the right one for \u201C"+typed+"\u201D":"Tap the correct address for \u201C"+typed+"\u201D";
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
  $("confirmBar").style.display="flex";
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
  const cache=await caches.open("cw-tiles-v2");
  let total=0,okc=0;const jobs=[];
  for(let z=11;z<=17;z++){
    const [cx,cy]=tileXY(lat,lon,z);
    const r=z<=12?2:z<=14?3:z<=15?4:5;
    for(let x=cx-r;x<=cx+r;x++)for(let y=cy-r;y<=cy+r;y++){
      const n=Math.pow(2,z); if(x<0||y<0||x>=n||y>=n)continue;
      const url= ck
        ? `https://${subs[(x+y)%4]}.basemaps.cartocdn.com/rastertiles/${dark?"dark_all":"voyager"}/${z}/${x}/${y}.png?key=${ck}`
        : `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}`;
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
  s.addEventListener("focus",()=>{row.classList.add("searching");});
  s.addEventListener("blur",()=>{ setTimeout(()=>{ if(!$("results").matches(":hover"))row.classList.remove("searching"); },180); });
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
function isStandalone(){ return (window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches)||navigator.standalone===true; }
function isIOSdev(){ return /iphone|ipad|ipod/i.test(navigator.userAgent); }
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
  else if(deferredInstall){ $("installGo").style.display=""; $("iosSteps").style.display="none"; }
  else if(!force){ return; }
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
    var _swReloaded=false;
    navigator.serviceWorker.addEventListener("controllerchange",function(){
      if(_swReloaded||!hadController)return; _swReloaded=true; location.reload();
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

/* ═══════════ full-screen search panel (Apple-style) ═══════════
   One entry point: tap the search bar (or the From row) and a real page opens with live
   suggestions, recents, saved places and an approximate-match option. */
let _spMode="dest", _spTimer=null, _spAbort=null;
function openSearchPanel(mode,seed){
  _spMode=mode||"dest";
  const p=$("searchPanel"); if(!p) return;
  p.classList.add("open"); p.setAttribute("aria-hidden","false");
  $("spWhich").textContent = _spMode==="from" ? "Starting point" : "Destination";
  $("spInput").placeholder = _spMode==="from" ? "Start — or leave blank for my location" : "Search a place or address";
  $("spInput").value = seed||"";
  spRender([]);
  setTimeout(()=>{ try{$("spInput").focus();}catch(e){} },60);
}
function closeSearchPanel(){
  const p=$("searchPanel"); if(!p) return;
  p.classList.remove("open"); p.setAttribute("aria-hidden","true");
  try{$("spInput").blur();}catch(e){}
}
function spIcon(r){
  const ic=poiIcon(r); return '<span class="sp-ic" style="background:'+ic[1]+'">'+ic[0]+'</span>';
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
    (QK.recents||[]).slice(0,8).forEach(r=>rows.push({name:r.name,label:"Recent",icon:"🕘",bg:"#6B7280",lat:r.lat,lng:r.lng}));
    if(!rows.length){ list.innerHTML='<p class="sub" style="padding:18px 12px">Start typing a place or address.</p>'; return; }
    rows.forEach(r=>{
      const d=document.createElement("div"); d.className="sp-row";
      d.innerHTML='<span class="sp-ic" style="background:'+r.bg+'">'+r.icon+'</span><span class="sp-tx"><b>'+r.name+'</b><small>'+r.label+'</small></span>';
      d.onclick=()=>spPick(r);
      list.appendChild(d);
    });
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
async function spSearch(q){
  if(_spAbort){ try{_spAbort.abort();}catch(e){} }
  _spAbort=new AbortController();
  if(!navigator.onLine){ spRender(offlineMatches(q)); return; }
  if(acCache.has(q)){ spRender(acCache.get(q)); return; }
  spRender([], "Searching…");
  let items=[];
  try{
    let u="https://photon.komoot.io/api/?q="+encodeURIComponent(q)+"&limit=10&lang=en";
    if(S.pos) u+="&lat="+S.pos.lat+"&lon="+S.pos.lng;
    const d=await (await fetch(u,{signal:_spAbort.signal})).json();
    items=(d.features||[]).map(f=>{
      const p=f.properties,co=f.geometry.coordinates;
      const name=[p.name||p.street,p.housenumber].filter(Boolean).join(" ")||p.street||p.city||"Unnamed place";
      const label=[p.street&&p.name&&p.name!==p.street?p.street:null,p.city||p.town||p.village,p.state].filter(Boolean).join(", ");
      return {name,label,lat:co[1],lng:co[0]};
    });
  }catch(e){ if(e.name==="AbortError")return; }
  if(!items.length){
    try{
      let url="https://nominatim.openstreetmap.org/search?format=json&limit=10&q="+encodeURIComponent(q);
      if(S.pos){const dd=0.15;url+="&viewbox="+(S.pos.lng-dd)+","+(S.pos.lat+dd)+","+(S.pos.lng+dd)+","+(S.pos.lat-dd)+"&bounded=0";}
      const list=await (await fetch(url,{signal:_spAbort.signal,headers:{Accept:"application/json"}})).json();
      items=(list||[]).map(r=>({name:r.display_name.split(",")[0],label:r.display_name.split(",").slice(1,4).join(",").trim(),lat:+r.lat,lng:+r.lon}));
    }catch(e){ if(e.name==="AbortError")return; }
  }
  const toks=q.toLowerCase().split(/\s+/).filter(w=>w.length>1);
  items=items.map(r=>{ const lbl=((r.name||"")+" "+(r.label||"")).toLowerCase(); const nm=toks.filter(t=>lbl.indexOf(t)>-1).length;
    return {...r,_d:S.pos?distM(S.pos,r):undefined,_n:nm}; })
    .sort((a,b)=>(b._n-a._n)||((a._d||0)-(b._d||0)));
  acCache.set(q,items);
  spRender(items, items.length?null:"No matches — try adding a city or ZIP.");
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
$("search")&&($("search").addEventListener("focus",(e)=>{ try{e.target.blur();}catch(x){} openSearchPanel("dest",$("search").value.trim()); }));
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
  const wrap=document.createElement("div");
  wrap.style.cssText="position:fixed;left:12px;right:12px;bottom:calc(96px + env(safe-area-inset-bottom));z-index:1600;background:var(--panel-solid);border:1px solid var(--line);border-radius:18px;padding:16px;box-shadow:0 14px 44px rgba(0,0,0,.5);max-height:66vh;overflow-y:auto";
  wrap.innerHTML='<div style="font-size:15px;font-weight:800;margin-bottom:3px">⛔ Report a closure</div>'+
    '<div style="font-size:12.5px;color:var(--mute);margin-bottom:10px">Pick the closest exit or type where it is.</div>'+
    '<input id="clsInput" placeholder="e.g. I-94 at Livernois" autocomplete="off" style="width:100%;padding:12px;border-radius:12px;border:1px solid var(--line);background:transparent;color:inherit;font-size:15px;font-family:inherit">'+
    '<div id="clsList" style="margin-top:10px"><p class="sub">Finding exits near you…</p></div>'+
    '<div style="display:flex;gap:8px;margin-top:12px">'+
    '<button id="clsGo" style="flex:1;border:none;border-radius:12px;padding:13px;background:#FF3B30;color:#fff;font-weight:800;font-size:15px">Report closed</button>'+
    '<button id="clsX" style="border:1px solid var(--line);border-radius:12px;padding:13px 16px;background:transparent;color:inherit;font-size:15px">Cancel</button></div>';
  document.body.appendChild(wrap);
  const kill=()=>{ try{wrap.remove();}catch(e){} };
  wrap.querySelector("#clsX").onclick=kill;
  let picked=null;
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
