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

    function render() {
        const container = document.getElementById('durationTrend');
        if (!container) return;

        const data = collectYearlyDuration();
        if (!data.length) { container.innerHTML = '<div style="color:#666;font-size:12px;">No duration data</div>'; return; }

        const W = 300, H = 220, PAD_L = 29, PAD_R = 10, PAD_T = 0, PAD_B = 20;
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
        data.forEach((d, i) => {
            const x = xPos(i), y = yPos(d.avg);
            svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="#4CAF50" stroke="#1a1a1a" stroke-width="1.5" class="duration-dot" data-idx="${i}"/>`;
            // Larger invisible hit area
            svg += `<circle cx="${x}" cy="${y}" r="12" fill="transparent" class="duration-dot-hit" data-idx="${i}" style="cursor:pointer"/>`;
            if (i % 2 === 0 || data.length <= 5) svg += `<text x="${x}" y="${H - 6}" fill="#8b949e" font-size="11" text-anchor="middle" font-family="inherit">${d.year}</text>`;
        });

        svg += `</svg>`;

        // Tooltip element
        svg += `<div class="duration-tooltip" style="display:none;"></div>`;
        container.innerHTML = svg;

        // Tooltip logic
        const tooltip = container.querySelector('.duration-tooltip');
        const svgEl = container.querySelector('svg');
        const dots = container.querySelectorAll('.duration-dot');

        container.querySelectorAll('.duration-dot-hit').forEach(hit => {
            hit.addEventListener('mouseenter', function() {
                const idx = parseInt(this.dataset.idx);
                const d = data[idx];
                const dot = dots[idx];
                tooltip.innerHTML = `<div class="duration-tip-year">${d.year}</div><div class="duration-tip-avg">${d.avg.toFixed(1)}h avg</div><div class="duration-tip-detail">${d.count} legs · ${d.total.toFixed(0)}h total</div>`;
                tooltip.style.display = 'block';

                // Position relative to SVG
                const svgRect = svgEl.getBoundingClientRect();
                const cx = parseFloat(dot.getAttribute('cx'));
                const cy = parseFloat(dot.getAttribute('cy'));
                const scaleX = svgRect.width / W;
                const scaleY = svgRect.height / H;
                const left = cx * scaleX;
                const top = cy * scaleY;
                tooltip.style.left = left + 'px';
                tooltip.style.top = (top - 8) + 'px';

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

    waitForData(render);
})();
