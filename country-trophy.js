// Country Trophy Notification — PlayStation-style trophy popup with tiered awards + achievements panel
(function () {
    'use strict';

    // ── State ──
    const seenCountries = new Set();
    const continentCountries = {}; // continent → Set of countries
    const seenContinents = new Set();
    let uniqueCities = new Set();
    let firstTripDate = null;
    let trophyQueue = [];
    let isShowing = false;
    let silverAwarded = {};   // continent → true
    let platinumCircumnavigation = false;
    let platinum10Year = false;
    let goldMilestones = new Set(); // tracks which 50-city milestones have been awarded
    let goldBigFive = false;        // Superpower Passport gold
    let silverBigFive = false;       // World Power Tour silver
    let goldAsean = false;           // ASEAN Complete gold
    let goldSilkRoad = false;        // Silk Road Scholar gold
    let goldJetSetYear = false;      // Jet Set Year gold
    let goldYearRound = false;       // Year-Round Traveller gold
    let goldFrequentFlyer = false;   // Frequent Flyer (now platinum)
    let goldNewWorld = false;        // New World Explorer gold
    let goldEU = false;              // EU Complete gold
    const continentsPerYear = {};    // year → Set of continents visited
    const monthsWithTrips = new Set(); // month indices (0-11) with any trip
    let cityVisitCounts = {};        // cityKey → visit count
    let specialBronzeAwarded = {}; // special location id → true
    let earnedDates = {}; // achievement id → date string when earned
    let panelOpen = false;

    // ── Country flag images (ISO 3166-1 alpha-2 codes → local asset/flags/) ──
    // Complete list of 195 sovereign states + key territories
    const COUNTRY_ISO = {
        // Asia
        'Japan': 'jp', 'South Korea': 'kr', 'North Korea': 'kp', 'China': 'cn',
        'Hong Kong SAR': 'hk', 'Macau SAR': 'mo', 'ROC (Taiwan)': 'tw',
        'Singapore': 'sg', 'Malaysia': 'my', 'Indonesia': 'id', 'Thailand': 'th',
        'Vietnam': 'vn', 'Cambodia': 'kh', 'Laos': 'la', 'Myanmar': 'mm',
        'Philippines': 'ph', 'India': 'in', 'Sri Lanka': 'lk', 'Bangladesh': 'bd',
        'Bhutan': 'bt', 'Nepal': 'np', 'Pakistan': 'pk', 'Afghanistan': 'af',
        'Maldives': 'mv', 'Mongolia': 'mn', 'Brunei': 'bn', 'Timor-Leste': 'tl',
        'Uzbekistan': 'uz', 'Kazakhstan': 'kz', 'Turkmenistan': 'tm',
        'Kyrgyzstan': 'kg', 'Tajikistan': 'tj',
        'Azerbaijan': 'az', 'Georgia': 'ge', 'Armenia': 'am',
        // Middle East
        'Israel': 'il', 'Palestine': 'ps', 'Jordan': 'jo', 'Lebanon': 'lb',
        'Saudi Arabia': 'sa', 'UAE': 'ae', 'Oman': 'om', 'Kuwait': 'kw',
        'Qatar': 'qa', 'Bahrain': 'bh', 'Iraq': 'iq', 'Iran': 'ir',
        'Syria': 'sy', 'Yemen': 'ye', 'Turkey': 'tr',
        // Europe
        'UK': 'gb', 'Ireland': 'ie', 'France': 'fr', 'Germany': 'de',
        'Italy': 'it', 'Spain': 'es', 'Portugal': 'pt', 'Netherlands': 'nl',
        'Belgium': 'be', 'Luxembourg': 'lu', 'Switzerland': 'ch', 'Austria': 'at',
        'Czech Republic': 'cz', 'Poland': 'pl', 'Hungary': 'hu',
        'Romania': 'ro', 'Bulgaria': 'bg', 'Serbia': 'rs',
        'Bosnia and Herzegovina': 'ba', 'Montenegro': 'me', 'Albania': 'al',
        'North Macedonia': 'mk', 'Slovenia': 'si', 'Croatia': 'hr', 'Slovakia': 'sk',
        'Greece': 'gr', 'Cyprus': 'cy', 'Kosovo': 'xk',
        'Sweden': 'se', 'Denmark': 'dk', 'Norway': 'no', 'Finland': 'fi',
        'Iceland': 'is', 'Estonia': 'ee', 'Latvia': 'lv', 'Lithuania': 'lt',
        'Russia': 'ru', 'Belarus': 'by', 'Moldova': 'md',
        'Monaco': 'mc', 'San Marino': 'sm', 'Malta': 'mt',
        'Liechtenstein': 'li', 'Andorra': 'ad', 'Vatican City': 'va',
        'Gibraltar': 'gi',
        'Ukraine': 'ua',
        'Faroe Islands': 'fo', 'Greenland': 'gl', 'Guernsey': 'gg',
        'Jersey': 'je', 'Isle of Man': 'im',
        // Africa
        'Egypt': 'eg', 'Morocco': 'ma', 'Tunisia': 'tn', 'Algeria': 'dz',
        'Libya': 'ly', 'Sudan': 'sd', 'South Sudan': 'ss',
        'Nigeria': 'ng', 'Ghana': 'gh', 'Senegal': 'sn', 'Mali': 'ml',
        'Ethiopia': 'et', 'Kenya': 'ke', 'Tanzania': 'tz', 'Uganda': 'ug',
        'Rwanda': 'rw', 'Burundi': 'bi', 'DR Congo': 'cd', 'Republic of the Congo': 'cg',
        'South Africa': 'za', 'Namibia': 'na', 'Botswana': 'bw', 'Zimbabwe': 'zw',
        'Zambia': 'zm', 'Mozambique': 'mz', 'Malawi': 'mw', 'Madagascar': 'mg',
        'Mauritius': 'mu', 'Seychelles': 'sc', 'Comoros': 'km',
        'Cameroon': 'cm', 'Gabon': 'ga', 'Equatorial Guinea': 'gq',
        'Central African Republic': 'cf', 'Chad': 'td',
        'Niger': 'ne', 'Burkina Faso': 'bf', 'Benin': 'bj', 'Togo': 'tg',
        "Côte d'Ivoire": 'ci', 'Liberia': 'lr', 'Sierra Leone': 'sl',
        'Guinea': 'gn', 'Guinea-Bissau': 'gw', 'Gambia': 'gm',
        'Cape Verde': 'cv', 'Mauritania': 'mr', 'Djibouti': 'dj',
        'Eritrea': 'er', 'Somalia': 'so', 'Angola': 'ao',
        'Lesotho': 'ls', 'Eswatini': 'sz',
        'Western Sahara': 'eh', 'São Tomé and Príncipe': 'st',
        // North America
        'USA': 'us', 'Canada': 'ca', 'Mexico': 'mx',
        'Cuba': 'cu', 'Jamaica': 'jm', 'Haiti': 'ht',
        'Dominican Republic': 'do', 'Trinidad and Tobago': 'tt',
        'Bahamas': 'bs', 'Barbados': 'bb', 'Belize': 'bz',
        'Costa Rica': 'cr', 'El Salvador': 'sv', 'Guatemala': 'gt',
        'Honduras': 'hn', 'Nicaragua': 'ni', 'Panama': 'pa',
        'Grenada': 'gd', 'Dominica': 'dm',
        'Saint Kitts and Nevis': 'kn', 'Saint Lucia': 'lc',
        'Saint Vincent and the Grenadines': 'vc',
        'Antigua and Barbuda': 'ag',
        'Bermuda': 'bm', 'Cayman Islands': 'ky',
        'Turks and Caicos Islands': 'tc',
        'British Virgin Islands': 'vg', 'Anguilla': 'ai', 'Montserrat': 'ms',
        // South America
        'Colombia': 'co', 'Peru': 'pe', 'Bolivia': 'bo', 'Chile': 'cl',
        'Brazil': 'br', 'Argentina': 'ar', 'Uruguay': 'uy', 'Paraguay': 'py',
        'Ecuador': 'ec', 'Venezuela': 've', 'Guyana': 'gy', 'Suriname': 'sr',
        'Falkland Islands': 'fk',
        // Oceania
        'Australia': 'au', 'New Zealand': 'nz',
        'Fiji': 'fj', 'Papua New Guinea': 'pg', 'Samoa': 'ws', 'Tonga': 'to',
        'Vanuatu': 'vu', 'Solomon Islands': 'sb', 'Kiribati': 'ki',
        'Micronesia': 'fm', 'Marshall Islands': 'mh', 'Palau': 'pw',
        'Tuvalu': 'tv', 'Nauru': 'nr', 'Niue': 'nu', 'Cook Islands': 'ck'
    };

    function flagImg(country, size) {
        const s = size || 20;
        const iso = COUNTRY_ISO[country];
        if (!iso) return '';
        return `<img src="asset/flags/${iso}.png" width="${s}" height="${Math.round(s * 0.75)}" alt="${country}" style="vertical-align:middle;border-radius:2px;">`;
    }

    // ── Achievement icon (SVG files in asset/icons/) ──
    // Cache fetched SVG content for reuse
    const _svgCache = {};
    function achIcon(achId, color, size) {
        const s = size || 20;
        const spanId = `ach-icon-${achId}-${Math.random().toString(36).slice(2, 8)}`;
        // Start with trophy fallback, replace with SVG once loaded
        setTimeout(() => {
            const el = document.getElementById(spanId);
            if (!el) return;
            const apply = (svgText) => {
                // Inject color and size into the SVG
                let svg = svgText
                    .replace(/width="[^"]*"/, `width="${s}"`)
                    .replace(/height="[^"]*"/, `height="${s}"`)
                    .replace(/currentColor/g, color);
                el.innerHTML = svg;
            };
            if (_svgCache[achId]) { apply(_svgCache[achId]); return; }
            fetch(`asset/icons/${achId}.svg`).then(r => {
                if (!r.ok) return;
                return r.text();
            }).then(txt => {
                if (!txt) return;
                _svgCache[achId] = txt;
                apply(txt);
            }).catch(() => {});
        }, 0);
        return `<span id="${spanId}" style="display:inline-flex;align-items:center;justify-content:center;width:${s}px;height:${s}px;">${trophySVG(color, s)}</span>`;
    }

    // ── Audio ──
    const trophySound = new Audio('asset/audio/trophy.mp3');
    trophySound.volume = 0.7;

    function playSound() {
        try {
            trophySound.currentTime = 0;
            trophySound.play().catch(() => {});
        } catch (e) {}
    }

    // ── Country → Continent mapping (complete) ──
    const COUNTRY_TO_CONTINENT = {
        // Asia
        'Japan': 'Asia', 'South Korea': 'Asia', 'North Korea': 'Asia', 'China': 'Asia',
        'Hong Kong SAR': 'Asia', 'Macau SAR': 'Asia', 'ROC (Taiwan)': 'Asia',
        'Singapore': 'Asia', 'Malaysia': 'Asia', 'Indonesia': 'Asia', 'Thailand': 'Asia',
        'Vietnam': 'Asia', 'Cambodia': 'Asia', 'Laos': 'Asia', 'Myanmar': 'Asia',
        'Philippines': 'Asia', 'India': 'Asia', 'Sri Lanka': 'Asia', 'Bangladesh': 'Asia',
        'Bhutan': 'Asia', 'Nepal': 'Asia', 'Pakistan': 'Asia', 'Afghanistan': 'Asia',
        'Maldives': 'Asia', 'Mongolia': 'Asia', 'Brunei': 'Asia', 'Timor-Leste': 'Asia',
        'Uzbekistan': 'Asia', 'Kazakhstan': 'Asia', 'Turkmenistan': 'Asia',
        'Kyrgyzstan': 'Asia', 'Tajikistan': 'Asia',
        'Azerbaijan': 'Asia', 'Georgia': 'Asia', 'Armenia': 'Asia',
        // Middle East (counted as Asia)
        'Israel': 'Asia', 'Palestine': 'Asia', 'Jordan': 'Asia', 'Lebanon': 'Asia',
        'Saudi Arabia': 'Asia', 'UAE': 'Asia', 'Oman': 'Asia', 'Kuwait': 'Asia',
        'Qatar': 'Asia', 'Bahrain': 'Asia', 'Iraq': 'Asia', 'Iran': 'Asia',
        'Syria': 'Asia', 'Yemen': 'Asia', 'Turkey': 'Asia',

        // Europe
        'UK': 'Europe', 'Ireland': 'Europe', 'France': 'Europe', 'Germany': 'Europe',
        'Italy': 'Europe', 'Spain': 'Europe', 'Portugal': 'Europe', 'Netherlands': 'Europe',
        'Belgium': 'Europe', 'Luxembourg': 'Europe', 'Switzerland': 'Europe', 'Austria': 'Europe',
        'Czech Republic': 'Europe', 'Poland': 'Europe', 'Hungary': 'Europe',
        'Romania': 'Europe', 'Bulgaria': 'Europe', 'Serbia': 'Europe',
        'Bosnia and Herzegovina': 'Europe', 'Montenegro': 'Europe', 'Albania': 'Europe',
        'North Macedonia': 'Europe', 'Slovenia': 'Europe', 'Croatia': 'Europe',
        'Slovakia': 'Europe', 'Greece': 'Europe', 'Cyprus': 'Europe', 'Kosovo': 'Europe',
        'Sweden': 'Europe', 'Denmark': 'Europe', 'Norway': 'Europe', 'Finland': 'Europe',
        'Iceland': 'Europe', 'Estonia': 'Europe', 'Latvia': 'Europe', 'Lithuania': 'Europe',
        'Russia': 'Europe', 'Belarus': 'Europe', 'Moldova': 'Europe',
        'Monaco': 'Europe', 'San Marino': 'Europe', 'Malta': 'Europe',
        'Liechtenstein': 'Europe', 'Andorra': 'Europe', 'Vatican City': 'Europe',
        'Gibraltar': 'Europe',
        'Ukraine': 'Europe',
        'Faroe Islands': 'Europe', 'Greenland': 'Europe', 'Guernsey': 'Europe',
        'Jersey': 'Europe', 'Isle of Man': 'Europe',

        // Africa
        'Egypt': 'Africa', 'Morocco': 'Africa', 'Tunisia': 'Africa', 'Algeria': 'Africa',
        'Libya': 'Africa', 'Sudan': 'Africa', 'South Sudan': 'Africa',
        'Nigeria': 'Africa', 'Ghana': 'Africa', 'Senegal': 'Africa', 'Mali': 'Africa',
        'Ethiopia': 'Africa', 'Kenya': 'Africa', 'Tanzania': 'Africa', 'Uganda': 'Africa',
        'Rwanda': 'Africa', 'Burundi': 'Africa', 'DR Congo': 'Africa', 'Republic of the Congo': 'Africa',
        'South Africa': 'Africa', 'Namibia': 'Africa', 'Botswana': 'Africa', 'Zimbabwe': 'Africa',
        'Zambia': 'Africa', 'Mozambique': 'Africa', 'Malawi': 'Africa', 'Madagascar': 'Africa',
        'Mauritius': 'Africa', 'Seychelles': 'Africa', 'Comoros': 'Africa',
        'Cameroon': 'Africa', 'Gabon': 'Africa', 'Equatorial Guinea': 'Africa',
        'Central African Republic': 'Africa', 'Chad': 'Africa',
        'Niger': 'Africa', 'Burkina Faso': 'Africa', 'Benin': 'Africa', 'Togo': 'Africa',
        "Côte d'Ivoire": 'Africa', 'Liberia': 'Africa', 'Sierra Leone': 'Africa',
        'Guinea': 'Africa', 'Guinea-Bissau': 'Africa', 'Gambia': 'Africa',
        'Cape Verde': 'Africa', 'Mauritania': 'Africa', 'Djibouti': 'Africa',
        'Eritrea': 'Africa', 'Somalia': 'Africa', 'Angola': 'Africa',
        'Lesotho': 'Africa', 'Eswatini': 'Africa',
        'Western Sahara': 'Africa', 'São Tomé and Príncipe': 'Africa',

        // North America
        'USA': 'North America', 'Canada': 'North America', 'Mexico': 'North America',
        'Cuba': 'North America', 'Jamaica': 'North America', 'Haiti': 'North America',
        'Dominican Republic': 'North America', 'Trinidad and Tobago': 'North America',
        'Bahamas': 'North America', 'Barbados': 'North America', 'Belize': 'North America',
        'Costa Rica': 'North America', 'El Salvador': 'North America', 'Guatemala': 'North America',
        'Honduras': 'North America', 'Nicaragua': 'North America', 'Panama': 'North America',
        'Grenada': 'North America', 'Dominica': 'North America',
        'Saint Kitts and Nevis': 'North America', 'Saint Lucia': 'North America',
        'Saint Vincent and the Grenadines': 'North America',
        'Antigua and Barbuda': 'North America',
        'Bermuda': 'North America', 'Cayman Islands': 'North America',
        'Turks and Caicos Islands': 'North America',
        'British Virgin Islands': 'North America', 'Anguilla': 'North America', 'Montserrat': 'North America',

        // South America
        'Colombia': 'South America', 'Peru': 'South America', 'Bolivia': 'South America',
        'Chile': 'South America', 'Brazil': 'South America', 'Argentina': 'South America',
        'Uruguay': 'South America', 'Paraguay': 'South America',
        'Ecuador': 'South America', 'Venezuela': 'South America',
        'Guyana': 'South America', 'Suriname': 'South America',
        'Falkland Islands': 'South America',

        // Oceania
        'Australia': 'Oceania', 'New Zealand': 'Oceania',
        'Fiji': 'Oceania', 'Papua New Guinea': 'Oceania', 'Samoa': 'Oceania', 'Tonga': 'Oceania',
        'Vanuatu': 'Oceania', 'Solomon Islands': 'Oceania', 'Kiribati': 'Oceania',
        'Micronesia': 'Oceania', 'Marshall Islands': 'Oceania', 'Palau': 'Oceania',
        'Tuvalu': 'Oceania', 'Nauru': 'Oceania', 'Niue': 'Oceania', 'Cook Islands': 'Oceania'
    };

    const ALL_CONTINENTS = new Set(['Asia', 'Europe', 'Africa', 'North America', 'South America', 'Oceania']);

    // ── Trophy tiers: colors & SVG ──
    const TIERS = {
        bronze:   { color: '#CD7F32', bg: 'rgba(205,127,50,0.15)' },
        silver:   { color: '#C0C0C0', bg: 'rgba(192,192,192,0.15)' },
        gold:     { color: '#FFD700', bg: 'rgba(255,215,0,0.15)' },
        platinum: { color: '#B76E79', bg: 'rgba(183,110,121,0.20)' }
    };

    function trophySVG(color, size) {
        const s = size || 26;
        return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="${color}" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 3h14v2h-1.5c0 2.05-.77 3.93-2.04 5.36C14.18 11.64 13 13.05 13 14.5V17h2v2H9v-2h2v-2.5c0-1.45-1.18-2.86-2.46-4.14C7.27 8.93 6.5 7.05 6.5 5H5V3zm3.5 2c0 1.44.55 2.75 1.46 3.74L12 11l2.04-2.26A5.48 5.48 0 0 0 15.5 5h-7z"/>
            <path d="M3 5h2v2.5C5 8.88 5.62 10 6.5 10.5L5 12C3.5 11 2.5 9 2.5 7V5H3zm18 0h-2v2.5C19 8.88 18.38 10 17.5 10.5L19 12c1.5-1 2.5-3 2.5-5V5H21z" opacity="0.6"/>
        </svg>`;
    }

    // ── DOM setup: notification container ──
    const container = document.createElement('div');
    container.id = 'trophy-container';
    document.body.appendChild(container);

    // ── DOM setup: achievements panel overlay ──
    const overlay = document.createElement('div');
    overlay.id = 'achievements-overlay';
    overlay.innerHTML = `
        <div class="achievements-panel">
            <div class="achievements-header">
                <div class="achievements-title">Achievements</div>
                <div class="achievements-summary" id="achievements-summary"></div>
                <button class="achievements-close" id="achievements-close">&times;</button>
            </div>
            <div class="achievements-body" id="achievements-body"></div>
        </div>
    `;
    document.body.appendChild(overlay);

    // ── Styles ──
    const style = document.createElement('style');
    style.textContent = `
        /* ── Notification popup ── */
        #trophy-container {
            position: fixed;
            bottom: 32px;
            left: 32px;
            z-index: 100000;
            pointer-events: none;
        }

        .trophy-notification {
            display: flex;
            align-items: center;
            gap: 12px;
            background: linear-gradient(180deg, rgba(44,44,44,0.98), rgba(32,32,32,0.98));
            border-radius: 8px;
            padding: 12px 18px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.6);
            min-width: 260px;
            max-width: 380px;
            opacity: 0;
            transform: translateX(-40px);
            transition: opacity 0.4s ease, transform 0.4s ease;
            pointer-events: auto;
            margin-top: 10px;
        }
        .trophy-notification.show { opacity: 1; transform: translateX(0); }
        .trophy-notification.hide { opacity: 0; transform: translateX(-40px); }

        .trophy-icon {
            flex-shrink: 0;
            width: 42px;
            height: 42px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .trophy-icon svg { width: 26px; height: 26px; }

        .trophy-body { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .trophy-tier { font-size: 0.5em; text-transform: uppercase; letter-spacing: 0.25em; font-weight: 700; }
        .trophy-label { font-size: 0.55em; text-transform: uppercase; letter-spacing: 0.2em; color: #999; font-weight: 500; }
        .trophy-title { font-weight: 600; font-size: 1.1em; text-transform: uppercase; letter-spacing: 0.2em; line-height: 1.3; word-break: break-word; }
        .trophy-subtitle { font-size: 0.6em; text-transform: uppercase; letter-spacing: 0.2em; color: #fff; margin-top: 1px; }

        .trophy-notification.tier-platinum { border: 1px solid rgba(183,110,121,0.30); }
        .trophy-notification.tier-gold { border: 1px solid rgba(255,215,0,0.1); }
        .trophy-notification.tier-silver { border: 1px solid rgba(192,192,192,0.08); }
        .trophy-notification.tier-bronze { border: 1px solid rgba(255,255,255,0.04); }

        @media (max-width: 768px) {
            #trophy-container { bottom: 16px; left: 16px; right: 16px; }
            .trophy-notification { min-width: unset; max-width: unset; width: 100%; padding: 10px 14px; }
        }

        /* ── Achievements overlay ── */
        #achievements-overlay {
            position: fixed;
            inset: 0;
            z-index: 200000;
            background: rgba(0,0,0,0.7);
            display: none;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        }
        #achievements-overlay.open {
            display: flex;
            opacity: 1;
        }

        .achievements-panel {
            background: linear-gradient(180deg, #2c2c2c, #222);
            border-radius: 10px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.08);
            width: 620px;
            max-width: 92vw;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            transform: scale(0.95);
            transition: transform 0.3s ease;
        }
        #achievements-overlay.open .achievements-panel {
            transform: scale(1);
        }

        .achievements-header {
            display: flex;
            align-items: center;
            padding: 18px 22px;
            border-bottom: 1px solid rgba(255,255,255,0.06);
            gap: 14px;
        }
        .achievements-title {
            font-size: 1.1em;
            font-weight: 600;
            color: #4CAF50;
            text-transform: uppercase;
            letter-spacing: 0.15em;
        }
        .achievements-summary {
            font-size: 0.65em;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            margin-left: auto;
            margin-right: 8px;
        }
        .achievements-close {
            background: none;
            border: none;
            color: #666;
            font-size: 1.5em;
            cursor: pointer;
            padding: 0 4px;
            line-height: 1;
            transition: color 0.2s;
        }
        .achievements-close:hover { color: #fff; }

        .achievements-body {
            overflow-y: auto;
            padding: 16px 22px 22px;
            flex: 1;
        }
        .achievements-body::-webkit-scrollbar { width: 8px; }
        .achievements-body::-webkit-scrollbar-track { background: #333; }
        .achievements-body::-webkit-scrollbar-thumb { background: #555; border-radius: 4px; }
        .achievements-body::-webkit-scrollbar-thumb:hover { background: #666; }

        /* World progress bar */
        .world-progress {
            padding: 0 0 14px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            margin-bottom: 6px;
        }
        .world-progress-label {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            margin-bottom: 8px;
        }
        .world-progress-title {
            font-size: 0.7em;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.15em;
            color: #4CAF50;
        }
        .world-progress-count {
            font-size: 0.65em;
            color: #aaa;
            letter-spacing: 0.1em;
        }
        .world-progress-bar {
            width: 100%;
            height: 6px;
            background: rgba(255,255,255,0.06);
            border-radius: 3px;
            overflow: hidden;
        }
        .world-progress-fill {
            height: 100%;
            border-radius: 3px;
            background: linear-gradient(90deg, #4CAF50, #81C784);
            transition: width 0.5s ease;
        }
        .world-progress-pct {
            font-size: 0.5em;
            color: #666;
            text-align: right;
            margin-top: 4px;
            letter-spacing: 0.1em;
        }

        /* Section headers */
        .ach-section-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 18px 0 10px;
            padding-bottom: 6px;
            border-bottom: 1px solid rgba(255,255,255,0.04);
        }
        .ach-section-header:first-child { margin-top: 0; }
        .ach-section-label {
            font-size: 0.6em;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.2em;
        }
        .ach-section-count {
            font-size: 0.55em;
            color: #666;
            letter-spacing: 0.1em;
            margin-left: auto;
        }

        /* Achievement row */
        .ach-row {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: 6px;
            margin-bottom: 4px;
            transition: background 0.2s;
        }
        .ach-row:hover { background: rgba(255,255,255,0.03); }

        .ach-row.earned { }
        .ach-row.unearned { opacity: 0.35; }

        /* Glow-in animation for newly earned */
        @keyframes achGlowIn {
            0%   { box-shadow: 0 0 0 0 transparent; background: transparent; }
            30%  { box-shadow: 0 0 18px 4px var(--glow-color); background: var(--glow-bg); }
            100% { box-shadow: 0 0 0 0 transparent; background: transparent; }
        }
        .ach-row.just-earned {
            animation: achGlowIn 1.8s ease-out forwards;
            opacity: 1 !important;
        }

        /* Smooth reorder transition */
        .ach-row {
            transition: background 0.2s, transform 0.5s ease, opacity 0.5s ease;
        }

        .ach-trophy-icon {
            flex-shrink: 0;
            width: 36px;
            height: 36px;
            border-radius: 5px;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .ach-info {
            flex: 1;
            min-width: 0;
        }
        .ach-name {
            font-size: 0.85em;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.12em;
            line-height: 1.3;
            word-break: break-word;
        }
        .ach-desc {
            font-size: 0.6em;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            margin-top: 2px;
        }

        .ach-badge {
            font-size: 0.45em;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.2em;
            padding: 3px 8px;
            border-radius: 3px;
            flex-shrink: 0;
        }
        .ach-badge.earned-badge {
            background: rgba(76,175,80,0.15);
            color: #4CAF50;
        }
        .ach-badge.locked-badge {
            background: rgba(255,255,255,0.04);
            color: #555;
        }

        /* Progress bar for continent silvers */
        .ach-progress {
            width: 60px;
            height: 4px;
            background: rgba(255,255,255,0.06);
            border-radius: 2px;
            overflow: hidden;
            flex-shrink: 0;
        }
        .ach-progress-fill {
            height: 100%;
            border-radius: 2px;
            transition: width 0.3s;
        }

        .ach-divider {
            height: 1px;
            background: rgba(255,255,255,0.07);
            margin: 8px 0;
        }
        .ach-earned-col {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 3px;
            flex-shrink: 0;
        }
        .ach-date {
            font-size: 0.45em;
            color: #666;
            text-transform: uppercase;
            letter-spacing: 0.12em;
        }

        @media (max-width: 768px) {
            .achievements-panel { width: 100%; max-width: 100%; max-height: 90vh; border-radius: 10px 10px 0 0; }
            .ach-row { padding: 8px 8px; gap: 8px; }
            .ach-trophy-icon { width: 30px; height: 30px; }
            .ach-name { font-size: 0.75em; }
            .ach-progress { width: 40px; }
        }
    `;
    document.head.appendChild(style);

    // ── Display logic: notifications ──
    function showNext() {
        if (trophyQueue.length === 0) { isShowing = false; return; }
        isShowing = true;
        const trophy = trophyQueue.shift();
        const tier = TIERS[trophy.tier];

        const el = document.createElement('div');
        el.className = `trophy-notification tier-${trophy.tier}`;
        // Bronze country trophies show flag, non-country trophies show bespoke icon
        const iconHtml = trophy.tier === 'bronze' && COUNTRY_ISO[trophy.title]
            ? `<div class="trophy-icon" style="background:${tier.bg}">${flagImg(trophy.title, 26)}</div>`
            : `<div class="trophy-icon" style="background:${tier.bg}">${trophy.achId ? achIcon(trophy.achId, tier.color, 26) : trophySVG(tier.color)}</div>`;
        el.innerHTML = `
            ${iconHtml}
            <div class="trophy-body">
                <div class="trophy-tier" style="color:${tier.color}">${trophy.tier} trophy</div>
                <div class="trophy-title" style="color:${tier.color}">${trophy.title}</div>
                <div class="trophy-subtitle">${trophy.subtitle}</div>
            </div>
        `;
        container.appendChild(el);
        // Skip sound for bronze country-visited trophies
        if (!(trophy.tier === 'bronze' && COUNTRY_ISO[trophy.title])) playSound();

        requestAnimationFrame(() => { requestAnimationFrame(() => { el.classList.add('show'); }); });

        const holdTime = trophy.tier === 'platinum' ? 4000 : trophy.tier === 'gold' ? 3500 : trophy.tier === 'silver' ? 3000 : 2600;
        setTimeout(() => {
            el.classList.remove('show');
            el.classList.add('hide');
            setTimeout(() => { el.remove(); showNext(); }, 400);
        }, holdTime);
    }

    function queue(tier, title, subtitle, achId) {
        trophyQueue.push({ tier, title, subtitle, achId });
        if (!isShowing) showNext();
    }

    // Track which achievements were earned on previous render (for glow animation)
    let prevEarnedIds = new Set();

    // ── Build the full achievements list ──
    function getAllAchievements() {
        const achievements = [];

        // Platinum
        achievements.push({
            tier: 'platinum', id: 'circum',
            name: 'Circumnavigation',
            desc: 'Visit cities on all 6 inhabited continents',
            earned: platinumCircumnavigation,
            earnedDate: earnedDates['circum']
        });
        const yearsElapsed = firstTripDate
            ? Math.min(10, (new Date() - firstTripDate) / (1000 * 60 * 60 * 24 * 365.25))
            : 0;
        achievements.push({
            tier: 'platinum', id: '10year',
            name: 'Decade of Travel',
            desc: '10 years of travelling since first trip',
            earned: platinum10Year,
            earnedDate: earnedDates['10year'],
            progress: Math.round(yearsElapsed * 10) / 10,
            total: 10
        });
        const maxCityVisits = Object.values(cityVisitCounts).reduce((a, b) => Math.max(a, b), 0);
        achievements.push({
            tier: 'platinum', id: 'frequentflyer',
            name: 'Always Home',
            desc: 'Return to the same city 100 or more times',
            earned: goldFrequentFlyer,
            earnedDate: earnedDates['frequentflyer'],
            progress: Math.min(maxCityVisits, 100),
            total: 100
        });
        achievements.push({
            tier: 'platinum', id: 'city500',
            name: 'Globe Trotter',
            desc: 'Visit 500 unique cities',
            earned: goldMilestones.has(500),
            earnedDate: goldMilestones.has(500) ? earnedDates['city500'] : undefined,
            progress: Math.min(uniqueCities.size, 500),
            total: 500
        });

        // Gold — city milestones 100-400 (all earned + next unearned)
        const goldMilestoneNames = { 100: 'Centurion', 200: 'World Walker', 300: 'Wayfarer', 400: 'Pathfinder' };
        const currentCities = uniqueCities.size;
        const goldMilestoneKeys = [100, 200, 300, 400];
        const nextGoldMilestone = goldMilestoneKeys.find(m => !goldMilestones.has(m)) ?? null;
        const goldMilestonesToShow = goldMilestoneKeys.filter(m => goldMilestones.has(m) || m === nextGoldMilestone);
        goldMilestonesToShow.forEach(m => {
            const earned = goldMilestones.has(m);
            achievements.push({
                tier: 'gold', id: `city${m}`,
                name: goldMilestoneNames[m],
                desc: `Visit ${m} unique cities`,
                earned: earned,
                earnedDate: earned ? earnedDates[`city${m}`] : undefined,
                progress: Math.min(currentCities, m),
                total: m
            });
        });

        // Gold — Superpower Passport (requires visa for all 5: Italy/EU, China, USA, India, Russia)
        const BIG_FIVE_VISA = ['Italy', 'China', 'USA', 'India', 'Russia'];
        const bigFiveCount = BIG_FIVE_VISA.filter(c => visaAwarded[c]).length;
        achievements.push({
            tier: 'gold', id: 'bigfive',
            name: 'Superpower Passport',
            desc: 'Obtain visas for the World\'s Top 5 largest economies - China, EU, India, USA, Russia',
            earned: goldBigFive,
            earnedDate: earnedDates['bigfive'],
            progress: bigFiveCount,
            total: 5
        });

        // Gold — ASEAN Complete
        const aseanCount = [...ASEAN_COUNTRIES].filter(c => seenCountries.has(c)).length;
        achievements.push({
            tier: 'gold', id: 'asean',
            name: 'ASEAN Complete',
            desc: 'Visit all 11 ASEAN nations',
            earned: goldAsean,
            earnedDate: earnedDates['asean'],
            progress: aseanCount,
            total: 11
        });

        // Gold — Silk Road Scholar
        const silkRoadCount = [...SILK_ROAD_COUNTRIES].filter(c => seenCountries.has(c)).length;
        achievements.push({
            tier: 'gold', id: 'silkroad',
            name: 'Silk Road Scholar',
            desc: 'Visit all 7 "Stan" countries',
            earned: goldSilkRoad,
            earnedDate: earnedDates['silkroad'],
            progress: silkRoadCount,
            total: 7
        });

        // Gold — EU Complete
        const euCount = [...EU_COUNTRIES].filter(c => seenCountries.has(c)).length;
        achievements.push({
            tier: 'gold', id: 'euComplete',
            name: 'EU Complete',
            desc: 'Visit all 27 EU member states',
            earned: goldEU,
            earnedDate: earnedDates['euComplete'],
            progress: euCount,
            total: 27
        });

        // Gold — New World Explorer
        const hasMainNA = [...seenCountries].some(c => COUNTRY_TO_CONTINENT[c] === 'North America' && !CARIBBEAN_COUNTRIES.has(c));
        const hasSA = (continentCountries['South America']?.size ?? 0) > 0;
        const hasCarib = [...CARIBBEAN_COUNTRIES].some(c => seenCountries.has(c));
        const newWorldCount = (hasMainNA ? 1 : 0) + (hasSA ? 1 : 0) + (hasCarib ? 1 : 0);
        achievements.push({
            tier: 'gold', id: 'newworld',
            name: 'New World Explorer',
            desc: 'Visit North America (mainland), South America & the Caribbean',
            earned: goldNewWorld,
            earnedDate: earnedDates['newworld'],
            progress: newWorldCount,
            total: 3
        });

        // Gold — Jet Set Year
        achievements.push({
            tier: 'gold', id: 'jetsetyear',
            name: 'Jet Set Year',
            desc: 'Visit 3+ continents in the same calendar year',
            earned: goldJetSetYear,
            earnedDate: earnedDates['jetsetyear']
        });

        // Gold — Year-Round Traveller
        achievements.push({
            tier: 'gold', id: 'yearround',
            name: 'Year-Round Traveller',
            desc: 'Take trips in all 12 calendar months',
            earned: goldYearRound,
            earnedDate: earnedDates['yearround'],
            progress: monthsWithTrips.size,
            total: 12
        });

        // Silver — visa achievements
        Object.entries(VISA_COUNTRIES).forEach(([country, label]) => {
            achievements.push({
                tier: 'silver', id: `visa-${country}`,
                name: label,
                desc: `Visa obtained for ${country}`,
                earned: !!visaAwarded[country],
                earnedDate: earnedDates[`visa-${country}`]
            });
        });

        // Silver — World Power Tour
        const POWER_FIVE = ['France', 'China', 'USA', 'India', 'Russia'];
        const powerFiveCount = POWER_FIVE.filter(c => seenCountries.has(c)).length;
        achievements.push({
            tier: 'silver', id: 'powerfive',
            name: 'World Power Tour',
            desc: 'Visit the World\'s Top 5 largest economies - China, EU, India, USA, Russia',
            earned: silverBigFive,
            earnedDate: earnedDates['powerfive'],
            progress: powerFiveCount,
            total: 5
        });

        // Divider between visa achievements and continent silvers
        achievements.push({ tier: 'silver', id: 'divider-visa-continents', isDivider: true });

        const CONTINENT_NAMES = {
            'Asia':          'Dragon & Lotus',
            'Europe':        'Old World Wanderer',
            'Africa':        'Sahara to Savanna',
            'North America': 'New World Order',
            'South America': 'El Dorado Trail',
            'Oceania':       'Below the Southern Cross'
        };

        // Silver — one per continent
        ALL_CONTINENTS.forEach(cont => {
            const count = continentCountries[cont] ? continentCountries[cont].size : 0;
            achievements.push({
                tier: 'silver', id: `silver-${cont}`,
                name: CONTINENT_NAMES[cont] || `${cont} Explorer`,
                desc: `Visit 5 countries in ${cont}`,
                earned: !!silverAwarded[cont],
                earnedDate: earnedDates[`silver-${cont}`],
                progress: Math.min(count, 5),
                total: 5
            });
        });

        // Bronze — special locations first
        SPECIAL_BRONZE.forEach(sb => {
            achievements.push({
                tier: 'bronze', id: `special-${sb.id}`,
                name: sb.name,
                desc: sb.desc,
                earned: !!specialBronzeAwarded[sb.id],
                earnedDate: earnedDates[`special-${sb.id}`],
                isSpecial: true
            });
        });

        // Divider between special bronzes and country bronzes
        achievements.push({
            tier: 'bronze', id: 'divider-special-countries', isDivider: true
        });

        // Bronze — one per visited country + show unvisited from the continent map
        const allKnownCountries = Object.keys(COUNTRY_TO_CONTINENT).sort();
        // Visited first, then unvisited
        const visited = allKnownCountries.filter(c => seenCountries.has(c));
        const unvisited = allKnownCountries.filter(c => !seenCountries.has(c));

        visited.forEach(c => {
            achievements.push({
                tier: 'bronze', id: `country-${c}`,
                name: c,
                desc: COUNTRY_TO_CONTINENT[c] || '',
                earned: true,
                earnedDate: earnedDates[`country-${c}`],
                isCountry: true
            });
        });
        unvisited.forEach(c => {
            achievements.push({
                tier: 'bronze', id: `country-${c}`,
                name: c,
                desc: COUNTRY_TO_CONTINENT[c] || '',
                earned: false,
                isCountry: true
            });
        });

        return achievements;
    }

    // ── Render achievements panel (diffing — animates newly earned) ──
    function renderPanel() {
        const body = document.getElementById('achievements-body');
        const summary = document.getElementById('achievements-summary');
        const achs = getAllAchievements();
        const earnedCount = achs.filter(a => a.earned).length;
        const total = achs.length;
        summary.textContent = `${earnedCount} / ${total}`;

        const groups = [
            { tier: 'platinum', label: 'Platinum' },
            { tier: 'gold', label: 'Gold' },
            { tier: 'silver', label: 'Silver' },
            { tier: 'bronze', label: 'Bronze' }
        ];

        // Build current earned set to detect newly earned
        const currentEarnedIds = new Set(achs.filter(a => a.earned).map(a => a.id));
        const newlyEarned = new Set();
        currentEarnedIds.forEach(id => {
            if (!prevEarnedIds.has(id)) newlyEarned.add(id);
        });

        // World progress: countries visited vs total in the world
        const totalWorldCountries = Object.keys(COUNTRY_TO_CONTINENT).length;
        const visitedWorldCountries = seenCountries.size;
        const worldPct = totalWorldCountries > 0 ? Math.round((visitedWorldCountries / totalWorldCountries) * 1000) / 10 : 0;

        // Check if we need a full rebuild or can diff
        const existingRows = body.querySelectorAll('[data-ach-id]');
        const needsFullBuild = existingRows.length === 0;

        const worldProgressHtml = `<div class="world-progress" id="world-progress">
            <div class="world-progress-label">
                <span class="world-progress-title">World Explored</span>
                <span class="world-progress-count">${visitedWorldCountries} / ${totalWorldCountries}</span>
            </div>
            <div class="world-progress-bar">
                <div class="world-progress-fill" style="width:${worldPct}%"></div>
            </div>
            <div class="world-progress-pct">${worldPct}%</div>
        </div>`;

        if (needsFullBuild) {
            // First render — build everything
            let html = worldProgressHtml;
            groups.forEach(g => {
                const items = achs.filter(a => a.tier === g.tier);
                if (items.length === 0) return;
                const tierConf = TIERS[g.tier];
                const sectionEarned = items.filter(a => a.earned).length;

                html += `<div class="ach-section-header" data-section="${g.tier}">
                    <span>${trophySVG(tierConf.color, 18)}</span>
                    <span class="ach-section-label" style="color:${tierConf.color}">${g.label}</span>
                    <span class="ach-section-count">${sectionEarned} / ${items.length}</span>
                </div>`;
                html += buildRowsHtml(items, tierConf, newlyEarned);
            });
            body.innerHTML = html;
        } else {
            // Diff update — live-update world progress bar
            const wp = body.querySelector('#world-progress');
            if (wp) {
                wp.querySelector('.world-progress-count').textContent = `${visitedWorldCountries} / ${totalWorldCountries}`;
                wp.querySelector('.world-progress-fill').style.width = worldPct + '%';
                wp.querySelector('.world-progress-pct').textContent = worldPct + '%';
            }
            // Diff update — only touch changed rows
            groups.forEach(g => {
                const items = achs.filter(a => a.tier === g.tier);
                const tierConf = TIERS[g.tier];
                const sectionEarned = items.filter(a => a.earned).length;

                // Update section count
                const header = body.querySelector(`[data-section="${g.tier}"] .ach-section-count`);
                if (header) header.textContent = `${sectionEarned} / ${items.length}`;

                items.forEach(a => {
                    const row = body.querySelector(`[data-ach-id="${a.id}"]`);
                    if (!row) return;

                    const wasUnearned = row.classList.contains('unearned');
                    const justEarned = a.earned && wasUnearned;

                    if (justEarned) {
                        // Animate: glow in and move to earned section
                        const tierColor = tierConf.color;
                        row.style.setProperty('--glow-color', tierColor + '55');
                        row.style.setProperty('--glow-bg', tierConf.bg);

                        row.classList.remove('unearned');
                        row.classList.add('earned', 'just-earned');

                        // Update inner content to earned state
                        const nameEl = row.querySelector('.ach-name');
                        if (nameEl) nameEl.style.color = tierColor;
                        const iconEl = row.querySelector('.ach-trophy-icon');
                        if (iconEl && !a.isCountry) iconEl.innerHTML = achIcon(a.id, tierColor, 20);
                        const badge = row.querySelector('.ach-badge');
                        if (badge) {
                            const col = document.createElement('div');
                            col.className = 'ach-earned-col';
                            const newBadge = document.createElement('span');
                            newBadge.className = 'ach-badge earned-badge';
                            newBadge.textContent = 'Earned';
                            col.appendChild(newBadge);
                            const dateStr = earnedDates[a.id];
                            if (dateStr) {
                                const dateEl = document.createElement('span');
                                dateEl.className = 'ach-date';
                                dateEl.textContent = formatTrophyDate(dateStr);
                                col.appendChild(dateEl);
                            }
                            badge.parentNode.replaceChild(col, badge);
                        }
                        // Remove progress bar
                        const prog = row.querySelector('.ach-progress');
                        if (prog) prog.remove();

                        // Move row: find the earned section boundary for this tier
                        // (insert before the first unearned row of the same tier)
                        const sectionHeader = body.querySelector(`[data-section="${a.tier}"]`);
                        if (sectionHeader) {
                            let insertBefore = null;
                            // Start search after the appropriate divider so rows never
                            // get re-inserted above the special/visa sections
                            let searchFrom = sectionHeader;
                            if (a.isCountry) {
                                const divider = body.querySelector('[data-ach-id="divider-special-countries"]');
                                if (divider) searchFrom = divider;
                            } else if (a.tier === 'silver' && a.id.startsWith('silver-')) {
                                const divider = body.querySelector('[data-ach-id="divider-visa-continents"]');
                                if (divider) searchFrom = divider;
                            }
                            let sibling = searchFrom.nextElementSibling;
                            while (sibling && sibling.dataset.achTier === a.tier) {
                                if (sibling.classList.contains('unearned')) {
                                    insertBefore = sibling;
                                    break;
                                }
                                sibling = sibling.nextElementSibling;
                            }
                            if (insertBefore && insertBefore !== row) {
                                sectionHeader.parentNode.insertBefore(row, insertBefore);
                            }
                        }

                        // Remove glow class after animation
                        setTimeout(() => { row.classList.remove('just-earned'); }, 2000);
                    } else if (!a.earned) {
                        // Update progress bar if present
                        const fill = row.querySelector('.ach-progress-fill');
                        if (fill && a.progress !== undefined && a.total) {
                            const pct = Math.round((a.progress / a.total) * 100);
                            fill.style.width = pct + '%';
                        }
                    }
                });
            });
        }

        prevEarnedIds = currentEarnedIds;
    }

    function formatTrophyDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function buildRowsHtml(items, tierConf, newlyEarned) {
        let html = '';
        items.forEach(a => {
            if (a.isDivider) {
                html += `<div class="ach-divider" data-ach-id="${a.id}" data-ach-tier="${a.tier}"></div>`;
                return;
            }
            const earnedClass = a.earned ? 'earned' : 'unearned';
            const isNew = newlyEarned.has(a.id);
            const glowClass = isNew ? ' just-earned' : '';
            const glowStyle = isNew ? `--glow-color:${tierConf.color}55;--glow-bg:${tierConf.bg};` : '';
            const dateLabel = a.earned && a.earnedDate ? formatTrophyDate(a.earnedDate) : '';
            const badgeHtml = a.earned
                ? `<div class="ach-earned-col"><span class="ach-badge earned-badge">Earned</span>${dateLabel ? `<span class="ach-date">${dateLabel}</span>` : ''}</div>`
                : '<span class="ach-badge locked-badge">Locked</span>';

            let progressHtml = '';
            if (a.progress !== undefined && a.total && !a.earned) {
                const pct = Math.round((a.progress / a.total) * 100);
                progressHtml = `<div class="ach-progress"><div class="ach-progress-fill" style="width:${pct}%;background:${tierConf.color}"></div></div>`;
            }

            const iconColor = a.earned ? tierConf.color : '#444';
            const iconHtml = a.isCountry
                ? flagImg(a.name, 20) || trophySVG(iconColor, 20)
                : achIcon(a.id, iconColor, 20);

            html += `<div class="ach-row ${earnedClass}${glowClass}" data-ach-id="${a.id}" data-ach-tier="${a.tier}" style="${glowStyle}">
                <div class="ach-trophy-icon" style="background:${tierConf.bg}">
                    ${iconHtml}
                </div>
                <div class="ach-info">
                    <div class="ach-name" style="color:${a.earned ? tierConf.color : '#666'}">${a.name}</div>
                    <div class="ach-desc">${a.desc}</div>
                </div>
                ${progressHtml}
                ${badgeHtml}
            </div>`;
        });
        // Remove initial glow after animation
        if (newlyEarned.size > 0) {
            setTimeout(() => {
                document.querySelectorAll('.ach-row.just-earned').forEach(el => el.classList.remove('just-earned'));
            }, 2000);
        }
        return html;
    }

    // ── Panel open/close ──
    function openPanel() {
        renderPanel();
        overlay.style.display = 'flex';
        // Force reflow then add class for transition
        overlay.offsetHeight;
        overlay.classList.add('open');
        panelOpen = true;
    }

    function closePanel() {
        overlay.classList.remove('open');
        panelOpen = false;
        setTimeout(() => {
            overlay.style.display = 'none';
            document.getElementById('achievements-body').innerHTML = '';
        }, 300);
    }

    function togglePanel() {
        if (panelOpen) closePanel();
        else openPanel();
    }

    // Close on overlay background click
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closePanel();
    });
    // Close button
    document.getElementById('achievements-close').addEventListener('click', closePanel);
    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panelOpen) closePanel();
    });

    // ── Visa achievements (silver) — triggered just before bronze when first visiting the country ──
    // ── Special bronze achievements — landmark/location trophies ──
    const SPECIAL_BRONZE = [
        // ── Europe ──
        {
            id: 'versailles',
            name: 'Treaty of Versailles',
            desc: 'Visit Versailles Palace',
            match: city => (city.name || '').trim().toLowerCase() === 'versailles'
        },
        {
            id: 'rovaniemi',
            name: 'Chasing the Aurora',
            desc: 'Visit the Hometown of Santa Claus',
            match: city => (city.name || '').trim().toLowerCase() === 'rovaniemi'
        },
        {
            id: 'athos',
            name: 'Diamonitirion',
            desc: 'Set foot on Mount Athos',
            match: city => (city.name || '').trim().toLowerCase() === 'daphni'
        },
        // ── Asia ──
        {
            id: 'amritsar',
            name: 'Golden Temple',
            desc: 'Visit the Golden Temple in Amritsar',
            match: city => (city.name || '').trim().toLowerCase() === 'amritsar'
        },
        {
            id: 'baikonur',
            name: 'We Have Liftoff',
            desc: 'Visit the Baikonur Cosmodrome, the Birthplace of the Space Age',
            match: city => (city.name || '').trim().toLowerCase() === 'baikonur'
        },
        {
            id: 'ulaanbaatar',
            name: 'Eternal Blue Sky',
            desc: "Visit Ulaanbaatar, the Home of Genghis Khan's Legacy",
            match: city => (city.name || '').trim().toLowerCase() === 'ulaanbaatar'
        },
        {
            id: 'mandalay',
            name: 'Last of the Burmese Kings',
            desc: 'Visit the Last Royal Capital of Myanmar',
            match: city => (city.name || '').trim().toLowerCase() === 'mandalay'
        },
        {
            id: 'xian',
            name: 'Terracotta Army',
            desc: "Visit the Terracotta Warriors",
            match: city => ["xi'an", 'xian'].includes((city.name || '').trim().toLowerCase())
        },
        {
            id: 'beijing',
            name: 'Dragon Throne',
            desc: 'Visit the Forbidden City',
            match: city => (city.name || '').trim().toLowerCase() === 'beijing'
        },
        {
            id: 'agra',
            name: 'Eternal Love',
            desc: 'Visit the Taj Mahal',
            match: city => (city.name || '').trim().toLowerCase() === 'agra'
        },
        // ── Middle East ──
        {
            id: 'petra',
            name: 'Rose-Red City',
            desc: 'Visit Petra',
            match: city => (city.name || '').trim().toLowerCase() === 'petra'
        },
        {
            id: 'jerusalem',
            name: 'City of Three Faiths',
            desc: 'Visit Jerusalem\'s Old City',
            match: city => (city.name || '').trim().toLowerCase() === 'jerusalem'
        },
        // ── Africa ──
        {
            id: 'sahara',
            name: 'Into the Great Void',
            desc: 'Visit the Sahara Desert',
            match: city => (city.name || '').trim().toLowerCase() === 'tamanrasset'
        },
        {
            id: 'luxor',
            name: 'Cradle of Civilisation',
            desc: 'Visit Valley of the Kings',
            match: city => (city.name || '').trim().toLowerCase() === 'luxor'
        },
        // ── North America ──
        {
            id: 'nyc',
            name: 'Financial Capital of the World',
            desc: 'Visit New York City',
            match: city => (city.name || '').trim().toLowerCase() === 'new york'
        },
        {
            id: 'nola',
            name: 'Birthplace of Jazz',
            desc: 'Visit New Orleans',
            match: city => (city.name || '').trim().toLowerCase() === 'new orleans'
        },
        // ── South America ──
        {
            id: 'cusco',
            name: 'Navel of the World',
            desc: 'Visit Machu Picchu',
            match: city => ['cusco', 'cuzco'].includes((city.name || '').trim().toLowerCase())
        },
        {
            id: 'uyuni',
            name: 'Mirror of the Sky',
            desc: 'Visit the Bolivia Salt Flats',
            match: city => (city.name || '').trim().toLowerCase() === 'uyuni'
        }
    ];

    const VISA_COUNTRIES = {
        'Algeria':      'Desert Rose',
        'USA':          'Empire State of Mind',
        'China':        'Middle Kingdom',
        'Israel':       'TAN DEX TUAN',
        'Turkey':       'Istanbul, Not Constantinople',
        'Italy':        'Dove Vai?',
        'Russia':       'Matryoshka',
        'North Korea':  'Kim Says Hi',
        'India':        'No, I Want The Sticker',
        'Turkmenistan': 'Gates of Hell'
    };
    // Countries in VISA_COUNTRIES that require an explicit visa sticker/stamp
    // and should NOT be auto-awarded simply by visiting the country
    const VISA_MANUAL = new Set(['China']);
    // Countries whose visa trophy should only auto-award from a specific date
    const VISA_AFTER_DATE = { 'Turkey': new Date('2024-02-08') };
    let visaAwarded = {}; // country → true

    // ── Gold achievement country sets ──
    const ASEAN_COUNTRIES = new Set(['Brunei', 'Cambodia', 'Indonesia', 'Laos', 'Malaysia', 'Myanmar', 'Philippines', 'Singapore', 'Thailand', 'Timor-Leste', 'Vietnam']);
    const SILK_ROAD_COUNTRIES = new Set(['Kazakhstan', 'Uzbekistan', 'Kyrgyzstan', 'Tajikistan', 'Turkmenistan', 'Pakistan', 'Afghanistan']);
    const EU_COUNTRIES = new Set(['Austria', 'Belgium', 'Bulgaria', 'Croatia', 'Cyprus', 'Czech Republic', 'Denmark', 'Estonia', 'Finland', 'France', 'Germany', 'Greece', 'Hungary', 'Ireland', 'Italy', 'Latvia', 'Lithuania', 'Luxembourg', 'Malta', 'Netherlands', 'Poland', 'Portugal', 'Romania', 'Slovakia', 'Slovenia', 'Spain', 'Sweden']);
    const CARIBBEAN_COUNTRIES = new Set(['Cuba', 'Jamaica', 'Haiti', 'Dominican Republic', 'Trinidad and Tobago', 'Bahamas', 'Barbados', 'Grenada', 'Dominica', 'Saint Kitts and Nevis', 'Saint Lucia', 'Saint Vincent and the Grenadines', 'Antigua and Barbuda', 'Bermuda', 'Cayman Islands', 'Turks and Caicos Islands', 'British Virgin Islands', 'Anguilla', 'Montserrat']);

    // ── Trophy overrides: city name → trophy country (for territories shown as parent country in city list) ──
    const CITY_TROPHY_OVERRIDE = {
        'hong kong': 'Hong Kong SAR',
        'macau': 'Macau SAR',
        'gibraltar': 'Gibraltar'
    };

    // ── Core check — called for every city arrival ──
    function checkCity(city) {
        if (!city || !city.country) return;
        let country = city.country.trim();
        if (!country || country === 'Unknown') return;
        // Check if this specific city should earn a different trophy country
        const cityNameLower = (city.name || '').trim().toLowerCase();
        const override = CITY_TROPHY_OVERRIDE[cityNameLower];
        if (override) country = override;

        // Track unique cities
        const cityName = (city.name || '').trim().toLowerCase();
        const cityKey = `${cityName}-${country}`;
        uniqueCities.add(cityKey);

        // Track visit frequency, travel months and continents per year
        cityVisitCounts[cityKey] = (cityVisitCounts[cityKey] || 0) + 1;
        if (city.flightDate) {
            const _d = new Date(city.flightDate);
            monthsWithTrips.add(_d.getMonth());
            const _vc = COUNTRY_TO_CONTINENT[country] || null;
            if (_vc) {
                const _yr = _d.getFullYear();
                if (!continentsPerYear[_yr]) continentsPerYear[_yr] = new Set();
                continentsPerYear[_yr].add(_vc);
            }
        }

        // Track first trip date
        if (city.flightDate && !firstTripDate) {
            firstTripDate = new Date(city.flightDate);
        }

        // Bronze: new country
        if (!seenCountries.has(country)) {
            seenCountries.add(country);
            const continent = COUNTRY_TO_CONTINENT[country] || null;
            if (continent) {
                if (!continentCountries[continent]) continentCountries[continent] = new Set();
                continentCountries[continent].add(country);
                seenContinents.add(continent);
            }

            earnedDates[`country-${country}`] = city.flightDate || null;
            queue('bronze', country, `Country #${seenCountries.size}`);

            // Silver: World Power Tour
            if (!silverBigFive) {
                const POWER_FIVE = ['France', 'China', 'USA', 'India', 'Russia'];
                if (POWER_FIVE.every(c => seenCountries.has(c))) {
                    silverBigFive = true;
                    earnedDates['powerfive'] = city.flightDate || null;
                    queue('silver', 'World Power Tour', 'Visited the 5 largest economies', 'powerfive');
                }
            }

            // Gold: Superpower Passport (visa required for all 5 incl. China)
            if (!goldBigFive) {
                const BIG_FIVE_VISA = ['Italy', 'China', 'USA', 'India', 'Russia'];
                if (BIG_FIVE_VISA.every(c => visaAwarded[c])) {
                    goldBigFive = true;
                    earnedDates['bigfive'] = city.flightDate || null;
                    queue('gold', 'Superpower Passport', 'Visas for the 5 largest economies', 'bigfive');
                }
            }

            // Silver: 5 countries in one continent
            if (continent && continentCountries[continent].size === 5 && !silverAwarded[continent]) {
                silverAwarded[continent] = true;
                earnedDates[`silver-${continent}`] = city.flightDate || null;
                const CONTINENT_NAMES = {
                    'Asia':          'Dragon & Lotus',
                    'Europe':        'Old World Wanderer',
                    'Africa':        'Sahara to Savanna',
                    'North America': 'New World Order',
                    'South America': 'El Dorado Trail',
                    'Oceania':       'Below the Southern Cross'
                };
                const contName = CONTINENT_NAMES[continent] || `${continent} Explorer`;
                queue('silver', contName, `5 countries in ${continent}`, `silver-${continent}`);
            }

            // Gold: ASEAN Complete
            if (!goldAsean && ASEAN_COUNTRIES.has(country) && [...ASEAN_COUNTRIES].every(c => seenCountries.has(c))) {
                goldAsean = true;
                earnedDates['asean'] = city.flightDate || null;
                queue('gold', 'ASEAN Complete', 'All 11 ASEAN nations visited', 'asean');
            }

            // Gold: Silk Road Scholar
            if (!goldSilkRoad && SILK_ROAD_COUNTRIES.has(country) && [...SILK_ROAD_COUNTRIES].every(c => seenCountries.has(c))) {
                goldSilkRoad = true;
                earnedDates['silkroad'] = city.flightDate || null;
                queue('gold', 'Silk Road Scholar', 'All 7 Stan countries visited', 'silkroad');
            }

            // Gold: EU Complete
            if (!goldEU && EU_COUNTRIES.has(country) && [...EU_COUNTRIES].every(c => seenCountries.has(c))) {
                goldEU = true;
                earnedDates['euComplete'] = city.flightDate || null;
                queue('gold', 'EU Complete', 'All 27 EU member states visited', 'euComplete');
            }

            // Gold: New World Explorer
            if (!goldNewWorld) {
                const hasMainNA = [...seenCountries].some(c => COUNTRY_TO_CONTINENT[c] === 'North America' && !CARIBBEAN_COUNTRIES.has(c));
                const hasSA = (continentCountries['South America']?.size ?? 0) > 0;
                const hasCarib = [...CARIBBEAN_COUNTRIES].some(c => seenCountries.has(c));
                if (hasMainNA && hasSA && hasCarib) {
                    goldNewWorld = true;
                    earnedDates['newworld'] = city.flightDate || null;
                    queue('gold', 'New World Explorer', 'North, South America & Caribbean visited', 'newworld');
                }
            }
        }

        // Silver visa — runs on every visit so date-gated visas (e.g. Turkey) trigger on later flights
        const _visaAfter = VISA_AFTER_DATE[country];
        if (VISA_COUNTRIES[country] && !visaAwarded[country] && !VISA_MANUAL.has(country) && (!_visaAfter || (city.flightDate && new Date(city.flightDate) >= _visaAfter))) {
            visaAwarded[country] = true;
            earnedDates[`visa-${country}`] = city.flightDate || null;
            queue('silver', VISA_COUNTRIES[country], `Visa obtained for ${country}`, `visa-${country}`);

            // Gold: Superpower Passport (visa required for all 5 incl. China)
            if (!goldBigFive) {
                const BIG_FIVE_VISA = ['Italy', 'China', 'USA', 'India', 'Russia'];
                if (BIG_FIVE_VISA.every(c => visaAwarded[c])) {
                    goldBigFive = true;
                    earnedDates['bigfive'] = city.flightDate || null;
                    queue('gold', 'Superpower Passport', 'Visas for the 5 largest economies', 'bigfive');
                }
            }
        }

        // Special bronze: landmark trophies
        SPECIAL_BRONZE.forEach(sb => {
            if (!specialBronzeAwarded[sb.id] && sb.match(city)) {
                specialBronzeAwarded[sb.id] = true;
                earnedDates[`special-${sb.id}`] = city.flightDate || null;
                queue('bronze', sb.name, sb.desc, `special-${sb.id}`);
            }
        });

        // Gold: Jet Set Year
        if (!goldJetSetYear && city.flightDate) {
            const _jetYr = new Date(city.flightDate).getFullYear();
            if (continentsPerYear[_jetYr] && continentsPerYear[_jetYr].size >= 3) {
                goldJetSetYear = true;
                earnedDates['jetsetyear'] = city.flightDate || null;
                queue('gold', 'Jet Set Year', `3+ continents in ${_jetYr}`, 'jetsetyear');
            }
        }

        // Gold: Year-Round Traveller
        if (!goldYearRound && monthsWithTrips.size === 12) {
            goldYearRound = true;
            earnedDates['yearround'] = city.flightDate || null;
            queue('gold', 'Year-Round Traveller', 'Travelled in all 12 calendar months', 'yearround');
        }

        // Platinum: Always Home
        if (!goldFrequentFlyer && cityVisitCounts[cityKey] >= 100) {
            goldFrequentFlyer = true;
            earnedDates['frequentflyer'] = city.flightDate || null;
            queue('platinum', 'Always Home', `${city.name || 'A city'} visited 100+ times`, 'frequentflyer');
        }

        // City milestones: gold 100-400, platinum 500
        const cityCount = uniqueCities.size;
        if (cityCount >= 100 && cityCount % 100 === 0 && !goldMilestones.has(cityCount)) {
            goldMilestones.add(cityCount);
            earnedDates[`city${cityCount}`] = city.flightDate || null;
            if (cityCount === 500) {
                queue('platinum', 'Globe Trotter', '500 cities visited', 'city500');
            } else {
                const names = { 100: 'Centurion', 200: 'World Walker', 300: 'Wayfarer', 400: 'Pathfinder' };
                const name = names[cityCount] || `${cityCount} Cities`;
                queue('gold', name, `${cityCount} cities visited`, `city${cityCount}`);
            }
        }

        // Platinum: circumnavigation
        if (seenContinents.size === ALL_CONTINENTS.size && !platinumCircumnavigation) {
            let allPresent = true;
            ALL_CONTINENTS.forEach(c => { if (!seenContinents.has(c)) allPresent = false; });
            if (allPresent) {
                platinumCircumnavigation = true;
                earnedDates['circum'] = city.flightDate || null;
                queue('platinum', 'Circumnavigation', 'Visited all 6 continents', 'circum');
            }
        }

        // Platinum: 10-year anniversary
        if (firstTripDate && city.flightDate && !platinum10Year) {
            const currentDate = new Date(city.flightDate);
            const tenYearsLater = new Date(firstTripDate);
            tenYearsLater.setFullYear(tenYearsLater.getFullYear() + 10);
            if (currentDate >= tenYearsLater) {
                platinum10Year = true;
                earnedDates['10year'] = city.flightDate || null;
                queue('platinum', 'Decade of Travel', `10 years since ${firstTripDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`, '10year');
            }
        }

        // Live-update panel if open
        if (panelOpen) renderPanel();
    }

    // ── Reset (animation restart) ──
    function reset() {
        seenCountries.clear();
        Object.keys(continentCountries).forEach(k => delete continentCountries[k]);
        seenContinents.clear();
        uniqueCities = new Set();
        firstTripDate = null;
        trophyQueue = [];
        isShowing = false;
        silverAwarded = {};
        visaAwarded = {};
        specialBronzeAwarded = {};
        earnedDates = {};
        platinumCircumnavigation = false;
        platinum10Year = false;
        goldMilestones = new Set();
        goldBigFive = false;
        silverBigFive = false;
        goldAsean = false;
        goldSilkRoad = false;
        goldJetSetYear = false;
        goldYearRound = false;
        goldFrequentFlyer = false;
        goldNewWorld = false;
        goldEU = false;
        Object.keys(continentsPerYear).forEach(k => delete continentsPerYear[k]);
        monthsWithTrips.clear();
        cityVisitCounts = {};
        prevEarnedIds = new Set();
        container.innerHTML = '';
    }

    // ── Sync to position (scrubbing — no popups) ──
    function syncTo(cities) {
        reset();
        if (!cities) return;
        cities.forEach(city => {
            if (!city) return;
            let country = city.country ? city.country.trim() : '';
            const cNameLower = (city.name || '').trim().toLowerCase();
            if (CITY_TROPHY_OVERRIDE[cNameLower]) country = CITY_TROPHY_OVERRIDE[cNameLower];
            if (country && country !== 'Unknown') {
                const isNewCountry = !seenCountries.has(country);
                seenCountries.add(country);
                if (isNewCountry) earnedDates[`country-${country}`] = city.flightDate || null;
                const continent = COUNTRY_TO_CONTINENT[country] || null;
                if (continent) {
                    if (!continentCountries[continent]) continentCountries[continent] = new Set();
                    continentCountries[continent].add(country);
                    seenContinents.add(continent);
                    if (!silverAwarded[continent] && continentCountries[continent].size >= 5) {
                        silverAwarded[continent] = true;
                        earnedDates[`silver-${continent}`] = city.flightDate || null;
                    }
                    if (!platinumCircumnavigation && seenContinents.size === ALL_CONTINENTS.size) {
                        let allPresent = true;
                        ALL_CONTINENTS.forEach(c => { if (!seenContinents.has(c)) allPresent = false; });
                        if (allPresent) {
                            platinumCircumnavigation = true;
                            earnedDates['circum'] = city.flightDate || null;
                        }
                    }
                }
                const _vaD = VISA_AFTER_DATE[country];
                if (VISA_COUNTRIES[country] && !visaAwarded[country] && !VISA_MANUAL.has(country) && (!_vaD || (city.flightDate && new Date(city.flightDate) >= _vaD))) {
                    visaAwarded[country] = true;
                    earnedDates[`visa-${country}`] = city.flightDate || null;
                }
                // Track continents per year and months for new Gold trophies
                if (city.flightDate && continent) {
                    const _yr = new Date(city.flightDate).getFullYear();
                    if (!continentsPerYear[_yr]) continentsPerYear[_yr] = new Set();
                    continentsPerYear[_yr].add(continent);
                }
                if (city.flightDate) monthsWithTrips.add(new Date(city.flightDate).getMonth());
                if (isNewCountry) {
                    if (!goldAsean && ASEAN_COUNTRIES.has(country) && [...ASEAN_COUNTRIES].every(c => seenCountries.has(c))) {
                        goldAsean = true; earnedDates['asean'] = city.flightDate || null;
                    }
                    if (!goldSilkRoad && SILK_ROAD_COUNTRIES.has(country) && [...SILK_ROAD_COUNTRIES].every(c => seenCountries.has(c))) {
                        goldSilkRoad = true; earnedDates['silkroad'] = city.flightDate || null;
                    }
                    if (!goldNewWorld) {
                        const _hasMainNA = [...seenCountries].some(c => COUNTRY_TO_CONTINENT[c] === 'North America' && !CARIBBEAN_COUNTRIES.has(c));
                        const _hasSA = (continentCountries['South America']?.size ?? 0) > 0;
                        const _hasCarib = [...CARIBBEAN_COUNTRIES].some(c => seenCountries.has(c));
                        if (_hasMainNA && _hasSA && _hasCarib) { goldNewWorld = true; earnedDates['newworld'] = city.flightDate || null; }
                    }
                    if (!goldEU && EU_COUNTRIES.has(country) && [...EU_COUNTRIES].every(c => seenCountries.has(c))) {
                        goldEU = true; earnedDates['euComplete'] = city.flightDate || null;
                    }
                }
            }
            const cityName = (city.name || '').trim().toLowerCase();
            if (country && country !== 'Unknown') {
                const _ck = `${cityName}-${country}`;
                uniqueCities.add(_ck);
                cityVisitCounts[_ck] = (cityVisitCounts[_ck] || 0) + 1;
            }
            if (city.flightDate && !firstTripDate) firstTripDate = new Date(city.flightDate);
            // Track gold milestones
            const newCitySize = uniqueCities.size;
            if (newCitySize >= 100 && newCitySize % 100 === 0 && !goldMilestones.has(newCitySize)) {
                goldMilestones.add(newCitySize);
                earnedDates[`city${newCitySize}`] = city.flightDate || null;
            }
            // Track bigfive (visa required for all 5 incl. China)
            if (!goldBigFive) {
                const BIG_FIVE_VISA = ['Italy', 'China', 'USA', 'India', 'Russia'];
                if (BIG_FIVE_VISA.every(c => visaAwarded[c])) {
                    goldBigFive = true;
                    earnedDates['bigfive'] = city.flightDate || null;
                }
            }
            // Track powerfive
            if (!silverBigFive) {
                const POWER_FIVE = ['France', 'China', 'USA', 'India', 'Russia'];
                if (POWER_FIVE.every(c => seenCountries.has(c))) {
                    silverBigFive = true;
                    earnedDates['powerfive'] = city.flightDate || null;
                }
            }
            // Sync special bronzes
            SPECIAL_BRONZE.forEach(sb => {
                if (!specialBronzeAwarded[sb.id] && sb.match(city)) {
                    specialBronzeAwarded[sb.id] = true;
                    earnedDates[`special-${sb.id}`] = city.flightDate || null;
                }
            });
            // 10-year anniversary
            if (firstTripDate && city.flightDate && !platinum10Year) {
                const currentDate = new Date(city.flightDate);
                const tenYearsLater = new Date(firstTripDate);
                tenYearsLater.setFullYear(tenYearsLater.getFullYear() + 10);
                if (currentDate >= tenYearsLater) {
                    platinum10Year = true;
                    earnedDates['10year'] = city.flightDate || null;
                }
            }
            // Gold: Jet Set Year
            if (!goldJetSetYear && city.flightDate) {
                const _jetYr = new Date(city.flightDate).getFullYear();
                if (continentsPerYear[_jetYr] && continentsPerYear[_jetYr].size >= 3) {
                    goldJetSetYear = true; earnedDates['jetsetyear'] = city.flightDate || null;
                }
            }
            // Gold: Year-Round Traveller
            if (!goldYearRound && monthsWithTrips.size === 12) {
                goldYearRound = true; earnedDates['yearround'] = city.flightDate || null;
            }
            // Platinum: Frequent Flyer
            if (!goldFrequentFlyer && cityName && country) {
                const _fck = `${cityName}-${country}`;
                if (cityVisitCounts[_fck] >= 100) {
                    goldFrequentFlyer = true; earnedDates['frequentflyer'] = city.flightDate || null;
                }
            }
        });
    }

    window.countryTrophy = { checkCity, reset, syncTo, togglePanel };
})();
