// ATC THEME — dark (default) / light toggle.
//
// Dark has always been the default and stays the default; light is opt-in and
// remembered in localStorage. The swap has four moving parts:
//
//   1. `atc-light` on <body> + `atc-light-root` on <html> — the CSS palette
//      in atc-light.css keys off these.
//   2. `atc-theming` on <body> for the length of the swap, which turns on a
//      transition for every colour property (see the bottom of atc-light.css)
//      so the palettes crossfade rather than cut. Removed afterwards so it
//      never interferes with the UI's own hover transitions.
//   3. The scope canvas re-reads its palette from CSS vars (refreshTheme).
//   4. The backdrop shader eases its u_light uniform over the same window.
//
// Chart.js is re-themed too — its colours are baked into each chart's options
// at construction, so they have to be walked and updated by hand.
(function () {
  'use strict';

  const KEY = 'atc-theme';
  const DURATION = 650;                 // keep in sync with --atc-theme-ms
  let timer = null;

  /* ---------- leaflet basemaps ----------
     Four call sites (the main map plus the choropleth and two neighbour
     mini-maps) each hardcode CartoDB's `dark_nolabels` tiles. Rather than
     edit all four — and rather than filter the tiles, which muddies the
     colours — every TileLayer registers itself here at construction and
     the URL is swapped for CartoDB's matching `light_nolabels` set.
     The patch is installed at script-execution time, before any map is
     built, so nothing is missed. */
  const tileLayers = new Set();
  (function patchTileLayer() {
    const L = window.L;
    if (!L || !L.TileLayer || L.TileLayer.prototype.__atcThemed) return;
    const orig = L.TileLayer.prototype.initialize;
    L.TileLayer.prototype.initialize = function () {
      orig.apply(this, arguments);
      try {
        tileLayers.add(this);
        // Widget mini-maps are built lazily, i.e. after the theme has
        // already been applied. Rewrite the URL before the first tile is
        // ever requested, so a map created while light mode is on never
        // flashes the dark basemap.
        if (document.body && document.body.classList.contains('atc-light') &&
            typeof this._url === 'string' && this._url.indexOf('dark_nolabels') !== -1) {
          this._url = this._url.split('dark_nolabels').join('light_nolabels');
        }
      } catch (e) { /* non-extensible, ignore */ }
    };
    L.TileLayer.prototype.__atcThemed = true;
  })();

  function syncTiles(light) {
    const from = light ? 'dark_nolabels' : 'light_nolabels';
    const to   = light ? 'light_nolabels' : 'dark_nolabels';
    tileLayers.forEach(layer => {
      try {
        const url = layer._url;
        if (typeof url === 'string' && url.indexOf(from) !== -1) {
          layer.setUrl(url.split(from).join(to));
        }
      } catch (e) { /* layer removed from its map mid-swap */ }
    });
  }

  function isLight() {
    return document.body.classList.contains('atc-light');
  }

  function applyChartColours(light) {
    const Chart = window.Chart;
    if (!Chart) return;
    const text = light ? '#38454f' : '#b6b6b6';
    const grid = light ? 'rgba(17,27,36,0.08)' : '#1e1e1e09';
    // Chart.instances is the registry in v2/v3; v4 exposes getChart(canvas).
    // Try both so this works whichever build is vendored.
    let charts = Chart.instances ? Object.values(Chart.instances) : [];
    if (!charts.length && typeof Chart.getChart === 'function') {
      charts = Array.prototype.map.call(document.querySelectorAll('canvas'), c => Chart.getChart(c))
                    .filter(Boolean);
    }
    charts.forEach(c => {
      try {
        const o = c.options || {};
        if (o.plugins && o.plugins.legend && o.plugins.legend.labels) {
          o.plugins.legend.labels.color = text;
        }
        Object.values(o.scales || {}).forEach(sc => {
          // Only plain colours. The leg/price charts give their x-axis grid a
          // scriptable colour (xGridColor in animated-flight-map.js) that
          // thins the lines and picks its own theme tone — overwriting it
          // with a string would restore the dense grid on every toggle.
          if (sc.grid && typeof sc.grid.color === 'string') sc.grid.color = grid;
          // Axis ticks that were plain grey follow the ramp; coloured ticks
          // (the green/orange value axes) are left alone — they are data
          // encodings, not chrome.
          if (sc.ticks && /^#(b6b6b6|999|ccc|fff)/i.test(String(sc.ticks.color || ''))) {
            sc.ticks.color = text;
          }
        });
        c.update('none');
      } catch (e) { /* a chart mid-teardown is not worth throwing over */ }
    });
  }

  function apply(light, opts) {
    const snap = !!(opts && opts.snap);
    const body = document.body;
    const root = document.documentElement;

    if (!snap) {
      body.classList.add('atc-theming');
      clearTimeout(timer);
      timer = setTimeout(() => body.classList.remove('atc-theming'), DURATION + 60);
    }

    body.classList.toggle('atc-light', light);
    root.classList.toggle('atc-light-root', light);

    // Scope canvas: vars have changed, so make it re-read them. The render
    // loop redraws every frame, so nothing else is needed.
    const scope = window._atcScope;
    if (scope && scope.refreshTheme) scope.refreshTheme();

    if (window._atcBg && window._atcBg.setLight) window._atcBg.setLight(light, snap);

    applyChartColours(light);
    syncTiles(light);
    syncButton(light);
    try { localStorage.setItem(KEY, light ? 'light' : 'dark'); } catch (e) { /* private mode */ }
    window.dispatchEvent(new CustomEvent('atc-theme-change', { detail: { light } }));
  }

  /* ---------- toggle button ---------- */
  const SUN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">'
            + '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.4M12 19.6V22M2 12h2.4M19.6 12H22'
            + 'M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M19.1 4.9l-1.7 1.7M6.6 17.4l-1.7 1.7"/></svg>';
  const MOON = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
             + '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2z"/></svg>';

  function syncButton(light) {
    const btn = document.getElementById('atcThemeBtn');
    if (!btn) return;
    // Show the mode you would switch TO, which is the convention users expect.
    btn.innerHTML = (light ? MOON : SUN) + '<span class="atc-pb-lbl">' + (light ? 'DARK' : 'LIGHT') + '</span>';
    btn.title = light ? 'Switch to dark mode' : 'Switch to light mode';
    btn.setAttribute('aria-pressed', String(light));
  }

  function buildButton() {
    if (document.getElementById('atcThemeBtn')) return true;
    const bar = document.querySelector('.atc-playbar');
    if (!bar) return false;
    const btn = document.createElement('button');
    btn.id = 'atcThemeBtn';
    btn.className = 'atc-pb-btn atc-pb-theme';
    btn.type = 'button';
    btn.addEventListener('click', () => apply(!isLight()));
    bar.appendChild(btn);
    syncButton(isLight());
    return true;
  }

  /* ---------- scroll hint ----------
     The bottom-centre mouse indicator from knight-l.github.io/sc-datav's
     index page, same position and same 1.5s dropping-dot animation. Its
     stroke/fill are currentColor, so it follows whichever theme is active. */
  function buildScrollHint() {
    if (document.querySelector('.atc-scroll-hint')) return;
    const el = document.createElement('div');
    el.className = 'atc-scroll-hint';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML =
      '<svg width="20" height="32.5" viewBox="0 0 40 65">' +
        '<rect x="2.5" y="2.5" width="35" height="60" rx="17.5" ry="17.5"' +
             ' fill="none" stroke="currentColor" stroke-width="3"/>' +
        '<circle class="atc-scroll-dot" cx="20" cy="15" r="3" fill="currentColor"/>' +
      '</svg>';
    document.body.appendChild(el);
  }

  function init() {
    let saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
    // Light is the default now; only an explicit 'dark' opts out. Anyone who
    // toggled to dark earlier keeps dark, since that is a stored preference.
    apply(saved !== 'dark', { snap: true });

    buildScrollHint();

    // The playbar is built by atc-skin.js after flightMap initialises, so
    // retry briefly rather than assuming it already exists.
    if (!buildButton()) {
      let tries = 0;
      const t = setInterval(() => {
        if (buildButton() || ++tries > 40) clearInterval(t);
      }, 250);
    }

    window._atcTheme = {
      get light() { return isLight(); },
      set: v => apply(!!v),
      toggle: () => apply(!isLight())
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
