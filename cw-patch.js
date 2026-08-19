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

  try{ console.log("ConeWatch discovery patch active"); }catch(e){}
  try{
    var vb=document.getElementById("verBadge"); if(vb) vb.textContent="v60";
    var av=document.getElementById("appVer"); if(av) av.textContent="v60";
  }catch(e){}
})();
