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
  function overpassFetch(query){
    var body = "data=" + encodeURIComponent(query);
    var i = 0;
    function attempt(){
      if(i >= OVERPASS_MIRRORS.length) return Promise.reject(new Error("all overpass mirrors busy"));
      var url = OVERPASS_MIRRORS[i++];
      var ac = new AbortController();
      var timer = setTimeout(function(){ try{ac.abort();}catch(e){} }, 12000);
      return fetch(url, { method:"POST", body:body, headers:{"Content-Type":"application/x-www-form-urlencoded"}, signal:ac.signal })
        .then(function(res){ clearTimeout(timer); if(!res.ok) throw new Error("http "+res.status); return res.json(); })
        .then(function(d){ if(d && Array.isArray(d.elements)) return d; throw new Error("bad payload"); })
        .catch(function(){ clearTimeout(timer); return attempt(); });   // next mirror
    }
    return attempt();
  }
  window.overpassFetch = overpassFetch;

  /* redefine runCategory to use the resilient fetch (same UI/behavior otherwise) */
  if(typeof runCategory === "function"){
    runCategory = async function(){
      var cat = (typeof curCat !== "undefined") ? curCat : null;
      if(!cat) return;
      var poiList = document.getElementById("poiList");
      if(!S.pos){ if(poiList) poiList.innerHTML='<p class="sub">Waiting for GPS lock…</p>'; return; }
      var miTxt = (curRadius/1609).toFixed(0);
      if(poiList) poiList.innerHTML='<p class="sub">Searching within '+miTxt+' mi…</p>';
      var query = "[out:json][timeout:20];"+cat.q+"(around:"+curRadius+","+S.pos.lat+","+S.pos.lng+");out body 50;";
      try{
        var d = await overpassFetch(query);
        var els = (d.elements||[]).filter(function(e){return e.tags&&e.tags.name;})
          .map(function(e){ return {name:e.tags.name,lat:e.lat,lng:e.lon,hours:e.tags.opening_hours,dist:distM(S.pos,{lat:e.lat,lng:e.lon})}; })
          .sort(function(a,b){return a.dist-b.dist;}).slice(0,15);
        clearPoiMarkers();
        if(!els.length){ if(poiList){ poiList.innerHTML='<p class="sub">Nothing found within '+miTxt+' mi.</p>'+expandHTML(); wireExpand(); } return; }
        if(poiList) poiList.innerHTML="";
        els.forEach(function(e){
          var mk = placeLabelMarker(e.lat,e.lng,e.name,cat.color,cat.emoji); if(mk) poiMarkers.push(mk);
          var div = document.createElement("div"); div.className="poi-item";
          div.innerHTML='<span><b>'+e.name+'</b><small>'+fmtDist(e.dist)+' away'+(e.hours?" · "+e.hours.slice(0,22):"")+'</small></span>'+
            '<span class="poi-acts"><button class="pgo" style="background:'+cat.color+';color:#fff">Go</button><button class="pstop" style="background:rgba(127,127,127,.2);color:inherit;border:1px solid rgba(127,127,127,.3)">+Stop</button></span>';
          div.querySelector(".pgo").onclick=function(){ closeSheets(); setDestination({lat:e.lat,lng:e.lng},e.name); };
          div.querySelector(".pstop").onclick=function(){ addStop({lat:e.lat,lng:e.lng},e.name); };
          poiList.appendChild(div);
        });
        if(poiList){ poiList.insertAdjacentHTML("beforeend",expandHTML()); wireExpand(); }
      }catch(err){
        if(poiList) poiList.innerHTML='<p class="sub">All map servers are busy right now — tap a category again in a few seconds.</p>'+expandHTML();
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

  try{ console.log("ConeWatch discovery patch active"); }catch(e){}
})();
