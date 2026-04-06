// Records Cards — Top extremes: longest, shortest, farthest, most/least expensive
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
        if (parts.length >= 2) return parseInt(parts[0]) + parseInt(parts[1]) / 60;
        return parseFloat(durStr) || 0;
    }

    function formatDuration(hours) {
        if (!hours) return '-';
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
    }

    function getOriginDest(j) {
        const mgr = window.flightMap || {};
        if (j.type === 'land') return { from: j.origin, to: j.destination };
        const fromMatch = (j.from || '').match(/^([^/]+)/);
        const toMatch = (j.to || '').match(/^([^/]+)/);
        return {
            from: mgr.getOrigin ? mgr.getOrigin(j) : (fromMatch ? fromMatch[1].trim() : j.from),
            to: mgr.getDestination ? mgr.getDestination(j) : (toMatch ? toMatch[1].trim() : j.to)
        };
    }

    // Home base for "farthest from home"
    const HOME = [1.35, 103.8]; // Singapore

    function haversine(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function render() {
        const container = document.getElementById('recordsCards');
        if (!container) return;
        const t = window.i18n ? window.i18n.t : function(k) { return k; };

        const data = (window.flightMap && window.flightMap.flightData) || [];
        if (!data.length) return;

        const cityCoords = window.CITY_COORDINATES || {};
        const airportCoords = window.AIRPORT_COORDINATES || {};

        let longest = null, shortest = null, mostExpensive = null, cheapest = null, farthest = null, longestDist = null;
        let maxDur = -Infinity, minDur = Infinity, maxCost = -Infinity, minCost = Infinity, maxHomeDist = -Infinity, maxLegDist = -Infinity;

        data.forEach(j => {
            // Duration
            let hours = 0;
            if (j.type === 'flight' && j.duration) hours = parseDuration(j.duration);
            else if (j.type === 'land' && j.duration) hours = j.duration;

            if (hours > 0) {
                if (hours > maxDur) { maxDur = hours; longest = j; }
                if (hours < minDur) { minDur = hours; shortest = j; }
            }

            // Cost
            const cost = j.costSGD || j.actualCostSGD || 0;
            if (cost > 0) {
                if (cost > maxCost) { maxCost = cost; mostExpensive = j; }
                if (cost < minCost) { minCost = cost; cheapest = j; }
            }

            // Distance from home (use destination coords)
            let destCoords = null;
            if (j.type === 'land') {
                destCoords = cityCoords[j.destination];
            } else if (j.toCode) {
                destCoords = airportCoords[j.toCode];
            }
            if (destCoords) {
                const dist = haversine(HOME[0], HOME[1], destCoords[0], destCoords[1]);
                if (dist > maxHomeDist) { maxHomeDist = dist; farthest = j; }
            }

            // Longest single leg distance
            const legDist = j.distance || 0;
            if (legDist > maxLegDist) { maxLegDist = legDist; longestDist = j; }
        });

        // SVG icons loaded from asset/icons/records/
        const ICON_PATH = 'asset/icons/records/';
        const records = [
            { iconFile: 'clock', color: '#4CAF50', label: t('longestJourney'), journey: longest, value: longest ? formatDuration(maxDur) : '-' },
            { iconFile: 'bolt', color: '#4CAF50', label: t('shortestHop'), journey: shortest, value: shortest ? formatDuration(minDur) : '-' },
            { iconFile: 'ruler', color: '#4CAF50', label: t('longestDistanceRec'), journey: longestDist, value: longestDist ? `${maxLegDist.toLocaleString()} km` : '-' },
            { iconFile: 'dollar-up', color: '#4CAF50', label: t('mostExpensive'), journey: mostExpensive, value: mostExpensive ? `S$${maxCost.toFixed(0)}` : '-' },
            { iconFile: 'dollar-down', color: '#E53935', label: t('cheapestTrip'), journey: cheapest, value: cheapest ? `S$${minCost.toFixed(0)}` : '-' },
            { iconFile: 'globe', color: '#4CAF50', label: t('farthestFromHome'), journey: farthest, value: farthest ? `${Math.round(maxHomeDist).toLocaleString()} km` : '-' },
        ];

        let html = '<div class="records-grid">';
        records.forEach(r => {
            const route = r.journey ? getOriginDest(r.journey) : null;
            const _tf = window.translateCity || function(n) { return n; };
            const _locale = window.i18n && window.i18n.getLocale ? window.i18n.getLocale() : 'en-GB';
            const routeStr = route ? `${_tf(route.from)} → ${_tf(route.to)}` : '';
            const dateStr = r.journey?.date ? new Date(r.journey.date).toLocaleDateString(_locale, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
            html += `<div class="record-card">
                <div class="record-icon" data-icon="${r.iconFile}" data-color="${r.color}"></div>
                <div class="record-body">
                    <div class="record-label">${r.label}</div>
                    <div class="record-value">${r.value}</div>
                    <div class="record-route">${routeStr}</div>
                    <div class="record-date">${dateStr}</div>
                </div>
            </div>`;
        });
        html += '</div>';
        container.innerHTML = html;

        // Load SVG icons from files
        container.querySelectorAll('.record-icon[data-icon]').forEach(el => {
            const name = el.dataset.icon;
            const color = el.dataset.color || '#4CAF50';
            fetch(`${ICON_PATH}${name}.svg`)
                .then(r => r.text())
                .then(svg => {
                    el.innerHTML = svg.replace(/currentColor/g, color);
                })
                .catch(() => {}); // silently fail, icon just stays empty
        });
    }

    waitForData(render);
    window.addEventListener('langchange', render);
})();
