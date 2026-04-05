// Most Flown Airlines — ranked list by number of flights
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

    function collectAirlines() {
        const data = (window.flightMap && window.flightMap.flightData) || [];
        const counts = {};

        data.forEach(j => {
            if (j.type !== 'flight') return;
            const airline = (j.airline || '').trim().replace(/\s*\(.*?\)\s*$/, '');
            if (!airline) return;
            counts[airline] = (counts[airline] || 0) + 1;
        });

        return Object.entries(counts)
            .map(([airline, count]) => ({ airline, count }))
            .sort((a, b) => b.count - a.count);
    }

    function attachRowTooltip(container, selector) {
        const tip = document.createElement('div');
        tip.className = 'widget-row-tooltip';
        document.body.appendChild(tip);
        container.addEventListener('mousemove', function (e) {
            const row = e.target.closest(selector);
            if (!row) { tip.style.display = 'none'; return; }
            tip.innerHTML = `<div class="tip-label">${row.dataset.tipLabel}</div><div class="tip-val">${row.dataset.tipVal}</div>`;
            tip.style.display = 'block';
            tip.style.left = e.clientX + 'px';
            tip.style.top = (e.clientY - 12) + 'px';
        });
        container.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    }

    let _data = [];

    function render() {
        const container = document.getElementById('topAirlines');
        if (!container) return;

        if (!_data.length) _data = collectAirlines();
        if (!_data.length) {
            container.innerHTML = '<div style="color:#666;font-size:12px;">No data</div>';
            return;
        }

        const limit = window._taLimit || 5;
        const max = _data[0].count;
        let html = '<div class="top-airlines-list">';

        _data.slice(0, limit).forEach((a, i) => {
            const pct = (a.count / max) * 100;
            html += `<div class="ta-row" data-tip-label="${a.airline}" data-tip-val="x${a.count} flights">
                <div class="ta-info">
                    <div class="ta-name"><span class="ta-rank">${i + 1}</span>${a.airline}</div>
                </div>
                <div class="ta-bar-bg"><div class="ta-bar-fill" style="width:${pct}%"></div></div>
                <span class="ta-count">x${a.count}</span>
            </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    waitForData(function () {
        _data = collectAirlines();
        window._taData = _data;
        window._taLimit = 1;
        window._taRender = function (n) { window._taLimit = n; render(); };
        render();
        const container = document.getElementById('topAirlines');
        if (container) attachRowTooltip(container, '.ta-row');
    });
})();
