/* ============================================================
   PDF report exporter — parametric-olfa-style spec sheet
   Multi-page A4 PDF with a cover, key statistics, journey map
   snapshot, dashboard charts and an exhaustive city / country
   list. Uses jsPDF (UMD) + html2canvas, both loaded as deferred
   scripts from animated-flight-map.html.

   Wired to the existing #exportButton; the original JSON export
   path stays intact as a fallback if jsPDF fails to load.
   ============================================================ */
(function () {
  'use strict';

  // ─── theme ───────────────────────────────────────────────────
  const C_BG       = [10, 14, 20];
  const C_PANEL    = [16, 22, 30];
  const C_TEXT     = [220, 230, 235];
  const C_DIM      = [120, 140, 152];
  const C_ACCENT   = [76, 175, 80];           // brand green
  const C_ACCENT2  = [244, 161, 60];          // surface amber
  const C_RULE     = [42, 60, 78];
  let   FONT       = 'helvetica';  // upgraded to 'SegoeUI' once the
                                   // local TTFs are loaded into jsPDF

  // ─── page geometry (A4 portrait, mm) ─────────────────────────
  const W = 210, H = 297;
  const MARGIN = 14;
  const CONTENT_W = W - MARGIN * 2;

  // ─── utilities ───────────────────────────────────────────────
  const t = (k) => (window.i18n && window.i18n.t) ? window.i18n.t(k) : k;
  const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
  const fmtDate = (d) => {
    if (!d) return '';
    const x = new Date(d);
    if (isNaN(x)) return '';
    return x.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // ─── inline progress (attached to the export button) ─────────
  // No modal, no backdrop. A thin green meter sits underneath the
  // export button and the button label updates to "12% map…". The
  // user can keep panning, zooming and clicking the viz while the
  // PDF is being assembled.
  function buildProgressUI(onCancel) {
    const btn = document.getElementById('exportButton');
    if (!btn) return null;

    // Stash the original button content (HTML) once so we can put
    // it back when the export finishes.
    if (btn.dataset.atcOriginalHtml == null) {
      btn.dataset.atcOriginalHtml = btn.innerHTML;
    }

    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';

    // Replace the button's content with a label span + cancel button +
    // bar div so we can update each independently.
    btn.innerHTML = '';
    const label = document.createElement('span');
    label.className = 'atc-rp-label';
    label.textContent = 'preparing…';
    btn.appendChild(label);

    const cancel = document.createElement('button');
    cancel.className = 'atc-rp-cancel';
    cancel.type = 'button';
    cancel.title = 'Cancel export';
    cancel.textContent = '✕';
    cancel.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof onCancel === 'function') onCancel();
    });
    btn.appendChild(cancel);

    const bar = document.createElement('div');
    bar.id = 'atcReportProgressBar';
    bar.innerHTML = `<div class="atc-rp-fill"></div>`;
    btn.appendChild(bar);

    if (!document.getElementById('atcReportProgressStyle')) {
      const style = document.createElement('style');
      style.id = 'atcReportProgressStyle';
      style.textContent = `
        #exportButton .atc-rp-label {
          display: inline-block;
          font-variant-numeric: tabular-nums;
        }
        #exportButton .atc-rp-cancel {
          display: inline-block;
          margin-left: 8px;
          padding: 0 6px;
          font-size: 11px;
          line-height: 1.2;
          color: #c4d4df;
          background: rgba(255, 80, 80, 0.18);
          border: 1px solid rgba(255, 80, 80, 0.6);
          border-radius: 3px;
          cursor: pointer;
        }
        #exportButton .atc-rp-cancel:hover {
          background: rgba(255, 80, 80, 0.32);
          color: #ffffff;
        }
        /* Progress bar IS the export button's outline — sits ON
           the button's perimeter, fill width = the bottom edge
           length proportional to progress. */
        #atcReportProgressBar {
          position: absolute;
          left: 0; right: 0; bottom: 0;
          height: 2px;
          background: rgba(76, 175, 80, 0.18);
          border-radius: 0 0 20px 20px;
          overflow: hidden;
          pointer-events: none;
          z-index: 5;
        }
        #atcReportProgressBar .atc-rp-fill {
          height: 100%;
          width: 0%;
          background-image: linear-gradient(
            90deg,
            #1b4d21 0%, #2d6a32 12.5%, #4CAF50 25%, #7fe091 37.5%, #b5f5b5 50%,
            #7fe091 62.5%, #4CAF50 75%, #2d6a32 87.5%, #1b4d21 100%
          );
          background-size: 30vw 100%;
          background-repeat: repeat-x;
          animation: atcReportFlow 4s linear infinite;
          box-shadow: 0 0 8px rgba(76,175,80,0.65);
          transition: width 220ms cubic-bezier(0.4, 0, 0.2, 1);
        }
        @keyframes atcReportFlow {
          from { background-position-x: 0; }
          to   { background-position-x: -30vw; }
        }
        /* Also draw a flowing-green BORDER around the whole
           export button during export, using the same gradient
           via dual-background border-image trick. */
        #exportButton.atc-rp-active {
          border: 2px solid transparent !important;
          background:
            linear-gradient(rgba(40,40,40,0.85), rgba(40,40,40,0.85)) padding-box,
            linear-gradient(90deg,
              #1b4d21 0%, #2d6a32 12.5%, #4CAF50 25%, #7fe091 37.5%, #b5f5b5 50%,
              #7fe091 62.5%, #4CAF50 75%, #2d6a32 87.5%, #1b4d21 100%
            ) border-box !important;
          background-size: 100% 100%, 30vw 100% !important;
          background-repeat: no-repeat, repeat-x !important;
          animation: atcReportButtonBorderFlow 4s linear infinite !important;
        }
        @keyframes atcReportButtonBorderFlow {
          from { background-position: 0 0, 0 0; }
          to   { background-position: 0 0, -30vw 0; }
        }
      `;
      document.head.appendChild(style);
    }

    btn.classList.add('atc-rp-active');
    return { btn, label, bar };
  }

  function setProgress(host, pct, text) {
    if (!host) return;
    const p = Math.max(0, Math.min(100, pct));
    const fill = host.bar && host.bar.querySelector('.atc-rp-fill');
    if (fill) fill.style.width = p.toFixed(1) + '%';
    if (host.label && text != null) {
      host.label.textContent = `${Math.round(p)}%  ${text}`;
    }
  }

  function destroyProgressUI(host) {
    if (!host || !host.btn) return;
    const orig = host.btn.dataset.atcOriginalHtml;
    if (orig != null) host.btn.innerHTML = orig;
    delete host.btn.dataset.atcOriginalHtml;
    host.btn.classList.remove('atc-rp-active');
  }

  // small yield so the progress bar actually repaints between steps
  const tick = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  function waitForLibs(timeoutMs) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      (function poll() {
        const jsPDF = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (jsPDF && window.html2canvas) return resolve(jsPDF);
        if (Date.now() - start > timeoutMs) return reject(new Error('PDF libraries did not load in time'));
        setTimeout(poll, 50);
      })();
    });
  }

  // ─── font loading ────────────────────────────────────────────
  // Load the same Segoe UI TTFs the viz uses so the PDF type
  // matches the page exactly. Cached after the first load.
  let _fontPromise = null;
  function loadSegoeFonts(pdf) {
    if (!_fontPromise) {
      const variants = [
        { url: 'asset/font/SegoeUI/segoeui.ttf',  name: 'SegoeUI', style: 'normal' },
        { url: 'asset/font/SegoeUI/segoeuib.ttf', name: 'SegoeUI', style: 'bold'   },
        { url: 'asset/font/SegoeUI/segoeuil.ttf', name: 'SegoeUILight', style: 'normal' }
      ];
      _fontPromise = Promise.all(variants.map(async (v) => {
        try {
          const res = await fetch(v.url);
          if (!res.ok) throw new Error('fetch failed: ' + res.status);
          const buf = await res.arrayBuffer();
          let bin = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          return { ...v, base64: btoa(bin) };
        } catch (e) {
          console.warn('[report] font ' + v.url + ' failed:', e);
          return null;
        }
      }));
    }
    return _fontPromise.then((loaded) => {
      loaded.forEach((v) => {
        if (!v) return;
        const file = v.url.split('/').pop();
        pdf.addFileToVFS(file, v.base64);
        pdf.addFont(file, v.name, v.style);
      });
      const ok = loaded.some(v => v && v.name === 'SegoeUI');
      return ok ? 'SegoeUI' : null;
    });
  }

  // ─── page primitives ─────────────────────────────────────────
  function paintBackground(pdf) {
    pdf.setFillColor(...C_BG);
    pdf.rect(0, 0, W, H, 'F');
  }

  function pageHeader(pdf, label, pageNum, totalPages) {
    pdf.setFont(FONT, 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...C_DIM);
    pdf.text('IS THE WORLD YOUR OYSTER  /  TRAVEL REPORT', MARGIN, MARGIN - 4);
    const right = `${label.toUpperCase()}    ${pageNum} / ${totalPages}`;
    pdf.text(right, W - MARGIN, MARGIN - 4, { align: 'right' });
    pdf.setDrawColor(...C_RULE);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, MARGIN - 2, W - MARGIN, MARGIN - 2);
  }

  function pageFooter(pdf) {
    pdf.setDrawColor(...C_RULE);
    pdf.setLineWidth(0.2);
    pdf.line(MARGIN, H - MARGIN + 2, W - MARGIN, H - MARGIN + 2);
    pdf.setFontSize(7);
    pdf.setTextColor(...C_DIM);
    pdf.text(`generated ${fmtDate(new Date())}`, MARGIN, H - MARGIN + 6);
    pdf.text('github.com/xuanx1/worldOyster', W - MARGIN, H - MARGIN + 6, { align: 'right' });
  }

  function sectionTitle(pdf, y, text) {
    pdf.setFont(FONT, 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(...C_ACCENT);
    pdf.text(text.toUpperCase(), MARGIN, y);
    pdf.setDrawColor(...C_ACCENT);
    pdf.setLineWidth(0.4);
    pdf.line(MARGIN, y + 1.2, MARGIN + 18, y + 1.2);
  }

  // ─── DOM capture helpers ─────────────────────────────────────
  async function captureElement(el, scale = 2) {
    if (!el) return null;
    try {
      const canvas = await window.html2canvas(el, {
        backgroundColor: '#0a0e14',
        scale,
        useCORS: true,
        logging: false,
        // Avoid html2canvas re-fetching tiles which throws on file://
        allowTaint: true
      });
      return canvas.toDataURL('image/jpeg', 0.86);
    } catch (e) {
      console.warn('[report] capture failed:', e);
      return null;
    }
  }

  function captureCanvas(cv) {
    if (!cv) return null;
    try { return cv.toDataURL('image/png'); } catch (e) { return null; }
  }

  function addImageFit(pdf, dataUrl, x, y, maxW, maxH) {
    if (!dataUrl) return { w: 0, h: 0 };
    const props = pdf.getImageProperties(dataUrl);
    const ratio = props.width / props.height;
    let w = maxW, h = maxW / ratio;
    if (h > maxH) { h = maxH; w = h * ratio; }
    const dx = x + (maxW - w) / 2;
    const dy = y + (maxH - h) / 2;
    pdf.addImage(dataUrl, dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG', dx, dy, w, h);
    return { w, h };
  }

  // ─── data collation ──────────────────────────────────────────
  function collectStats() {
    const fm = window.flightMap;
    if (!fm) return {};
    const data = fm.flightData || [];
    return {
      journeys: data.length,
      distance: fm.totalDistance || 0,
      duration: fm.totalTime || 0,
      co2: fm.totalCO2 || 0,
      costSGD: fm.totalCostSGD || 0,
      cities: (fm.cities || []).length,
      flightCount: data.filter(j => j.type !== 'land').length,
      landCount: data.filter(j => j.type === 'land').length,
      firstDate: data[0] && (data[0].date || data[0].departureDate),
      lastDate: data[data.length - 1] && (data[data.length - 1].date)
    };
  }

  // ─── pages ───────────────────────────────────────────────────
  function drawCover(pdf, stats) {
    paintBackground(pdf);

    // Big oyster mark
    pdf.setFont(FONT, 'bold');
    pdf.setFontSize(56);
    pdf.setTextColor(...C_TEXT);
    pdf.text('IS THE WORLD', W / 2, 84, { align: 'center' });
    pdf.text('YOUR \u{1F9AA}?', W / 2, 104, { align: 'center' });

    // Subtitle line
    pdf.setFont(FONT, 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(...C_DIM);
    pdf.text('— TRAVEL REPORT —', W / 2, 118, { align: 'center' });

    // Period block
    const from = fmtDate(stats.firstDate);
    const to = fmtDate(stats.lastDate);
    pdf.setFontSize(12);
    pdf.setTextColor(...C_ACCENT);
    pdf.text(`${from || '—'}   →   ${to || '—'}`, W / 2, 138, { align: 'center' });

    // Four quick-fact cards
    const cardW = (CONTENT_W - 6 * 3) / 4;
    const cardH = 28;
    const cardY = 168;
    const cards = [
      [String(stats.journeys || 0),      'journeys'],
      [String(stats.cities  || 0),       'cities'],
      [fmtInt(stats.distance || 0),      'km flown'],
      [fmtInt(stats.co2 || 0),           'kg CO₂']
    ];
    cards.forEach((c, i) => {
      const x = MARGIN + i * (cardW + 6);
      pdf.setFillColor(...C_PANEL);
      pdf.roundedRect(x, cardY, cardW, cardH, 1.5, 1.5, 'F');
      pdf.setFont(FONT, 'bold');
      pdf.setFontSize(17);
      pdf.setTextColor(...C_TEXT);
      pdf.text(c[0], x + cardW / 2, cardY + 13, { align: 'center' });
      pdf.setFont(FONT, 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...C_DIM);
      pdf.text(c[1].toUpperCase(), x + cardW / 2, cardY + 22, { align: 'center' });
    });

    // Footer mark
    pdf.setFontSize(7);
    pdf.setTextColor(...C_DIM);
    pdf.text(`exported ${fmtDate(new Date())}`, W / 2, H - 16, { align: 'center' });
  }

  function drawStatsPage(pdf, stats, pageNum, total) {
    paintBackground(pdf);
    pageHeader(pdf, 'travel statistics', pageNum, total);

    sectionTitle(pdf, 30, 'totals');
    const rows = [
      ['Total journeys',  String(stats.journeys || 0)],
      ['Flights',         String(stats.flightCount || 0)],
      ['Surface legs',    String(stats.landCount  || 0)],
      ['Unique places',   String(stats.cities    || 0)],
      ['Total distance',  `${fmtInt(stats.distance)} km`],
      ['Total time aloft',`${(stats.duration || 0).toFixed(1)} h`],
      ['CO₂ emitted',     `${fmtInt(stats.co2)} kg  (${(stats.co2 / 1000).toFixed(2)} t)`],
      ['Total spend',     `S$ ${fmtInt(stats.costSGD || 0)}`]
    ];
    pdf.setFont(FONT, 'normal');
    pdf.setFontSize(10);
    let y = 40;
    rows.forEach(([k, v]) => {
      pdf.setTextColor(...C_DIM);
      pdf.text(k, MARGIN + 2, y);
      pdf.setTextColor(...C_TEXT);
      pdf.text(v, W - MARGIN - 2, y, { align: 'right' });
      pdf.setDrawColor(...C_RULE);
      pdf.setLineWidth(0.15);
      pdf.line(MARGIN, y + 1.6, W - MARGIN, y + 1.6);
      y += 9;
    });

    pageFooter(pdf);
  }

  async function drawMapPage(pdf, pageNum, total) {
    paintBackground(pdf);
    pageHeader(pdf, 'journey scope', pageNum, total);
    sectionTitle(pdf, 30, 'orthographic projection');

    const cv = document.getElementById('atcScopeCanvas');
    const png = captureCanvas(cv);
    if (png) {
      addImageFit(pdf, png, MARGIN, 38, CONTENT_W, H - MARGIN - 38 - 12);
    } else {
      pdf.setTextColor(...C_DIM);
      pdf.setFontSize(10);
      pdf.text('Map snapshot unavailable.', W / 2, H / 2, { align: 'center' });
    }
    pageFooter(pdf);
  }

  async function drawChartsPage(pdf, pageNum, total) {
    paintBackground(pdf);
    pageHeader(pdf, 'spend & efficiency', pageNum, total);

    sectionTitle(pdf, 30, 'adjusted SGD per leg');
    const price = document.getElementById('priceChart');
    const priceImg = captureCanvas(price);
    if (priceImg) {
      addImageFit(pdf, priceImg, MARGIN, 36, CONTENT_W, 90);
    }

    sectionTitle(pdf, 138, 'leg efficiency');
    const leg = document.getElementById('legChart');
    const legImg = captureCanvas(leg);
    if (legImg) {
      addImageFit(pdf, legImg, MARGIN, 144, CONTENT_W, 90);
    }

    pageFooter(pdf);
  }

  async function drawWidgetsPage(pdf, pageNum, total, onTile) {
    paintBackground(pdf);
    pageHeader(pdf, 'dashboard widgets', pageNum, total);

    const tiles = [
      ['Records',          '.widget-card:has(#recordsCards)'],
      ['Avg duration / yr','.widget-card:has(#durationTrend)'],
      ['Spending heatmap', '.widget-card:has(#spendingHeatmap)'],
      ['Cost by country',  '.widget-card:has(#costChoropleth)'],
      ['Unvisited',        '.widget-card:has(#unvisitedNeighbors)'],
      ['Journey timeline', '.widget-card:has(#journeyTimeline)']
    ];

    let y = 30;
    const tileH = 38;
    let i = 0;
    for (const [label, sel] of tiles) {
      i++;
      if (onTile) await onTile(label, i, tiles.length);
      const el = document.querySelector(sel);
      if (!el) continue;
      sectionTitle(pdf, y, label);
      const img = await captureElement(el, 2);
      if (img) addImageFit(pdf, img, MARGIN, y + 3, CONTENT_W, tileH);
      y += tileH + 8;
      if (y > H - MARGIN - 30) {
        pageFooter(pdf);
        pdf.addPage();
        paintBackground(pdf);
        pageHeader(pdf, 'dashboard widgets (cont.)', pageNum + 1, total);
        y = 30;
      }
    }
    pageFooter(pdf);
  }

  function drawCityList(pdf, pageNum, total) {
    paintBackground(pdf);
    pageHeader(pdf, 'visited cities', pageNum, total);
    sectionTitle(pdf, 30, 'places visited');

    const fm = window.flightMap;
    const cities = (fm && fm.cities) || [];
    // De-dupe by name|country
    const seen = new Set();
    const list = [];
    cities.forEach((c) => {
      const key = (c.name || '') + '|' + (c.country || '');
      if (!key.trim() || seen.has(key)) return;
      seen.add(key);
      list.push(c);
    });

    const cols = 3;
    const colW = CONTENT_W / cols;
    const rowH = 5;
    const yTop = 38;
    const yMax = H - MARGIN - 12;
    const rowsPerCol = Math.floor((yMax - yTop) / rowH);
    const itemsPerPage = rowsPerCol * cols;

    pdf.setFont(FONT, 'normal');
    pdf.setFontSize(8.5);

    list.forEach((c, idx) => {
      const localIdx = idx % itemsPerPage;
      if (idx > 0 && localIdx === 0) {
        pageFooter(pdf);
        pdf.addPage();
        paintBackground(pdf);
        pageHeader(pdf, 'visited cities (cont.)', pageNum + Math.floor(idx / itemsPerPage), total);
        sectionTitle(pdf, 30, 'places visited');
      }
      const col = Math.floor(localIdx / rowsPerCol);
      const row = localIdx % rowsPerCol;
      const x = MARGIN + col * colW;
      const y = yTop + row * rowH;
      pdf.setTextColor(...C_DIM);
      pdf.text(`${idx + 1}.`, x + 1, y);
      pdf.setTextColor(...C_TEXT);
      pdf.text(String(c.name || ''), x + 8, y);
      pdf.setTextColor(...C_DIM);
      pdf.text(String(c.country || ''), x + colW - 2, y, { align: 'right' });
    });

    pageFooter(pdf);
  }

  // ─── orchestrator ────────────────────────────────────────────
  async function generatePdfReport() {
    // Cancellation flag set by the cancel button. Each step checks it
    // and bails early.
    const state = { cancelled: false };
    const check = () => { if (state.cancelled) throw new Error('cancelled'); };
    const ui = buildProgressUI(() => { state.cancelled = true; });
    setProgress(ui, 2, 'loading PDF engine…');
    await tick();

    // Pause the scope's render loop while html2canvas is rasterising the
    // DOM — the loop and the rasteriser fight for the main thread,
    // making the page feel locked up. Pause until export finishes.
    window.__atcExportPaused = true;

    let jsPDF;
    try { jsPDF = await waitForLibs(8000); }
    catch (e) {
      destroyProgressUI(ui);
      window.__atcExportPaused = false;
      alert('Could not load the PDF library. Check your network and try again.');
      console.error(e);
      return;
    }

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    // Pull the viz's own Segoe UI TTFs into jsPDF before any text
    // is laid down. If the fetch fails, we silently fall back to
    // jsPDF's built-in helvetica.
    setProgress(ui, 6, 'loading typeface…');
    await tick();
    try {
      const fontName = await loadSegoeFonts(pdf);
      if (fontName) FONT = fontName;
    } catch (e) { /* ignore — keep helvetica */ }

    const stats = collectStats();
    const TOTAL = 6;

    // Weighted step plan so the bar advances proportionally to real work.
    // (html2canvas captures dominate; each widget tile gets its own band.)
    const steps = [
      { label: 'cover page',               weight: 4  },
      { label: 'travel statistics',        weight: 4  },
      { label: 'journey scope snapshot',   weight: 8  },
      { label: 'spend & efficiency charts',weight: 8  },
      // 6 widget tiles, advanced inside the loop
      { label: 'rendering widget: ',       weight: 60, perTile: true },
      { label: 'visited cities list',      weight: 10 },
      { label: 'saving PDF',               weight: 6  }
    ];
    const totalWeight = steps.reduce((s, x) => s + x.weight, 0);
    let done = 0;
    const advance = (n, label) => {
      done = Math.min(totalWeight, done + n);
      setProgress(ui, (done / totalWeight) * 100, label);
    };

    try {
      // Cover
      check(); advance(0, steps[0].label); await tick();
      drawCover(pdf, stats);
      advance(steps[0].weight);

      // Stats
      check(); advance(0, steps[1].label); await tick();
      pdf.addPage();
      drawStatsPage(pdf, stats, 2, TOTAL);
      advance(steps[1].weight);

      // Map
      check(); advance(0, steps[2].label); await tick();
      pdf.addPage();
      await drawMapPage(pdf, 3, TOTAL);
      advance(steps[2].weight);

      // Charts
      check(); advance(0, steps[3].label); await tick();
      pdf.addPage();
      await drawChartsPage(pdf, 4, TOTAL);
      advance(steps[3].weight);

      // Widgets — drip per-tile progress
      check();
      pdf.addPage();
      const widgetTotalWeight = steps[4].weight;
      await drawWidgetsPage(pdf, 5, TOTAL, async (label, i, n) => {
        check();
        setProgress(ui, ((done + (widgetTotalWeight * (i - 1) / n)) / totalWeight) * 100,
                    `rendering widget: ${label} (${i}/${n})`);
        await tick();
      });
      done += widgetTotalWeight;
      advance(0, 'widgets done');

      // City list
      check(); advance(0, steps[5].label); await tick();
      pdf.addPage();
      drawCityList(pdf, 6, TOTAL);
      advance(steps[5].weight);

      // Save
      check(); advance(0, steps[6].label); await tick();
      const stamp = new Date().toISOString().split('T')[0];
      pdf.save(`worldoyster-report-${stamp}.pdf`);
      advance(steps[6].weight, 'done');
      await new Promise(r => setTimeout(r, 350));
    } catch (err) {
      if (err && err.message === 'cancelled') {
        console.log('[report] export cancelled by user');
      } else {
        console.error('[report] export failed:', err);
      }
    } finally {
      destroyProgressUI(ui);
      window.__atcExportPaused = false;
    }
  }

  // ─── hook the export button ──────────────────────────────────
  function attachExportHook() {
    const btn = document.getElementById('exportButton');
    if (!btn) return;
    // Run BEFORE the existing JSON exporter (capture phase). If the
    // PDF path fails the JSON path still runs as fallback.
    btn.addEventListener('click', async (e) => {
      // If the click came from the inline cancel button, let it
      // through — do NOT stopImmediatePropagation here or the
      // cancel handler in capture/target phase never fires.
      const t = e.target;
      if (t && t.classList && t.classList.contains('atc-rp-cancel')) {
        return;
      }
      e.stopImmediatePropagation();
      e.preventDefault();
      if (btn.disabled) return;
      btn.disabled = true;
      try {
        await generatePdfReport();
      } catch (err) {
        console.error('[report] export failed:', err);
        alert('Report export failed. See console for details.');
      } finally {
        btn.disabled = false;
      }
    }, true /* capture */);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachExportHook);
  } else {
    attachExportHook();
  }

  // expose for debugging / manual trigger
  window.generatePdfReport = generatePdfReport;
})();
