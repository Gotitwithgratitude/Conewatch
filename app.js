"use strict";
/* ═══════════ ConeWatch Pro Max — app.js ═══════════ */

const HZ_META = {
  construction_cones:{emoji:"🚧",color:"#FF6B1A",label:"Construction"},
  pothole:{emoji:"🕳",color:"#E5484D",label:"Pothole"},
  accident:{emoji:"🚨",color:"#FF4D6D",label:"Accident"},
  police:{emoji:"👮",color:"#5B9CF6",label:"Police"},
  camera:{emoji:"📸",color:"#A78BFA",label:"Speed camera"},
  debris:{emoji:"🪵",color:"#FFC72C",label:"Debris"},
};
const APP_VERSION="v25";
const PROFILES = { car:"routed-car/route/v1/driving", bike:"routed-bike/route/v1/driving", foot:"routed-foot/route/v1/driving", hike:"routed-foot/route/v1/driving" };
const ACCENT = { dark:{route:"#35E0C8",casing:"#0A3B33"}, light:{route:"#1D6EF2",casing:"#0A2E66"} };

const S = {
  pos:null, lastPos:null, accuracy:null, course:null, compass:null,
  follow:true, headingUp:false, watchId:null, saver:false, audioAlerts:true, bumpOn:true,
  mode:"car", dest:null, destName:"", stops:[],
  route:null, steps:[], stepIdx:0, navigating:false, offRouteCount:0, rerouting:false,
  hazards:[], alerted:new Set(), sb:{url:"",key:""},
  speedMph:0, tripM:0, is3d:false, mapReady:false,
  themeMode:"auto", themeNow:"dark", sun:{rise:7.0, set:19.2}, lux:null,
  torchMode:0, torchTrack:null, sosTimer:null, wakeLock:null, fbCat:"Bug",
};
const $ = (id)=>document.getElementById(id);
let toastTimer;
function toast(msg,ms=2800){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),ms);}

/* ═══════════ adaptive theme engine ═══════════ */
function isDayNow(){
  if(S.themeMode==="light") return true;
  if(S.themeMode==="dark") return false;
  if(S.lux!==null && S.lux<12) return false; // ambient light override: dark garage/tunnel
  const h=new Date().getHours()+new Date().getMinutes()/60;
  return h>=S.sun.rise && h<S.sun.set;
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
  const flavor=dark?"dark_all":"light_all";
  return { version:8,
    sources:{ carto:{ type:"raster", tiles:["a","b","c"].map(s=>`https://${s}.basemaps.cartocdn.com/${flavor}/{z}/{x}/{y}.png`), tileSize:256, attribution:"© OpenStreetMap © CARTO" }},
    layers:[{id:"bg",type:"background",paint:{"background-color":dark?"#101215":"#E9ECEF"}},{id:"carto",type:"raster",source:"carto"}] };
}
function rasterStyleObj(dark){
  const base=dark?"dark_all":"voyager"; // voyager = colorful light (roads, POIs)
  return {version:8,
    glyphs:"https://fonts.openmaptiles.org/{fontstack}/{range}.pbf",
    sources:{carto:{type:"raster",tiles:["a","b","c","d"].map(s=>`https://${s}.basemaps.cartocdn.com/rastertiles/${base}/{z}/{x}/{y}{ratio}.png`.replace("{ratio}","")),tileSize:256,maxzoom:19,attribution:"© OpenStreetMap © CARTO"}},
    layers:[{id:"bg",type:"background",paint:{"background-color":dark?"#0E1013":"#EAE6DF"}},{id:"carto",type:"raster",source:"carto"}]};
}
async function styleFor(theme){
  return rasterStyleObj(theme!=="light");   // raster PNG = reliably cacheable offline
}
let map, meMarker, destMarker;
const stopMarkers=[]; const hzMarkers=[];

let mapStyleTheme="dark";
(async function boot(){
  S.themeNow=isDayNow()?"light":"dark";
  document.documentElement.dataset.theme=S.themeNow;
  mapStyleTheme=S.themeNow;
  const style=await styleFor(S.themeNow);
  map=new maplibregl.Map({ container:"map", style, center:[-83.0790,42.3316], zoom:14.5, pitch:0, bearing:0, attributionControl:true });
  map.on("load",()=>{ S.mapReady=true; addMapLayers(); initUserMarker();
    if(S.queuedTheme&&S.queuedTheme!==mapStyleTheme) swapMapStyle(S.queuedTheme);
    if(seenWelcome()){ startGPS(); if(S.sb.url&&S.sb.key) loadSharedHazards(); toast("ConeWatch Pro — search a destination, or tap ⋯ for tools."); }
    else $("welcome").style.display="flex"; });
  const mc=map.getCanvasContainer();
  ["touchstart","mousedown"].forEach(ev=>mc.addEventListener(ev,()=>{S.touching=true;},{passive:true}));
  ["touchend","touchcancel","mouseup"].forEach(ev=>mc.addEventListener(ev,()=>{setTimeout(()=>{S.touching=false;},350);},{passive:true}));
  map.on("dragstart",()=>{ S.follow=false; updateFollowUI(); hideRelock(); });
  map.on("moveend",()=>{ if(!S.follow && S.mapReady) startRelock(); });
  map.on("error",()=>{});
  applyTheme(true);
})();

