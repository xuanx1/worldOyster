// SGD/USD Rate — sparkline that tracks the journey as it plays
//
// Sits between the quote widget and the city list. The full curve is drawn
// faintly across the whole span; a green overlay is revealed left-to-right in
// step with the animation's current flight date, with a dot riding the head of
// it. Values between annual averages are interpolated, so the dot moves
// continuously through a year rather than snapping on 1 January.
(function () {
    'use strict';

    const HOST_SEL = 'body > .stats-citylist-group > .stats-citylist-row';
    const VB_W = 360, VB_H = 46;      // viewBox units; CSS scales the width
    const PAD_L = 2, PAD_R = 2, PAD_T = 6, PAD_B = 6;

    // pts: [{t: fractional year, rate}] at whatever resolution the data module
    // has - monthly once HISTORICAL_SGD_PER_USD_MONTHLY is populated, annual
    // until then. Nothing below cares which; only the point count changes.
    let pts = [], minR = 0, maxR = 1, resolution = 'annual';
    let card = null, els = null, lastKey = '';

    function loadSeries() {
        const ex = window.ExchangeRates;
        if (!ex || typeof ex.getSeries !== 'function') return false;
        const series = ex.getSeries();
        pts = (series.points || []).filter(p => p && isFinite(p.t) && isFinite(p.rate));
        if (pts.length < 2) return false;
        resolution = series.resolution;
        const rates = pts.map(p => p.rate);
        minR = Math.min.apply(null, rates);
        maxR = Math.max.apply(null, rates);
        if (maxR === minR) { maxR = minR + 0.01; }
        return true;
    }

    // Fractional year → x, rate → y
    function xAt(yearFloat) {
        const first = pts[0].t, last = pts[pts.length - 1].t;
        const span = last - first;
        const t = span === 0 ? 0 : (yearFloat - first) / span;
        return PAD_L + Math.max(0, Math.min(1, t)) * (VB_W - PAD_L - PAD_R);
    }
    function yAt(rate) {
        const t = (rate - minR) / (maxR - minR);
        return PAD_T + (1 - t) * (VB_H - PAD_T - PAD_B);
    }

    function rateAt(yearFloat) {
        if (yearFloat <= pts[0].t) return pts[0].rate;
        const lastPt = pts[pts.length - 1];
        if (yearFloat >= lastPt.t) return lastPt.rate;
        for (let i = 0; i < pts.length - 1; i++) {
            if (yearFloat >= pts[i].t && yearFloat <= pts[i + 1].t) {
                const t = (yearFloat - pts[i].t) / (pts[i + 1].t - pts[i].t);
                return pts[i].rate + (pts[i + 1].rate - pts[i].rate) * t;
            }
        }
        return lastPt.rate;
    }

    function linePath() {
        return pts.map((p, i) => (i ? 'L' : 'M') + xAt(p.t).toFixed(2) + ' ' + yAt(p.rate).toFixed(2)).join(' ');
    }

    // Current playback position as a fractional year, or null before the run starts
    function currentYearFloat() {
        const fm = window.flightMap;
        if (!fm || !fm.cities || !fm.cities.length) return null;
        const idx = Math.max(0, Math.min(fm.currentCityIndex || 0, fm.cities.length - 1));
        // Walk back to the most recent city that carries a date
        for (let i = idx; i >= 0; i--) {
            const raw = fm.cities[i] && fm.cities[i].flightDate;
            if (!raw) continue;
            const d = new Date(raw);
            if (isNaN(d)) continue;
            const start = new Date(d.getFullYear(), 0, 1);
            const end = new Date(d.getFullYear() + 1, 0, 1);
            return d.getFullYear() + (d - start) / (end - start);
        }
        return null;
    }

    function build(row) {
        card = document.createElement('div');
        card.className = 'atc-fx-widget';
        const _t = window.i18n ? window.i18n.t : function (k) { return k; };
        card.innerHTML =
            '<div class="atc-fx-head">' +
                '<span class="atc-fx-label">' + _t('fxSgdUsd') + '</span>' +
                '<span class="atc-fx-value"></span>' +
            '</div>' +
            '<svg class="atc-fx-chart" viewBox="0 0 ' + VB_W + ' ' + VB_H + '" preserveAspectRatio="none" aria-hidden="true">' +
                '<defs><clipPath id="atc-fx-clip"><rect x="' + (-VB_W) + '" y="-4" width="' + VB_W + '" height="' + (VB_H + 8) + '"></rect></clipPath></defs>' +
                '<path class="atc-fx-track" d="' + linePath() + '"></path>' +
                '<path class="atc-fx-live" d="' + linePath() + '" clip-path="url(#atc-fx-clip)"></path>' +
                '<circle class="atc-fx-dot" r="2.6" cx="0" cy="0"></circle>' +
            '</svg>' +
            '<div class="atc-fx-axis"><span>' + Math.floor(pts[0].t) + '</span>' +
                '<span class="atc-fx-res">' + resolution + '</span>' +
                '<span>' + Math.floor(pts[pts.length - 1].t) + '</span></div>';
        row.appendChild(card);
        els = {
            value: card.querySelector('.atc-fx-value'),
            clip: card.querySelector('#atc-fx-clip rect'),
            dot: card.querySelector('.atc-fx-dot'),
            label: card.querySelector('.atc-fx-label'),
            path: card.querySelector('.atc-fx-live')
        };
        totalLen = els.path.getTotalLength();
    }

    // ── Dot travel ──────────────────────────────────────────────────────
    // Playback moves city to city, so the target can jump several months at
    // once. Rather than teleport, ease a cursor along the path's own arc length
    // and read positions off it — the dot then rides every bend of the line
    // instead of cutting a chord across it.
    let totalLen = 0, curLen = null, targetLen = 0, raf = null;

    function lenForX(x) {
        if (!totalLen) return 0;
        let lo = 0, hi = totalLen;
        for (let i = 0; i < 18; i++) {          // ~0.001 unit precision
            const mid = (lo + hi) / 2;
            if (els.path.getPointAtLength(mid).x < x) lo = mid; else hi = mid;
        }
        return (lo + hi) / 2;
    }

    // preserveAspectRatio="none" stretches the viewBox to the box, which squashes
    // the dot into an ellipse. Counter-scale y by sx/sy about the dot's own centre
    // so it renders round at any width. Recomputed on resize.
    let aspectFix = 1;
    function measureAspect() {
        if (!els || !els.dot) return;
        const r = els.dot.ownerSVGElement.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const sx = r.width / VB_W, sy = r.height / VB_H;
        aspectFix = sy === 0 ? 1 : sx / sy;
    }

    function place(len) {
        const p = els.path.getPointAtLength(len);
        els.dot.style.transform = 'translate(' + p.x.toFixed(2) + 'px, ' + p.y.toFixed(2) +
            'px) scale(1, ' + aspectFix.toFixed(4) + ')';
        els.clip.style.transform = 'translate(' + p.x.toFixed(2) + 'px, 0px)';
    }

    function step() {
        raf = null;
        if (curLen === null) { curLen = targetLen; }
        const delta = targetLen - curLen;
        if (Math.abs(delta) < 0.15) {
            curLen = targetLen;
            place(curLen);
            return;
        }
        curLen += delta * 0.14;                  // critically-damped feel
        place(curLen);
        raf = requestAnimationFrame(step);
    }

    function glideTo(x) {
        targetLen = lenForX(x);
        if (raf === null) raf = requestAnimationFrame(step);
    }

    function paint() {
        if (!els) return;
        const yf = currentYearFloat();
        const key = yf === null ? 'none' : yf.toFixed(4);
        if (key === lastKey) return;
        lastKey = key;

        if (yf === null) {
            els.clip.style.transform = 'translate(0px, 0px)';
            els.dot.style.display = 'none';
            els.value.textContent = '—';
            curLen = null;
            return;
        }
        const rate = rateAt(yf);
        els.dot.style.display = '';
        els.value.textContent = rate.toFixed(4);
        glideTo(xAt(yf));
    }

    function retranslate() {
        if (!els) return;
        const _t = window.i18n ? window.i18n.t : function (k) { return k; };
        els.label.textContent = _t('fxSgdUsd');
    }

    function init() {
        if (!loadSeries()) return false;
        const row = document.querySelector(HOST_SEL);
        if (!row) return false;
        if (row.querySelector(':scope > .atc-fx-widget')) return true;
        build(row);
        measureAspect();
        paint();
        setInterval(paint, 200);
        window.addEventListener('resize', function () {
            measureAspect();
            if (curLen !== null) place(curLen);
        });
        window.addEventListener('langchange', retranslate);
        return true;
    }

    // The skin builds .stats-citylist-row at runtime, so wait for it
    const tries = setInterval(function () {
        if (init()) clearInterval(tries);
    }, 250);
    setTimeout(function () { clearInterval(tries); }, 15000);
})();
