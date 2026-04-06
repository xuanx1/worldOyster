// Journey Timeline — Gantt-style horizontal bars colored by continent/region
(function () {
    'use strict';

    const CONTINENT_COLORS = {
        'Asia': '#4CAF50',
        'Europe': '#2196F3',
        'North America': '#FF9800',
        'South America': '#E91E63',
        'Africa': '#9C27B0',
        'Oceania': '#00BCD4',
        'Middle East': '#FFC107'
    };

    const COUNTRY_CONTINENT = {
        'USA': 'North America', 'Canada': 'North America', 'Mexico': 'North America',
        'Colombia': 'South America', 'Peru': 'South America', 'Bolivia': 'South America', 'Chile': 'South America',
        'Italy': 'Europe', 'France': 'Europe', 'UK': 'Europe', 'Netherlands': 'Europe', 'Spain': 'Europe',
        'Germany': 'Europe', 'Switzerland': 'Europe', 'Austria': 'Europe', 'Czech Republic': 'Europe',
        'Poland': 'Europe', 'Hungary': 'Europe', 'Romania': 'Europe', 'Bulgaria': 'Europe', 'Serbia': 'Europe',
        'Bosnia and Herzegovina': 'Europe', 'Montenegro': 'Europe', 'Albania': 'Europe', 'Sweden': 'Europe',
        'Denmark': 'Europe', 'Norway': 'Europe', 'Iceland': 'Europe', 'Finland': 'Europe', 'Greece': 'Europe',
        'Portugal': 'Europe', 'Malta': 'Europe', 'Cyprus': 'Europe', 'Belgium': 'Europe',
        'Estonia': 'Europe', 'Ukraine': 'Europe', 'Russia': 'Europe', 'Monaco': 'Europe',
        'Vatican City': 'Europe', 'San Marino': 'Europe', 'North Macedonia': 'Europe', 'Slovenia': 'Europe',
        'Croatia': 'Europe', 'Slovakia': 'Europe', 'Ireland': 'Europe',
        'Turkey': 'Europe', 'Georgia': 'Europe', 'Armenia': 'Europe', 'Azerbaijan': 'Europe',
        'Japan': 'Asia', 'South Korea': 'Asia', 'North Korea': 'Asia', 'China': 'Asia',
        'ROC (Taiwan)': 'Asia', 'Singapore': 'Asia', 'Malaysia': 'Asia', 'Indonesia': 'Asia',
        'Myanmar': 'Asia', 'Thailand': 'Asia', 'Vietnam': 'Asia', 'Laos': 'Asia', 'Cambodia': 'Asia',
        'Philippines': 'Asia', 'India': 'Asia', 'Sri Lanka': 'Asia', 'Bangladesh': 'Asia', 'Bhutan': 'Asia',
        'Uzbekistan': 'Asia', 'Kazakhstan': 'Asia', 'Turkmenistan': 'Asia', 'Mongolia': 'Asia',
        'Israel': 'Middle East', 'Palestine': 'Middle East', 'Jordan': 'Middle East', 'Lebanon': 'Middle East',
        'Saudi Arabia': 'Middle East', 'UAE': 'Middle East', 'Oman': 'Middle East', 'Kuwait': 'Middle East',
        'Qatar': 'Middle East', 'Bahrain': 'Middle East',
        'Egypt': 'Africa', 'Morocco': 'Africa', 'Tunisia': 'Africa', 'Algeria': 'Africa',
        'South Africa': 'Africa', 'Kenya': 'Africa', 'Ethiopia': 'Africa', 'Nigeria': 'Africa',
        'Australia': 'Oceania', 'New Zealand': 'Oceania',
        'British Overseas Territory': 'Europe'
    };

    function waitForData(cb) {
        const id = setInterval(() => {
            if (window.flightMap && window.flightMap.cities && window.flightMap.cities.length > 0) {
                clearInterval(id);
                cb();
            }
        }, 500);
    }

    function clusterTrips() {
        const data = (window.flightMap && window.flightMap.flightData) || [];
        const countryMap = window.AIRPORT_TO_COUNTRY || {};
        const cityCountryMap = window.CITY_TO_COUNTRY || {};

        if (!data.length) return [];

        // Cluster: legs within 3 days of each other = same trip
        const GAP_DAYS = 3;
        const trips = [];
        let current = null;

        data.forEach(j => {
            if (!j.date) return;
            const d = new Date(j.date);
            if (isNaN(d)) return;

            // Determine country and continent
            let country = null;
            if (j.type === 'land') {
                country = cityCountryMap[j.destination] || cityCountryMap[j.origin];
            } else {
                country = countryMap[j.toCode] || countryMap[j.fromCode];
            }
            const continent = COUNTRY_CONTINENT[country] || 'Asia';

            if (current && (d - current.end) / 86400000 <= GAP_DAYS) {
                // Extend current trip
                current.end = d > current.end ? d : current.end;
                current.legs++;
                if (!current.countries.has(country)) current.countries.add(country);
                if (!current.continents[continent]) current.continents[continent] = 0;
                current.continents[continent]++;
            } else {
                // New trip
                if (current) trips.push(current);
                current = {
                    start: d,
                    end: d,
                    legs: 1,
                    countries: new Set([country]),
                    continents: { [continent]: 1 },
                    primaryContinent: continent
                };
            }
        });
        if (current) trips.push(current);

        // Determine primary continent per trip
        trips.forEach(t => {
            let max = 0, primary = 'Asia';
            Object.entries(t.continents).forEach(([c, n]) => {
                if (n > max) { max = n; primary = c; }
            });
            t.primaryContinent = primary;
            t.countriesArr = [...t.countries].filter(Boolean);
        });

        return trips;
    }

    function render() {
        const container = document.getElementById('journeyTimeline');
        if (!container) return;

        const trips = clusterTrips();
        if (!trips.length) { container.innerHTML = `<div style="color:#666;font-size:12px;">${window.i18n ? window.i18n.t('noData') : 'No data'}</div>`; return; }

        const minDate = trips[0].start;
        const maxDate = trips[trips.length - 1].end;
        const totalMs = maxDate - minDate || 1;

        const W = 1000, H = 60, PAD_L = 0, PAD_R = 0;
        const barH = 20, barY = 24;
        const chartW = W - PAD_L - PAD_R;

        function xPos(d) { return PAD_L + ((d - minDate) / totalMs) * chartW; }

        let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="display:block;width:100%;height:auto;">`;

        // Year markers
        const startYear = minDate.getFullYear();
        const endYear = maxDate.getFullYear();
        for (let y = startYear; y <= endYear; y++) {
            const x = xPos(new Date(y, 0, 1));
            svg += `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#333" stroke-width="0.5"/>`;
            svg += `<text x="${x + 3}" y="11" fill="#888" font-size="12" font-weight="600" font-family="inherit">${y}</text>`;
        }

        // Trip bars
        trips.forEach((t, idx) => {
            const x1 = xPos(t.start);
            const dur = Math.max(t.end - t.start, 86400000); // min 1 day width
            const x2 = xPos(new Date(t.start.getTime() + dur));
            const w = Math.max(x2 - x1, 3);
            const color = CONTINENT_COLORS[t.primaryContinent] || '#666';
            const dateRange = `${t.start.toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})} – ${t.end.toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'})}`;
            const countries = t.countriesArr.map(function(c){ return window.translateCountry ? window.translateCountry(c) : c; }).join(', ');
            const _t = window.i18n ? window.i18n.t : function(k){return k;};
            svg += `<rect x="${x1}" y="${barY}" width="${w}" height="${barH}" rx="3" fill="${color}" opacity="0.8"
                data-tip-label="${dateRange}" data-tip-val="${countries} (${t.legs} ${_t('legs')})"/>`;
        });

        svg += `</svg>`;

        // Continent legend
        const usedContinents = new Set(trips.map(t => t.primaryContinent));
        let legend = '<div class="timeline-legend">';
        const CONTINENT_I18N = { 'Asia': 'asia', 'Europe': 'europe', 'North America': 'northAmerica', 'South America': 'southAmerica', 'Africa': 'africa', 'Oceania': 'oceania', 'Middle East': 'middleEast' };
        const _t2 = window.i18n ? window.i18n.t : function(k){return k;};
        usedContinents.forEach(c => {
            const label = CONTINENT_I18N[c] ? _t2(CONTINENT_I18N[c]) : c;
            legend += `<span class="timeline-legend-item"><span class="timeline-dot" style="background:${CONTINENT_COLORS[c] || '#666'}"></span>${label}</span>`;
        });
        legend += '</div>';

        container.innerHTML = svg + legend;

        // Styled tooltip
        const tip = document.createElement('div');
        tip.className = 'widget-row-tooltip';
        document.body.appendChild(tip);
        const svgEl = container.querySelector('svg');
        svgEl.addEventListener('mousemove', function (e) {
            const bar = e.target.closest('rect[data-tip-label]');
            if (!bar) { tip.style.display = 'none'; return; }
            tip.innerHTML = `<div class="tip-label">${bar.dataset.tipLabel}</div><div class="tip-val">${bar.dataset.tipVal}</div>`;
            tip.style.display = 'block';
            tip.style.left = e.clientX + 'px';
            tip.style.top = (e.clientY - 12) + 'px';
        });
        svgEl.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    }

    waitForData(render);
    window.addEventListener('langchange', function() { render(); });
})();
