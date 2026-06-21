// Journey Timeline — Gantt-style horizontal bars colored by continent/region
(function () {
    'use strict';

    // Bar segment colours — one per sub-region. Sub-regions of the
    // same parent continent share a hue, varying in lightness so the
    // bar still reveals the sub-region breakdown.
    const SUBREGION_COLORS = {
        // Asia — greens, dark → pale
        'East Asia':       '#1B5E20',
        'Southeast Asia':  '#388E3C',
        'South Asia':      '#66BB6A',
        'West Asia':       '#A5D6A7',
        'Central Asia':    '#C5E1A5',
        // Europe — blues, dark → pale
        'Northern Europe': '#0D47A1',
        'Western Europe':  '#1976D2',
        'Southern Europe': '#42A5F5',
        'Eastern Europe':  '#90CAF9',
        // America — oranges, dark → pale
        'North America':   '#F57C00',
        'South America':   '#FFB74D',
        // Africa — purples, dark → pale
        'North Africa':    '#4A148C',
        'East Africa':     '#7B1FA2',
        'West Africa':     '#AB47BC',
        'Southern Africa': '#CE93D8',
        // Oceania — reds/corals, dark → pale (distinct hue from
        // European blues so the bars don't read as the same family)
        'Australasia':     '#B71C1C',
        'Melanesia':       '#E53935',
        'Micronesia':      '#EF5350',
        'Polynesia':       '#FFCDD2'
    };

    // Sub-region → parent continent (for the simplified 5-item legend).
    const SUBREGION_PARENT = {
        'East Asia': 'Asia', 'Southeast Asia': 'Asia', 'South Asia': 'Asia',
        'West Asia': 'Asia', 'Central Asia': 'Asia',
        'Northern Europe': 'Europe', 'Western Europe': 'Europe',
        'Southern Europe': 'Europe', 'Eastern Europe': 'Europe',
        'North America': 'America', 'South America': 'America',
        'North Africa': 'Africa', 'East Africa': 'Africa',
        'West Africa': 'Africa', 'Southern Africa': 'Africa',
        'Australasia': 'Oceania', 'Melanesia': 'Oceania',
        'Micronesia': 'Oceania', 'Polynesia': 'Oceania'
    };

    // Legend dot colours — mid-shade of each parent group.
    const CONTINENT_COLORS = {
        'Asia':    '#388E3C',
        'Europe':  '#1976D2',
        'America': '#F57C00',
        'Africa':  '#9C27B0',
        'Oceania': '#E53935'
    };

    const COUNTRY_CONTINENT = {
        'USA': 'North America', 'Canada': 'North America', 'Mexico': 'North America',
        'Colombia': 'South America', 'Peru': 'South America', 'Bolivia': 'South America', 'Chile': 'South America',
        // Northern Europe
        'UK': 'Northern Europe', 'Ireland': 'Northern Europe', 'Iceland': 'Northern Europe',
        'Sweden': 'Northern Europe', 'Norway': 'Northern Europe', 'Denmark': 'Northern Europe',
        'Finland': 'Northern Europe', 'Estonia': 'Northern Europe', 'Latvia': 'Northern Europe',
        'Lithuania': 'Northern Europe',
        // Western Europe
        'France': 'Western Europe', 'Netherlands': 'Western Europe', 'Belgium': 'Western Europe',
        'Germany': 'Western Europe', 'Switzerland': 'Western Europe', 'Austria': 'Western Europe',
        'Monaco': 'Western Europe',
        // Southern Europe
        'Italy': 'Southern Europe', 'Spain': 'Southern Europe', 'Portugal': 'Southern Europe',
        'Greece': 'Southern Europe', 'Malta': 'Southern Europe', 'Cyprus': 'Southern Europe',
        'Vatican City': 'Southern Europe', 'San Marino': 'Southern Europe',
        'Slovenia': 'Southern Europe', 'Croatia': 'Southern Europe',
        'Bosnia and Herzegovina': 'Southern Europe', 'Montenegro': 'Southern Europe',
        'Albania': 'Southern Europe', 'North Macedonia': 'Southern Europe', 'Serbia': 'Southern Europe',
        // Eastern Europe
        'Poland': 'Eastern Europe', 'Czech Republic': 'Eastern Europe', 'Slovakia': 'Eastern Europe',
        'Hungary': 'Eastern Europe', 'Romania': 'Eastern Europe', 'Bulgaria': 'Eastern Europe',
        'Belarus': 'Eastern Europe', 'Ukraine': 'Eastern Europe', 'Russia': 'Eastern Europe',
        'Moldova': 'Eastern Europe',
        'Japan': 'East Asia', 'ROK Korea': 'East Asia', 'DPR Korea': 'East Asia',
        'PR China': 'East Asia', 'ROC Taiwan': 'East Asia', 'Mongolia': 'East Asia',
        'Uzbekistan': 'Central Asia', 'Kazakhstan': 'Central Asia', 'Turkmenistan': 'Central Asia',
        'Kyrgyzstan': 'Central Asia', 'Tajikistan': 'Central Asia',
        'Singapore': 'Southeast Asia', 'Malaysia': 'Southeast Asia', 'Indonesia': 'Southeast Asia',
        'Myanmar': 'Southeast Asia', 'Thailand': 'Southeast Asia', 'Vietnam': 'Southeast Asia',
        'Laos': 'Southeast Asia', 'Cambodia': 'Southeast Asia', 'Philippines': 'Southeast Asia',
        'India': 'South Asia', 'Sri Lanka': 'South Asia', 'Bangladesh': 'South Asia', 'Bhutan': 'South Asia',
        'Pakistan': 'South Asia', 'Nepal': 'South Asia', 'Maldives': 'South Asia',
        'Israel': 'West Asia', 'Palestine': 'West Asia', 'Jordan': 'West Asia', 'Lebanon': 'West Asia',
        'Saudi Arabia': 'West Asia', 'UAE': 'West Asia', 'Oman': 'West Asia', 'Kuwait': 'West Asia',
        'Qatar': 'West Asia', 'Bahrain': 'West Asia',
        'Turkey': 'West Asia', 'Georgia': 'West Asia',
        'Armenia': 'West Asia', 'Azerbaijan': 'West Asia',
        // North Africa
        'Egypt': 'North Africa', 'Morocco': 'North Africa', 'Tunisia': 'North Africa',
        'Algeria': 'North Africa', 'Libya': 'North Africa', 'Sudan': 'North Africa',
        // East Africa
        'Kenya': 'East Africa', 'Ethiopia': 'East Africa', 'Tanzania': 'East Africa',
        'Uganda': 'East Africa', 'Rwanda': 'East Africa',
        // West Africa
        'Nigeria': 'West Africa', 'Ghana': 'West Africa', 'Senegal': 'West Africa',
        // Southern Africa
        'South Africa': 'Southern Africa', 'Namibia': 'Southern Africa',
        'Botswana': 'Southern Africa', 'Zimbabwe': 'Southern Africa',
        // Australasia
        'Australia': 'Australasia', 'New Zealand': 'Australasia',
        // Melanesia
        'Papua New Guinea': 'Melanesia', 'Fiji': 'Melanesia',
        'Solomon Islands': 'Melanesia', 'Vanuatu': 'Melanesia',
        'New Caledonia': 'Melanesia',
        // Micronesia
        'Guam': 'Micronesia', 'Kiribati': 'Micronesia',
        'Marshall Islands': 'Micronesia', 'Micronesia': 'Micronesia',
        'Nauru': 'Micronesia', 'Palau': 'Micronesia',
        // Polynesia
        'Samoa': 'Polynesia', 'Tonga': 'Polynesia',
        'Tuvalu': 'Polynesia', 'French Polynesia': 'Polynesia',
        'Cook Islands': 'Polynesia', 'Niue': 'Polynesia',
        'British Overseas Territory': 'Northern Europe'
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
            const continent = COUNTRY_CONTINENT[country] || 'East Asia';

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
            let max = 0, primary = 'East Asia';
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

        // Trip bars — split per trip by continent share so minority
        // continents (e.g. an Egypt stop in a mostly-European trip) are
        // visible instead of being hidden under the primary colour.
        // tripMeta[idx] holds the per-trip data the hover handler uses
        // to render the iPhone-storage-style breakdown popover.
        const tripMeta = [];
        trips.forEach((t, idx) => {
            const x1 = xPos(t.start);
            const dur = Math.max(t.end - t.start, 86400000); // min 1 day width
            const x2 = xPos(new Date(t.start.getTime() + dur));
            const w = Math.max(x2 - x1, 3);
            const _locale = window.i18n && window.i18n.getLocale ? window.i18n.getLocale() : 'en-GB';
            const dateRange = `${t.start.toLocaleDateString(_locale, {day:'numeric',month:'short',year:'numeric'})} – ${t.end.toLocaleDateString(_locale, {day:'numeric',month:'short',year:'numeric'})}`;
            const countries = t.countriesArr.map(function(c){ return window.translateCountry ? window.translateCountry(c) : c; }).join(', ');
            const totalLegs = t.legs || 1;
            // Sort continents by leg count desc so the primary anchors
            // the left edge of the bar (where rounded corner sits).
            const segs = Object.entries(t.continents).sort((a, b) => b[1] - a[1]);
            tripMeta[idx] = { dateRange, countries, totalLegs, segs };
            const groupId = `tripclip_${idx}`;
            // Clip-path with rounded corners applied to the whole group;
            // individual segments are plain rects so the rounding only
            // affects the outer ends.
            svg += `<defs><clipPath id="${groupId}"><rect x="${x1}" y="${barY}" width="${w}" height="${barH}" rx="3"/></clipPath></defs>`;
            svg += `<g clip-path="url(#${groupId})">`;
            let cursorX = x1;
            segs.forEach(([c, n]) => {
                const segW = (n / totalLegs) * w;
                const color = SUBREGION_COLORS[c] || '#666';
                svg += `<rect x="${cursorX}" y="${barY}" width="${segW}" height="${barH}" fill="${color}" opacity="0.9"
                    data-trip-idx="${idx}"/>`;
                cursorX += segW;
            });
            svg += `</g>`;
        });

        svg += `</svg>`;

        // Continent legend — collapse sub-regions back to their parent
        // continent so the legend stays at 5 broad labels even though
        // the bars still show the sub-region breakdown via hue shading.
        // Aggregate per-parent-continent breakdown across all trips so
        // hovering a legend dot shows the sub-region split for that
        // continent (same iPhone-storage popover as the bars).
        const parentBreakdown = {};
        trips.forEach(t => Object.entries(t.continents).forEach(([sub, n]) => {
            const parent = SUBREGION_PARENT[sub] || sub;
            if (!parentBreakdown[parent]) parentBreakdown[parent] = { total: 0, subs: {} };
            parentBreakdown[parent].total += n;
            parentBreakdown[parent].subs[sub] = (parentBreakdown[parent].subs[sub] || 0) + n;
        }));
        const usedParents = new Set(Object.keys(parentBreakdown));
        let legend = '<div class="timeline-legend">';
        const CONTINENT_I18N = { 'Asia': 'asia', 'Europe': 'europe', 'America': 'americas', 'Africa': 'africa', 'Oceania': 'oceania' };
        const _t2 = window.i18n ? window.i18n.t : function(k){return k;};
        // Canonical legend order
        ['Asia', 'Europe', 'America', 'Africa', 'Oceania'].forEach(c => {
            if (!usedParents.has(c)) return;
            const label = CONTINENT_I18N[c] ? _t2(CONTINENT_I18N[c]) : c;
            legend += `<span class="timeline-legend-item" data-continent="${c}" style="cursor:pointer;"><span class="timeline-dot" style="background:${CONTINENT_COLORS[c] || '#666'}"></span>${label}</span>`;
        });
        legend += '</div>';

        container.innerHTML = svg + legend;

        // Styled tooltip — iPhone-storage-style stacked breakdown
        // showing each continent's share of the trip.
        const tip = document.createElement('div');
        tip.className = 'widget-row-tooltip';
        document.body.appendChild(tip);
        const svgEl = container.querySelector('svg');
        const _tLegs = window.i18n ? window.i18n.t('legs') : 'legs';
        function renderTip(meta) {
            const { dateRange, countries, totalLegs, segs } = meta;
            // Stacked bar — each segment proportional to leg share,
            // coloured by sub-region so the breakdown shows the same
            // shading as the main bar.
            const stackBar = segs.map(([c, n]) => {
                const pct = (n / totalLegs) * 100;
                const color = SUBREGION_COLORS[c] || '#666';
                return `<span style="background:${color};width:${pct.toFixed(2)}%;display:inline-block;height:100%;"></span>`;
            }).join('');
            // Per-sub-region rows — colour dot + label + leg count.
            const rows = segs.map(([c, n]) => {
                const color = SUBREGION_COLORS[c] || '#666';
                return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;line-height:1.5;">
                    <span style="width:8px;height:8px;border-radius:50%;background:${color};flex:0 0 8px;"></span>
                    <span style="flex:1;color:#ccc;">${c}</span>
                    <span style="color:#888;font-variant-numeric:tabular-nums;">${n} ${_tLegs}</span>
                </div>`;
            }).join('');
            return `<div class="tip-label">${dateRange}</div>
                <div style="font-size:10.5px;color:#aaa;margin:2px 0 6px;">${countries}</div>
                <div style="display:flex;height:8px;width:200px;border-radius:4px;overflow:hidden;background:#222;margin-bottom:8px;">${stackBar}</div>
                <div>${rows}</div>`;
        }
        svgEl.addEventListener('pointermove', function (e) {
            const bar = e.target.closest('rect[data-trip-idx]');
            if (!bar) { tip.style.display = 'none'; return; }
            const meta = tripMeta[+bar.dataset.tripIdx];
            if (!meta) { tip.style.display = 'none'; return; }
            tip.innerHTML = renderTip(meta);
            tip.style.display = 'block';
            tip.style.left = e.clientX + 'px';
            tip.style.top = (e.clientY - 12) + 'px';
        });
        svgEl.addEventListener('pointerleave', () => { tip.style.display = 'none'; });

        // Legend hover — show the same iPhone-storage breakdown but
        // aggregated across all trips, for the hovered parent continent.
        function renderLegendTip(parent) {
            const data = parentBreakdown[parent];
            if (!data) return '';
            // Sort sub-regions by leg count desc.
            const subs = Object.entries(data.subs).sort((a, b) => b[1] - a[1]);
            const total = data.total;
            const stackBar = subs.map(([s, n]) => {
                const pct = (n / total) * 100;
                const color = SUBREGION_COLORS[s] || '#666';
                return `<span style="background:${color};width:${pct.toFixed(2)}%;display:inline-block;height:100%;"></span>`;
            }).join('');
            const rows = subs.map(([s, n]) => {
                const color = SUBREGION_COLORS[s] || '#666';
                return `<div style="display:flex;align-items:center;gap:6px;font-size:11px;line-height:1.5;">
                    <span style="width:8px;height:8px;border-radius:50%;background:${color};flex:0 0 8px;"></span>
                    <span style="flex:1;color:#ccc;">${s}</span>
                    <span style="color:#888;font-variant-numeric:tabular-nums;">${n} ${_tLegs}</span>
                </div>`;
            }).join('');
            const headerLabel = CONTINENT_I18N[parent] ? _t2(CONTINENT_I18N[parent]) : parent;
            return `<div class="tip-label">${headerLabel}</div>
                <div style="font-size:10.5px;color:#aaa;margin:2px 0 6px;">${total} ${_tLegs}</div>
                <div style="display:flex;height:8px;width:200px;border-radius:4px;overflow:hidden;background:#222;margin-bottom:8px;">${stackBar}</div>
                <div>${rows}</div>`;
        }
        const legendEl = container.querySelector('.timeline-legend');
        if (legendEl) {
            legendEl.addEventListener('pointermove', function (e) {
                const item = e.target.closest('.timeline-legend-item[data-continent]');
                if (!item) { tip.style.display = 'none'; return; }
                tip.innerHTML = renderLegendTip(item.dataset.continent);
                tip.style.display = 'block';
                tip.style.left = e.clientX + 'px';
                tip.style.top = (e.clientY - 12) + 'px';
            });
            legendEl.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
        }
    }

    waitForData(render);
    window.addEventListener('langchange', function() { render(); });
})();
