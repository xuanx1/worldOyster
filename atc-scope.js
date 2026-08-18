// ATC Scope — orthographic globe radar renderer (oyster build)
// Adapted from atc-oyster/atc/scope.js with two oyster-specific additions:
//   * `zoom` factor — multiplies the projection radius (mouse-wheel zoom)
//   * `setZoom(z)` — clamps and applies zoom immediately
// Renders coastlines, graticule, range rings, compass rose, route vectors,
// airport returns, and the active aircraft blip + leader-line data tag.
(function () {
  'use strict';

  const D2R = Math.PI / 180, R2D = 180 / Math.PI;

  // ---- vector helpers (unit sphere) ----
  function toVec(lat, lng) {
    const la = lat * D2R, lo = lng * D2R, c = Math.cos(la);
    return [c * Math.cos(lo), c * Math.sin(lo), Math.sin(la)];
  }
  function slerp(a, b, t) {
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    dot = Math.max(-1, Math.min(1, dot));
    const om = Math.acos(dot);
    if (om < 1e-6) return a.slice();
    const s = Math.sin(om), s0 = Math.sin((1 - t) * om) / s, s1 = Math.sin(t * om) / s;
    return [a[0] * s0 + b[0] * s1, a[1] * s0 + b[1] * s1, a[2] * s0 + b[2] * s1];
  }
  function vecToLatLng(v) {
    return [Math.asin(Math.max(-1, Math.min(1, v[2]))) * R2D, Math.atan2(v[1], v[0]) * R2D];
  }

  class Scope {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.lon0 = 100;
      this.lat0 = 20;
      this.targetLon = 100;
      this.targetLat = 20;
      this.coast = null;
      // Country grouping — populated by loadCoast so _drawCoast can colour
      // each country independently (used by FBL to black out non-visited).
      this.countries = null;
      // Coastline level of detail. `coastTier` is the GeoLOD tier currently
      // ingested; enableCoastLOD() lets zoom swap it for a finer one.
      this.coastLOD = false;
      this.coastTier = null;
      this._coastPending = null;
      this._coastRingCount = 0;
      this._coastCache = null;      // offscreen raster, see _drawCoast
      this._coastCacheKey = null;
      this._coastPrevKey = null;    // last frame's view key — detects "settled"
      this._coastLastVisiblePts = 0; // feeds _motionStride()
      this.visitedCountries = null;   // Set<string> of visited country names
      this.routes = [];
      this.airports = new Map();
      this.blip = null;
      this.tag = null;
      this.theme = this._readTheme();
      this.showRings = true;
      this.showGraticule = true;
      this.showRoutes = true;
      this.showLabels = false;
      this.hoveredRouteIdx = null;     // set externally on canvas/chart hover
      this.hoveredCityName = null;     // set externally on canvas/city-list hover
      this.zoom = 1;        // 1 = default radius; >1 zooms in
      this.minZoom = 0.6;
      this.maxZoom = 12;
      // Final Boss Level — Trans-Siberian overlay
      this.transSibLine = null;   // Array of [lat, lng] pairs
      this.transSibStops = [];    // [{ lat, lng, name, description, _sx, _sy, _vis }]
      this.divider = null;        // Array of segments (each = array of [lat, lng])
      this.dividerNear = false;   // Set externally on canvas mousemove for hover
      this.hoveredStopIdx = null; // Set externally on canvas mousemove
      this.fblActive = false;     // Isolation mode — hide normal routes/airports/blip
      // Great Wall of China
      this.greatWallLines = null;   // Array of segments (each = array of [lat, lng])
      this.greatWallPasses = [];    // [{ lat, lng, name, _sx, _sy, _vis }]
      this.hoveredPassIdx = null;   // Great Wall pass under cursor
      // Null Island (0°N, 0°E) marker — geometry parsed from asset/icons/null.svg.
      this.nullIsland = null;       // { vb, groups: Map<id, Path2D> } — set by loadNullIsland
      this.showNullIsland = true;
      this.nullIslandSize = 14;     // marker width in CSS px
      this.nullIslandHovered = false; // set externally on canvas mousemove
      this._niScreen = null;        // last projected screen point (hit-testing)
      // Alternate trans-continental rail lines drawn as darker context in FBL.
      this.otherTransLines = null;  // Array of { line: [[lat,lng]...], name }
      // Natural Earth 1:10m global rail network — background layer in FBL.
      this.neRailroads = null;      // Array of [[lat,lng]...] polylines
      this._resize();
      window.addEventListener('resize', () => this._resize());
    }

    setTransSib(line, stops) {
      this.transSibLine = Array.isArray(line) ? line : null;
      this.transSibStops = Array.isArray(stops) ? stops.map(s => ({ ...s })) : [];
    }
    setDivider(coords) {
      this.divider = Array.isArray(coords) ? coords : null;
      this._buildContinentAnchors();
    }

    // Precompute EUROPE / ASIA label anchors at fixed arc-length intervals
    // along the divider, in GEO space. This keeps each anchor pinned to a
    // real point on the line so labels no longer snap in/out as the user
    // zooms — they slide smoothly along the projection instead.
    _buildContinentAnchors() {
      this._continentAnchors = null;
      const d = this.divider;
      if (!d || !d.length) return;
      const segments = (Array.isArray(d[0]) && typeof d[0][0] === 'number') ? [d] : d;

      const ARC_INTERVAL_KM = 400; // km between label pairs along the line
      const R_KM = 6371;
      const hav = (a, b) => {
        const p1 = a[0] * D2R, p2 = b[0] * D2R;
        const dp = (b[0] - a[0]) * D2R, dl = (b[1] - a[1]) * D2R;
        const x = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
        return 2 * R_KM * Math.asin(Math.sqrt(x));
      };

      const anchors = [];
      for (const seg of segments) {
        if (!seg || seg.length < 2) continue;
        let acc = ARC_INTERVAL_KM * 0.5;
        for (let i = 0; i < seg.length - 1; i++) {
          const a = seg[i], b = seg[i + 1];
          const segKm = hav(a, b);
          if (segKm < 0.001) continue;
          while (acc < segKm) {
            const t = acc / segKm;
            const lat = a[0] + (b[0] - a[0]) * t;
            const lng = a[1] + (b[1] - a[1]) * t;
            // Second point slightly forward along the same edge for the
            // tangent — projected each frame so the angle is correct on
            // the current sphere orientation.
            const tt = Math.min(1, t + 0.02);
            const tLat = a[0] + (b[0] - a[0]) * tt;
            const tLng = a[1] + (b[1] - a[1]) * tt;
            anchors.push({ lat, lng, tLat, tLng });
            acc += ARC_INTERVAL_KM;
          }
          acc -= segKm;
        }
      }
      this._continentAnchors = anchors;
    }
    setFblActive(v) { this.fblActive = !!v; }
    setGreatWall(lines, passes) {
      this.greatWallLines = Array.isArray(lines) ? lines : null;
      this.greatWallPasses = Array.isArray(passes) ? passes.map(p => ({ ...p })) : [];
      this._buildGreatWallAnchor();
    }
    setOtherTransLines(entries) {
      this.otherTransLines = Array.isArray(entries) ? entries : null;
    }
    setNeRailroads(segments) {
      this.neRailroads = Array.isArray(segments) ? segments : null;
      // Invalidate any existing offscreen cache — new data means new geometry.
      this._neRailCache = null;
      this._neRailCacheKey = null;
    }

    // Single "THE GREAT WALL OF CHINA" label — anchored to the midpoint of
    // the longest chain. Tangent uses the chain's OVERALL start→end direction
    // (not a local slice) so switchbacks don't flip the label perpendicular
    // to the wall's real east-west run.
    _buildGreatWallAnchor() {
      this._greatWallAnchor = null;
      const lines = this.greatWallLines;
      if (!lines || !lines.length) return;
      let longest = null, longestLen = 0;
      for (const seg of lines) {
        if (seg && seg.length > longestLen) { longest = seg; longestLen = seg.length; }
      }
      if (!longest || longest.length < 2) return;
      const mid = longest[Math.floor(longest.length / 2)];
      const start = longest[0];
      const end   = longest[longest.length - 1];
      this._greatWallAnchor = {
        lat: mid[0], lng: mid[1],
        // Tangent anchor: use the chain endpoints for a stable direction.
        tLat: end[0], tLng: end[1],
        sLat: start[0], sLng: start[1]
      };
    }

    _readTheme() {
      const cs = getComputedStyle(document.body);
      const g = n => (cs.getPropertyValue(n) || '').trim();
      // Fall back to embedded slate palette when no CSS vars are set.
      return {
        ocean:        g('--atc-scope-ocean')   || '#0a141d',
        land:         g('--atc-scope-land')    || '#13202b',
        coast:        g('--atc-scope-coast')   || '#2c4456',
        grid:         g('--atc-scope-grid')    || '#16242f',
        ring:         g('--atc-scope-ring')    || '#284356',
        accent:       g('--atc-accent')        || '#43d4e6',
        accent2:      g('--atc-accent2')       || '#f4a13c',
        blip:         g('--atc-blip')          || '#ffb02e',
        routePast:    g('--atc-route-past')    || '#305a6d',
        routeActive:  g('--atc-route-active')  || '#43d4e6',
        dim:          g('--atc-dim')           || '#607583',
        text:         g('--atc-text')          || '#c4d4df',
        // Conceptual overlays (Asia-Europe divide, Great Wall) and the
        // context rail network. These were hardcoded pale-on-dark, which
        // leaves them invisible on a light globe — hence the vars.
        overlay:      g('--atc-scope-overlay') || '#d0d8e0',
        rail:         g('--atc-scope-rail')    || '#5a636b',
        railBg:       g('--atc-scope-rail-bg') || '#3a4652',
        // Halo stroked behind canvas labels for legibility.
        halo:         g('--atc-scope-halo')    || 'rgba(10, 20, 29, 0.9)',
        chip:         g('--atc-scope-chip')    || 'rgba(0, 0, 0, 0.75)',
        // Multiplier on every canvas glow. A shadowBlur in the mark's own
        // colour reads as light only against a dark ground; on a pale globe
        // the same halo just smears the mark and makes it look muddy. The
        // light theme turns this most of the way down.
        glowScale: (function () {
          const v = parseFloat(g('--atc-scope-glow'));
          return isNaN(v) ? 1 : v;
        })()
      };
    }
    refreshTheme() { this.theme = this._readTheme(); }

    _resize() {
      const r = this.canvas.getBoundingClientRect();
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.cx = this.w / 2; this.cy = this.h / 2;
      this._computeRadius();
    }
    _computeRadius() {
      this.radius = Math.min(this.w, this.h) * 0.46 * this.zoom;
    }

    setZoom(z) {
      this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, z));
      this._computeRadius();
      this._syncCoastLOD();
    }
    zoomBy(factor) { this.setZoom(this.zoom * factor); }

    async loadCoast(url) {
      this._ingestCoast(await (await fetch(url)).json(), null);
    }

    // Turn a parsed admin-0 FeatureCollection into the draw structures.
    // Split out from loadCoast so a level-of-detail swap can reuse geometry
    // GeoLOD already holds in memory without going back to the network.
    _ingestCoast(gj, tier) {
      const polys = [];        // flat list (back-compat with any code reading .coast)
      const countries = [];    // grouped per country for FBL blackout
      let ringCount = 0;
      const take = (r, rings) => {
        const bound = this._ringBound(r);
        // A ring that collapses to nothing can't be bounded — skip rather
        // than let a NaN centre poison the visibility test every frame.
        if (!bound) return;
        const entry = { pts: r, b: bound };
        polys.push(r); rings.push(entry); ringCount++;
      };
      for (const f of gj.features) {
        const g = f.geometry; if (!g) continue;
        const props = f.properties || {};
        const name = props.SOVEREIGNT || props.ADMIN || props.NAME || '';
        const rings = [];
        if (g.type === 'Polygon') {
          g.coordinates.forEach(r => take(r, rings));
        } else if (g.type === 'MultiPolygon') {
          g.coordinates.forEach(p => p.forEach(r => take(r, rings)));
        }
        if (rings.length) countries.push({ name, rings });
      }
      this.coast = polys;
      this.countries = countries;
      this.coastTier = tier;
      this._coastRingCount = ringCount;
      this._coastCache = null;      // geometry changed — the raster is stale
      this._coastCacheKey = null;
    }

    // Bounding cap for one ring: the unit vector at its centre plus the
    // angular radius that covers every vertex. Lets _paintCoast reject a ring
    // with one dot product instead of projecting all 22k of Russia's points.
    _ringBound(ring) {
      let sx = 0, sy = 0, sz = 0;
      for (let i = 0; i < ring.length; i++) {
        const la = ring[i][1] * D2R, lo = ring[i][0] * D2R, cl = Math.cos(la);
        sx += cl * Math.cos(lo); sy += cl * Math.sin(lo); sz += Math.sin(la);
      }
      const len = Math.sqrt(sx * sx + sy * sy + sz * sz);
      // Degenerate (empty, or vertices that cancel out into the origin).
      if (!len || !isFinite(len)) return null;
      sx /= len; sy /= len; sz /= len;
      let minDot = 1;
      for (let i = 0; i < ring.length; i++) {
        const la = ring[i][1] * D2R, lo = ring[i][0] * D2R, cl = Math.cos(la);
        const d = sx * cl * Math.cos(lo) + sy * cl * Math.sin(lo) + sz * Math.sin(la);
        if (d < minDot) minDot = d;
      }
      return { x: sx, y: sy, z: sz, angR: Math.acos(Math.max(-1, Math.min(1, minDot))) };
    }

    // ---- coastline level of detail -------------------------------------
    // Opt in from the host page (atc-skin) so a Scope embedded elsewhere keeps
    // the old single-file behaviour.
    enableCoastLOD() {
      this.coastLOD = true;
      this._syncCoastLOD();
    }

    // Called on every zoom change. Swapping to an already-loaded tier is
    // synchronous; a tier we don't hold yet is fetched once and applied when
    // it lands, provided the zoom still wants it by then.
    _syncCoastLOD() {
      if (!this.coastLOD || !window.GeoLOD) return;
      const want = window.GeoLOD.scopeTier(this.zoom);
      if (want === this.coastTier) return;

      const ready = window.GeoLOD.peek(want);
      if (ready) { this._ingestCoast(ready, want); return; }

      if (this._coastPending === want) return;   // already on its way
      this._coastPending = want;
      window.GeoLOD.load(want).then(geo => {
        this._coastPending = null;
        // The view may have zoomed back out while this was downloading — only
        // apply if it's still an upgrade on what's drawn.
        if (!this.coastLOD) return;
        const now = window.GeoLOD.scopeTier(this.zoom);
        if (now === want || window.GeoLOD.isFinerThan(now, want)) this._ingestCoast(geo, want);
      }).catch(err => {
        this._coastPending = null;
        console.warn('[atc-scope] coast tier ' + want + ' failed, staying on ' + this.coastTier, err);
      });
    }

    // Load the Null Island marker artwork. Each top-level <g> in the SVG
    // becomes one Path2D keyed by its id, so layers can be drawn (and
    // animated) independently — "outer" is the group we pulse.
    async loadNullIsland(url) {
      const txt = await (await fetch(url)).text();
      const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg || doc.querySelector('parsererror')) throw new Error('null.svg parse failed');
      const vbAttr = (svg.getAttribute('viewBox') || '0 0 100 100').trim().split(/[\s,]+/).map(Number);
      const vb = { x: vbAttr[0], y: vbAttr[1], w: vbAttr[2], h: vbAttr[3] };

      const groups = new Map();
      svg.querySelectorAll('g[id]').forEach(g => {
        const path = new Path2D();
        g.querySelectorAll('polygon, polyline, path').forEach(el => {
          if (el.tagName === 'path') {
            const d = el.getAttribute('d');
            if (d) path.addPath(new Path2D(d));
            return;
          }
          const nums = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
          if (nums.length < 4) return;
          path.moveTo(nums[0], nums[1]);
          for (let i = 2; i + 1 < nums.length; i += 2) path.lineTo(nums[i], nums[i + 1]);
          if (el.tagName === 'polygon') path.closePath();
        });
        groups.set(g.id, path);
      });
      this.nullIsland = { vb, groups };
    }

    setVisitedCountries(setOrArray) {
      const next = (!setOrArray) ? null
        : (setOrArray instanceof Set) ? setOrArray : new Set(setOrArray);
      // Record a fade-in timestamp for any newly-added country so the
      // blackout can smoothly transition rather than snapping.
      if (!this._visitedFadeStart) this._visitedFadeStart = new Map();
      if (next) {
        const now = performance.now();
        next.forEach(name => {
          if (!this._visitedFadeStart.has(name) &&
              !(this.visitedCountries && this.visitedCountries.has(name))) {
            this._visitedFadeStart.set(name, now);
          }
        });
      } else {
        this._visitedFadeStart.clear();
      }
      this.visitedCountries = next;
    }

    project(lat, lng) {
      const la = lat * D2R, lo = (lng - this.lon0) * D2R, la0 = this.lat0 * D2R;
      const cosc = Math.sin(la0) * Math.sin(la) + Math.cos(la0) * Math.cos(la) * Math.cos(lo);
      const x = this.radius * Math.cos(la) * Math.sin(lo);
      const y = this.radius * (Math.cos(la0) * Math.sin(la) - Math.sin(la0) * Math.cos(la) * Math.cos(lo));
      return { x: this.cx + x, y: this.cy - y, vis: cosc >= 0 };
    }

    setCenter(lat, lng, snap) {
      this.targetLat = Math.max(-85, Math.min(85, lat));
      this.targetLon = ((lng + 540) % 360) - 180; // normalise to -180..180
      if (snap) { this.lat0 = this.targetLat; this.lon0 = this.targetLon; }
    }

    _easeCenter() {
      let dLon = ((this.targetLon - this.lon0 + 540) % 360) - 180;
      this.lon0 = (((this.lon0 + dLon * 0.12) + 540) % 360) - 180;
      this.lat0 += (this.targetLat - this.lat0) * 0.12;
    }

    render() {
      this._easeCenter();
      const ctx = this.ctx, T = this.theme;
      ctx.clearRect(0, 0, this.w, this.h);

      // ocean disc
      ctx.save();
      ctx.beginPath(); ctx.arc(this.cx, this.cy, this.radius, 0, 7); ctx.closePath();
      const grad = ctx.createRadialGradient(this.cx, this.cy, this.radius * 0.2, this.cx, this.cy, this.radius);
      grad.addColorStop(0, T.ocean); grad.addColorStop(1, this._shade(T.ocean, -10));
      ctx.fillStyle = grad; ctx.fill();
      ctx.clip();

      if (this.showGraticule) this._drawGraticule();
      this._drawCoast();
      if (this.divider) this._drawDivider();
      if (this.fblActive && this.greatWallLines) this._drawGreatWall();
      // In FBL the trans-continental polylines ARE the route — draw them
      // (with bright completed portions overlaid) and skip normal GC arcs.
      if (this.fblActive) {
        if (this.neRailroads) this._drawNeRailroads();
        if (this.otherTransLines) this._drawOtherTransLines();
        if (this.transSibLine) this._drawTransSib();
        this._drawFblProgress();
      } else if (this.showRoutes) {
        this._drawRoutes();
      }
      this._drawAirports();
      // Hidden during FBL — that mode isolates the rail story.
      if (this.showNullIsland && !this.fblActive) this._drawNullIsland();
      // Great Wall passes intentionally hidden (only lines are drawn).
      // Trans-Sib station dots are NOT drawn in FBL — the normal airport
      // pipeline (syncAirports → _drawAirports) shows a green pin only
      // AFTER the arrow has reached each city. We still keep hit-testing
      // support for hover tooltips via hitTestTransSibStop.
      this._drawBlip();
      if (this.divider) this._drawContinentLabels();
      // Great Wall label is rendered as a DOM overlay by final-boss.js so it
      // can use the animated CSS gradient text-fill (see .fbl-gw-label).
      ctx.restore();

      if (this.showRings) this._drawRings();
      this._drawCompass();
      this._drawLeaderTag();
    }

    _drawGraticule() {
      const ctx = this.ctx; ctx.strokeStyle = this.theme.grid; ctx.lineWidth = 0.6;
      ctx.globalAlpha = 0.55;
      for (let lat = -60; lat <= 60; lat += 30) this._drawParallel(lat);
      for (let lng = 0; lng < 360; lng += 30) this._drawMeridian(lng);
      ctx.globalAlpha = 1;
    }
    _drawParallel(lat) {
      const ctx = this.ctx; ctx.beginPath(); let started = false;
      for (let lng = -180; lng <= 180; lng += 3) {
        const p = this.project(lat, lng);
        if (!p.vis) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }
    _drawMeridian(lng) {
      const ctx = this.ctx; ctx.beginPath(); let started = false;
      for (let lat = -90; lat <= 90; lat += 3) {
        const p = this.project(lat, lng);
        if (!p.vis) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
    }

    // Largest angular distance from the view centre that can still land on
    // the canvas. At zoom 1 the whole visible hemisphere qualifies; by zoom 6
    // it is around 20°, which is what makes the 10m tier affordable — nearly
    // every ring fails the cap test in _paintCoast and is never projected.
    _visibleAngle() {
      const screenR = Math.sqrt(this.w * this.w + this.h * this.h) / 2;
      return Math.asin(Math.min(1, screenR / this.radius));
    }

    // True while any country is mid-crossfade out of FBL blackout, i.e. while
    // colours still change from frame to frame and caching would freeze them.
    _coastFading() {
      if (!this.fblActive || !this._visitedFadeStart) return false;
      const now = performance.now();
      for (const ts of this._visitedFadeStart.values()) {
        if (now - ts < 1400) return true;
      }
      return false;
    }

    _drawCoast() {
      if (!this.countries && !this.coast) return;

      // The 110m tier is cheap enough to reproject every frame (~1.5 ms). The
      // finer tiers are not — a full 10m pass is 20-30 ms even after culling —
      // so they get the treatment _drawNeRailroads uses for the 10m rail
      // network: rasterise once per view state, then blit.
      //
      // That leaves the frames where the view is actually moving, which would
      // miss the cache every time. Those draw decimated instead: while the
      // globe is in motion a stride of every Nth vertex is indistinguishable,
      // and full detail lands on the first frame after it settles.
      const heavy = this._coastRingCount > 600;
      if (heavy && !this._coastFading()) {
        const q = 0.005;
        const key = Math.round(this.lat0 / q) + ',' + Math.round(this.lon0 / q) +
                    ',' + Math.round(this.zoom * 1000) +
                    ',' + this.canvas.width + ',' + this.canvas.height +
                    ',' + this.coastTier + ',' + this.theme.land + ',' + this.theme.coast +
                    ',' + (this.fblActive ? 1 : 0) +
                    ',' + ((this.fblActive && this.visitedCountries) ? this.visitedCountries.size : -1);

        // Steady state — the raster still matches the view.
        if (this._coastCache && this._coastCacheKey === key) {
          this._blitCoast();
          return;
        }
        // The view held still for a frame, so it is worth paying for detail.
        if (this._coastPrevKey === key) {
          this._renderCoastToCache();
          this._coastCacheKey = key;
          if (this._coastCache) { this._blitCoast(); return; }
        } else {
          // Still moving.
          this._coastPrevKey = key;
          this._coastCacheKey = null;
          this._paintCoast(this.ctx, this._motionStride());
          return;
        }
      }

      this._paintCoast(this.ctx, 1);
    }

    // Offscreen is sized in device pixels, so blit at the underlying pixel
    // scale rather than through the parent DPR transform.
    _blitCoast() {
      const ctx = this.ctx;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this._coastCache, 0, 0);
      ctx.restore();
    }

    // Vertex stride for in-motion frames, sized off how much geometry the last
    // pass actually projected so it adapts to tier, zoom and viewport instead
    // of guessing. ~24k points keeps a moving frame in the 3-5 ms range.
    _motionStride() {
      const n = this._coastLastVisiblePts || 0;
      return n > 24000 ? Math.ceil(n / 24000) : 1;
    }

    _renderCoastToCache() {
      let off = this._coastCache;
      if (!off || off.width !== this.canvas.width || off.height !== this.canvas.height) {
        off = document.createElement('canvas');
        off.width = this.canvas.width;
        off.height = this.canvas.height;
        this._coastCache = off;
      }
      const octx = off.getContext('2d');
      octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      octx.clearRect(0, 0, this.w, this.h);
      octx.setLineDash([]);
      this._paintCoast(octx, 1);
    }

    _paintCoast(ctx, stride) {
      const T = this.theme;
      const blackoutFill   = '#050505';
      const blackoutStroke = '#0d0d0d';
      const step = Math.max(1, stride | 0);
      let projected = 0;

      // Trace one ring, taking every `step`-th vertex. The last vertex is
      // always included so a decimated ring still closes where it should.
      const trace = (pts) => {
        projected += pts.length;
        ctx.beginPath();
        let started = false, drew = false;
        const last = pts.length - 1;
        for (let i = 0; i <= last; i += step) {
          const q = i + step > last ? last : i;      // snap the final step onto the end
          const p = this.project(pts[q][1], pts[q][0]);
          if (!p.vis) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else { ctx.lineTo(p.x, p.y); drew = true; }
        }
        return drew;
      };

      // Ring-level frustum cull. `thr` is cos(maxVisibleAngle + ringRadius):
      // a ring whose centre sits further off than that cannot touch the
      // canvas, so it never gets projected.
      const vis = this._visibleAngle();
      const cv = Math.cos(vis), sv = Math.sin(vis);
      const v0 = toVec(this.lat0, this.lon0);
      const culled = (b) => {
        const sum = vis + b.angR;
        if (sum >= Math.PI) return false;      // cap covers the whole sphere
        const thr = cv * Math.cos(b.angR) - sv * Math.sin(b.angR);
        return (b.x * v0[0] + b.y * v0[1] + b.z * v0[2]) < thr;
      };

      // When we have per-country grouping (Natural Earth admin-0), draw
      // each country individually so FBL can black out non-visited ones.
      if (this.countries) {
        ctx.lineWidth = 1;
        ctx.lineJoin = 'round';
        const FADE_MS = 1400;
        const now = performance.now();
        // Parse a hex color like "#13202b" to [r,g,b]; fallback to 0,0,0.
        const hex2rgb = (hex) => {
          const s = String(hex).replace('#', '').padEnd(6, '0');
          return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
        };
        const [lr, lg, lb] = hex2rgb(T.land);
        const [cr, cg, cb] = hex2rgb(T.coast);
        const [br, bg, bb] = hex2rgb(blackoutFill);
        const [sr, sg, sb] = hex2rgb(blackoutStroke);

        for (const c of this.countries) {
          let fillCss, strokeCss;
          if (!this.fblActive || !this.visitedCountries) {
            fillCss = T.land; strokeCss = T.coast;
          } else if (!this.visitedCountries.has(c.name)) {
            fillCss = blackoutFill; strokeCss = blackoutStroke;
          } else {
            const ts = this._visitedFadeStart && this._visitedFadeStart.get(c.name);
            const t = ts ? Math.min(1, (now - ts) / FADE_MS) : 1;
            if (t >= 1) { fillCss = T.land; strokeCss = T.coast; }
            else {
              const mix = (a, b) => Math.round(a + (b - a) * t);
              fillCss   = `rgb(${mix(br, lr)},${mix(bg, lg)},${mix(bb, lb)})`;
              strokeCss = `rgb(${mix(sr, cr)},${mix(sg, cg)},${mix(sb, cb)})`;
            }
          }
          ctx.fillStyle = fillCss;
          ctx.strokeStyle = strokeCss;
          for (const ring of c.rings) {
            if (culled(ring.b)) continue;
            if (trace(ring.pts)) { ctx.fill(); ctx.stroke(); }
          }
        }
        this._coastLastVisiblePts = projected;
        return;
      }

      // Fallback: flat coast list (pre-country loading)
      if (!this.coast) return;
      ctx.fillStyle = T.land;
      ctx.strokeStyle = T.coast;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      for (const ring of this.coast) {
        if (trace(ring)) { ctx.fill(); ctx.stroke(); }
      }
      this._coastLastVisiblePts = projected;
    }

    _gcPoints(from, to, n) {
      const a = toVec(from[0], from[1]), b = toVec(to[0], to[1]), pts = [];
      for (let i = 0; i <= n; i++) pts.push(vecToLatLng(slerp(a, b, i / n)));
      return pts;
    }

    _drawRoutes() {
      const ctx = this.ctx;
      let hoveredJob = null;     // draw hovered last, ON TOP of everything
      for (let i = 0; i < this.routes.length; i++) {
        const rt = this.routes[i];
        if (rt.state === 'future') continue;
        if (i === this.hoveredRouteIdx) { hoveredJob = { rt, i }; continue; }
        this._drawRouteArc(rt, false);
      }
      if (hoveredJob) this._drawRouteArc(hoveredJob.rt, true);
    }

    _drawRouteArc(rt, hovered) {
      const ctx = this.ctx;
      const active = rt.state === 'active';
      const surface = rt.type === 'land';
      const pts = this._gcPoints(rt.from, rt.to, 64);
      const frac = active ? (rt.t == null ? 1 : rt.t) : 1;
      const last = Math.max(1, Math.floor(pts.length * frac));

      const tracePath = () => {
        ctx.beginPath(); let started = false;
        for (let j = 0; j < last; j++) {
          const p = this.project(pts[j][0], pts[j][1]);
          if (!p.vis) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
      };

      if (hovered) {
        const col = surface ? this.theme.accent2 : this.theme.accent;
        // 1. wide low-alpha halo
        tracePath();
        ctx.setLineDash([]);
        ctx.strokeStyle = col;
        ctx.lineWidth = 11;
        ctx.globalAlpha = 0.22;
        ctx.shadowBlur = 0;
        ctx.stroke();
        // 2. solid bright core
        tracePath();
        ctx.strokeStyle = col;
        ctx.lineWidth = 4;
        ctx.globalAlpha = 1;
        ctx.shadowColor = col;
        ctx.shadowBlur = 18 * this.theme.glowScale;
        ctx.stroke();
      } else {
        tracePath();
        // Surface (land) legs draw as a SOLID orange line; air legs
        // keep the green tones. No dashes anywhere.
        ctx.setLineDash([]);
        if (active) {
          ctx.strokeStyle = surface ? this.theme.accent2 : this.theme.routeActive;
          ctx.lineWidth = 1.8;
          ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10 * this.theme.glowScale;
          ctx.globalAlpha = 1;
        } else {
          ctx.strokeStyle = surface ? this.theme.accent2 : this.theme.routePast;
          ctx.lineWidth = surface ? 1.4 : 1;
          ctx.globalAlpha = surface ? 0.65 : 0.85;
          ctx.shadowBlur = 0;
        }
        ctx.stroke();
      }
      ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.setLineDash([]);
    }

    _drawAirports() {
      const ctx = this.ctx, T = this.theme;
      ctx.font = '8.5px "IBM Plex Mono", monospace';
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';

      // pulse phase for the current city
      const ph = (performance.now() % 1600) / 1600;
      const hoveredName = this.hoveredCityName;
      const hoveredJobs = [];

      // Radar sweep glow: each airport lights up as the sweep beam
      // passes over it, then fades back to its normal brightness.
      // sweepAngleDeg = current beam leading-edge angle in degrees
      // (0 = up/north, clockwise). Provided by atc-skin.js each frame.
      const sweepDeg = (typeof this.sweepAngleDeg === 'number') ? this.sweepAngleDeg : null;
      const sweepPeriod = this.sweepPeriodMs || 6000;
      const GLOW_DECAY_MS = 1800;
      const glowFor = (p) => {
        if (sweepDeg === null) return 0;
        const dx = p.x - this.cx;
        const dy = p.y - this.cy;
        // screen angle: 0 = up, increases clockwise
        let apAng = (Math.atan2(dx, -dy) * R2D + 360) % 360;
        // lag = how far behind the leading edge this airport is (deg)
        const lag = ((sweepDeg - apAng) + 360) % 360;
        const lagMs = (lag / 360) * sweepPeriod;
        return Math.max(0, 1 - lagMs / GLOW_DECAY_MS);
      };

      this.airports.forEach(a => {
        const p = this.project(a.lat, a.lng);
        if (!p.vis) return;

        // collect hovered pins for a second pass on top
        if (hoveredName && a.city === hoveredName) hoveredJobs.push({ a, p });

        const g = glowFor(p);

        if (a.current) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 4 + ph * 10, 0, 7);
          ctx.strokeStyle = T.accent2;
          ctx.globalAlpha = (1 - ph) * 0.55;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 7);
          ctx.fillStyle = T.accent2;
          ctx.shadowColor = T.accent2; ctx.shadowBlur = 10 * T.glowScale;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else if (a.visited) {
          // Radar glow halo — bright ring expands and fades after the
          // sweep beam passes overhead, then settles to a normal pin.
          if (g > 0.02) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 2.2 + g * 9, 0, 7);
            ctx.fillStyle = T.accent;
            ctx.globalAlpha = g * 0.28;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.beginPath(); ctx.arc(p.x, p.y, 2.2 + g * 1.4, 0, 7);
          ctx.fillStyle = T.accent;
          ctx.shadowColor = T.accent; ctx.shadowBlur = (6 + g * 18) * T.glowScale;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          // Unvisited: in FBL mode draw as a plain dim dot (no radar glow)
          // so cities-not-yet-reached don't flash green. In normal viz keep
          // the sweep-triggered halo so the radar look still works there.
          if (!this.fblActive && g > 0.02) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.4 + g * 6, 0, 7);
            ctx.fillStyle = T.accent;
            ctx.globalAlpha = g * 0.18;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, 7);
          ctx.fillStyle = T.faint || T.dim;
          ctx.globalAlpha = this.fblActive ? 0.6 : (0.6 + g * 0.4);
          ctx.fill();
          ctx.globalAlpha = 1;
        }

        if (this.showLabels && a.code) {
          ctx.fillStyle = a.current ? T.accent2 : a.visited ? T.text : T.dim;
          ctx.globalAlpha = a.visited || a.current ? 0.95 : 0.5;
          ctx.fillText(a.code, p.x + 5, p.y - 5);
          ctx.globalAlpha = 1;
        }
      });

      // ---- hover emphasis pass: draws on top of everything else ----
      hoveredJobs.forEach(({ a, p }) => {
        const col = a.current ? T.accent2 : T.accent;
        // soft outer halo
        ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 7);
        ctx.fillStyle = col; ctx.globalAlpha = 0.22; ctx.shadowBlur = 0;
        ctx.fill();
        ctx.globalAlpha = 1;
        // bright core dot
        ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 7);
        ctx.fillStyle = col;
        ctx.shadowColor = col; ctx.shadowBlur = 16 * T.glowScale;
        ctx.fill();
        ctx.shadowBlur = 0;
        // ring outline
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, 7);
        ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.85;
        ctx.stroke();
        ctx.globalAlpha = 1;
        // label above the pin
        const label = (a.city || a.code || '').toUpperCase();
        if (label) {
          ctx.font = 'bold 11px "IBM Plex Mono", monospace';
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          const tw = ctx.measureText(label).width;
          // backdrop strip for legibility
          ctx.fillStyle = T.chip;
          ctx.fillRect(p.x - tw / 2 - 4, p.y - 24, tw + 8, 14);
          ctx.fillStyle = col;
          ctx.fillText(label, p.x, p.y - 12);
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        }
      });
    }

    // Null Island — the phantom fix at 0°N 0°E where the graticule crosses.
    // The static crosshair layer ("Objects") sits at a fixed screen size; the
    // "outer" bracket layer breathes and throws an expanding echo so the
    // contact reads as live rather than as another airport pin.
    _drawNullIsland() {
      const ni = this.nullIsland;
      if (!ni) { this._niScreen = null; return; }
      const p = this.project(0, 0);
      if (!p.vis) { this._niScreen = null; return; }
      this._niScreen = p;
      const ctx = this.ctx, T = this.theme;
      const hov = this.nullIslandHovered;
      const SIZE = this.nullIslandSize;
      const unit = SIZE / ni.vb.w;     // SVG units → screen px
      const cx = ni.vb.x + ni.vb.w / 2, cy = ni.vb.y + ni.vb.h / 2;

      // Draw `path` centred on the marker, scaled by `k` (1 = nominal size).
      // At this size the artwork's strokes land well under a pixel (the
      // crosshair arms are 1.6% of the viewBox), so each shape is stroked as
      // well as filled to hold a ~0.6px floor — otherwise it fades to nothing.
      const paint = (path, k, alpha, colour, glow) => {
        if (!path) return;
        const s = unit * k;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.scale(s, s);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = colour;
        ctx.strokeStyle = colour;
        ctx.lineWidth = 0.6 / s;      // 0.6 screen px, expressed in SVG units
        ctx.lineJoin = 'round';
        ctx.globalAlpha = alpha;
        // shadowBlur is unaffected by the CTM, so it stays in screen px.
        if (glow) { ctx.shadowColor = colour; ctx.shadowBlur = glow; }
        ctx.fill(path);
        ctx.stroke(path);
        ctx.restore();
      };

      const t = (performance.now() % 2200) / 2200;   // 0..1 pulse cycle

      // Static crosshair — dim, so it doesn't read as a visited pin.
      paint(ni.groups.get('Objects'), 1, hov ? 0.9 : 0.5, hov ? T.text : T.dim, 0);

      // "outer" layer: breathing brackets…
      const breathe = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);   // 0..1..0
      const col = hov ? T.accent2 : T.accent;
      paint(ni.groups.get('outer'), 1 + breathe * 0.06, (hov ? 0.6 : 0.35) + breathe * 0.4, col, 6 + breathe * 12);
      // …plus an echo that expands outward and fades.
      if (t < 0.85) {
        const e = t / 0.85;
        paint(ni.groups.get('outer'), 1 + e * 0.45, (1 - e) * (hov ? 0.5 : 0.35), col, 0);
      }

      if (this.showLabels || hov) {
        ctx.save();
        ctx.font = '8.5px "IBM Plex Mono", monospace';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillStyle = hov ? col : T.dim; ctx.globalAlpha = hov ? 1 : 0.8;
        ctx.fillText('NULL ISLAND', p.x, p.y + SIZE / 2 + 4);
        ctx.restore();
      }
    }

    // True when (sx, sy) is over the Null Island marker. Mirrors
    // hitTestDivider's contract so atc-skin can drive a hover tooltip.
    hitTestNullIsland(sx, sy, tol) {
      if (!this._niScreen || !this.showNullIsland || this.fblActive) return false;
      // Floor the radius at 10px — the marker is small enough that its own
      // half-width would make it fiddly to hover.
      const r = (tol != null ? tol : Math.max(10, this.nullIslandSize / 2));
      const dx = this._niScreen.x - sx, dy = this._niScreen.y - sy;
      return (dx * dx + dy * dy) <= r * r;
    }

    _drawBlip() {
      if (!this.blip) { this._blipScreen = null; return; }
      const p = this.project(this.blip.lat, this.blip.lng);
      if (!p.vis) { this._blipScreen = null; return; }
      this._blipScreen = p;
      const ctx = this.ctx, T = this.theme;
      ctx.save();
      ctx.translate(p.x, p.y);
      const col = this.blip.surface ? T.accent2 : T.blip;
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14 * T.glowScale;
      // Arrow rotates by the current bearing for BOTH air and surface
      // legs — surface only differs by colour, so the rotation is
      // visible whether you're flying or on a train/car/walk.
      ctx.rotate((this.blip.brg || 0) * D2R);
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6); ctx.closePath();
      ctx.fill();
      ctx.restore();
      // pulsing acquisition ring
      const t = (performance.now() % 1600) / 1600;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6 + t * 16, 0, 7);
      ctx.strokeStyle = col; ctx.globalAlpha = (1 - t) * 0.6; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Natural Earth 1:10m railroads — global rail network drawn as a very
    // muted background layer beneath the Trans-Sib / other named lines.
    // Only invoked while FBL is active. Projects into an offscreen canvas
    // and reuses the bitmap while the view is quiescent; the sphere lerps
    // asymptotically toward the target so within ~1s of any pan/zoom the
    // key stops changing and every subsequent frame is a single drawImage.
    _drawNeRailroads() {
      const segs = this.neRailroads;
      if (!segs || !segs.length) return;
      const ctx = this.ctx;

      // Quantise view state to a coarse key so tiny asymptotic drift during
      // easing doesn't invalidate the cache every frame. ~0.005° ≈ 550 m at
      // the equator — below the width of one Canvas 2D pixel at FBL zooms.
      const q = 0.005;
      const keyLat = Math.round(this.lat0 / q);
      const keyLon = Math.round(this.lon0 / q);
      const keyZoom = Math.round(this.zoom * 1000);
      const key = keyLat + ',' + keyLon + ',' + keyZoom + ',' + this.canvas.width + ',' + this.canvas.height;

      if (!this._neRailCache || this._neRailCacheKey !== key) {
        this._renderNeRailToCache();
        this._neRailCacheKey = key;
      }
      if (this._neRailCache) {
        // Draw the offscreen bitmap into the (already clipped-to-disc) main
        // canvas. Because the offscreen is sized in device pixels we blit at
        // the underlying pixel scale — bypassing the parent DPR transform.
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.drawImage(this._neRailCache, 0, 0);
        ctx.restore();
      }
    }

    // Rasterise the entire rail network into an offscreen canvas at the
    // current projection. Called only when the view key changes.
    _renderNeRailToCache() {
      const segs = this.neRailroads;
      if (!segs || !segs.length) { this._neRailCache = null; return; }
      let off = this._neRailCache;
      if (!off || off.width !== this.canvas.width || off.height !== this.canvas.height) {
        off = document.createElement('canvas');
        off.width = this.canvas.width;
        off.height = this.canvas.height;
        this._neRailCache = off;
      }
      const octx = off.getContext('2d');
      octx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      octx.clearRect(0, 0, this.w, this.h);
      octx.setLineDash([]);
      octx.strokeStyle = this.theme.railBg;
      octx.globalAlpha = 0.35;
      octx.lineWidth = 0.5;
      octx.beginPath();
      for (let s = 0; s < segs.length; s++) {
        const line = segs[s];
        if (!line || line.length < 2) continue;
        let started = false;
        for (let i = 0; i < line.length; i++) {
          const p = this.project(line[i][0], line[i][1]);
          if (!p.vis) { started = false; continue; }
          if (!started) { octx.moveTo(p.x, p.y); started = true; } else octx.lineTo(p.x, p.y);
        }
      }
      octx.stroke();
    }

    // Trans-Manchurian / Trans-Mongolian — context routes drawn in FBL,
    // darker than the Great Wall so the eye reads them as background.
    _drawOtherTransLines() {
      const ctx = this.ctx;
      const entries = this.otherTransLines;
      if (!entries || !entries.length) return;
      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = this.theme.rail;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.9;
      for (const entry of entries) {
        const line = entry.line;
        if (!line || line.length < 2) continue;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < line.length; i++) {
          const p = this.project(line[i][0], line[i][1]);
          if (!p.vis) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // ─── Final Boss Level overlays ─────────────────────────────────
    // Trans-Sib base track — the FULL expected rail geometry, drawn in the
    // same neutral grey used by other context rail lines so it doesn't
    // pre-empt the amber "traversed" colour applied by _drawFblProgress.
    _drawTransSib() {
      const ctx = this.ctx;
      const line = this.transSibLine;
      if (!line || line.length < 2) return;
      ctx.save();
      ctx.setLineDash([]);
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < line.length; i++) {
        const p = this.project(line[i][0], line[i][1]);
        if (!p.vis) { started = false; continue; }
        if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = this.theme.rail;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.9;
      ctx.stroke();
      ctx.restore();
    }

    // Bright "already-traversed" amber overlaid on whichever polyline (Trans-
    // Sib / Trans-Mongolian / Trans-Manchurian) each completed or in-progress
    // leg used. Data comes from `this.fblProgress = { completed: [{polyIdx, iA, iB}], active: {polyIdx, iA, iB, arrow} }`.
    _drawFblProgress() {
      const p = this.fblProgress;
      if (!p) return;
      const ctx = this.ctx, T = this.theme;
      const linesByIdx = i => {
        if (i === 0) return this.transSibLine;
        const others = this.otherTransLines || [];
        return others[i - 1] && others[i - 1].line;
      };

      const stroke = (line, from, to) => {
        if (!line || from == null || to == null) return;
        const lo = Math.min(from, to), hi = Math.max(from, to);
        ctx.beginPath();
        let started = false;
        for (let k = lo; k <= hi; k++) {
          const pr = this.project(line[k][0], line[k][1]);
          if (!pr.vis) { started = false; continue; }
          if (!started) { ctx.moveTo(pr.x, pr.y); started = true; } else ctx.lineTo(pr.x, pr.y);
        }
        ctx.stroke();
      };

      ctx.save();
      ctx.setLineDash([]);
      ctx.strokeStyle = T.accent2;
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.8;
      ctx.shadowColor = T.accent2;
      ctx.shadowBlur = 6;

      (p.completed || []).forEach(seg => {
        stroke(linesByIdx(seg.polyIdx), seg.iA, seg.iB);
      });
      if (p.active && p.active.arrow != null) {
        stroke(linesByIdx(p.active.polyIdx), p.active.iA, p.active.arrow);
      }

      ctx.shadowBlur = 0;
      ctx.restore();
    }

    _drawDivider() {
      const ctx = this.ctx;
      const d = this.divider;
      if (!d || !d.length) return;
      // Accept either a flat array of [lat, lng] pairs (single segment)
      // or an array of segments (each segment being an array of [lat, lng]).
      const segments = (Array.isArray(d[0]) && typeof d[0][0] === 'number')
        ? [d]
        : d;
      ctx.save();
      ctx.setLineDash([4, 6]);
      // Hover (set by final-boss.js via hitTestDivider) lights the whole line
      // amber, matching its tooltip's accent border.
      if (this.dividerNear) {
        ctx.strokeStyle = this.theme.accent2;
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1.8;
        ctx.shadowColor = this.theme.accent2;
        ctx.shadowBlur = 8;
      } else {
        ctx.strokeStyle = this.theme.overlay;
        ctx.globalAlpha = 0.65;
        ctx.lineWidth = 1;
      }
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        if (!seg || seg.length < 2) continue;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < seg.length; i++) {
          const p = this.project(seg[i][0], seg[i][1]);
          if (!p.vis) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // "EUROPE" / "ASIA" labels placed perpendicular to the divide at anchors
    // pinned to fixed points along the line in geo space — so they slide
    // smoothly with the projection instead of snapping in/out on zoom.
    _drawContinentLabels() {
      const anchors = this._continentAnchors;
      if (!anchors || !anchors.length) return;
      const ctx = this.ctx;

      const OFFSET = 14;
      ctx.save();
      ctx.font = 'italic 700 7px "Space Grotesk", "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';

      for (const a of anchors) {
        const p  = this.project(a.lat,  a.lng);
        if (!p.vis) continue;
        const pt = this.project(a.tLat, a.tLng);
        if (!pt.vis) continue;
        const dx = pt.x - p.x, dy = pt.y - p.y;
        const len = Math.hypot(dx, dy);
        if (len < 0.5) continue;

        let angle = Math.atan2(dy, dx);
        if (angle > Math.PI / 2)  angle -= Math.PI;
        if (angle < -Math.PI / 2) angle += Math.PI;

        const pAx = -dy / len, pAy = dx / len;
        const pBx =  dy / len, pBy = -dx / len;
        const scoreA = -pAx - pAy;
        const scoreB = -pBx - pBy;
        const europe = scoreA > scoreB ? [pAx, pAy] : [pBx, pBy];
        const asia   = scoreA > scoreB ? [pBx, pBy] : [pAx, pAy];

        const eX = p.x + europe[0] * OFFSET;
        const eY = p.y + europe[1] * OFFSET;
        const aX = p.x + asia[0]   * OFFSET;
        const aY = p.y + asia[1]   * OFFSET;

        const drawLabel = (text, x, y) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(angle);
          ctx.strokeStyle = this.theme.halo;
          ctx.lineWidth = 1.5;
          ctx.strokeText(text, 0, 0);
          // Follow the line's hover state so the whole divide reads as one object.
          ctx.fillStyle = this.dividerNear ? this.theme.accent2 : (this.theme.text || '#c4d4df');
          ctx.globalAlpha = 0.9;
          ctx.fillText(text, 0, 0);
          ctx.globalAlpha = 1;
          ctx.restore();
        };
        drawLabel('EUROPE', eX, eY);
        drawLabel('ASIA',   aX, aY);
      }
      ctx.restore();
    }

    _drawGreatWall() {
      const ctx = this.ctx;
      const segments = this.greatWallLines;
      if (!segments || !segments.length) return;
      ctx.save();
      ctx.setLineDash([]);
      // Same muted style as the Asia-Europe divider so both read as
      // conceptual overlays rather than travel routes.
      ctx.strokeStyle = this.theme.overlay;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 1;
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        if (!seg || seg.length < 2) continue;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < seg.length; i++) {
          const p = this.project(seg[i][0], seg[i][1]);
          if (!p.vis) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Single "THE GREAT WALL OF CHINA" caption at the longest chain's midpoint.
    _drawGreatWallLabel() {
      const a = this._greatWallAnchor;
      if (!a) return;
      const p  = this.project(a.lat,  a.lng);
      if (!p.vis) return;
      // Tangent from the chain's overall start → end direction (stable).
      const ps = this.project(a.sLat, a.sLng);
      const pe = this.project(a.tLat, a.tLng);
      if (!ps.vis || !pe.vis) return;
      const dx = pe.x - ps.x, dy = pe.y - ps.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return;

      let angle = Math.atan2(dy, dx);
      if (angle > Math.PI / 2)  angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;

      // Perpendicular offset — label south of the (roughly E-W) wall
      const nx = -dy / len, ny = dx / len;
      const perp = (ny > 0) ? [nx, ny] : [-nx, -ny];
      const OFFSET = 22;
      const x = p.x + perp[0] * OFFSET;
      const y = p.y + perp[1] * OFFSET;

      const ctx = this.ctx;
      ctx.save();
      ctx.font = 'italic 700 14px "Space Grotesk", "DM Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.strokeStyle = this.theme.halo;
      ctx.lineWidth = 3;
      ctx.strokeText('THE GREAT WALL OF CHINA', 0, 0);
      ctx.fillStyle = this.theme.text || '#c4d4df';
      ctx.globalAlpha = 0.9;
      ctx.fillText('THE GREAT WALL OF CHINA', 0, 0);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    _drawGreatWallPasses() {
      const ctx = this.ctx, T = this.theme;
      const passes = this.greatWallPasses;
      for (let i = 0; i < passes.length; i++) {
        const s = passes[i];
        const p = this.project(s.lat, s.lng);
        s._sx = p.x; s._sy = p.y; s._vis = p.vis;
        if (!p.vis) continue;
        const hovered = (this.hoveredPassIdx === i);
        ctx.beginPath();
        ctx.arc(p.x, p.y, hovered ? 2.6 : 1.4, 0, 7);
        ctx.fillStyle = T.accent;
        ctx.shadowColor = T.accent;
        ctx.shadowBlur = (hovered ? 10 : 4) * T.glowScale;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }

    hitTestGreatWallPass(sx, sy) {
      const passes = this.greatWallPasses;
      if (!passes || !passes.length) return null;
      let best = null, bestD2 = 8 * 8;
      for (let i = 0; i < passes.length; i++) {
        const s = passes[i];
        if (!s._vis) continue;
        const dx = s._sx - sx, dy = s._sy - sy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
      return best;
    }

    // Returns true if screen point (sx, sy) is within `tol` pixels of any
    // divider segment. Used for hover tooltip on the Asia-Europe line.
    hitTestDivider(sx, sy, tol) {
      const d = this.divider;
      if (!d || !d.length) return false;
      const segments = (Array.isArray(d[0]) && typeof d[0][0] === 'number') ? [d] : d;
      const T = (tol != null ? tol : 6);
      const T2 = T * T;
      for (const seg of segments) {
        if (!seg || seg.length < 2) continue;
        let prev = null;
        for (let i = 0; i < seg.length; i++) {
          const p = this.project(seg[i][0], seg[i][1]);
          if (!p.vis) { prev = null; continue; }
          if (prev) {
            // Distance from point (sx, sy) to segment (prev, p)
            const ax = prev.x, ay = prev.y, bx = p.x, by = p.y;
            const dx = bx - ax, dy = by - ay;
            const len2 = dx * dx + dy * dy;
            if (len2 > 0) {
              let t = ((sx - ax) * dx + (sy - ay) * dy) / len2;
              t = Math.max(0, Math.min(1, t));
              const px = ax + dx * t, py = ay + dy * t;
              const ex = sx - px, ey = sy - py;
              if (ex * ex + ey * ey <= T2) return true;
            }
          }
          prev = p;
        }
      }
      return false;
    }

    // Trans-Sib station pins — match normal visited-airport styling (green accent).
    _drawTransSibStops() {
      const ctx = this.ctx, T = this.theme;
      const stops = this.transSibStops;
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        const p = this.project(s.lat, s.lng);
        s._sx = p.x; s._sy = p.y; s._vis = p.vis;
        if (!p.vis) continue;
        const hovered = (this.hoveredStopIdx === i);
        ctx.beginPath();
        ctx.arc(p.x, p.y, hovered ? 3.6 : 2.6, 0, 7);
        ctx.fillStyle = T.accent;
        ctx.shadowColor = T.accent;
        ctx.shadowBlur = (hovered ? 14 : 8) * T.glowScale;
        ctx.fill();
        ctx.shadowBlur = 0;

        if (hovered) {
          ctx.fillStyle = T.text;
          ctx.font = 'bold 10px "IBM Plex Mono", monospace';
          ctx.fillText(s.name || '', p.x + 7, p.y - 5);
        }
      }
    }

    // Returns index of Trans-Sib stop under screen point (sx, sy), or null.
    hitTestTransSibStop(sx, sy) {
      const stops = this.transSibStops;
      if (!stops || !stops.length) return null;
      let best = null, bestD2 = 12 * 12; // 12 px radius
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        if (!s._vis) continue;
        const dx = s._sx - sx, dy = s._sy - sy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = i; }
      }
      return best;
    }

    _drawRings() {
      const ctx = this.ctx, T = this.theme;
      ctx.strokeStyle = T.ring; ctx.lineWidth = 1;
      const fracs = [0.25, 0.5, 0.75, 1];
      ctx.font = '9px "IBM Plex Mono", monospace';
      ctx.fillStyle = T.dim; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const fr of fracs) {
        const r = this.radius * fr;
        ctx.globalAlpha = fr === 1 ? 0.85 : 0.4;
        ctx.beginPath(); ctx.arc(this.cx, this.cy, r, 0, 7); ctx.stroke();
        const ang = Math.asin(Math.min(1, fr * 0.999)) * R2D;
        const km = Math.round(ang * 111.32 / 50) * 50;
        ctx.globalAlpha = 0.6;
        ctx.fillText(km + 'km', this.cx + 4, this.cy - r + 8);
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = T.ring; ctx.globalAlpha = 0.5; ctx.beginPath();
      ctx.moveTo(this.cx - this.radius, this.cy); ctx.lineTo(this.cx + this.radius, this.cy);
      ctx.moveTo(this.cx, this.cy - this.radius); ctx.lineTo(this.cx, this.cy + this.radius);
      ctx.stroke(); ctx.globalAlpha = 1;
    }

    _drawCompass() {
      const ctx = this.ctx, T = this.theme;
      const rr = this.radius + 14;
      ctx.strokeStyle = T.ring; ctx.fillStyle = T.dim;
      ctx.font = '10px "IBM Plex Mono", monospace';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let a = 0; a < 360; a += 5) {
        const rad = (a - 90) * D2R;
        const big = a % 30 === 0;
        const r1 = this.radius + 4, r2 = this.radius + (big ? 12 : 8);
        ctx.globalAlpha = big ? 0.85 : 0.4;
        ctx.lineWidth = big ? 1.3 : 0.8;
        ctx.beginPath();
        ctx.moveTo(this.cx + Math.cos(rad) * r1, this.cy + Math.sin(rad) * r1);
        ctx.lineTo(this.cx + Math.cos(rad) * r2, this.cy + Math.sin(rad) * r2);
        ctx.stroke();
        if (big) {
          ctx.globalAlpha = 0.75;
          const lbl = a === 0 ? 'N' : a === 90 ? 'E' : a === 180 ? 'S' : a === 270 ? 'W' : String(a).padStart(3, '0');
          ctx.fillStyle = (a % 90 === 0) ? T.accent : T.dim;
          ctx.fillText(lbl, this.cx + Math.cos(rad) * rr, this.cy + Math.sin(rad) * rr);
        }
      }
      ctx.globalAlpha = 1;
    }

    _drawLeaderTag() {
      if (!this.tag || !this._blipScreen) return;
      const ctx = this.ctx, T = this.theme, p = this._blipScreen;
      const tagAccent = (this.blip && this.blip.surface) ? T.accent2 : T.accent;
      const lines = this.tag.lines;
      ctx.font = '11px "IBM Plex Mono", monospace';
      let wmax = 0;
      lines.forEach(l => { wmax = Math.max(wmax, ctx.measureText(l.t).width); });
      const padX = 8, padY = 6, lh = 14;
      const boxW = wmax + padX * 2, boxH = lines.length * lh + padY * 2;
      let ox = p.x + 26, oy = p.y - boxH - 18;
      if (ox + boxW > this.w - 8) ox = p.x - boxW - 26;
      if (oy < 8) oy = p.y + 18;
      ctx.strokeStyle = tagAccent; ctx.lineWidth = 1; ctx.globalAlpha = 0.9;
      ctx.beginPath(); ctx.moveTo(p.x, p.y);
      ctx.lineTo(ox < p.x ? ox + boxW : ox, oy + boxH / 2); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = this._shade(T.ocean, 6) + 'f0';
      ctx.strokeStyle = tagAccent; ctx.lineWidth = 1;
      this._roundRect(ox, oy, boxW, boxH, 3); ctx.fill(); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      lines.forEach((l, i) => {
        ctx.fillStyle = l.c === 'accent' ? T.accent : l.c === 'blip' ? tagAccent : l.c === 'dim' ? T.dim : T.text;
        ctx.font = (l.b ? 'bold ' : '') + '11px "IBM Plex Mono", monospace';
        ctx.fillText(l.t, ox + padX, oy + padY + i * lh + lh / 2);
      });
    }

    _roundRect(x, y, w, h, r) {
      const ctx = this.ctx;
      ctx.beginPath();
      ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
    }

    _shade(hex, pct) {
      hex = (hex || '#000').replace('#', '');
      if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
      let r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
      const f = pct / 100;
      r = Math.round(Math.max(0, Math.min(255, r + 255 * f)));
      g = Math.round(Math.max(0, Math.min(255, g + 255 * f)));
      b = Math.round(Math.max(0, Math.min(255, b + 255 * f)));
      return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
    }
  }

  window.ATCScope = Scope;
  window.ATCgeo = { toVec, slerp, vecToLatLng };
})();
