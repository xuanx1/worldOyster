/* ============================================================
   ATC SKIN — orthographic-globe scope for oyster
   - Hides leaflet's visual layers (tiles/markers/polylines) but
     leaves the leaflet engine running so oyster's existing
     animation/widget code continues unchanged.
   - Renders an orthographic globe inside .map-container using
     the ATC scope (atc-scope.js).
   - Mirrors oyster's state (cities, currentCityIndex, plane
     marker position) onto the scope every frame.
   - Adds drag-to-pan + wheel-to-zoom on the scope canvas — the
     feature the original ATC scope was missing.
   - Adds chrome: top bar (badge/lamps/clock/active-track/sector
     year/ops review), bottom system ticker, scope tag/mode,
     recenter / routes / labels controls, boot splash.
   ============================================================ */
(function () {
  'use strict';

  /* ---------- tiny helpers ---------- */
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const fmtInt = n => Math.round(n).toLocaleString('en-US');
  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  function bearing(la1, lo1, la2, lo2) {
    la1 *= D2R; la2 *= D2R; const dLo = (lo2 - lo1) * D2R;
    const y = Math.sin(dLo) * Math.cos(la2);
    const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLo);
    return (Math.atan2(y, x) * R2D + 360) % 360;
  }

  let scope = null;
  let firstFrameDrawn = false;
  let userHasPanned = false;            // set on drag; cleared on 🎯
  let lastChartHighlightIdx = null;     // for detecting chart-hover changes
  // smooth fly target for chart-hover "zoom into route" animation
  let flyAnim = null;                   // { lat, lng, zoom, t0, dur, fromLat, fromLng, fromZoom }
  // smoothed display bearing for the scope blip — interpolates toward
  // the geometric bearing so the arrow rotates instead of snapping
  // when a leg ends and the next one starts in a different direction.
  let displayBrg = null;

  function lerpAngle(a, b, t) {
    // shortest-arc lerp on [0,360); t in [0,1]
    let d = ((b - a + 540) % 360) - 180;
    return (a + d * t + 360) % 360;
  }

  /* Top bar + bottom ticker were intentionally removed:
     everything they showed (year, journey, stats, insights button)
     is already in oyster's existing UI — the duplicate chrome
     was just noise. */

  /* ---------- chrome: scope overlays inside .map-container ---------- */
  function buildScopeDOM() {
    const host = document.querySelector('.map-container');
    if (!host || document.getElementById('atcScopeCanvas')) return;

    // canvas — primary view
    const cv = document.createElement('canvas');
    cv.className = 'atc-scope-canvas';
    cv.id = 'atcScopeCanvas';
    host.appendChild(cv);

    // rotating radar sweep
    const sw = document.createElement('div');
    sw.className = 'atc-sweep';
    sw.id = 'atcSweep';
    host.appendChild(sw);

    // CRT overlays
    const vig = document.createElement('div');
    vig.className = 'atc-vignette';
    host.appendChild(vig);

    const sl = document.createElement('div');
    sl.className = 'atc-scanlines';
    host.appendChild(sl);

    // scope tag + mode
    const tag = document.createElement('div');
    tag.className = 'atc-scope-tag';
    tag.innerHTML = 'PPI · ORTHOGRAPHIC · <b>N-UP</b><br>RANGE-FOLLOW';
    host.appendChild(tag);

    const mode = document.createElement('div');
    mode.className = 'atc-scope-mode';
    mode.innerHTML = 'SWEEP 60RPM<br>GAIN <b>AUTO</b>';
    host.appendChild(mode);

    // boot splash
    const boot = document.createElement('div');
    boot.className = 'atc-scope-boot';
    boot.id = 'atcScopeBoot';
    boot.innerHTML = '<span class="dot"></span>ACQUIRING RADAR PICTURE&hellip;';
    host.appendChild(boot);

    // Playing bar — top HUD with playback controls + leg/year status
    const pb = document.createElement('div');
    pb.className = 'atc-playbar';
    pb.id = 'atcPlaybar';
    pb.innerHTML =
      '<button class="atc-pb-btn" data-act="playpause" title="Play / Pause">' +
        '<svg viewBox="0 0 24 24" width="11" height="11" fill="currentColor"><polygon points="6 4 20 12 6 20"/></svg>' +
        '<span class="atc-pb-lbl">REPLAY</span>' +
      '</button>' +
      '<button class="atc-pb-btn" data-act="reset" title="Reset View">' +
        '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3 4 3 10 9 10"/></svg>' +
        '<span class="atc-pb-lbl">RESET</span>' +
      '</button>' +
      '<button class="atc-pb-btn atc-pb-speed" data-act="speed" title="Cycle speed">' +
        '<span class="atc-pb-lbl">1×</span>' +
      '</button>' +
      '<span class="atc-pb-status" id="atcPlaybarStatus">LEG ---/--- · ----</span>';
    host.appendChild(pb);

    // hover tooltip for city pins
    const tip = document.createElement('div');
    tip.className = 'atc-scope-tip';
    tip.id = 'atcScopeTip';
    host.appendChild(tip);
  }

  /* ============================================================
     MIRROR oyster's leaflet state -> ATC scope
     ============================================================ */
  function tCity(name) {
    if (!name) return '';
    return (typeof window.translateCity === 'function') ? (window.translateCity(name) || name) : name;
  }
  function tCountry(name) {
    if (!name) return '';
    return (typeof window.translateCountry === 'function') ? (window.translateCountry(name) || name) : name;
  }
  function nativeOf(name) {
    if (!name || !window.CITY_NATIVE_NAMES) return '';
    return window.CITY_NATIVE_NAMES[name] || window.CITY_NATIVE_NAMES[String(name).trim()] || '';
  }

  function showCityTip(tip, hit) {
    const a = hit.a;
    const t = tCity(a.city);
    const ctry = tCountry(a.country);
    const native = nativeOf(a.city);
    const showNative = native && native.trim() && native.trim() !== t.trim();
    tip.classList.add('city');
    tip.classList.remove('route');
    const latLbl = (typeof a.lat === 'number') ? `${Math.abs(a.lat).toFixed(2)}°${a.lat >= 0 ? 'N' : 'S'}` : '';
    const lngLbl = (typeof a.lng === 'number') ? `${Math.abs(a.lng).toFixed(2)}°${a.lng >= 0 ? 'E' : 'W'}` : '';
    const coords = latLbl && lngLbl ? `${latLbl}, ${lngLbl}` : '';
    tip.innerHTML =
      `<div class="cn">${escapeHtml(t)}</div>` +
      (showNative ? `<div class="nv">${escapeHtml(native)}</div>` : '') +
      (ctry ? `<div class="ct">${escapeHtml(ctry)}</div>` : '') +
      (coords ? `<div class="cd">${coords}</div>` : '');
    tip.style.display = 'block';
    tip.style.left = hit.p.x + 'px';
    tip.style.top = hit.p.y + 'px';
  }

  function showRouteTip(tip, rt, mx, my) {
    const fmCities = (window.flightMap && window.flightMap.cities) || [];
    const fromCity = fmCities[rt.legIndex];
    const toCity = fmCities[rt.legIndex + 1];
    if (!fromCity || !toCity) { tip.style.display = 'none'; return; }
    const dist = haversine(fromCity.lat, fromCity.lng, toCity.lat, toCity.lng);
    const flight = (window.flightMap.flightData || []).find(j => {
      const d = j.date || j.departureDate;
      return d && toCity.flightDate && new Date(d).getTime() === new Date(toCity.flightDate).getTime();
    });
    const fNo = flight && flight.flightNumber ? String(flight.flightNumber).toUpperCase() : '';
    const dateRaw = toCity.flightDate || (flight && flight.date);
    const date = dateRaw ? new Date(dateRaw).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : '';
    const isLand = rt.type === 'land';
    tip.classList.add('route');
    tip.classList.remove('city');
    tip.innerHTML =
      `<div class="rh">${isLand ? 'SURFACE' : (fNo || 'FLIGHT')}${date ? ' · ' + date : ''}</div>` +
      `<div class="rt-line"><span class="rt-end">${escapeHtml(tCity(fromCity.name))}</span>` +
        ` <em class="rt-arr">${isLand ? '⇢' : '→'}</em> ` +
        `<span class="rt-end">${escapeHtml(tCity(toCity.name))}</span></div>` +
      `<div class="rt-dim">${fmtInt(dist)} KM</div>`;
    tip.style.display = 'block';
    tip.style.left = mx + 'px';
    tip.style.top = my + 'px';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Sample great-circle points for hover hit-testing.
  function pickRouteUnder(mx, my) {
    if (!scope || !scope.routes.length) return null;
    let best = null, bd = 18;             // 18px hit slop (generous)
    for (let i = 0; i < scope.routes.length; i++) {
      const rt = scope.routes[i];
      if (rt.state === 'future') continue;
      const pts = scope._gcPoints(rt.from, rt.to, 128);
      const limit = rt.state === 'active' ? Math.max(1, Math.floor(pts.length * (rt.t || 0))) : pts.length;
      for (let j = 0; j < limit; j++) {
        const p = scope.project(pts[j][0], pts[j][1]);
        if (!p.vis) continue;
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bd) { bd = d; best = { legIndex: i, type: rt.type, state: rt.state, t: rt.t }; }
      }
    }
    return best;
  }
  // expose for ad-hoc debugging in DevTools: _atcDebugHover(5) to force-thicken route 5
  window._atcDebugHover = function(idx) { if (scope) scope.hoveredRouteIdx = idx; };

  function legIsLand(toCity) {
    if (!toCity) return false;
    const of = toCity.originalFlight;
    if (of) {
      if (of.type === 'land') return true;
      if (of.mode && /train|bus|ferry|car|drive|walk|road|rail/i.test(of.mode)) return true;
    }
    if (toCity.mode && /train|bus|ferry|car|drive|walk|road|rail/i.test(toCity.mode)) return true;
    if (toCity.journeyType === 'land') return true;
    return false;
  }

  function buildRoutesFromCities() {
    const fm = window.flightMap;
    if (!fm || !fm.cities || fm.cities.length < 2) return;
    const cities = fm.cities;
    const idx = fm.currentCityIndex || 0;

    const routes = [];
    for (let i = 1; i < cities.length; i++) {
      const a = cities[i - 1], b = cities[i];
      if (a.lat == null || b.lat == null) continue;
      let state;
      if (i < idx) state = 'past';
      else if (i === idx) state = 'active';
      else state = 'future';
      const isLand = legIsLand(b);
      routes.push({
        from: [a.lat, a.lng],
        to: [b.lat, b.lng],
        state,
        t: state === 'past' ? 1 : state === 'future' ? 0 : 0.5,
        type: isLand ? 'land' : 'air'
      });
    }
    scope.routes = routes;
  }

  function syncAirports() {
    const fm = window.flightMap;
    if (!fm || !fm.cities) return;
    const idx = fm.currentCityIndex || 0;
    const m = new Map();
    fm.cities.forEach((c, i) => {
      // Only register cities the animation has actually reached.
      // i  <  idx → already visited, shown as green pin
      // i === idx → the current destination — STILL en route. Hidden
      //            until the dot arrives (idx increments past it).
      // i  >  idx → future, never shown until reached.
      if (i >= idx) return;
      const key = (c.airportCode || c.locationCode || c.name || ('c' + i)) + '@' + i;
      m.set(key, {
        lat: c.lat, lng: c.lng,
        code: c.airportCode || c.locationCode || '',
        city: c.name || '',
        country: c.country || '',
        visited: i < idx,
        current: i === idx
      });
    });
    scope.airports = m;
  }

  function syncBlipAndProgress() {
    const fm = window.flightMap;
    if (!fm || !fm.flightDot || !fm.flightDot.getLatLng) { scope.blip = null; scope.tag = null; return; }
    const idx = fm.currentCityIndex || 0;
    const cities = fm.cities || [];
    if (!cities[idx] || !cities[idx - 1]) { scope.blip = null; scope.tag = null; return; }

    let ll;
    try { ll = fm.flightDot.getLatLng(); } catch (e) { return; }
    if (!ll) return;

    const from = cities[idx - 1], to = cities[idx];
    const brg = bearing(ll.lat, ll.lng, to.lat, to.lng);
    const isLand = legIsLand(to);

    scope.blip = { lat: ll.lat, lng: ll.lng, brg, surface: !!isLand };

    // Progress along the active leg, measured along the great-circle
    // distance so the route fill stays in lock-step with the moving
    // dot on the scope (the line is drawn as a great-circle arc,
    // not a Euclidean lat/lng line).
    const totalKm = haversine(from.lat, from.lng, to.lat, to.lng);
    const doneKm = haversine(from.lat, from.lng, ll.lat, ll.lng);
    const t = totalKm > 0 ? Math.max(0, Math.min(1, doneKm / totalKm)) : 0;
    if (scope.routes.length >= idx) {
      const r = scope.routes[idx - 1];
      if (r) r.t = t;
    }

    // build leader-tag content
    const fl = (fm.flightData || []).find(j => {
      const d = j.date || j.departureDate;
      return d && to.flightDate && new Date(d).getTime() === new Date(to.flightDate).getTime();
    }) || {};
    const dist = Math.round(fl.distance || haversine(from.lat, from.lng, to.lat, to.lng));
    const dur = fl.duration
      ? (typeof fl.duration === 'number' ? (fl.duration.toFixed(1) + 'h') : String(fl.duration))
      : '';
    const cs = isLand
      ? ((fl.mode || 'surface').toUpperCase() + ' · SURFACE')
      : ((fl.flightNumber || to.airportCode || '----').toString().toUpperCase());
    const fromLbl = isLand
      ? (from.name || '').toUpperCase()
      : (from.airportCode || from.name || '').toUpperCase();
    const toLbl = isLand
      ? (to.name || '').toUpperCase()
      : (to.airportCode || to.name || '').toUpperCase();

    scope.tag = {
      lines: [
        { t: cs, c: isLand ? 'blip' : 'accent', b: true },
        { t: fromLbl + ' → ' + toLbl, c: 'text' },
        { t: 'BRG ' + String(Math.round(brg)).padStart(3, '0') + '°  ' + Math.round(t * 100) + '%', c: 'blip' },
        { t: (dist ? dist + 'km' : '') + (dur ? '  ' + dur : ''), c: 'dim' }
      ]
    };
  }

  function haversine(la1, lo1, la2, lo2) {
    const R = 6371;
    const dLa = (la2 - la1) * D2R, dLo = (lo2 - lo1) * D2R;
    const a = Math.sin(dLa / 2) ** 2 + Math.cos(la1 * D2R) * Math.cos(la2 * D2R) * Math.sin(dLo / 2) ** 2;
    return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  /* ============================================================
     Render loop
     ============================================================ */
  const ATC_SWEEP_PERIOD_MS = 6000;

  // Pause the flight animation while a route arc is hovered, then
  // resume only if it was running before the hover started.
  let _wasAnimatingBeforeHover = false;
  function pauseFlightForHover() {
    const fm = window.flightMap;
    if (!fm || _wasAnimatingBeforeHover) return;
    if (fm.isAnimating) {
      _wasAnimatingBeforeHover = true;
      if (typeof fm.pauseAnimation === 'function') fm.pauseAnimation();
    }
  }
  function resumeFlightAfterHover() {
    const fm = window.flightMap;
    if (!fm) { _wasAnimatingBeforeHover = false; return; }
    if (_wasAnimatingBeforeHover) {
      _wasAnimatingBeforeHover = false;
      if (typeof fm.resumeAnimation === 'function') fm.resumeAnimation();
    }
  }

  // Playing-bar status: leg counter + current year. Reads flightMap
  // state every frame so the HUD reflects the in-progress animation.
  let _playbarWired = false;
  function updatePlaybarStatus() {
    const pb = document.getElementById('atcPlaybar');
    if (!pb) return;
    const fm = window.flightMap;
    if (!fm) return;

    if (!_playbarWired) {
      _playbarWired = true;
      pb.querySelector('[data-act="playpause"]').addEventListener('click', () => {
        const done = fm.cities && fm.currentCityIndex >= fm.cities.length;
        if (done && typeof fm.replayAnimation === 'function') fm.replayAnimation();
        else if (typeof fm.togglePlayPause === 'function') fm.togglePlayPause();
      });
      pb.querySelector('[data-act="reset"]').addEventListener('click', () => {
        if (fm.map && fm.map.setView) fm.map.setView([20, 100], 1.45);
        if (typeof fm.updatePanningState === 'function') {
          try { fm.updatePanningState(); } catch (e) {}
        }
        recenterOnPlane();
      });
      pb.querySelector('[data-act="speed"]').addEventListener('click', () => {
        if (typeof fm.cycleFastForward === 'function') fm.cycleFastForward();
      });
    }

    // Leg counter (cities.length − 1 = total legs)
    const cities = fm.cities || [];
    const totalLegs = Math.max(0, cities.length - 1);
    const legIdx = Math.max(0, Math.min(totalLegs, fm.currentCityIndex || 0));
    const year = fm._currentYear || (cities[legIdx] && cities[legIdx].date ? String(cities[legIdx].date).slice(0, 4) : '----');
    const status = pb.querySelector('#atcPlaybarStatus');
    if (status) {
      status.textContent = `LEG ${String(legIdx).padStart(3, '0')}/${String(totalLegs).padStart(3, '0')} · ${year}`;
    }

    // Play/pause label mirrors animation state
    const ppBtn = pb.querySelector('[data-act="playpause"]');
    if (ppBtn) {
      const lbl = ppBtn.querySelector('.atc-pb-lbl');
      const animating = !!fm.isAnimating;
      if (lbl) lbl.textContent = animating ? 'PAUSE' : (legIdx >= totalLegs ? 'REPLAY' : 'PLAY');
      ppBtn.classList.toggle('atc-pb-on', animating);
    }

    // Speed label mirrors multiplier
    const spBtn = pb.querySelector('[data-act="speed"]');
    if (spBtn) {
      const lbl = spBtn.querySelector('.atc-pb-lbl');
      const mul = fm.speedMultiplier || 1;
      if (lbl) lbl.textContent = `${mul}×`;
      spBtn.classList.toggle('atc-pb-on', mul !== 1);
    }
  }
  function syncSweepGeometry() {
    const sw = document.getElementById('atcSweep');
    if (!sw || !scope) return;
    const d = scope.radius * 2 + 28;
    sw.style.width = sw.style.height = d + 'px';
    sw.style.left = (scope.cx - d / 2) + 'px';
    sw.style.top = (scope.cy - d / 2) + 'px';
    // Drive the rotation from JS so the canvas glow stays in lockstep
    // with the visible beam. 0deg = up (12 o'clock), sweep rotates
    // clockwise once per ATC_SWEEP_PERIOD_MS.
    const ang = ((performance.now() % ATC_SWEEP_PERIOD_MS) / ATC_SWEEP_PERIOD_MS) * 360;
    sw.style.transform = 'rotate(' + ang + 'deg)';
    scope.sweepAngleDeg = ang;
    scope.sweepPeriodMs = ATC_SWEEP_PERIOD_MS;
  }

  // angular great-circle distance in degrees between two lat/lng points
  function gcAngleDeg(a, b) {
    const la1 = a[0] * D2R, la2 = b[0] * D2R, dLo = (b[1] - a[1]) * D2R;
    const cosc = Math.sin(la1) * Math.sin(la2) + Math.cos(la1) * Math.cos(la2) * Math.cos(dLo);
    return Math.acos(Math.max(-1, Math.min(1, cosc))) * R2D;
  }

  // Pick the scope zoom that fits an angular extent inside ~70% of the radius.
  function zoomToFitAngle(angDeg) {
    if (!isFinite(angDeg) || angDeg <= 0) return 2;
    const z = 60 / angDeg;
    return Math.max(0.7, Math.min(4.5, z));
  }

  // Start a smooth "fly" of the scope to a target (lat, lng, zoom).
  function flyScopeTo(lat, lng, zoom, durMs) {
    flyAnim = {
      t0: performance.now(),
      dur: durMs || 600,
      fromLat: scope.lat0, fromLng: scope.lon0, fromZoom: scope.zoom,
      lat, lng, zoom
    };
  }

  function tickFlyAnim() {
    if (!flyAnim) return false;
    const t = (performance.now() - flyAnim.t0) / flyAnim.dur;
    if (t >= 1) {
      scope.setCenter(flyAnim.lat, flyAnim.lng, true);
      scope.setZoom(flyAnim.zoom);
      flyAnim = null;
      return true;
    }
    const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
    // shortest-path longitude interp
    let dLng = ((flyAnim.lng - flyAnim.fromLng + 540) % 360) - 180;
    const lng = flyAnim.fromLng + dLng * e;
    const lat = flyAnim.fromLat + (flyAnim.lat - flyAnim.fromLat) * e;
    const z   = flyAnim.fromZoom + (flyAnim.zoom - flyAnim.fromZoom) * e;
    scope.setCenter(lat, lng, true);
    scope.setZoom(z);
    return true;
  }

  // Handle chart-hover state — oyster sets fm._chartHighlightIdx
  // when a chart row is hovered. We watch that and fly scope to the
  // hovered route; when cleared, return to the plane.
  function syncChartHover() {
    const fm = window.flightMap;
    if (!fm) return;
    const idx = (typeof fm._chartHighlightIdx === 'number') ? fm._chartHighlightIdx : null;
    if (idx === lastChartHighlightIdx) return;
    lastChartHighlightIdx = idx;

    if (idx == null) {
      // chart hover cleared — fly back onto the moving plane and
      // drop the route highlight.
      userHasPanned = false;
      if (scope) scope.hoveredRouteIdx = null;
      const ll = fm.flightDot && fm.flightDot.getLatLng ? fm.flightDot.getLatLng() : null;
      if (ll) flyScopeTo(ll.lat, ll.lng, 1, 450);
      return;
    }

    const c1 = fm.cities && fm.cities[idx];
    const c2 = fm.cities && fm.cities[idx + 1];
    if (!c1 || !c2 || c1.lat == null || c2.lat == null) return;
    const midLat = (c1.lat + c2.lat) / 2;
    let dLng = ((c2.lng - c1.lng + 540) % 360) - 180;
    let midLng = c1.lng + dLng / 2;
    midLng = ((midLng + 540) % 360) - 180;
    const angDeg = gcAngleDeg([c1.lat, c1.lng], [c2.lat, c2.lng]);
    const targetZ = zoomToFitAngle(angDeg);
    flyScopeTo(midLat, midLng, targetZ, 700);
    userHasPanned = true; // suppress plane-follow while showing the route
    // chart hover -> highlight the same route on the scope (thick + glow,
    // same effect as canvas hover). Route index in oyster matches the
    // route index in scope.routes: cities[idx] -> cities[idx+1].
    if (scope) scope.hoveredRouteIdx = idx;
    console.log('[ATC] chart-hover fly to route', idx, '->', midLat.toFixed(1), midLng.toFixed(1), 'z', targetZ.toFixed(2));
  }

  function startRenderLoop() {
    function tick() {
      // Skip the heavy scope render + widget syncs while a PDF
      // export is rasterising the DOM — they fight the main thread
      // and make the viz feel locked up. Keep the loop alive (so
      // we resume cleanly) but do no work.
      if (window.__atcExportPaused) {
        requestAnimationFrame(tick);
        return;
      }
      const fm = window.flightMap;

      // ━ button: mirror lines-visible directly onto the scope
      if (fm) {
        const want = (fm.linesVisible !== false);
        if (scope.showRoutes !== want) {
          scope.showRoutes = want;
          console.log('[ATC] lines toggled ->', want);
        }
      }

      // Watch oyster's chart-highlight state and fly to / from routes
      syncChartHover();

      // Step any in-progress fly animation; while it's running, it
      // owns the centre + zoom and we don't override.
      const flying = tickFlyAnim();

      // Plane-follow is gated by oyster's 🎯 button state. Clicking
      // the button to un-green it immediately stops the follow.
      // userHasPanned overrides during chart-hover and active drag.
      if (!flying && fm && fm.followDot && !userHasPanned) {
        const ll = fm.flightDot && fm.flightDot.getLatLng ? fm.flightDot.getLatLng() : null;
        if (ll) scope.setCenter(ll.lat, ll.lng, true);
      }

      buildRoutesFromCities();
      syncAirports();
      syncBlipAndProgress();
      syncSweepGeometry();
      scope.render();
      updatePlaybarStatus();
      positionYearOverlay();
      updateCityProgressMeter();
      if (!firstFrameDrawn) {
        firstFrameDrawn = true;
        const boot = document.getElementById('atcScopeBoot');
        if (boot) boot.classList.add('hidden');
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ============================================================
     Pan + zoom interactions on the scope canvas
     ============================================================ */
  function wireInteractions() {
    const cv = document.getElementById('atcScopeCanvas');
    if (!cv) return;

    let dragging = false;
    let lastX = 0, lastY = 0;

    // Drag on the canvas rotates the scope directly. The scope is
    // the source of truth for its own view; leaflet is untouched.
    let dragOriginX = 0, dragOriginY = 0;
    let didMove = false;
    cv.addEventListener('mousedown', e => {
      dragging = true;
      lastX = dragOriginX = e.clientX;
      lastY = dragOriginY = e.clientY;
      didMove = false;
      cv.style.cursor = 'grabbing';
    });
    window.addEventListener('mouseup', () => {
      if (dragging) { dragging = false; cv.style.cursor = ''; }
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      if (!didMove) {
        const totalDx = e.clientX - dragOriginX, totalDy = e.clientY - dragOriginY;
        if (Math.hypot(totalDx, totalDy) < 4) return;
        didMove = true;
        userHasPanned = true;
        flyAnim = null;
        // dragging the scope should also un-green the 🎯 button
        const fm2 = window.flightMap;
        if (fm2 && fm2.followDot && typeof fm2.toggleFollowDot === 'function') {
          try { fm2.toggleFollowDot(); } catch (e) {}
          console.log('[ATC] drag pan -> follow off, button un-greened');
        }
      }
      // pixel delta -> lat/lng rotation, scaled by current scope radius
      const k = 180 / (Math.PI * scope.radius);
      const newLng = ((scope.lon0 - dx * k + 540) % 360) - 180;
      const newLat = Math.max(-85, Math.min(85, scope.lat0 + dy * k));
      scope.lon0 = scope.targetLon = newLng;
      scope.lat0 = scope.targetLat = newLat;
    });

    cv.addEventListener('wheel', e => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
      scope.zoomBy(factor);
    }, { passive: false });

    // dblclick = same as 🎯 recenter
    cv.addEventListener('dblclick', recenterOnPlane);

    // Hook oyster's 🎯 button — it lives inside fm.followDotButton.
    // Polling because the button is created after leaflet init.
    const hookTimer = setInterval(() => {
      const fm = window.flightMap;
      if (fm && fm.followDotButton && !fm.followDotButton._atcHooked) {
        fm.followDotButton._atcHooked = true;
        fm.followDotButton.addEventListener('click', onFollowButtonClick, true);
        clearInterval(hookTimer);
        console.log('[ATC] hooked 🎯 follow-dot button');
      }
    }, 250);
    // Reset-view lives in the .atc-playbar (bottom-left), which
    // handles setView + scope recentering directly. No leaflet hook
    // needed here.

    // Rich hover tooltip — mirrors oyster's leaflet city tooltip
    // (translated city + native script + translated country),
    // and falls back to a route popup when hovering near a leg arc.
    const tip = document.getElementById('atcScopeTip');
    let lastHoverIdx = null;
    cv.addEventListener('mousemove', e => {
      if (dragging || !scope) return;
      // While a chart row is being hovered, leave its route highlight
      // and tooltip alone — canvas hover shouldn't fight it.
      if (lastChartHighlightIdx != null) return;
      const r = cv.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      // closest city pin first
      let bestCity = null, bcd = 14;
      scope.airports.forEach(a => {
        const p = scope.project(a.lat, a.lng);
        if (!p.vis) return;
        const d = Math.hypot(p.x - mx, p.y - my);
        if (d < bcd) { bcd = d; bestCity = { a, p }; }
      });
      if (bestCity) {
        if (scope.hoveredRouteIdx !== null) {
          scope.hoveredRouteIdx = null;
          lastHoverIdx = null;
        }
        scope.hoveredCityName = bestCity.a.city || null;
        if (tip) showCityTip(tip, bestCity);
        cv.style.cursor = 'pointer';
        return;
      }
      // otherwise nearest route arc
      const rt = pickRouteUnder(mx, my);
      if (rt) {
        if (lastHoverIdx !== rt.legIndex) {
          console.log('[ATC] route hover ->', rt.legIndex, rt.type, rt.state);
          lastHoverIdx = rt.legIndex;
        }
        scope.hoveredRouteIdx = rt.legIndex;
        pauseFlightForHover();
        if (tip) showRouteTip(tip, rt, mx, my);
        cv.style.cursor = 'pointer';
      } else {
        if (lastHoverIdx !== null) {
          console.log('[ATC] route hover cleared');
          lastHoverIdx = null;
        }
        scope.hoveredRouteIdx = null;
        scope.hoveredCityName = null;
        resumeFlightAfterHover();
        if (tip) tip.style.display = 'none';
        cv.style.cursor = 'grab';
      }
    });
    cv.addEventListener('mouseleave', () => {
      if (tip) tip.style.display = 'none';
      if (scope) { scope.hoveredRouteIdx = null; scope.hoveredCityName = null; }
      resumeFlightAfterHover();
    });
  }

  // Called from the 🎯 button's capture-phase click handler — runs
  // BEFORE oyster's onclick toggles fm.followDot. So fm.followDot here
  // is the *current* state, and the click will invert it after us.
  function onFollowButtonClick() {
    const fm = window.flightMap;
    if (!fm) return;
    if (!fm.followDot) {
      // about to turn ON → clear my pan/flyAnim state and fly to plane
      userHasPanned = false;
      flyAnim = null;
      lastChartHighlightIdx = null;
      const ll = fm.flightDot && fm.flightDot.getLatLng ? fm.flightDot.getLatLng() : null;
      if (ll) flyScopeTo(ll.lat, ll.lng, 1, 450);
      console.log('[ATC] follow ON — flying to plane');
    } else {
      // about to turn OFF → freeze scope, no fly
      userHasPanned = false;   // chart-hover / drag may still set this later
      flyAnim = null;
      console.log('[ATC] follow OFF — scope stays put');
    }
  }
  // dblclick = explicit "recenter now" (independent of button state)
  function recenterOnPlane() {
    userHasPanned = false;
    flyAnim = null;
    lastChartHighlightIdx = null;
    const fm = window.flightMap;
    const ll = fm && fm.flightDot && fm.flightDot.getLatLng ? fm.flightDot.getLatLng() : null;
    if (ll) {
      flyScopeTo(ll.lat, ll.lng, 1, 450);
      // also ensure follow is ON so the scope continues tracking
      if (fm && !fm.followDot && typeof fm.toggleFollowDot === 'function') {
        try { fm.toggleFollowDot(); } catch (e) {}
      }
      console.log('[ATC] dblclick recenter', ll.lat.toFixed(2), ll.lng.toFixed(2));
    }
  }

  /* ---------- restore oyster's original leaflet controls ---------- */
  /* Their DOM lives inside #map (which my canvas covers). Move the
     leaflet control container to be a sibling of the canvas so it
     renders above the scope and stays fully clickable. */
  function reattachLeafletControls() {
    const host = document.querySelector('.map-container');
    const cc = document.querySelector('#map .leaflet-control-container')
            || document.querySelector('.leaflet-control-container');
    if (host && cc && cc.parentElement !== host) {
      host.appendChild(cc);
    }
  }

  /* ---------- hover a city-list item -> highlight its pin on the scope ---------- */
  /* Items are created/destroyed dynamically by oyster's updateCityList(),
     so we use event delegation on the two list containers. */
  function hookCityListHover() {
    const lists = [
      document.getElementById('cityList'),
      document.getElementById('cityListMobile')
    ];
    lists.forEach(list => {
      if (!list || list._atcHovered) return;
      list._atcHovered = true;
      list.addEventListener('mouseover', e => {
        const item = e.target.closest('.city-item');
        if (!item || !scope) return;
        const nameEl = item.querySelector('.city-name');
        if (!nameEl) return;
        const displayed = (nameEl.textContent || '').trim();
        if (!displayed) return;
        // map displayed (translated) name back to an airport's original name
        let match = null;
        scope.airports.forEach(a => {
          if (match) return;
          const tName = tCity(a.city || '');
          if (tName === displayed || (a.city || '').trim() === displayed) match = a;
        });
        if (match) scope.hoveredCityName = match.city;
      });
      list.addEventListener('mouseout', e => {
        const item = e.target.closest('.city-item');
        const to = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.city-item');
        if (item && !to && scope) scope.hoveredCityName = null;
      });
    });
  }

  /* ---------- ticker: ensure it lives on <body>, not inside .header ----------
     The original animated-flight-map.js appends .header-ticker inside
     .header, but .header has `backdrop-filter` which establishes a
     containing block for fixed-positioned descendants — that traps the
     ticker visually inside the small map card. We pre-create the
     element as a direct child of <body> so the existing first-look
     `querySelector('.header-ticker')` in animated-flight-map.js
     reuses it instead of creating a new one. Result: a real
     viewport-wide top bar.
     ---------------------------------------------------------------- */
  function prepareTopTicker() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    if (document.querySelector('.header-ticker')) {
      // already created — re-parent to body so it escapes any
      // backdrop-filter ancestor
      const existing = document.querySelector('.header-ticker');
      if (existing.parentElement !== document.body) {
        document.body.appendChild(existing);
      }
      return;
    }
    const t = document.createElement('div');
    t.className = 'header-ticker';
    document.body.appendChild(t);
  }

  /* ---------- group stats-section + city-list into one panel with a
     shared "Travel Statistics" title above them ---------- */
  function groupStatsAndCityList() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    const stats = document.querySelector('body > .stats-section') ||
                  document.querySelector('.stats-section');
    const cityList = document.querySelector('body > .city-list-container') ||
                     document.querySelector('.city-list-container');
    if (!stats || !cityList) return;

    let group = document.querySelector('.stats-citylist-group');
    if (!group) {
      group = document.createElement('div');
      group.className = 'stats-citylist-group';

      const titleBar = document.createElement('div');
      titleBar.className = 'stats-citylist-title';
      // pull the existing localised title text from .stats-title
      const origTitle = stats.querySelector('.stats-title');
      titleBar.textContent = origTitle ? origTitle.textContent : 'Travel Statistics';
      // keep i18n key so language switch updates the new title too
      if (origTitle && origTitle.dataset.i18n) {
        titleBar.setAttribute('data-i18n', origTitle.dataset.i18n);
      }
      if (origTitle) origTitle.style.display = 'none';

      const row = document.createElement('div');
      row.className = 'stats-citylist-row';

      group.appendChild(titleBar);
      group.appendChild(row);

      // insert at stats' original position
      stats.parentElement.insertBefore(group, stats);
      row.appendChild(stats);
      row.appendChild(cityList);
    }
  }

  /* ---------- move city list out of the scope card to the right column ---------- */
  /* User wants the city list as its own panel on the right side of
     the page, sitting ABOVE the Travel Statistics panel. The CSS
     positions both absolutely; here we just re-parent the element so
     `body > .city-list-container` selectors apply. */
  function detachCityList() {
    if (window.innerWidth < 769) return;          // mobile keeps original layout
    const cl = document.querySelector('.card-container > .city-list-container');
    if (!cl) return;
    const stats = document.querySelector('.stats-section');
    if (stats && stats.parentElement) {
      stats.parentElement.insertBefore(cl, stats);
    } else {
      document.body.appendChild(cl);
    }
  }

  /* ============================================================
     wheel-to-horizontal-scroll
     The desktop layout turns the body into a horizontal scroll
     lane (see @media (min-width:769px) in atc-skin.css), but
     mouse wheels emit vertical deltas. Translate deltaY → scrollLeft
     on the body so plain mouse wheels pan the lane. Skip whenever
     the wheel happens inside an element (or ancestor) that can
     actually consume the vertical delta itself — scope canvas,
     chart canvases, the inner city-list, choropleth ranking, etc.
     ============================================================ */
  function wireHorizontalWheel() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;

    const canConsumeVertical = (el) => {
      for (let n = el; n && n !== document.body; n = n.parentElement) {
        // canvas-based widgets (scope, charts, mini-maps) handle wheel themselves
        if (n.tagName === 'CANVAS') return true;
        if (n.classList && (
              n.classList.contains('leaflet-container') ||
              n.classList.contains('choropleth-map')
            )) return true;
        const cs = getComputedStyle(n);
        const oy = cs.overflowY;
        if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) {
          return true;
        }
      }
      return false;
    };

    window.addEventListener('wheel', (e) => {
      if (e.ctrlKey) return; // browser zoom
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // trackpad horizontal pass-through
      if (canConsumeVertical(e.target)) return;
      const delta = e.deltaY;
      if (!delta) return;
      // deltaMode 1 = lines, 2 = pages — convert to pixels
      const px = e.deltaMode === 1 ? delta * 24 : e.deltaMode === 2 ? delta * window.innerHeight : delta;
      document.scrollingElement.scrollLeft += px;
      e.preventDefault();
    }, { passive: false });
  }

  /* ============================================================
     scroll-progress meter (replaces the native horizontal
     scrollbar on desktop). A flowing-green gradient bar pinned to
     the viewport bottom, whose fill width tracks scrollLeft.
     ============================================================ */
  function wireScrollMeter() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;

    const meter = document.createElement('div');
    meter.id = 'atcScrollMeter';
    const fill = document.createElement('div');
    fill.className = 'fill';
    meter.appendChild(fill);
    document.body.appendChild(meter);

    const update = () => {
      const se = document.scrollingElement || document.documentElement;
      const max = se.scrollWidth - se.clientWidth;
      const pct = max > 0 ? (se.scrollLeft / max) * 100 : 0;
      fill.style.width = pct.toFixed(2) + '%';
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
  }

  /* ============================================================
     Year-overlay centring — the card has a header strip at the top
     and a progress-bar at the bottom inside the same card box, so
     the visible "map area" centre is not the same as .map-container's
     geometric centre. We measure the live heights and write
     position styles directly on the overlay.
     ============================================================ */
  function positionYearOverlay() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    const ov = document.getElementById('yearOverlay');
    if (!ov) return;
    const mapBox = document.querySelector('.map-container');
    const card = document.querySelector('.card-container');
    if (!mapBox || !card) return;
    const header = card.querySelector(':scope > .header');
    const progress = card.querySelector(':scope > .progress-bar');
    const cardRect = card.getBoundingClientRect();
    const mapRect = mapBox.getBoundingClientRect();
    const hH = header ? header.offsetHeight : 0;
    const pH = progress ? progress.offsetHeight : 0;
    const visibleTop = hH;                                // px from card top
    const visibleBottom = cardRect.height - pH;
    const visibleCenter = (visibleTop + visibleBottom) / 2;
    // .year-overlay is absolutely positioned inside .map-container,
    // which fills the entire card (incl. behind the header). So the
    // y-offset inside .map-container = visibleCenter - (mapRect.top - cardRect.top).
    const mapOffsetInsideCard = mapRect.top - cardRect.top;
    const yInsideMap = visibleCenter - mapOffsetInsideCard;
    ov.style.top = yInsideMap + 'px';
    ov.style.left = (mapRect.width / 2) + 'px';
  }

  /* ============================================================
     widget-map invalidate hook
     The choropleth and unvisited mini-maps cache their leaflet
     container size at creation time. The ATC layout resizes the
     widget cards after the widgets initialise, so the maps think
     they're still the old narrow size and leave a margin of
     uninitialised tiles. ResizeObserver fires invalidateSize() on
     every layout change so the map always fills its widget card.
     ============================================================ */
  function wireWidgetMapResize() {
    if (typeof ResizeObserver === 'undefined') return;
    const ping = (el) => {
      if (!el) return;
      // Walk up to find the leaflet map instance attached to this DOM node
      // (Leaflet stores it on the element as ._leaflet_map_id; we instead
      // grab it via the global _map reference set by Leaflet on the div).
      // We don't have direct access to the map object here, so we just
      // dispatch a window resize which Leaflet listens to.
    };
    const ro = new ResizeObserver(() => {
      window.dispatchEvent(new Event('resize'));
    });
    const attach = () => {
      const choro = document.querySelector('.widget-card:has(#costChoropleth)');
      const unvis = document.querySelector('.widget-card:has(#unvisitedNeighbors)');
      if (choro) ro.observe(choro);
      if (unvis) ro.observe(unvis);
    };
    attach();
    setTimeout(attach, 600);
    setTimeout(attach, 1500);
  }

  /* ============================================================
     widget relocations
       1. Move the 6 .record-card children of #recordsCards into
          .widget-stack so the records sit alongside Return Visits,
          Longest Stays and Most Flown Airlines in one row.
       2. Move .widget-card:has(#durationTrend) into the spending
          heatmap's grid as the last child — fills the empty 2028
          slot at the bottom of the 2-col heatmap layout.
     Both source widget-cards get the .atc-moved class so the CSS
     hides their now-empty wrappers.
     ============================================================ */
  /* Duration trend → spending heatmap.
     Previous approach (moving the DOM node) lost the race against
     spending-heatmap.js's `container.innerHTML = html` reset.
     New approach: leave the original duration widget where it is
     (hidden by CSS), and CLONE its rendered SVG into a slot at
     the top of the heatmap. Re-clone whenever either side
     re-renders, driven by two MutationObservers. */
  function ensureDurationInHeatmap() {
    const heatmap = document.getElementById('spendingHeatmap');
    const original = document.getElementById('durationTrend');
    if (!heatmap || !original) return;

    let slot = heatmap.querySelector(':scope > .atc-duration-slot');
    if (!slot) {
      slot = document.createElement('div');
      slot.className = 'atc-duration-slot';
      const card = document.createElement('div');
      card.className = 'widget-card';
      const title = document.createElement('div');
      title.className = 'widget-title';
      // mirror the localised title from the original widget
      const origTitle = document.querySelector('.widgets-inner > .widget-card:has(#durationTrend) > .widget-title');
      if (origTitle) {
        title.textContent = origTitle.textContent;
        if (origTitle.dataset.i18n) title.setAttribute('data-i18n', origTitle.dataset.i18n);
      } else {
        title.textContent = 'Avg Duration / Year';
      }
      const host = document.createElement('div');
      host.className = 'atc-duration-host';
      card.appendChild(title);
      card.appendChild(host);
      slot.appendChild(card);
      // Append at the END so the slot lands in the heatmap's
      // next-available cell — i.e., the 2028 position right after
      // the last year (2027).
      heatmap.appendChild(slot);
    }

    const host = slot.querySelector('.atc-duration-host');
    if (host && !host.dataset.atcRendered) {
      // Tell duration-trend.js to render directly into this host
      // (it iterates over all .atc-duration-host elements). That
      // way the SVG comes with its own event listeners attached —
      // hover tooltips work natively.
      if (typeof window.renderDurationTrend === 'function') {
        window.renderDurationTrend();
        host.dataset.atcRendered = '1';
      }
    }
  }

  // Move .neighbors-regions out of .neighbors-legend so it sits as a
  // direct grid cell of #unvisitedNeighbors (column 2 / row 1 span 2).
  // Polls until the strip actually exists since the widget renders
  // asynchronously, and re-runs if the unvisited widget re-renders.
  function reparentUnvisitedStrip() {
    const host = document.getElementById('unvisitedNeighbors');
    if (!host) return false;
    const strip = host.querySelector('.neighbors-regions');
    if (!strip) return false;
    if (strip.parentElement === host) return true;
    host.appendChild(strip);
    return true;
  }
  // Split the region cards into white-normal / pink-special columns
  // AND force each card's grid-column / grid-row inline so neither
  // .region-wide nor .region-full can ever span 2 cells. White column
  // is a 2-col grid filled row-by-row by REGION_ORDER (africa,
  // americas, asia, oceania, europe, disputed) → column 1 holds
  // Africa / Asia / Europe, column 2 holds Americas / Oceania / Disputed.
  // Measure the vertical gap between the first two cards in sub-col
  // A (which space-between distributes across the full strip height),
  // then apply that exact gap to sub-col B and anchor its cards to
  // the top. Sub-col B stops stretching to fill the column and
  // instead reads as a naturally short stack with sub-col A's rhythm.
  function syncSubColBGap(subA, subB) {
    if (!subA) return;
    const aCards = Array.from(subA.children);
    if (aCards.length < 2) return;
    const r0 = aCards[0].getBoundingClientRect();
    const r1 = aCards[1].getBoundingClientRect();
    const gap = Math.max(0, Math.round(r1.top - r0.bottom));
    if (subB) {
      subB.style.setProperty('justify-content', 'flex-start', 'important');
      subB.style.setProperty('gap', gap + 'px', 'important');
    }
    // Match the X gap (between sub-cols) to the Y gap so spacing
    // reads uniformly. Parent of subA is the wrapper column
    // (.neighbors-col-normal / .neighbors-col-special).
    const wrapper = subA.parentElement;
    if (wrapper) {
      wrapper.style.setProperty('column-gap', gap + 'px', 'important');
      wrapper.style.setProperty('gap', gap + 'px', 'important');
    }
  }

  function applyUnvisitedLayout() {
    const regionsHost = document.querySelector('#unvisitedNeighbors .neighbors-regions');
    if (!regionsHost) return false;
    if (!regionsHost.dataset.atcSplit) {
      const kids = Array.from(regionsHost.children).filter(el =>
        el.classList && el.classList.contains('neighbors-region')
      );
      if (!kids.length) return false;
      const whiteCol = document.createElement('div');
      whiteCol.className = 'neighbors-col-normal';
      const pinkCol = document.createElement('div');
      pinkCol.className = 'neighbors-col-special';
      kids.forEach(el => {
        const styleAttr = el.getAttribute('style') || '';
        const isPink = styleAttr.indexOf('183,110,121') !== -1 ||
                       styleAttr.indexOf('#B76E79') !== -1;
        (isPink ? pinkCol : whiteCol).appendChild(el);
      });
      regionsHost.appendChild(whiteCol);
      regionsHost.appendChild(pinkCol);
      regionsHost.dataset.atcSplit = '1';
    }
    // White col → wrap region cards into TWO independent vertical
    // sub-columns. Each sub-column is a flex column with
    // justify-content: space-between, so the FIRST card sits at the
    // top of its sub-column and the LAST card sits at the bottom;
    // middle cards float in between. Columns are independent: the
    // middle card in sub-col A does NOT have to align with the
    // middle card in sub-col B.
    //
    // REGION_ORDER is ['africa','asia','europe','americas','oceania',
    // 'disputed'] (column-major), so first 3 → sub-col A
    // (Africa/Asia/Europe), last 3 → sub-col B (Americas/Oceania/
    // Disputed).
    const whiteColEl = regionsHost.querySelector(':scope > .neighbors-col-normal');
    if (whiteColEl) {
      // REGION_ORDER column-major → 3/3 split: sub-col A = africa,
      // asia, europe; sub-col B = americas, oceania, disputed.
      const ROWS = 3;
      const rawCards = Array.from(whiteColEl.children).filter(el =>
        el.classList && el.classList.contains('neighbors-region')
      );
      if (rawCards.length) {
        Array.from(whiteColEl.children).forEach(c => {
          if (c.classList && c.classList.contains('atc-sub-col')) c.remove();
        });
        const subA = document.createElement('div');
        subA.className = 'atc-sub-col atc-sub-col-a';
        const subB = document.createElement('div');
        subB.className = 'atc-sub-col atc-sub-col-b';
        rawCards.forEach((card, idx) => {
          card.style.removeProperty('grid-column');
          card.style.removeProperty('grid-row');
          (idx < ROWS ? subA : subB).appendChild(card);
        });
        whiteColEl.appendChild(subA);
        whiteColEl.appendChild(subB);
        // Sub-col B (Americas/Oceania/Disputed) is much shorter than
        // sub-col A combined, so DO NOT stretch it to fill the column.
        // Instead measure the natural y-gap between sub-col A's cards
        // (which space-between distributes across the full height) and
        // re-use that exact gap for sub-col B, with cards anchored at
        // the top.
        requestAnimationFrame(() => syncSubColBGap(subA, subB));
      }
    }
    // Pink col → same treatment as white col: TWO independent
    // vertical sub-columns side-by-side, each with first card
    // anchored to top and last card anchored to bottom. Special-
    // territory continents (africa, americas, asia, europe,
    // oceania, antarctica) split column-major: first half into
    // .atc-sub-col-a, remainder into .atc-sub-col-b.
    const pinkColEl = regionsHost.querySelector(':scope > .neighbors-col-special');
    if (pinkColEl) {
      const rawPinkCards = Array.from(pinkColEl.children).filter(el =>
        el.classList && el.classList.contains('neighbors-region')
      );
      if (rawPinkCards.length) {
        Array.from(pinkColEl.children).forEach(c => {
          if (c.classList && c.classList.contains('atc-sub-col')) c.remove();
        });
        // Pink col now has a single sub-col. Width parity with the
        // white sub-cols is handled by .neighbors-col-special's
        // flex ratio (1:2 vs white's 2:2). No empty placeholder.
        const pinkA = document.createElement('div');
        pinkA.className = 'atc-sub-col atc-sub-col-a';
        // Antarctica (last in specOrder) is pulled out and parked in
        // white sub-B beneath Unrecognised, separated by a divider.
        const antarctica = rawPinkCards[rawPinkCards.length - 1];
        rawPinkCards.forEach(card => {
          card.style.removeProperty('grid-column');
          card.style.removeProperty('grid-row');
          if (card !== antarctica) pinkA.appendChild(card);
        });
        pinkColEl.appendChild(pinkA);
        const whiteSubB = whiteColEl && whiteColEl.querySelector(':scope > .atc-sub-col-b');
        if (whiteSubB && antarctica) {
          whiteSubB.appendChild(antarctica);
        }
        requestAnimationFrame(() => {
          ensureRegionDivider(whiteSubB);
          const whiteSubA = whiteColEl && whiteColEl.querySelector(':scope > .atc-sub-col-a');
          if (whiteColEl && whiteSubA && whiteSubB) {
            autoBalanceSubCols(whiteColEl, whiteSubA, whiteSubB);
            ensureRegionDivider(whiteSubB);
            syncSubColBGap(whiteSubA, whiteSubB);
          }
          // Sync pink's Y-rhythm to the white col's measured gap so
          // both columns share spacing.
          if (whiteColEl) {
            const wSubA = whiteColEl.querySelector(':scope > .atc-sub-col-a');
            const wSubB = whiteColEl.querySelector(':scope > .atc-sub-col-b');
            if (wSubA && wSubB) syncSubColBGap(wSubA, pinkA);
          }
        });
      }
    }
    return true;
  }

  // Insert / refresh the divider between the last white-bordered
  // ("Unvisited Countries") card and the first pink-bordered
  // ("Unvisited Places") card inside a sub-col.
  function ensureRegionDivider(host) {
    if (!host) return;
    host.querySelectorAll(':scope > .atc-region-divider').forEach(el => el.remove());
    const cards = Array.from(host.children).filter(el =>
      el.classList && el.classList.contains('neighbors-region')
    );
    if (cards.length < 2) return;
    let firstPink = -1;
    for (let i = 0; i < cards.length; i++) {
      const s = cards[i].getAttribute('style') || '';
      if (s.indexOf('183,110,121') !== -1 || s.indexOf('#B76E79') !== -1) {
        firstPink = i;
        break;
      }
    }
    if (firstPink <= 0) return;
    const sep = document.createElement('div');
    sep.className = 'atc-region-divider';
    sep.innerHTML =
      '<span class="atc-rdiv-label atc-rdiv-up">▲ Unvisited Countries</span>' +
      '<span class="atc-rdiv-line"></span>' +
      '<span class="atc-rdiv-label atc-rdiv-down">Unvisited Places ▼</span>';
    host.insertBefore(sep, cards[firstPink]);
  }

  function startUnvisitedStripObserver() {
    if (window.__atcUnvisStripObs) return;
    window.__atcUnvisStripObs = true;
    let tries = 0;
    const iv = setInterval(() => {
      reparentUnvisitedStrip();
      const ok = applyUnvisitedLayout();
      if (ok || ++tries > 200) clearInterval(iv);
    }, 250);
    const host = document.getElementById('unvisitedNeighbors');
    if (host) {
      new MutationObserver(() => {
        reparentUnvisitedStrip();
        applyUnvisitedLayout();
      }).observe(host, { childList: true, subtree: true });
    }
    // Re-measure sub-col B's gap whenever the window resizes (the
    // strip height changes → sub-col A's space-between gap changes).
    let resizeRaf = 0;
    window.addEventListener('resize', () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        const wc = document.querySelector('#unvisitedNeighbors .neighbors-col-normal');
        if (!wc) return;
        const a = wc.querySelector(':scope > .atc-sub-col-a');
        const b = wc.querySelector(':scope > .atc-sub-col-b');
        syncSubColBGap(a, b);
        const pc = document.querySelector('#unvisitedNeighbors .neighbors-col-special');
        if (pc) {
          const pa = pc.querySelector(':scope > .atc-sub-col-a');
          const pb = pc.querySelector(':scope > .atc-sub-col-b');
          syncSubColBGap(pa, pb);
        }
      });
    });
  }

  function wireWidgetRelocations() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    startUnvisitedStripObserver();
    // Observe the heatmap — when its DOM is wiped by its own
    // innerHTML rebuild, recreate our duration slot.
    const heatmap = document.getElementById('spendingHeatmap');
    if (heatmap && !heatmap.dataset.atcDurObs) {
      heatmap.dataset.atcDurObs = '1';
      const obs = new MutationObserver(() => {
        if (!heatmap.querySelector(':scope > .atc-duration-slot')) {
          setTimeout(ensureDurationInHeatmap, 30);
        }
      });
      obs.observe(heatmap, { childList: true });
    }
    // Observe the ORIGINAL #durationTrend — every time its SVG
    // is re-rendered (initial render, language change, etc.) we
    // re-clone the markup into our slot.
    const originalDT = document.getElementById('durationTrend');
    if (originalDT && !originalDT.dataset.atcDurObs) {
      originalDT.dataset.atcDurObs = '1';
      const obs2 = new MutationObserver(() => ensureDurationInHeatmap());
      obs2.observe(originalDT, { childList: true, subtree: true, characterData: true });
    }
    const run = () => {
      // 1. Records cards → into a wrapper inside widget-stack so
      //    they live as a single grid cell (2×3 mini-grid).
      const recordsWrap = document.querySelector('.widget-card:has(#recordsCards)');
      const stack = document.querySelector('.widget-stack');
      if (recordsWrap && stack && !recordsWrap.classList.contains('atc-moved')) {
        const cards = recordsWrap.querySelectorAll('#recordsCards .record-card');
        if (cards.length) {
          let area = stack.querySelector(':scope > .atc-records-area');
          if (!area) {
            area = document.createElement('div');
            area.className = 'atc-records-area';
            stack.appendChild(area);
          }
          cards.forEach(card => area.appendChild(card));
          recordsWrap.classList.add('atc-moved');
        }
      }
      // Set each record card's --atc-rec-base-x = -offsetLeft so the
      // per-card border gradient lines up with its neighbours into
      // ONE continuous flow across all 6 cards. The shared
      // --atc-rec-shift keyframe then sweeps every card in lockstep.
      const recArea = document.querySelector('.widget-stack .atc-records-area');
      if (recArea) {
        Array.from(recArea.children).forEach(card => {
          card.style.setProperty('--atc-rec-base-x', (-card.offsetLeft) + 'px');
        });
      }
      // 2. Duration trend → cloned into spending heatmap slot.
      ensureDurationInHeatmap();
      // 3. Unvisited widget: reparent strip + split into white/pink
      //    columns + force explicit grid placement on each card.
      reparentUnvisitedStrip();
      applyUnvisitedLayout();
    };
    run();
    setTimeout(run, 400);
    setTimeout(run, 1200);
    setTimeout(run, 2500);
  }

  /* ============================================================
     Travel-quotes widget — sits in the bottom row of widget-stack
     (grid-area: quotes, spans both columns) below records + MFA.
     Cycles through multilingual travel quotes with a typewriter
     reveal, a 4s hold, then backspaces to the next quote.
     A blinking cursor sits at the typing position.
     ============================================================ */
  const ATC_QUOTES = [
    { text: 'The world is a book, and those who do not travel read only one page.', author: '— Saint Augustine',        authorEn: '',                       translation: '' },
    { text: 'Le monde est un livre dont chaque pas nous ouvre une page.',           author: '— Alphonse de Lamartine',  authorEn: '',                       translation: 'The world is a book in which every step opens a new page.' },
    { text: 'Reisen ist die Sehnsucht nach dem Leben.',                              author: '— Kurt Tucholsky',         authorEn: '',                       translation: 'Travelling is the yearning for life.' },
    { text: 'Un viaje de mil millas comienza con un solo paso.',                     author: '— Lao Tzu',                authorEn: '',                       translation: 'A journey of a thousand miles begins with a single step.' },
    { text: 'Chi non viaggia non conosce il valore degli uomini.',                   author: '— Proverbio italiano',     authorEn: '(Italian proverb)',      translation: 'He who does not travel does not know the worth of men.' },
    { text: '读万卷书，行万里路。',                                                    author: '— 古諺',                   authorEn: '(Chinese ancient saying)',  translation: 'Read ten thousand books, walk ten thousand miles.' },
    { text: '可愛い子には旅をさせよ。',                                                  author: '— 日本の諺',                authorEn: '(Japanese proverb)',        translation: 'Send your beloved child out on a journey.' },
    { text: 'سَافِرْ تَجِدْ عِوَضًا عَمَّنْ تُفَارِقُهُ',                                                  author: '— الإمام الشافعي',          authorEn: '(Imam al-Shafi’i)',    translation: 'Travel — you will find a replacement for those you leave behind.' },
    { text: 'Путешествие меняет тебя — и ты не возвращаешься прежним.',              author: '— народная мудрость',      authorEn: '(Russian folk wisdom)',     translation: 'Travel changes you — and you never return the same.' },
    { text: 'Viajar é descobrir que todos estão errados sobre os outros países.',    author: '— Aldous Huxley',          authorEn: '',                          translation: 'To travel is to discover that everyone is wrong about other countries.' },
    { text: 'Não há viagem sem regresso, há regresso sem viagem.',                   author: '— provérbio português',    authorEn: '(Portuguese proverb)',      translation: 'There is no journey without return; only return without a journey.' },
    { text: '여행은 인생의 책에서 가장 흥미로운 장이다.',                                   author: '— 한국 속담',                authorEn: '(Korean proverb)',          translation: 'Travel is the most interesting chapter in the book of life.' }
  ];

  function wireQuoteWidget() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    // Quote sits ON TOP of the Travel Statistics column —
    // inserted as the first child of .stats-citylist-group,
    // above the title and the stats/city-list row.
    const tries = setInterval(() => {
      const row = document.querySelector('body > .stats-citylist-group > .stats-citylist-row');
      const cityList = row && row.querySelector(':scope > .city-list-container');
      const statsSection = row && row.querySelector(':scope > .stats-section');
      // Title may still be a child of the group (default) or have
      // been pushed into stats-section by an earlier attempt.
      let groupTitle = document.querySelector('body > .stats-citylist-group > .stats-citylist-title');
      if (!groupTitle) {
        groupTitle = document.querySelector('body > .stats-citylist-group .stats-section > .stats-citylist-title');
      }
      if (!row || !cityList || !statsSection) return;

      // Title sits ABOVE the stats-section, OUTSIDE the stats box.
      if (groupTitle && groupTitle.parentElement !== row) {
        row.appendChild(groupTitle);
      }

      // Quote sits ABOVE the city-list, OUTSIDE the city-list box.
      let card = row.querySelector(':scope > .atc-quote-widget');
      if (!card) {
        card = document.createElement('div');
        card.className = 'atc-quote-widget';
        card.innerHTML =
          '<div class="atc-quote-text"></div>' +
          '<div class="atc-quote-translation"></div>' +
          '<div class="atc-quote-author"></div>';
        row.appendChild(card);
        attachQuoteAnimation(card);
      }

      clearInterval(tries);
    }, 250);
    setTimeout(() => clearInterval(tries), 8000);
  }

  function attachQuoteAnimation(card) {

    const textEl = card.querySelector('.atc-quote-text');
    const transEl = card.querySelector('.atc-quote-translation');
    const authorEl = card.querySelector('.atc-quote-author');
    if (!textEl || !transEl || !authorEl) return;

    // Build the typed area: text span + blinking cursor sibling
    const textSpan = document.createElement('span');
    const cursor = document.createElement('span');
    cursor.className = 'atc-quote-cursor';
    textEl.appendChild(textSpan);
    textEl.appendChild(cursor);

    let idx = Math.floor(Math.random() * ATC_QUOTES.length);
    let charIdx = 0;
    let transIdx = 0;
    let phase = 'typing';
    const TYPE_MS = 45;
    const BACK_MS = 22;
    const HOLD_AFTER_TYPE = 3800;
    const HOLD_AFTER_BACK = 350;

    function step() {
      const q = ATC_QUOTES[idx];
      const chars = Array.from(q.text);
      const transChars = Array.from(q.translation || '');
      if (phase === 'typing') {
        const moreText = charIdx < chars.length;
        const moreTrans = transIdx < transChars.length;
        if (moreText || moreTrans) {
          if (moreText) charIdx++;
          if (moreTrans) transIdx++;
          textSpan.textContent = chars.slice(0, charIdx).join('');
          transEl.textContent = transChars.slice(0, transIdx).join('');
          if (charIdx === 1) {
            authorEl.innerHTML = q.author +
              (q.authorEn ? ` <span class="atc-quote-author-en">${q.authorEn}</span>` : '');
          }
          setTimeout(step, TYPE_MS);
        } else {
          phase = 'hold';
          setTimeout(step, HOLD_AFTER_TYPE);
        }
      } else if (phase === 'hold') {
        phase = 'backspacing';
        step();
      } else if (phase === 'backspacing') {
        const moreText = charIdx > 0;
        const moreTrans = transIdx > 0;
        if (moreText || moreTrans) {
          if (moreText) charIdx--;
          if (moreTrans) transIdx--;
          textSpan.textContent = chars.slice(0, charIdx).join('');
          transEl.textContent = transChars.slice(0, transIdx).join('');
          if (charIdx === 0 && transIdx === 0) authorEl.textContent = '';
          setTimeout(step, BACK_MS);
        } else {
          phase = 'next';
          setTimeout(step, HOLD_AFTER_BACK);
        }
      } else if (phase === 'next') {
        idx = (idx + 1) % ATC_QUOTES.length;
        charIdx = 0;
        transIdx = 0;
        phase = 'typing';
        step();
      }
    }
    step();
  }

  /* ============================================================
     Parallax on the horizontal scroll lane
     Each major body-level section translates horizontally at a
     different fraction of the scroll delta during active scroll.
     When the user stops, all offsets ease back to 0 — widgets
     land in their proper grid positions.
     ============================================================ */
  function wireParallaxScroll() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;

    // Selector → parallax FACTOR (-1..1). 0 = no parallax (matches
    // scroll exactly). Negative = drifts opposite to scroll
    // direction. Positive = drifts with scroll but faster.
    // Every major widget gets its own parallax factor so the
    // whole side-scroll has depth — sections AND the individual
    // dashboard widget cards inside .widgets-section.
    const targets = [
      { sel: 'body > .title-section',                                    f:  0.18 },
      { sel: 'body > .card-column',                                      f: -0.10 },
      { sel: 'body > .stats-citylist-group',                             f:  0.12 },
      { sel: '.widgets-inner > .widget-card:has(#journeyTimeline)',      f: -0.06 },
      { sel: '.widgets-inner > .widget-stack',                           f:  0.08 },
      { sel: '.widgets-inner > .widget-card:has(#spendingHeatmap)',      f: -0.10 },
      { sel: '.widgets-inner > .widget-card:has(#costChoropleth)',       f:  0.14 },
      { sel: '.widgets-inner > .widget-card:has(#unvisitedNeighbors)',   f: -0.16 }
    ];

    const items = [];
    targets.forEach(t => {
      document.querySelectorAll(t.sel).forEach(el => {
        items.push({ el, factor: t.f, offset: 0 });
      });
    });
    if (!items.length) return;

    let lastX = window.scrollX || window.pageXOffset || 0;
    let snapTimer = null;
    let rafPending = false;

    const apply = () => {
      items.forEach(it => {
        it.el.style.transform = `translateX(${it.offset.toFixed(2)}px)`;
      });
      rafPending = false;
    };

    const queueApply = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(apply);
    };

    const easeStep = () => {
      // Cubic-ish ease back to 0 — 12% closer each frame.
      let stillMoving = false;
      items.forEach(it => {
        if (Math.abs(it.offset) > 0.2) {
          it.offset *= 0.82;
          stillMoving = true;
        } else {
          it.offset = 0;
        }
      });
      queueApply();
      if (stillMoving) requestAnimationFrame(easeStep);
    };

    window.addEventListener('scroll', () => {
      const sx = window.scrollX || window.pageXOffset || 0;
      const dx = sx - lastX;
      lastX = sx;
      if (!dx) return;
      items.forEach(it => {
        // Larger factor = pushes farther in dx direction
        it.offset = Math.max(-80, Math.min(80, it.offset + dx * it.factor));
      });
      queueApply();
      if (snapTimer) clearTimeout(snapTimer);
      snapTimer = setTimeout(() => requestAnimationFrame(easeStep), 120);
    }, { passive: true });
  }

  /* ============================================================
     City-list typewriter — when a city becomes .visited (or .current)
     for the first time, type its name in quickly (~20ms/char).
     Already-typed items are flagged so the animation never repeats.
     ============================================================ */
  function wireCityListTypewriter() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    const list = document.getElementById('cityList');
    if (!list) {
      setTimeout(wireCityListTypewriter, 400);
      return;
    }
    if (list.dataset.atcTyper) return;
    list.dataset.atcTyper = '1';

    function isRevealed(el) {
      return el.classList && (el.classList.contains('visited') || el.classList.contains('current'));
    }

    function typeIn(item) {
      const nameEl = item.querySelector('.city-name');
      if (!nameEl) return;
      if (nameEl.dataset.atcTyped) return;
      if (!isRevealed(item)) return;
      nameEl.dataset.atcTyped = '1';
      const fullText = (nameEl.textContent || '').trim();
      const chars = Array.from(fullText);
      if (!chars.length) return;
      nameEl.textContent = '';
      let i = 0;
      (function tick() {
        if (i >= chars.length) return;
        i++;
        nameEl.textContent = chars.slice(0, i).join('');
        setTimeout(tick, 22);
      })();
    }

    // Type any items that are already revealed at hook-up time
    list.querySelectorAll('.city-item').forEach(typeIn);

    // Watch for new items and class flips on existing ones
    const obs = new MutationObserver((muts) => {
      muts.forEach(m => {
        if (m.type === 'childList') {
          m.addedNodes.forEach(n => {
            if (n.nodeType === 1 && n.classList && n.classList.contains('city-item')) {
              typeIn(n);
            }
          });
        } else if (m.type === 'attributes' && m.target.classList && m.target.classList.contains('city-item')) {
          typeIn(m.target);
        }
      });
    });
    obs.observe(list, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  /* ============================================================
     City-list journey-progress meter.
     A flowing-green bar below the city list whose width tracks
     "current trip / total trips" — so it fills as the animation
     advances. (Native scrollbar is hidden separately in CSS.)
     ============================================================ */
  let _cityMeterFill = null;
  let _cityMeterPctEl = null;
  let _cityMeterCountEl = null;
  function wireCityListProgressMeter() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    const setup = () => {
      const list = document.getElementById('cityList');
      const container = list && list.closest('.city-list-container');
      if (!list || !container) return false;
      const existing = container.querySelector(':scope > .atc-citylist-meter');
      if (existing) {
        _cityMeterFill  = existing.querySelector('.fill');
        _cityMeterPctEl = existing.querySelector('.label-pct');
        _cityMeterCountEl = existing.querySelector('.label-count');
        return true;
      }
      const meter = document.createElement('div');
      meter.className = 'atc-citylist-meter';
      meter.innerHTML =
        '<div class="track"><div class="fill"></div></div>' +
        '<div class="label-pct">0%</div>' +
        '<div class="label-count">0 / 0</div>';
      container.appendChild(meter);
      _cityMeterFill = meter.querySelector('.fill');
      _cityMeterPctEl = meter.querySelector('.label-pct');
      _cityMeterCountEl = meter.querySelector('.label-count');
      return true;
    };
    if (!setup()) {
      const tries = setInterval(() => { if (setup()) clearInterval(tries); }, 400);
      setTimeout(() => clearInterval(tries), 10000);
    }
  }

  function updateCityProgressMeter() {
    if (!_cityMeterFill) return;
    const fm = window.flightMap;
    if (!fm || !fm.cities || !fm.cities.length) return;
    const total = fm.cities.length;
    const denom = Math.max(1, total - 1);
    const idx = fm.currentCityIndex || 0;
    let legT = 0;
    if (scope && scope.routes && scope.routes[idx - 1] && typeof scope.routes[idx - 1].t === 'number') {
      legT = Math.max(0, Math.min(1, scope.routes[idx - 1].t));
    }
    const completed = Math.max(0, idx - 1) + legT;
    const pct = Math.max(0, Math.min(100, (completed / denom) * 100));
    _cityMeterFill.style.setProperty('height', pct.toFixed(2) + '%', 'important');
    if (_cityMeterPctEl)   _cityMeterPctEl.textContent = pct.toFixed(0) + '%';
    if (_cityMeterCountEl) _cityMeterCountEl.textContent = idx + '/' + total;
  }

  /* Move the Export button to the end of the horizontal scroll
     lane — AFTER the unvisited widget — so it sits at the
     extreme right of the body's scroll content. */
  function moveExportButtonToEnd() {
    if (!window.matchMedia('(min-width: 769px)').matches) return;
    const btn = document.getElementById('exportButton');
    if (!btn) return;
    if (btn.parentElement === document.body) return;
    // Insert just before body::after spacer (which is the
    // right-gutter pseudo and cannot host real children, so
    // appendChild puts the button right before it naturally).
    document.body.appendChild(btn);
  }

  /* ============================================================
     bootstrap
     ============================================================ */
  async function init() {
    buildScopeDOM();

    const cv = document.getElementById('atcScopeCanvas');
    if (!cv) return;

    if (!window.ATCScope) {
      console.warn('[atc-skin] atc-scope.js failed to load — orthographic globe disabled.');
      return;
    }
    scope = new window.ATCScope(cv);
    window._atcScope = scope;
    try { await scope.loadCoast('data/coastlines.geojson'); } catch (e) { console.warn('[atc-skin] coastlines failed:', e); }
    scope.refreshTheme();

    prepareTopTicker();
    wireInteractions();
    wireHorizontalWheel();
    wireScrollMeter();
    wireWidgetMapResize();
    wireWidgetRelocations();
    wireQuoteWidget();
    // Parallax scroll effect disabled (per user request).
    // wireParallaxScroll();
    wireCityListTypewriter();
    wireCityListProgressMeter();
    moveExportButtonToEnd();
    startRenderLoop();

    // make sure the scope sizes correctly once flightMap has initialised
    // and bring oyster's leaflet controls back above the canvas, plus
    // detach the city list to its right-column home.
    detachCityList();
    hookCityListHover();
    groupStatsAndCityList();
    setTimeout(() => { scope._resize(); reattachLeafletControls(); detachCityList(); hookCityListHover(); groupStatsAndCityList(); prepareTopTicker(); }, 400);
    setTimeout(() => { scope._resize(); reattachLeafletControls(); detachCityList(); hookCityListHover(); groupStatsAndCityList(); prepareTopTicker(); }, 1200);
    setTimeout(reattachLeafletControls, 2500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
