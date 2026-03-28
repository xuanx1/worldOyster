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

    function render() {
        const container = document.getElementById('longestStays');
        if (!container) return;

        const stays = collectStays();
        if (!stays.length) {
            container.innerHTML = '<div style="color:#666;font-size:12px;">No data</div>';
            return;
        }

        const maxDays = stays[0].days;
        let html = '<div class="longest-stays-list">';

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

        stays.slice(0, 10).forEach((s, i) => {
            const pct = (s.days / maxDays) * 100;
            html += `<div class="ls-row" title="${s.country} — ${s.days} days total">
                <span class="ls-rank">${i + 1}</span>
                <div class="ls-info">
                    <div class="ls-name">${s.country}</div>
                </div>
                <div class="ls-bar-bg"><div class="ls-bar-fill" style="width:${pct}%"></div></div>
                <span class="ls-days">${fmtDays(s.days)}</span>
            </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    waitForData(render);
})();
