// Return Visit Counter — ranked list of cities visited more than once
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

    function normalize(name) {
        if (!name) return '';
        return name.trim().toLowerCase()
            .replace(/\s*\(.*?\)\s*/g, '') // remove parentheticals like "(Saigon)"
            .replace(/[\s\-']/g, '');
    }

    function collectVisits() {
        const data = (window.flightMap && window.flightMap.flightData) || [];
        const cityCountryMap = window.CITY_TO_COUNTRY || {};
        const airportToCity = window.AIRPORT_TO_CITY || {};
        const airportToCountry = window.AIRPORT_TO_COUNTRY || {};
        const counts = {}; // normalized → { displayName, country, count }

        function add(cityName, country) {
            if (!cityName) return;
            const key = normalize(cityName);
            if (!key) return;
            if (!counts[key]) {
                counts[key] = { displayName: cityName, country: country || '', count: 0 };
            }
            counts[key].count++;
            // Prefer the version with more info
            if (country && !counts[key].country) counts[key].country = country;
        }

        data.forEach(j => {
            if (j.type === 'land') {
                add(j.origin, cityCountryMap[j.origin]);
                add(j.destination, cityCountryMap[j.destination]);
            } else {
                // Flights — resolve to city name
                let fromCity = j.fromCode && airportToCity[j.fromCode] ? airportToCity[j.fromCode] : null;
                let toCity = j.toCode && airportToCity[j.toCode] ? airportToCity[j.toCode] : null;
                if (!fromCity) {
                    const m = (j.from || '').match(/^([^/]+?)(?:\s*\/|$)/);
                    fromCity = m ? m[1].trim() : j.from;
                }
                if (!toCity) {
                    const m = (j.to || '').match(/^([^/]+?)(?:\s*\/|$)/);
                    toCity = m ? m[1].trim() : j.to;
                }
                add(fromCity, airportToCountry[j.fromCode]);
                add(toCity, airportToCountry[j.toCode]);
            }
        });

        return Object.values(counts)
            .filter(c => c.count > 1)
            .sort((a, b) => b.count - a.count);
    }

    let _data = [];
    let _tooltipAttached = false;

    function render() {
        const container = document.getElementById('returnVisits');
        if (!container) return;

        if (!_data.length) _data = collectVisits();
        if (!_data.length) {
            container.innerHTML = '<div style="color:#666;font-size:12px;">No repeat visits yet</div>';
            return;
        }

        const limit = window._rvLimit || 5;
        const maxCount = _data[0].count;
        let html = '<div class="return-visits-list">';

        _data.slice(0, limit).forEach((city, i) => {
            const pct = (city.count / maxCount) * 100;
            html += `<div class="rv-row">
                <span class="rv-rank">${i + 1}</span>
                <div class="rv-info">
                    <div class="rv-city">${city.displayName}</div>
                    <div class="rv-country">${city.country}</div>
                </div>
                <div class="rv-bar-bg"><div class="rv-bar-fill" style="width:${pct}%"></div></div>
                <span class="rv-count">${city.count}x</span>
            </div>`;
        });

        html += '</div>';
        container.innerHTML = html;
    }

    waitForData(function () {
        _data = collectVisits();
        window._rvData = _data;
        window._rvLimit = 1;
        window._rvRender = function (n) { window._rvLimit = n; render(); };
        render();
    });
})();
