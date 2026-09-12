"use strict";
/* ═══════════ ConeWatch discovery patch (loads AFTER app.js) ═══════════
   Fixes two things without touching app.js:
   1) Overpass "busy" — rotate across mirrors + retry so one slow server
      doesn't kill Discover.
   2) Apple-style "Search Nearby" — when you type a category word (food,
      gas, coffee, etc.), a "— Search Nearby" action appears at the TOP of
      the suggestions so one tap finds the closest ones instead of
      businesses literally named "Food".
   Safe to load twice; degrades to no-op if app.js internals are missing. */
(function(){
  if(window.__cwPatched) return;
  window.__cwPatched = true;

  /* ---- 1. resilient Overpass with mirror rotation + retry ---- */
  var OVERPASS_MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter"
  ];
  /* race ALL mirrors in parallel — return the instant the fastest one answers */
  function overpassFetch(query){
    var body = "data=" + encodeURIComponent(query);
    function one(url){
      var ac = new AbortController();
      var timer = setTimeout(function(){ try{ac.abort();}catch(e){} }, 9000);
      return fetch(url, { method:"POST", body:body, headers:{"Content-Type":"application/x-www-form-urlencoded"}, signal:ac.signal })
        .then(function(res){ clearTimeout(timer); if(!res.ok) throw new Error("http "+res.status); return res.json(); })
        .then(function(d){ clearTimeout(timer); if(d && Array.isArray(d.elements)) return d; throw new Error("bad payload"); })
        .catch(function(e){ clearTimeout(timer); throw e; });
    }
    var tasks = OVERPASS_MIRRORS.map(one);
    if(Promise.any) return Promise.any(tasks);
    return new Promise(function(resolve,reject){
      var left = tasks.length;
      tasks.forEach(function(p){ p.then(resolve).catch(function(){ if(--left===0) reject(new Error("all mirrors busy")); }); });
    });
  }
  window.overpassFetch = overpassFetch;

  /* instant cache (survives reloads) + Photon fast source */
  var _poiCache = {};
  try{ _poiCache = JSON.parse(localStorage.getItem("cw_poi")||"{}") || {}; }catch(e){ _poiCache = {}; }
  function _savePoiCache(){ try{ var ks=Object.keys(_poiCache); while(ks.length>40){ delete _poiCache[ks.shift()]; } localStorage.setItem("cw_poi", JSON.stringify(_poiCache)); }catch(e){} }
  function _poiKey(cat){ return cat.key + "@" + S.pos.lat.toFixed(2) + "," + S.pos.lng.toFixed(2) + "~" + curRadius; }

  /* Photon = fast, ElasticSearch-backed OSM search (primary). Overpass stays as backup. */
  var POI_PHOTON = {
    fuel:["amenity:fuel"],
    charging_station:["amenity:charging_station"],
    restaurant:["amenity:restaurant","amenity:fast_food"],
    cafe:["amenity:cafe"],
    attraction:["tourism:attraction"],
    parking:["amenity:parking"],
    grocery:["shop:supermarket","shop:convenience"],
    pharmacy:["amenity:pharmacy"],
    hospital:["amenity:hospital","amenity:clinic"],
    bank:["amenity:bank","amenity:atm"],
    hotel:["tourism:hotel","tourism:motel"]
  };
  function photonNearby(cat){
    var tags = POI_PHOTON[cat.key];
    if(!tags) return Promise.reject(new Error("no photon tag"));
    var km = Math.max(0.5, curRadius/1000);
    var url = "https://photon.komoot.io/reverse?lat="+S.pos.lat+"&lon="+S.pos.lng+"&radius="+km+"&limit=30&distance_sort=true&lang=en";
    tags.forEach(function(t){ url += "&osm_tag=" + encodeURIComponent(t); });
    var ac = new AbortController();
    var timer = setTimeout(function(){ try{ac.abort();}catch(e){} }, 6000);
    return fetch(url, { signal:ac.signal })
      .then(function(r){ clearTimeout(timer); if(!r.ok) throw new Error("http "+r.status); return r.json(); })
      .then(function(d){
        var feats = (d && d.features) || [];
        return feats.map(function(f){
          var p = f.properties||{}, c = (f.geometry&&f.geometry.coordinates)||[0,0];
          return { name:(p.name||p.street||""), lat:c[1], lng:c[0], hours:p.opening_hours, dist:distM(S.pos,{lat:c[1],lng:c[0]}) };
        }).filter(function(e){ return e.name && isFinite(e.lat) && isFinite(e.lng); })
          .sort(function(a,b){ return a.dist-b.dist; }).slice(0,15);
      });
  }

  /* build the results list — the WHOLE ROW is tappable (no need to press Go) */
  function renderPoiList(cat, els){
    var poiList = document.getElementById("poiList");
    if(!poiList) return;
    clearPoiMarkers();
    if(!els.length){ poiList.innerHTML = '<p class="sub">Nothing found nearby.</p>' + expandHTML(); wireExpand(); return; }
    poiList.innerHTML = "";
    els.forEach(function(e){
      var mk = placeLabelMarker(e.lat,e.lng,e.name,cat.color,cat.emoji); if(mk) poiMarkers.push(mk);
      var div = document.createElement("div"); div.className = "poi-item"; div.style.cursor = "pointer";
      div.innerHTML =
        '<span style="flex:1;min-width:0"><b>'+e.name+'</b><small>'+fmtDist(e.dist)+' away'+(e.hours?" · "+e.hours.slice(0,22):"")+'</small></span>'+
        '<span class="poi-acts"><button class="pgo" style="background:'+cat.color+';color:#fff">Go</button>'+
        '<button class="pstop" style="background:rgba(127,127,127,.2);color:inherit;border:1px solid rgba(127,127,127,.3)">+Stop</button></span>';
      function go(){ closeSheets(); setDestination({lat:e.lat,lng:e.lng},e.name); }
      div.onclick = function(ev){ if(ev.target.closest(".pstop")) return; go(); };            // tap the name/row → go
      var goBtn = div.querySelector(".pgo"); if(goBtn) goBtn.onclick = function(ev){ ev.stopPropagation(); go(); };
      var stopBtn = div.querySelector(".pstop"); if(stopBtn) stopBtn.onclick = function(ev){ ev.stopPropagation(); addStop({lat:e.lat,lng:e.lng},e.name); };
      poiList.appendChild(div);
    });
    poiList.insertAdjacentHTML("beforeend", expandHTML()); wireExpand();
  }

  if(typeof runCategory === "function"){
    runCategory = async function(){
      var cat = (typeof curCat !== "undefined") ? curCat : null;
      if(!cat) return;
      var poiList = document.getElementById("poiList");
      if(!S.pos){ if(poiList) poiList.innerHTML = '<p class="sub">Waiting for GPS lock…</p>'; return; }
      var key = _poiKey(cat);
      var cached = _poiCache[key];
      if(cached && cached.els && cached.els.length){ renderPoiList(cat, cached.els); }     // paint instantly from cache
      else if(poiList){ poiList.innerHTML = '<p class="sub">Finding the closest '+cat.label.toLowerCase()+'…</p>'; }
      if(cached && Date.now()-cached.t < 120000) return;                                    // fresh (<2 min) → skip network

      var els = null;
      try{ els = await photonNearby(cat); }catch(e){ els = null; }                          // 1) Photon (fast)
      if(!els || !els.length){                                                              // 2) Overpass fallback
        try{
          var query = "[out:json][timeout:20];"+cat.q+"(around:"+curRadius+","+S.pos.lat+","+S.pos.lng+");out body 50;";
          var d = await overpassFetch(query);
          els = (d.elements||[]).filter(function(e){return e.tags&&e.tags.name;})
            .map(function(e){ return {name:e.tags.name,lat:e.lat,lng:e.lon,hours:e.tags.opening_hours,dist:distM(S.pos,{lat:e.lat,lng:e.lon})}; })
            .sort(function(a,b){return a.dist-b.dist;}).slice(0,15);
        }catch(err){ els = null; }
      }

      if(els && els.length){
        _poiCache[key] = { t:Date.now(), els:els }; _savePoiCache();
        if((typeof curCat !== "undefined") && curCat && curCat.key === cat.key) renderPoiList(cat, els);
      } else if((!cached || !cached.els || !cached.els.length) && poiList){
        poiList.innerHTML = '<p class="sub">Couldn\'t reach the map servers — check signal and tap '+cat.label+' again.</p>' + expandHTML();
        wireExpand();
      }
    };
  }

  /* ---- 2. Apple-style category chip at TOP of the search suggestions ---- */
  if(typeof renderResults === "function"){
    var _origRender = renderResults;
    renderResults = function(list){
      _origRender(list);
      try{ ensureCategoryChip(); }catch(e){}
    };
  }
  function ensureCategoryChip(){
    var input = document.getElementById("search");
    var box = document.getElementById("results");
    if(!input || !box || typeof poiCategory !== "function") return;
    var q = input.value.trim();
    var cat = poiCategory(q);
    var existing = box.querySelector(".cw-cat-chip");
    if(!cat){ if(existing) existing.remove(); return; }
    if(existing) return;                              // already present
    var cd = document.createElement("div");
    cd.className = "result ricon cw-cat-chip";
    cd.innerHTML = '<span class="pin" style="background:'+cat.color+'">'+cat.emoji+'</span>'+
      '<span class="rtext"><b>'+cat.label+' — Search Nearby</b><small>Nearest '+cat.label.toLowerCase()+' around you</small></span>';
    cd.onclick = function(ev){ ev.stopPropagation(); box.style.display="none"; try{input.blur();}catch(e){} if(typeof openCategorySearch==="function") openCategorySearch(cat); };
    box.insertBefore(cd, box.firstChild);
    box.style.display = "block";
  }

  /* also offer the chip the instant a category word is typed (before geocoder returns) */
  var si = document.getElementById("search");
  if(si){ si.addEventListener("input", function(){ setTimeout(function(){ try{ ensureCategoryChip(); }catch(e){} }, 60); }); }

  /* ---- 3. same resilience for live speed limits + freeway shields ---- */
  if(typeof pollLimit === "function"){
    pollLimit = async function(){
      if(!S.pos || Date.now()-lastLimitQ < 30000) return; lastLimitQ = Date.now();
      try{
        var q = "[out:json][timeout:8];way(around:25,"+S.pos.lat+","+S.pos.lng+')["maxspeed"];out tags 1;';
        var d = await overpassFetch(q);
        var el = d.elements && d.elements[0];
        var ms = el && el.tags && el.tags.maxspeed;
        if(ms){
          var n = parseInt(ms,10);
          if(!isNaN(n)){
            S.limit = /mph/i.test(ms) ? n : Math.round(n*0.621371);
            var ln = document.getElementById("limitNum"); if(ln) ln.textContent = S.limit;
            var lb = document.getElementById("limitBadge"); if(lb) lb.style.display = "block";
          }
        }
      }catch(e){}
    };
  }
  if(typeof readRoadSign === "function"){
    readRoadSign = async function(){
      if(!S.pos || !S.navigating || Date.now()-lastSignQ < 25000) return; lastSignQ = Date.now();
      try{
        var q = "[out:json][timeout:8];way(around:22,"+S.pos.lat+","+S.pos.lng+')["ref"]["highway"~"motorway|trunk|primary"];out tags 1;';
        var d = await overpassFetch(q);
        var el = d.elements && d.elements[0];
        var tags = el && el.tags;
        var sign = document.getElementById("signShield");
        if(tags && tags.ref && sign && typeof shieldHTML === "function"){
          sign.innerHTML = shieldHTML(String(tags.ref).split(";")[0]);
          sign.style.cssText = "display:flex;background:none;border:none;padding:0";
        } else if(sign){ sign.style.display = "none"; }
      }catch(e){}
    };
  }

  /* ---- 4. hard lock: while the Discover sheet is open, a stray map tap can't dismiss it ----
     (scoped strictly to #discoverSheet; close it with the ✕ or the grab handle) */
  try{
    var _mapEl = document.getElementById("map");
    if(_mapEl){
      ["touchstart","mousedown","click"].forEach(function(ev){
        _mapEl.addEventListener(ev, function(e){
          var ds = document.getElementById("discoverSheet");
          if(ds && ds.classList.contains("open")){ e.stopPropagation(); }   // capture-phase: never reaches the map's dismiss handler
        }, true);
      });
    }
  }catch(e){}

  /* ---- 5. stop signs — same pipeline as app.js's traffic-signal layer, kept here so the
     patch stays the one safe place to add a map layer without touching the 9000-line core file.
     Reuses app.js's globals (they're plain top-level `var`/`function`, so classic-script loading
     puts them on window): _bboxKey, S, map, SIG_MINZ, overpassFetch. Degrades to no-op if any
     of those aren't there yet. */
  (function(){
    if(typeof map==="undefined" || typeof S==="undefined") return;
    var _stopFeat={}, _stopDone=[], _stopT=null, _stopBusy=false;
    var STOP_MINZ = (typeof SIG_MINZ!=="undefined") ? SIG_MINZ : 15;

    function _stopCacheLoad(){
      try{
        var raw=localStorage.getItem("cw_stopsigns"); if(!raw) return;
        var c=JSON.parse(raw); if(!c||!c.f) return;
        c.f.forEach(function(p){ _stopFeat[p[0]]={type:"Feature",properties:{},geometry:{type:"Point",coordinates:[p[1],p[2]]}}; });
      }catch(e){}
    }
    function _stopCacheSave(){
      try{
        var f=[]; for(var id in _stopFeat){ var c=_stopFeat[id].geometry.coordinates; f.push([id,+c[0].toFixed(5),+c[1].toFixed(5)]); }
        if(f.length>4000) f=f.slice(-4000);
        localStorage.setItem("cw_stopsigns", JSON.stringify({f:f}));
      }catch(e){}
    }
    function _stopData(){ return {type:"FeatureCollection",features:Object.keys(_stopFeat).map(function(k){return _stopFeat[k];})}; }
    function _stopPush(els){
      var n=0;
      (els||[]).forEach(function(e){
        var lat=e.lat, lng=e.lon;
        if(!isFinite(lat)||!isFinite(lng)) return;
        var id="p"+e.id;
        if(_stopFeat[id]) return;
        _stopFeat[id]={type:"Feature",properties:{},geometry:{type:"Point",coordinates:[lng,lat]}};
        n++;
      });
      if(n){ try{ if(map.getSource("stopsigns")) map.getSource("stopsigns").setData(_stopData()); }catch(e){} _stopCacheSave(); }
      return n;
    }
    // flat red octagon, matching the flattened signal dot's simplicity
    function _stopIcon(){
      var r=Math.min(4,Math.max(2,Math.ceil(window.devicePixelRatio||2)));
      var SS=2, w=16, h=16;
      var c=document.createElement("canvas"); c.width=w*r*SS; c.height=h*r*SS;
      var x=c.getContext("2d"); x.scale(r*SS,r*SS);
      x.imageSmoothingEnabled=true; x.imageSmoothingQuality="high";
      var cx=w/2, cy=h/2, rad=6.6, sides=8;
      x.save(); x.shadowColor="rgba(0,0,0,.4)"; x.shadowBlur=2; x.shadowOffsetY=.6;
      x.beginPath();
      for(var i=0;i<sides;i++){
        var a=(Math.PI/8)+i*(Math.PI*2/sides);
        var px=cx+rad*Math.cos(a), py=cy+rad*Math.sin(a);
        i===0 ? x.moveTo(px,py) : x.lineTo(px,py);
      }
      x.closePath(); x.fillStyle="#D0342C"; x.fill(); x.restore();
      x.lineWidth=1.4; x.strokeStyle="#FFFFFF"; x.stroke();
      var out=document.createElement("canvas"); out.width=w*r; out.height=h*r;
      var ox=out.getContext("2d"); ox.imageSmoothingEnabled=true; ox.imageSmoothingQuality="high";
      ox.drawImage(c,0,0,out.width,out.height);
      return {canvas:out,w:w*r,h:h*r,ratio:r};
    }
    function _addStopImage(){
      try{
        if(map.hasImage&&map.hasImage("cw-stopsign")) return true;
        var ic=_stopIcon();
        var d=ic.canvas.getContext("2d").getImageData(0,0,ic.w,ic.h);
        map.addImage("cw-stopsign",{width:ic.w,height:ic.h,data:new Uint8Array(d.data.buffer)},{pixelRatio:ic.ratio});
        return true;
      }catch(e){ return false; }
    }
    function ensureStopLayer(){
      try{
        if(!S.mapReady||!map) return;
        if(!map.getSource("stopsigns")) map.addSource("stopsigns",{type:"geojson",data:_stopData()});
        var hasImg=_addStopImage();
        if(!map.getLayer("stopsign-dots")){
          var before = map.getLayer("route-casing") ? "route-casing" : undefined;
          if(hasImg){
            map.addLayer({id:"stopsign-dots",type:"symbol",source:"stopsigns",minzoom:STOP_MINZ,
              layout:{"icon-image":"cw-stopsign",
                "icon-size":["interpolate",["linear"],["zoom"],15,.3,17,.5,19,.7],
                "icon-anchor":"center",
                "icon-allow-overlap":["step",["zoom"],false,17,true],
                "icon-ignore-placement":["step",["zoom"],false,17,true],
                "icon-pitch-alignment":"viewport","icon-rotation-alignment":"viewport"},
              paint:{"icon-opacity":["interpolate",["linear"],["zoom"],15,.7,16.5,1]}
            }, before);
          } else {
            map.addLayer({id:"stopsign-dots",type:"circle",source:"stopsigns",minzoom:STOP_MINZ,
              paint:{"circle-radius":["interpolate",["linear"],["zoom"],15,2.4,19,6],
                     "circle-color":"#D0342C","circle-stroke-width":1,"circle-stroke-color":"#fff"}}, before);
          }
        }
        applyStopVis();
      }catch(e){}
    }
    function applyStopVis(){
      try{ if(map.getLayer("stopsign-dots")) map.setLayoutProperty("stopsign-dots","visibility",(S.mapMode||"full")==="full"?"visible":"none"); }catch(e){}
    }
    async function fetchStopSigns(bbox){
      if(typeof overpassFetch!=="function") return 0;
      var key=(typeof _bboxKey==="function") ? _bboxKey(bbox) : bbox.join(",");
      if(_stopDone.indexOf(key)>-1) return 0;
      _stopDone.push(key); if(_stopDone.length>60) _stopDone.shift();
      var q="[out:json][timeout:18];node["+'"highway"="stop"'+"]("+bbox.join(",")+");out skel;";
      try{ var d=await overpassFetch(q); return _stopPush(d&&d.elements); }
      catch(e){ var i=_stopDone.indexOf(key); if(i>-1) _stopDone.splice(i,1); return 0; }
    }
    async function runStopFetch(){
      try{
        if(!S.mapReady||!map) return;
        if((S.mapMode||"full")!=="full") return;
        if(map.getZoom()<STOP_MINZ) return;
        if(!navigator.onLine||document.hidden) return;
        if(_stopBusy) return;
        var b=map.getBounds(); var pad=0.004;
        var bbox=[b.getSouth()-pad,b.getWest()-pad,b.getNorth()+pad,b.getEast()+pad];
        _stopBusy=true;
        try{ await fetchStopSigns(bbox); } finally { _stopBusy=false; }
      }catch(e){ _stopBusy=false; }
    }
    function scheduleStopFetch(){ if(_stopT) clearTimeout(_stopT); _stopT=setTimeout(runStopFetch, 700); }

    try{ _stopCacheLoad(); }catch(e){}
    setInterval(function(){ try{ if(!document.hidden) runStopFetch(); }catch(e){} }, 11000);

    // piggyback on the exact same triggers app.js already uses for the signal layer, so stop
    // signs load, redraw and hide/show in lockstep with signals without touching app.js at all.
    if(typeof ensureSignalLayer==="function"){
      var _origEnsure=ensureSignalLayer;
      ensureSignalLayer=function(){ _origEnsure(); try{ ensureStopLayer(); }catch(e){} };
    }
    if(typeof scheduleSignalFetch==="function"){
      var _origSchedule=scheduleSignalFetch;
      scheduleSignalFetch=function(){ _origSchedule(); try{ scheduleStopFetch(); }catch(e){} };
    }
    if(typeof applySignalVis==="function"){
      var _origVis=applySignalVis;
      applySignalVis=function(){ _origVis(); try{ applyStopVis(); }catch(e){} };
    }
  })();

  try{ console.log("ConeWatch discovery patch active"); }catch(e){}
  try{
    // reflect the REAL build version from app.js — never hardcode (was stamping a stale number over the badge)
    var _ver = (typeof APP_VERSION !== "undefined") ? APP_VERSION : null;
    if(_ver){
      var vb=document.getElementById("verBadge"); if(vb) vb.textContent=_ver;
      var av=document.getElementById("appVer"); if(av) av.textContent=_ver;
    }
  }catch(e){}
})();