function addMapLayers(){
  const a=ACCENT[S.themeNow];
  if(!map.getSource("route")) map.addSource("route",{type:"geojson",data:{type:"FeatureCollection",features:[]}});
  if(!map.getLayer("route-casing")) map.addLayer({id:"route-casing",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":a.casing,"line-width":11,"line-opacity":.95}});
  if(!map.getLayer("route-line")) map.addLayer({id:"route-line",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":a.route,"line-width":7}});
  if(!map.getLayer("route-core")) map.addLayer({id:"route-core",type:"line",source:"route",layout:{"line-cap":"round","line-join":"round"},paint:{"line-color":"rgba(255,255,255,.75)","line-width":2.2}});
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
  ensureSat();
}
let styleSwapping=false;
function swapMapStyle(theme){
  if(styleSwapping)return;
  styleSwapping=true;
  styleFor(theme).then(st=>{
    map.setStyle(st);
    map.once("style.load",()=>{ mapStyleTheme=theme; styleSwapping=false; addMapLayers(); });
    setTimeout(()=>{styleSwapping=false;},8000); // failsafe unlock
  }).catch(()=>{ styleSwapping=false; });
}
function initUserMarker(){
  const el=document.createElement("div"); el.id="meArrow";
  meMarker=new maplibregl.Marker({element:el,rotationAlignment:"map",pitchAlignment:"map"}).setLngLat([-83.0790,42.3316]);
}

/* ═══════════ GPS ═══════════ */
function gpsOpts(){ return { enableHighAccuracy:!S.saver, maximumAge:S.saver?4000:600, timeout:15000 }; }
function startGPS(){
  if(!("geolocation" in navigator)){ toast("No GPS available on this device."); return; }
  if(S.watchId!==null) navigator.geolocation.clearWatch(S.watchId);
  S.watchId=navigator.geolocation.watchPosition(onPos,onPosErr,gpsOpts());
}
let sunLoaded=false;
function onPos(p){
  const {latitude:lat,longitude:lng,accuracy,speed,heading}=p.coords;
  S.lastPos=S.pos; S.pos={lat,lng,t:p.timestamp}; S.accuracy=accuracy;
  if(heading!==null && !isNaN(heading)) S.course=heading;
  else if(S.lastPos && distM(S.lastPos,S.pos)>3) S.course=bearing(S.lastPos,S.pos);

  let mph=0;
  if(speed!==null && !isNaN(speed)) mph=speed*2.23694;
  else if(S.lastPos){const d=distM(S.lastPos,S.pos),dt=(S.pos.t-S.lastPos.t)/1000;if(dt>0.4)mph=(d/dt)*2.23694;}
  S.speedMph=S.speedMph*0.55+mph*0.45;
  const vm=Math.round(S.speedMph);
  $("speedV").textContent=S.units==="km"?Math.round(S.speedMph*1.60934):vm;
  $("speed").classList.toggle("over", S.limit ? vm>S.limit : vm>75);
  if(S.lastPos && mph>1){S.tripM+=distM(S.lastPos,S.pos);$("tripMi").textContent=S.units==="km"?(S.tripM/1000).toFixed(1):(S.tripM/1609.34).toFixed(1);}

  if(meMarker && !meMarker._map){ meMarker.addTo(map); map.easeTo({center:[lng,lat],zoom:16,duration:800}); toast("GPS locked ✓"); }
  if(meMarker){ meMarker.setLngLat([lng,lat]); if(S.course!==null) meMarker.setRotation(S.course); }
  if(!sunLoaded){ sunLoaded=true; loadSunTimes(); }

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
function cameraFollow(){
  if(!S.follow||!S.pos||!S.mapReady||S.touching) return;
  const now=Date.now();
  if(S.navigating){
    const dur=Math.min(1600,Math.max(300,lastFixT?now-lastFixT:800));
    lastFixT=now;
    const sp=S.speedMph;
    map.easeTo({center:[S.pos.lng,S.pos.lat],
      zoom:sp<8?17.2:sp<25?16.8:sp<45?16.2:15.7,pitch:60,
      bearing:(S.headingUp&&S.course!==null)?S.course:map.getBearing(),
      offset:[0,map.getContainer().clientHeight*0.18],
      duration:dur,easing:t=>t,essential:true});
    return;
  }
  if(now-lastFollow<900) return; lastFollow=now;
  const opts={center:[S.pos.lng,S.pos.lat],duration:S.saver?0:850,essential:true};
  if(S.headingUp&&S.course!==null)opts.bearing=S.course;
  map.easeTo(opts);
}

/* ═══════════ geo utils ═══════════ */
function distM(a,b){const R=6371000,r=Math.PI/180,dLa=(b.lat-a.lat)*r,dLo=(b.lng-a.lng)*r;const s=Math.sin(dLa/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(dLo/2)**2;return 2*R*Math.asin(Math.sqrt(s));}
function bearing(a,b){const r=Math.PI/180,y=Math.sin((b.lng-a.lng)*r)*Math.cos(b.lat*r),x=Math.cos(a.lat*r)*Math.sin(b.lat*r)-Math.sin(a.lat*r)*Math.cos(b.lat*r)*Math.cos((b.lng-a.lng)*r);return (Math.atan2(y,x)*180/Math.PI+360)%360;}
function fmtDist(m){
  if(S.units==="km")return m>=1000?(m/1000).toFixed(1)+" km":Math.max(10,Math.round(m/10)*10)+" m";
  return m>=400?(m/1609.34).toFixed(1)+" mi":Math.max(10,Math.round((m*3.28084)/10)*10)+" ft";
}
function fmtDur(s){const m=Math.round(s/60);return m>=60?`${Math.floor(m/60)} hr ${m%60} min`:`${Math.max(1,m)} min`;}
function rushFactor(){const h=new Date().getHours()+new Date().getMinutes()/60;return (S.mode==="car"&&((h>=7&&h<=9)||(h>=16&&h<=18.5)))?1.28:1;}

/* ═══════════ live address autocomplete (debounced + cached + aborted) ═══════════ */
const acCache=new Map(); let acAbort=null, acTimer=null;
$("search").addEventListener("input",()=>{
  const q=$("search").value.trim();
  clearTimeout(acTimer);
  if(q.length<3){$("results").style.display="none";return;}
  acTimer=setTimeout(()=>suggest(q),190);
});
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
    let u=`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en&osm_tag=place&osm_tag=highway&osm_tag=building`;
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
  if(S.pos)items=items.map(r=>({...r,_d:distM(S.pos,r)})).sort((a,b)=>a._d-b._d);
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
      <span class="rtext"><b>${r.name}</b><small>${[near,r.label].filter(Boolean).join(" · ")}</small></span>
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
}
function doSearch(){const q=$("search").value.trim();if(!q)return;$("results").style.display="none";forceGeocode(q);}
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
  S.dest=latlng;S.destName=name||"Destination";
  if(name&&!["Home","Work","My parked car"].includes(name)){
    QK.recents=[{lat:latlng.lat,lng:latlng.lng,name},...(QK.recents||[]).filter(r=>r.name!==name)].slice(0,6);
    saveQK();renderQuick();
try{if($("tripCount")&&TRIPS.length)$("tripCount").textContent=TRIPS.length+" drives logged";}catch{}
  }
  if(destMarker)destMarker.remove();
  const el=document.createElement("div");el.className="dest-flag";el.textContent="🏁";
  destMarker=new maplibregl.Marker({element:el,anchor:"bottom"}).setLngLat([latlng.lng,latlng.lat]).addTo(map);
  if(!S.pos){toast("Waiting for GPS lock to route…");map.easeTo({center:[latlng.lng,latlng.lat],zoom:15});return;}
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

async function osrmFetch(coordsStr){
  const q=`${coordsStr}?overview=full&geometries=geojson&steps=true`;
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
async function fetchRoute(silent){
  if(!S.pos||!S.dest||S.rerouting) return;
  if(!navigator.onLine){ if(!silent)toast("Offline — showing your saved route. It stays active.",3200); return; }
  S.rerouting=true;
  try{
    const pts=[S.pos,...S.stops,S.dest].map(p=>`${p.lng},${p.lat}`).join(";");
    const data=await osrmFetch(pts);
    if(data.code!=="Ok"||!data.routes?.length){toast("No route found for this mode.");S.rerouting=false;return;}
    const r=data.routes[0];
    S.route=r;S.steps=r.legs.flatMap(l=>l.steps);S.stepIdx=0;S.offRouteCount=0;S.alerted.clear();
    try{map.getSource("route").setData({type:"Feature",geometry:r.geometry});}catch{}
    if(!silent){
      const b=r.geometry.coordinates.reduce((bb,c)=>bb.extend(c),new maplibregl.LngLatBounds(r.geometry.coordinates[0],r.geometry.coordinates[0]));
      map.fitBounds(b,{padding:{top:160,bottom:90,left:50,right:50}});
      renderRouteSheet(r); openSheet("routeSheet");
      loadWeather(); loadElevation(r);
    }
  }catch{toast("Routing failed — check connection.");}
  S.rerouting=false;
}
function renderRouteSheet(r){
  $("rsTitle").textContent=S.destName;
  const rush=rushFactor()>1?" · rush-hour adjusted":"";
  const arrClock=new Date(Date.now()+r.duration*rushFactor()*1000).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  $("rsMeta").textContent=`${fmtDist(r.distance)} · ${fmtDur(r.duration*rushFactor())} · arrive ${arrClock} (${S.mode})${rush}`;
  const sl=$("stopsList");sl.innerHTML="";
  S.stops.forEach((s,i)=>{
    const b=document.createElement("button");b.className="row-btn";
    b.innerHTML=`<span class="ic">📍</span><span>Stop ${i+1}: ${s.name}<small>Tap to remove</small></span>`;
    b.onclick=()=>{S.stops.splice(i,1);stopMarkers.splice(i,1)[0].remove();stopMarkers.forEach((m,j)=>m.getElement().textContent=j+1);fetchRoute();};
    sl.appendChild(b);
  });
  const mpg=parseFloat($("mpg").value)||22,gas=parseFloat($("gasPrice").value)||2.89;
  const gal=(r.distance/1609.34)/mpg,fuel=(gal*gas).toFixed(2);
  const curve=curveScore(r.geometry.coordinates);
  $("tripStats").innerHTML=`
    <div class="kv"><span>Est. fuel cost</span><span>$${fuel} (${gal.toFixed(1)} gal @ ${mpg} mpg)</span></div>
    <div class="kv"><span>Road character</span><span>${curve.label} · ${curve.turns} sharp turns</span></div>
    <div class="kv"><span>Weather at destination</span><span id="wxDest">loading…</span></div>
    <div class="kv"><span>Elevation</span><span id="elevStat">loading…</span></div>`;
  const ol=$("steps");ol.innerHTML="";
  S.steps.forEach((st,i)=>{
    const li=document.createElement("li");
    li.innerHTML=`<span class="n">${i+1}</span><span>${stepText(st)}</span><span class="d">${fmtDist(st.distance)}</span>`;
    ol.appendChild(li);
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
  S.navigating=true;S.follow=true;S.headingUp=true;updateFollowUI();updateCompassUI();
  closeSheets();
  $("navbanner").style.display="block";
  $("navPill").style.display="flex";
  $("roadPill").style.display="flex";
  cameraFollow();navTick();loadWeather();
  document.body.classList.add("driving"); layout();
  try{if(document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().catch(()=>{});}catch{}
  requestWakeLock(); requestMotion();
  pollLimit(); clearInterval(limitTimer); limitTimer=setInterval(pollLimit,45000);
  speak("Starting navigation to "+S.destName+".");
  toast("Navigation started — drive safe. Screen will stay awake.");
}
function endNavigation(){
  S.navigating=false;S.headingUp=false;
  try{speechSynthesis.cancel();}catch{}
  document.body.classList.remove("driving"); layout();
  try{if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});}catch{}
  hideRelock();
  $("navbanner").style.display="none";$("navPill").style.display="none";$("roadPill").style.display="none";$("hud").style.display="none";
  releaseWakeLock();
  clearInterval(limitTimer); $("limitBadge").style.display="none"; S.limit=null;
  map.easeTo({pitch:S.is3d?55:0,bearing:0});
}
$("endnav").onclick=endNavigation;
$("startNav").onclick=startNavigation;
$("closeRoute").onclick=closeSheets;

function navTick(){
  if(!S.navigating||!S.pos||!S.route)return;
  while(S.stepIdx<S.steps.length-1){
    const [lng,lat]=S.steps[S.stepIdx].maneuver.location;
    if(distM(S.pos,{lat,lng})<28)S.stepIdx++;else break;
  }
  const cur=S.steps[S.stepIdx];
  const [lng,lat]=cur.maneuver.location;
  const dNext=distM(S.pos,{lat,lng});
  $("nbDist").textContent=fmtDist(dNext);
  const destBig=cur.destinations?String(cur.destinations).split(",")[0].split(";")[0].trim():null;
  $("nbInstr").textContent=destBig||stepText(cur);
  const ref=cur.ref?String(cur.ref).split(";")[0].trim():"";
  if(ref){$("nbRef").textContent=ref;$("nbRef").style.display="block";}else $("nbRef").style.display="none";
  const rn=cur.name||"";
  if(rn){$("roadName").textContent=rn;
    if(ref){$("roadRef").textContent=ref.replace(/[^0-9A-Z-]/gi,"").slice(0,4);$("roadRef").style.display="flex";}
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
  if(S.stepIdx!==S.annStep){S.annStep=S.stepIdx;S.annStage=0;}
  if(S.annStage<2&&dNext<75){S.annStage=2;turnCue(2);speak(stepText(cur));}
  else if(S.annStage<1&&dNext<380){S.annStage=1;turnCue(1);speak("In "+spokenDist(dNext)+", "+stepText(cur));}

  let rem=dNext;for(let i=S.stepIdx;i<S.steps.length;i++)rem+=S.steps[i].distance;
  const frac=S.route.distance?Math.min(1,rem/S.route.distance):0;
  const secsLeft=S.route.duration*frac*rushFactor();
  const arr=new Date(Date.now()+secsLeft*1000).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
  S.etaArr=arr; S.etaMin=Math.max(1,Math.round(secsLeft/60));
  $("pillMin").textContent=S.etaMin+" min";
  $("pillSub").textContent=fmtDist(rem)+" • "+arr;

  let near=0;
  S.hazards.forEach((h,i)=>{
    const d=distM(S.pos,h);
    if(d<450)near++;
    if(d<300&&!S.alerted.has(i)){S.alerted.add(i);hazardAlert(h);}
  });
  $("nbHz").textContent=near?`⚠ ${near} hazard${near>1?"s":""} ahead`:"";

  if(distM(S.pos,S.dest)<30){
    speak("You have arrived at "+S.destName+".");
    logTrip(S.destName,S.dest.lat,S.dest.lng,S.tripM/1609.34);
    if(S.mode==="car"){QK.park={lat:S.pos.lat,lng:S.pos.lng};saveQK();renderQuick();}
    toast("🏁 Arrived — "+S.destName+(S.mode==="car"?" · parking spot saved":""));
    clearStops();endNavigation();return;}

  const acc=S.accuracy||20;
  if(acc<60 && navigator.onLine){
    const thresh=Math.max(70,acc*2.5);
    const dR=minDistToRoute();
    if(dR>thresh){
      if(++S.offRouteCount>=4 && Date.now()-(S.lastReroute||0)>20000){
        S.offRouteCount=0;S.lastReroute=Date.now();
        toast("Rerouting…",1200);speak("Rerouting.");fetchRoute(true);
      }
    } else S.offRouteCount=0;
  }
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
function hazardAlert(h){
  const m=HZ_META[h.type]||HZ_META.debris;
  toast(`${m.emoji} ${m.label} ahead — ${h.note||"driver report"}`,3500);
  beep();
  if(navigator.vibrate)navigator.vibrate([80,60,80]);
}

/* ═══════════ hazards ═══════════ */
function addHazardMarker(h){
  const m=HZ_META[h.type]||HZ_META.debris;
  const el=document.createElement("div");el.className="hz";el.style.background=m.color;el.textContent=m.emoji;
  const mk=new maplibregl.Marker({element:el}).setLngLat([h.lng,h.lat])
    .setPopup(new maplibregl.Popup({offset:16}).setHTML(`<b style="color:${m.color}">${m.emoji} ${m.label}</b><br><span style="font-size:12px">${h.note||"Driver report"}</span><br><span style="font-size:11px;opacity:.6">${h.reports||1} report(s)</span>`))
    .addTo(map);
  hzMarkers.push(mk);
}
async function reportHazard(type,note){
  if(!S.pos){toast("Need a GPS lock to report.");return;}
  const h={type,lat:S.pos.lat,lng:S.pos.lng,note:note||"Driver report",sev:type==="accident"?4:2,reports:1};
  S.hazards.push(h);addHazardMarker(h);closeSheets();
  toast(`${HZ_META[type].label} reported ✓`);
  if(navigator.vibrate)navigator.vibrate(40);
  if(S.sb.url&&S.sb.key){
    try{await fetch(`${S.sb.url}/rest/v1/hazards`,{method:"POST",headers:{"Content-Type":"application/json",apikey:S.sb.key,Authorization:`Bearer ${S.sb.key}`},body:JSON.stringify(h)});}
    catch{toast("Saved locally — cloud sync failed.");}
  }
}
document.querySelectorAll("#reportSheet .row-btn").forEach(b=>b.onclick=()=>reportHazard(b.dataset.type));
async function loadSharedHazards(){
  if(!S.sb.url||!S.sb.key){toast("Add your Supabase URL + key first.");return;}
  try{
    const rows=await (await fetch(`${S.sb.url}/rest/v1/hazards?select=*&order=created_at.desc&limit=300`,{headers:{apikey:S.sb.key,Authorization:`Bearer ${S.sb.key}`}})).json();
    if(Array.isArray(rows)){hzMarkers.forEach(m=>m.remove());hzMarkers.length=0;S.hazards=rows;S.alerted.clear();rows.forEach(addHazardMarker);toast(`Loaded ${rows.length} shared reports ✓`);}
  }catch{toast("Couldn't reach Supabase.");}
}

/* ═══════════ POI discovery ═══════════ */
document.querySelectorAll("#discoverSheet .chip").forEach(c=>c.onclick=()=>{document.querySelectorAll("#discoverSheet .chip").forEach(x=>x.classList.remove("on"));c.classList.add("on");discover(c.dataset.poi);});
async function discover(kind){
  if(!S.pos){$("poiList").innerHTML='<p class="sub">Waiting for GPS lock…</p>';return;}
  $("poiList").innerHTML='<p class="sub">Searching OpenStreetMap around you…</p>';
  const tag=kind==="attraction"?`node["tourism"="attraction"]`:`node["amenity"="${kind}"]`;
  const q=`[out:json][timeout:12];${tag}(around:4000,${S.pos.lat},${S.pos.lng});out body 20;`;
  try{
    const d=await (await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:"data="+encodeURIComponent(q),headers:{"Content-Type":"application/x-www-form-urlencoded"}})).json();
    const els=(d.elements||[]).filter(e=>e.tags?.name).sort((a,b)=>distM(S.pos,{lat:a.lat,lng:a.lon})-distM(S.pos,{lat:b.lat,lng:b.lon})).slice(0,12);
    if(!els.length){$("poiList").innerHTML='<p class="sub">Nothing found within 2.5 miles — try another category.</p>';return;}
    $("poiList").innerHTML="";
    els.forEach(e=>{
      const div=document.createElement("div");div.className="poi-item";
      const d0=fmtDist(distM(S.pos,{lat:e.lat,lng:e.lon}));
      div.innerHTML=`<span><b>${e.tags.name}</b><small>${d0} away${e.tags.opening_hours?" · "+e.tags.opening_hours.slice(0,28):""}</small></span>
        <span class="poi-acts"><button class="pgo" style="background:#FF6B1A;color:#141619">Go</button><button class="pstop" style="background:rgba(127,127,127,.2);color:inherit;border:1px solid rgba(127,127,127,.3)">+Stop</button></span>`;
      div.querySelector(".pgo").onclick=()=>{closeSheets();setDestination({lat:e.lat,lng:e.lon},e.tags.name);};
      div.querySelector(".pstop").onclick=()=>addStop({lat:e.lat,lng:e.lon},e.tags.name);
      $("poiList").appendChild(div);
    });
  }catch{$("poiList").innerHTML='<p class="sub">Discovery service busy — try again in a moment.</p>';}
}

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
    if(S.speedMph<2&&S.compass!==null)S.course=S.compass;
    updateCompassUI();
  });
  window.addEventListener("devicemotion",onMotion);
}
// impact detection → pothole prompt
let lastBump=0;
function onMotion(e){
  if(!S.bumpOn||S.speedMph<8)return;
  const a=e.accelerationIncludingGravity;if(!a)return;
  const mag=Math.sqrt((a.x||0)**2+(a.y||0)**2+(a.z||0)**2);
  if(mag>26&&Date.now()-lastBump>8000){
    lastBump=Date.now();
    $("bumpBar").style.display="flex";
    beep(520,.2);if(navigator.vibrate)navigator.vibrate(60);
    setTimeout(()=>{$("bumpBar").style.display="none";},7000);
  }
}
$("bumpYes").onclick=()=>{$("bumpBar").style.display="none";reportHazard("pothole","Auto-detected impact");};
$("bumpNo").onclick=()=>{$("bumpBar").style.display="none";};

/* ═══════════ wake lock (screen stays on while navigating) ═══════════ */
async function requestWakeLock(){
  try{if("wakeLock" in navigator){S.wakeLock=await navigator.wakeLock.request("screen");}}catch{}
}
function releaseWakeLock(){try{S.wakeLock?.release();S.wakeLock=null;}catch{}}
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&S.navigating)requestWakeLock();});

/* ═══════════ battery + network ═══════════ */
let battPct=null;
try{
  if(navigator.getBattery)navigator.getBattery().then(b=>{
    const upd=()=>{battPct=Math.round(b.level*100);$("battStat").textContent=`${battPct}%${b.charging?" ⚡charging":""}`;};
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
      await fetch(`${S.sb.url}/rest/v1/feedback`,{method:"POST",headers:{"Content-Type":"application/json",apikey:S.sb.key,Authorization:`Bearer ${S.sb.key}`},body:JSON.stringify(payload)});
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
$("hudBtn").onclick=()=>{pushUI();$("hud").style.display="flex";};
$("hud").onclick=()=>{$("hud").style.display="none";};

/* ═══════════ voice ═══════════ */
$("fabVoice").onclick=()=>{
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){toast("Voice not supported in this browser.");return;}
  try{
    const rec=new SR();rec.lang="en-US";
    rec.onresult=(e)=>{
      const t=e.results[0][0].transcript.toLowerCase();
      if(/^(navigate to|take me to|go to|drive to|directions to)/.test(t)){const dest=t.replace(/^(navigate to|take me to|go to|drive to|directions to)\s*/,"");$("search").value=dest;forceGeocode(dest);toast("🎤 Finding "+dest);}
      else if(t.includes("pothole"))reportHazard("pothole");
      else if(t.includes("cone")||t.includes("construction"))reportHazard("construction_cones");
      else if(t.includes("accident")||t.includes("crash"))reportHazard("accident");
      else if(t.includes("police"))reportHazard("police");
      else if(t.includes("camera"))reportHazard("camera");
      else if(t.includes("flashlight")||t.includes("light"))$("fabFlash").click();
      else if(t.includes("gas"))discoverOpen("fuel");
      else if(t.includes("coffee"))discoverOpen("cafe");
      else if(t.includes("food")||t.includes("hungry"))discoverOpen("restaurant");
      else if(t.includes("roadside"))openSheet("roadsideSheet");
      else if(t.includes("emergency"))$("fab911").click();
      else if(t.includes("end")||t.includes("stop nav"))endNavigation();
      else toast(`Heard "${t}" — try "navigate to…", "report pothole", "find gas".`);
    };
    rec.onerror=()=>toast("Mic unavailable — check permissions.");
    rec.start();toast("Listening… 🎤");
  }catch{toast("Voice unavailable here.");}
};
function discoverOpen(kind){openSheet("discoverSheet");discover(kind);}

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
function openSheet(id){closeSheets();$(id).classList.add("open");pushUI();}
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
$("toggleBump").onclick=()=>{S.bumpOn=!S.bumpOn;$("bumpState").textContent=S.bumpOn?"On — hard bumps prompt a pothole report":"Off";};
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
function saveSettings(){try{localStorage.setItem("cw",JSON.stringify({sb:S.sb,mpg:$("mpg").value,gas:$("gasPrice").value,theme:S.themeMode,saver:S.saver,alerts:S.audioAlerts,bump:S.bumpOn,units:S.units,voice:S.voiceOn,satKey:S.satKey}));}catch{}}
function loadSettings(){try{const c=JSON.parse(localStorage.getItem("cw")||"{}");
  if(c.sb){S.sb=c.sb;$("sbUrl").value=c.sb.url||"";$("sbKey").value=c.sb.key||"";}
  if(c.mpg)$("mpg").value=c.mpg; if(c.gas)$("gasPrice").value=c.gas;
  if(c.theme)S.themeMode=c.theme;
  if(c.saver!==undefined)S.saver=c.saver;
  if(c.alerts!==undefined)S.audioAlerts=c.alerts;
  if(c.bump!==undefined)S.bumpOn=c.bump;
  if(c.units)S.units=c.units;
  if(c.voice!==undefined)S.voiceOn=c.voice;
  if(c.satKey){S.satKey=c.satKey;var sk=$("satKey");if(sk)sk.value=c.satKey;}}catch{}}
S.units="mi";S.voiceOn=true;S.annStep=-1;S.annStage=0;
loadSettings();
/* v22: visible version stamp so we can confirm what's actually deployed */
try{ if($("appVer"))$("appVer").textContent=APP_VERSION; console.log("ConeWatch "+APP_VERSION+" loaded"); }catch(e){}

let lastSave=0;
document.addEventListener("click",()=>{const n=Date.now();if(n-lastSave>2000){lastSave=n;setTimeout(saveSettings,80);}},true);
function seenWelcome(){try{return localStorage.getItem("cw_welcome")==="1";}catch{return true;}}
$("welcomeGo").onclick=async()=>{
  try{localStorage.setItem("cw_welcome","1");}catch{}
  $("welcome").style.display="none";
  await requestMotion(); startGPS();
  if(S.sb.url&&S.sb.key)loadSharedHazards();
  toast("You're set — search a destination or tap ⚠️ to report.");
};
$("welcomeSkip").onclick=()=>{try{localStorage.setItem("cw_welcome","1");}catch{};$("welcome").style.display="none";startGPS();};

/* free roam as long as you like + one-tap GPS re-lock */
function hideRelock(){$("relock").style.display="none";}
function startRelock(){
  if(S.follow)return;
  $("relock").textContent=S.navigating?"🧭 Free roam — tap to resume navigation":"🧲 Free roam — tap to lock onto GPS";
  $("relock").style.display="block";
}
$("relock").onclick=()=>{hideRelock();S.follow=true;updateFollowUI();cameraFollow();toast(S.navigating?"Resuming navigation view":"🧲 Locked onto GPS");};

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
    if(!map.getSource("esri"))map.addSource("esri",{type:"raster",tiles:satTiles(),tileSize:m.size,attribution:m.attr});
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
    style:{version:8,sources:{esri:{type:"raster",tiles:satTiles(),tileSize:satMeta().size,attribution:satMeta().attr}},layers:[{id:"s",type:"raster",source:"esri"}]},
    center:[lng,lat],zoom:17.4,pitch:60,bearing:0,attributionControl:true});
  let touched=false;
  satMapObj.on("dragstart",()=>touched=true);
  satMapObj.on("load",function spin(){
    const step=()=>{if(!satMapObj)return;if(!touched)satMapObj.setBearing(satMapObj.getBearing()+0.12);orbitRAF=requestAnimationFrame(step);};
    step();
  });
}
$("satClose").onclick=()=>{cancelAnimationFrame(orbitRAF);if(satMapObj){satMapObj.remove();satMapObj=null;}$("satPreview").style.display="none";};
$("satDest").onclick=()=>{if(S.dest)openSat(S.dest.lat,S.dest.lng,S.destName);else toast("Pick a destination first.");};

