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

    function render() {
        const container = document.getElementById('topAirlines');
        if (!container) return;

        const airlines = collectAirlines();
        if (!airlines.length) {
            container.innerHTML = '<div style="color:#666;font-size:12px;">No data</div>';
            return;
        }

        const max = airlines[0].count;
        let html = '<div class="top-airlines-list">';

        airlines.slice(0, 10).forEach((a, i) => {
            const pct = (a.count / max) * 100;
            html += `<div class="ta-row" title="${a.airline} — ${a.count} flights">
                <span class="ta-rank">${i + 1}</span>
                <div class="ta-info">
                    <div class="ta-name">${a.airline}</div>
                </div>
                <div class="ta-bar-bg"><div class="ta-bar-fill" style="width:${pct}%"></div></div>
                <span class="ta-count">x${a.count}</span>
            </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    waitForData(render);
})();
