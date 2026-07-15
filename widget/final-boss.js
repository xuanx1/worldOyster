// Final Boss Level — Journey to Live III
//
// Adds the Trans-Siberian railway (red flow) and the Asia–Europe
// continental divider (dashed) to the ATC scope canvas. Provides
// canvas-based hover popups for the 17 station stops (descriptions
// come from data/trans-siberian.geojson) and a "FINAL BOSS" map
// control button that isolates the view to this trip alone.
(function () {
  'use strict';

  // Asia–Europe conventional divider ([lat, lng] pairs, Kara Sea → Aegean).
  // High-resolution waypoint set following: Ural Mountains crest → Ural River
  // → north Caspian → Kuma–Manych / Caucasus main crest → Black Sea → Bosphorus
  // → Sea of Marmara → Dardanelles → Aegean.
  const DIVIDER = [
    // Kara Sea coast at Baydaratskaya Bay
    [69.60, 66.90],
    [69.10, 66.80],
    [68.50, 66.50],
    [68.00, 66.30],
    // Polar Urals
    [67.30, 66.10],
    [66.70, 65.70],
    [66.00, 64.90],
    [65.30, 63.90],
    [64.70, 62.80],
    [64.10, 61.80],
    // Northern Urals
    [63.40, 60.80],
    [62.70, 60.20],
    [62.00, 59.80],
    [61.30, 59.60],
    [60.60, 59.50],
    // Middle Urals
    [59.90, 59.40],
    [59.20, 59.30],
    [58.50, 59.30],
    [57.80, 59.20],
    [57.10, 58.90],
    [56.40, 58.70],
    // Central Urals (Yekaterinburg latitude — Trans-Sib crossing)
    [55.70, 58.60],
    [55.00, 58.60],
    [54.30, 58.50],
    // Southern Urals
    [53.60, 58.30],
    [53.00, 58.10],
    [52.40, 57.70],
    [51.90, 57.20],
    [51.50, 56.30],
    [51.20, 55.00],   // Ural River head near Orenburg / Uralsk
    // Ural River winding through Kazakhstan to Atyrau
    [50.70, 54.30],
    [50.20, 53.30],
    [49.60, 52.40],
    [48.80, 51.90],
    [48.00, 51.70],
    [47.30, 51.65],
    [47.00, 51.70],   // Ural mouth at Caspian (Atyrau)
    // North Caspian arc westwards
    [46.60, 50.20],
    [46.30, 48.80],
    [46.10, 47.50],
    [45.90, 46.40],
    // Kuma–Manych depression toward Sea of Azov
    [45.70, 45.20],
    [45.60, 44.10],
    // Caucasus main crest (Elbrus → Kazbek → western descent to Black Sea)
    [44.10, 43.80],
    [43.90, 42.80],   // Elbrus
    [43.60, 42.00],
    [43.40, 41.20],
    [43.35, 40.60],
    // Black Sea coast at Sochi / cross Black Sea to Bosphorus
    [43.30, 40.00],
    [42.90, 38.50],
    [42.40, 36.50],
    [41.90, 34.20],
    [41.50, 32.00],
    [41.20, 30.20],
    [41.05, 29.20],
    [41.00, 29.00],   // Bosphorus (Istanbul)
    // Sea of Marmara
    [40.80, 28.60],
    [40.60, 27.70],
    [40.45, 27.00],
    // Dardanelles
    [40.30, 26.55],
    [40.15, 26.40],
    // Aegean
    [39.80, 26.10],
    [39.20, 26.00],
    [38.50, 25.95],
    [37.80, 25.90]
  ];

  const STATE = {
    scope: null,
    line: null,             // [[lat, lng], ...]
    stops: [],              // [{ lat, lng, name, description }]
    greatWallLines: null,   // Array of segments [[lat, lng], ...]
    greatWallPasses: [],    // [{ lat, lng, name }]
    dividerKm: 0,           // total great-circle length of the divider
    greatWallKm: 0,         // total great-circle length of the wall
    tooltipEl: null,
    active: false,
    button: null,
    savedHeaderText: null,
    savedCentre: null,
    savedZoom: null,
    // Saved fields of the underlying AnimatedFlightMap so we can restore
    // the normal viz when the user exits Final Boss Level.
    saved: null
  };

  const R_KM = 6371.0088;
  function haversine(a, b) {
    const [la1, lo1] = a, [la2, lo2] = b;
    const p1 = la1 * Math.PI / 180, p2 = la2 * Math.PI / 180;
    const dp = (la2 - la1) * Math.PI / 180, dl = (lo2 - lo1) * Math.PI / 180;
    const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
    return 2 * R_KM * Math.asin(Math.sqrt(x));
  }
  function totalLengthKm(segments) {
    let sum = 0;
    for (const seg of segments) {
      for (let i = 0; i < seg.length - 1; i++) sum += haversine(seg[i], seg[i + 1]);
    }
    return sum;
  }
  function fmtInt(n) { return Math.round(n).toLocaleString('en-US'); }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  async function loadGeoJSON() {
    const r = await fetch('data/trans-siberian.geojson', { cache: 'no-store' });
    if (!r.ok) throw new Error('fetch failed: ' + r.status);
    return await r.json();
  }

  function parseGeoJSON(geo) {
    const line = [];
    const stops = [];
    geo.features.forEach(f => {
      if (f.geometry.type === 'LineString') {
        // GeoJSON is [lon, lat]; scope wants [lat, lng]
        f.geometry.coordinates.forEach(c => line.push([c[1], c[0]]));
      } else if (f.geometry.type === 'Point') {
        const [lon, lat] = f.geometry.coordinates;
        stops.push({
          lat, lng: lon,
          name: (f.properties && f.properties.name) || '',
          description: (f.properties && f.properties.description) || ''
        });
      }
    });
    return { line, stops };
  }

  // Build a fast lookup from station lat/lng to its exact index on the
  // Trans-Sib polyline. Since the station points in trans-siberian.geojson
  // were snapped to line vertices when the file was generated, the match is
  // exact for the values we synthesise into fm.cities from the same source.
  function buildStationIdxMap() {
    const map = new Map();
    if (!STATE.line || !STATE.stops.length) return map;
    const key = (lat, lng) => lat.toFixed(4) + ',' + lng.toFixed(4);
    // Build inverse index of the line first for O(N) lookup.
    const lineByKey = new Map();
    for (let i = 0; i < STATE.line.length; i++) {
      lineByKey.set(key(STATE.line[i][0], STATE.line[i][1]), i);
    }
    for (const s of STATE.stops) {
      let idx = lineByKey.get(key(s.lat, s.lng));
      if (idx == null) {
        // Fallback: nearest vertex by squared distance.
        let bestD = Infinity;
        for (let i = 0; i < STATE.line.length; i++) {
          const dx = STATE.line[i][0] - s.lat, dy = STATE.line[i][1] - s.lng;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; idx = i; }
        }
      }
      map.set(key(s.lat, s.lng), idx);
    }
    return map;
  }

  function injectStyles() {
    if (document.getElementById('fbl-styles')) return;
    const s = document.createElement('style');
    s.id = 'fbl-styles';
    s.textContent = `
      /* Base tooltip — visually mirrors the site's route-popup style. */
      .fbl-tooltip {
        position: absolute;
        z-index: 9999;
        max-width: 340px;
        min-width: 120px;
        padding: 8px 10px;
        text-align: center;
        line-height: 1.1;
        color: inherit;
        background: linear-gradient(180deg, rgba(44,44,44,0.98), rgba(32,32,32,0.98));
        border: 1px solid rgba(255,255,255,0.04);
        border-radius: 8px;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        pointer-events: none;
        opacity: 0;
        transition: opacity 120ms ease;
      }
      .fbl-tooltip.on { opacity: 1; }
      /* All FBL / divider tooltips share this style — mirrors .atc-scope-tip.route on the globe */
      .fbl-tooltip.variant-divider,
      .fbl-tooltip.variant-boss {
        background: rgba(7,11,16,0.94);
        border: 1px solid #f4a13c;
        padding: 7px 11px;
        font-family: 'IBM Plex Mono', ui-monospace, 'Courier New', monospace;
        font-size: 10.5px;
        letter-spacing: 0.06em;
        color: #c4d4df;
        box-shadow: 0 0 0 1px rgba(244,161,60,0.18), 0 8px 24px rgba(0,0,0,0.6);
        min-width: 120px;
        max-width: 360px;
        line-height: 1.25;
        text-align: left;
        border-radius: 0;
      }
      .fbl-tooltip.variant-divider .rh,
      .fbl-tooltip.variant-boss .rh {
        font-family: 'Barlow Semi Condensed', 'IBM Plex Mono', ui-monospace, monospace;
        font-size: 10.5px;
        font-weight: 700;
        letter-spacing: 0.22em;
        color: #f4a13c;
        text-transform: uppercase;
        margin-bottom: 4px;
      }
      .fbl-tooltip.variant-divider .rt-line,
      .fbl-tooltip.variant-boss .rt-line {
        font-size: 11px;
        color: #c4d4df;
        letter-spacing: 0.06em;
        white-space: normal;
      }
      .fbl-tooltip.variant-divider .rt-end,
      .fbl-tooltip.variant-boss .rt-end { font-weight: 600; }
      .fbl-tooltip.variant-divider .rt-arr,
      .fbl-tooltip.variant-boss .rt-arr { font-style: normal; color: #607583; padding: 0 4px; }
      .fbl-tooltip.variant-divider .rt-dim,
      .fbl-tooltip.variant-boss .rt-dim {
        font-size: 9.5px;
        color: #607583;
        letter-spacing: 0.18em;
        margin-top: 3px;
        font-variant-numeric: tabular-nums;
      }
      /* Hide radar sweep animation in FBL mode. */
      body.fbl-mode .atc-sweep { display: none !important; }
      /* Hide the widgets panel and its toggle button in FBL / J2L III mode. */
      body.fbl-mode .widgets-section,
      body.fbl-mode .widgets-backdrop,
      body.fbl-mode #widgetsToggle,
      body.fbl-mode .widgets-toggle { display: none !important; }
      /* ROUTES toggle button hidden in FBL — the Trans-Sib polyline IS the
         route and shouldn't be toggle-able. Hidden via a data-attribute we
         set in enterFbl / exitFbl on the actual leaflet control div. */
      [data-fbl-hide] { display: none !important; }
      /* Orange DAY badge inside the header / year overlay. */
      .fbl-day { color: #f67a0a !important; text-shadow: 0 0 10px rgba(246,122,10,0.45) !important; }
      /* FBL main-title takeover: replace the green colour-flow gradient with
         an orange one so "JOURNEY TO LIVE III" glows in the trip's palette. */
      body.fbl-mode .main-title .title-flow-layer {
        background-image: linear-gradient(
          90deg,
          #4a1c00 0%, #7a2f00 12.5%, #b04a05 25%, #e46a12 37.5%, #ffb56b 50%,
          #e46a12 62.5%, #b04a05 75%, #7a2f00 87.5%, #4a1c00 100%
        ) !important;
      }

      .leaflet-control-custom.fbl-active {
        background: linear-gradient(90deg, rgba(255,43,43,.9), rgba(180,0,0,.9)) !important;
        color: #fff !important;
        box-shadow: 0 0 12px rgba(255,43,43,.6) !important;
      }
      .leaflet-control-custom.fbl-active svg { stroke: #fff !important; }

      /* THE GREAT WALL OF CHINA — DOM label with flowing orange gradient. */
      .fbl-gw-label {
        position: absolute;
        z-index: 40;
        pointer-events: none;
        font: italic 700 8.4px "Space Grotesk", "DM Sans", sans-serif;
        letter-spacing: 0.18em;
        white-space: nowrap;
        transform-origin: center center;
        background-image: linear-gradient(
          90deg,
          #4a1c00 0%, #7a2f00 12.5%, #b04a05 25%, #e46a12 37.5%, #ffb56b 50%,
          #e46a12 62.5%, #b04a05 75%, #7a2f00 87.5%, #4a1c00 100%
        );
        background-size: 200% 100%;
        background-repeat: repeat-x;
        animation: fblGwFlow 5s linear infinite;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        color: transparent;
        filter: drop-shadow(0 0 4px rgba(246, 122, 10, 0.55));
        display: none;
      }
      .fbl-gw-label.on { display: block; }
      @keyframes fblGwFlow {
        from { background-position: 0 0; }
        to   { background-position: 200% 0; }
      }
    `;
    document.head.appendChild(s);
  }

  function createTooltip() {
    if (STATE.tooltipEl) return STATE.tooltipEl;
    const el = document.createElement('div');
    el.className = 'fbl-tooltip';
    document.body.appendChild(el);
    STATE.tooltipEl = el;
    return el;
  }

  function showTooltipHtml(html, clientX, clientY, variant) {
    const el = createTooltip();
    el.className = 'fbl-tooltip';
    if (variant === 'divider') el.classList.add('variant-divider');
    else if (variant === 'boss') el.classList.add('variant-boss');
    el.innerHTML = html;
    const pad = 14;
    // Extra J2L III offset — nudge the city-hover tooltip down and to the
    // right so it doesn't sit right under the cursor.
    const offX = 13, offY = 70;
    el.style.left = '-9999px';
    el.style.top = '-9999px';
    el.classList.add('on');
    const w = el.offsetWidth, h = el.offsetHeight;
    let x = clientX + pad + offX, y = clientY + pad + offY;
    if (x + w > window.innerWidth - 8) x = clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = clientY - h - pad;
    el.style.left = (x + window.scrollX) + 'px';
    el.style.top = (y + window.scrollY) + 'px';
  }

  function showTooltip(stop, clientX, clientY, variant) {
    const header = (variant === 'station') ? 'TRANS-SIBERIAN STATION'
                : (variant === 'pass')    ? 'GREAT WALL PASS'
                : escapeHtml(stop.name);
    const showNameLine = (variant === 'station' || variant === 'pass');
    const html =
      '<div class="rh">' + header + '</div>' +
      (showNameLine ? '<div class="rt-line"><span class="rt-end">' + escapeHtml(stop.name) + '</span></div>' : '') +
      (stop.description ? '<div class="rt-line" style="opacity:.85">' + escapeHtml(stop.description) + '</div>' : '');
    showTooltipHtml(html, clientX, clientY, 'boss');
  }

  function hideTooltip() {
    if (STATE.tooltipEl) STATE.tooltipEl.classList.remove('on');
  }

  function wireCanvasHover(canvas) {
    if (!canvas) return;
    const scope = STATE.scope;

    function dividerTipHtml() {
      return (
        '<div class="rh">CONTINENTAL DIVIDE</div>' +
        '<div class="rt-line">' +
          '<span class="rt-end">KARA SEA</span>' +
          ' <em class="rt-arr">⇢</em> ' +
          '<span class="rt-end">AEGEAN</span>' +
        '</div>' +
        '<div class="rt-line" style="opacity:.8">Urals → Ural River → Caspian → Caucasus → Bosphorus</div>' +
        '<div class="rt-dim">' + fmtInt(STATE.dividerKm) + ' KM · ASIA / EUROPE</div>'
      );
    }

    canvas.addEventListener('mousemove', (ev) => {
      const rect = canvas.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;

      // In FBL, hit-test ALL current fm.cities (so Ulaanbaatar and any other
      // non-Trans-Sib stops get a tooltip too). In non-FBL, only Trans-Sib
      // stops (which are drawn only in FBL anyway).
      let hoverCity = null;
      if (scope.fblActive) {
        const fm = window.flightMap;
        const cities = fm && fm.cities ? fm.cities : [];
        let best = null, bestD = 12 * 12;
        for (let i = 0; i < cities.length; i++) {
          const c = cities[i];
          if (!c || c.lat == null) continue;
          const pp = scope.project(c.lat, c.lng);
          if (!pp.vis) continue;
          const dx = pp.x - x, dy = pp.y - y;
          const d2 = dx * dx + dy * dy;
          if (d2 < bestD) { bestD = d2; best = c; }
        }
        hoverCity = best;
      }
      const stopIdx = (!hoverCity && scope.fblActive && scope.hitTestTransSibStop) ? scope.hitTestTransSibStop(x, y) : null;
      const onDivider = (!hoverCity && stopIdx == null && scope.hitTestDivider) ? scope.hitTestDivider(x, y, 7) : false;

      scope.hoveredStopIdx = stopIdx;
      scope.hoveredPassIdx = null;
      scope.dividerNear = onDivider;

      if (hoverCity) {
        // Look up a Trans-Sib description if the city is a Trans-Sib stop.
        const stop = STATE.stops.find(s => s.name === hoverCity.name);
        showTooltip({
          name: hoverCity.name,
          description: (stop && stop.description) || ''
        }, ev.clientX, ev.clientY, 'station');
      } else if (stopIdx != null) {
        showTooltip(STATE.stops[stopIdx], ev.clientX, ev.clientY, 'station');
      } else if (onDivider) {
        showTooltipHtml(dividerTipHtml(), ev.clientX, ev.clientY, 'divider');
      } else {
        hideTooltip();
      }
    });

    canvas.addEventListener('mouseleave', () => {
      scope.hoveredStopIdx = null;
      scope.hoveredPassIdx = null;
      scope.dividerNear = false;
      hideTooltip();
    });
  }

  // Radial-distance polyline simplifier — drops any vertex within `tolDeg`
  // of the previously-kept point (in lat/lng squared-distance). First and
  // last vertices are always kept so line endpoints stay stable.
  function simplifyRadial(pts, tolDeg) {
    if (!pts || pts.length < 3) return pts;
    const tolSq = tolDeg * tolDeg;
    const out = [pts[0]];
    let prev = pts[0];
    for (let i = 1; i < pts.length - 1; i++) {
      const p = pts[i];
      const dLat = p[0] - prev[0], dLng = p[1] - prev[1];
      if (dLat * dLat + dLng * dLng >= tolSq) { out.push(p); prev = p; }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Natural Earth 1:10m global railroads. Large file (~39 MB, ~25k lines /
  // 1.4M vertices), heavy for a per-frame projection pass — so at load we
  // filter and simplify aggressively:
  //   • continent ∈ {Europe, Asia}   — J2L III route is Eurasian; ~490k
  //                                    verts of Americas/Africa/Oceania
  //                                    would never be relevant
  //   • scalerank ≤ 9                — drop rank 10 (most local spurs)
  //   • radial-distance simplify at 0.05° (~5.5 km) — invisible at FBL zoom
  // Net effect: ~1.4M → ~120k vertices, a ~12× reduction in projection
  // work whenever the offscreen cache does have to rebuild.
  const NE_RAIL_CONTINENTS = new Set(['Europe', 'Asia']);
  const NE_RAIL_MAX_RANK = 9;
  const NE_RAIL_SIMPLIFY_TOL = 0.05;

  async function loadNeRailroads() {
    const r = await fetch('data/ne_10m_railroads.geojson', { cache: 'force-cache' });
    if (!r.ok) throw new Error('ne_10m_railroads fetch: ' + r.status);
    const gj = await r.json();
    const out = [];
    let vertsIn = 0, vertsOut = 0;
    const push = ls => {
      const pts = ls.map(c => [c[1], c[0]]);
      vertsIn += pts.length;
      const s = simplifyRadial(pts, NE_RAIL_SIMPLIFY_TOL);
      if (s.length >= 2) { out.push(s); vertsOut += s.length; }
    };
    for (const f of (gj.features || [])) {
      const props = f && f.properties;
      if (!props || !NE_RAIL_CONTINENTS.has(props.continent)) continue;
      if (typeof props.scalerank === 'number' && props.scalerank > NE_RAIL_MAX_RANK) continue;
      const g = f.geometry;
      if (!g) continue;
      if (g.type === 'LineString') push(g.coordinates);
      else if (g.type === 'MultiLineString') for (const ls of g.coordinates) push(ls);
    }
    console.log('[final-boss] ne_10m_railroads filtered+simplified',
      vertsIn, '→', vertsOut, 'vertices (' + Math.round(100 * vertsOut / vertsIn) + '% kept)');
    return out;
  }

  async function loadOtherTransLines() {
    const files = [
      { url: 'data/trans-manchurian.geojson', name: 'Trans-Manchurian' },
      { url: 'data/trans-mongolian.geojson',  name: 'Trans-Mongolian'  }
    ];
    const results = [];
    for (const f of files) {
      try {
        const r = await fetch(f.url, { cache: 'no-store' });
        if (!r.ok) throw new Error(r.status);
        const gj = await r.json();
        // Each file has one LineString feature (the route) — grab all LineStrings.
        gj.features.filter(x => x.geometry && x.geometry.type === 'LineString')
          .forEach(x => {
            results.push({
              name: f.name,
              line: x.geometry.coordinates.map(c => [c[1], c[0]]) // lng,lat -> lat,lng
            });
          });
      } catch (e) {
        console.warn('[final-boss] failed to load', f.url, e);
      }
    }
    return results;
  }

  async function loadGreatWall() {
    const [dirRes, passRes] = await Promise.all([
      fetch('data/greatwall/fulldirection.geojson', { cache: 'no-store' }),
      fetch('data/greatwall/fullpasses.geojson',    { cache: 'no-store' })
    ]);
    if (!dirRes.ok) throw new Error('greatwall lines fetch: ' + dirRes.status);
    if (!passRes.ok) throw new Error('greatwall passes fetch: ' + passRes.status);
    const dir = await dirRes.json();
    const pass = await passRes.json();
    const lines = dir.features
      .filter(f => f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString'))
      .flatMap(f => f.geometry.type === 'LineString'
        ? [f.geometry.coordinates.map(c => [c[1], c[0]])]
        : f.geometry.coordinates.map(ls => ls.map(c => [c[1], c[0]])));
    const passes = pass.features
      .filter(f => f.geometry && f.geometry.type === 'Point')
      .map(f => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        name: (f.properties && f.properties.name) || ''
      }));
    return { lines, passes };
  }

  // Parses data/fbl-journey.csv (origin,destination,mode,cost_sgd,date) into
  // journey rows in the same shape land-journey.csv is loaded into.
  async function loadFblJourneyCsv() {
    const r = await fetch('data/fbl-journey.csv', { cache: 'no-store' });
    if (!r.ok) throw new Error('fetch fbl-journey.csv: ' + r.status);
    const text = await r.text();
    const lines = text.split(/\r?\n/).filter(l => l.trim().length);
    const header = lines.shift().split(',').map(s => s.trim());
    const rows = lines.map(line => {
      const cells = line.split(',').map(s => s.trim());
      const obj = {};
      header.forEach((h, i) => obj[h] = cells[i]);
      return obj;
    });
    return rows;
  }

  // Alias table for common spelling variants users might type in fbl-journey.csv.
  const CITY_ALIASES = {
    'Ulaan Bator':  'Ulaanbaatar',
    'Ulan Bator':   'Ulaanbaatar',
    'Ulaan-Bator':  'Ulaanbaatar',
    'Ulaanbaator':  'Ulaanbaatar',
    'Ulanbator':    'Ulaanbaatar',
    'Ulan-Ude':     'Ulan Ude'
  };

  function canonicalName(name) {
    const key = String(name || '').trim();
    return CITY_ALIASES[key] || key;
  }

  // CITY_TO_COUNTRY uses studio-preferred labels ("PR China", "UK",
  // "ROC Taiwan", …) that other widgets rely on. The scope's country
  // polygons come from Natural Earth via data/coastlines.geojson and use
  // different names ("China", "United Kingdom", "Taiwan"). Translate here
  // so the visited-countries set actually matches the polygon names —
  // otherwise the arrow reaches Beijing / London and nothing lights up.
  const COUNTRY_TO_COAST = {
    'PR China':       'China',
    'ROC Taiwan':     'Taiwan',
    'UK':             'United Kingdom',
    'USA':            'United States of America',
    'ROK Korea':      'South Korea',
    'DPR Korea':      'North Korea',
    'Czech Republic': 'Czechia'
  };
  function coastCountry(name) {
    return COUNTRY_TO_COAST[name] || name;
  }

  // Case-insensitive lookup against the global city-coord table so the CSV
  // is forgiving of spelling variants (e.g. "ulaanbaatar" == "Ulaanbaatar").
  function cityCoordsCaseInsensitive(name) {
    const table = window.CITY_COORDINATES;
    if (!table) return null;
    const target = String(name || '').toLowerCase().replace(/[^a-z]/g, '');
    for (const k of Object.keys(table)) {
      if (k.toLowerCase().replace(/[^a-z]/g, '') === target) {
        return table[k];
      }
    }
    return null;
  }

  // Resolve any city name to [lat, lng]. Tries in order: Trans-Sib snapped
  // station table, Trans-Mongolian/Trans-Manchurian stops, exact-match global
  // city coord table, then case-insensitive/normalised match on the same.
  function coordsForName(name) {
    const n = canonicalName(name);
    const s = STATE.stops.find(x => x.name === n);
    if (s) return [s.lat, s.lng];
    if (Array.isArray(STATE.otherStops)) {
      const o = STATE.otherStops.find(x => x.name === n);
      if (o) return [o.lat, o.lng];
    }
    const cc = window.CITY_COORDINATES && window.CITY_COORDINATES[n];
    if (Array.isArray(cc)) return [cc[0], cc[1]];
    const ci = cityCoordsCaseInsensitive(n);
    if (Array.isArray(ci)) return [ci[0], ci[1]];
    return null;
  }

  function stopByName(name) {
    const n = canonicalName(name);
    return STATE.stops.find(s => s.name === n);
  }

  // Build the FBL city sequence + flightData rows from the CSV rows. Cities
  // are the ordered station endpoints; flightData rows mirror the CSV shape
  // used by the normal viz so all stats & widgets stay compatible.
  function buildFblFromCsv(csvRows) {
    if (!csvRows.length) throw new Error('fbl-journey.csv is empty');

    const parseDMY = s => {
      const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s || '');
      if (!m) return new Date().toISOString();
      const [_, d, mo, y] = m;
      return new Date(Date.UTC(+y, +mo - 1, +d)).toISOString();
    };


    const flightData = csvRows.map(r => {
      const costSGD = parseFloat(r.cost_sgd) || 0;
      const from = canonicalName(r.origin);
      const to = canonicalName(r.destination);
      const fromCoords = coordsForName(from);
      const toCoords = coordsForName(to);
      const distance = (fromCoords && toCoords) ? haversine(fromCoords, toCoords) : 0;
      const mode = r.mode || 'train';
      // Duration is derived by the shared route-aware calculator (Trans-Sib
      // stops → 55 km/h, cross-border legs get border overhead, HSR-country
      // corridors → HSR speed). Optional duration_hours column still wins
      // when present, so future edge cases can override without code changes.
      const csvDur = parseFloat(r.duration_hours);
      const fdm = (window.flightMap && window.flightMap.coordinateManager)
        || (typeof FlightDataManager === 'function' ? new FlightDataManager() : null);
      const duration = Number.isFinite(csvDur) && csvDur > 0
        ? csvDur
        : (fdm && distance > 0
            ? fdm.calculateLandTripDuration(distance, mode, { origin: from, destination: to })
            : 0);
      return {
        from, to,
        origin: from, destination: to,
        fromCode: from.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'STA',
        toCode:   to.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'STA',
        mode,
        type: 'land',           // all FBL legs are surface journeys
        date: parseDMY(r.date),
        // Keep both keys: cost_sgd for internal FBL callers, costSGD for the
        // animation loop which reads camelCase and populates the charts.
        cost_sgd: costSGD,
        costSGD: costSGD,
        actualCostSGD: costSGD,
        // Distance & duration so Travel Stats / Leg Efficiency reflect real
        // train timings instead of the 900 km/h flight-speed fallback.
        distance,
        originCoords: fromCoords || undefined,
        destinationCoords: toCoords || undefined,
        duration
      };
    });

    const orderedNames = [csvRows[0].origin, ...csvRows.map(r => r.destination)]
      .map(canonicalName);
    const cities = orderedNames.map((name, idx) => {
      const coords = coordsForName(name) || [0, 0];
      const legDate = idx === 0 ? csvRows[0].date : csvRows[idx - 1].date;
      const country = (window.CITY_TO_COUNTRY && window.CITY_TO_COUNTRY[name]) || '';
      if (!coords || coords[0] === 0) {
        console.warn('[final-boss] no coords for city', name, '— arrow will jump to (0,0)');
      }
      // originalFlight = the incoming leg for this city; empty for the start city.
      const originalFlight = idx > 0 ? flightData[idx - 1] : null;
      return {
        name,
        country,
        lat: coords[0],
        lng: coords[1],
        airportCode: name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'STA',
        locationCode: name,
        flightDate: parseDMY(legDate),
        flightIndex: idx,
        // Both flags checked by atc-skin's legIsLand() so the route arc,
        // blip, and tooltip render as SURFACE / train, not FLIGHT.
        journeyType: 'land',
        mode: 'train',
        originalFlight,
        isDisconnected: false,
        id: idx + 1,
        order: idx + 1,
        visited: false
      };
    });

    return { cities, flightData };
  }

  // Nearest-vertex helper: scans a polyline for the closest [lat, lng]
  // within `tolDeg` degrees. Returns -1 if nothing within tolerance.
  function nearestVertexIdx(line, latLng, tolDeg) {
    const tLat = latLng[0], tLng = latLng[1];
    const tolSq = tolDeg * tolDeg;
    let bestIdx = -1, bestD = Infinity;
    for (let i = 0; i < line.length; i++) {
      const dLat = line[i][0] - tLat, dLng = line[i][1] - tLng;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    return bestD <= tolSq ? bestIdx : -1;
  }

  // Returns { polyIdx, iA, iB } for a from/to pair, or null if no polyline matches.
  function polylineHitFor(from, to) {
    const polys = [];
    if (STATE.line) polys.push({ polyIdx: 0, line: STATE.line });
    if (Array.isArray(STATE.otherPolylines)) {
      STATE.otherPolylines.forEach((p, i) => polys.push({ polyIdx: 1 + i, line: p.line }));
    }
    const TOL = 0.25;
    for (const p of polys) {
      const iA = nearestVertexIdx(p.line, from, TOL);
      const iB = nearestVertexIdx(p.line, to, TOL);
      if (iA >= 0 && iB >= 0 && iA !== iB) return { polyIdx: p.polyIdx, iA, iB };
    }
    return null;
  }

  // Pre-compute the polyline path for every leg in the FBL city sequence.
  // Called ONCE at swap time; result stored on STATE.legPaths so progress
  // derives from fm.currentCityIndex rather than side-effects inside
  // createGreatCirclePath (which is also called by route-interactivity
  // hit-tests and would otherwise mark all legs "completed" at init).
  function precomputeLegPaths(cities) {
    const paths = [];
    for (let i = 0; i < cities.length - 1; i++) {
      const a = cities[i], b = cities[i + 1];
      paths.push(polylineHitFor([a.lat, a.lng], [b.lat, b.lng]));
    }
    return paths;
  }

  // Replace fm.createGreatCirclePath so animation paths follow the actual
  // trans-continental rail geometry. Side-effect free — no state written
  // per-call, so this is safe to invoke from route-interactivity hit-tests.
  function installPolylineFollow(fm) {
    if (!fm || fm._fblOrigCreateGCPath) return;
    fm._fblOrigCreateGCPath = fm.createGreatCirclePath;
    fm.createGreatCirclePath = function (from, to) {
      const hit = polylineHitFor(from, to);
      if (hit) {
        const line = (hit.polyIdx === 0) ? STATE.line : STATE.otherPolylines[hit.polyIdx - 1].line;
        const slice = (hit.iA < hit.iB)
          ? line.slice(hit.iA, hit.iB + 1)
          : line.slice(hit.iB, hit.iA + 1).slice().reverse();
        return slice.map(pt => [pt[0], pt[1]]);
      }
      return fm._fblOrigCreateGCPath.call(fm, from, to);
    };
  }

  function uninstallPolylineFollow(fm) {
    if (!fm || !fm._fblOrigCreateGCPath) return;
    fm.createGreatCirclePath = fm._fblOrigCreateGCPath;
    fm._fblOrigCreateGCPath = null;
    STATE.legPaths = null;
    if (STATE.scope) { STATE.scope.fblProgress = null; STATE.scope.arrowLineIdx = null; }
  }

  // Monkey-patch updateCurrentTripYear so it stops overwriting #yearOverlay
  // with the year string while FBL is active. Our tick loop writes country
  // + day instead.
  function installOverlayOverride(fm) {
    if (!fm || fm._fblOrigUpdateYear) return;
    fm._fblOrigUpdateYear = fm.updateCurrentTripYear;
    // Update fm._currentYear (so the playbar status still shows the right
    // year — 2027 for the FBL journey) but skip all DOM writes and the
    // typewriter effect that would clobber our country/day label.
    fm.updateCurrentTripYear = function (cityIndex) {
      const c = this.cities && this.cities[cityIndex];
      if (c && c.flightDate) {
        const y = new Date(c.flightDate).getFullYear();
        if (!isNaN(y)) this._currentYear = y;
      }
    };
    if (typeof fm._typewriteYear === 'function') {
      fm._fblOrigTypewriteYear = fm._typewriteYear;
      fm._typewriteYear = function () { /* suppressed in FBL */ };
    }
  }
  // Grapheme-safe emoji wrap (keeps 🦪 as a coloured glyph inside a span).
  function wrapEmoji(s) {
    return s.replace(/\p{Extended_Pictographic}/gu, m => `<span class="title-emoji">${m}</span>`);
  }

  // Extract the current visible text from .title-text so we know what to
  // backspace. Preserves <br> as \n in the array.
  function readTitleChars(textEl) {
    if (!textEl) return [];
    // Replace <br> with \n first, then strip other tags to get plain text.
    const html = textEl.innerHTML.replace(/<br\s*\/?>(\s*)/gi, '\n');
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return Array.from(tmp.textContent || '');
  }

  // Backspace the current text, then type the new one, then reveal the flow.
  // Reusable so both enter and exit share the same animation.
  function typewriteSwap(newLines, onDone) {
    const el = document.querySelector('.main-title');
    if (!el) { if (onDone) onDone(); return; }

    if (STATE.mainTitleTypeTimer) {
      clearTimeout(STATE.mainTitleTypeTimer);
      STATE.mainTitleTypeTimer = null;
    }

    // Reset flow reveal — gradient goes back to "off" for the typing phase.
    el.classList.remove('flowing');

    // Ensure the two-child structure (.title-text + .title-cursor). If
    // .title-flow-layer is present from a previous reveal, drop it.
    let textEl = el.querySelector('.title-text');
    let cursorEl = el.querySelector('.title-cursor');
    const oldFlow = el.querySelector('.title-flow-layer');
    if (oldFlow) oldFlow.remove();
    if (!textEl) {
      el.innerHTML = '<span class="title-text"></span><span class="title-cursor"></span>';
      textEl = el.querySelector('.title-text');
      cursorEl = el.querySelector('.title-cursor');
    } else if (!cursorEl) {
      cursorEl = document.createElement('span');
      cursorEl.className = 'title-cursor';
      el.appendChild(cursorEl);
    }
    if (cursorEl) cursorEl.classList.remove('fade-out');

    const currentChars = readTitleChars(textEl);
    const nextFull = newLines.join('\n');
    const nextChars = Array.from(nextFull);

    const setText = (chars) => {
      textEl.innerHTML = wrapEmoji(chars.join('')).replace(/\n/g, '<br>');
    };

    // Phase 1: backspace to empty.
    const backspaceStep = 40;   // ms per char removed
    const typeStep = 70;        // ms per char added
    const holdBeforeFlow = 900; // ms after typing done before gradient reveal

    let phase = currentChars.length > 0 ? 'backspace' : 'type';
    let workingChars = currentChars.slice();
    let typeIdx = 0;

    const scheduleFlow = () => {
      setTimeout(() => {
        if (cursorEl) cursorEl.classList.add('fade-out');
        const flow = document.createElement('span');
        flow.className = 'title-flow-layer';
        flow.setAttribute('aria-hidden', 'true');
        flow.innerHTML = textEl.innerHTML;
        el.appendChild(flow);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          el.classList.add('flowing');
        }));
        if (onDone) onDone();
      }, holdBeforeFlow);
    };

    const tick = () => {
      if (phase === 'backspace') {
        if (workingChars.length === 0) {
          phase = 'type';
        } else {
          workingChars.pop();
          setText(workingChars);
          STATE.mainTitleTypeTimer = setTimeout(tick, backspaceStep);
          return;
        }
      }
      // phase === 'type'
      if (typeIdx >= nextChars.length) {
        STATE.mainTitleTypeTimer = null;
        scheduleFlow();
        return;
      }
      typeIdx++;
      setText(nextChars.slice(0, typeIdx));
      STATE.mainTitleTypeTimer = setTimeout(tick, typeStep);
    };
    tick();
  }

  function swapMainTitleForFbl() {
    const el = document.querySelector('.main-title');
    if (!el) return;
    if (STATE.savedMainTitle == null) {
      STATE.savedMainTitle = {
        html: el.innerHTML,
        flowing: el.classList.contains('flowing'),
        lines: ['IS THE WORLD', 'YOUR \u{1F9AA}?']
      };
    }
    typewriteSwap(['JOURNEY TO', 'LIVE III']);
  }
  function restoreMainTitle() {
    const el = document.querySelector('.main-title');
    if (!el || !STATE.savedMainTitle) return;
    const lines = STATE.savedMainTitle.lines || ['IS THE WORLD', 'YOUR \u{1F9AA}?'];
    typewriteSwap(lines, () => { STATE.savedMainTitle = null; });
  }

  function uninstallOverlayOverride(fm) {
    if (!fm) return;
    if (fm._fblOrigUpdateYear) {
      fm.updateCurrentTripYear = fm._fblOrigUpdateYear;
      fm._fblOrigUpdateYear = null;
    }
    if (fm._fblOrigTypewriteYear) {
      fm._typewriteYear = fm._fblOrigTypewriteYear;
      fm._fblOrigTypewriteYear = null;
    }
  }

  async function swapInFblData(fm) {
    STATE.saved = {
      cities: fm.cities,
      flightData: fm.flightData,
      cityMarkers: fm.cityMarkers,
      flightSequence: fm.flightSequence,
      currentCityIndex: fm.currentCityIndex
    };
    try {
      (fm.cityMarkers || []).forEach(m => {
        if (m && m.marker && fm.map && fm.map.hasLayer(m.marker)) fm.map.removeLayer(m.marker);
      });
    } catch (e) {}

    let built;
    try {
      const csvRows = STATE.fblJourneyRows || await loadFblJourneyCsv();
      STATE.fblJourneyRows = csvRows;
      built = buildFblFromCsv(csvRows);
    } catch (e) {
      console.warn('[final-boss] falling back to synthesized FBL data', e);
      built = buildFblFromCsv(STATE.stops.slice(0, -1).map((s, i) => ({
        origin: s.name, destination: STATE.stops[i + 1].name,
        mode: 'train', cost_sgd: '0',
        date: '15/1/2027'
      })));
    }

    fm.cities = built.cities;
    fm.flightData = built.flightData;
    fm.flightSequence = built.flightData.slice();
    fm.cityMarkers = [];
    // Resume from the previous FBL position if we've entered before; otherwise start at 0.
    const savedFblIdx = (STATE.savedFbl && Number.isFinite(STATE.savedFbl.currentCityIndex))
      ? Math.max(0, Math.min(STATE.savedFbl.currentCityIndex, built.cities.length))
      : 0;
    fm.currentCityIndex = savedFblIdx;

    // Pre-compute per-leg polyline paths so progress tracking is derived
    // from the animation state, not from createGreatCirclePath side-effects
    // (route-interactivity hit-tests also call it and would corrupt state).
    STATE.legPaths = precomputeLegPaths(built.cities);

    // Initial visited set: only the starting city's country. The country
    // list expands progressively in the tick loop as the arrow reaches each
    // new city — so Mongolia only unblacks when the arrow arrives at
    // Ulaanbaatar, etc.
    try {
      const start = built.cities[0];
      const initial = new Set();
      if (start && start.country) initial.add(coastCountry(start.country));
      STATE.scope.setVisitedCountries(initial);
    } catch (e) {}
    try { built.cities.forEach(c => fm.createCityMarker && fm.createCityMarker(c)); } catch (e) { console.warn('[final-boss] createCityMarker', e); }
    try { fm.positionDotAtCity && fm.positionDotAtCity(Math.min(savedFblIdx, built.cities.length - 1)); } catch (e) {}
    try { fm.updateCityList && fm.updateCityList(); } catch (e) {}
    // Zero out the running totals and both charts so Travel Stats / Leg
    // Efficiency / Adjusted Cost start from the J2L III trip, not the
    // oyster trip they were accumulating.
    try { fm.recalculateStatistics && fm.recalculateStatistics(); } catch (e) {}
    try { fm.updateStatistics && fm.updateStatistics(); } catch (e) {}
    try { fm._createRouteInteractivity && fm._createRouteInteractivity(); } catch (e) {}
    // Restore whatever play/pause state the FBL animation was in the last
    // time we exited (or auto-play on the very first entry).
    const shouldPlay = STATE.savedFbl ? !!STATE.savedFbl.isAnimating : true;
    try {
      if (fm._animationGen != null) fm._animationGen++;
      if (shouldPlay) {
        fm.startAnimation && fm.startAnimation();
      } else {
        fm.isAnimating = false;
        fm.updatePlayPauseButton && fm.updatePlayPauseButton();
      }
    } catch (e) { console.warn('[final-boss] startAnimation', e); }
  }

  function restoreNormalData(fm) {
    if (!STATE.saved) return;
    try {
      (fm.cityMarkers || []).forEach(m => {
        if (m && m.marker && fm.map && fm.map.hasLayer(m.marker)) fm.map.removeLayer(m.marker);
      });
    } catch (e) {}
    fm.cities = STATE.saved.cities || [];
    fm.flightData = STATE.saved.flightData || [];
    fm.flightSequence = STATE.saved.flightSequence || [];
    fm.cityMarkers = [];
    fm.currentCityIndex = STATE.saved.currentCityIndex || 0;
    try { fm.cities.forEach(c => fm.createCityMarker && fm.createCityMarker(c)); } catch (e) {}
    try { fm.positionDotAtCity && fm.positionDotAtCity(fm.currentCityIndex); } catch (e) {}
    try { fm.updateCityList && fm.updateCityList(); } catch (e) {}
    // Rebuild totals and charts from the restored oyster trip data so we
    // don't keep the FBL numbers we were showing.
    try { fm.recalculateStatistics && fm.recalculateStatistics(); } catch (e) {}
    try { fm.updateStatistics && fm.updateStatistics(); } catch (e) {}
    try { fm._createRouteInteractivity && fm._createRouteInteractivity(); } catch (e) {}
    STATE.saved = null;
  }

  function enterFbl() {
    if (STATE.active) return;
    const scope = STATE.scope;
    if (!scope) return;

    STATE.savedCentre = { lat: scope.lat0, lng: scope.lon0 };
    STATE.savedZoom = scope.zoom;
    scope.setFblActive(true);
    // Frame the full Singapore → Inverness J2L III route: centre roughly on
    // Central Asia (~Astana latitude) and pull the zoom out so both endpoints
    // fit in view. Snap (not ease) — the ne_10m railroad offscreen cache is
    // keyed on view state, and a 1-second ease would force ~60 rebuilds of
    // the ~120k-vertex projection before settling.
    scope.setCenter(38, 65, true);
    scope.setZoom(1.9);

    const fm = window.flightMap;
    STATE.wasAnimating = false;
    try {
      if (fm && fm.isAnimating && typeof fm.pauseAnimation === 'function') {
        STATE.wasAnimating = true;
        fm.pauseAnimation();
      }
    } catch (e) {}

    // Route interpolation follows the actual Trans-Sib polyline while FBL
    // is active; install BEFORE swapping so the first leg draws correctly.
    if (fm) {
      installPolylineFollow(fm);
      installOverlayOverride(fm);
    }

    // Hide the ROUTES toggle button (it makes no sense in FBL — the Trans-
    // Sib polyline IS the route).
    if (fm && fm.toggleLinesButton) fm.toggleLinesButton.setAttribute('data-fbl-hide', '1');


    // Swap the entire data model — cities, flightData, markers — so stats,
    // widgets, blip and route arcs all reflect Journey to Live III. Fires
    // async; toggle button state right away and let the swap complete.
    if (fm) { swapInFblData(fm).catch(err => console.warn('[final-boss] swap failed', err)); }

    document.body.classList.add('fbl-mode');

    // Header H1 (the big yellowy year display) becomes the LIVE country + day
    // read-out. The slogan (below it) is emptied so it's just the header.
    const h = document.querySelector('.card-container .header h1');
    const slogan = document.querySelector('.card-container .header .header-slogan');
    if (h) {
      STATE.savedHeaderText = h.textContent;
      // Placeholder header — the real country/day text is written by the tick
      // loop as soon as the FBL city data has loaded (see updateYearOverlay).
      h.innerHTML = '<span class="fbl-day">DAY 1</span>';
    }
    if (slogan) {
      STATE.savedSloganText = slogan.textContent;
      slogan.textContent = '';
    }

    // Swap the site's main title "IS THE WORLD YOUR 🦪?" for the FBL label
    // in the same animated colour-flow style, but in orange.
    swapMainTitleForFbl();

    if (STATE.button) {
      STATE.button.classList.add('fbl-active');
      STATE.button.title = 'Exit — return to Oyster';
      const lb = STATE.button.querySelector('.atc-lb');
      if (lb) lb.textContent = 'OYSTER';
    }

    // Paint the year overlay immediately so the user sees the FBL label
    // without waiting for the next animation frame.
    try {
      const overlay = document.getElementById('yearOverlay');
      if (overlay) {
        if (STATE.overlayBackup == null) STATE.overlayBackup = overlay.textContent;
        const fmC = window.flightMap && window.flightMap.cities;
        if (fmC && fmC.length) {
          const first = fmC[0];
          const totalDays = Math.max(1, fmC.length - 1);
          const country = (first && first.country) || '';
          const dayHtml = `<span class="fbl-day">DAY 1/${totalDays}</span>`;
          overlay.innerHTML = country ? `${country.toUpperCase()} · ${dayHtml}` : dayHtml;
        }
        overlay.style.setProperty('display', 'block', 'important');
      }
    } catch (e) {}

    STATE.active = true;
  }

  function exitFbl() {
    if (!STATE.active) return;
    const scope = STATE.scope;
    scope.setFblActive(false);

    if (STATE.savedCentre) scope.setCenter(STATE.savedCentre.lat, STATE.savedCentre.lng, false);
    if (STATE.savedZoom != null) scope.setZoom(STATE.savedZoom);

    const fm = window.flightMap;
    if (fm) {
      // Capture FBL play state + position so re-entering resumes here instead
      // of restarting at day 1.
      STATE.savedFbl = {
        currentCityIndex: fm.currentCityIndex,
        isAnimating: !!fm.isAnimating
      };
      try { if (fm.isAnimating && typeof fm.pauseAnimation === 'function') fm.pauseAnimation(); } catch (e) {}
      restoreNormalData(fm);
      uninstallPolylineFollow(fm);
      uninstallOverlayOverride(fm);
      if (fm.toggleLinesButton) fm.toggleLinesButton.removeAttribute('data-fbl-hide');
      // Restore the year overlay to a fresh string from normal data.
      try { fm.updateCurrentTripYear(fm.currentCityIndex || 0); } catch (e) {}
    }
    scope.setVisitedCountries(null);
    document.body.classList.remove('fbl-mode');

    try {
      if (STATE.wasAnimating && fm && typeof fm.resumeAnimation === 'function' && !fm.isAnimating) {
        fm.resumeAnimation();
      }
    } catch (e) {}
    STATE.wasAnimating = false;

    const h = document.querySelector('.card-container .header h1');
    if (h && STATE.savedHeaderText != null) h.textContent = STATE.savedHeaderText;
    const slogan = document.querySelector('.card-container .header .header-slogan');
    if (slogan && STATE.savedSloganText != null) slogan.textContent = STATE.savedSloganText;
    STATE.savedSloganText = null;
    restoreMainTitle();

    if (STATE.button) {
      STATE.button.classList.remove('fbl-active');
      STATE.button.title = 'J2L III — Journey to Live III';
      const lb = STATE.button.querySelector('.atc-lb');
      if (lb) lb.textContent = 'J2L III';
    }
    STATE.active = false;
  }

  function toggleFbl() { if (STATE.active) exitFbl(); else enterFbl(); }

  function addButton() {
    const fm = window.flightMap;
    if (!fm || !fm.map) return;
    const FblCtl = L.Control.extend({
      onAdd: function () {
        const btn = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom atc-mb fbl-btn');
        // Skull icon for Final Boss / J2L III
        const icon =
          '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
          '<path d="M12 3c-4.4 0-8 3.2-8 7.2 0 2.3 1.1 4.2 2.8 5.5V18a1 1 0 0 0 1 1H9v2h2v-2h2v2h2v-2h1.2a1 1 0 0 0 1-1v-2.3c1.7-1.3 2.8-3.2 2.8-5.5C20 6.2 16.4 3 12 3z"/>' +
          '<circle cx="9" cy="11" r="1.6" fill="currentColor" stroke="none"/>' +
          '<circle cx="15" cy="11" r="1.6" fill="currentColor" stroke="none"/>' +
          '<path d="M11 14.5c.3.4.7.5 1 .5s.7-.1 1-.5"/>' +
          '</svg>';
        btn.innerHTML = icon + '<span class="atc-lb">J2L III</span>';
        btn.title = 'J2L III — Journey to Live III';
        L.DomEvent.disableClickPropagation(btn);
        btn.onclick = (e) => { L.DomEvent.stop(e); toggleFbl(); };
        STATE.button = btn;
        return btn;
      }
    });
    new FblCtl({ position: 'topright' }).addTo(fm.map);
  }

  async function init() {
    console.log('[final-boss] init');

    // Wait for ATC scope AND leaflet flightMap to be ready.
    const started = Date.now();
    while (!(window._atcScope && window.flightMap && window.flightMap.map)) {
      if (Date.now() - started > 20000) {
        console.error('[final-boss] scope/flightMap not ready — abort');
        return;
      }
      await new Promise(r => setTimeout(r, 100));
    }
    STATE.scope = window._atcScope;
    console.log('[final-boss] scope + flightMap ready after', Date.now() - started, 'ms');

    injectStyles();

    let geo;
    try {
      geo = await loadGeoJSON();
    } catch (e) {
      console.error('[final-boss] failed to fetch trans-siberian.geojson', e);
      return;
    }
    const parsed = parseGeoJSON(geo);
    STATE.line = parsed.line;
    STATE.stops = parsed.stops;
    STATE.stationIdxByCoord = buildStationIdxMap();
    console.log('[final-boss] loaded line pts:', STATE.line.length, 'stops:', STATE.stops.length,
                'station idx map size:', STATE.stationIdxByCoord.size);

    STATE.scope.setTransSib(STATE.line, STATE.stops);

    // Asia–Europe divider from data/asia-europe-border.js — the pre-simplified
    // window.CONTINENT_DIVIDE_LINES dataset from greaterAsianTrains.
    let dividerData;
    if (Array.isArray(window.CONTINENT_DIVIDE_LINES) && window.CONTINENT_DIVIDE_LINES.length) {
      dividerData = window.CONTINENT_DIVIDE_LINES.map(seg =>
        seg.map(p => [p[1], p[0]])  // [lng, lat] -> [lat, lng] for scope
      );
      console.log('[final-boss] using CONTINENT_DIVIDE_LINES,', dividerData.length, 'segments');
    } else {
      dividerData = DIVIDER;
      console.log('[final-boss] CONTINENT_DIVIDE_LINES not found, using fallback');
    }
    STATE.scope.setDivider(dividerData);
    STATE.dividerKm = totalLengthKm(dividerData);
    console.log('[final-boss] divider total km:', Math.round(STATE.dividerKm));

    // Great Wall of China (lines + passes)
    try {
      const gw = await loadGreatWall();
      STATE.greatWallLines = gw.lines;
      STATE.greatWallPasses = gw.passes;
      STATE.scope.setGreatWall(gw.lines, gw.passes);
      console.log('[final-boss] great wall loaded, segments:', gw.lines.length, 'passes:', gw.passes.length);
    } catch (e) {
      console.warn('[final-boss] great wall load failed', e);
    }

    // Trans-Manchurian & Trans-Mongolian — context rail lines drawn in FBL.
    try {
      const others = await loadOtherTransLines();
      STATE.otherPolylines = others; // used by polyline-follow lookup too
      STATE.scope.setOtherTransLines(others);
      const tot = others.reduce((n, e) => n + e.line.length, 0);
      console.log('[final-boss] other trans lines loaded,', others.length, 'entries,', tot, 'pts');
    } catch (e) {
      console.warn('[final-boss] other trans lines load failed', e);
    }

    const canvas = document.getElementById('atcScopeCanvas');
    wireCanvasHover(canvas);
    setupGreatWallLabel(canvas);

    addButton();
    console.log('[final-boss] ready');

    // Natural Earth 1:10m railroads — background world rail network shown
    // beneath the named trans-continental lines while J2L III is active.
    // Loaded asynchronously so init() completes without waiting on the
    // ~39 MB file; the scope picks it up on the next frame.
    loadNeRailroads().then(segs => {
      STATE.neRailroads = segs;
      STATE.scope.setNeRailroads(segs);
      console.log('[final-boss] ne_10m_railroads loaded,', segs.length, 'polylines');
    }).catch(e => console.warn('[final-boss] ne_10m_railroads load failed', e));
  }

  function setupGreatWallLabel(canvas) {
    const el = document.createElement('div');
    el.className = 'fbl-gw-label';
    el.textContent = 'THE GREAT WALL OF CHINA';
    document.body.appendChild(el);
    STATE.gwLabelEl = el;

    const scope = STATE.scope;
    function polylineForIdx(polyIdx) {
      if (polyIdx === 0) return STATE.line;
      const others = STATE.otherPolylines || [];
      return others[polyIdx - 1] && others[polyIdx - 1].line;
    }

    function updateArrowLineIdx() {
      // Derive progress from the animation state: legs 0..currentCityIndex-2
      // are completed, leg currentCityIndex-1 is active. Arrow position on
      // the active leg's polyline is the nearest vertex to fm.flightDot.
      if (!scope || !scope.fblActive) {
        if (scope) { scope.fblProgress = null; scope.arrowLineIdx = null; }
        return;
      }
      const fm = window.flightMap;
      const legs = STATE.legPaths;
      if (!fm || !Array.isArray(legs)) return;

      const activeLegIdx = fm.currentCityIndex - 1; // leg from cities[idx-1] -> cities[idx]
      const completed = [];
      for (let i = 0; i < activeLegIdx; i++) {
        if (legs[i]) completed.push(legs[i]);
      }
      const active = legs[activeLegIdx] || null;

      let progressActive = null;
      if (active) {
        const line = polylineForIdx(active.polyIdx);
        const ll = fm.flightDot && fm.flightDot.getLatLng ? fm.flightDot.getLatLng() : null;
        if (line && ll) {
          const lo = Math.min(active.iA, active.iB), hi = Math.max(active.iA, active.iB);
          let best = active.iA, bestD = Infinity;
          for (let i = lo; i <= hi; i++) {
            const dLat = line[i][0] - ll.lat, dLng = line[i][1] - ll.lng;
            const d = dLat * dLat + dLng * dLng;
            if (d < bestD) { bestD = d; best = i; }
          }
          progressActive = { polyIdx: active.polyIdx, iA: active.iA, iB: active.iB, arrow: best };
        } else if (line) {
          progressActive = { polyIdx: active.polyIdx, iA: active.iA, iB: active.iB, arrow: active.iA };
        }
      }

      scope.fblProgress = { completed, active: progressActive };
      scope.arrowLineIdx = progressActive ? progressActive.arrow : null;
    }

    function updateVisitedCountries() {
      if (!scope || !scope.fblActive) return;
      const fm = window.flightMap;
      if (!fm || !Array.isArray(fm.cities)) return;
      const upto = fm.currentCityIndex + 1; // include the current city
      const visited = new Set();
      for (let i = 0; i < Math.min(upto, fm.cities.length); i++) {
        const c = fm.cities[i];
        if (c && c.country) visited.add(coastCountry(c.country));
      }
      // Only push to scope if the set has actually grown to avoid tearing renders.
      const cur = scope.visitedCountries;
      if (!cur || cur.size !== visited.size) {
        scope.setVisitedCountries(visited);
      }
    }

    function updateYearOverlay() {
      const overlay = document.getElementById('yearOverlay');
      const h1 = document.querySelector('.card-container .header h1');
      const s = STATE.scope;
      if (!s || !s.fblActive) {
        if (overlay && STATE.overlayBackup != null) {
          overlay.textContent = STATE.overlayBackup;
          STATE.overlayBackup = null;
        }
        return;
      }
      const fm = window.flightMap;
      if (!fm || !fm.cities || !fm.cities.length) return;
      if (overlay && STATE.overlayBackup == null) STATE.overlayBackup = overlay.textContent;
      const idx = Math.max(0, Math.min(fm.currentCityIndex, fm.cities.length - 1));
      const city = fm.cities[idx];
      const country = (city && city.country) || '';
      const totalDays = Math.max(1, fm.cities.length - 1);
      const currentDay = Math.max(1, Math.min(idx, totalDays));
      const dayHtml = `<span class="fbl-day">DAY ${currentDay}/${totalDays}</span>`;
      const labelHtml = country
        ? `${country.toUpperCase()} · ${dayHtml}`
        : dayHtml;
      // The header H1 is the big yellowy year display the user sees.
      if (h1) h1.innerHTML = labelHtml;
      // The smaller in-map overlay mirrors the same info.
      if (overlay) {
        overlay.innerHTML = labelHtml;
        overlay.style.setProperty('display', 'block', 'important');
      }
    }

    function tick() {
      updateArrowLineIdx();
      updateVisitedCountries();
      updateYearOverlay();
      const a = scope && scope._greatWallAnchor;
      if (!scope || !scope.fblActive || !a) {
        el.classList.remove('on');
      } else {
        const p  = scope.project(a.lat,  a.lng);
        const ps = scope.project(a.sLat, a.sLng);
        const pe = scope.project(a.tLat, a.tLng);
        if (!p.vis || !ps.vis || !pe.vis) {
          el.classList.remove('on');
        } else {
          const dx = pe.x - ps.x, dy = pe.y - ps.y;
          const len = Math.hypot(dx, dy);
          if (len < 0.5) {
            el.classList.remove('on');
          } else {
            let angle = Math.atan2(dy, dx);
            if (angle > Math.PI / 2)  angle -= Math.PI;
            if (angle < -Math.PI / 2) angle += Math.PI;
            const nx = -dy / len, ny = dx / len;
            const perp = (ny > 0) ? [nx, ny] : [-nx, -ny];
            const OFFSET = 28;
            const cx = p.x + perp[0] * OFFSET;
            const cy = p.y + perp[1] * OFFSET;
            const rect = canvas.getBoundingClientRect();
            // Hide when the label position sits outside the visible canvas
            // (pan-out or zoom moves the wall off-screen).
            if (cx < 8 || cy < 8 || cx > rect.width - 8 || cy > rect.height - 8) {
              el.classList.remove('on');
            } else {
              const px = rect.left + window.scrollX + cx;
              const py = rect.top  + window.scrollY + cy;
              el.style.left = px + 'px';
              el.style.top  = py + 'px';
              el.style.transform = 'translate(-50%, -50%) rotate(' + angle + 'rad)';
              el.classList.add('on');
            }
          }
        }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
