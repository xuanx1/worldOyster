// Spending Heatmap Calendar — GitHub-contributions-style grid colored by daily spend
(function () {
    'use strict';

    const CELL = 8, GAP = 6, PAD = 8;
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const DAYS = ['Mon','','Wed','','Fri','','Sun'];
    const GREEN = [ '#161b22', '#0e4429', '#006d32', '#26a641', '#39d353' ]; // 0-spend → max

    function waitForData(cb) {
        const id = setInterval(() => {
            if (window.flightMap && window.flightMap.cities && window.flightMap.cities.length > 0) {
                clearInterval(id);
                cb();
            }
        }, 500);
    }

    function collectDailySpend() {
        const data = (window.flightMap && window.flightMap.flightData) || [];
        const daily = {}; // 'YYYY-MM-DD' → total SGD

        data.forEach(j => {
            if (!j.date) return;
            const d = new Date(j.date);
            if (isNaN(d)) return;
            const key = d.toISOString().slice(0, 10);
            const cost = j.costSGD || j.actualCostSGD || 0;
            daily[key] = (daily[key] || 0) + cost;
        });
        return daily;
    }

    function getYearRange(daily) {
        const years = Object.keys(daily).map(k => parseInt(k.slice(0, 4)));
        if (!years.length) return [new Date().getFullYear(), new Date().getFullYear()];
        return [Math.min(...years), Math.max(...years)];
    }

    function render() {
        const container = document.getElementById('spendingHeatmap');
        if (!container) return;

        const daily = collectDailySpend();
        const [minY, maxY] = getYearRange(daily);
        const allVals = Object.values(daily).filter(v => v > 0);
        const maxSpend = allVals.length ? Math.max(...allVals) : 1;

        // Quantile thresholds for color buckets
        const sorted = [...allVals].sort((a, b) => a - b);
        const q = [0, 0.25, 0.5, 0.75].map(p => sorted[Math.floor(p * sorted.length)] || 0);

        function color(val) {
            if (!val || val <= 0) return GREEN[0];
            if (val <= q[1]) return GREEN[1];
            if (val <= q[2]) return GREEN[2];
            if (val <= q[3]) return GREEN[3];
            return GREEN[4];
        }

        let html = '';
        for (let year = maxY; year >= minY; year--) {
            html += renderYear(year, daily, color, maxSpend);
        }
        container.innerHTML = html;
    }

    function renderYear(year, daily, colorFn, maxSpend) {
        const jan1 = new Date(year, 0, 1);
        const dec31 = new Date(year, 11, 31);
        const startDay = (jan1.getDay() + 6) % 7; // 0=Mon
        const totalDays = Math.round((dec31 - jan1) / 86400000) + 1;

        const weeks = Math.ceil((totalDays + startDay) / 7);
        const W = PAD + 28 + weeks * (CELL + GAP) + PAD;
        const H = PAD + 7 * (CELL + GAP) + 20;

        let svg = `<div class="heatmap-year"><div class="heatmap-year-label">${year}</div>`;
        svg += `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMinYMin meet" style="display:block;width:100%;height:auto;">`;

        // Day labels
        DAYS.forEach((d, i) => {
            if (d) {
                svg += `<text x="${PAD}" y="${PAD + i * (CELL + GAP) + CELL - 2}" fill="#8b949e" font-size="9" font-family="inherit">${d}</text>`;
            }
        });

        // Month labels
        let lastMonth = -1;
        for (let w = 0; w < weeks; w++) {
            const dayOfYear = w * 7 - startDay;
            const dt = new Date(year, 0, 1 + dayOfYear);
            if (dt.getMonth() !== lastMonth && dt.getFullYear() === year) {
                lastMonth = dt.getMonth();
                const x = PAD + 28 + w * (CELL + GAP);
                svg += `<text x="${x}" y="${H - 4}" fill="#8b949e" font-size="9" font-family="inherit">${MONTHS[lastMonth]}</text>`;
            }
        }

        // Cells
        for (let w = 0; w < weeks; w++) {
            for (let d = 0; d < 7; d++) {
                const dayOfYear = w * 7 + d - startDay;
                if (dayOfYear < 0 || dayOfYear >= totalDays) continue;
                const dt = new Date(year, 0, 1 + dayOfYear);
                const key = dt.toISOString().slice(0, 10);
                const val = daily[key] || 0;
                const x = PAD + 28 + w * (CELL + GAP);
                const y = PAD + d * (CELL + GAP);
                const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                svg += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${colorFn(val)}" class="hm-cell" data-date="${dateStr}" data-val="${val.toFixed(0)}" style="outline:1px solid rgba(255,255,255,0.04);cursor:default"></rect>`;
            }
        }

        svg += `</svg></div>`;
        return svg;
    }

    function attachTooltips(container) {
        const tooltip = document.createElement('div');
        tooltip.className = 'heatmap-tooltip';
        tooltip.style.display = 'none';
        container.style.position = 'relative';
        container.appendChild(tooltip);

        container.addEventListener('mouseover', function (e) {
            const cell = e.target.closest('.hm-cell');
            if (!cell) return;
            const date = cell.dataset.date;
            const val = cell.dataset.val;
            tooltip.innerHTML = `<div class="hm-tip-date">${date}</div><div class="hm-tip-val">S$${parseInt(val).toLocaleString()}</div>`;
            tooltip.style.display = 'block';

            const rect = cell.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            tooltip.style.left = (rect.left - containerRect.left + rect.width / 2) + 'px';
            tooltip.style.top = (rect.top - containerRect.top - 8) + 'px';

            cell.setAttribute('opacity', '0.7');
            cell.style.outline = '1px solid rgba(255,255,255,0.4)';
        });

        container.addEventListener('mouseout', function (e) {
            const cell = e.target.closest('.hm-cell');
            if (!cell) return;
            tooltip.style.display = 'none';
            cell.removeAttribute('opacity');
            cell.style.outline = '1px solid rgba(255,255,255,0.04)';
        });
    }

    function initRender() {
        render();
        const container = document.getElementById('spendingHeatmap');
        if (container) attachTooltips(container);
    }

    waitForData(initRender);
})();
