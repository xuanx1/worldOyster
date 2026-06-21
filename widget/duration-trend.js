// Average Flight Duration Over Time — trend line chart by year
(function () {
    'use strict';

    function waitForData(cb) {
        const id = setInterval(() => {
            if (window.flightMap && window.flightMap.cities && window.flightMap.cities.length > 0) {
                clearInterval(id);
                cb();
            }
        }, 500);
    }

    function parseDuration(durStr) {
        if (!durStr) return 0;
        const parts = durStr.split(':');
        if (parts.length >= 2) {
            return parseInt(parts[0]) + parseInt(parts[1]) / 60;
        }
        return parseFloat(durStr) || 0;
    }

    function collectYearlyDuration() {
        const data = (window.flightMap && window.flightMap.flightData) || [];
        const yearMap = {}; // year → { totalHours, count }

        data.forEach(j => {
            if (!j.date) return;
            const year = new Date(j.date).getFullYear();
            if (isNaN(year)) return;

            let hours = 0;
            if (j.type === 'flight' && j.duration) {
                hours = parseDuration(j.duration);
            } else if (j.type === 'land' && j.duration) {
                hours = j.duration; // already in hours
            }
            if (hours <= 0) return;

            if (!yearMap[year]) yearMap[year] = { totalHours: 0, count: 0 };
            yearMap[year].totalHours += hours;
            yearMap[year].count++;
        });

        const years = Object.keys(yearMap).map(Number).sort();
        return years.map(y => ({
            year: y,
            avg: yearMap[y].totalHours / yearMap[y].count,
            total: yearMap[y].totalHours,
            count: yearMap[y].count
        }));
    }

    function renderInto(container) {
        if (!container) return;
        const data = collectYearlyDuration();
        if (!data.length) { container.innerHTML = `<div style="color:#666;font-size:12px;">${window.i18n ? window.i18n.t('noDurationData') : 'No duration data'}</div>`; return; }

        // Wide-banner aspect that matches a year heatmap cell
        // (~786 × 126). Line/area path stretch horizontally to fill
        // the wider drawing area, but the viewBox stays correct so
        // text and axes are NOT distorted.
        const W = 786, H = 126, PAD_L = 34, PAD_R = 10, PAD_T = 8, PAD_B = 20;
        const chartW = W - PAD_L - PAD_R;
        const chartH = H - PAD_T - PAD_B;

        const maxAvg = Math.max(...data.map(d => d.avg));
        const minAvg = Math.min(...data.map(d => d.avg));
        const range = maxAvg - minAvg || 1;

        function xPos(i) { return PAD_L + (i / Math.max(data.length - 1, 1)) * chartW; }
        function yPos(v) { return PAD_T + chartH - ((v - minAvg) / range) * chartH * 0.9; }

        let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;">`;

        // Grid lines
        const steps = 4;
        for (let i = 0; i <= steps; i++) {
            const val = minAvg + (range * i) / steps;
            const y = yPos(val);
            svg += `<line x1="${PAD_L}" y1="${y}" x2="${W - PAD_R}" y2="${y}" stroke="#333" stroke-width="0.5"/>`;
            svg += `<text x="${PAD_L - 6}" y="${y + 3}" fill="#888" font-size="11" text-anchor="end" font-family="inherit">${val.toFixed(1)}h</text>`;
        }

        // Area fill
        let areaPath = `M ${xPos(0)} ${yPos(data[0].avg)}`;
        data.forEach((d, i) => { if (i > 0) areaPath += ` L ${xPos(i)} ${yPos(d.avg)}`; });
        areaPath += ` L ${xPos(data.length - 1)} ${PAD_T + chartH} L ${xPos(0)} ${PAD_T + chartH} Z`;
        svg += `<path d="${areaPath}" fill="url(#durationGrad)" opacity="0.3"/>`;

        // Gradient def
        svg += `<defs><linearGradient id="durationGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#4CAF50"/>
            <stop offset="100%" stop-color="#4CAF50" stop-opacity="0"/>
        </linearGradient></defs>`;

        // Line
        let linePath = `M ${xPos(0)} ${yPos(data[0].avg)}`;
        data.forEach((d, i) => { if (i > 0) linePath += ` L ${xPos(i)} ${yPos(d.avg)}`; });
        svg += `<path d="${linePath}" fill="none" stroke="#4CAF50" stroke-width="2" stroke-linejoin="round"/>`;

        // Dots + year labels (invisible hover targets)
        // Hit-strip extends from the bottom up to the top so any
        // hover within a year's vertical band activates the tooltip
        // — important because the SVG renders very small inside the
        // spending-heatmap year slot (a tiny dot hit-area would be
        // effectively unhoverable at that scale).
        const stripW = chartW / Math.max(data.length, 1);
        data.forEach((d, i) => {
            const x = xPos(i), y = yPos(d.avg);
            svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="#4CAF50" stroke="#1a1a1a" stroke-width="1.5" class="duration-dot" data-idx="${i}" pointer-events="none"/>`;
            // Larger invisible hit strip — full vertical band per data point
            svg += `<rect x="${x - stripW/2}" y="0" width="${stripW}" height="${H}" fill="transparent" class="duration-dot-hit" data-idx="${i}" style="cursor:pointer; pointer-events: all;"/>`;
            if (i % 2 === 0 || data.length <= 5) svg += `<text x="${x}" y="${H - 6}" fill="#8b949e" font-size="11" text-anchor="middle" font-family="inherit" pointer-events="none">${d.year}</text>`;
        });

        svg += `</svg>`;
        container.innerHTML = svg;

        // Tooltip is appended to <body> so it escapes any
        // overflow:hidden / transform / backdrop-filter ancestor
        // (parallax + widget-card containers would otherwise clip it).
        // One shared tooltip element per container, reused across renders.
        let tooltip = container._durationTooltip;
        if (!tooltip || !tooltip.isConnected) {
            tooltip = document.createElement('div');
            tooltip.className = 'duration-tooltip';
            tooltip.style.display = 'none';
            document.body.appendChild(tooltip);
            container._durationTooltip = tooltip;
        }

        const svgEl = container.querySelector('svg');
        const dots = container.querySelectorAll('.duration-dot');

        container.querySelectorAll('.duration-dot-hit').forEach(hit => {
            hit.addEventListener('mouseenter', function() {
                const idx = parseInt(this.dataset.idx);
                const d = data[idx];
                const dot = dots[idx];
                const _t = window.i18n ? window.i18n.t : function(k){return k;};
                tooltip.innerHTML = `<div class="duration-tip-year">${d.year}</div><div class="duration-tip-avg">${d.avg.toFixed(1)}h ${_t('avg')}</div><div class="duration-tip-detail">${d.count} ${_t('legs')} · ${d.total.toFixed(0)}h ${_t('total')}</div>`;
                tooltip.style.display = 'block';

                const svgRect = svgEl.getBoundingClientRect();
                const cx = parseFloat(dot.getAttribute('cx'));
                const cy = parseFloat(dot.getAttribute('cy'));
                const scaleX = svgRect.width / W;
                const scaleY = svgRect.height / H;
                tooltip.style.position = 'fixed';
                tooltip.style.left = (svgRect.left + cx * scaleX) + 'px';
                tooltip.style.top = (svgRect.top + cy * scaleY - 8) + 'px';
                tooltip.style.zIndex = '999999';

                dot.setAttribute('r', '5');
                dot.style.filter = 'drop-shadow(0 0 6px rgba(76,175,80,0.6))';
            });
            hit.addEventListener('mouseleave', function() {
                const idx = parseInt(this.dataset.idx);
                tooltip.style.display = 'none';
                dots[idx].setAttribute('r', '3.5');
                dots[idx].style.filter = '';
            });
        });
    }

    function render() {
        renderInto(document.getElementById('durationTrend'));
        document.querySelectorAll('.atc-duration-host').forEach(function (h) {
            renderInto(h);
        });
    }

    // Expose for atc-skin.js so it can force a render after creating
    // a new .atc-duration-host inside the spending heatmap.
    window.renderDurationTrend = render;

    waitForData(render);
    window.addEventListener('langchange', function() { render(); });
})();
