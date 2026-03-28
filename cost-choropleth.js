// Cost per Country — Leaflet choropleth map with GeoJSON country polygons
(function () {
    'use strict';

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

    function collectCountrySpend() {
        const data = (window.flightMap && window.flightMap.flightData) || [];
        const countryMap = window.AIRPORT_TO_COUNTRY || {};
        const cityCountryMap = window.CITY_TO_COUNTRY || {};
        const spend = {};

        data.forEach(j => {
            let country = null;
            const cost = j.costSGD || j.actualCostSGD || 0;

            if (j.type === 'land') {
                country = cityCountryMap[j.destination] || cityCountryMap[j.origin];
            } else {
                const toCode = j.toCode || (j.to && j.to.match(/\(([A-Z]{3})\//)?.[1]);
                country = countryMap[toCode];
            }

            if (country && cost > 0) {
                spend[country] = (spend[country] || 0) + cost;
            }
        });
        return spend;
    }

    function heatColor(t) {
        let r, g, b;
        if (t < 0.5) {
            const p = t * 2;
            r = Math.round(255 * p);
            g = 200 + Math.round(55 * (1 - p));
            b = 50;
        } else {
            const p = (t - 0.5) * 2;
            r = 255;
            g = Math.round(255 * (1 - p));
            b = 50;
        }
        return `rgb(${r},${g},${b})`;
    }

    function render() {
        const container = document.getElementById('costChoropleth');
        if (!container) return;

        const spend = collectCountrySpend();
        const entries = Object.entries(spend).sort((a, b) => b[1] - a[1]);
        const maxSpend = entries.length ? entries[0][1] : 1;

        container.innerHTML = '';

        // Wrapper: map left, ranking right
        const wrapper = document.createElement('div');
        wrapper.className = 'choropleth-wrapper';
        container.appendChild(wrapper);

        const mapDiv = document.createElement('div');
        mapDiv.className = 'choropleth-map';
        wrapper.appendChild(mapDiv);

        const map = L.map(mapDiv, {
            center: [20, 30],
            zoom: 2,
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: false,
            dragging: true,
            doubleClickZoom: false,
            touchZoom: false
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
                        const s = spend[appName];

                        if (s) {
                            const intensity = Math.log(s + 1) / Math.log(maxSpend + 1);
                            const color = heatColor(intensity);
                            return {
                                fillColor: color,
                                fillOpacity: 0.5 + intensity * 0.35,
                                color: color,
                                weight: 1,
                                opacity: 0.6
                            };
                        }
                        // Unvisited — very dim
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
                        const s = spend[appName];

                        if (s) {
                            const valFmt = s >= 1000 ? 'S$' + (s / 1000).toFixed(1) + 'k' : 'S$' + s.toFixed(0);
                            layer.bindTooltip(`<b>${appName}</b><br>${valFmt}`, {
                                className: 'widget-map-tooltip',
                                sticky: true
                            });
                        }

                        layer.on('mouseover', function () {
                            if (s) {
                                this.setStyle({ weight: 2, fillOpacity: 0.85 });
                                this.bringToFront();
                            }
                        });
                        layer.on('mouseout', function () {
                            if (s) {
                                const intensity = Math.log(s + 1) / Math.log(maxSpend + 1);
                                this.setStyle({ weight: 1, fillOpacity: 0.5 + intensity * 0.35 });
                            }
                        });
                    }
                }).addTo(map);

                // Fit to visited countries
                if (entries.length) {
                    const bounds = [];
                    geo.features.forEach(f => {
                        const name = NAME_MAP[f.properties.NAME] || f.properties.NAME;
                        if (spend[name] && f.bbox) {
                            bounds.push([f.bbox[1], f.bbox[0]]);
                            bounds.push([f.bbox[3], f.bbox[2]]);
                        }
                    });
                    if (bounds.length) {
                        map.fitBounds(bounds, { padding: [20, 20], maxZoom: 4 });
                    }
                }
            });

        // Country ranking section (right side)
        if (entries.length) {
            let rankHtml = '<div class="choropleth-ranking">';
            entries.forEach(([country, val], i) => {
                const t = Math.log(val + 1) / Math.log(maxSpend + 1);
                const color = heatColor(t);
                const valFmt = val >= 1000 ? 'S$' + (val / 1000).toFixed(1) + 'k' : 'S$' + val.toFixed(0);
                const pct = (val / maxSpend) * 100;
                rankHtml += `<div class="cr-row" title="${country} — S$${val.toLocaleString(undefined, {maximumFractionDigits: 0})} total spend">
                    <span class="cr-rank">${i + 1}</span>
                    <span class="cr-country">${country}</span>
                    <div class="cr-bar-bg"><div class="cr-bar-fill" style="width:${pct}%;background:${color}"></div></div>
                    <span class="cr-val" style="color:${color}">${valFmt}</span>
                </div>`;
            });
            rankHtml += '</div>';
            wrapper.insertAdjacentHTML('beforeend', rankHtml);
        }

        setTimeout(() => map.invalidateSize(), 600);
    }

    waitForData(render);
})();
