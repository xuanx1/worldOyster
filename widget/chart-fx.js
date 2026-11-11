// CHART FX — chart effects in the spirit of bklit.com's line-chart variants,
// rebuilt as one Chart.js plugin (bklit itself is React + shadcn + Tailwind,
// which this static page doesn't use). Each effect is opt-in per chart:
//
//   options.plugins.atcFx = {
//     pattern:   true,              // diagonal hatch instead of grid lines
//     sweep:     true,              // skeleton line + shimmer while there is no data
//     crosshair: true,              // vertical guide + ringed points on hover
//     reveal:    true               // new points sweep in left→right instead of snapping
//   }
//
// Colours are never hard-coded per theme here: series effects use the series'
// own colour, and chrome (hatch, skeleton, crosshair) follows the light/dark
// state that atc-theme.js toggles — so every effect matches dark, light and
// J2L III exactly as the charts themselves do.
(function () {
  'use strict';
  if (!window.Chart) return;

  const reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const isLight = () => document.body.classList.contains('atc-light');

  // Chrome colours, matched to atc-theme.js's chart palette.
  const chrome = () => isLight()
    ? { hatch: 'rgba(17,27,36,0.075)', skeleton: 'rgba(17,27,36,0.10)', shimmer: 'rgba(17,27,36,0.32)', sweep: 'rgba(17,27,36,0.05)', cross: 'rgba(17,27,36,0.38)', ringFill: '#ffffff' }
    : { hatch: 'rgba(255,255,255,0.045)', skeleton: 'rgba(255,255,255,0.08)', shimmer: 'rgba(127,224,145,0.45)', sweep: 'rgba(127,224,145,0.05)', cross: 'rgba(255,255,255,0.32)', ringFill: '#070b10' };

  // '#4CAF50' / 'rgb(…)' → 'rgba(r,g,b,a)'
  function withAlpha(c, a) {
    if (typeof c !== 'string') return `rgba(127,127,127,${a})`;
    let m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.split('').map(x => x + x).join('');
      const n = parseInt(h, 16);
      return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
    }
    m = c.match(/^rgba?\(([^)]+)\)$/i);
    if (m) {
      const p = m[1].split(',').map(s => s.trim());
      return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
    }
    return c;
  }

  // Visible index window of the category x-axis (follows the range filters).
  function windowOf(chart) {
    const x = chart.scales.x;
    const n = (chart.data.labels || []).length;
    const lo = Math.max(0, Math.floor(x && Number.isFinite(x.min) ? x.min : 0));
    const hi = Math.min(n - 1, Math.ceil(x && Number.isFinite(x.max) ? x.max : n - 1));
    return { lo, hi };
  }

  function visibleValues(chart, ds, lo, hi) {
    const out = [];
    for (let i = lo; i <= hi; i++) {
      const v = ds.data[i];
      if (v != null && Number.isFinite(+v)) out.push([i, +v]);
    }
    return out;
  }

  function hasData(chart) {
    return (chart.data.datasets || []).some(ds => {
      let n = 0;
      for (const v of ds.data || []) if (v != null && ++n >= 2) return true;
      return false;
    });
  }

  /* ---------- pattern background ---------- */

  const patternCache = new Map();
  function hatchPattern(ctx, color) {
    const key = color;
    if (patternCache.has(key)) return patternCache.get(key);
    const s = 7;
    const c = document.createElement('canvas');
    c.width = c.height = s;
    const g = c.getContext('2d');
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.beginPath();
    // one diagonal per tile, plus the corners so tiles join seamlessly
    g.moveTo(-1, s + 1); g.lineTo(s + 1, -1);
    g.moveTo(-1, 1); g.lineTo(1, -1);
    g.moveTo(s - 1, s + 1); g.lineTo(s + 1, s - 1);
    g.stroke();
    const p = ctx.createPattern(c, 'repeat');
    patternCache.set(key, p);
    return p;
  }

  function drawPattern(chart) {
    const { ctx, chartArea: a } = chart;
    if (!a) return;
    const col = chrome();
    ctx.save();
    ctx.fillStyle = hatchPattern(ctx, col.hatch);
    ctx.fillRect(a.left, a.top, a.right - a.left, a.bottom - a.top);
    // soft fade towards the top so the hatch never fights the legend
    const g = ctx.createLinearGradient(0, a.top, 0, a.top + 28);
    g.addColorStop(0, isLight() ? 'rgba(255,255,255,0.9)' : 'rgba(7,11,16,0.85)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = g;
    ctx.fillRect(a.left, a.top, a.right - a.left, 28);
    ctx.restore();
  }

  /* ---------- loading sweep ---------- */

  function drawSweep(chart, now) {
    const { ctx, chartArea: a } = chart;
    if (!a) return;
    const col = chrome();
    const w = a.right - a.left, h = a.bottom - a.top;
    // A deterministic skeleton line, shaped like the charts' spiky series.
    const N = 48;
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const y = 0.62 + 0.16 * Math.sin(t * 9.5) * Math.cos(t * 3.1) - 0.22 * Math.max(0, Math.sin(t * 23)) * (i % 5 === 0 ? 1 : 0.25);
      pts.push([a.left + t * w, a.top + Math.max(0.12, Math.min(0.92, y)) * h]);
    }
    const trace = () => {
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    };
    ctx.save();
    ctx.beginPath();
    ctx.rect(a.left, a.top, w, h);
    ctx.clip();
    // base skeleton
    ctx.lineWidth = 1.4;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = col.skeleton;
    trace(); ctx.stroke();
    if (!reducedMotion) {
      // diagonal shimmer band travelling left → right
      const period = 1700;
      const k = (now % period) / period;
      const span = w + h;
      const cx = a.left - h + k * (span + h);
      const band = Math.max(60, w * 0.22);
      const g = ctx.createLinearGradient(cx - band, a.bottom, cx + band - h * 0.6, a.top);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, col.shimmer);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.8;
      trace(); ctx.stroke();
      const f = ctx.createLinearGradient(cx - band, a.bottom, cx + band - h * 0.6, a.top);
      f.addColorStop(0, 'rgba(0,0,0,0)');
      f.addColorStop(0.5, col.sweep);
      f.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = f;
      ctx.fillRect(a.left, a.top, w, h);
    }
    ctx.restore();
  }

  // While a chart is waiting for data, redraw it each frame for the shimmer.
  // One loop per chart. The draw inside step() runs the plugin's draw hooks,
  // which call ensureSweepLoop again — so the handle stays non-zero for the
  // whole step, or every frame would schedule an extra loop and the loops
  // would double each frame until the page froze.
  function ensureSweepLoop(chart) {
    if (reducedMotion || chart.$atcSweepRaf) return;
    const step = () => {
      chart.$atcSweepRaf = -1;                 // running: draws below must not start another
      if (!chart.canvas || !chart.canvas.isConnected) { chart.$atcSweepRaf = 0; return; }
      const loading = !hasData(chart);
      try { chart.draw(); } catch (e) { chart.$atcSweepRaf = 0; return; }
      chart.$atcSweepRaf = loading ? requestAnimationFrame(step) : 0;
    };
    chart.$atcSweepRaf = requestAnimationFrame(step);
  }

  function lastIndexWithValue(ds) {
    for (let i = ds.data.length - 1; i >= 0; i--) {
      const v = ds.data[i];
      if (v != null && Number.isFinite(+v)) return i;
    }
    return -1;
  }

  /* ---------- hover crosshair ---------- */

  function drawCrosshair(chart) {
    const { ctx, chartArea: a } = chart;
    const act = chart.getActiveElements ? chart.getActiveElements() : [];
    if (!a || !act.length) return;
    const col = chrome();
    const xPix = act[0].element.x;
    if (!Number.isFinite(xPix)) return;
    ctx.save();
    ctx.strokeStyle = col.cross;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(Math.round(xPix) + 0.5, a.top);
    ctx.lineTo(Math.round(xPix) + 0.5, a.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    act.forEach(({ datasetIndex, element }) => {
      const ds = chart.data.datasets[datasetIndex];
      if (!ds || !Number.isFinite(element.y)) return;
      ctx.beginPath();
      ctx.arc(element.x, element.y, 4.2, 0, Math.PI * 2);
      ctx.fillStyle = col.ringFill;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = ds.borderColor;
      ctx.stroke();
    });
    ctx.restore();
  }

  /* ---------- reveal (new points sweep in) ---------- */

  // When points are appended, the newest stretch of line (and its fill) is
  // uncovered left→right by clipping the dataset drawing, redrawn with
  // chart.draw() each frame — no re-layout, no per-point animation state, so
  // it stays cheap on 1,000+ point charts (Chart.js's own animated update is
  // what was switched off for being too heavy). If points arrive faster than
  // a sweep lasts, the next sweep starts from wherever the current one is.
  const REVEAL_MS = 420;
  const easeOut = t => 1 - Math.pow(1 - t, 3);

  function lastIndexAll(chart) {
    let m = -1;
    (chart.data.datasets || []).forEach(ds => { m = Math.max(m, lastIndexWithValue(ds)); });
    return m;
  }

  function revealX(chart, now) {
    const r = chart.$atcReveal;
    if (!r) return null;
    const k = Math.min(1, (now - r.t0) / r.dur);
    return { x: r.fromX + (r.toX - r.fromX) * easeOut(k), done: k >= 1 };
  }

  function startReveal(chart) {
    const x = chart.scales.x;
    const n = lastIndexAll(chart);
    const prevN = chart.$atcRevealN;
    chart.$atcRevealN = n;
    if (!x || prevN == null || n <= prevN || prevN < 0 || reducedMotion) return;
    const toX = x.getPixelForValue(n);
    // Continue from the sweep in flight, re-mapped to the new layout.
    const now = performance.now();
    const cur = revealX(chart, now);
    let fromX = x.getPixelForValue(prevN);
    if (cur && !cur.done && chart.$atcReveal) {
      const r = chart.$atcReveal;
      const frac = (r.toX - r.fromX) ? (cur.x - r.fromX) / (r.toX - r.fromX) : 1;
      fromX = x.getPixelForValue(r.fromN + (prevN - r.fromN) * frac);
    }
    if (!Number.isFinite(fromX) || !Number.isFinite(toX) || toX - fromX < 1) return;
    const since = chart.$atcRevealLast ? now - chart.$atcRevealLast : Infinity;
    chart.$atcRevealLast = now;
    const dur = Math.max(120, Math.min(REVEAL_MS, since * 0.9));
    chart.$atcReveal = { fromX, toX, fromN: prevN, t0: now, dur };
    if (!chart.$atcRevealRaf) {
      const step = () => {
        chart.$atcRevealRaf = 0;
        const c = revealX(chart, performance.now());
        if (!chart.canvas || !chart.canvas.isConnected || !c) return;
        try { chart.draw(); } catch (e) { return; }
        if (c.done) { chart.$atcReveal = null; try { chart.draw(); } catch (e) { /* torn down */ } return; }
        chart.$atcRevealRaf = requestAnimationFrame(step);
      };
      chart.$atcRevealRaf = requestAnimationFrame(step);
    }
  }

  /* ---------- plugin ---------- */

  window.Chart.register({
    id: 'atcFx',
    beforeUpdate(chart, args, o) {
      // The hatch replaces the in-plot grid lines (axis ticks stay).
      if (o && o.pattern) {
        Object.values(chart.options.scales || {}).forEach(s => { if (s && s.grid) s.grid.drawOnChartArea = false; });
      }
    },
    beforeDatasetsDraw(chart, args, o) {
      if (!o) return;
      if (o.pattern) drawPattern(chart);
      // Reveal: clip the series (lines, fill, points) to the sweep front.
      const rv = o.reveal && chart.$atcReveal && revealX(chart, performance.now());
      if (rv && !rv.done && chart.chartArea) {
        const a = chart.chartArea;
        chart.ctx.save();
        chart.ctx.beginPath();
        chart.ctx.rect(a.left - 4, a.top - 8, Math.max(0, rv.x - a.left + 4), a.bottom - a.top + 16);
        chart.ctx.clip();
        chart.$atcClipped = true;
      }
    },
    afterDatasetsDraw(chart, args, o) {
      if (chart.$atcClipped) { chart.ctx.restore(); chart.$atcClipped = false; }
      if (!o) return;
      if (o.sweep && !hasData(chart)) {
        drawSweep(chart, performance.now());
        ensureSweepLoop(chart);
        return;
      }
      if (o.crosshair) drawCrosshair(chart);
    },
    afterEvent(chart, args, o) {
      // Clear the crosshair as soon as the pointer leaves the plot.
      if (o && o.crosshair && args.event && args.event.type === 'mouseout') args.changed = true;
    },
    afterUpdate(chart, args, o) {
      if (o && o.sweep && !hasData(chart)) ensureSweepLoop(chart);
      if (o && o.reveal) startReveal(chart);
    }
  });

  window._atcChartFx = { hasData };
})();
