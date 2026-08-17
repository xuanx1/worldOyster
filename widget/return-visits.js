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
        const counts = {}; // normalized → { displayName, country, count, totalCost }

        function add(cityName, country, cost) {
            if (!cityName) return;
            const key = normalize(cityName);
            if (!key) return;
            if (!counts[key]) {
                counts[key] = { displayName: cityName, country: country || '', count: 0, totalCost: 0 };
            }
            counts[key].count++;
            counts[key].totalCost += (cost || 0);
            if (country && !counts[key].country) counts[key].country = country;
        }

        // A visit is an ARRIVAL, so only destinations are counted.
        //
        // The itinerary is one continuous chain: every leg departs from the
        // city the previous leg arrived at. Counting both endpoints therefore
        // scored each stop twice — once on arriving, again on leaving — which
        // is why Singapore read 107x for roughly half that many actual stays.
        //
        // The one city with no arriving leg is the chain's very first origin,
        // so it is credited once, below. Journeys are taken in array order,
        // which is the chronological order the rest of the viz plays them in.
        data.forEach((j, idx) => {
            const cost = parseFloat(j.costSGD || j.actualCostSGD || 0) || 0;
            let fromCity, toCity, fromCountry, toCountry;

            if (j.type === 'land') {
                fromCity = j.origin;
                toCity = j.destination;
                fromCountry = cityCountryMap[j.origin];
                toCountry = cityCountryMap[j.destination];
            } else {
                fromCity = j.fromCode && airportToCity[j.fromCode] ? airportToCity[j.fromCode] : null;
                toCity = j.toCode && airportToCity[j.toCode] ? airportToCity[j.toCode] : null;
                if (!fromCity) {
                    const m = (j.from || '').match(/^([^/]+?)(?:\s*\/|$)/);
                    fromCity = m ? m[1].trim() : j.from;
                }
                if (!toCity) {
                    const m = (j.to || '').match(/^([^/]+?)(?:\s*\/|$)/);
                    toCity = m ? m[1].trim() : j.to;
                }
                fromCountry = airportToCountry[j.fromCode];
                toCountry = airportToCountry[j.toCode];
            }

            // Starting point of the whole journey — nothing ever arrives
            // there, so it would otherwise be missing a visit.
            if (idx === 0) add(fromCity, fromCountry, 0);
            // Full journey cost is credited to the destination (cost to arrive).
            add(toCity, toCountry, cost);
        });

        return Object.values(counts)
            .filter(c => c.count > 1)
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
    let _tooltipAttached = false;

    function render() {
        const container = document.getElementById('returnVisits');
        if (!container) return;

        if (!_data.length) _data = collectVisits();
        if (!_data.length) {
            container.innerHTML = `<div style="color:#666;font-size:12px;">${window.i18n ? window.i18n.t('noRepeatVisits') : 'No repeat visits yet'}</div>`;
            return;
        }

        const limit = window._rvLimit || 12;
        const maxCount = _data[0].count;
        let html = '<div class="return-visits-list">';

        _data.slice(0, limit).forEach((city, i) => {
            const pct = (city.count / maxCount) * 100;
            const _city = window.translateCity ? window.translateCity(city.displayName) : city.displayName;
            const _country = window.translateCountry ? window.translateCountry(city.country) : city.country;
            const _label = _country ? `${_city}, ${_country}` : _city;
            const _val = `${city.count}× · S$${Math.round(city.totalCost).toLocaleString()}`;
            html += `<div class="rv-row" data-tip-label="${_label}" data-tip-val="${_val}">
                <span class="rv-rank">${i + 1}</span>
                <div class="rv-info">
                    <div class="rv-city">${_city}</div>
                    <div class="rv-country">${_country}</div>
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
        const container = document.getElementById('returnVisits');
        if (container) attachRowTooltip(container, '.rv-row');
    });
    window.addEventListener('langchange', function() { _data = []; render(); });
})();
