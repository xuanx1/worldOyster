// Unvisited Neighbours — Leaflet mini map with GeoJSON country polygons
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
        'France': ['Belgium', 'Spain', 'Germany', 'Switzerland', 'Italy', 'Monaco', 'Andorra', 'Luxembourg'],
        'UK': ['Ireland'],
        'Netherlands': ['Belgium', 'Germany'],
        'Spain': ['France', 'Portugal', 'Andorra', 'Morocco'],
        'Germany': ['France', 'Netherlands', 'Belgium', 'Denmark', 'Poland', 'Czech Republic', 'Austria', 'Switzerland', 'Luxembourg'],
        'Switzerland': ['France', 'Germany', 'Austria', 'Italy', 'Liechtenstein'],
        'Austria': ['Germany', 'Czech Republic', 'Slovakia', 'Hungary', 'Slovenia', 'Italy', 'Switzerland', 'Liechtenstein'],
        'Czech Republic': ['Germany', 'Poland', 'Slovakia', 'Austria'],
        'Poland': ['Germany', 'Czech Republic', 'Slovakia', 'Ukraine', 'Belarus', 'Lithuania', 'Russia'],
        'Hungary': ['Austria', 'Slovakia', 'Ukraine', 'Romania', 'Serbia', 'Croatia', 'Slovenia'],
        'Romania': ['Hungary', 'Ukraine', 'Moldova', 'Bulgaria', 'Serbia'],
        'Bulgaria': ['Romania', 'Serbia', 'North Macedonia', 'Greece', 'Turkey'],
        'Serbia': ['Hungary', 'Romania', 'Bulgaria', 'North Macedonia', 'Albania', 'Montenegro', 'Bosnia and Herzegovina', 'Croatia', 'Kosovo'],
        'Bosnia and Herzegovina': ['Serbia', 'Montenegro', 'Croatia'],
        'Montenegro': ['Serbia', 'Bosnia and Herzegovina', 'Albania', 'Croatia', 'Kosovo'],
        'Albania': ['Montenegro', 'Serbia', 'North Macedonia', 'Greece', 'Kosovo'],
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
        'North Macedonia': ['Serbia', 'Bulgaria', 'Greece', 'Albania', 'Kosovo'],
        'Slovenia': ['Italy', 'Austria', 'Hungary', 'Croatia'],
        'Croatia': ['Slovenia', 'Hungary', 'Serbia', 'Bosnia and Herzegovina', 'Montenegro'],
        'Slovakia': ['Czech Republic', 'Poland', 'Ukraine', 'Hungary', 'Austria'],
        'Ireland': ['UK'],
        'Kosovo': ['Serbia', 'Albania', 'North Macedonia', 'Montenegro'],
        'Latvia': ['Estonia', 'Lithuania', 'Russia', 'Belarus'],
        'Lithuania': ['Poland', 'Russia', 'Latvia', 'Belarus'],
        'Belarus': ['Poland', 'Russia', 'Ukraine', 'Lithuania', 'Latvia'],
        'Moldova': ['Romania', 'Ukraine'],
        'Iran': ['Turkey', 'Armenia', 'Azerbaijan', 'Turkmenistan', 'Afghanistan', 'Iraq', 'Pakistan'],
        'Iraq': ['Turkey', 'Syria', 'Jordan', 'Saudi Arabia', 'Kuwait', 'Iran'],
        'Syria': ['Turkey', 'Lebanon', 'Israel', 'Jordan', 'Iraq'],
        'South Sudan': ['Kenya', 'Ethiopia', 'Sudan', 'Uganda', 'Dem. Rep. Congo', 'Central African Republic'],
        'Sudan': ['Egypt', 'Ethiopia', 'South Sudan', 'Eritrea', 'Libya', 'Chad', 'Central African Republic'],
        'Yemen': ['Saudi Arabia', 'Oman'],
        'Libya': ['Egypt', 'Tunisia', 'Algeria', 'Niger', 'Chad', 'Sudan'],
        'Pakistan': ['India', 'China', 'Afghanistan', 'Iran'],
        'Nepal': ['India', 'China'],
        'Afghanistan': ['Pakistan', 'Iran', 'Turkmenistan', 'Uzbekistan', 'Tajikistan', 'China'],
        'Kyrgyzstan': ['Kazakhstan', 'Uzbekistan', 'Tajikistan', 'China'],
        'Tajikistan': ['Kyrgyzstan', 'Uzbekistan', 'Afghanistan', 'China']
    };

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
        // Caribbean
        'Antigua and Barbuda': [17.06, -61.80],
        'Barbados': [13.19, -59.54],
        'Dominica': [15.41, -61.37],
        'Grenada': [12.12, -61.68],
        'Saint Kitts and Nevis': [17.34, -62.77],
        'Saint Lucia': [13.91, -60.98],
        'Saint Vincent and the Grenadines': [13.25, -61.20],
        'Bermuda': [32.32, -64.76],
        'Cayman Islands': [19.31, -81.25],
        'Turks and Caicos Islands': [21.69, -71.80],
        'British Virgin Islands': [18.42, -64.64],
        'Anguilla': [18.22, -63.07],
        'Montserrat': [16.74, -62.19],
        'Aruba': [12.51, -69.97],
        'Curaçao': [12.17, -68.98],
        'US Virgin Islands': [18.34, -64.93],
        'Puerto Rico': [18.22, -66.59],
        'Guadeloupe': [16.27, -61.55],
        'Martinique': [14.64, -61.02],
        'Sint Maarten': [18.04, -63.07],
        'Saint Barthélemy': [17.90, -62.83],
        'Bonaire': [12.15, -68.27],
        // Pacific
        'Samoa': [-13.83, -171.76],
        'Tonga': [-21.18, -175.20],
        'Kiribati': [1.87, -157.36],
        'Micronesia': [7.42, 150.55],
        'Marshall Islands': [7.13, 171.18],
        'Palau': [7.51, 134.58],
        'Tuvalu': [-8.52, 179.20],
        'Nauru': [-0.52, 166.93],
        'Niue': [-19.05, -169.87],
        'Cook Islands': [-21.24, -159.78],
        'French Polynesia': [-17.68, -149.41],
        'New Caledonia': [-22.26, 166.46],
        'Guam': [13.44, 144.79],
        'American Samoa': [-14.27, -170.70],
        'Northern Mariana Islands': [15.18, 145.75],
        'Tokelau': [-9.20, -171.85],
        'Wallis and Futuna': [-13.77, -177.16],
        'Pitcairn Islands': [-25.07, -130.10],
        'Norfolk Island': [-29.04, 167.95],
        // Indian Ocean
        'Réunion': [-21.12, 55.53],
        'Mayotte': [-12.78, 45.15],
        'Christmas Island': [-10.49, 105.63],
        'Cocos Islands': [-12.19, 96.83],
        'British Indian Ocean Territory': [-6.34, 71.88],
        // Atlantic / other
        'Canary Islands': [28.10, -15.40],
        'Faroe Islands': [61.89, -6.91],
        'Gibraltar': [36.14, -5.35],
        'Guernsey': [49.45, -2.54],
        'Jersey': [49.21, -2.13],
        'Isle of Man': [54.24, -4.55],
        'Kosovo': [42.60, 20.90],
        'Hong Kong SAR': [22.32, 114.17],
        'Macau SAR': [22.20, 113.55],
        'São Tomé and Príncipe': [0.19, 6.61],
        'Azores': [38.72, -27.22],
        'Madeira': [32.63, -16.90],
        'Saint Helena': [-15.97, -5.71],
        'Ascension Island': [-7.94, -14.36],
        'Tristan da Cunha': [-37.07, -12.32],
        'Svalbard': [78.22, 15.64],
        'French Guiana': [3.93, -53.13],
        'Transnistria': [46.84, 29.63],
        'Abkhazia': [43.00, 41.02],
        'South Ossetia': [42.23, 43.97],
        'Northern Cyprus': [35.19, 33.38],
        'Somaliland': [9.56, 44.06],
        'Republic of Artsakh': [39.82, 46.75]
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
        'S. Sudan': 'South Sudan',
        'Dominican Rep.': 'Dominican Republic',
        'Central African Rep.': 'Central African Republic',
        'Solomon Is.': 'Solomon Islands',
        'Falkland Is.': 'Falkland Islands',
        'Eq. Guinea': 'Equatorial Guinea',
        'Palestinian Territories': 'Palestine',
        'Dem. Rep. Congo': 'DR Congo',
        'Congo': 'Republic of the Congo',
        "CA'te d'Ivoire": "Côte d'Ivoire",
        'W. Sahara': 'Western Sahara'
    };

    function waitForData(cb) {
        const id = setInterval(() => {
            if (window.flightMap && window.flightMap.cities && window.flightMap.cities.length > 0) {
                clearInterval(id);
                cb();
            }
        }, 500);
    }

    // Map generic labels back to specific territory names for this widget
    const TERRITORY_MAP = {
        'British Overseas Territory': 'Gibraltar'
    };

    // Cities that should mark a specific territory as visited
    const CITY_TERRITORY = {
        'Hong Kong': 'Hong Kong SAR',
        'Macau': 'Macau SAR',
        'Kyrenia': 'Northern Cyprus',
        'Stepanakert': 'Republic of Artsakh'
    };

    // Region classification for grouping unvisited neighbours
    const COUNTRY_REGION = {
        // Europe
        'Albania': 'europe', 'Andorra': 'europe', 'Austria': 'europe', 'Belarus': 'europe',
        'Belgium': 'europe', 'Bosnia and Herzegovina': 'europe', 'Bulgaria': 'europe',
        'Croatia': 'europe', 'Cyprus': 'europe', 'Czech Republic': 'europe', 'Denmark': 'europe',
        'Estonia': 'europe', 'Finland': 'europe', 'France': 'europe', 'Germany': 'europe',
        'Greece': 'europe', 'Hungary': 'europe', 'Iceland': 'europe', 'Ireland': 'europe',
        'Italy': 'europe', 'Kosovo': 'europe', 'Latvia': 'europe', 'Liechtenstein': 'europe',
        'Lithuania': 'europe', 'Luxembourg': 'europe', 'Malta': 'europe', 'Moldova': 'europe',
        'Monaco': 'europe', 'Montenegro': 'europe', 'Netherlands': 'europe',
        'North Macedonia': 'europe', 'Norway': 'europe', 'Poland': 'europe', 'Portugal': 'europe',
        'Romania': 'europe', 'San Marino': 'europe', 'Serbia': 'europe', 'Slovakia': 'europe',
        'Slovenia': 'europe', 'Spain': 'europe', 'Sweden': 'europe', 'Switzerland': 'europe',
        'UK': 'europe', 'Ukraine': 'europe', 'Vatican City': 'europe',
        // Asia
        'Afghanistan': 'asia', 'Armenia': 'asia', 'Azerbaijan': 'asia', 'Bangladesh': 'asia',
        'Bhutan': 'asia', 'Brunei': 'asia', 'Cambodia': 'asia', 'China': 'asia',
        'Georgia': 'asia', 'Hong Kong SAR': 'asia', 'India': 'asia', 'Indonesia': 'asia',
        'Iran': 'asia', 'Iraq': 'asia', 'Japan': 'asia', 'Kazakhstan': 'asia',
        'Kyrgyzstan': 'asia', 'Laos': 'asia', 'Macau SAR': 'asia', 'Malaysia': 'asia',
        'Maldives': 'asia', 'Mongolia': 'asia', 'Myanmar': 'asia', 'Nepal': 'asia',
        'North Korea': 'asia', 'Pakistan': 'asia', 'Philippines': 'asia', 'ROC (Taiwan)': 'asia',
        'Russia': 'asia', 'Singapore': 'asia', 'South Korea': 'asia', 'Sri Lanka': 'asia',
        'Syria': 'asia', 'Tajikistan': 'asia', 'Thailand': 'asia', 'Timor-Leste': 'asia',
        'Turkmenistan': 'asia', 'Uzbekistan': 'asia', 'Vietnam': 'asia',
        // Middle East (part of Asia)
        'Bahrain': 'asia', 'Egypt': 'africa', 'Israel': 'asia',
        'Jordan': 'asia', 'Kuwait': 'asia', 'Lebanon': 'asia',
        'Oman': 'asia', 'Palestine': 'asia', 'Qatar': 'asia',
        'Saudi Arabia': 'asia', 'Turkey': 'asia', 'UAE': 'asia',
        'Yemen': 'asia',
        // Africa
        'Algeria': 'africa', 'Benin': 'africa', 'Botswana': 'africa', 'Cameroon': 'africa',
        'Central African Republic': 'africa', 'Chad': 'africa', 'Dem. Rep. Congo': 'africa',
        'DR Congo': 'africa', 'Djibouti': 'africa', 'Eritrea': 'africa', 'Eswatini': 'africa',
        'Ethiopia': 'africa', 'Kenya': 'africa', 'Lesotho': 'africa', 'Libya': 'africa',
        'Mali': 'africa', 'Mauritania': 'africa', 'Morocco': 'africa', 'Mozambique': 'africa',
        'Namibia': 'africa', 'Niger': 'africa', 'Nigeria': 'africa',
        'Republic of the Congo': 'africa', 'Somalia': 'africa', 'South Africa': 'africa',
        'South Sudan': 'africa', 'Sudan': 'africa', 'Tanzania': 'africa', 'Tunisia': 'africa',
        'Uganda': 'africa', 'Zimbabwe': 'africa',
        // Americas
        'Argentina': 'americas', 'Bolivia': 'americas', 'Brazil': 'americas',
        'Canada': 'americas', 'Chile': 'americas', 'Colombia': 'americas',
        'Ecuador': 'americas', 'Mexico': 'americas', 'Panama': 'americas',
        'Paraguay': 'americas', 'Peru': 'americas', 'USA': 'americas',
        'Venezuela': 'americas',
        // Oceania
        'Australia': 'oceania', 'New Zealand': 'oceania', 'Papua New Guinea': 'oceania',
        // Disputed / unrecognised
        'Transnistria': 'disputed',
        'Abkhazia': 'disputed',
        'South Ossetia': 'disputed',
        'Northern Cyprus': 'disputed',
        'Somaliland': 'disputed',
        'Republic of Artsakh': 'disputed'
    };

    // Ordered list of regions for display
    const REGION_ORDER = ['africa', 'americas', 'asia', 'europe', 'oceania', 'disputed'];

    function getVisitedCountries() {
        const data = (window.flightMap && window.flightMap.flightData) || [];
        const countryMap = window.AIRPORT_TO_COUNTRY || {};
        const cityCountryMap = window.CITY_TO_COUNTRY || {};
        const visited = new Set();

        data.forEach(j => {
            if (j.type === 'land') {
                const c1 = cityCountryMap[j.origin];
                const c2 = cityCountryMap[j.destination];
                if (c1) visited.add(TERRITORY_MAP[c1] || c1);
                if (c2) visited.add(TERRITORY_MAP[c2] || c2);
                // Check city names for territory matches
                if (CITY_TERRITORY[j.origin]) visited.add(CITY_TERRITORY[j.origin]);
                if (CITY_TERRITORY[j.destination]) visited.add(CITY_TERRITORY[j.destination]);
            } else {
                const fromCode = j.fromCode || (j.from && j.from.match(/\(([A-Z]{3})\//)?.[1]);
                const toCode = j.toCode || (j.to && j.to.match(/\(([A-Z]{3})\//)?.[1]);
                const fc = countryMap[fromCode];
                const tc = countryMap[toCode];
                if (fc) visited.add(TERRITORY_MAP[fc] || fc);
                if (tc) visited.add(TERRITORY_MAP[tc] || tc);
                // Check city names in flight labels
                const fromCity = j.from && j.from.split('(')[0].trim();
                const toCity = j.to && j.to.split('(')[0].trim();
                if (CITY_TERRITORY[fromCity]) visited.add(CITY_TERRITORY[fromCity]);
                if (CITY_TERRITORY[toCity]) visited.add(CITY_TERRITORY[toCity]);
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
            minZoom: 2,
            maxZoom: 5,
            zoomControl: false,
            attributionControl: false,
            scrollWheelZoom: true,
            dragging: true,
            doubleClickZoom: false,
            touchZoom: false,
            worldCopyJump: true
        });

        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            maxZoom: 6,
            minZoom: 1
        }).addTo(map);

        // Single shared tooltip for all map layers
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

        // Hide tooltip when mouse leaves the map
        mapDiv.addEventListener('mouseleave', hideMapTip);

        // Custom pane: above overlay (400) but below tooltip (650)
        map.createPane('dotPane');
        map.getPane('dotPane').style.zIndex = 600;
        map.getPane('dotPane').style.pointerEvents = 'none';

        // Load GeoJSON and color countries
        const countryLayers = {}; // country name → [layers/dots]

        fetch('asset/ne_110m_countries.geojson')
            .then(r => r.json())
            .then(geo => {
                const matchedCountries = new Set();

                // Shift GeoJSON coordinates by a longitude offset
                function shiftGeo(source, lngOffset) {
                    if (lngOffset === 0) return source;
                    return JSON.parse(JSON.stringify(source), function (k, v) {
                        // Shift coordinate arrays [lng, lat]
                        if (Array.isArray(v) && v.length >= 2 && typeof v[0] === 'number' && typeof v[1] === 'number' && !Array.isArray(v[0])) {
                            v[0] += lngOffset;
                        }
                        return v;
                    });
                }

                function styleFeature(feature) {
                    const geoName = feature.properties.NAME;
                    const appName = NAME_MAP[geoName] || geoName;
                    matchedCountries.add(appName);

                    if (visited.has(appName)) {
                        return { fillColor: '#4CAF50', fillOpacity: 0.45, color: '#4CAF50', weight: 1, opacity: 0.6 };
                    }
                    if (unvisitedNeighborMap[appName]) {
                        return { fillColor: '#FFB74D', fillOpacity: 0.5, color: '#FFB74D', weight: 1.5, opacity: 0.8 };
                    }
                    return { fillColor: '#fff', fillOpacity: 0.02, color: '#444', weight: 0.3, opacity: 0.3 };
                }

                function onFeature(feature, layer) {
                    const geoName = feature.properties.NAME;
                    const appName = NAME_MAP[geoName] || geoName;
                    if (!countryLayers[appName]) countryLayers[appName] = [];
                    countryLayers[appName].push({ layer: layer, type: 'geo' });

                    if (visited.has(appName)) {
                        const _vLabel = window.i18n ? window.i18n.t('visited') : 'Visited';
                        const _dn = window.translateCountry ? window.translateCountry(appName) : appName;
                        layer.on('mouseover', function (e) { showMapTip(`<b>${_dn}</b><br>${_vLabel}`, e); this.setStyle({ weight: 2, fillOpacity: 0.7 }); this.bringToFront(); });
                        layer.on('mousemove', moveMapTip);
                        layer.on('mouseout', function () { hideMapTip(); this.setStyle({ weight: 1, fillOpacity: 0.45 }); });
                    } else if (unvisitedNeighborMap[appName]) {
                        const borderedBy = unvisitedNeighborMap[appName];
                        const _bLabel = window.i18n ? window.i18n.t('borders') : 'Borders';
                        const _dn2 = window.translateCountry ? window.translateCountry(appName) : appName;
                        const _bordersTranslated = borderedBy.map(function(b){ return window.translateCountry ? window.translateCountry(b) : b; }).join(', ');
                        layer.on('mouseover', function (e) { showMapTip(`<b>${_dn2}</b><br>${_bLabel}: ${_bordersTranslated}`, e); this.setStyle({ weight: 2.5, fillOpacity: 0.8 }); this.bringToFront(); });
                        layer.on('mousemove', moveMapTip);
                        layer.on('mouseout', function () { hideMapTip(); this.setStyle({ weight: 1.5, fillOpacity: 0.5 }); });
                    }
                }

                // Render GeoJSON at -360, 0, +360 so shapes always visible when panning
                [-360, 0, 360].forEach(function (offset) {
                    L.geoJSON(shiftGeo(geo, offset), { style: styleFeature, onEachFeature: onFeature }).addTo(map);
                });

                // Add dot markers for all small/missing countries (also at 3 offsets)
                Object.keys(SMALL_COUNTRY_COORDS).forEach(country => {
                    if (matchedCountries.has(country)) return;
                    const baseCoords = SMALL_COUNTRY_COORDS[country];

                    const isVisited = visited.has(country);
                    const isNeighbour = !!unvisitedNeighborMap[country];
                    let color, fillOpacity, radius;

                    if (isVisited) {
                        color = '#4CAF50'; fillOpacity = 0.8; radius = 5;
                    } else if (isNeighbour) {
                        color = '#FFB74D'; fillOpacity = 0.9; radius = 5;
                    } else {
                        color = '#888'; fillOpacity = 0.35; radius = 3;
                    }

                    [-360, 0, 360].forEach(function (offset) {
                        const coords = [baseCoords[0], baseCoords[1] + offset];
                        const dot = L.circleMarker(coords, {
                            pane: 'dotPane',
                            radius: radius,
                            fillColor: color,
                            fillOpacity: fillOpacity,
                            color: color,
                            weight: isVisited || isNeighbour ? 1.5 : 0.5,
                            opacity: isVisited || isNeighbour ? 1 : 0.5
                        }).addTo(map);

                        let tipHtml;
                        const _vLabel = window.i18n ? window.i18n.t('visited') : 'Visited';
                        const _bLabel = window.i18n ? window.i18n.t('borders') : 'Borders';
                        const _tcn = window.translateCountry ? window.translateCountry(country) : country;
                        if (isVisited) {
                            tipHtml = `<b>${_tcn}</b><br>${_vLabel}`;
                        } else if (isNeighbour) {
                            const borderedBy = (unvisitedNeighborMap[country] || []).map(function(b){ return window.translateCountry ? window.translateCountry(b) : b; });
                            tipHtml = `<b>${_tcn}</b><br>${_bLabel}: ${borderedBy.join(', ')}`;
                        } else {
                            tipHtml = `<b>${_tcn}</b>`;
                        }

                        if (!countryLayers[country]) countryLayers[country] = [];
                        countryLayers[country].push({ layer: dot, type: 'dot', radius: radius, fillOpacity: fillOpacity });
                        dot.getElement().style.pointerEvents = 'auto';
                        dot.on('mouseover', function (e) { showMapTip(tipHtml, e); this.setStyle({ radius: radius + 2, fillOpacity: Math.min(fillOpacity + 0.3, 1) }); });
                        dot.on('mousemove', moveMapTip);
                        dot.on('mouseout', function () { hideMapTip(); this.setStyle({ radius: radius, fillOpacity: fillOpacity }); });
                    });
                });
            });

        // Legend + tag list grouped by region
        const _t = window.i18n ? window.i18n.t : function(k){return k;};
        let legend = `<div class="neighbors-legend">
            <span class="neighbors-legend-item"><span class="neighbors-dot visited"></span>${_t('visited')} (${visited.size})</span>
            <span class="neighbors-legend-item"><span class="neighbors-dot unvisited"></span>${_t('unvisitedNeighboursLabel')} (${unvisited.length})</span>
        </div>`;
        const _flag = window.countryTrophy ? window.countryTrophy.flagImg : function(){return '';};

        // Collect unrecognised/disputed territories not yet visited
        const disputedTerritories = Object.keys(COUNTRY_REGION)
            .filter(c => COUNTRY_REGION[c] === 'disputed' && !visited.has(c));

        // Group unvisited by region
        const regionGroups = {};
        unvisited.forEach(c => {
            const region = COUNTRY_REGION[c] || 'other';
            if (!regionGroups[region]) regionGroups[region] = [];
            regionGroups[region].push(c);
        });
        // Add disputed territories (they aren't neighbours, so add separately)
        disputedTerritories.forEach(c => {
            if (!regionGroups['disputed']) regionGroups['disputed'] = [];
            if (!regionGroups['disputed'].includes(c)) regionGroups['disputed'].push(c);
        });

        // Map region keys to translation keys (reuse existing continent translations)
        const REGION_I18N = {
            europe: 'europe',
            asia: 'asia',
            middleEast: 'middleEast',
            africa: 'africa',
            americas: 'americas',
            oceania: 'oceania',
            disputed: 'disputed',
            other: 'region_other'
        };

        legend += '<div class="neighbors-regions">';
        const _bLabel = _t('borders');
        REGION_ORDER.forEach(region => {
            const countries = regionGroups[region];
            if (!countries || !countries.length) return;
            const regionLabel = _t(REGION_I18N[region] || region);
            legend += `<div class="neighbors-region">`;
            legend += `<div class="neighbors-region-label">${regionLabel} <span class="neighbors-region-count">(${countries.length})</span></div>`;
            legend += `<div class="neighbors-region-list">`;
            countries.forEach(c => {
                const borderedBy = unvisitedNeighborMap[c] || [];
                const tipVal = borderedBy.length ? borderedBy.map(function(b){ return window.translateCountry ? window.translateCountry(b) : b; }).join(', ') : '—';
                const _cn = window.translateCountry ? window.translateCountry(c) : c;
                legend += `<div class="un-row" data-country="${c}" data-tip-label="${_cn}" data-tip-val="${tipVal}">
                    <div class="un-name">${_flag(c, 16)} ${_cn}</div>
                    <div class="un-borders">${_bLabel}: ${tipVal}</div>
                </div>`;
            });
            legend += '</div></div>';
        });
        // Handle any countries without a region
        if (regionGroups['other'] && regionGroups['other'].length) {
            legend += `<div class="neighbors-region">`;
            legend += `<div class="neighbors-region-label">${_t(REGION_I18N['other'])} <span class="neighbors-region-count">(${regionGroups['other'].length})</span></div>`;
            legend += `<div class="neighbors-region-list">`;
            regionGroups['other'].forEach(c => {
                const borderedBy = unvisitedNeighborMap[c] || [];
                const tipVal = borderedBy.length ? borderedBy.map(function(b){ return window.translateCountry ? window.translateCountry(b) : b; }).join(', ') : '—';
                const _cn = window.translateCountry ? window.translateCountry(c) : c;
                legend += `<div class="un-row" data-country="${c}" data-tip-label="${_cn}" data-tip-val="${tipVal}">
                    <div class="un-name">${_flag(c, 16)} ${_cn}</div>
                    <div class="un-borders">${_bLabel}: ${tipVal}</div>
                </div>`;
            });
            legend += '</div></div>';
        }
        legend += '</div>';
        container.insertAdjacentHTML('beforeend', legend);

        const tip = document.createElement('div');
        tip.className = 'widget-row-tooltip';
        document.body.appendChild(tip);
        let highlightedCountry = null;

        function highlightCountry(name) {
            if (highlightedCountry === name) return;
            unhighlightCountry();
            highlightedCountry = name;
            const layers = countryLayers[name];
            if (!layers) return;

            // Find the offset-0 layer to zoom to (avoid -360/+360 copies)
            var bounds = null;
            layers.forEach(function (entry) {
                if (entry.type === 'geo') {
                    entry.layer.setStyle({ weight: 2.5, fillOpacity: 0.8, fillColor: '#FFB74D', color: '#fff' });
                    entry.layer.bringToFront();
                    var b = entry.layer.getBounds();
                    // Use the copy closest to center (lng roughly -180..180)
                    if (b && Math.abs(b.getCenter().lng) <= 360) {
                        if (!bounds) bounds = L.latLngBounds(b);
                        else if (Math.abs(b.getCenter().lng) < Math.abs(bounds.getCenter().lng)) bounds = L.latLngBounds(b);
                    }
                } else {
                    entry.layer.setStyle({ radius: entry.radius + 3, fillOpacity: 1, color: '#fff' });
                    var ll = entry.layer.getLatLng();
                    if (Math.abs(ll.lng) <= 180) {
                        if (!bounds) bounds = L.latLngBounds(ll, ll);
                    }
                }
            });

            if (bounds) {
                map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 5, duration: 0.5 });
            }
        }

        function unhighlightCountry() {
            if (!highlightedCountry) return;
            const layers = countryLayers[highlightedCountry];
            if (layers) {
                layers.forEach(function (entry) {
                    if (entry.type === 'geo') {
                        entry.layer.setStyle({ weight: 1.5, fillOpacity: 0.5, fillColor: '#FFB74D', color: '#FFB74D' });
                    } else {
                        entry.layer.setStyle({ radius: entry.radius, fillOpacity: entry.fillOpacity, color: '#FFB74D' });
                    }
                });
            }
            highlightedCountry = null;
            map.flyTo([20, 30], 2, { duration: 0.5 });
        }

        const tagList = container.querySelector('.neighbors-regions');
        tagList.addEventListener('mousemove', function (e) {
            const row = e.target.closest('.un-row');
            if (!row) { tip.style.display = 'none'; unhighlightCountry(); return; }
            tip.innerHTML = `<div class="tip-label">${row.dataset.tipLabel}</div><div class="tip-val">${row.dataset.tipVal}</div>`;
            tip.style.display = 'block';
            tip.style.left = e.clientX + 'px';
            tip.style.top = (e.clientY - 12) + 'px';
            highlightCountry(row.dataset.country);
        });
        tagList.addEventListener('mouseleave', () => { tip.style.display = 'none'; unhighlightCountry(); });

        setTimeout(() => map.invalidateSize(), 600);
    }

    waitForData(render);
    window.addEventListener('langchange', function() { render(); });
})();
