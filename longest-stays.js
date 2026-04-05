// Longest Stays — ranked list of countries by total days spent
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

    function collectStays() {
        const data = (window.flightMap && window.flightMap.flightData) || [];
        const countryMap = window.AIRPORT_TO_COUNTRY || {};
        const cityCountryMap = window.CITY_TO_COUNTRY || {};

        if (data.length < 2) return [];

        // Walk through sorted journeys; time between consecutive departures = stay at destination
        const countryDays = {}; // country → total days

        for (let i = 0; i < data.length - 1; i++) {
            const j = data[i];
            const next = data[i + 1];

            const d1 = new Date(j.date);
            const d2 = new Date(next.date);
            if (isNaN(d1) || isNaN(d2)) continue;

            const days = (d2 - d1) / 86400000;
            if (days <= 0 || days > 365) continue; // skip bad gaps or year+ gaps

            // Destination country of current journey = where we stayed
            let country = null;
            if (j.type === 'land') {
                country = cityCountryMap[j.destination] || cityCountryMap[j.origin];
            } else {
                const toCode = j.toCode || (j.to && j.to.match(/\(([A-Z]{3})\//)?.[1]);
                country = countryMap[toCode];
            }

            if (country) {
                countryDays[country] = (countryDays[country] || 0) + days;
            }
        }

        return Object.entries(countryDays)
            .map(([country, days]) => ({ country, days: Math.round(days) }))
            .filter(c => c.days > 0)
            .sort((a, b) => b.days - a.days);
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

    function fmtDays(d) {
        const y = Math.floor(d / 365);
        const m = Math.floor((d % 365) / 30);
        const dd = d % 30;
        let s = '';
        if (y) s += y + 'y ';
        if (m) s += m + 'm ';
        s += dd + 'd';
        return s;
    }

    function render() {
        const container = document.getElementById('longestStays');
        if (!container) return;

        if (!_data.length) _data = collectStays();
        if (!_data.length) {
            container.innerHTML = '<div style="color:#666;font-size:12px;">No data</div>';
            return;
        }

        const limit = window._lsLimit || 5;
        const maxDays = _data[0].days;
        let html = '<div class="longest-stays-list">';

        _data.slice(0, limit).forEach((s, i) => {
            const pct = (s.days / maxDays) * 100;
            html += `<div class="ls-row" data-tip-label="${s.country}" data-tip-val="${fmtDays(s.days)}">
                <div class="ls-info">
                    <div class="ls-name"><span class="ls-rank">${i + 1}</span>${s.country}</div>
                </div>
                <div class="ls-bar-bg"><div class="ls-bar-fill" style="width:${pct}%"></div></div>
                <span class="ls-days">${fmtDays(s.days)}</span>
            </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    waitForData(function () {
        _data = collectStays();
        window._lsData = _data;
        window._lsLimit = 1;
        window._lsRender = function (n) { window._lsLimit = n; render(); };
        render();
        const container = document.getElementById('longestStays');
        if (container) attachRowTooltip(container, '.ls-row');
    });
})();