/* live speed limits from OpenStreetMap while navigating */
S.limit=null;let limitTimer=null,lastLimitQ=0;
async function pollLimit(){
  if(!S.pos||Date.now()-lastLimitQ<30000)return;lastLimitQ=Date.now();
  try{
    const q=`[out:json][timeout:8];way(around:25,${S.pos.lat},${S.pos.lng})["maxspeed"];out tags 1;`;
    const d=await (await fetch("https://overpass-api.de/api/interpreter",{method:"POST",body:"data="+encodeURIComponent(q),headers:{"Content-Type":"application/x-www-form-urlencoded"}})).json();
    const ms=d.elements?.[0]?.tags?.maxspeed;
    if(ms){const n=parseInt(ms);
      if(!isNaN(n)){S.limit=/mph/i.test(ms)?n:Math.round(n*0.621371);
        $("limitNum").textContent=S.limit;$("limitBadge").style.display="block";}}
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
let QK={home:null,work:null,recents:[],park:null};
try{QK=Object.assign(QK,JSON.parse(localStorage.getItem("cw_quick")||"{}"));}catch{}
function saveQK(){try{localStorage.setItem("cw_quick",JSON.stringify(QK));}catch{}}
function renderQuick(){
  const q=$("quick");q.innerHTML="";
  const chip=(label,fn)=>{const b=document.createElement("button");b.className="chip";b.style.padding="5px 11px";b.style.fontSize="11px";b.textContent=label;b.onclick=fn;q.appendChild(b);};
  if(QK.home)chip("🏠 Home",()=>setDestination(QK.home,"Home"));
  if(QK.work)chip("💼 Work",()=>setDestination(QK.work,"Work"));
  if(QK.park)chip("🚘 Parked car",()=>setDestination(QK.park,"My parked car"));
  (QK.recents||[]).slice(0,4).forEach(r=>chip("🕘 "+r.name.slice(0,16),()=>setDestination({lat:r.lat,lng:r.lng},r.name)));
  q.style.display=q.children.length?"flex":"none";
  layout();
}
renderQuick();
$("setHome").onclick=()=>{if(!S.dest)return toast("Pick a destination first.");QK.home={lat:S.dest.lat,lng:S.dest.lng};saveQK();renderQuick();toast("🏠 Home saved");};
$("setWork").onclick=()=>{if(!S.dest)return toast("Pick a destination first.");QK.work={lat:S.dest.lat,lng:S.dest.lng};saveQK();renderQuick();toast("💼 Work saved");};

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
  const want=parseAddr(q);
  // 1) structured search — requires exact house match when a number was typed
  let best=await geocodeStructured(q);
  // 2) if no exact match and no city given, retry with local area appended
  if(!best){
    const p0=parseAddr(q);
    if(!p0.city && !p0.state && !p0.postalcode){
      const loc=await getLocality();
      if(loc)best=await geocodeStructured(q+", "+loc);
    }
  }
  // 3) still nothing but a house number was wanted → try the free-text search as last resort
  if(best){ confirmDestination(best,q); return; }
  if(want.housenumber){
    toast("Couldn't find house #"+want.housenumber+" on that street. Add the ZIP for an exact match.",5000);
    // fall through to plain search so user still gets SOMETHING to verify
  }
  const tries=[]; const loc=await getLocality();
  if(loc)tries.push(`${q}, ${loc}`);
  tries.push(q);
  for(const t of tries){
    try{
      const list=await (await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=10&countrycodes=us&q=${encodeURIComponent(t)}`)).json();
      const best=pickBest(list||[],q);
      if(best){ confirmDestination(best,q); return; }
    }catch{}
    try{
      const d=await (await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(t)}&limit=10&lang=en`)).json();
      const bestP=pickBest(photonToRows(d.features||[]),q);
      if(bestP){ confirmDestination(bestP,q); return; }
    }catch{}
  }
  toast("Couldn't locate that — add a city or ZIP and try again.",3600);
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
function pickBest(rows,q){
  if(!rows||!rows.length)return null;
  var want=parseAddr(q), wStreet=normStreet(want.street);
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
    else if(["city","town","state","administrative"].indexOf(t)>-1)sc-=14;
    if(S.pos){
      var d=distM(S.pos,{lat:+r.lat,lng:+r.lon})/1609.34;
      sc += d<60 ? Math.max(0,6-d/12) : -8;   // tiebreaker only, never decisive
    }
    return {r:r,sc:sc,exactHouse:exactHouse};
  }).sort(function(a,b){return b.sc-a.sc;});
  // if a house number was requested, ONLY accept an exact house-number match
  var pool=want.housenumber ? scored.filter(function(x){return x.exactHouse;}) : scored;
  if(!pool.length)return null;               // no exact house match → let caller retry/widen
  var top=pool[0];
  if(top.sc<-20)return null;
  return {lat:+top.r.lat,lng:+top.r.lon,label:top.r.display_name||q,score:top.sc,exactHouse:top.exactHouse};
}
async function geocodeStructured(q){
  var p=parseAddr(q);
  if(!p.street)return null;
  var qs=new URLSearchParams({format:"jsonv2",addressdetails:"1",limit:"10",countrycodes:"us"});
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
async function confirmDestination(res,typed){
  setDestination({lat:res.lat,lng:res.lng},typed);
  cacheGeocode(typed,res);
  $("confAddr").textContent=res.label||typed;  // res.label is the ACTUAL matched address
  // sanity: flag if the match is suspiciously far (likely wrong match)
  if(S.pos){const mi=distM(S.pos,{lat:res.lat,lng:res.lng})/1609.34;
    if(mi>150){toast("⚠ Match is "+Math.round(mi)+" mi away — if that's wrong, add the ZIP code.",4500);}}
  var d=S.pos?distM(S.pos,{lat:res.lat,lng:res.lng}):null;
  $("confMeta").textContent=d!==null?fmtDist(d)+" away — calculating drive time…":"Location found";
  $("confirmBar").style.display="flex";
  clearTimeout(window.__confT); window.__confT=setTimeout(function(){$("confirmBar").style.display="none";},20000);
  // real driving time from the actual route (fixes straight-line under-estimate)
  if(S.pos&&navigator.onLine){
    try{
      const seg=`${S.pos.lng},${S.pos.lat};${res.lng},${res.lat}?overview=false`;
      let data;
      try{ data=await raceJSON([`https://routing.openstreetmap.de/routed-car/route/v1/driving/${seg}`,`https://router.project-osrm.org/route/v1/driving/${seg}`],d=>d&&d.code==="Ok",6000); }
      catch{ data={code:"Error"}; }
      if(data.routes&&data.routes[0]){
        const rt=data.routes[0], mins=Math.max(1,Math.round(rt.duration*rushFactor()/60));
        const arr=new Date(Date.now()+rt.duration*rushFactor()*1000).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
        $("confMeta").textContent=`${fmtDist(rt.distance)} • ${mins} min • arrive ${arr}`;
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
  const base=dark?"dark_all":"voyager";
  const subs=["a","b","c","d"];
  const lat=S.pos.lat,lon=S.pos.lng;
  const cache=await caches.open("cw-tiles-v2");
  let total=0,okc=0;const jobs=[];
  for(let z=11;z<=17;z++){
    const [cx,cy]=tileXY(lat,lon,z);
    const r=z<=12?2:z<=14?3:z<=15?4:5;
    for(let x=cx-r;x<=cx+r;x++)for(let y=cy-r;y<=cy+r;y++){
      const n=Math.pow(2,z); if(x<0||y<0||x>=n||y>=n)continue;
      const url=`https://${subs[(x+y)%4]}.basemaps.cartocdn.com/rastertiles/${base}/${z}/${x}/${y}.png`;
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
      $("signShield").textContent=tags.ref.split(";")[0];
      $("signShield").style.display="flex";
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
if("serviceWorker" in navigator){window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){});});}
