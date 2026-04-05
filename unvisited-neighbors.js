// Unvisited Neighbors — Leaflet mini map with GeoJSON country polygons
(function () {
    'use strict';

    const BORDERS = {
        'USA': ['Canada', 'Mexico'],
        'Canada': ['USA'],
        'Mexico': ['USA'],
        'Colombia': ['Peru', 'Brazil', 'Venezuela', 'Ecuador', 'Panama'],
        'Peru': ['Colombia', 'Bolivia', 'Chile', 'Brazil', 'Ecuador'],
        'Bolivia': ['Peru', 'Chile', 'Brazil', 'Argentina', 'Paraguay'],
        'Chile': ['Peru', 'Bolivia', 'Argentina'],
        'Italy': ['France', 'Switzerland', 'Austria', 'Slovenia', 'San Marino', 'Vatican City'],
        'France': ['Belgium', 'Spain', 'Germany', 'Switzerland', 'Italy', 'Monaco', 'Andorra'],
        'UK': ['Ireland'],
        'Netherlands': ['Belgium', 'Germany'],
        'Spain': ['France', 'Portugal', 'Andorra', 'Morocco'],
        'Germany': ['France', 'Netherlands', 'Belgium', 'Denmark', 'Poland', 'Czech Republic', 'Austria', 'Switzerland'],
        'Switzerland': ['France', 'Germany', 'Austria', 'Italy', 'Liechtenstein'],
        'Austria': ['Germany', 'Czech Republic', 'Slovakia', 'Hungary', 'Slovenia', 'Italy', 'Switzerland', 'Liechtenstein'],
        'Czech Republic': ['Germany', 'Poland', 'Slovakia', 'Austria'],
        'Poland': ['Germany', 'Czech Republic', 'Slovakia', 'Ukraine', 'Belarus', 'Lithuania', 'Russia'],
        'Hungary': ['Austria', 'Slovakia', 'Ukraine', 'Romania', 'Serbia', 'Croatia', 'Slovenia'],
        'Romania': ['Hungary', 'Ukraine', 'Moldova', 'Bulgaria', 'Serbia'],
        'Bulgaria': ['Romania', 'Serbia', 'North Macedonia', 'Greece', 'Turkey'],
        'Serbia': ['Hungary', 'Romania', 'Bulgaria', 'North Macedonia', 'Albania', 'Montenegro', 'Bosnia and Herzegovina', 'Croatia'],
        'Bosnia and Herzegovina': ['Serbia', 'Montenegro', 'Croatia'],
        'Montenegro': ['Serbia', 'Bosnia and Herzegovina', 'Albania', 'Croatia'],
        'Albania': ['Montenegro', 'Serbia', 'North Macedonia', 'Greece'],
        'Sweden': ['Norway', 'Finland', 'Denmark'],
        'Denmark': ['Germany', 'Sweden', 'Norway'],
        'Norway': ['Sweden', 'Finland', 'Russia', 'Denmark'],
        'Iceland': [],
        'Finland': ['Sweden', 'Norway', 'Russia'],
        'Greece': ['Albania', 'North Macedonia', 'Bulgaria', 'Turkey'],
        'Portugal': ['Spain'],
        'Malta': ['Italy'],
        'Turkey': ['Greece', 'Bulgaria', 'Georgia', 'Armenia', 'Azerbaijan', 'Iran', 'Iraq', 'Syria'],
        'Cyprus': ['Turkey'],
        'Belgium': ['France', 'Netherlands', 'Germany'],
        'Japan': ['South Korea', 'China', 'ROC (Taiwan)'],
        'South Korea': ['North Korea', 'Japan'],
        'China': ['North Korea', 'South Korea', 'Japan', 'ROC (Taiwan)', 'Mongolia', 'Russia', 'Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Afghanistan', 'Pakistan', 'India', 'Nepal', 'Bhutan', 'Myanmar', 'Laos', 'Vietnam'],
        'North Korea': ['South Korea', 'China', 'Russia'],
        'ROC (Taiwan)': ['China', 'Japan', 'Philippines'],
        'Singapore': ['Malaysia', 'Indonesia'],
        'Malaysia': ['Singapore', 'Indonesia', 'Thailand', 'Brunei'],
        'Indonesia': ['Malaysia', 'Singapore', 'Timor-Leste', 'Papua New Guinea'],
        'Myanmar': ['China', 'India', 'Bangladesh', 'Laos', 'Thailand'],
        'Sri Lanka': ['India'],
        'Thailand': ['Myanmar', 'Laos', 'Cambodia', 'Malaysia'],
        'Vietnam': ['China', 'Laos', 'Cambodia'],
        'Laos': ['China', 'Myanmar', 'Thailand', 'Vietnam', 'Cambodia'],
        'Cambodia': ['Thailand', 'Laos', 'Vietnam'],
        'Philippines': ['ROC (Taiwan)', 'Malaysia', 'Indonesia'],
        'India': ['Pakistan', 'China', 'Nepal', 'Bhutan', 'Bangladesh', 'Myanmar', 'Sri Lanka'],
        'Bangladesh': ['India', 'Myanmar'],
        'Bhutan': ['China', 'India'],
        'Uzbekistan': ['Kazakhstan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Afghanistan'],
        'Kazakhstan': ['Russia', 'China', 'Kyrgyzstan', 'Uzbekistan', 'Turkmenistan'],
        'Turkmenistan': ['Kazakhstan', 'Uzbekistan', 'Afghanistan', 'Iran'],
        'Mongolia': ['China', 'Russia'],
        'Russia': ['Norway', 'Finland', 'Estonia', 'Latvia', 'Lithuania', 'Poland', 'Belarus', 'Ukraine', 'Georgia', 'Azerbaijan', 'Kazakhstan', 'China', 'Mongolia', 'North Korea'],
        'Estonia': ['Russia', 'Latvia', 'Finland'],
        'Ukraine': ['Poland', 'Slovakia', 'Hungary', 'Romania', 'Moldova', 'Russia', 'Belarus'],
        'Georgia': ['Russia', 'Turkey', 'Armenia', 'Azerbaijan'],
        'Armenia': ['Georgia', 'Turkey', 'Azerbaijan', 'Iran'],
        'Azerbaijan': ['Russia', 'Georgia', 'Armenia', 'Iran', 'Turkey'],
        'Israel': ['Palestine', 'Jordan', 'Egypt', 'Lebanon', 'Syria'],
        'Palestine': ['Israel', 'Jordan', 'Egypt'],
        'Jordan': ['Israel', 'Palestine', 'Syria', 'Iraq', 'Saudi Arabia', 'Egypt'],
        'Lebanon': ['Israel', 'Syria'],
        'Egypt': ['Israel', 'Palestine', 'Libya', 'Sudan', 'Jordan'],
        'Morocco': ['Algeria', 'Spain'],
        'Tunisia': ['Algeria', 'Libya'],
        'Algeria': ['Morocco', 'Tunisia', 'Libya', 'Niger', 'Mali', 'Mauritania'],
        'South Africa': ['Namibia', 'Botswana', 'Zimbabwe', 'Mozambique', 'Eswatini', 'Lesotho'],
        'Kenya': ['Ethiopia', 'Somalia', 'South Sudan', 'Uganda', 'Tanzania'],
        'Ethiopia': ['Kenya', 'Somalia', 'Djibouti', 'Eritrea', 'Sudan', 'South Sudan'],
        'Nigeria': ['Benin', 'Niger', 'Chad', 'Cameroon'],
        'Australia': ['Indonesia', 'Papua New Guinea', 'New Zealand'],
        'New Zealand': ['Australia'],
        'UAE': ['Saudi Arabia', 'Oman'],
        'Qatar': ['Saudi Arabia'],
        'Kuwait': ['Saudi Arabia', 'Iraq'],
        'Saudi Arabia': ['UAE', 'Oman', 'Yemen', 'Jordan', 'Iraq', 'Kuwait', 'Qatar', 'Bahrain'],
        'Oman': ['UAE', 'Saudi Arabia', 'Yemen'],
        'Bahrain': ['Saudi Arabia'],
        'Monaco': ['France'],
        'Vatican City': ['Italy'],
        'San Marino': ['Italy'],
        'North Macedonia': ['Serbia', 'Bulgaria', 'Greece', 'Albania'],
        'Slovenia': ['Italy', 'Austria', 'Hungary', 'Croatia'],
        'Croatia': ['Slovenia', 'Hungary', 'Serbia', 'Bosnia and Herzegovina', 'Montenegro'],
        'Slovakia': ['Czech Republic', 'Poland', 'Ukraine', 'Hungary', 'Austria'],
        'Ireland': ['UK']
    };

    // Map GeoJSON NAME → app country names
    const NAME_MAP = {
        'United States of America': 'USA',
        'United Kingdom': 'UK',
        'Czechia': 'Czech Republic',
        'Bosnia and Herz.': 'Bosnia and Herzegovina',
        'United Arab Emirates': 'UAE',
        'Taiwan': 'ROC (Taiwan)',
        'Myanmar': 'Myanmar',
        'Dem. Rep. Korea': 'North Korea',
        'Korea': 'South Korea',
        'Macedonia': 'North Macedonia',
        'eSwatini': 'Eswatini',
        'Lao PDR': 'Laos',
        'Palestinian Territories': 'Palestine'
    };

    function waitForData(cb) {
        const id = setInterval(() => {
            if (window.flightMap && window.flightMap.cities && window.flightMap.cities.length > 0) {
                clearInterval(id);
                cb();
            }
        }, 500);
    }

    function getVisitedCountries() {
        const data = (window.flightMap && window.flightMap.flightData) || [];
        const countryMap = window.AIRPORT_TO_COUNTRY || {};
        const cityCountryMap = window.CITY_TO_COUNTRY || {};
        const visited = new Set();

        data.forEach(j => {
            if (j.type === 'land') {
                const c1 = cityCountryMap[j.origin];
                const c2 = cityCountryMap[j.destination];
                if (c1) visited.add(c1);
                if (c2) visited.add(c2);
            } else {
                const fromCode = j.fromCode || (j.from && j.from.match(/\(([A-Z]{3})\//)?.[1]);
                const toCode = j.toCode || (j.to && j.to.match(/\(([A-Z]{3})\//)?.[1]);
                const fc = countryMap[fromCode];
                const tc = countryMap[toCode];
                if (fc) visited.add(fc);
                if (tc) visited.add(tc);
            }
        });
        return visited;
    }

    function render() {
        const container = document.getElementById('unvisitedNeighbors');
        if (!container) return;

        const visited = getVisitedCountries();
        const unvisitedNeighborMap = {}; // country → [bordered by...]

        visited.forEach(country => {
            const neighbors = BORDERS[country] || [];
            neighbors.forEach(n => {
                if (!visited.has(n)) {
                    if (!unvisitedNeighborMap[n]) unvisitedNeighborMap[n] = [];
                    if (!unvisitedNeighborMap[n].includes(country)) {
                        unvisitedNeighborMap[n].push(country);
                    }
                }
            });
        });

        const unvisited = Object.keys(unvisitedNeighborMap).sort();

        // Leaflet map
        const mapDiv = document.createElement('div');
        mapDiv.style.width = '100%';
        mapDiv.style.height = '400px';
        mapDiv.style.borderRadius = '6px';
        container.innerHTML = '';
        container.appendChild(mapDiv);

        const map = L.map(mapDiv, {
            center: [20, 30],
            zoom: 2,
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: false,
            dragging: true,
            doubleClickZoom: false,
            touchZoom: false,
            worldCopyJump: true,
            maxBounds: [[-85, -Infinity], [85, Infinity]],
            maxBoundsViscosity: 1.0
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            maxZoom: 6,
            minZoom: 1
        }).addTo(map);

        // Load GeoJSON and color countries
        fetch('asset/ne_110m_countries.geojson')
            .then(r => r.json())
            .then(geo => {
                L.geoJSON(geo, {
                    style: function (feature) {
                        const geoName = feature.properties.NAME;
                        const appName = NAME_MAP[geoName] || geoName;

                        if (visited.has(appName)) {
                            return {
                                fillColor: '#4CAF50',
                                fillOpacity: 0.45,
                                color: '#4CAF50',
                                weight: 1,
                                opacity: 0.6
                            };
                        }
                        if (unvisitedNeighborMap[appName]) {
                            return {
                                fillColor: '#FFB74D',
                                fillOpacity: 0.5,
                                color: '#FFB74D',
                                weight: 1.5,
                                opacity: 0.8
                            };
                        }
                        // Other countries — very dim
                        return {
                            fillColor: '#fff',
                            fillOpacity: 0.02,
                            color: '#444',
                            weight: 0.3,
                            opacity: 0.3
                        };
                    },
                    onEachFeature: function (feature, layer) {
                        const geoName = feature.properties.NAME;
                        const appName = NAME_MAP[geoName] || geoName;

                        if (visited.has(appName)) {
                            layer.bindTooltip(`<b>${appName}</b><br>Visited`, {
                                className: 'widget-map-tooltip',
                                sticky: true
                            });
                            layer.on('mouseover', function () {
                                this.setStyle({ weight: 2, fillOpacity: 0.7 });
                                this.bringToFront();
                            });
                            layer.on('mouseout', function () {
                                this.setStyle({ weight: 1, fillOpacity: 0.45 });
                            });
                        } else if (unvisitedNeighborMap[appName]) {
                            const borderedBy = unvisitedNeighborMap[appName];
                            layer.bindTooltip(`<b>${appName}</b><br>Borders: ${borderedBy.join(', ')}`, {
                                className: 'widget-map-tooltip',
                                sticky: true
                            });
                            layer.on('mouseover', function () {
                                this.setStyle({ weight: 2.5, fillOpacity: 0.8 });
                                this.bringToFront();
                            });
                            layer.on('mouseout', function () {
                                this.setStyle({ weight: 1.5, fillOpacity: 0.5 });
                            });
                        }
                    }
                }).addTo(map);
            });

        // Legend + tag list
        let legend = `<div class="neighbors-legend">
            <span class="neighbors-legend-item"><span class="neighbors-dot visited"></span>Visited (${visited.size})</span>
            <span class="neighbors-legend-item"><span class="neighbors-dot unvisited"></span>Unvisited Neighbors (${unvisited.length})</span>
        </div>`;
        legend += '<div class="neighbors-list">';
        unvisited.forEach(c => {
            const borderedBy = unvisitedNeighborMap[c] || [];
            const tipVal = borderedBy.length ? borderedBy.join(', ') : '—';
            legend += `<span class="neighbor-tag" data-tip-label="${c}" data-tip-val="${tipVal}">${c}</span>`;
        });
        legend += '</div>';
        container.insertAdjacentHTML('beforeend', legend);

        const tip = document.createElement('div');
        tip.className = 'widget-row-tooltip';
        document.body.appendChild(tip);
        const tagList = container.querySelector('.neighbors-list');
        tagList.addEventListener('mousemove', function (e) {
            const tag = e.target.closest('.neighbor-tag');
            if (!tag) { tip.style.display = 'none'; return; }
            tip.innerHTML = `<div class="tip-label">${tag.dataset.tipLabel}</div><div class="tip-val">${tag.dataset.tipVal}</div>`;
            tip.style.display = 'block';
            tip.style.left = e.clientX + 'px';
            tip.style.top = (e.clientY - 12) + 'px';
        });
        tagList.addEventListener('mouseleave', () => { tip.style.display = 'none'; });

        setTimeout(() => map.invalidateSize(), 600);
    }

    waitForData(render);
})();
