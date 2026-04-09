(function () {
    'use strict';

    var mapDiv = document.getElementById('map');
    if (!mapDiv) return;

    // Overlay sits directly on top of the Leaflet map only
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;overflow:hidden;clip-path:inset(0);pointer-events:none;z-index:600;';
    mapDiv.style.position = 'relative';
    mapDiv.appendChild(overlay);

    // City-specific comment pools — meme / skit / dialogue style
    var COMMENTS = {

        'Moscow': [
            'metro stations nicer than my apartment'
        ],

        'Pyongyang': [
            'guide: you cannot photograph that.<br>me: *lowers camera*<br>guide: or that',
        ],


        'Wuhan': [
            'officer: what were you doing in turkey?'
        ],

        'Shenzhen': [
            'from fishing village to this in 40 years??',
        ],
        'Foshan': [
            'ip man\'s hometown, had to',
            'wing chun energy'
        ],

        'Daegu': [
            'the chicken capital apparently'
        ],

        'Jeju': [
            'korea\'s hawaii but make it volcanic'
        ],


        'Da Nang': [
            'dragon bridge breathes actual fire??',
        ],
        'Hoi An': [
            'banh mi capital of the world, fight me'
        ],
        'Hue': [
            'imperial city giving forbidden city vibes',
            'bun bo hue is criminally underrated'
        ],
        'Ho Chi Minh City': [
            'crossing the street here is an act of faith',
        ],

        'Milan': [
            'aperitivo o\'clock',
        ],
        'Rome': [
            'when in rome... eat carbonara',
        ],
        'Vatican City': [
            'swiss guards dripping in those uniforms though'
        ],
        'Venice': [
            'gondola ride? in this economy?',
        ],
        'Florence': [
            'bistecca fiorentina, medium rare, no debate'
        ],
        'Naples': [
            'pizza was invented here, show some respect',
        ],
        'Pompeii': [
            'frozen in time, literally',
        ],
        'Amalfi': [
            'bus driver on these cliffs is the bravest person alive'
        ],
        'Catania': [
            'arancini the size of my fist'
        ],
        'Verona': [
            'juliet\'s balcony was kinda mid ngl'
        ],
        'Turin': [
            'fiat factory + chocolate + shroud',
        ],
        'Modena': [
            'balsamic vinegar that costs more than rent',
        ],
        'San Marino': [
            'passport stamp collector\'s dream'
        ],
        'Trieste': [
            'italy but make it slovenian',
        ],


        'Tel Aviv': [
            'shabbat elevator experience unlocked'
        ],
        'Jerusalem': [
            'three religions one city zero chill',
        ],
        'Ramallah': [
            'checkpoint experience was something',
            'best knafeh of my life though'
        ],

        'Amman': [
            'mansaf with the lads',
        ],
        'Petra': [
            'indiana jones was RIGHT',
        ],

        'Cairo': [
            'pyramids literally next to a pizza hut',
        ],
        'Giza': [
            'sphinx is smaller than i thought ngl',
        ],
        'Alexandria': [
            'old library is gone but the new one is cool'
        ],
        'Luxor': [
            'pharaohs really said go big or go home',
        ],

        'Beirut': [
            'officer: you been to israel?<br>me: what\'s that?<br>*stamps*',
        ],

        'Tripoli': [
            'not that tripoli',
        ],

        'Kuwait City': [
            'officer: you go israel?<br>me: what\'s that<br>officer: we check your passport<br>me: nice' ,
        ],

        'Istanbul': [
            'hagia sophia switching religions every century',
        ],
        'Ankara': [
            'everyone says skip ankara but...I study here',
        ],
 

        'Gori': [
            'yes THAT gori, stalin\'s hometown',
        ],

        'Yerevan': [
            'officer: why go azerbaijan? you got friends there?',
            'lavash bread is an art form',
        ],
        'Stepanakert': [
            'this city doesn\'t exist anymore...',
        ],

        'Baku': [
            'flame towers at night, burn burn burn',
        ],

        'Munich': [
            'marienplatz glockenspiel: *does its thing*',
            'tourists: *cheers*'
        ],


        'Frankfurt': [
            'that fried noodles look like french fries leh',
        ],

        'Brussels': [
            'manneken pis is... small',
        ],


        'Versailles': [
            'marie antoinette was living LARGE',
        ],

        'Monaco': [
            'a parking lot for yachts',
        ],


        'Geneva': [
            'UN headquarters and overpriced fondue',
        ],
        'Basel': [
            'three countries in one city, kind of'
        ],

        'Vienna': [
            'schnitzel larger than the plate',
            'schönbrunn palace: habsburgs went hard'
        ],
        'Innsbruck': [
            'alps in your FACE',
            'golden roof is... small but GOLDEN'
        ],

        'Prague': [
            'trdelník is a tourist trap and i fell for it'
        ],
        'Pilsen': [
            'the OG beer'
        ],

        'Warsaw': [
            'milk bars: communism but make it lunch'
        ],
        'Krakow': [
            'auschwitz checked, nanjing next',
        ],
        'Kyiv': [
            'chicken kyiv in kyiv, meta achieved'
        ],

        'Skopje': [
            'alexander the great but we don\'t call him that here'
        ],

        'Sarajevo': [
            'where WW1 started, that corner',
        ],

        'Stockholm': [
            'fika is a human right'
        ],

        'Barcelona': [
            'sagrada familia is still not finished lmao',
        ],

        'Gibraltar': [
            'uk? spain? the monkeys don\'t care',
        ],

        'Porto': [
            'francesinha is a heart attack sandwich and i\'m here for it'
        ],

        'Tunis': [
            'brik à l\'oeuf, don\'t sleep on it'
        ],

        'Rabat': [
            'hassan tower unfinished for 800 years, relatable. looking at you milan'
        ],

        'Marrakesh': [
            'tagine #5 of the day and still going'
        ],

        'Tamanrasset': [
            'tuareg tea ceremony hits different',
        ],

        'New York': [
            'central park is the only peace in manhattan'
        ],
        'Philadelphia': [
            'philly cheesesteak: pat\'s or geno\'s?',
        ],
        'Boston': [
            'harvard pretending i go here'
        ],
        'Chicago': [
            'the bean: touched it',
        ],
        'Milwaukee': [
            'beer capital of america?',
        ],
        'New Orleans': [
            'gumbo and jambalaya and i\'m reborn'
        ],
        'Las Vegas': [
            'buffet culture is peak america',
        ],
        'Los Angeles': [
            'hollywood sign smaller than expected'
        ],

        'Atlantic City': [
            'boardwalk empire but make it depressing',
            'it\'s like vegas but sad'
        ],
        'Niagara': [
            'the falls are WET (who knew)',
        ],

        'Mexico City': [
            'sinking city but the food makes up for it'
        ],

        'Uyuni': [
            'walked on the sky',
        ],
        'Puno': [
            'ti-ti,ca-ca??',
        ],
        'Cusco': [
            'pisco sour capital'
        ],

        'Lima': [
            'ceviche capital of the universe',
        ],

        'Agra': [
            'shah jahan really said go big or go home'
        ],

        'Singapore': [
            'ma I\'m home!',
            'hawker food > michelin',
        ],

        'Penang': [
            'char kway teow capital of the world',
        ],

        'Hong Kong': [
            'diu lei lo mou',
        ],

        'Ulaanbaatar': [
            'genghis khan\'s unmatched kdr',
        ],

        'Darvaza': [
            '🔥 since 1971',
        ],

    };

    // Colour palette — soft neon tones for readability on dark map
    // var colours = [
    //     '#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
    //     '#FFEAA7', '#DFE6E9', '#FD79A8', '#A29BFE', '#55E6C1',
    //     '#F8A5C2', '#63CDDA', '#CF6A87', '#786FA6', '#F19066',
    //     '#FFFFFF', '#E0E0E0'
    // ];
    var colours = ['#FFFFFF'];

    function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

    // Track recently shown messages to prevent duplicates across barrages
    var recentMessages = [];

    // Pick a subset of comments for this city arrival (no duplicates)
    function getComments(city) {
        var pool = COMMENTS[city.name];
        if (!pool) return [];
        // Filter out recently shown
        var available = pool.filter(function (m) { return recentMessages.indexOf(m) === -1; });
        if (!available.length) available = pool.slice();
        var shuffled = available.sort(function () { return Math.random() - 0.5; });
        var count = Math.min(3 + Math.floor(Math.random() * 3), shuffled.length);
        var picked = shuffled.slice(0, count);
        recentMessages = recentMessages.concat(picked).slice(-20);
        // Prepend translated city name if different from English
        var tc = window.translateCity ? window.translateCity(city.name) : city.name;
        if (tc && tc !== city.name) picked.unshift(tc);
        return picked;
    }

    // Inject CSS keyframes once — GPU-accelerated via translate3d
    var style = document.createElement('style');
    style.textContent =
        '@keyframes danmaku-slide{' +
            'from{transform:translate3d(100%,0,0);opacity:0}' +
            '5%{opacity:0.85}' +
            '80%{opacity:0.85}' +
            'to{transform:translate3d(var(--dm-dist),0,0);opacity:0}' +
        '}' +
        '.dm-bullet{' +
            'position:absolute;pointer-events:none;' +
            'font-family:\"Segoe UI\",sans-serif;font-weight:400;will-change:transform,opacity;' +
            'text-shadow:1px 1px 3px rgba(0,0,0,0.9),0 0 6px rgba(0,0,0,0.5);' +
            'animation:danmaku-slide var(--dm-dur) linear forwards;' +
        '}';
    document.head.appendChild(style);

    // Launch a single danmaku bullet — supports <br> in text for line breaks
    function fireBullet(text, lane, totalLanes) {
        var el = document.createElement('span');
        el.className = 'dm-bullet';
        var hasBr = /<br>/i.test(text);
        var safe = text.replace(/</g, '&lt;').replace(/&lt;br>/gi, '<br>');
        el.innerHTML = hasBr ? safe : '\u201C' + safe + '\u201D';
        var fontSize = 14 + Math.floor(Math.random() * 8); // 14-21px
        var top = (lane / totalLanes) * 85 + 5; // 5%-90% of height
        var duration = 6 + Math.random() * 3.6; // 6-9.6s
        // Measure width after adding to DOM (hidden), then set dist
        el.style.cssText =
            'top:' + top + '%;right:0;font-size:' + fontSize + 'px;' +
            'color:' + pick(colours) + ';' +
            '--dm-dur:' + duration.toFixed(2) + 's;visibility:hidden;';
        overlay.appendChild(el);
        var dist = -(overlay.offsetWidth + el.offsetWidth + 40);
        el.style.setProperty('--dm-dist', dist + 'px');
        el.style.visibility = '';
        el.addEventListener('animationend', function () { el.remove(); });
    }

    // Fire a barrage for a city
    function fireBarrage(city) {
        var msgs = getComments(city);
        if (!msgs.length) return;
        var lanes = 7;
        var usedLanes = [];
        for (var i = 0; i < lanes; i++) usedLanes.push(i);
        for (var j = usedLanes.length - 1; j > 0; j--) {
            var k = Math.floor(Math.random() * (j + 1));
            var tmp = usedLanes[j]; usedLanes[j] = usedLanes[k]; usedLanes[k] = tmp;
        }
        msgs.forEach(function (msg, idx) {
            var delay = idx * (300 + Math.random() * 400);
            setTimeout(function () {
                fireBullet(msg, usedLanes[idx % lanes], lanes);
            }, delay);
        });
    }

    // Watch for city arrivals by polling currentCityIndex
    var firedForIndex = {};  // track which indices already fired

    function watch() {
        var fm = window.flightMap;
        if (!fm || !fm.cities || !fm.cities.length) {
            setTimeout(watch, 500);
            return;
        }

        var lastIndex = fm.currentCityIndex || 0;

        setInterval(function () {
            var idx = fm.currentCityIndex || 0;
            if (idx > lastIndex) {
                var cityIdx = idx - 1;
                // Only fire once per index
                if (!firedForIndex[cityIdx]) {
                    firedForIndex[cityIdx] = true;
                    var city = fm.cities[cityIdx];
                    if (city) fireBarrage(city);
                }
                lastIndex = idx;
            } else if (idx < lastIndex) {
                // Scrubbed backwards — clear fired history so replays work
                firedForIndex = {};
                lastIndex = idx;
            }
        }, 200);
    }

    watch();
})();
