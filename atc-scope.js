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
      this._resize();
      window.addEventListener('resize', () => this._resize());
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
        text:         g('--atc-text')          || '#c4d4df'
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
    }
    zoomBy(factor) { this.setZoom(this.zoom * factor); }

    async loadCoast(url) {
      const gj = await (await fetch(url)).json();
      const polys = [];
      for (const f of gj.features) {
        const g = f.geometry; if (!g) continue;
        const push = coords => polys.push(coords);
        if (g.type === 'Polygon') g.coordinates.forEach(push);
        else if (g.type === 'MultiPolygon') g.coordinates.forEach(p => p.forEach(push));
      }
      this.coast = polys;
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
      if (this.showRoutes) this._drawRoutes();
      this._drawAirports();
      this._drawBlip();
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

    _drawCoast() {
      if (!this.coast) return;
      const ctx = this.ctx;
      ctx.fillStyle = this.theme.land;
      ctx.strokeStyle = this.theme.coast;
      ctx.lineWidth = 1;
      ctx.lineJoin = 'round';
      for (const ring of this.coast) {
        ctx.beginPath(); let started = false, drew = false;
        for (let i = 0; i < ring.length; i++) {
          const p = this.project(ring[i][1], ring[i][0]);
          if (!p.vis) { started = false; continue; }
          if (!started) { ctx.moveTo(p.x, p.y); started = true; } else { ctx.lineTo(p.x, p.y); drew = true; }
        }
        if (drew) { ctx.fill(); ctx.stroke(); }
      }
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
        ctx.shadowBlur = 18;
        ctx.stroke();
      } else {
        tracePath();
        // Surface (land) legs draw as a SOLID orange line; air legs
        // keep the green tones. No dashes anywhere.
        ctx.setLineDash([]);
        if (active) {
          ctx.strokeStyle = surface ? this.theme.accent2 : this.theme.routeActive;
          ctx.lineWidth = 1.8;
          ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 10;
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
          ctx.shadowColor = T.accent2; ctx.shadowBlur = 10;
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
          ctx.shadowColor = T.accent; ctx.shadowBlur = 6 + g * 18;
          ctx.fill();
          ctx.shadowBlur = 0;
        } else {
          if (g > 0.02) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.4 + g * 6, 0, 7);
            ctx.fillStyle = T.accent;
            ctx.globalAlpha = g * 0.18;
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, 7);
          ctx.fillStyle = T.faint || T.dim;
          ctx.globalAlpha = 0.6 + g * 0.4;
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
        ctx.shadowColor = col; ctx.shadowBlur = 16;
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
          ctx.fillStyle = 'rgba(0,0,0,0.75)';
          ctx.fillRect(p.x - tw / 2 - 4, p.y - 24, tw + 8, 14);
          ctx.fillStyle = col;
          ctx.fillText(label, p.x, p.y - 12);
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        }
      });
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
      ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14;
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
