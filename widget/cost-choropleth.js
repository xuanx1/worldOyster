// Cost per Country — Leaflet choropleth map with GeoJSON country polygons
(function () {
    'use strict';

    // Coordinates for countries too small or missing from 110m GeoJSON
    const SMALL_COUNTRY_COORDS = {
        'Monaco': [43.73, 7.42],
        'Vatican City': [41.90, 12.45],
        'San Marino': [43.94, 12.46],
        'Liechtenstein': [47.17, 9.56],
        'Andorra': [42.51, 1.52],
        'Malta': [35.94, 14.38],
        'Bahrain': [26.07, 50.20],
        'Singapore': [1.35, 103.82],
        'Brunei': [4.94, 114.95],
        'Timor-Leste': [-8.87, 125.73],
        'Djibouti': [11.59, 43.15],
        'Eswatini': [-26.52, 31.47],
        'Lesotho': [-29.61, 28.23],
        'Comoros': [-12.17, 44.27],
        'Mauritius': [-20.35, 57.55],
        'Seychelles': [-4.68, 55.49],
        'Cape Verde': [16.00, -24.01],
        'Maldives': [3.20, 73.22],
        'Hong Kong SAR': [22.32, 114.17],
        'Macau SAR': [22.20, 113.55],
        'Kosovo': [42.60, 20.90],
        'Palestine': [31.95, 35.23],
        'Qatar': [25.28, 51.18]
    };

    // Map GeoJSON NAME → app country names
    const NAME_MAP = {
        'United States of America': 'USA',
        'United Kingdom': 'UK',
        'Czechia': 'Czech Republic',
        'Bosnia and Herz.': 'Bosnia and Herzegovina',
        'United Arab Emirates': 'UAE',
        'Taiwan': 'ROC Taiwan',
        'Myanmar': 'Myanmar',
        'Dem. Rep. Korea': 'DPR Korea',
        'North Korea': 'DPR Korea',
        'Korea': 'ROK Korea',
        'South Korea': 'ROK Korea',
        'Macedonia': 'North Macedonia',
        'eSwatini': 'Eswatini',
        'Lao PDR': 'Laos',
        'Palestinian Territories': 'Palestine',
        'China': 'PR China',
        'N. Cyprus': 'Northern Cyprus'
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
            touchZoom: false,
            worldCopyJump: true,
            maxBounds: [[-85, -Infinity], [85, Infinity]],
            maxBoundsViscosity: 1.0
        });

        // Custom pane for dot markers
        map.createPane('dotPane');
        map.getPane('dotPane').style.zIndex = 600;
        map.getPane('dotPane').style.pointerEvents = 'none';

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            maxZoom: 6,
            minZoom: 1
        }).addTo(map);

        // Single shared tooltip for all map layers (avoids bringToFront swallowing Leaflet tooltip events)
        const mapTip = document.createElement('div');
        mapTip.className = 'widget-map-tooltip';
        mapTip.style.cssText = 'position:fixed;pointer-events:none;display:none;z-index:9999;padding:6px 10px;border-radius:4px;';
        document.body.appendChild(mapTip);
        function showMapTip(html, e) {
            mapTip.innerHTML = html;
            mapTip.style.display = 'block';
            mapTip.style.left = (e.originalEvent.clientX + 12) + 'px';
            mapTip.style.top = (e.originalEvent.clientY - 12) + 'px';
        }
        function moveMapTip(e) {
            mapTip.style.left = (e.originalEvent.clientX + 12) + 'px';
            mapTip.style.top = (e.originalEvent.clientY - 12) + 'px';
        }
        function hideMapTip() { mapTip.style.display = 'none'; }
        mapDiv.addEventListener('mouseleave', hideMapTip);

        // Shift GeoJSON coordinates by a longitude offset
        function shiftGeo(source, lngOffset) {
            if (lngOffset === 0) return source;
            return JSON.parse(JSON.stringify(source), function (k, v) {
                if (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number' && !Array.isArray(v[0])) {
                    v[0] += lngOffset;
                }
                return v;
            });
        }

        // Load GeoJSON and color countries
        const countryLayers = {}; // country name → [{layer, intensity}]
        let initialCenter = [20, 30];
        let initialZoom = 2;

        fetch('asset/ne_110m_countries.geojson')
            .then(r => r.json())
            .then(geo => {
                function styleFeature(feature) {
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
                }

                var _hoveredLayer = null;
                var _hoveredReset = null;
                function clearHovered() {
                    if (_hoveredLayer && _hoveredReset) {
                        _hoveredReset.call(_hoveredLayer);
                        _hoveredLayer = null;
                        _hoveredReset = null;
                    }
                }

                function onFeature(feature, layer) {
                    const geoName = feature.properties.NAME;
                    const appName = NAME_MAP[geoName] || geoName;
                    const s = spend[appName];
                    const intensity = s ? Math.log(s + 1) / Math.log(maxSpend + 1) : 0;

                    if (s) {
                        if (!countryLayers[appName]) countryLayers[appName] = [];
                        countryLayers[appName].push({ layer: layer, intensity: intensity });

                        const valFmt = s >= 1000 ? 'S$' + (s / 1000).toFixed(1) + 'k' : 'S$' + s.toFixed(0);
                        const _dn = window.translateCountry ? window.translateCountry(appName) : appName;
                        const tipHtml = `<b>${_dn}</b><br>${valFmt}`;

                        const resetStyle = function () {
                            hideMapTip();
                            this.setStyle({ weight: 1, fillOpacity: 0.5 + intensity * 0.35 });
                        };
                        layer.on('mouseover', function (e) {
                            clearHovered();
                            showMapTip(tipHtml, e);
                            this.setStyle({ weight: 2, fillOpacity: 0.85 });
                            this.bringToFront();
                            _hoveredLayer = this;
                            _hoveredReset = resetStyle;
                        });
                        layer.on('mousemove', moveMapTip);
                        layer.on('mouseout', function () {
                            resetStyle.call(this);
                            if (_hoveredLayer === this) _hoveredLayer = null;
                        });
                    }
                }

                // Render GeoJSON at -360, 0, +360 so shapes always visible when panning
                const matchedCountries = new Set();
                [-360, 0, 360].forEach(function (offset) {
                    L.geoJSON(shiftGeo(geo, offset), {
                        style: styleFeature,
                        onEachFeature: function (feature, layer) {
                            const geoName = feature.properties.NAME;
                            const appName = NAME_MAP[geoName] || geoName;
                            matchedCountries.add(appName);
                            onFeature(feature, layer);
                        }
                    }).addTo(map);
                });

                // Add dot markers for small/missing countries that have spending
                Object.keys(SMALL_COUNTRY_COORDS).forEach(country => {
                    if (matchedCountries.has(country)) return;
                    const s = spend[country];
                    if (!s) return;
                    const baseCoords = SMALL_COUNTRY_COORDS[country];
                    const intensity = Math.log(s + 1) / Math.log(maxSpend + 1);
                    const color = heatColor(intensity);
                    const valFmt = s >= 1000 ? 'S$' + (s / 1000).toFixed(1) + 'k' : 'S$' + s.toFixed(0);
                    const _dn = window.translateCountry ? window.translateCountry(country) : country;

                    [-360, 0, 360].forEach(function (offset) {
                        const coords = [baseCoords[0], baseCoords[1] + offset];
                        const dot = L.circleMarker(coords, {
                            pane: 'dotPane',
                            radius: 6,
                            fillColor: color,
                            fillOpacity: 0.8,
                            color: color,
                            weight: 1.5,
                            opacity: 1
                        }).addTo(map);

                        const tipHtml = `<b>${_dn}</b><br>${valFmt}`;
                        dot.getElement().style.pointerEvents = 'auto';
                        dot.on('mouseover', function (e) { showMapTip(tipHtml, e); this.setStyle({ radius: 8, fillOpacity: 1 }); });
                        dot.on('mousemove', moveMapTip);
                        dot.on('mouseout', function () { hideMapTip(); this.setStyle({ radius: 6, fillOpacity: 0.8 }); });

                        if (!countryLayers[country]) countryLayers[country] = [];
                        countryLayers[country].push({ layer: dot, type: 'dot', intensity: intensity });
                    });
                });

                // Capture the post-init view for hover-reset to bounce back to
                initialCenter = map.getCenter();
                initialZoom = map.getZoom();
            });

        // Highlight / unhighlight helpers for ranking hover zoom
        let highlightedCountry = null;

        function highlightCountry(name) {
            if (highlightedCountry === name) return;
            unhighlightCountry();
            highlightedCountry = name;
            const layers = countryLayers[name];
            if (!layers) return;

            var bounds = null;
            layers.forEach(function (entry) {
                if (entry.type === 'dot') {
                    entry.layer.setStyle({ radius: 9, fillOpacity: 1, color: '#fff' });
                    var ll = entry.layer.getLatLng();
                    if (Math.abs(ll.lng) <= 180) {
                        if (!bounds) bounds = L.latLngBounds(ll, ll);
                    }
                } else {
                    entry.layer.setStyle({ weight: 2.5, fillOpacity: 0.85, color: '#fff' });
                    entry.layer.bringToFront();
                    var b = entry.layer.getBounds();
                    if (b && Math.abs(b.getCenter().lng) <= 360) {
                        if (!bounds) bounds = L.latLngBounds(b);
                        else if (Math.abs(b.getCenter().lng) < Math.abs(bounds.getCenter().lng)) bounds = L.latLngBounds(b);
                    }
                }
            });

            if (bounds) {
                map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 6, duration: 0.5 });
            }
        }

        function unhighlightCountry() {
            if (!highlightedCountry) return;
            const layers = countryLayers[highlightedCountry];
            if (layers) {
                layers.forEach(function (entry) {
                    const color = heatColor(entry.intensity);
                    if (entry.type === 'dot') {
                        entry.layer.setStyle({ radius: 6, fillOpacity: 0.8, color: color });
                    } else {
                        entry.layer.setStyle({ weight: 1, fillOpacity: 0.5 + entry.intensity * 0.35, color: color });
                    }
                });
            }
            highlightedCountry = null;
            map.flyTo(initialCenter, initialZoom, { duration: 0.5 });
        }

        // Country ranking section (right side)
        if (entries.length) {
            let rankHtml = '<div class="choropleth-ranking">';
            entries.forEach(([country, val], i) => {
                const t = Math.log(val + 1) / Math.log(maxSpend + 1);
                const color = heatColor(t);
                const valFmt = val >= 1000 ? 'S$' + (val / 1000).toFixed(1) + 'k' : 'S$' + val.toFixed(0);
                const pct = (val / maxSpend) * 100;
                const _ts = window.i18n ? window.i18n.t('totalSpend') : 'total spend';
                const _cn = window.translateCountry ? window.translateCountry(country) : country;
                rankHtml += `<div class="cr-row" data-country="${country}" data-tip-label="${_cn}" data-tip-val="${valFmt} ${_ts}">
                    <span class="cr-rank">${i + 1}</span>
                    <span class="cr-country">${_cn}</span>
                    <div class="cr-bar-bg"><div class="cr-bar-fill" style="width:${pct}%;background:${color}"></div></div>
                    <span class="cr-val" style="color:${color}">${valFmt}</span>
                </div>`;
            });
            rankHtml += '</div>';
            wrapper.insertAdjacentHTML('beforeend', rankHtml);

            const rankList = wrapper.querySelector('.choropleth-ranking');
            attachRowTooltip(rankList, '.cr-row');

            rankList.addEventListener('mouseover', function (e) {
                const row = e.target.closest('.cr-row');
                if (row && row.dataset.country) highlightCountry(row.dataset.country);
            });
            rankList.addEventListener('mouseleave', function () {
                unhighlightCountry();
            });
        }

        // Auto-cycle. Generation token so a stale cycle from a prior
        // render (language change) becomes inert the moment a new
        // one starts.
        const _myGen = (window.__atcCostCycleGen = (window.__atcCostCycleGen || 0) + 1);
        // Auto-cycle: while not hovering, pick a random country
        // every 3-4s. Highlights the country on the map AND the
        // matching row in the ranking list AND shows the row tooltip.
        // Pauses on user hover; resumes 5-7s after cursor leaves.
        // countryLayers is populated asynchronously by the geojson
        // fetch above, so the cycle has to wait for it.
        const waitForLayers = setInterval(() => {
            if (Object.keys(countryLayers).length === 0) return;
            clearInterval(waitForLayers);
            startAutoCycle();
        }, 300);
        setTimeout(() => clearInterval(waitForLayers), 15000);
        function startAutoCycle() {
            const rankList = wrapper.querySelector('.choropleth-ranking');
            // Only cycle countries that have BOTH a map layer AND a
            // matching ranking row — otherwise the tooltip would
            // randomly skip when the pick has no row to read from.
            const cycleCountries = Object.keys(countryLayers).filter(c =>
                rankList && rankList.querySelector('[data-country="' + CSS.escape(c) + '"]')
            );
            if (!cycleCountries.length) return;
            // Cycle tooltip uses Leaflet's own L.tooltip so it's
            // anchored to a lat/lng (moves with the map) and leaflet
            // handles overflow / clipping correctly.
            let cycleTooltipLayer = null;
            let pauseUntil = Date.now() + 2500;
            let userHovering = false;
            let timer = null;
            let currentRow = null;
            function pushPause() {
                pauseUntil = Date.now() + 5000 + Math.random() * 2000;
            }
            function showFor(country) {
                let rowData = null;
                if (rankList) {
                    const row = rankList.querySelector('[data-country="' + CSS.escape(country) + '"]');
                    if (row) {
                        row.classList.add('atc-cycling');
                        currentRow = row;
                        rowData = {
                            tipLabel: row.dataset.tipLabel,
                            tipVal:   row.dataset.tipVal
                        };
                        // Scroll the ranking list (NOT the page) so
                        // the cycled rank is visible in the list.
                        const rowRect = row.getBoundingClientRect();
                        const listRect = rankList.getBoundingClientRect();
                        if (rowRect.top < listRect.top) {
                            rankList.scrollTop -= (listRect.top - rowRect.top) + 4;
                        } else if (rowRect.bottom > listRect.bottom) {
                            rankList.scrollTop += (rowRect.bottom - listRect.bottom) + 4;
                        }
                    }
                }
                highlightCountry(country);
                if (rowData) {
                    const layers = countryLayers[country];
                    let centerLatLng = null;
                    if (layers && layers.length) {
                        for (let i = 0; i < layers.length; i++) {
                            const entry = layers[i];
                            if (entry.type === 'dot' && entry.layer && entry.layer.getLatLng) {
                                const ll = entry.layer.getLatLng();
                                if (Math.abs(ll.lng) <= 180) { centerLatLng = ll; break; }
                            } else if (entry.layer && entry.layer.getBounds) {
                                const b = entry.layer.getBounds();
                                if (b && Math.abs(b.getCenter().lng) <= 180) {
                                    centerLatLng = b.getCenter();
                                    break;
                                }
                            }
                        }
                    }
                    if (centerLatLng) {
                        const html =
                            '<div class="tip-label">' + rowData.tipLabel + '</div>' +
                            '<div class="tip-val">' + rowData.tipVal + '</div>';
                        if (cycleTooltipLayer) {
                            cycleTooltipLayer.setContent(html).setLatLng(centerLatLng);
                        } else {
                            cycleTooltipLayer = L.tooltip({
                                permanent: true,
                                direction: 'top',
                                offset: [0, -8],
                                className: 'atc-cycle-tip atc-cost-cycle-tip'
                            }).setLatLng(centerLatLng).setContent(html).addTo(map);
                        }
                    }
                }
            }
            function clearCycle() {
                unhighlightCountry();
                if (currentRow) { currentRow.classList.remove('atc-cycling'); currentRow = null; }
                if (cycleTooltipLayer) {
                    map.removeLayer(cycleTooltipLayer);
                    cycleTooltipLayer = null;
                }
            }
            function tick() {
                if (_myGen !== window.__atcCostCycleGen) return; // superseded
                if (userHovering || Date.now() < pauseUntil) {
                    timer = setTimeout(tick, 400);
                    return;
                }
                const pick = cycleCountries[Math.floor(Math.random() * cycleCountries.length)];
                showFor(pick);
                const hold = 2500 + Math.random() * 1500;
                timer = setTimeout(() => {
                    if (_myGen !== window.__atcCostCycleGen) return;
                    if (!userHovering) clearCycle();
                    tick();
                }, hold);
            }
            wrapper.addEventListener('mousemove', () => {
                if (_myGen !== window.__atcCostCycleGen) return;
                if (!userHovering) {
                    userHovering = true;
                    if (timer) { clearTimeout(timer); timer = null; }
                    clearCycle();
                }
                pushPause();
            });
            wrapper.addEventListener('mouseleave', () => {
                if (_myGen !== window.__atcCostCycleGen) return;
                userHovering = false;
                pushPause();
                if (timer) clearTimeout(timer);
                timer = setTimeout(tick, Math.max(50, pauseUntil - Date.now()));
            });
            timer = setTimeout(tick, 2500);
        }

        setTimeout(() => map.invalidateSize(), 600);
    }

    waitForData(render);
    window.addEventListener('langchange', function() { render(); });
})();
