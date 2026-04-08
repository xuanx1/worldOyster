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
    // Dot coordinates sourced from the shared CITY_COORDINATES (cities.js)
    const _COORDS = window.CITY_COORDINATES || {};
    const SMALL_COUNTRY_NAMES = new Set([
        // Europe micro
        'Monaco', 'Vatican City', 'San Marino', 'Liechtenstein', 'Andorra', 'Malta',
        'Kosovo', 'Transnistria', 'Abkhazia', 'South Ossetia', 'Northern Cyprus',
        // European territories
        'Canary Islands', 'Faroe Islands', 'Gibraltar', 'Guernsey', 'Jersey',
        'Isle of Man', 'Azores', 'Madeira', 'Svalbard', 'Kaliningrad', 'Ceuta', 'Melilla',
        // Asia micro & territories
        'Bahrain', 'Singapore', 'Brunei', 'Timor-Leste', 'Maldives',
        'Hong Kong SAR', 'Macau SAR', 'Socotra', 'Somaliland', 'Artsakh',
        'Andaman and Nicobar Islands', 'Christmas Island', 'Cocos Islands',
        'British Indian Ocean Territory', 'GBAO', 'Baikonur', 'Kish Island', 'Panmunjom',
        // Africa
        'Djibouti', 'Eswatini', 'Lesotho', 'Comoros', 'Mauritius', 'Seychelles',
        'Cape Verde', 'São Tomé and Príncipe', 'Réunion', 'Mayotte',
        'Saint Helena', 'Ascension Island', 'Tristan da Cunha',
        // Caribbean
        'Antigua and Barbuda', 'Barbados', 'Dominica', 'Grenada',
        'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines',
        'Bermuda', 'Cayman Islands', 'Turks and Caicos Islands', 'British Virgin Islands',
        'Anguilla', 'Montserrat', 'Aruba', 'Curaçao', 'US Virgin Islands',
        'Puerto Rico', 'Guadeloupe', 'Martinique', 'Sint Maarten',
        'Saint Barthélemy', 'Bonaire', 'French Guiana', 'Rapa Nui', 'Galapagos',
        // Pacific
        'Samoa', 'Tonga', 'Kiribati', 'Micronesia', 'Marshall Islands', 'Palau',
        'Tuvalu', 'Nauru', 'Niue', 'Cook Islands', 'French Polynesia', 'New Caledonia',
        'Guam', 'Hawaii', 'American Samoa', 'Northern Mariana Islands',
        'Tokelau', 'Wallis and Futuna', 'Pitcairn Islands', 'Norfolk Island'
    ]);
    const SMALL_COUNTRY_COORDS = {};
    SMALL_COUNTRY_NAMES.forEach(n => { if (_COORDS[n]) SMALL_COUNTRY_COORDS[n] = _COORDS[n]; });

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
        'W. Sahara': 'Western Sahara',
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

    // Map generic labels back to specific territory names for this widget
    const TERRITORY_MAP = {
        'British Overseas Territory': 'Gibraltar'
    };

    // Cities that should mark a specific territory as visited
    const CITY_TERRITORY = {
        'Hong Kong': 'Hong Kong SAR',
        'Macau': 'Macau SAR',
        'Kyrenia': 'Northern Cyprus',
        'Stepanakert': 'Artsakh',
        'Panmunjom': 'Panmunjom',
        'DMZ': 'Panmunjom',
        'JSA': 'Panmunjom',
        'Kish': 'Kish Island',
        'Kish Island': 'Kish Island'
    };

    // Region classification for grouping unvisited countries/places
    const COUNTRY_REGION = {
        // Europe
        'Albania': 'europe', 'Andorra': 'europe', 'Austria': 'europe', 'Azerbaijan': 'europe',
        'Belarus': 'europe', 'Belgium': 'europe', 'Bosnia and Herzegovina': 'europe', 'Bulgaria': 'europe',
        'Croatia': 'europe', 'Cyprus': 'europe', 'Czech Republic': 'europe', 'Denmark': 'europe',
        'Estonia': 'europe', 'Finland': 'europe', 'France': 'europe', 'Georgia': 'europe',
        'Germany': 'europe', 'Greece': 'europe', 'Hungary': 'europe', 'Iceland': 'europe',
        'Ireland': 'europe', 'Italy': 'europe', 'Latvia': 'europe', 'Liechtenstein': 'europe',
        'Lithuania': 'europe', 'Luxembourg': 'europe', 'Malta': 'europe', 'Moldova': 'europe',
        'Monaco': 'europe', 'Montenegro': 'europe', 'Netherlands': 'europe',
        'North Macedonia': 'europe', 'Norway': 'europe', 'Poland': 'europe', 'Portugal': 'europe',
        'Romania': 'europe', 'Russia': 'europe', 'San Marino': 'europe', 'Serbia': 'europe',
        'Slovakia': 'europe', 'Slovenia': 'europe', 'Spain': 'europe', 'Sweden': 'europe',
        'Switzerland': 'europe', 'UK': 'europe', 'Ukraine': 'europe', 'Vatican City': 'europe',
        // European territories
        'Azores': 'special', 'Canary Islands': 'special', 'Faroe Islands': 'special',
        'Gibraltar': 'special', 'Greenland': 'special', 'Guernsey': 'special', 'Isle of Man': 'special',
        'Jersey': 'special', 'Madeira': 'special', 'Svalbard': 'special',
        // Asia
        'Afghanistan': 'asia', 'Armenia': 'asia', 'Bangladesh': 'asia',
        'Bhutan': 'asia', 'Brunei': 'asia', 'Cambodia': 'asia', 'China': 'asia',
        'Hong Kong SAR': 'special', 'India': 'asia', 'Indonesia': 'asia',
        'Iran': 'asia', 'Iraq': 'asia', 'Japan': 'asia', 'Kazakhstan': 'asia',
        'Kyrgyzstan': 'asia', 'Laos': 'asia', 'Macau SAR': 'special', 'Malaysia': 'asia',
        'Maldives': 'asia', 'Mongolia': 'asia', 'Myanmar': 'asia', 'Nepal': 'asia',
        'North Korea': 'asia', 'Pakistan': 'asia', 'Philippines': 'asia', 'ROC (Taiwan)': 'asia',
        'Singapore': 'asia', 'South Korea': 'asia', 'Sri Lanka': 'asia',
        'Syria': 'asia', 'Tajikistan': 'asia', 'Thailand': 'asia', 'Timor-Leste': 'asia',
        'Turkmenistan': 'asia', 'Uzbekistan': 'asia', 'Vietnam': 'asia',
        // Middle East
        'Bahrain': 'asia', 'Israel': 'asia', 'Jordan': 'asia', 'Kuwait': 'asia',
        'Lebanon': 'asia', 'Oman': 'asia', 'Palestine': 'asia', 'Qatar': 'asia',
        'Saudi Arabia': 'asia', 'Socotra': 'special', 'Turkey': 'asia', 'UAE': 'asia', 'Yemen': 'asia',
        // Asian territories
        'Andaman and Nicobar Islands': 'special', 'Christmas Island': 'special', 'Cocos Islands': 'special',
        'British Indian Ocean Territory': 'special',
        // Africa
        'Algeria': 'africa', 'Angola': 'africa', 'Benin': 'africa', 'Botswana': 'africa',
        'Burkina Faso': 'africa', 'Burundi': 'africa', 'Cameroon': 'africa', 'Cape Verde': 'africa',
        'Central African Republic': 'africa', 'Chad': 'africa', 'Comoros': 'africa',
        "Côte d'Ivoire": 'africa', 'DR Congo': 'africa',
        'Djibouti': 'africa', 'Egypt': 'africa', 'Equatorial Guinea': 'africa',
        'Eritrea': 'africa', 'Eswatini': 'africa', 'Ethiopia': 'africa', 'Gabon': 'africa',
        'Gambia': 'africa', 'Ghana': 'africa', 'Guinea': 'africa', 'Guinea-Bissau': 'africa',
        'Kenya': 'africa', 'Lesotho': 'africa', 'Liberia': 'africa', 'Libya': 'africa',
        'Madagascar': 'africa', 'Malawi': 'africa', 'Mali': 'africa', 'Mauritania': 'africa',
        'Mauritius': 'africa', 'Morocco': 'africa', 'Mozambique': 'africa', 'Namibia': 'africa',
        'Niger': 'africa', 'Nigeria': 'africa', 'Republic of the Congo': 'africa',
        'Rwanda': 'africa', 'São Tomé and Príncipe': 'africa', 'Senegal': 'africa',
        'Seychelles': 'africa', 'Sierra Leone': 'africa', 'Somalia': 'africa',
        'South Africa': 'africa', 'South Sudan': 'africa', 'Sudan': 'africa',
        'Tanzania': 'africa', 'Togo': 'africa', 'Tunisia': 'africa', 'Uganda': 'africa',
        'Western Sahara': 'disputed', 'Zambia': 'africa', 'Zimbabwe': 'africa',
        // African territories
        'Mayotte': 'special', 'Réunion': 'special', 'Saint Helena': 'special',
        'Ascension Island': 'special', 'Tristan da Cunha': 'special',
        // Americas
        'Argentina': 'americas', 'Bahamas': 'americas', 'Belize': 'americas',
        'Bolivia': 'americas', 'Brazil': 'americas', 'Canada': 'americas',
        'Chile': 'americas', 'Colombia': 'americas', 'Costa Rica': 'americas',
        'Cuba': 'americas', 'Dominican Republic': 'americas', 'Ecuador': 'americas',
        'El Salvador': 'americas', 'Guatemala': 'americas', 'Guyana': 'americas',
        'Haiti': 'americas', 'Honduras': 'americas', 'Jamaica': 'americas',
        'Mexico': 'americas', 'Nicaragua': 'americas', 'Panama': 'americas',
        'Paraguay': 'americas', 'Peru': 'americas', 'Suriname': 'americas',
        'Trinidad and Tobago': 'americas', 'Uruguay': 'americas', 'USA': 'americas',
        'Venezuela': 'americas',
        // Caribbean sovereign states
        'Antigua and Barbuda': 'americas', 'Barbados': 'americas', 'Dominica': 'americas',
        'Grenada': 'americas', 'Saint Kitts and Nevis': 'americas',
        'Saint Lucia': 'americas', 'Saint Vincent and the Grenadines': 'americas',
        // Caribbean & American territories
        'Anguilla': 'special', 'Aruba': 'special',
        'Bermuda': 'special', 'Bonaire': 'special',
        'British Virgin Islands': 'special', 'Cayman Islands': 'special',
        'Curaçao': 'special', 'Falkland Islands': 'special',
        'French Guiana': 'special',
        'Guadeloupe': 'special', 'Martinique': 'special',
        'Montserrat': 'special', 'Puerto Rico': 'special',
        'Saint Barthélemy': 'special',
        'Sint Maarten': 'special', 'Turks and Caicos Islands': 'special',
        'US Virgin Islands': 'special',
        // Oceania
        'Australia': 'oceania', 'Fiji': 'oceania', 'Kiribati': 'oceania',
        'Marshall Islands': 'oceania', 'Micronesia': 'oceania', 'Nauru': 'oceania',
        'New Zealand': 'oceania', 'Palau': 'oceania',
        'Papua New Guinea': 'oceania', 'Samoa': 'oceania', 'Solomon Islands': 'oceania',
        'Tonga': 'oceania', 'Tuvalu': 'oceania', 'Vanuatu': 'oceania',
        // Pacific territories
        'American Samoa': 'special', 'Cook Islands': 'special',
        'French Polynesia': 'special', 'Guam': 'special', 'Hawaii': 'special', 'Niue': 'special',
        'Norfolk Island': 'special', 'Northern Mariana Islands': 'special',
        'Pitcairn Islands': 'special', 'Tokelau': 'special',
        'Wallis and Futuna': 'special', 'New Caledonia': 'special',
        // Disputed / unrecognised
        'Kosovo': 'disputed',
        'Transnistria': 'disputed',
        'Abkhazia': 'disputed',
        'South Ossetia': 'disputed',
        'Northern Cyprus': 'disputed',
        'Somaliland': 'disputed',
        'Artsakh': 'disputed',
        // Special (standalone)
        'Antarctica': 'special', 'Kish Island': 'special', 'Panmunjom': 'special'
    };

    // Continent association for special territories (for sub-grouping in legend)
    const SPECIAL_CONTINENT = {
        'Antarctica': 'antarctica',
        // Europe
        'Azores': 'europe', 'Canary Islands': 'europe', 'Faroe Islands': 'europe',
        'Gibraltar': 'europe', 'Guernsey': 'europe', 'Isle of Man': 'europe',
        'Jersey': 'europe', 'Madeira': 'europe', 'Svalbard': 'europe',
        'Kaliningrad': 'europe', 'Ceuta': 'europe', 'Melilla': 'europe',
        // Asia
        'Hong Kong SAR': 'asia', 'Macau SAR': 'asia', 'Socotra': 'asia',
        'Andaman and Nicobar Islands': 'asia', 'Christmas Island': 'asia',
        'Cocos Islands': 'asia', 'British Indian Ocean Territory': 'asia',
        'GBAO': 'asia', 'Baikonur': 'asia',
        'Kish Island': 'asia', 'Panmunjom': 'asia',
        // Africa
        'Mayotte': 'africa', 'Réunion': 'africa', 'Saint Helena': 'africa',
        'Ascension Island': 'africa', 'Tristan da Cunha': 'africa',
        // Americas
        'Greenland': 'americas', 'Falkland Islands': 'americas', 'French Guiana': 'americas',
        'Guadeloupe': 'americas', 'Martinique': 'americas', 'Saint Barthélemy': 'americas',
        'Puerto Rico': 'americas', 'US Virgin Islands': 'americas', 'Bermuda': 'americas',
        'Anguilla': 'americas', 'Aruba': 'americas', 'Bonaire': 'americas',
        'British Virgin Islands': 'americas', 'Cayman Islands': 'americas',
        'Curaçao': 'americas', 'Montserrat': 'americas',
        'Sint Maarten': 'americas', 'Turks and Caicos Islands': 'americas',
        'Rapa Nui': 'americas', 'Galapagos': 'americas',
        // Oceania
        'American Samoa': 'oceania', 'Cook Islands': 'oceania', 'French Polynesia': 'oceania',
        'Guam': 'oceania', 'Hawaii': 'oceania', 'Niue': 'oceania', 'Norfolk Island': 'oceania',
        'Northern Mariana Islands': 'oceania', 'Pitcairn Islands': 'oceania',
        'Tokelau': 'oceania', 'Wallis and Futuna': 'oceania', 'New Caledonia': 'oceania'
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

        const allKnownCountries = Object.keys(COUNTRY_REGION);
        const unvisited = allKnownCountries.filter(c => !visited.has(c) && COUNTRY_REGION[c] !== 'disputed' && COUNTRY_REGION[c] !== 'special').sort();

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
            worldCopyJump: true,
            maxBounds: [[-90, -Infinity], [90, Infinity]],
            maxBoundsViscosity: 1.0
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
        const visaData = window.VISA_SG || {};
        const VISA_MAP_COLORS = { free: '#4CAF50', arrival: '#8BC34A', evisa: '#FFB74D', required: '#ef5350' };

        function applyHatch(layer, visa) {
            if (layer._path && visa) {
                layer._path.setAttribute('fill', 'url(#hatch-' + visa + ')');
            }
        }

        function visaColor(country) {
            return VISA_MAP_COLORS[visaData[country]] || '#FFB74D';
        }

        fetch('asset/ne_110m_countries.geojson')
            .then(r => r.json())
            .then(geo => {
                const matchedCountries = new Set();

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

                function styleFeature(feature) {
                    const geoName = feature.properties.NAME;
                    const appName = NAME_MAP[geoName] || geoName;
                    matchedCountries.add(appName);

                    if (visited.has(appName)) {
                        const _vSpecial = COUNTRY_REGION[appName] === 'special';
                        return { fillColor: '#4CAF50', fillOpacity: 0.45, color: _vSpecial ? '#B76E79' : '#4CAF50', weight: _vSpecial ? 2 : 1, opacity: 0.6 };
                    }
                    if (COUNTRY_REGION[appName]) {
                        const _isSpecial = COUNTRY_REGION[appName] === 'special';
                        return { fillColor: '#1a1a2e', fillOpacity: 1, color: _isSpecial ? '#B76E79' : '#FFB74D', weight: _isSpecial ? 2 : 1, opacity: 0.8 };
                    }
                    return { fillColor: '#fff', fillOpacity: 0.02, color: '#444', weight: 0.3, opacity: 0.3 };
                }

                // Visa label helper for map tooltips
                const VISA_TIP_LABELS = { free: 'visaFree', arrival: 'visaOnArrival', evisa: 'eVisa', required: 'visaRequired' };
                function visaTipHtml(v) {
                    if (!v) return '';
                    var _t2 = window.i18n ? window.i18n.t : function(k){return k;};
                    var label = _t2(VISA_TIP_LABELS[v] || v);
                    var color = VISA_MAP_COLORS[v] || '#888';
                    return '<br><span style="color:' + color + '">' + label + '</span>';
                }

                function onFeature(feature, layer) {
                    const geoName = feature.properties.NAME;
                    const appName = NAME_MAP[geoName] || geoName;
                    if (!countryLayers[appName]) countryLayers[appName] = [];
                    const visa = visaData[appName] || '';
                    countryLayers[appName].push({ layer: layer, type: 'geo', visa: visa });

                    if (visited.has(appName)) {
                        const _vLabel = window.i18n ? window.i18n.t('visited') : 'Visited';
                        const _dn = window.translateCountry ? window.translateCountry(appName) : appName;
                        layer.on('mouseover', function (e) { showMapTip(`<b>${_dn}</b><br>${_vLabel}`, e); this.setStyle({ weight: 2, fillOpacity: 0.7 }); this.bringToFront(); });
                        layer.on('mousemove', moveMapTip);
                        layer.on('mouseout', function () { hideMapTip(); this.setStyle({ weight: 1, fillOpacity: 0.45 }); });
                    } else if (COUNTRY_REGION[appName]) {
                        const _dn2 = window.translateCountry ? window.translateCountry(appName) : appName;
                        const _uLabel = window.i18n ? window.i18n.t('unvisitedLabel') : 'Unvisited';
                        const _sp = COUNTRY_REGION[appName] === 'special';
                        const _outlineColor = _sp ? '#B76E79' : '#FFB74D';
                        layer.on('mouseover', function (e) {
                            showMapTip(`<b>${_dn2}</b><br>${_uLabel}${visaTipHtml(visa)}`, e);
                            this.setStyle({ weight: 2.5, fillOpacity: 1, fillColor: '#1a1a2e', color: '#fff' });
                            this.bringToFront();
                            applyHatch(this, visa);
                        });
                        layer.on('mousemove', moveMapTip);
                        layer.on('mouseout', function () {
                            hideMapTip();
                            this.setStyle({ weight: _sp ? 2 : 1, fillOpacity: 1, fillColor: '#1a1a2e', color: _outlineColor });
                            applyHatch(this, visa);
                        });
                    }
                }

                // Render GeoJSON at -360, 0, +360 so shapes always visible when panning
                [-360, 0, 360].forEach(function (offset) {
                    L.geoJSON(shiftGeo(geo, offset), { style: styleFeature, onEachFeature: onFeature }).addTo(map);
                });

                // Inject SVG hatch patterns into the map's SVG element
                const svgEl = mapDiv.querySelector('svg');
                if (svgEl) {
                    const ns = 'http://www.w3.org/2000/svg';
                    const defs = document.createElementNS(ns, 'defs');
                    Object.entries(VISA_MAP_COLORS).forEach(function (entry) {
                        const type = entry[0], color = entry[1];
                        const pat = document.createElementNS(ns, 'pattern');
                        pat.setAttribute('id', 'hatch-' + type);
                        pat.setAttribute('patternUnits', 'userSpaceOnUse');
                        pat.setAttribute('width', '6');
                        pat.setAttribute('height', '6');
                        pat.setAttribute('patternTransform', 'rotate(45)');
                        const rect = document.createElementNS(ns, 'rect');
                        rect.setAttribute('width', '6');
                        rect.setAttribute('height', '6');
                        rect.setAttribute('fill', color);
                        rect.setAttribute('fill-opacity', '0.18');
                        pat.appendChild(rect);
                        const line = document.createElementNS(ns, 'line');
                        line.setAttribute('x1', '0'); line.setAttribute('y1', '0');
                        line.setAttribute('x2', '0'); line.setAttribute('y2', '6');
                        line.setAttribute('stroke', color);
                        line.setAttribute('stroke-width', '2');
                        line.setAttribute('stroke-opacity', '0.7');
                        pat.appendChild(line);
                        defs.appendChild(pat);
                    });
                    svgEl.insertBefore(defs, svgEl.firstChild);

                    // Apply hatch fills to all unvisited country polygons
                    Object.keys(countryLayers).forEach(function (country) {
                        if (visited.has(country)) return;
                        var visa = visaData[country];
                        if (!visa) return;
                        countryLayers[country].forEach(function (entry) {
                            if (entry.type === 'geo') applyHatch(entry.layer, visa);
                        });
                    });
                }

                // Add dot markers for all small/missing countries (also at 3 offsets)
                Object.keys(SMALL_COUNTRY_COORDS).forEach(country => {
                    if (matchedCountries.has(country)) return;
                    const baseCoords = SMALL_COUNTRY_COORDS[country];

                    const isVisited = visited.has(country);
                    const isUnvisited = !!COUNTRY_REGION[country] && !isVisited;
                    const isSpecial = COUNTRY_REGION[country] === 'special';
                    let dotFill, fillOp, strokeColor, weight, opacity, radius;

                    if (isVisited) {
                        dotFill = '#4CAF50'; fillOp = 0.45; strokeColor = isSpecial ? '#B76E79' : '#4CAF50'; weight = isSpecial ? 2 : 1; opacity = 0.6; radius = 5;
                    } else if (isUnvisited) {
                        dotFill = visaColor(country); fillOp = 0.5; strokeColor = isSpecial ? '#B76E79' : '#FFB74D'; weight = isSpecial ? 2 : 1.5; opacity = 0.8; radius = 5;
                    } else {
                        dotFill = '#fff'; fillOp = 0.02; strokeColor = '#444'; weight = 0.3; opacity = 0.3; radius = 3;
                    }

                    [-360, 0, 360].forEach(function (offset) {
                        const coords = [baseCoords[0], baseCoords[1] + offset];
                        const dot = L.circleMarker(coords, {
                            pane: 'dotPane',
                            radius: radius,
                            fillColor: dotFill,
                            fillOpacity: fillOp,
                            color: strokeColor,
                            weight: weight,
                            opacity: opacity
                        }).addTo(map);

                        let tipHtml;
                        const _vLabel = window.i18n ? window.i18n.t('visited') : 'Visited';
                        const _uLabel = window.i18n ? window.i18n.t('unvisitedLabel') : 'Unvisited';
                        const _tcn = window.translateCountry ? window.translateCountry(country) : country;
                        if (isVisited) {
                            tipHtml = `<b>${_tcn}</b><br>${_vLabel}`;
                        } else if (isUnvisited) {
                            tipHtml = `<b>${_tcn}</b><br>${_uLabel}${visaTipHtml(visaData[country])}`;
                        } else {
                            tipHtml = `<b>${_tcn}</b>`;
                        }

                        if (!countryLayers[country]) countryLayers[country] = [];
                        var dotVisa = visaData[country] || '';
                        countryLayers[country].push({ layer: dot, type: 'dot', radius: radius, fillOpacity: fillOp, visa: dotVisa });
                        var dotEl = dot.getElement();
                        dotEl.style.pointerEvents = 'auto';
                        // Apply hatch pattern to unvisited dots
                        if (isUnvisited && dotVisa) {
                            dotEl.setAttribute('fill', 'url(#hatch-' + dotVisa + ')');
                        }
                        dot.on('mouseover', function (e) {
                            showMapTip(tipHtml, e);
                            this.setStyle({ radius: radius + 2, fillOpacity: Math.min(fillOp + 0.3, 1) });
                            if (isUnvisited && dotVisa) dotEl.setAttribute('fill', 'url(#hatch-' + dotVisa + ')');
                        });
                        dot.on('mousemove', moveMapTip);
                        dot.on('mouseout', function () {
                            hideMapTip();
                            this.setStyle({ radius: radius, fillOpacity: fillOp });
                            if (isUnvisited && dotVisa) dotEl.setAttribute('fill', 'url(#hatch-' + dotVisa + ')');
                        });
                    });
                });
            });

        // Legend + tag list grouped by region
        const _t = window.i18n ? window.i18n.t : function(k){return k;};
        function legendSvg(fill, stroke, hatchColor) {
            const s = 11;
            let defs = '', fillAttr;
            if (hatchColor) {
                const id = 'lg-' + hatchColor.replace('#','');
                defs = `<defs><pattern id="${id}" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)"><rect width="4" height="4" fill="${hatchColor}" fill-opacity="0.18"/><line x1="0" y1="0" x2="0" y2="4" stroke="${hatchColor}" stroke-width="1.5" stroke-opacity="0.7"/></pattern></defs>`;
                fillAttr = `url(#${id})`;
            } else {
                fillAttr = fill;
            }
            return `<svg width="${s}" height="${s}" viewBox="0 0 ${s} ${s}" xmlns="http://www.w3.org/2000/svg">${defs}<rect x="1" y="1" width="${s-2}" height="${s-2}" rx="2" fill="${fillAttr}" stroke="${stroke}" stroke-width="1.5" opacity="0.9"/></svg>`;
        }
        // Count visa categories among unvisited
        var visaCounts = { free: 0, arrival: 0, evisa: 0, required: 0 };
        unvisited.forEach(function (c) {
            var v = visaData[c];
            if (v && visaCounts.hasOwnProperty(v)) visaCounts[v]++;
        });

        // Collect unrecognised/disputed territories not yet visited
        const disputedTerritories = Object.keys(COUNTRY_REGION)
            .filter(c => COUNTRY_REGION[c] === 'disputed' && !visited.has(c));
        // Collect special territories not yet visited
        const specialTerritories = Object.keys(COUNTRY_REGION)
            .filter(c => COUNTRY_REGION[c] === 'special' && !visited.has(c));

        let legend = `<div class="neighbors-legend">
            <span class="neighbors-legend-item">${legendSvg('rgba(76,175,80,0.5)', '#4CAF50', '')} ${_t('visited')} (${visited.size})</span>
            <span class="neighbors-legend-item">${legendSvg('rgba(255,183,77,0.15)', '#FFB74D', '')} ${_t('unvisitedNeighboursLabel')} (${unvisited.length})</span>
            <span class="neighbors-legend-item">${legendSvg('rgba(183,110,121,0.15)', '#B76E79', '')} ${_t('unvisitedPlaces')} (${specialTerritories.length})</span>
            <span class="neighbors-legend-visa">
                <span class="neighbors-legend-item">${legendSvg('none', 'transparent', '#4CAF50')} ${_t('visaFree')} (${visaCounts.free})</span>
                <span class="neighbors-legend-item">${legendSvg('none', 'transparent', '#8BC34A')} ${_t('visaOnArrival')} (${visaCounts.arrival})</span>
                <span class="neighbors-legend-item">${legendSvg('none', 'transparent', '#FFB74D')} ${_t('eVisa')} (${visaCounts.evisa})</span>
                <span class="neighbors-legend-item">${legendSvg('none', 'transparent', '#ef5350')} ${_t('visaRequired')} (${visaCounts.required})</span>
            </span>
        </div>`;
        const _flag = window.countryTrophy ? window.countryTrophy.flagImg : function(){return '';};

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
        // Add special territories
        specialTerritories.forEach(c => {
            if (!regionGroups['special']) regionGroups['special'] = [];
            if (!regionGroups['special'].includes(c)) regionGroups['special'].push(c);
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
            special: 'specialTerritories',
            other: 'region_other'
        };

        // Visa info helper
        const VISA_LABELS = { free: 'visaFree', arrival: 'visaOnArrival', evisa: 'eVisa', required: 'visaRequired' };

        legend += '<div class="neighbors-regions">';
        function renderRegion(countries, label, extraCountries, extraLabel) {
            const totalCount = countries.length + (extraCountries ? extraCountries.length : 0);
            const wideClass = totalCount >= 40 ? ' region-full' : totalCount >= 20 ? ' region-wide' : '';
            legend += `<div class="neighbors-region${wideClass}">`;
            legend += `<div class="neighbors-region-label">${label} <span class="neighbors-region-count">(${countries.length})</span></div>`;
            legend += `<div class="neighbors-region-list">`;
            countries.forEach(c => {
                const _cn = window.translateCountry ? window.translateCountry(c) : c;
                const v = visaData[c] || '';
                const visaLabel = v ? _t(VISA_LABELS[v] || v) : '—';
                const visaColor = VISA_MAP_COLORS[v] || '#888';
                legend += `<div class="un-row" data-country="${c}" data-tip-label="${_cn}" data-tip-val="${visaLabel}" data-visa-color="${visaColor}">
                    <div class="un-name">${_flag(c, 16)} ${_cn}</div>
                </div>`;
            });
            legend += '</div>';
            if (extraCountries && extraCountries.length) {
                legend += '<hr style="border:none;border-top:1px solid #444;margin:8px 0;">';
                legend += `<div class="neighbors-region-label">${extraLabel} <span class="neighbors-region-count">(${extraCountries.length})</span></div>`;
                // Group special territories by continent
                const specGroups = {};
                const specOrder = ['africa', 'americas', 'asia', 'europe', 'oceania', 'antarctica'];
                extraCountries.forEach(c => {
                    const cont = SPECIAL_CONTINENT[c] || 'other';
                    if (!specGroups[cont]) specGroups[cont] = [];
                    specGroups[cont].push(c);
                });
                const specContLabels = {
                    africa: 'africa', americas: 'americas', asia: 'asia',
                    europe: 'europe', oceania: 'oceania', antarctica: 'antarctica'
                };
                legend += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:4px;">';
                specOrder.forEach(cont => {
                    if (!specGroups[cont] || !specGroups[cont].length) return;
                    const contLabel = _t(specContLabels[cont] || cont);
                    legend += '<div>';
                    legend += `<div style="margin-bottom:2px;font-size:9px;color:#B76E79;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">${contLabel} <span style="font-weight:400;color:#666;">(${specGroups[cont].length})</span></div>`;
                    specGroups[cont].forEach(c => {
                        const _cn = window.translateCountry ? window.translateCountry(c) : c;
                        const v = visaData[c] || '';
                        const visaLabel = v ? _t(VISA_LABELS[v] || v) : '—';
                        const visaColor = VISA_MAP_COLORS[v] || '#888';
                        legend += `<div class="un-row" data-country="${c}" data-tip-label="${_cn}" data-tip-val="${visaLabel}" data-visa-color="${visaColor}" style="padding:3px 0;">
                            <div class="un-name" style="font-size:11px;">${_flag(c, 14)} ${_cn}</div>
                        </div>`;
                    });
                    legend += '</div>';
                });
                legend += '</div>';
            }
            legend += '</div>';
        }
        REGION_ORDER.forEach(region => {
            const countries = regionGroups[region];
            if (!countries || !countries.length) {
                // Still render if special has entries and this is disputed
                if (region === 'disputed' && regionGroups['special'] && regionGroups['special'].length) {
                    renderRegion([], _t(REGION_I18N[region] || region), regionGroups['special'], _t(REGION_I18N['special']));
                }
                return;
            }
            if (region === 'disputed') {
                renderRegion(countries, _t(REGION_I18N[region] || region), regionGroups['special'], _t(REGION_I18N['special']));
            } else {
                renderRegion(countries, _t(REGION_I18N[region] || region));
            }
        });
        if (regionGroups['other'] && regionGroups['other'].length) {
            renderRegion(regionGroups['other'], _t(REGION_I18N['other']));
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
                    entry.layer.setStyle({ weight: 2.5, fillOpacity: 1, fillColor: '#1a1a2e', color: '#fff' });
                    entry.layer.bringToFront();
                    if (entry.visa) applyHatch(entry.layer, entry.visa);
                    var b = entry.layer.getBounds();
                    // Use the copy closest to center (lng roughly -180..180)
                    if (b && Math.abs(b.getCenter().lng) <= 360) {
                        if (!bounds) bounds = L.latLngBounds(b);
                        else if (Math.abs(b.getCenter().lng) < Math.abs(bounds.getCenter().lng)) bounds = L.latLngBounds(b);
                    }
                } else {
                    entry.layer.setStyle({ radius: entry.radius + 3, fillOpacity: 1, color: '#fff' });
                    if (entry.visa) {
                        var el = entry.layer.getElement();
                        if (el) el.setAttribute('fill', 'url(#hatch-' + entry.visa + ')');
                    }
                    var ll = entry.layer.getLatLng();
                    if (Math.abs(ll.lng) <= 180) {
                        if (!bounds) bounds = L.latLngBounds(ll, ll);
                    }
                }
            });

            if (bounds) {
                map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 5, duration: 0.5 });
            } else if (SMALL_COUNTRY_COORDS[name]) {
                var c = SMALL_COUNTRY_COORDS[name];
                map.flyTo(c, 5, { duration: 0.5 });
            }
        }

        function unhighlightCountry() {
            if (!highlightedCountry) return;
            const layers = countryLayers[highlightedCountry];
            const _hsp = COUNTRY_REGION[highlightedCountry] === 'special';
            const _hColor = _hsp ? '#B76E79' : '#FFB74D';
            const _hWeight = _hsp ? 2 : 1;
            if (layers) {
                layers.forEach(function (entry) {
                    if (entry.type === 'geo') {
                        entry.layer.setStyle({ weight: _hWeight, fillOpacity: 1, fillColor: '#1a1a2e', color: _hColor });
                        if (entry.visa) applyHatch(entry.layer, entry.visa);
                    } else {
                        entry.layer.setStyle({ radius: entry.radius, fillOpacity: entry.fillOpacity, color: _hColor });
                        if (entry.visa) {
                            var el = entry.layer.getElement();
                            if (el) el.setAttribute('fill', 'url(#hatch-' + entry.visa + ')');
                        }
                    }
                });
            }
            highlightedCountry = null;
            map.flyTo([20, 30], 2, { duration: 0.5 });
        }

        // PIP mini-map — shows when main map scrolls out of view and list is hovered
        const pip = document.createElement('div');
        pip.className = 'unvisited-pip';
        pip.style.cssText = 'position:fixed;width:420px;height:280px;z-index:9998;border-radius:8px;overflow:hidden;border:1px solid #333;box-shadow:0 4px 20px rgba(0,0,0,0.5);display:none;background:#1a1a2e;pointer-events:none;';
        document.body.appendChild(pip);

        const pipMap = L.map(pip, {
            center: [20, 30], zoom: 1, minZoom: 1, maxZoom: 5,
            zoomControl: false, attributionControl: false,
            dragging: false, scrollWheelZoom: false,
            doubleClickZoom: false, touchZoom: false,
            worldCopyJump: true
        });
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 6, minZoom: 1 }).addTo(pipMap);

        let pipReady = false;
        const pipLayers = {};
        const pipDotLayers = {};

        fetch('asset/ne_110m_countries.geojson').then(r => r.json()).then(geo => {
            const pipMatched = new Set();
            function pipStyle(feature) {
                const gn = feature.properties.NAME;
                const an = NAME_MAP[gn] || gn;
                pipMatched.add(an);
                if (visited.has(an)) { const _ps = COUNTRY_REGION[an] === 'special'; return { fillColor: '#4CAF50', fillOpacity: 0.35, color: _ps ? '#B76E79' : '#4CAF50', weight: _ps ? 1.5 : 0.5, opacity: 0.5 }; }
                if (COUNTRY_REGION[an]) { const _ps2 = COUNTRY_REGION[an] === 'special'; return { fillColor: '#1a1a2e', fillOpacity: 1, color: _ps2 ? '#B76E79' : '#FFB74D', weight: _ps2 ? 1.5 : 0.5, opacity: 0.6 }; }
                return { fillColor: '#fff', fillOpacity: 0.02, color: '#444', weight: 0.2, opacity: 0.2 };
            }
            function pipOnFeature(feature, layer) {
                const an = NAME_MAP[feature.properties.NAME] || feature.properties.NAME;
                if (!pipLayers[an]) pipLayers[an] = [];
                pipLayers[an].push(layer);
            }
            L.geoJSON(geo, { style: pipStyle, onEachFeature: pipOnFeature }).addTo(pipMap);

            // Inject hatch patterns into PIP SVG
            var pipSvg = pip.querySelector('svg');
            if (pipSvg) {
                var ns = 'http://www.w3.org/2000/svg';
                var pipDefs = document.createElementNS(ns, 'defs');
                Object.entries(VISA_MAP_COLORS).forEach(function (entry) {
                    var type = entry[0], color = entry[1];
                    var pat = document.createElementNS(ns, 'pattern');
                    pat.setAttribute('id', 'pip-hatch-' + type);
                    pat.setAttribute('patternUnits', 'userSpaceOnUse');
                    pat.setAttribute('width', '6');
                    pat.setAttribute('height', '6');
                    pat.setAttribute('patternTransform', 'rotate(45)');
                    var rect = document.createElementNS(ns, 'rect');
                    rect.setAttribute('width', '6'); rect.setAttribute('height', '6');
                    rect.setAttribute('fill', color); rect.setAttribute('fill-opacity', '0.18');
                    pat.appendChild(rect);
                    var line = document.createElementNS(ns, 'line');
                    line.setAttribute('x1', '0'); line.setAttribute('y1', '0');
                    line.setAttribute('x2', '0'); line.setAttribute('y2', '6');
                    line.setAttribute('stroke', color); line.setAttribute('stroke-width', '2');
                    line.setAttribute('stroke-opacity', '0.7');
                    pat.appendChild(line);
                    pipDefs.appendChild(pat);
                });
                pipSvg.insertBefore(pipDefs, pipSvg.firstChild);

                // Apply hatch to unvisited GeoJSON polygons
                Object.keys(pipLayers).forEach(function (country) {
                    if (visited.has(country)) return;
                    var v = visaData[country];
                    if (!v) return;
                    pipLayers[country].forEach(function (l) {
                        if (l._path) l._path.setAttribute('fill', 'url(#pip-hatch-' + v + ')');
                    });
                });
            }

            // Add dot markers for small/missing countries
            Object.keys(SMALL_COUNTRY_COORDS).forEach(function (country) {
                if (pipMatched.has(country)) return;
                var coords = SMALL_COUNTRY_COORDS[country];
                var isV = visited.has(country);
                var isU = !!COUNTRY_REGION[country] && !isV;
                var _pSp = COUNTRY_REGION[country] === 'special';
                var dFill, dOp, dStroke, dW;
                if (isV) { dFill = '#4CAF50'; dOp = 0.4; dStroke = _pSp ? '#B76E79' : '#4CAF50'; dW = _pSp ? 1.5 : 0.5; }
                else if (isU) { dFill = visaColor(country); dOp = 0.45; dStroke = _pSp ? '#B76E79' : '#FFB74D'; dW = _pSp ? 1.5 : 1; }
                else { dFill = '#fff'; dOp = 0.02; dStroke = '#444'; dW = 0.2; }
                var dot = L.circleMarker(coords, { radius: 3, fillColor: isU ? '#1a1a2e' : dFill, fillOpacity: isU ? 1 : dOp, color: dStroke, weight: dW, opacity: 0.7 }).addTo(pipMap);
                if (!pipDotLayers[country]) pipDotLayers[country] = [];
                pipDotLayers[country].push(dot);
                // Apply hatch to unvisited dots
                if (isU) {
                    var dv = visaData[country];
                    if (dv) {
                        var dEl = dot.getElement();
                        if (dEl) dEl.setAttribute('fill', 'url(#pip-hatch-' + dv + ')');
                    }
                }
            });

            pipReady = true;
            setTimeout(() => pipMap.invalidateSize(), 300);
        });

        function pipHighlight(name) {
            if (!pipReady) return;
            var layers = pipLayers[name];
            var dots = pipDotLayers[name];
            var bounds = null;
            if (layers && layers.length) {
                var v = visaData[name] || '';
                layers.forEach(function (l) {
                    l.setStyle({ weight: 2, fillOpacity: 1, fillColor: '#1a1a2e', color: '#fff' });
                    l.bringToFront();
                    if (v && l._path) l._path.setAttribute('fill', 'url(#pip-hatch-' + v + ')');
                    var b = l.getBounds();
                    if (b) { if (!bounds) bounds = L.latLngBounds(b); else bounds.extend(b); }
                });
            }
            if (dots && dots.length) {
                var dv = visaData[name] || '';
                dots.forEach(function (d) {
                    d.setStyle({ radius: 6, fillOpacity: 1, fillColor: '#1a1a2e', color: '#fff', weight: 2 });
                    if (dv) { var el = d.getElement(); if (el) el.setAttribute('fill', 'url(#pip-hatch-' + dv + ')'); }
                    var ll = d.getLatLng();
                    if (!bounds) bounds = L.latLngBounds(ll, ll);
                });
            }
            if (bounds) pipMap.flyToBounds(bounds, { padding: [20, 20], maxZoom: 5, duration: 0.3 });
            else if (SMALL_COUNTRY_COORDS[name]) pipMap.flyTo(SMALL_COUNTRY_COORDS[name], 4, { duration: 0.3 });
        }
        function pipUnhighlight(name) {
            if (!pipReady) return;
            var _puSp = COUNTRY_REGION[name] === 'special';
            var _puColor = _puSp ? '#B76E79' : '#FFB74D';
            var _puW = _puSp ? 1.5 : 0.5;
            var layers = pipLayers[name];
            if (layers) {
                layers.forEach(function (l) {
                    var an = NAME_MAP[l.feature.properties.NAME] || l.feature.properties.NAME;
                    var v = visaData[an];
                    if (visited.has(an)) {
                        l.setStyle({ fillColor: '#4CAF50', fillOpacity: 0.35, color: _puSp ? '#B76E79' : '#4CAF50', weight: _puW });
                    } else {
                        l.setStyle({ fillColor: '#1a1a2e', fillOpacity: 1, color: _puColor, weight: _puW });
                        if (v && l._path) l._path.setAttribute('fill', 'url(#pip-hatch-' + v + ')');
                    }
                });
            }
            var dots = pipDotLayers[name];
            if (dots) {
                var isV = visited.has(name);
                var isU = !!COUNTRY_REGION[name] && !isV;
                var dv = visaData[name] || '';
                dots.forEach(function (d) {
                    if (isV) d.setStyle({ radius: 3, fillOpacity: 0.4, color: _puSp ? '#B76E79' : '#4CAF50', weight: _puW });
                    else if (isU) {
                        d.setStyle({ radius: 3, fillOpacity: 1, fillColor: '#1a1a2e', color: _puColor, weight: _puSp ? 1.5 : 1 });
                        if (dv) { var el = d.getElement(); if (el) el.setAttribute('fill', 'url(#pip-hatch-' + dv + ')'); }
                    }
                    else d.setStyle({ radius: 3, fillOpacity: 0.02, color: '#444', weight: 0.2 });
                });
            }
            pipMap.flyTo([20, 30], 1, { duration: 0.3 });
        }

        // Track main map visibility within the scrollable widgets panel
        let mainMapVisible = true;
        let pipCountry = null;
        const scrollRoot = container.closest('.widgets-section') || null;
        const observer = new IntersectionObserver(function (entries) {
            mainMapVisible = entries[0].isIntersecting;
            if (mainMapVisible || !pipCountry) {
                pip.style.display = 'none';
            }
        }, { root: scrollRoot, threshold: 0.1 });
        observer.observe(mapDiv);

        // Single mousemove handler for both main map highlight + PIP
        const tagList = container.querySelector('.neighbors-regions');
        tagList.addEventListener('mousemove', function (e) {
            const row = e.target.closest('.un-row');
            if (!row) {
                tip.style.display = 'none';
                unhighlightCountry();
                if (pipCountry) { pipUnhighlight(pipCountry); pipCountry = null; }
                pip.style.display = 'none';
                return;
            }
            // Tooltip - position to right of cursor
            tip.innerHTML = `<div class="tip-label">${row.dataset.tipLabel}</div><div class="tip-val" style="color:${row.dataset.visaColor || '#888'}">${row.dataset.tipVal}</div>`;
            tip.style.display = 'block';
            tip.style.left = (e.clientX + 16) + 'px';
            tip.style.top = (e.clientY - 12) + 'px';

            const country = row.dataset.country;

            // Main map highlight (always zoom when visible)
            highlightCountry(country);

            // PIP: show when main map not visible, position to the left of cursor
            if (!mainMapVisible) {
                var pipW = 420, pipH = 280;
                var pipLeft = e.clientX - pipW - 16;
                var pipTop = e.clientY - pipH / 2;
                if (pipLeft < 8) pipLeft = 8;
                if (pipTop < 8) pipTop = 8;
                if (pipTop + pipH > window.innerHeight - 8) pipTop = window.innerHeight - pipH - 8;
                pip.style.left = pipLeft + 'px';
                pip.style.top = pipTop + 'px';

                if (country !== pipCountry) {
                    if (pipCountry) pipUnhighlight(pipCountry);
                    pipCountry = country;
                    pip.style.display = 'block';
                    pipMap.invalidateSize();
                    pipHighlight(country);
                } else {
                    pip.style.display = 'block';
                }
            } else {
                if (pipCountry) { pipUnhighlight(pipCountry); pipCountry = null; }
                pip.style.display = 'none';
            }
        });
        tagList.addEventListener('mouseleave', function () {
            tip.style.display = 'none';
            unhighlightCountry();
            if (pipCountry) { pipUnhighlight(pipCountry); pipCountry = null; }
            pip.style.display = 'none';
        });

        setTimeout(() => map.invalidateSize(), 600);
    }

    waitForData(render);
    window.addEventListener('langchange', function() { render(); });
})();
