class AnimatedFlightMap {
    constructor() {
        this.map = null;
        this.cities = [];
        this.currentCityIndex = 0;
        this.isAnimating = false;
        this._animationGen = 0; // generation counter — stale animation chains with old gen bail out
        this.animationSpeed = 2000; // milliseconds per flight
        this.speedMultiplier = 1; // 1x, 10x, or 20x speed
        this.flightDot = null;
        this.flightPath = null;
        this.visitedPaths = [];
        this.cityMarkers = [];
        this.routeInteractivePolylines = []; // invisible, interactive polylines for hover
        this._worldCopyLayers = []; // polyline/marker copies at ±360 for seamless panning
        this.continuousPath = null; // Current continuous polyline segment
        this.allPathCoordinates = []; // All coordinates for current continuous path segment
        this.continuousPathSegments = []; // Array of all continuous path segments (for disconnected journeys)
        this.totalDistance = 0; // Track total distance traveled
        this.totalTime = 0; // Track total travel time in hours
        this.totalCO2 = 0; // Track total CO2 emissions in kg
        this.totalCostSGD = 0; // Track total cost in SGD (base currency)
        
        // Scrubber properties
        this.isDragging = false;
        this.scrubberElement = null;
        this.progressBarElement = null;
        
        // Lines visibility control
        this.linesVisible = true;
        
        // Follow dot control
        this.followDot = true;
        
        // Current animation tracking for pause functionality
        this.currentAnimationPath = null;
        this.currentPathLines = null;
        this.pauseAfterCurrentFlight = false;
        
        // Increment display timeout
        this.incrementTimeout = null;
        
        // Initialize exchange rates with fallback values
        this.exchangeRates = {
            USD_TO_SGD: 1.27, // Fallback values
            SGD_TO_USD: 0.787, // Inverse of USD_TO_SGD
            USD_TO_EUR: 0.9,
            USD_TO_RMB: 7.2
        };
        
        // Loading + title elements
        this._mainTitle = document.querySelector('.main-title');
        this._headerH1 = document.querySelector('.header h1');
        this._headerSlogan = document.querySelector('.header-slogan');
        this._loadingDone = false;
        this._currentYear = null; // track for typewriter year changes

        this.legChart = null;
        this.priceChart = null; // separate chart for journey prices/inflation
        this._globalYBounds = {}; // populated by _updateYAxisBounds; read by afterDataLimits callbacks
        this.chartFilter = 'all';
        this._datasetEndDate = null;
        this._chartWindowSize = 40; // number of points visible in the sliding window when filter='all' (controls push effect)

        // Start typewriter as loading indicator, load data in parallel
        this._dataReady = false;
        this._typewriterDone = false;
        this._playTitleTypewriter();
        this.initializeMap();
        this.setupMiniMapObserver();
        this.loadFlightData();
        this.fetchExchangeRates();
        this.updateStatistics();
        this.initializeScrubber();
        this.initChart();

        // Re-translate dynamic controls when language changes
        window.addEventListener('langchange', () => {
            this.updatePlayPauseButton();
            this.updateToggleLinesButton();
            this.updateFollowDotButton();
            if (this.fastForwardButton) {
                const t = window.i18n ? window.i18n.t : function(k) { return k; };
                const key = 'speed' + this.speedMultiplier + 'x';
                this.fastForwardButton.title = t(key);
            }
            if (this._currentYear) this._typewriteYear(this._currentYear);
            this.updateStatistics();
            // Re-translate main title
            const t = window.i18n ? window.i18n.t : function(k) { return k; };
            if (this._mainTitle) {
                this._mainTitle.innerHTML = `<span class="title-text">${t('mainTitle1')}<br>${t('mainTitle2')}</span><span class="title-cursor fade-out"></span>`;
            }
            // Update chart dataset labels on language switch
            if (this.legChart) {
                this.legChart.data.datasets[0].label = t('sgdPerKm');
                this.legChart.data.datasets[1].label = t('co2PerSgd');
                this.legChart.update('none');
            }
            if (this.priceChart) {
                this.priceChart.data.datasets[0].label = t('nominal');
                this.priceChart.data.datasets[1].label = t('real2025');
                this.priceChart.update('none');
            }
        });
    }

    _playTitleTypewriter() {
        const el = this._mainTitle;
        if (!el) { this._typewriterDone = true; this._tryStart(); return; }

        const lines = ['IS THE WORLD', 'YOUR \u{1F9AA}?'];
        const fullText = lines.join('\n');
        let charIdx = 0;

        el.innerHTML = '<span class="title-text"></span><span class="title-cursor"></span>';
        const textEl = el.querySelector('.title-text');

        const typeInterval = setInterval(() => {
            if (charIdx >= fullText.length) {
                clearInterval(typeInterval);
                this._typewriterDone = true;
                this._tryStart();
                return;
            }
            charIdx++;
            textEl.innerHTML = fullText.substring(0, charIdx).split('\n').join('<br>');
        }, 70);
    }

    static _stripAccents(s) { return s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

    _onDataReady() {
        this._dataReady = true;
        this._tryStart();
    }

    _tryStart() {
        if (this._dataReady && this._typewriterDone) {
            this.startAnimation();
        }
    }

    _typewriteYear(year) {
        const h1 = this._headerH1;
        const slogan = this._headerSlogan;
        if (!h1) return;
        if (this._yearTypeTimer) clearInterval(this._yearTypeTimer);
        if (this._sloganTypeTimer) clearInterval(this._sloganTypeTimer);

        const yearStr = year.toString();
        const sloganStr = this.getYearSlogan(year) || '';

        h1.innerHTML = '<span class="title-cursor"></span>';
        if (slogan) slogan.textContent = '';
        let i = 0;
        this._yearTypeTimer = setInterval(() => {
            if (i >= yearStr.length) {
                clearInterval(this._yearTypeTimer);
                this._yearTypeTimer = null;
                h1.innerHTML = yearStr + '<span class="title-cursor fade-out"></span>';
                if (slogan && sloganStr) this._typewriteSlogan(sloganStr);
                this._startTickerTape(sloganStr);
                return;
            }
            i++;
            h1.innerHTML = yearStr.substring(0, i) + '<span class="title-cursor"></span>';
        }, 80);
    }

    _typewriteSlogan(text) {
        const slogan = this._headerSlogan;
        if (!slogan) return;
        if (this._sloganTypeTimer) clearInterval(this._sloganTypeTimer);

        slogan.innerHTML = '<span class="title-cursor"></span>';
        let i = 0;
        this._sloganTypeTimer = setInterval(() => {
            if (i >= text.length) {
                clearInterval(this._sloganTypeTimer);
                this._sloganTypeTimer = null;
                slogan.innerHTML = text + '<span class="title-cursor fade-out"></span>';
                return;
            }
            i++;
            slogan.innerHTML = text.substring(0, i) + '<span class="title-cursor"></span>';
        }, 40);
    }

    _computeTickerFacts() {
        const data = this.flightData || [];
        if (!data.length) return [];
        const facts = [];
        const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
        const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];

        // Parse all dates
        const dates = data.map(j => new Date(j.date)).filter(d => !isNaN(d)).sort((a, b) => a - b);

        // LONGEST GAP
        let maxGap = 0, gapStart = null, gapEnd = null;
        for (let i = 1; i < dates.length; i++) {
            const gap = (dates[i] - dates[i - 1]) / 86400000;
            if (gap > maxGap) { maxGap = Math.round(gap); gapStart = dates[i - 1]; gapEnd = dates[i]; }
        }
        const t = window.i18n ? window.i18n.t : (k => k);
        const Q = s => `<span class="tl">${s}</span>`;
        const A = s => `<span class="tv">${s}</span>`;
        const translateCity = window.translateCity || (n => n);
        const cityLabel = name => translateCity(name || '').toUpperCase() || (name || '').toUpperCase();
        const tMonths = t('months') || MONTHS;

        if (maxGap > 0 && gapStart) {
            facts.push(`${Q(t('tickerLongestGap'))} ${A(`${maxGap} ${t('tickerDays')} (${tMonths[gapStart.getMonth()]}–${tMonths[gapEnd.getMonth()]} ${gapEnd.getFullYear()})`)}`);
        }

        // AVERAGE GAP
        if (dates.length > 1) {
            const totalDays = (dates[dates.length - 1] - dates[0]) / 86400000;
            const avgGap = Math.round(totalDays / (dates.length - 1));
            facts.push(`${Q(t('tickerAvgGap'))} ${A(`${avgGap} ${t('tickerDays')}`)}`);
        }

        // MOST FLIGHTS IN A SINGLE DAY (exclude land journeys)
        const flightDates = data.filter(j => j.type !== 'land').map(j => new Date(j.date)).filter(d => !isNaN(d));
        const byDate = {};
        flightDates.forEach(d => { const k = d.toISOString().slice(0, 10); byDate[k] = (byDate[k] || 0) + 1; });
        const maxDay = Object.entries(byDate).sort((a, b) => b[1] - a[1])[0];
        if (maxDay && maxDay[1] > 1) {
            const d = new Date(maxDay[0]);
            facts.push(`${Q(t('tickerMostFlightsDay'))} ${A(`${maxDay[1]} (${d.getDate()} ${tMonths[d.getMonth()]} ${d.getFullYear()})`)}`);
        }

        // FAVOURITE TRAVEL MONTH (flights only)
        const byMonth = {};
        flightDates.forEach(d => { const m = d.getMonth(); byMonth[m] = (byMonth[m] || 0) + 1; });
        const favMonth = Object.entries(byMonth).sort((a, b) => b[1] - a[1])[0];
        if (favMonth) facts.push(`${Q(t('tickerFavMonth'))} ${A(`${tMonths[parseInt(favMonth[0])]} (${favMonth[1]} ${t('tickerFlights')})`)}`);

        // WEEKDAY vs WEEKEND
        let weekday = 0;
        dates.forEach(d => { const day = d.getDay(); if (day >= 1 && day <= 5) weekday++; });
        const pct = Math.round((weekday / dates.length) * 100);
        facts.push(`${Q(t('tickerWeekday'))} ${A(`${pct}%`)}`);

        // GEOGRAPHIC — needs city coords
        const coords = (this.cities || []).filter(c => c.lat && c.lng);
        if (coords.length) {
            const north = coords.reduce((a, b) => b.lat > a.lat ? b : a);
            const south = coords.reduce((a, b) => b.lat < a.lat ? b : a);
            facts.push(`${Q(t('tickerNorthernmost'))} ${A(`${cityLabel(north.name || '')} ${north.lat.toFixed(1)}°${north.lat >= 0 ? 'N' : 'S'}`)}`);
            facts.push(`${Q(t('tickerSouthernmost'))} ${A(`${cityLabel(south.name || '')} ${Math.abs(south.lat).toFixed(1)}°${south.lat >= 0 ? 'N' : 'S'}`)}`);

            let eqCross = 0;
            for (let i = 1; i < coords.length; i++) {
                if ((coords[i].lat >= 0) !== (coords[i - 1].lat >= 0)) eqCross++;
            }
            if (eqCross > 0) facts.push(`${Q(t('tickerEquator'))} ${A(eqCross)}`);

            let minDist = Infinity, pairA = '', pairB = '';
            for (let i = 0; i < coords.length; i++) {
                for (let j = i + 1; j < coords.length; j++) {
                    if (coords[i].name === coords[j].name) continue;
                    const d = this.calculateDistance(coords[i].lat, coords[i].lng, coords[j].lat, coords[j].lng);
                    if (d > 0 && d < minDist) { minDist = d; pairA = coords[i].name; pairB = coords[j].name; }
                }
            }
            if (minDist < Infinity) facts.push(`${Q(t('tickerClosestPair'))} ${A(`${cityLabel(pairA)}–${cityLabel(pairB)} ${Math.round(minDist)}KM`)}`);

            let maxLngJump = 0, tzFrom = '', tzTo = '';
            for (let i = 1; i < coords.length; i++) {
                const jump = Math.abs(coords[i].lng - coords[i - 1].lng);
                if (jump > maxLngJump) { maxLngJump = jump; tzFrom = coords[i - 1].name; tzTo = coords[i].name; }
            }
            if (maxLngJump > 0) {
                const hours = Math.round(maxLngJump / 15);
                facts.push(`${Q(t('tickerTimezone'))} ${A(`${hours}H (${cityLabel(tzFrom)}→${cityLabel(tzTo)})`)}`);
            }
        }

        return facts;
    }

    _startTickerTape() {
        let tape = document.querySelector('.header-ticker');
        if (!tape) {
            tape = document.createElement('div');
            tape.className = 'header-ticker';
            document.querySelector('.header').appendChild(tape);
            // Re-render ticker on language change
            window.addEventListener('langchange', () => {
                this._tickerFacts = null;
                this._startTickerTape();
            });
        }

        this._tickerFacts = this._computeTickerFacts();

        const text = '◈ ' + this._tickerFacts.join(' ◈ ') + ' ◈ ';
        // Duplicate so the second copy fills the gap when the first scrolls off
        tape.innerHTML = `<span class="ticker-text">${text}${text}</span>`;
        // Measure the width of one copy, animate by exactly that distance
        requestAnimationFrame(() => {
            const el = tape.querySelector('.ticker-text');
            if (!el) return;
            const halfW = el.scrollWidth / 2;
            const speed = 60; // px per second
            const duration = halfW / speed;
            el.style.animationDuration = duration + 's';
            tape.classList.add('visible');
        });
    }

    _spawnTickerTapeEmojis(year) {
        const YEAR_EMOJIS = {
            2017: ['✈️','🇸🇬','🌏','🛫','🗺️'],
            2018: ['🇲🇾','🌴','🏖️','✈️','🌊'],
            2019: ['🌍','🗺️','✈️','🏔️','🌄'],
            2020: ['😷','🏠','🌐','📦','🛋️'],
            2021: ['🇺🇸','🗽','🌎','🏜️','🎰'],
            2022: ['🕌','🏜️','🌙','🇯🇴','🇮🇱'],
            2023: ['🇪🇺','🏰','🗼','🍷','🎭'],
            2024: ['🌍','🌎','🌏','🛫','🦁'],
            2025: ['🌎','🗽','🏔️','🌵','🦅'],
            2026: ['🌏','🏯','🌴','🍜','🛵'],
        };
        const emojis = YEAR_EMOJIS[year] || ['✈️','🌍','🗺️','🛫','🌟'];
        const header = document.querySelector('.header');
        if (!header) return;
        const rect = header.getBoundingClientRect();

        for (let i = 0; i < 18; i++) {
            const el = document.createElement('span');
            el.className = 'ticker-tape-emoji';
            el.textContent = emojis[i % emojis.length];
            el.style.cssText = `
                left: ${rect.left + Math.random() * rect.width}px;
                top: ${rect.top}px;
                animation-delay: ${Math.random() * 0.6}s;
                animation-duration: ${1.2 + Math.random() * 0.8}s;
                font-size: ${14 + Math.floor(Math.random() * 10)}px;
            `;
            document.body.appendChild(el);
            el.addEventListener('animationend', () => el.remove());
        }
    }



    initializeMap() {
        // Define world bounds to prevent panning outside the map
        const worldBounds = [
            [-90, -Infinity], // Southwest corner
            [90, Infinity]    // Northeast corner
        ];

        // Initialize map with minimal styling
        this.map = L.map('map', {
            center: [20, 100],
            zoom: 1.45,
            minZoom: 1.45,
            maxZoom: 12,
            zoomControl: false,
            dragging: true,
            worldCopyJump: true,
            maxBounds: worldBounds,
            maxBoundsViscosity: 1.0 // Makes the bounds "sticky"
        });

        // Add simple continent outlines using a minimal tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '',
            subdomains: 'abcd',
            maxZoom: 12
        }).addTo(this.map);

        // Add zoom event listeners to control panning
        this.map.on('zoomend', () => {
            this.updatePanningState();
        });

        // Initial panning state setup
        this.updatePanningState();

        // Add custom reset view button
        this.addResetViewButton();

        // Create custom flight dot marker
        this.createFlightDot();

        // Clear transient route hovers/tooltips when clicking or tapping the map (mobile-friendly)
        this.map.on('click', () => {
            if (this.routeInteractivePolylines && this.routeInteractivePolylines.length) {
                this.routeInteractivePolylines.forEach(m => this._clearRouteHover(m));
            }
        });
        const _mapContainer = this.map && this.map.getContainer ? this.map.getContainer() : null;
        if (_mapContainer) {
            _mapContainer.addEventListener('touchstart', () => {
                if (this.routeInteractivePolylines && this.routeInteractivePolylines.length) {
                    this.routeInteractivePolylines.forEach(m => this._clearRouteHover(m));
                }
            }, { passive: true });
        }

        // Move tooltip & popup panes to <body> inside a .leaflet-container
        // wrapper so they keep inherited Leaflet styles but escape overflow:hidden.
        const _tp = this.map.getPane('tooltipPane');
        const _pp = this.map.getPane('popupPane');
        const _pw = document.createElement('div');
        _pw.className = 'leaflet-container';
        _pw.style.cssText = 'position:absolute;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none;z-index:9999;';
        document.body.appendChild(_pw);
        if (_tp) _pw.appendChild(_tp);
        if (_pp) _pw.appendChild(_pp);
        const _syncPanes = () => {
            const r = this.map.getContainer().getBoundingClientRect();
            const mp = this.map.getPane('mapPane');
            const tr = mp ? mp.style.transform : '';
            const mm = tr.match(/translate3d\(([^,]+),\s*([^,]+)/);
            const tx = mm ? parseFloat(mm[1]) : 0;
            const ty = mm ? parseFloat(mm[2]) : 0;
            const l = (r.left + window.scrollX + tx) + 'px';
            const t = (r.top  + window.scrollY + ty) + 'px';
            if (_tp) { _tp.style.left = l; _tp.style.top = t; _tp.style.zIndex = '9999'; }
            if (_pp) { _pp.style.left = l; _pp.style.top = t; _pp.style.zIndex = '9999'; }
        };
        _syncPanes();
        this.map.on('move zoom viewreset resize', _syncPanes);
        window.addEventListener('scroll', _syncPanes, { passive: true });
        window.addEventListener('resize', _syncPanes, { passive: true });
    }

    setupMiniMapObserver() {
        if (window.innerWidth > 768) return;

        const card = document.querySelector('.card-container');
        const spacer = document.querySelector('.card-spacer');
        if (!card || !spacer) return;

        let isMini = false;
        let transitioning = false;

        const handleScroll = () => {
            if (transitioning) return;
            const scrollY = window.scrollY || window.pageYOffset;
            // Measure card dimensions live so the spacer always matches
            const currentHeight = isMini ? parseFloat(spacer.style.height) || card.offsetHeight : card.offsetHeight;
            const threshold = currentHeight * 0.7;

            if (scrollY > threshold && !isMini) {
                transitioning = true;
                isMini = true;

                const liveHeight = card.offsetHeight;
                const liveWidth = card.offsetWidth;

                // Step 1: pin card at its current screen position as fixed
                const rect = card.getBoundingClientRect();
                spacer.style.display = 'block';
                spacer.style.height = liveHeight + 'px';
                card.classList.add('mini-map-fixed');
                card.style.top = rect.top + 'px';
                card.style.left = rect.left + 'px';
                card.style.width = liveWidth + 'px';
                card.style.height = liveHeight + 'px';

                // Step 2: next frame — transition to mini size
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        card.classList.add('mini-map');
                        card.style.top = '';
                        card.style.left = '';
                        card.style.width = '';
                        card.style.height = '';
                        setTimeout(() => {
                            this.map.invalidateSize();
                            transitioning = false;
                        }, 420);
                    });
                });
            } else if (scrollY <= threshold && isMini) {
                // Instant restore — no transition needed since user is scrolling back to it
                isMini = false;
                card.classList.remove('mini-map', 'mini-map-fixed');
                card.style.top = '';
                card.style.left = '';
                card.style.width = '';
                card.style.height = '';
                spacer.style.display = 'none';
                this.map.invalidateSize();
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        // Tap mini map to scroll back to top — use touch tracking to
        // ignore swipe/scroll gestures and only react to stationary taps.
        let touchStartY = null;
        let touchMoved = false;
        card.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchMoved = false;
        }, { passive: true });
        card.addEventListener('touchmove', (e) => {
            if (touchStartY !== null && Math.abs(e.touches[0].clientY - touchStartY) > 8) {
                touchMoved = true;
            }
        }, { passive: true });
        card.addEventListener('click', (e) => {
            if (card.classList.contains('mini-map') && !touchMoved) {
                e.stopPropagation();
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }

    updatePanningState() {
        if (!this.map.dragging.enabled()) {
            this.map.dragging.enable();
        }
    }

    async fetchExchangeRates() {
        try {
            // Using exchangerate-api.com which provides free tier
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            if (response.ok) {
                const data = await response.json();
                const usdToSgd = data.rates.SGD || 1.27;
                this.exchangeRates = {
                    USD_TO_SGD: usdToSgd,
                    SGD_TO_USD: 1 / usdToSgd,
                    USD_TO_EUR: data.rates.EUR || 0.9,
                    USD_TO_RMB: data.rates.CNY || 7.2
                };
                this.updateStatistics();
            }
        } catch (error) {
            // Use fallback exchange rates
        }
    }

    createFlightDot() {
        // Remove existing dot from map to prevent duplicates
        if (this.flightDot && this.map && this.map.hasLayer(this.flightDot)) {
            this.map.removeLayer(this.flightDot);
        }
        // Remove existing world-copy dots
        if (this._flightDotCopies) {
            this._flightDotCopies.forEach(d => { try { if (this.map && this.map.hasLayer(d)) this.map.removeLayer(d); } catch (e) {} });
        }

        const dotIcon = L.divIcon({
            className: 'flight-dot',
            html: '<div style="width: 16px; height: 16px; background: #FFD700; border-radius: 50%; border: 3px solid #FFF; box-shadow: 0 0 10px rgba(255, 215, 0, 0.8); animation: pulse 2s infinite;"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        // Add pulse animation style (only once)
        if (!document.getElementById('flight-dot-style')) {
            const style = document.createElement('style');
            style.id = 'flight-dot-style';
            style.textContent = `
                @keyframes pulse {
                    0% { transform: scale(1); opacity: 1; }
                    50% { transform: scale(1.3); opacity: 0.7; }
                    100% { transform: scale(1); opacity: 1; }
                }
                .flight-dot {
                    z-index: 1000;
                }
            `;
            document.head.appendChild(style);
        }

        this.flightDot = L.marker([0, 0], { icon: dotIcon });

        // Create ±360 copies for seamless panning
        this._flightDotCopies = [
            L.marker([0, -360], { icon: dotIcon, interactive: false }),
            L.marker([0, 360], { icon: dotIcon, interactive: false })
        ];
    }

    // Update flight dot and its ±360 copies to a new position
    _setFlightDotLatLng(latlng) {
        this.flightDot.setLatLng(latlng);
        if (this._flightDotCopies) {
            this._flightDotCopies[0].setLatLng([latlng[0], latlng[1] - 360]);
            this._flightDotCopies[1].setLatLng([latlng[0], latlng[1] + 360]);
        }
    }

    addResetViewButton() {
        // Create reset view control
        const ResetViewControl = L.Control.extend({
            onAdd: function(map) {
                const button = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                button.innerHTML = '↻';
                button.style.backgroundColor = '#333';
                button.style.color = '#fff';
                button.style.width = '30px';
                button.style.height = '30px';
                button.style.display = 'flex';
                button.style.alignItems = 'center';
                button.style.justifyContent = 'center';
                button.style.cursor = 'pointer';
                button.style.fontSize = '16px';
                button.title = window.i18n ? window.i18n.t('resetView') : 'Reset View';
                
                button.onclick = () => {
                    map.setView([20, 100], 1.45);
                    // Update panning state after reset
                    try { this.updatePanningState(); } catch (e) { /* defensive */ }
                };
                
                return button;
            }
        });
        
        // Create play/pause animation control
        const PlayPauseAnimationControl = L.Control.extend({
            onAdd: function(map) {
                const button = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                button.innerHTML = '⏸️'; // Start with pause since animation auto-starts
                button.style.backgroundColor = '#333';
                button.style.color = '#fff';
                button.style.width = '30px';
                button.style.height = '30px';
                button.style.display = 'flex';
                button.style.alignItems = 'center';
                button.style.justifyContent = 'center';
                button.style.cursor = 'pointer';
                button.style.fontSize = '14px';
                button.title = window.i18n ? window.i18n.t('pauseAnimation') : 'Pause Animation';
                button.style.marginTop = '2px';
                
                button.onclick = () => {
                    this.togglePlayPause();
                };
                
                this.playPauseButton = button;
                return button;
            }.bind(this)
        });
        
        // Create replay animation control
        const ReplayAnimationControl = L.Control.extend({
            onAdd: function(map) {
                const button = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                button.innerHTML = '▶️';
                button.style.backgroundColor = '#4CAF50';
                button.style.color = '#fff';
                button.style.width = '30px';
                button.style.height = '30px';
                button.style.display = 'none'; // Initially hidden
                button.style.alignItems = 'center';
                button.style.justifyContent = 'center';
                button.style.cursor = 'pointer';
                button.style.fontSize = '14px';
                button.title = window.i18n ? window.i18n.t('playAnimation') : 'Play Animation';
                button.style.marginTop = '2px';
                
                button.onclick = () => {
                    this.replayAnimation();
                };
                
                this.replayButton = button;
                return button;
            }.bind(this)
        });
        
        // Create fast forward control
        const FastForwardControl = L.Control.extend({
            onAdd: function(map) {
                const button = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                button.innerHTML = '⏩';
                button.style.backgroundColor = '#333';
                button.style.color = '#fff';
                button.style.width = '30px';
                button.style.height = '30px';
                button.style.display = 'flex';
                button.style.alignItems = 'center';
                button.style.justifyContent = 'center';
                button.style.cursor = 'pointer';
                button.style.fontSize = '14px';
                button.title = window.i18n ? window.i18n.t('speed1x') : 'Speed: 1x (click to cycle)';
                button.style.marginTop = '2px';
                
                button.onclick = () => {
                    this.cycleFastForward();
                };
                
                this.fastForwardButton = button;
                return button;
            }.bind(this)
        });
        
        // Create toggle lines visibility control
        const ToggleLinesControl = L.Control.extend({
            onAdd: function(map) {
                const button = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                button.innerHTML = '━';
                button.style.backgroundColor = '#333';
                button.style.color = '#fff';
                button.style.width = '30px';
                button.style.height = '30px';
                button.style.display = 'flex';
                button.style.alignItems = 'center';
                button.style.justifyContent = 'center';
                button.style.cursor = 'pointer';
                button.style.fontSize = '18px';
                button.style.fontWeight = 'bold';
                button.title = window.i18n ? window.i18n.t('hideFlightLines') : 'Hide Flight Lines';
                button.style.marginTop = '2px';
                
                button.onclick = () => {
                    this.toggleLinesVisibility();
                };
                
                this.toggleLinesButton = button;
                return button;
            }.bind(this)
        });
        
        // Create follow dot control
        const FollowDotControl = L.Control.extend({
            onAdd: function(map) {
                const button = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                button.innerHTML = '🎯';
                button.style.backgroundColor = '#333';
                button.style.color = '#fff';
                button.style.width = '30px';
                button.style.height = '30px';
                button.style.display = 'flex';
                button.style.alignItems = 'center';
                button.style.justifyContent = 'center';
                button.style.cursor = 'pointer';
                button.style.fontSize = '14px';
                button.title = window.i18n ? window.i18n.t('followDot') : 'Follow Flying Dot';
                button.style.marginTop = '2px';
                
                button.onclick = () => {
                    this.toggleFollowDot();
                };
                
                this.followDotButton = button;
                return button;
            }.bind(this)
        });
        
        new ResetViewControl({ position: 'topright' }).addTo(this.map);
        new PlayPauseAnimationControl({ position: 'topright' }).addTo(this.map);
        new FastForwardControl({ position: 'topright' }).addTo(this.map);
        new ReplayAnimationControl({ position: 'topright' }).addTo(this.map);
        new ToggleLinesControl({ position: 'topright' }).addTo(this.map);
        new FollowDotControl({ position: 'topright' }).addTo(this.map);

        // Achievements panel button
        const AchievementsControl = L.Control.extend({
            onAdd: function() {
                const button = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                button.innerHTML = '🏆';
                button.style.backgroundColor = '#333';
                button.style.color = '#fff';
                button.style.width = '30px';
                button.style.height = '30px';
                button.style.display = 'flex';
                button.style.alignItems = 'center';
                button.style.justifyContent = 'center';
                button.style.cursor = 'pointer';
                button.style.fontSize = '16px';
                button.title = window.i18n ? window.i18n.t('achievements') : 'Achievements';
                button.onclick = (e) => {
                    L.DomEvent.stopPropagation(e);
                    if (window.countryTrophy) window.countryTrophy.togglePanel();
                };
                return button;
            }
        });
        new AchievementsControl({ position: 'topright' }).addTo(this.map);
        
        // Set follow dot button to active state since it's enabled by default
        this.updateFollowDotButton();
    }



    async loadFlightData() {
        try {
            const flightDataManager = new FlightDataManager();
            const combinedData = await flightDataManager.loadData();

            if (combinedData && combinedData.length > 0) {
                this.updateHeaderYear(combinedData);
                const citySequence = this.convertFlightsToCities(combinedData);
                this.animateCityListPopulation(citySequence);

                citySequence.forEach((city, idx) => {
                    const enriched = {
                        ...city,
                        id: this.cities.length + 1 + idx,
                        visited: false,
                        order: this.cities.length + 1 + idx
                    };
                    this.cities.push(enriched);
                    this.createCityMarker(enriched);
                });
                this.updateCityList();

                if (this.cities.length > 0) {
                    const firstCity = this.cities[0];
                    try { this.map.setView([firstCity.lat, firstCity.lng], this.map.getZoom(), { animate: false }); } catch (e) {}
                    try { this.positionDotAtCity(0); } catch (e) {}
                    if (this.cityMarkers[0] && this.cityMarkers[0].marker && !this.map.hasLayer(this.cityMarkers[0].marker)) {
                        this.cityMarkers[0].marker.addTo(this.map);
                    }
                    this.updateCityMarkerStyle(0, 'current');
                    this.updateCurrentTripYear(0);
                    this.updateStatistics();
                    this._createRouteInteractivity();
                }

                this._onDataReady();

            } else {
                console.warn('No journey data loaded, using sample data');
                this.loadSampleCities();
                this._onDataReady();
            }
        } catch (error) {
            console.error('Error loading journey data:', error);
            console.warn('Falling back to sample data');
            this.loadSampleCities();
            this._onDataReady();
        }
    }
    
    getYearSlogan(year) {
        const t = window.i18n ? window.i18n.t : function(k) { return k; };
        const key = 'slogan' + year;
        const val = t(key);
        return val !== key ? val : '';
    }

    updateHeaderYear(journeys) {
        this.flightData = journeys;

        if (journeys.length > 0) {
            const firstJourneyDate = new Date(journeys[0].date || journeys[0].departureDate);
            const firstYear = firstJourneyDate.getFullYear();
            if (!isNaN(firstYear)) {
                // Set header with typewriter
                this._currentYear = firstYear;
                this._typewriteYear(firstYear);
                const yearOverlay = document.getElementById('yearOverlay');
                if (yearOverlay) yearOverlay.textContent = firstYear.toString();
            }
        }
    }

    updateCurrentTripYear(cityIndex) {
        const yearOverlay = document.getElementById('yearOverlay');

        if (this.cities && this.cities[cityIndex] && this.cities[cityIndex].flightDate) {
            const currentFlightDate = new Date(this.cities[cityIndex].flightDate);
            const currentYear = currentFlightDate.getFullYear();

            if (!isNaN(currentYear)) {
                if (yearOverlay) yearOverlay.textContent = currentYear.toString();
                // Typewrite only when year actually changes
                if (currentYear !== this._currentYear) {
                    this._currentYear = currentYear;
                    this._typewriteYear(currentYear);
                }
            }
        }
    }

    // Resolve an airport code or city name to a canonical city name.
    // e.g. "FCO" → "Rome", "Rome" → "Rome", "GYD" → "Baku"
    _resolveToCity(code) {
        if (!code) return code;
        if (!this.coordinateManager) this.coordinateManager = new FlightDataManager();
        return this.coordinateManager.airportToCityMap.get(code) || code;
    }

    convertFlightsToCities(journeys) {
        const citySequence = [];
        const addedCities = new Set();

        // Do NOT re-sort here — the data is already correctly ordered by loadData()
        // which uses _chainSameDayJourneys to handle same-day ordering.
        // Re-sorting would destroy that ordering because ISO dates ("2023-11-02")
        // and M/D/YYYY dates ("11/2/2023") parse to different UTC offsets.

        // Create a proper journey sequence that maintains chronological order
        this.flightSequence = []; // Store the actual journey sequence for date mapping (keeping name for compatibility)

        journeys.forEach((journey, index) => {
            // Treat all journeys the same way visually
            const fromLocation = journey.from || journey.origin;
            const toLocation = journey.to || journey.destination;
            const fromCode = journey.fromCode || journey.origin;
            const toCode = journey.toCode || journey.destination;

            // Resolve airport codes to canonical city names for consistent comparison
            const fromCityName = this._resolveToCity(fromCode);
            const toCityName = this._resolveToCity(toCode);

            // Add departure city only if it's the first journey OR if the previous journey's destination doesn't match this origin.
            // Compare using resolved city names so "FCO" matches "Rome" from a land journey.
            const previousCity = citySequence.length > 0 ? citySequence[citySequence.length - 1] : null;
            const needsOriginCity = citySequence.length === 0 || (previousCity && previousCity.locationCode !== fromCityName);

            if (needsOriginCity && fromCode) {
                const coords = this.getJourneyCoordinates(journey, 'from');
                if (coords) {
                    // Only mark as disconnected if this origin doesn't match the previous destination
                    const isActuallyDisconnected = previousCity && previousCity.locationCode !== fromCityName;

                    const city = {
                        name: this.extractLocationName(fromLocation, fromCode),
                        country: this.extractCountry(fromLocation),
                        lat: coords[0],
                        lng: coords[1],
                        airportCode: fromCode,
                        locationCode: fromCityName,
                        flightDate: journey.date,
                        flightIndex: this.flightSequence.length,
                        journeyType: 'flight', // Treat all as flights visually
                        isDisconnected: isActuallyDisconnected // Only mark as disconnected if there's a gap
                    };
                    citySequence.push(city);
                    addedCities.add(fromCode);
                    this.flightSequence.push(journey);
                }
            }

            // Always add arrival city (this represents the journey destination)
            if (toCode) {
                const coords = this.getJourneyCoordinates(journey, 'to');
                if (coords) {
                    const city = {
                        name: this.extractLocationName(toLocation, toCode),
                        country: this.extractCountry(toLocation),
                        lat: coords[0],
                        lng: coords[1],
                        airportCode: toCode,
                        locationCode: toCityName,
                        flightDate: journey.date,
                        flightIndex: this.flightSequence.length,
                        originalFlight: journey,
                        journeyType: 'flight' // Treat all as flights visually
                    };
                    citySequence.push(city);
                    this.flightSequence.push(journey);
                }
            }
        });

        // Collapse consecutive same-name cities (different airports in the same city)
        // into a single entry so no zero-distance legs appear in the animation or chart.
        const deduped = [];
        for (const city of citySequence) {
            if (deduped.length === 0 || deduped[deduped.length - 1].name !== city.name) {
                deduped.push(city);
            } else {
                // DEBUG: log skipped duplicate
                console.log('[DEDUP SKIP]', city.name, 'locationCode:', city.locationCode, 'hasOriginalFlight:', !!city.originalFlight);
            }
        }

        // DEBUG: log city sequence around Rome/Baku/Tbilisi area
        const bakuIdx = deduped.findIndex(c => c.name === 'Baku');
        if (bakuIdx >= 0) {
            const start = Math.max(0, bakuIdx - 2);
            const end = Math.min(deduped.length, bakuIdx + 4);
            console.log('[CITY SEQUENCE around Baku]', deduped.slice(start, end).map((c, i) => `${start + i}: ${c.name} (loc:${c.locationCode}, OF:${c.originalFlight ? c.originalFlight.type + '/' + (c.originalFlight.flightNumber || c.originalFlight.mode || '?') : 'NONE'})`));
        }

        return deduped;
    }

    getJourneyCoordinates(journey, direction) {
        // Try to get coordinates for any journey type
        let locationCode;
        
        if (direction === 'from') {
            locationCode = journey.fromCode || journey.origin;
        } else {
            locationCode = journey.toCode || journey.destination;
        }
        
        console.log(`Looking up coordinates for: ${locationCode} (direction: ${direction})`);
        
        // Try airport coordinates first, then city coordinates
        let coords = this.getAirportCoordinates(locationCode) || this.getCityCoordinates(locationCode);
        
        if (!coords) {
            console.warn(`No coordinates found for: ${locationCode}`);
            // Try to get from the journey object directly (for land journeys)
            if (journey.type === 'land') {
                if (direction === 'from' && journey.originCoords) {
                    coords = journey.originCoords;
                } else if (direction === 'to' && journey.destinationCoords) {
                    coords = journey.destinationCoords;
                }
            }
        }
        
        console.log(`Coordinates for ${locationCode}:`, coords);
        return coords;
    }
    
    getCityCoordinates(cityName) {
        // Use cached flight data manager if available, or create one
        if (!this.coordinateManager) {
            this.coordinateManager = new FlightDataManager();
        }
        return this.coordinateManager.cityCoords.get(cityName);
    }

    getAirportCoordinates(airportCode) {
        // Use cached flight data manager if available, or create one
        if (!this.coordinateManager) {
            this.coordinateManager = new FlightDataManager();
        }
        // Use the new method that maps airports to cities
        return this.coordinateManager.getAirportCoordinates(airportCode);
    }
    
    extractLocationName(locationString, locationCode) {
        // Handle both flight and land journey location names
        if (!locationString) {
            return locationCode;
        }

        // Prefer airport-to-city mapping when an airport code is present
        const airportCode = this.extractAirportCode(locationString);
        if (airportCode) {
            if (!this.coordinateManager) this.coordinateManager = new FlightDataManager();
            const mappedCity = this.coordinateManager.airportToCityMap.get(airportCode);
            if (mappedCity) {
                return mappedCity;
            }
        }
        
        // For flights, extract city name from "City Name / Airport Name (CODE/ICAO)" format
        if (locationString.includes(' / ')) {
            // If no airport mapping found, fall back to parsed city name
            let city = this.extractCityName(locationString);
            // Additional fallback for common case
            if (city === 'Keflavik') city = 'Reykjavik';
            return city;
        }
        
        // For land journeys, use the location string directly (it's just the city name)
        return locationString;
    }
    
    extractCityName(airportString) {
        // Extract city name from "City Name / Airport Name (CODE/ICAO)"
        const parts = airportString.split(' / ');
        let cityName = '';
        if (parts.length > 0) {
            cityName = parts[0].trim();
        } else {
            cityName = airportString;
        }
        
        // Map secondary airports to main city names
        if (cityName === 'Torp' || airportString.includes('Sandefjord')) {
            cityName = 'Oslo';
        }
        if (cityName === 'Beauvais' || airportString.includes('Beauvais')) {
            cityName = 'Paris';
        }
        if (cityName === 'Reyes Acozac' || airportString.includes('Reyes Acozac')) {
            cityName = 'Mexico City';
        }
        if (cityName === 'Fort Lauderdale' || airportString.includes('Fort Lauderdale')) {
            cityName = 'Miami';
        }
        if (cityName === 'Burbank' || airportString.includes('Burbank')) {
            cityName = 'Los Angeles';
        }
        if (cityName === 'Bahrain' || airportString.includes('BAH')) {
            cityName = 'Manama';
        }
        if (cityName === 'El ALto' || airportString.includes('LPB')) {
            cityName = 'La Paz';
        }
        if (cityName === 'Calcutta' || airportString.includes('Calcutta')) {
            cityName = 'Kolkata';
        }
        
        return cityName;
    }
    
    extractCountry(airportString) {
        // First try to extract airport code
        const airportCode = this.extractAirportCode(airportString);

        // If we have an airport code, use airport-to-country mapping
        if (airportCode) {
            const country = window.AIRPORT_TO_COUNTRY[airportCode];
            if (!country && airportCode) {
                console.warn(`Unknown airport code: ${airportCode} for ${airportString}`);
            }
            return country || 'Unknown';
        }

        // If no airport code, treat as city name and use city-to-country mapping
        const cityName = airportString.trim();
        const country = window.CITY_TO_COUNTRY[cityName];
        if (!country) {
            console.warn(`Unknown city: ${cityName}`);
        }
        return country || 'Unknown';
    }
    
    extractAirportCode(airportString) {
        // Extract airport code from "City Name / Airport Name (CODE/ICAO)" format
        const match = airportString.match(/\(([A-Z]{3})\/[A-Z]+\)/);
        return match ? match[1] : null;
    }
    
    loadSampleCities() {
        // Fallback sample cities
        const sampleCities = [
            { name: 'New York', country: 'USA', lat: 40.7128, lng: -74.0060 },
            { name: 'London', country: 'UK', lat: 51.5074, lng: -0.1278 },
            { name: 'Tokyo', country: 'Japan', lat: 35.6762, lng: 139.6503 },
            { name: 'Sydney', country: 'Australia', lat: -33.8688, lng: 151.2093 },
            { name: 'Dubai', country: 'UAE', lat: 25.2048, lng: 55.2708 },
            { name: 'Singapore', country: 'Singapore', lat: 1.3521, lng: 103.8198 }
        ];

        sampleCities.forEach(city => this.addCity(city));
        this.updateCityList();
    }

    addCity(cityData) {
        // Normalize city name for display (handle spelling variations)
        let displayName = cityData.name;
        const normalized = this.normalizeCityName(displayName);
        
        // Map normalized names back to preferred display names
        if (normalized === 'marrakesh') {
            displayName = 'Marrakesh';
        }
        
        const city = {
            id: this.cities.length + 1,
            name: displayName,
            country: cityData.country,
            lat: cityData.lat,
            lng: cityData.lng,
            visited: false,
            order: this.cities.length + 1,
            // Preserve all additional properties like flightDate, airportCode, etc.
            ...cityData,
            // Override with the computed values
            id: this.cities.length + 1,
            name: displayName,
            visited: false,
            order: this.cities.length + 1
        };

        console.log('=== ADDING CITY TO this.cities ===');
        console.log('Original cityData:', cityData);
        console.log('Final city object:', city);
        console.log('City flightDate preserved:', city.flightDate);

        this.cities.push(city);
        this.createCityMarker(city);
        // Debounce city list updates to avoid O(N^2) re-renders during bulk add
        if (this._cityListUpdateTimer) clearTimeout(this._cityListUpdateTimer);
        this._cityListUpdateTimer = setTimeout(() => {
            this.updateCityList();
            this._cityListUpdateTimer = null;
        }, 50);
    }

    createCityMarker(city) {
        // Use a larger invisible hit area (outerSize) while keeping the visible dot small.
        const outerSize = 28; // px - increases hover/click radius
        const visibleDotSize = 4; // px - visible dot remains small

        const markerIcon = L.divIcon({
            className: 'city-marker',
            html: `
                <div style="width: ${outerSize}px; height: ${outerSize}px; display:flex; align-items:center; justify-content:center; background:transparent;">
                    <div class="city-dot" style="width: ${visibleDotSize}px; height: ${visibleDotSize}px; background: #666; border-radius: 50%; transition: all 0.3s;"></div>
                </div>
            `,
            iconSize: [outerSize, outerSize],
            iconAnchor: [outerSize / 2, outerSize / 2]
        });

        const marker = L.marker([city.lat, city.lng], { icon: markerIcon });
        
        // Bind a tooltip that mirrors the city list layout: city (top), native name (middle) and country (below)
        const tooltipEl = document.createElement('div');
        tooltipEl.className = 'city-tooltip-inner';
        const ttName = document.createElement('div');
        ttName.className = 'city-name';
        ttName.textContent = window.translateCity ? window.translateCity(city.name || '') : (city.name || '');

        // Native / local-language name (loaded from `city-native-names.js` if present)
        const ttNative = document.createElement('div');
        ttNative.className = 'city-native';
        const nativeLookupKey = (city.name || '').trim();
        const _rawNative = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[nativeLookupKey] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(nativeLookupKey)])) || '';
        ttNative.textContent = (_rawNative && _rawNative.trim() !== (city.name || '').trim()) ? _rawNative : '';

        const ttCountry = document.createElement('div');
        ttCountry.className = 'city-country';
        ttCountry.textContent = window.translateCountry ? window.translateCountry(city.country || '') : (city.country || '');

        tooltipEl.appendChild(ttName);
        tooltipEl.appendChild(ttNative);
        tooltipEl.appendChild(ttCountry);

        marker.bindTooltip(tooltipEl, {
            permanent: false,
            direction: 'top',
            className: 'city-tooltip',
            offset: [0, -18],
            opacity: 0.98,
            sticky: false
        });

        // Explicit hover handlers — ensures tooltip always hides on mouseout and provides active state
        marker.on('mouseover', () => {
            try { marker.openTooltip(); } catch (e) {}
            const el = (marker.getElement && marker.getElement());
            if (el) el.classList.add('active');
        });
        marker.on('mouseout', () => {
            try { marker.closeTooltip(); } catch (e) {}
            const el = (marker.getElement && marker.getElement());
            if (el) el.classList.remove('active');
        });

        // Support mobile: open tooltip on tap so city markers behave consistently with route taps
        marker.on('click', (ev) => {
            try {
                marker.openTooltip();
                const el = (marker.getElement && marker.getElement());
                if (el) el.classList.add('active');
            } catch (err) { /* ignore */ }
        });

        marker.on('remove', () => { try { marker.closeTooltip(); } catch (e) {} });

        // Don't add to map initially - will be added when flight reaches city

        this.cityMarkers.push({ city: city, marker: marker });
    }

    updateCityMarkerStyle(cityIndex, status) {
        if (this.cityMarkers[cityIndex]) {
            const marker = this.cityMarkers[cityIndex].marker;
            let color, innerSize;
            const outerSize = 28; // keep a larger, consistent hit area

            switch (status) {
                case 'visited':
                    color = '#4CAF50';
                    innerSize = 4; // visible dot size
                    break;
                case 'current':
                    color = '#FFD700';
                    innerSize = 8;
                    break;
                default:
                    color = '#666';
                    innerSize = 4;
            }

            marker.setIcon(L.divIcon({
                className: 'city-marker',
                html: `
                    <div style="width: ${outerSize}px; height: ${outerSize}px; display:flex; align-items:center; justify-content:center; background:transparent;">
                        <div class="city-dot" style="width: ${innerSize}px; height: ${innerSize}px; background: ${color}; border-radius: 50%; transition: all 0.3s; box-shadow: 0 0 8px rgba(${color === '#FFD700' ? '255, 215, 0' : '76, 175, 80'}, 0.6);"></div>
                    </div>
                `,
                iconSize: [outerSize, outerSize],
                iconAnchor: [outerSize / 2, outerSize / 2]
            }));
        }
    }

    startAnimation() {
        if (this.cities.length === 0) {
            return;
        }

        this.isAnimating = true;
        this.updatePlayPauseButton(); // Update button state
        this.hideReplayButton(); // Hide replay button when starting

        if (this.currentCityIndex === 0) {
            // Start from first city
            this.positionDotAtCity(0);
            // Show first city marker
            if (this.cityMarkers[0]) {
                this.cityMarkers[0].marker.addTo(this.map);
            }
            
            // Set initial year from first city
            this.updateCurrentTripYear(0);
            
            this.updateCityMarkerStyle(0, 'current');
            this.updateCityList();
            this.updateStatistics();
            // Trophy notification for first city
            if (window.countryTrophy) window.countryTrophy.checkCity(this.cities[0]);
            this.currentCityIndex++;
        }

        this.animateToNextCity();
    }



    positionDotAtCity(cityIndex) {
        const city = this.cities[cityIndex];
        if (city) {
            this._setFlightDotLatLng([city.lat, city.lng]);
            if (!this.map.hasLayer(this.flightDot)) {
                this.map.addLayer(this.flightDot);
            }
            // Ensure ±360 copies are on the map
            if (this._flightDotCopies) {
                this._flightDotCopies.forEach(d => { if (!this.map.hasLayer(d)) d.addTo(this.map); });
            }
        }
    }

    animateToNextCity() {
        if (!this.isAnimating || this.currentCityIndex >= this.cities.length) {
            this.completeAnimation();
            return;
        }

        // Capture generation so stale chains from previous scrubs bail out
        const gen = this._animationGen;

        const fromCity = this.cities[this.currentCityIndex - 1];
        const toCity = this.cities[this.currentCityIndex];

        // Mark previous city as visited
        if (fromCity) {
            fromCity.visited = true;
            this.updateCityMarkerStyle(this.currentCityIndex - 1, 'visited');
        }

        this.updateCityList();

        // Ensure interactive hover targets exist for already-shown hops (including the current in-flight hop)
        // so users can hover routes while the animation is running.
        try { this._createRouteInteractivity(); } catch (err) { /* ignore */ }

        // Always create flight path for all cities (including disconnected ones)
        // This ensures continuous visual line throughout the journey
        this.animateFlightPath(fromCity, toCity, () => {
            // Stale chain — a scrub/jump started a new generation; abandon this callback
            if (gen !== this._animationGen) return;

            // Animation complete callback - show and mark destination city when arrived
            if (this.cityMarkers[this.currentCityIndex]) {
                this.cityMarkers[this.currentCityIndex].marker.addTo(this.map);
            }

            // Update current trip year in header
            this.updateCurrentTripYear(this.currentCityIndex);

            // Mark destination city as visited when flight arrives
            toCity.visited = true;
            this.updateCityMarkerStyle(this.currentCityIndex, 'current');
            // Trophy notification for new country
            if (window.countryTrophy) window.countryTrophy.checkCity(toCity);
            this.updateProgress();
            this.updateCityList();
            this.updateStatistics();
            this.currentCityIndex++;

            // Continue to next city after a brief pause
            setTimeout(() => {
                // Stale chain check again (scrub could happen during the 500ms pause)
                if (gen !== this._animationGen) return;

                // Check if we should pause after this flight completed
                if (this.checkForPendingPause()) {
                    return; // Stop here, animation is now paused
                }

                if (this.isAnimating) {
                    this.animateToNextCity();
                }
            }, 500);
        });
    }

    animateFlightPath(fromCity, toCity, callback) {
        // Capture generation so this entire flight animation dies if a scrub happens
        const gen = this._animationGen;

        // Create great circle path for all journeys (same visual treatment)
        // Unwrap date-line crossings so the path is continuous (no split)
        const rawPath = this.createGreatCirclePath([fromCity.lat, fromCity.lng], [toCity.lat, toCity.lng]);
        const isDateLineCrossing = Math.abs(toCity.lng - fromCity.lng) > 180;
        const path = isDateLineCrossing ? this._unwrapPathLongitudes(rawPath) : rawPath;
        const journey = toCity.originalFlight;

        // Calculate distance for timing (rough distance in degrees)
        const distance = Math.sqrt(
            Math.pow(toCity.lat - fromCity.lat, 2) + 
            Math.pow(toCity.lng - fromCity.lng, 2)
        );
        
        // Calculate and add to total distance (approximate km)
        const distanceKm = this.calculateDistance(fromCity.lat, fromCity.lng, toCity.lat, toCity.lng);
        this.totalDistance += distanceKm;
        
        // Use journey-specific calculations
        const journeyData = toCity.originalFlight;
        
        // Calculate time based on journey type
        let timeHours;
        if (journeyData && journeyData.type === 'land' && journeyData.duration) {
            // Use calculated land journey duration
            timeHours = journeyData.duration;
            console.log(`Using calculated land journey duration: ${timeHours.toFixed(2)} hours (${journeyData.durationFormatted})`);
        } else {
            // Default flight speed calculation
            timeHours = distanceKm / 900;
        }
        
        const co2EmissionKg = this.calculateEmissions(distanceKm, journeyData); // Use new emission calculation
        
        // Use actual cost from CSV only (no estimates)
        let costSGD = 0;
        if (journeyData && journeyData.costSGD && journeyData.costSGD > 0) {
            costSGD = journeyData.costSGD;
            console.log(`Using actual cost from CSV: ${costSGD.toFixed(2)} SGD`);
        } else {
            console.log(`No cost data in CSV, using 0 SGD`);
        }
        
        this.totalTime += timeHours;
        this.totalCO2 += co2EmissionKg;
        this.totalCostSGD += costSGD;
        
        // Show increment box - pass journey type for proper display
        const isLandJourney = journeyData && journeyData.type === 'land';
        this.showIncrement(distanceKm, timeHours, co2EmissionKg, costSGD, isLandJourney);

        // Store per-leg chart data and update chart
        // When cost is unknown (0), use null for all metrics so the chart bridges the gap
        const _costPerKm = (costSGD > 0 && distanceKm > 0) ? costSGD / distanceKm : null;
        const _co2PerSGD = costSGD > 0 ? (co2EmissionKg / costSGD) * 1000 : null;
        const _legDate = toCity.originalFlight ? toCity.originalFlight.date : null;
        const _cost = costSGD > 0 ? costSGD : null;
        toCity.legChartData = { costPerKm: _costPerKm, co2PerSGD: _co2PerSGD, date: _legDate, cost: _cost };
        const _legYear = _legDate ? new Date(_legDate).getFullYear().toString() : '';
        const _tripName = `${fromCity.name} → ${toCity.name}`;
        this.addChartPoint(_legYear, _costPerKm, _co2PerSGD, _legDate, _tripName, _cost);
        
        // Faster animation - reduced timing (min 500ms, max 2000ms)
        // Apply speed multiplier
        const baseAnimationDuration = Math.max(500, Math.min(2000, distance * 100));
        const animationDuration = baseAnimationDuration / this.speedMultiplier;

        // Initialize continuous path if it doesn't exist
        if (!this.continuousPath) {
            this.continuousPath = L.polyline([], {
                color: '#4CAF50',
                weight: 1,
                opacity: 0.6
            });
            
            if (this.linesVisible) {
                this.continuousPath.addTo(this.map);
            }
            this.allPathCoordinates = [];
        }

        // Path is already unwrapped (continuous) so always a single segment
        const pathLines = [{ points: path }];
        
        // Store references for pause functionality
        this.currentAnimationPath = path;
        this.currentPathLines = pathLines;

        // Easing function (ease-in-out)
        const easeInOut = (t) => {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        };

        // Use requestAnimationFrame for smoother animation
        let startTime = performance.now();

        const animate = (currentTime) => {
            // If a scrub/jump started a new generation, this animation is stale — die
            if (gen !== this._animationGen) {
                this.currentAnimationPath = null;
                this.currentPathLines = null;
                return;
            }

            // Hover freeze — skip frame without completing; track pause duration
            if (this._hoverFrozen) {
                if (!this._hoverFreezeStart) this._hoverFreezeStart = currentTime;
                requestAnimationFrame(animate);
                return;
            }
            // Adjust start time for time spent frozen so animation resumes smoothly
            if (this._hoverFreezeStart) {
                startTime += (currentTime - this._hoverFreezeStart);
                this._hoverFreezeStart = null;
            }

            if (!this.isAnimating) {
                // Paused mid-flight — freeze the dot and path exactly where they are.
                // Record when we paused so resume can offset startTime.
                const pausedAt = performance.now();
                this._pausedAnimateState = {
                    resume: () => {
                        // Shift startTime forward by the pause duration so progress picks up where it left off
                        startTime += (performance.now() - pausedAt);
                        requestAnimationFrame(animate);
                    },
                    gen
                };
                this.currentAnimationPath = null;
                this.currentPathLines = null;
                return;
            }

            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            const easedProgress = easeInOut(progress);

            // Calculate current step based on eased progress
            const currentStep = Math.floor(easedProgress * (path.length - 1));

            if (progress >= 1) {
                // Final gen check before completing — scrub could have happened during this frame
                if (gen !== this._animationGen) {
                    this.currentAnimationPath = null;
                    this.currentPathLines = null;
                    return;
                }
                // Animation complete - add full segment to continuous path
                this._setFlightDotLatLng(path[path.length - 1]);

                if (isDateLineCrossing) {
                    // Finalize current path segment if it has points
                    if (this.allPathCoordinates.length > 0 && this.continuousPath) {
                        this.continuousPath.setLatLngs(this.allPathCoordinates);
                        this.continuousPathSegments.push(this.continuousPath);
                    }

                    // Create single continuous polyline for the unwrapped crossing path
                    const segmentPolyline = L.polyline(path, {
                        color: '#4CAF50',
                        weight: 1,
                        opacity: 0.6
                    });

                    if (this.linesVisible) {
                        segmentPolyline.addTo(this.map);
                        this._addPolylineWorldCopies(path, { color: '#4CAF50', weight: 1, opacity: 0.6 });
                    }

                    this.continuousPathSegments.push(segmentPolyline);

                    // Start fresh with the destination's original coordinates
                    this.allPathCoordinates = [[toCity.lat, toCity.lng]];

                    // Create new continuous path for next segments
                    this.continuousPath = L.polyline(this.allPathCoordinates, {
                        color: '#4CAF50',
                        weight: 1,
                        opacity: 0.6
                    });

                    if (this.linesVisible) {
                        this.continuousPath.addTo(this.map);
                    }
                } else {
                    // Normal path - add points to continuous path
                    // Avoid duplicating the first point if it matches the last point already in the path
                    let pointsToAdd = path;
                    if (this.allPathCoordinates.length > 0) {
                        const lastCoord = this.allPathCoordinates[this.allPathCoordinates.length - 1];
                        const firstNewCoord = path[0];
                        // Check if coordinates are the same (within tolerance)
                        if (Math.abs(lastCoord[0] - firstNewCoord[0]) < 0.0001 && 
                            Math.abs(lastCoord[1] - firstNewCoord[1]) < 0.0001) {
                            pointsToAdd = path.slice(1); // Skip first point to avoid duplicate
                        }
                    }

                    this.allPathCoordinates.push(...pointsToAdd);
                    if (this.continuousPath && this.linesVisible) {
                        this.continuousPath.setLatLngs(this.allPathCoordinates);
                    }
                }

                // Clear current animation references
                this.currentAnimationPath = null;
                this.currentPathLines = null;

                callback();
                return;
            }

            // Update dot position with eased timing
            if (currentStep < path.length) {
                this._setFlightDotLatLng(path[currentStep]);

                // Follow the dot if enabled
                if (this.followDot) {
                    this.panToVisible(path[currentStep], false);
                }

                // Update continuous path progressively
                const currentSegment = path.slice(0, currentStep + 1);
                const updatedPath = [...this.allPathCoordinates, ...currentSegment];
                if (this.continuousPath && this.linesVisible) {
                    this.continuousPath.setLatLngs(updatedPath);
                }
            }

            // Track animation frame for cleanup
            const frameId = requestAnimationFrame(animate);
            if (this._activeAnimationFrames) this._activeAnimationFrames.push(frameId);
        };

        const frameId = requestAnimationFrame(animate);
        if (this._activeAnimationFrames) this._activeAnimationFrames.push(frameId);
    }

    createGreatCirclePath(start, end, numPoints = 100) {
        // Check if this path crosses the date line (longitude ±180)
        const lonDiff = Math.abs(end[1] - start[1]);
        
        // If longitude difference is greater than 180, it's likely crossing the date line
        if (lonDiff > 180) {
            return this.createDateLineCrossingPath(start, end, numPoints);
        }
        
        // Regular great circle path for non-date-line-crossing routes
        return this.createSingleGreatCirclePath(start, end, numPoints);
    }

    createSingleGreatCirclePath(start, end, numPoints = 100) {
        const lat1 = start[0] * Math.PI / 180;
        const lon1 = start[1] * Math.PI / 180;
        const lat2 = end[0] * Math.PI / 180;
        const lon2 = end[1] * Math.PI / 180;

        const path = [];
        
        for (let i = 0; i <= numPoints; i++) {
            const f = i / numPoints;
            
            const d = Math.acos(Math.sin(lat1) * Math.sin(lat2) + Math.cos(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1));
            
            if (d === 0) {
                path.push([start[0], start[1]]);
                continue;
            }
            
            const A = Math.sin((1 - f) * d) / Math.sin(d);
            const B = Math.sin(f * d) / Math.sin(d);
            
            const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
            const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
            const z = A * Math.sin(lat1) + B * Math.sin(lat2);
            
            const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
            const lon = Math.atan2(y, x);
            
            path.push([lat * 180 / Math.PI, lon * 180 / Math.PI]);
        }
        
        return path;
    }

    createDateLineCrossingPath(start, end, numPoints = 100) {
        // For date line crossings, create the path but it will need to be split visually
        // We return a regular great circle path, but mark it for splitting
        return this.createSingleGreatCirclePath(start, end, numPoints);
    }

    splitPathAtDateLine(path) {
        const segments = [];
        let currentSegment = [];
        
        for (let i = 0; i < path.length; i++) {
            const point = path[i];
            const lon = point[1];
            
            // Check for date line crossing
            if (i > 0) {
                const prevLon = path[i - 1][1];
                const lonDiff = Math.abs(lon - prevLon);
                
                // If longitude jumps by more than 180 degrees, we've crossed the date line
                if (lonDiff > 180) {
                    // Finish current segment
                    if (currentSegment.length > 0) {
                        segments.push([...currentSegment]);
                    }
                    // Start new segment
                    currentSegment = [point];
                    continue;
                }
            }
            
            currentSegment.push(point);
        }
        
        // Add the last segment
        if (currentSegment.length > 0) {
            segments.push(currentSegment);
        }
        
        return segments;
    }

    updatePathLinesProgress(pathLines, fullPath, currentStep) {
        if (pathLines.length === 1) {
            // Single line - normal behavior
            const currentPath = fullPath.slice(0, currentStep + 1);
            pathLines[0].line.setLatLngs(currentPath);
        } else {
            // Multiple lines - need to distribute progress across segments
            let totalPointsDrawn = 0;
            
            for (let i = 0; i < pathLines.length; i++) {
                const pathData = pathLines[i];
                const segmentLength = pathData.points.length;
                
                if (currentStep >= totalPointsDrawn) {
                    const segmentProgress = Math.min(currentStep - totalPointsDrawn, segmentLength - 1);
                    const segmentPath = pathData.points.slice(0, segmentProgress + 1);
                    pathData.line.setLatLngs(segmentPath);
                }
                
                totalPointsDrawn += segmentLength;
            }
        }
    }

    completeAnimation() {
        // Mark last city as visited
        if (this.cities.length > 0) {
            this.cities[this.cities.length - 1].visited = true;
            this.updateCityMarkerStyle(this.cities.length - 1, 'visited');
        }
        
        this.updateProgress();
        this.updateCityList();
        this.updateStatistics();
        
        // Update year to the last flight's year
        if (this.cities.length > 0) {
            this.updateCurrentTripYear(this.cities.length - 1);
        }
        
        // Set current flight to show completion briefly
        const currentFlightElement = document.getElementById('currentFlight');
        if (currentFlightElement) {
            currentFlightElement.textContent = window.i18n ? window.i18n.t('journeyComplete') : 'Journey Complete!';
        }
        
        // Auto-restart animation after a brief pause (loop the animation)
        const gen = this._animationGen;
        setTimeout(() => {
            if (gen !== this._animationGen) return;
            this.resetAnimationState();
            this.startAnimation();
        }, 2000); // 2 second pause before restarting
    }

    restartAnimation() {
        // Use the new reset method for consistency
        this.resetAnimationState();

        // Restart the animation
        const gen = this._animationGen;
        setTimeout(() => {
            if (gen !== this._animationGen) return;
            this.startAnimation();
        }, 1000);
    }

    togglePlayPause() {
        if (this.pauseAfterCurrentFlight) {
            // If pause is pending, cancel it
            this.pauseAfterCurrentFlight = false;
            this.updatePlayPauseButton();
        } else if (this.isAnimating) {
            this.pauseAnimation();
        } else {
            this.resumeAnimation();
        }
    }

    cycleFastForward() {
        // Cycle through speeds: 1x -> 10x -> 20x -> 100x -> 1x
        if (this.speedMultiplier === 1) {
            this.speedMultiplier = 10;
        } else if (this.speedMultiplier === 10) {
            this.speedMultiplier = 20;
        } else if (this.speedMultiplier === 20) {
            this.speedMultiplier = 100;
        } else {
            this.speedMultiplier = 1;
        }
        
        this.updateFastForwardButton();
    }

    updateFastForwardButton() {
        if (this.fastForwardButton) {
            if (this.speedMultiplier === 1) {
                this.fastForwardButton.style.backgroundColor = '#333';
                this.fastForwardButton.style.opacity = '1';
                this.fastForwardButton.title = window.i18n ? window.i18n.t('speed1x') : 'Speed: 1x (click to cycle)';
            } else if (this.speedMultiplier === 10) {
                this.fastForwardButton.style.backgroundColor = '#FF9800';
                this.fastForwardButton.style.opacity = '1';
                this.fastForwardButton.title = window.i18n ? window.i18n.t('speed10x') : 'Speed: 10x (click to cycle)';
            } else if (this.speedMultiplier === 20) {
                this.fastForwardButton.style.backgroundColor = '#F44336';
                this.fastForwardButton.style.opacity = '1';
                this.fastForwardButton.title = window.i18n ? window.i18n.t('speed20x') : 'Speed: 20x (click to cycle)';
            } else if (this.speedMultiplier === 100) {
                this.fastForwardButton.style.backgroundColor = '#9C27B0';
                this.fastForwardButton.style.opacity = '1';
                this.fastForwardButton.title = window.i18n ? window.i18n.t('speed100x') : 'Speed: 100x (click to cycle)';
            }
        }
    }

    pauseAnimation() {
        // Stop immediately mid-flight
        this.isAnimating = false;
        this.pauseAfterCurrentFlight = false;
        this.updatePlayPauseButton();
    }

    // Called when a flight animation completes to check if we should pause
    checkForPendingPause() {
        if (this.pauseAfterCurrentFlight) {
            this.pauseAfterCurrentFlight = false;
            this.isAnimating = false;
            this.updatePlayPauseButton();
            return true; // Indicates we paused
        }
        return false; // Continue animation
    }

    completeCurrentPath() {
        // If there's a current path being animated, complete it to avoid broken lines
        if (this.currentAnimationPath && this.currentPathLines) {
            this.currentPathLines.forEach(pathData => {
                pathData.line.setLatLngs(pathData.points);
            });
        }
    }

    resumeAnimation() {
        // Clear any pending pause flag
        this.pauseAfterCurrentFlight = false;

        // If jumpToCity was used (e.g. user clicked progress bar while paused),
        // advance past the current city — its leg is already in the chart.
        if (this._jumpedToCity) {
            this._jumpedToCity = false;
            this._pausedAnimateState = null; // scrub invalidates mid-flight pause
            this.currentCityIndex++;
        }

        // Resume mid-flight if we were paused during a flight animation
        if (this._pausedAnimateState && this._pausedAnimateState.gen === this._animationGen) {
            const state = this._pausedAnimateState;
            this._pausedAnimateState = null;
            this.isAnimating = true;
            this.updatePlayPauseButton();
            // Re-enter the animation frame loop, adjusting for pause duration
            state.resume();
            return;
        }
        this._pausedAnimateState = null;

        // Only resume if we haven't completed the journey
        if (this.currentCityIndex < this.cities.length) {
            this.isAnimating = true;
            this.updatePlayPauseButton();
            // Continue from current position
            this.animateToNextCity();
        } else {
            // If journey is complete, restart from beginning
            this.replayAnimation();
        }
    }

    updatePlayPauseButton() {
        if (this.playPauseButton) {
            if (this.pauseAfterCurrentFlight) {
                // Show pending pause state
                this.playPauseButton.innerHTML = '⏸️';
                this.playPauseButton.title = window.i18n ? window.i18n.t('pausingAfterFlight') : 'Pausing after current flight...';
                this.playPauseButton.style.opacity = '0.7'; // Visual indication of pending state
            } else if (this.isAnimating) {
                this.playPauseButton.innerHTML = '⏸️';
                this.playPauseButton.title = window.i18n ? window.i18n.t('pauseAnimation') : 'Pause Animation';
                this.playPauseButton.style.opacity = '1';
            } else {
                this.playPauseButton.innerHTML = '▶️';
                this.playPauseButton.title = window.i18n ? window.i18n.t('resumeAnimation') : 'Resume Animation';
                this.playPauseButton.style.opacity = '1';
            }
        }
    }

    toggleLinesVisibility() {
        this.linesVisible = !this.linesVisible;
        
        if (this.linesVisible) {
            this.showAllLines();
        } else {
            this.hideAllLines();
        }
        
        this.updateToggleLinesButton();
    }

    showAllLines() {
        // Show all visited paths
        this.visitedPaths.forEach(path => {
            if (path && !this.map.hasLayer(path)) {
                this.map.addLayer(path);
            }
        });
        
        // Show current flight path if it exists
        if (this.flightPath && !this.map.hasLayer(this.flightPath)) {
            this.map.addLayer(this.flightPath);
        }
        
        // Show all continuous path segments
        this.continuousPathSegments.forEach(segment => {
            if (segment && !this.map.hasLayer(segment)) {
                segment.addTo(this.map);
            }
        });
        
        // Show current continuous path
        if (this.continuousPath && !this.map.hasLayer(this.continuousPath)) {
            this.continuousPath.addTo(this.map);
        }

        // Show interactive route hit areas so hover works when lines are visible
        if (this.routeInteractivePolylines && this.routeInteractivePolylines.length) {
            this.routeInteractivePolylines.forEach(r => {
                if (r && r.poly && !this.map.hasLayer(r.poly)) this.map.addLayer(r.poly);
            });
        }

        // Show world copy layers (±360 duplicates)
        if (this._worldCopyLayers) {
            this._worldCopyLayers.forEach(layer => {
                if (layer && !this.map.hasLayer(layer)) this.map.addLayer(layer);
            });
        }
    }

    hideAllLines() {
        // Hide all visited paths
        this.visitedPaths.forEach(path => {
            if (path && this.map.hasLayer(path)) {
                this.map.removeLayer(path);
            }
        });
        
        // Hide current flight path if it exists
        if (this.flightPath && this.map.hasLayer(this.flightPath)) {
            this.map.removeLayer(this.flightPath);
        }
        
        // Hide all continuous path segments
        this.continuousPathSegments.forEach(segment => {
            if (segment && this.map.hasLayer(segment)) {
                this.map.removeLayer(segment);
            }
        });
        
        // Hide current continuous path
        if (this.continuousPath && this.map.hasLayer(this.continuousPath)) {
            this.map.removeLayer(this.continuousPath);
        }

        // Hide interactive route hit areas (prevent hover when lines are hidden)
        if (this.routeInteractivePolylines && this.routeInteractivePolylines.length) {
            this.routeInteractivePolylines.forEach(r => {
                if (r && r.poly && this.map.hasLayer(r.poly)) this.map.removeLayer(r.poly);
            });
        }

        // Hide world copy layers (±360 duplicates)
        if (this._worldCopyLayers) {
            this._worldCopyLayers.forEach(layer => {
                if (layer && this.map.hasLayer(layer)) this.map.removeLayer(layer);
            });
        }
    }

    updateToggleLinesButton() {
        if (this.toggleLinesButton) {
            if (this.linesVisible) {
                this.toggleLinesButton.innerHTML = '━';
                this.toggleLinesButton.title = window.i18n ? window.i18n.t('hideFlightLines') : 'Hide Flight Lines';
                this.toggleLinesButton.style.backgroundColor = '#333';
                this.toggleLinesButton.style.opacity = '1';
            } else {
                this.toggleLinesButton.innerHTML = '•';
                this.toggleLinesButton.title = window.i18n ? window.i18n.t('showFlightLines') : 'Show Flight Lines';
                this.toggleLinesButton.style.backgroundColor = '#666';
                this.toggleLinesButton.style.opacity = '0.5';
            }
        }
    }

    panToVisible(latLng, animate) {
        const header = document.querySelector('.card-container .header');
        const cityList = document.querySelector('.city-list-container');
        const hH = header ? header.offsetHeight : 0;
        const cH = cityList ? cityList.offsetHeight : 0;
        const containerH = this.map.getContainer().offsetHeight;
        const visibleCenterY = hH + (containerH - hH - cH) / 2;
        const geoCenterY = containerH / 2;
        const dy = visibleCenterY - geoCenterY;
        const pt = this.map.latLngToContainerPoint(latLng);
        pt.y -= dy;
        const adjusted = this.map.containerPointToLatLng(pt);
        if (animate) {
            this.map.setView(adjusted, this.map.getZoom(), { animate: true, duration: 0.5 });
        } else {
            this.map.panTo(adjusted, { animate: false });
        }
    }

    toggleFollowDot() {
        this.followDot = !this.followDot;
        this.updateFollowDotButton();

        // If enabling follow mode and dot exists, pan to it
        if (this.followDot && this.flightDot) {
            this.panToVisible(this.flightDot.getLatLng(), true);
        }
    }

    updateFollowDotButton() {
        if (this.followDotButton) {
            if (this.followDot) {
                this.followDotButton.innerHTML = '🎯';
                this.followDotButton.title = window.i18n ? window.i18n.t('stopFollowDot') : 'Stop Following Dot';
                this.followDotButton.style.backgroundColor = '#4CAF50';
                this.followDotButton.style.opacity = '1';
            } else {
                this.followDotButton.innerHTML = '🎯';
                this.followDotButton.title = window.i18n ? window.i18n.t('followDot') : 'Follow Flying Dot';
                this.followDotButton.style.backgroundColor = '#333';
                this.followDotButton.style.opacity = '1';
            }
        }
    }

    replayAnimation() {
        // Reset all animation state
        this.resetAnimationState();

        // Hide replay button and show skip button
        this.hideReplayButton();

        // Start the animation from the beginning
        const gen = this._animationGen;
        setTimeout(() => {
            if (gen !== this._animationGen) return;
            this.startAnimation();
        }, 500);
    }
    
    resetAnimationState() {
        // Stop any current animation
        this.isAnimating = false;

        // Reset trophy notifications
        if (window.countryTrophy) window.countryTrophy.reset();

        // Reset city states
        this.cities.forEach(city => {
            city.visited = false;
        });
        
        // Reset markers - remove from map but keep in array, reset styling
        this.cityMarkers.forEach((cityMarker, index) => {
            if (cityMarker && cityMarker.marker) {
                this.map.removeLayer(cityMarker.marker);
                // Reset marker styling to pending
                this.updateCityMarkerStyle(index, 'pending');
            }
        });
        
        // Remove flight dot if it exists
        if (this.flightDot && this.map.hasLayer(this.flightDot)) {
            this.map.removeLayer(this.flightDot);
        }
        
        // Clear all flight paths
        this.visitedPaths.forEach(path => {
            if (this.map.hasLayer(path)) {
                this.map.removeLayer(path);
            }
        });
        this.visitedPaths = [];
        
        // Clear all continuous path segments
        this.continuousPathSegments.forEach(segment => {
            if (segment && this.map.hasLayer(segment)) {
                this.map.removeLayer(segment);
            }
        });
        this.continuousPathSegments = [];
        
        // Clear current continuous path
        if (this.continuousPath && this.map.hasLayer(this.continuousPath)) {
            this.map.removeLayer(this.continuousPath);
        }
        this.continuousPath = null;
        this.allPathCoordinates = [];
        
        // Reset counters
        this.currentCityIndex = 0;
        this.totalDistance = 0;
        this.totalTime = 0;
        this.totalCO2 = 0;
        this.totalCostSGD = 0;
        
        // Reset progress bar
        document.getElementById('progressFill').style.width = '0%';
        
        // Reset UI elements
        this.updateCityList();
        this.updateStatistics();
        
        // Reset header year to the first flight
        if (this.cities.length > 0) {
            this.updateCurrentTripYear(0);
        }
        
        // Reset current flight display
        const currentFlightElement = document.getElementById('currentFlight');
        if (currentFlightElement) {
            currentFlightElement.textContent = '-';
        }
    }
    
    showReplayButton() {
        if (this.replayButton) {
            this.replayButton.style.display = 'flex';
        }
        // Don't modify the play/pause button when showing replay button
        // The animation is complete, so hide the play/pause button instead
        if (this.playPauseButton) {
            this.playPauseButton.style.display = 'none';
        }
    }
    
    hideReplayButton() {
        if (this.replayButton) {
            this.replayButton.style.display = 'none';
        }
        if (this.playPauseButton) {
            // Show the play/pause button again when hiding replay button
            this.playPauseButton.style.display = 'flex';
            // Animation is running, show pause button
            this.updatePlayPauseButton();
        }
    }

    updateProgress() {
        const visitedCount = this.cities.filter(city => city.visited).length;
        const progress = this.cities.length > 0 ? (visitedCount / this.cities.length) * 100 : 0;
        document.getElementById('progressFill').style.width = progress + '%';
        
        // Update scrubber position
        this.updateScrubberPosition(progress);
    }

    initializeScrubber() {
        this.scrubberElement = document.getElementById('progressScrubber');
        this.progressBarElement = document.querySelector('.progress-bar');
        
        if (!this.scrubberElement || !this.progressBarElement) {
            console.warn('Progress scrubber elements not found');
            return;
        }

        // Add mouse event listeners
        this.scrubberElement.addEventListener('mousedown', (e) => this.startDrag(e));
        this.progressBarElement.addEventListener('click', (e) => this.handleProgressBarClick(e));
        
        // Add global mouse events for dragging
        document.addEventListener('mousemove', (e) => this.handleDrag(e));
        document.addEventListener('mouseup', () => this.stopDrag());
        
        // Prevent text selection during drag
        this.scrubberElement.addEventListener('selectstart', (e) => e.preventDefault());
    }

    updateScrubberPosition(progressPercentage) {
        if (!this.scrubberElement || !this.progressBarElement) return;
        
        // Clamp the position between 0 and 100%
        const clampedProgress = Math.max(0, Math.min(100, progressPercentage));
        
        // Position the scrubber relative to the progress bar width
        // Using percentage of the bar's width rather than viewport width
        const barRect = this.progressBarElement.getBoundingClientRect();
        const scrubberWidth = this.scrubberElement.offsetWidth || 8;
        
        // Calculate the position ensuring the scrubber stays within bounds
        // The scrubber is centered on the progress point (due to transform: translateX(-50%))
        // so we need to account for its width
        const maxProgress = 100;
        const adjustedProgress = clampedProgress;
        
        this.scrubberElement.style.left = adjustedProgress + '%';
        
        // Also update the progress fill to follow the scrubber
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = adjustedProgress + '%';
        }
    }

    startDrag(e) {
        e.preventDefault();
        this.isDragging = true;
        this._lastDragTarget = -1;
        this._dragRAF = null;
        this.scrubberElement.classList.add('dragging');
        const fill = document.getElementById('progressFill');
        if (fill) fill.classList.add('no-transition');

        // Pause animation while dragging — cancel in-flight animation immediately
        this.wasAnimating = this.isAnimating;
        if (this.isAnimating) {

            this._animationGen++; // kill any pending setTimeout callbacks from old chain
            this.isAnimating = false;
        }
    }

    handleDrag(e) {
        if (!this.isDragging || !this.progressBarElement) return;

        const rect = this.progressBarElement.getBoundingClientRect();
        const x = e.clientX - rect.left;

        // Calculate progress as a percentage of the progress bar's actual width
        const progressPercentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

        // Update scrubber and progress fill position immediately (lightweight)
        this.updateScrubberPosition(progressPercentage);

        // Calculate which city this corresponds to
        const targetCityIndex = Math.min(
            Math.floor((progressPercentage / 100) * this.cities.length),
            this.cities.length - 1
        );

        // Skip if we haven't moved to a different city
        if (targetCityIndex === this._lastDragTarget) return;
        this._lastDragTarget = targetCityIndex;

        // Debounce the heavy visual rebuild — only the last pending call runs
        if (this._dragRAF) cancelAnimationFrame(this._dragRAF);
        this._dragRAF = requestAnimationFrame(() => {
            this._dragRAF = null;
            this.jumpToCity(targetCityIndex);
        });
    }

    stopDrag() {
        if (!this.isDragging) return;

        // Flush any pending debounced jumpToCity so state is up-to-date before resume
        if (this._dragRAF) {
            cancelAnimationFrame(this._dragRAF);
            this._dragRAF = null;
            if (this._lastDragTarget >= 0 && this._lastDragTarget < this.cities.length) {
                this.jumpToCity(this._lastDragTarget);
            }
        }

        this.isDragging = false;
        this.scrubberElement.classList.remove('dragging');
        const fill = document.getElementById('progressFill');
        if (fill) fill.classList.remove('no-transition');

        // Resume animation if it was running before scrubbing
        if (this.wasAnimating) {
            this.isAnimating = true;
    
            this.updatePlayPauseButton(); // Update button state

            // Advance past the current city — jumpToCity already processed the leg
            // ending here and rebuildChart included it. Without this increment,
            // animateToNextCity would re-process the same leg and addChartPoint
            // would push a duplicate data point (back-to-back repeat in charts).
            this._jumpedToCity = false; // handled here, don't double-advance in resumeAnimation
            this.currentCityIndex++;
            if (this.currentCityIndex < this.cities.length) {
                const gen = this._animationGen;
                setTimeout(() => {
                    if (gen !== this._animationGen) return;
                    this.animateToNextCity();
                }, 100); // Small delay for smooth transition
            }
        }
    }

    handleProgressBarClick(e) {
        if (this.isDragging) return;

        // Stop any in-flight animation before jumping
        this.wasAnimating = this.isAnimating;
        this.isAnimating = false;
        this._animationGen++;

        const rect = this.progressBarElement.getBoundingClientRect();
        const x = e.clientX - rect.left;

        // Calculate progress as a percentage of the progress bar's actual width
        const progressPercentage = Math.max(0, Math.min(100, (x / rect.width) * 100));

        // Update scrubber and progress fill position
        this.updateScrubberPosition(progressPercentage);

        // Calculate which city this corresponds to
        const targetCityIndex = Math.floor((progressPercentage / 100) * this.cities.length);

        // Jump to that position in the journey
        this.jumpToCity(targetCityIndex);

        // Resume animation if it was running
        if (this.wasAnimating) {
            this.isAnimating = true;
    
            this._jumpedToCity = false;
            this.currentCityIndex++;
            if (this.currentCityIndex < this.cities.length) {
                const gen = this._animationGen;
                setTimeout(() => {
                    if (gen !== this._animationGen) return;
                    this.animateToNextCity();
                }, 100);
            }
        }
    }

    jumpToCity(targetIndex) {
        if (targetIndex < 0 || targetIndex >= this.cities.length) return;

        // Cancel any in-flight animation so its callback doesn't fire and move the dot
        this._animationGen++; // invalidate all animation frames and pending setTimeout callbacks
        this._pausedAnimateState = null; // discard any mid-flight pause

        // Flag that jumpToCity was used — the chart has been rebuilt up to
        // targetIndex, so the next animateToNextCity must skip past it.
        this._jumpedToCity = true;

        // Reset all cities to unvisited
        this.cities.forEach(city => {
            city.visited = false;
            city.current = false;
        });
        
        // Mark cities up to target as visited
        for (let i = 0; i <= targetIndex; i++) {
            this.cities[i].visited = true;
        }
        // Sync trophy state to match scrubbed position (no popups)
        if (window.countryTrophy) window.countryTrophy.syncTo(this.cities.slice(0, targetIndex + 1));
        
        // Set current city
        this.currentCityIndex = targetIndex;
        if (this.cities[targetIndex]) {
            this.cities[targetIndex].current = true;
        }
        
        // Recalculate statistics up to current position
        this.recalculateStatistics();
        
        // Update current trip year
        if (this.currentCityIndex >= 0 && this.currentCityIndex < this.cities.length) {
            this.updateCurrentTripYear(this.currentCityIndex);
        }
        
        // Update current flight display
        this.updateCurrentFlightDisplay();
        
        // Update the visual state
        this.clearMap();
        this.drawVisitedPaths(); // also calls addCityMarkers internally
        this.positionDotAtCurrentCity();
        this.updateCityList();
        this.updateStatistics();
    }

    // Recalculate all statistics based on current city index
    recalculateStatistics() {
        // Reset totals
        this.totalDistance = 0;
        this.totalTime = 0;
        this.totalCO2 = 0;
        this.totalCostSGD = 0;
        
        // Calculate statistics for journeys up to current position
        for (let i = 0; i < this.currentCityIndex; i++) {
            if (i + 1 < this.cities.length) {
                const fromCity = this.cities[i];
                const toCity = this.cities[i + 1];
                
                // Calculate distance
                const distanceKm = this.calculateDistance(fromCity.lat, fromCity.lng, toCity.lat, toCity.lng);
                this.totalDistance += distanceKm;
                
                // Calculate time, emissions, and cost using same logic as animation
                const journeyData = toCity.originalFlight;
                
                // Use land journey duration if available
                let timeHours;
                if (journeyData && journeyData.type === 'land' && journeyData.duration) {
                    timeHours = journeyData.duration;
                } else {
                    timeHours = distanceKm / 900;
                }
                
                const co2EmissionKg = this.calculateEmissions(distanceKm, journeyData);
                
                let costSGD = 0;
                if (journeyData && journeyData.costSGD && journeyData.costSGD > 0) {
                    costSGD = journeyData.costSGD;
                }
                
                this.totalTime += timeHours;
                this.totalCO2 += co2EmissionKg;
                this.totalCostSGD += costSGD;

                // Store chart data for scrubber sync
                const _costPerKm = (costSGD > 0 && distanceKm > 0) ? costSGD / distanceKm : null;
                const _co2PerSGD = costSGD > 0 ? (co2EmissionKg / costSGD) * 1000 : null;
                const _legDate = toCity.originalFlight ? toCity.originalFlight.date : null;
                const _cost = costSGD > 0 ? costSGD : null;
                toCity.legChartData = { costPerKm: _costPerKm, co2PerSGD: _co2PerSGD, date: _legDate, cost: _cost };
            }
        }
        this.rebuildChart();
    }

    // Position the flight dot at the current city
    positionDotAtCurrentCity() {
        if (this.currentCityIndex >= 0 && this.currentCityIndex < this.cities.length) {
            const currentCity = this.cities[this.currentCityIndex];

            // Reuse the existing flight dot (created in createFlightDot)
            if (!this.flightDot) {
                this.createFlightDot();
            }
            this._setFlightDotLatLng([currentCity.lat, currentCity.lng]);

            // Add to map if not already there
            if (!this.map.hasLayer(this.flightDot)) {
                this.flightDot.addTo(this.map);
            }
            // Ensure ±360 copies are on the map
            if (this._flightDotCopies) {
                this._flightDotCopies.forEach(d => { if (!this.map.hasLayer(d)) d.addTo(this.map); });
            }
        }
    }

    // Update the current flight display based on current position
    // Normalize city names to handle variations (Da Nang/Danang, Busan/Pusan, etc.)
    normalizeCityName(name) {
        if (!name) return '';
        // Convert to lowercase and remove spaces, hyphens, apostrophes
        let normalized = name.toLowerCase().replace(/[\s\-\']/g, '');
        
        // Handle spelling variations
        if (normalized === 'marrakech') normalized = 'marrakesh';
        if (normalized === 'danang') normalized = 'danang';
        if (normalized === 'pusan') normalized = 'busan';
        if (normalized === 'phnompenh') normalized = 'phnompenh';
        if (normalized === 'hue') normalized = 'hue';
        if (normalized === 'calcutta') normalized = 'kolkata';
        if (normalized === 'perth') normalized = 'perth';
        return normalized;
    }

    // Normalize/display name for city list and statistics de-duplication
    normalizeCityDisplayName(name) {
        if (!name) return name;
        const trimmed = name.trim();
        const lower = trimmed.toLowerCase();
        if (lower === 'danang' || trimmed === 'Da Nang') return 'Da Nang';
        if (lower === 'pusan' || trimmed === 'Busan') return 'Busan';
        if (lower === 'calcutta') return 'Kolkata';
        if (lower === 'phnompenh' || trimmed === 'Phnom Penh') return 'Phnom Penh';
        if (lower === 'hue') return 'Hue';
        if (lower === 'perth') return 'Perth';
        if (lower === 'malta' || trimmed === 'Malta') return 'Valletta';
        if (lower === 'ho chi minh (saigon)') return 'Ho Chi Minh City';
        return name;
    }

    updateCurrentFlightDisplay() {
        const currentFlightElement = document.getElementById('currentFlight');
        if (currentFlightElement) {
            // Helper to build a small flag <img> from a country name
            const _flag = (country) => {
                const iso = window.COUNTRY_ISO && country ? window.COUNTRY_ISO[country.trim()] : null;
                if (!iso) return '';
                return `<img src="asset/flags/${iso}.png" width="16" height="12" alt="${country}" style="vertical-align:middle;border-radius:2px;margin:0 5px 0 2px;">`;
            };

            // Show current journey for any position, including the last city
            if (this.currentCityIndex > 0 && this.currentCityIndex < this.cities.length) {
                // Find the nearest journey with different city names
                let displayIndex = this.currentCityIndex;
                let fromCity = this.cities[displayIndex - 1];
                let toCity = this.cities[displayIndex];
                
                // Search forward for a journey with different city names
                while (displayIndex < this.cities.length && this.normalizeCityName(fromCity.name) === this.normalizeCityName(toCity.name)) {
                    displayIndex++;
                    if (displayIndex < this.cities.length) {
                        fromCity = this.cities[displayIndex - 1];
                        toCity = this.cities[displayIndex];
                    }
                }
                
                // If not found forward, search backward
                if (displayIndex >= this.cities.length || this.normalizeCityName(fromCity.name) === this.normalizeCityName(toCity.name)) {
                    displayIndex = this.currentCityIndex;
                    while (displayIndex > 0 && this.normalizeCityName(fromCity.name) === this.normalizeCityName(toCity.name)) {
                        displayIndex--;
                        if (displayIndex > 0) {
                            fromCity = this.cities[displayIndex - 1];
                            toCity = this.cities[displayIndex];
                        }
                    }
                }
                
                // Display if we found a valid journey with different cities
                if (displayIndex > 0 && displayIndex < this.cities.length && this.normalizeCityName(fromCity.name) !== this.normalizeCityName(toCity.name)) {
                    const fromFlag = _flag(fromCity.country);
                    const toFlag = _flag(toCity.country);
                    // Check if this is a land journey and add mode info
                    const journeyData = toCity.originalFlight;
                    if (journeyData && journeyData.type === 'land' && journeyData.mode) {
                        const mode = journeyData.mode.charAt(0).toUpperCase() + journeyData.mode.slice(1);
                        const durationText = journeyData.durationFormatted ? ` (${journeyData.durationFormatted})` : '';
                        currentFlightElement.innerHTML = `${fromFlag}${fromCity.name} → ${toFlag}${toCity.name} [${mode}${durationText}]`;
                    } else {
                        currentFlightElement.innerHTML = `${fromFlag}${fromCity.name} → ${toFlag}${toCity.name}`;
                    }
                    return;
                }
                
                // If no valid journey found, show nothing
                currentFlightElement.textContent = '';
            } else if (this.currentCityIndex === 0 && this.cities.length > 0) {
                const startFlag = _flag(this.cities[0].country);
                currentFlightElement.innerHTML = `${window.i18n ? window.i18n.t('startingAt') : 'Starting at'} ${startFlag}${this.cities[0].name}`;
            } else if (this.currentCityIndex >= this.cities.length && this.cities.length > 0) {
                // Only show "Journey Complete!" when currentCityIndex has gone beyond all cities (animation completed)
                currentFlightElement.textContent = window.i18n ? window.i18n.t('journeyComplete') : 'Journey Complete!';
            } else {
                currentFlightElement.textContent = window.i18n ? window.i18n.t('readyToBegin') : 'Ready to begin journey';
            }
        }
    }

    drawVisitedPaths() {
        // Clear existing continuous path segments
        this.continuousPathSegments.forEach(segment => {
            if (segment && this.map.hasLayer(segment)) {
                this.map.removeLayer(segment);
            }
        });
        this.continuousPathSegments = [];
        
        // Clear current continuous path
        if (this.continuousPath && this.map.hasLayer(this.continuousPath)) {
            this.map.removeLayer(this.continuousPath);
        }
        
        // Clear old visited paths
        this.visitedPaths.forEach(path => {
            if (path && this.map.hasLayer(path)) {
                this.map.removeLayer(path);
            }
        });
        this.visitedPaths = [];

        // Clear existing interactive route polylines (hover targets)
        if (this.routeInteractivePolylines && this.routeInteractivePolylines.length) {
            this.routeInteractivePolylines.forEach(r => {
                if (r && r.poly && this.map.hasLayer(r.poly)) this.map.removeLayer(r.poly);
            });
            this.routeInteractivePolylines = [];
        }

        // Clear world copies (±360 duplicates for seamless panning)
        this._clearWorldCopies();
        
        // Rebuild the continuous path up to current position
        this.allPathCoordinates = [];
        
        for (let i = 0; i < this.currentCityIndex; i++) {
            if (i + 1 < this.cities.length) {
                const fromCity = this.cities[i];
                const toCity = this.cities[i + 1];
                
                // Check if this is a date line crossing
                const isDateLineCrossing = Math.abs(toCity.lng - fromCity.lng) > 180;
                
                // Use the same great circle path logic as animation
                const pathPoints = this.createGreatCirclePath([fromCity.lat, fromCity.lng], [toCity.lat, toCity.lng]);
                
                if (isDateLineCrossing) {
                    // Unwrap longitudes so the path is one continuous line across ±180°
                    const unwrapped = this._unwrapPathLongitudes(pathPoints);
                    
                    // Finalize current accumulated segment if it has points
                    if (this.allPathCoordinates.length > 0) {
                        const segOpts = { color: '#4CAF50', weight: 1, opacity: 0.6 };
                        const segment = L.polyline(this.allPathCoordinates, segOpts);
                        
                        if (this.linesVisible) {
                            segment.addTo(this.map);
                            this._addPolylineWorldCopies(this.allPathCoordinates, segOpts);
                        }
                        this.continuousPathSegments.push(segment);
                    }
                    
                    // Create single continuous polyline for the unwrapped crossing path
                    const segOpts = { color: '#4CAF50', weight: 1, opacity: 0.6 };
                    const segmentPolyline = L.polyline(unwrapped, segOpts);
                    
                    if (this.linesVisible) {
                        segmentPolyline.addTo(this.map);
                        this._addPolylineWorldCopies(unwrapped, segOpts);
                    }
                    
                    this.continuousPathSegments.push(segmentPolyline);
                    
                    // Start fresh with the destination's original coordinates
                    this.allPathCoordinates = [[toCity.lat, toCity.lng]];
                } else {
                    // Avoid duplicating the first point if it matches the last point already in the path
                    let pointsToAdd = pathPoints;
                    if (this.allPathCoordinates.length > 0) {
                        const lastCoord = this.allPathCoordinates[this.allPathCoordinates.length - 1];
                        const firstNewCoord = pathPoints[0];
                        // Check if coordinates are the same (within tolerance)
                        if (Math.abs(lastCoord[0] - firstNewCoord[0]) < 0.0001 && 
                            Math.abs(lastCoord[1] - firstNewCoord[1]) < 0.0001) {
                            pointsToAdd = pathPoints.slice(1); // Skip first point to avoid duplicate
                        }
                    }
                    
                    this.allPathCoordinates.push(...pointsToAdd);
                }
            }
        }
        
        // Create the final continuous path with remaining accumulated coordinates
        if (this.allPathCoordinates.length > 0) {
            const finalOpts = { color: '#4CAF50', weight: 1, opacity: 0.6 };
            this.continuousPath = L.polyline(this.allPathCoordinates, finalOpts);
            
            // Only add to map if lines are visible
            if (this.linesVisible) {
                this.continuousPath.addTo(this.map);
                this._addPolylineWorldCopies(this.allPathCoordinates, finalOpts);
            }
        }
        
        // Add per-hop interactive polylines for hover/popups
        // (we add these after continuous path to avoid z-indexing issues)
        this._createRouteInteractivity();

        // Add city markers
        this.addCityMarkers();
    }

    // Build invisible, interactive polylines for every city→city hop so lines are hoverable
    _createRouteInteractivity() {
        // Remove any previous interactive polylines and clear transient hover state
        if (this.routeInteractivePolylines && this.routeInteractivePolylines.length) {
            this.routeInteractivePolylines.forEach(r => {
                try { if (r && r.poly && this.map.hasLayer(r.poly)) this.map.removeLayer(r.poly); } catch (err) {}
                try { this._clearRouteHover(r); } catch (err) {}
            });
        }
        this.routeInteractivePolylines = [];

        if (!this.cities || this.cities.length < 2) return;

        for (let i = 0; i < this.cities.length - 1; i++) {
            // Only create hover targets for hops that have already been shown.
            // This prevents hover on future/unrevealed routes.
            if (i >= this.currentCityIndex) continue;

            const fromCity = this.cities[i];
            const toCity = this.cities[i + 1];
            if (!fromCity || !toCity) continue;

            // Build a simplified great circle for the hop
            // Unwrap date-line crossings so the hit area is one continuous polyline
            const rawHopPath = this.createGreatCirclePath([fromCity.lat, fromCity.lng], [toCity.lat, toCity.lng], 60);
            const hopCrossesDateLine = Math.abs(toCity.lng - fromCity.lng) > 180;
            const segments = hopCrossesDateLine
                ? [this._unwrapPathLongitudes(rawHopPath)]
                : [rawHopPath];

            segments.forEach(seg => {
                if (!seg || seg.length < 2) return;

                // Invisible but thick hit-area so hover is easy on small screens
                // Increased weight to improve hover/tap hit radius on mobile and small screens
                const hit = L.polyline(seg, {
                    color: '#4CAF50',
                    weight: 32,
                    opacity: 0,
                    interactive: true,
                    className: 'route-hit'
                });

                if (this.linesVisible) hit.addTo(this.map);

                const meta = { poly: hit, fromIndex: i, toIndex: i + 1, fromCity, toCity };

                // Hover — show tooltip (use same element/classes as city marker tooltip so appearance is identical)
                const _showRouteHover = (ev) => {
                    // reuse same mouseover behavior for touch/click
                    hit.fire('mouseover', ev);
                };

                hit.on('mouseover', (e) => {
                    this._hoverPause();

                    const content = this._buildRoutePopupContent(fromCity, toCity);

                    // Use a Leaflet Tooltip with the same class as city tooltips
                    try {
                        meta._hoverTooltip = L.tooltip({ className: 'city-tooltip', direction: 'top', offset: [0, -18], opacity: 0.98, sticky: false })
                            .setLatLng(e.latlng)
                            .setContent(content)
                            .openOn(this.map);
                    } catch (err) {
                        // fallback to popup if tooltip creation fails
                        meta._hoverTooltip = L.popup({ className: 'route-popup ghost', closeButton: false, autoPan: false, offset: [0, -10] })
                            .setLatLng(e.latlng)
                            .setContent(content)
                            .openOn(this.map);
                    }

                    // Add a temporary visual highlight along the visible stroke (mirrors city hover affordance)
                    try {
                        if (this.map) {
                            meta._hoverHighlight = L.polyline(seg, {
                                color: '#ffee00',
                                weight: 3,
                                opacity: 0.95,
                                interactive: false,
                                className: 'route-highlight'
                            });
                            if (this.linesVisible) meta._hoverHighlight.addTo(this.map);
                        }
                    } catch (err) { /* ignore */ }

                    // Highlight endpoint city markers (use existing marker .active when present,
                    // otherwise create small temporary hover-dots so appearance matches city hover)
                    try {
                        const activateEndpoint = (idx, city, key) => {
                            const existing = (this.cityMarkers && this.cityMarkers[idx] && this.cityMarkers[idx].marker) || null;
                            if (existing && existing.getElement && existing.getElement()) {
                                existing.getElement().classList.add('active');
                                meta[`_${key}MarkerActivated`] = true;
                            } else {
                                meta[`_${key}HoverDot`] = L.circleMarker([city.lat, city.lng], {
                                    radius: 6,
                                    color: '#4CAF50',
                                    fillColor: '#4CAF50',
                                    fillOpacity: 1,
                                    interactive: false,
                                    className: 'route-hover-dot temporary'
                                }).addTo(this.map);
                            }
                        };
                        activateEndpoint(meta.fromIndex, fromCity, 'from');
                        activateEndpoint(meta.toIndex, toCity, 'to');

                        if (hit._path) hit._path.style.cursor = 'default';
                    } catch (err) {}

                    // Attach defensive mousemove listener to guarantee hover cleanup if 'mouseout' is missed
                    try {
                        meta._hoverActive = true;
                        meta._hoverMouseMove = (mvEv) => {
                            try {
                                const el = document.elementFromPoint(mvEv.clientX, mvEv.clientY);
                                if (!el) return this._clearRouteHover(meta);
                                if (el.closest && (el.closest('.route-hit') || el.closest('.city-marker') || el.closest('.leaflet-tooltip') || el.closest('.leaflet-popup'))) {
                                    return; // still on a relevant element
                                }
                                this._clearRouteHover(meta);
                            } catch (ex) {
                                this._clearRouteHover(meta);
                            }
                        };
                        const container = this.map && this.map.getContainer ? this.map.getContainer() : null;
                        if (container && meta._hoverMouseMove) container.addEventListener('mousemove', meta._hoverMouseMove);
                    } catch (err) {}
                });

                // Support mobile/tap and pointer interactions — tap once to show, tap again (or tap map) to clear
                hit.on('click', (e) => {
                    try {
                        if (meta._hoverActive) {
                            this._clearRouteHover(meta);
                        } else {
                            // forward to mouseover handler for consistent behavior
                            hit.fire('mouseover', e);
                        }
                    } catch (ex) { /* ignore */ }
                });

                // Some platforms expose touch events directly; handle them the same as click
                hit.on('touchstart', (e) => {
                    try {
                        if (meta._hoverActive) {
                            this._clearRouteHover(meta);
                        } else {
                            hit.fire('mouseover', e);
                        }
                    } catch (ex) { /* ignore */ }
                });

                hit.on('mouseout', () => this._clearRouteHover(meta));

                // Click-to-pin popup disabled for desktop — routes still respond to tap on mobile via the handlers above.

                // Add ±360 hit-area copies so routes are hoverable in adjacent world copies
                [-360, 360].forEach(offset => {
                    const shiftedSeg = seg.map(c => [c[0], c[1] + offset]);
                    const hitCopy = L.polyline(shiftedSeg, {
                        color: '#4CAF50', weight: 32, opacity: 0,
                        interactive: true, className: 'route-hit'
                    });
                    if (this.linesVisible) hitCopy.addTo(this.map);
                    hitCopy.on('mouseover', (e) => hit.fire('mouseover', e));
                    hitCopy.on('mouseout', () => hit.fire('mouseout'));
                    hitCopy.on('click', (e) => hit.fire('click', e));
                    hitCopy.on('touchstart', (e) => hit.fire('touchstart', e));
                    this._worldCopyLayers.push(hitCopy);
                });

                this.routeInteractivePolylines.push(meta);
            });
        }
    }

    // Pause animation and follow-camera during hover inspection
    _hoverPause() {
        clearTimeout(this._hoverResumeTimer); // cancel any pending resume
        if (this._hoverPaused) return; // already paused by hover
        this._hoverPaused = true;
        this._hoverSavedFollow = this.followDot;
        this._hoverSavedView = { center: this.map.getCenter(), zoom: this.map.getZoom() };
        // Freeze the animation frame loop (skip frames) instead of setting isAnimating=false
        // which would complete the current segment and spawn a yellow destination marker
        this._hoverFrozen = true;
        this.followDot = false;
    }

    // Resume animation and follow-camera after hover ends
    _hoverResume() {
        if (!this._hoverPaused) return;
        this._hoverPaused = false;
        this._hoverFrozen = false;
        this.followDot = this._hoverSavedFollow;
        // Restore map view
        if (this._hoverSavedView) {
            this.map.setView(this._hoverSavedView.center, this._hoverSavedView.zoom, { animate: true, duration: 0.5 });
        }
        this._hoverSavedFollow = false;
        this._hoverSavedView = null;
    }

    // Remove hover artifacts for a single interactive route meta (tooltip, highlight, hover-dots, mouse handlers)
    _clearRouteHover(meta) {
        try {
            if (!meta) return;

            // Do not remove pinned popup/highlight — only clear transient hover state
            // Remove hover tooltip if present
            if (meta._hoverTooltip) {
                try { if (this.map.hasLayer(meta._hoverTooltip)) this.map.removeLayer(meta._hoverTooltip); } catch (e) {}
                meta._hoverTooltip = null;
            }

            // Remove transient highlight
            if (meta._hoverHighlight) {
                try { if (this.map.hasLayer(meta._hoverHighlight)) this.map.removeLayer(meta._hoverHighlight); } catch (e) {}
                meta._hoverHighlight = null;
            }

            // Remove any temporary hover dots and deactivate marker active state
            ['from', 'to'].forEach(k => {
                try {
                    if (meta[`_${k}HoverDot`] && this.map.hasLayer(meta[`_${k}HoverDot`])) {
                        this.map.removeLayer(meta[`_${k}HoverDot`]);
                    }
                    meta[`_${k}HoverDot`] = null;

                    if (meta[`_${k}MarkerActivated`]) {
                        const idx = k === 'from' ? meta.fromIndex : meta.toIndex;
                        const mm = (this.cityMarkers && this.cityMarkers[idx] && this.cityMarkers[idx].marker) || null;
                        if (mm && mm.getElement && mm.getElement()) mm.getElement().classList.remove('active');
                        meta[`_${k}MarkerActivated`] = false;
                    }
                } catch (err) {
                    /* ignore */
                }
            });

            // Remove mousemove detector
            try {
                const container = this.map && this.map.getContainer ? this.map.getContainer() : null;
                if (container && meta._hoverMouseMove) container.removeEventListener('mousemove', meta._hoverMouseMove);
            } catch (err) {}
            meta._hoverMouseMove = null;
            meta._hoverActive = false;

            // Resume animation after a short delay (prevents rapid re-triggers)
            clearTimeout(this._hoverResumeTimer);
            this._hoverResumeTimer = setTimeout(() => this._hoverResume(), 150);

        } catch (err) {
            console.error('Error clearing route hover', err);
        }
    }

    // Return HTML string for a route popup (from → to, mode/details, cost/date)
    _buildRoutePopupContent(fromCity, toCity) {
        // Use the same inner markup classes as city tooltips so design matches exactly
        const journey = (toCity && toCity.originalFlight) || {};
        const modeRaw = (journey.mode || journey.type || 'Train').toString();
        const mode = modeRaw.charAt(0).toUpperCase() + modeRaw.slice(1);

        // Check if the reverse route exists anywhere in the city sequence
        const isReturn = this.cities.some((c, i) =>
            i < this.cities.length - 1 &&
            c.name === toCity.name &&
            this.cities[i + 1].name === fromCity.name
        );
        const arrow = isReturn ? '⇌' : '→';

        // Top line mirrors `.city-name` (same size/weight as city tooltip)
        const title = `${fromCity.name} ${arrow} ${toCity.name}`;

        // Second line mirrors `.city-country` (smaller, muted)
        const details = [];
        if ((journey.type && journey.type === 'land') || (journey.mode && typeof journey.mode === 'string')) {
            const duration = journey.durationFormatted ? `${mode} • ${journey.durationFormatted}` : mode;
            details.push(duration);
        } else {
            const flightNum = journey.flightNumber || journey.flight || '';
            const airline = journey.airline || '';
            const desc = [flightNum, airline].filter(Boolean).join(' — ');
            if (!desc) {
                // DEBUG: log why originalFlight is missing
                console.warn('[ROUTE TOOLTIP DEBUG]', fromCity.name, '→', toCity.name,
                    '| toCity.originalFlight:', toCity.originalFlight,
                    '| toCity.locationCode:', toCity.locationCode,
                    '| fromCity.locationCode:', fromCity.locationCode);
            }
            details.push(desc || (window.i18n ? window.i18n.t('busOrTrain') : 'Bus/Train'));
        }
        if (journey.costSGD) details.push(`S$${Math.round(journey.costSGD)}${isReturn ? '' : ', ' + (window.i18n ? window.i18n.t('oneWay') : 'One Way')}`);
        if (journey.date) details.push(new Date(journey.date).getFullYear().toString());

        const detailsText = details.filter(Boolean).join(' · ');

        return `
            <div class="city-tooltip-inner">
                <div class="city-name">${this.normalizeCityDisplayName(title)}</div>
                <div class="city-country">${detailsText}</div>
            </div>
        `;
    }

    clearMap() {
        // Nuclear cleanup — remove every non-tile layer from the map so no ghost
        // polylines, markers, or highlights survive across scrub/jump calls.
        this.map.eachLayer(layer => {
            // Keep tile layers (the base map) and Leaflet controls
            if (layer._url !== undefined || layer._tiles !== undefined) return;
            try { this.map.removeLayer(layer); } catch (e) {}
        });

        // Reset all tracked references so drawVisitedPaths rebuilds from scratch
        this.continuousPath = null;
        this.continuousPathSegments = [];
        this.visitedPaths = [];
        this.routeInteractivePolylines = [];
        this._worldCopyLayers = [];
        this.currentAnimationPath = null;
        this.currentPathLines = null;
        this.allPathCoordinates = [];
        this.cityMarkers = [];
    }

    // Unwrap path longitudes so consecutive points never jump > 180°.
    // This produces a continuous polyline that crosses ±180° smoothly
    // instead of being split into disconnected segments.
    _unwrapPathLongitudes(path) {
        if (!path || path.length < 2) return path;
        const out = [[path[0][0], path[0][1]]];
        let offset = 0;
        for (let i = 1; i < path.length; i++) {
            let lon = path[i][1] + offset;
            const prev = out[i - 1][1];
            if (lon - prev > 180) { offset -= 360; lon -= 360; }
            else if (lon - prev < -180) { offset += 360; lon += 360; }
            out.push([path[i][0], lon]);
        }
        return out;
    }

    // Remove all world-copy layers (±360 duplicates for seamless panning)
    _clearWorldCopies() {
        if (this._worldCopyLayers) {
            this._worldCopyLayers.forEach(layer => {
                try { if (this.map.hasLayer(layer)) this.map.removeLayer(layer); } catch (e) {}
            });
        }
        this._worldCopyLayers = [];
    }

    // Create copies of a polyline at ±360 longitude for seamless world panning
    _addPolylineWorldCopies(coords, options) {
        [-360, 360].forEach(offset => {
            const shifted = coords.map(c => [c[0], c[1] + offset]);
            const copy = L.polyline(shifted, { ...options, interactive: false });
            copy.addTo(this.map);
            this._worldCopyLayers.push(copy);
        });
    }

    // Create copies of a marker at ±360 longitude for seamless world panning
    _addMarkerWorldCopies(lat, lng, icon) {
        [-360, 360].forEach(offset => {
            const copy = L.marker([lat, lng + offset], { icon, interactive: false });
            copy.addTo(this.map);
            this._worldCopyLayers.push(copy);
        });
    }

    // Add city markers for all cities and style them based on their visited state
    addCityMarkers() {
        this.cities.forEach((city, index) => {
            // Create marker if it doesn't exist
            if (!this.cityMarkers[index]) {
                this.createCityMarker(city);
            }
            
            if (this.cityMarkers[index]) {
                // Only show visited cities and current city (not unvisited grey markers)
                if (city.current || city.visited) {
                    // Add marker to map if not already there
                    if (!this.map.hasLayer(this.cityMarkers[index].marker)) {
                        this.cityMarkers[index].marker.addTo(this.map);
                    }
                    
                    // Update marker style based on city state
                    if (city.current) {
                        this.updateCityMarkerStyle(index, 'current');
                    } else if (city.visited) {
                        this.updateCityMarkerStyle(index, 'visited');
                    }

                    // Add ±360 copies for seamless panning
                    const mkr = this.cityMarkers[index].marker;
                    if (mkr.options && mkr.options.icon) {
                        this._addMarkerWorldCopies(city.lat, city.lng, mkr.options.icon);
                    }
                } else {
                    // Remove unvisited markers from map
                    if (this.map.hasLayer(this.cityMarkers[index].marker)) {
                        this.map.removeLayer(this.cityMarkers[index].marker);
                    }
                }
            }
        });
    }

    // Animate city list population during initial load
    animateCityListPopulation(citySequence) {
        const cityListContainer = document.getElementById('cityList');
        const cityListMobileContainer = document.getElementById('cityListMobile');
        
        if (!cityListContainer && !cityListMobileContainer) return;
        
        // Clear existing content
        if (cityListContainer) cityListContainer.innerHTML = '';
        if (cityListMobileContainer) cityListMobileContainer.innerHTML = '';
        
        // Normalize city names and get unique cities in chronological order
        function normalizeCityDisplayName(name) {
            if (!name) return name;
            const trimmed = name.trim();
            const lower = trimmed.toLowerCase();
            if (lower === 'danang' || trimmed === 'da nang') return 'Da Nang';
            if (lower === 'pusan' || trimmed === 'busan') return 'Busan';
            if (lower === 'calcutta') return 'Kolkata';
            if (lower === 'phnompenh' || trimmed === 'phnom penh') return 'Phnom Penh';
            if (lower === 'hue') return 'Hue';
            if (lower === 'perth') return 'Perth';
            if (lower === 'malta' || trimmed === 'Malta') return 'Valletta';
            return name;
        }
        
        const sortedCities = [...citySequence].sort((a, b) => {
            const dateA = new Date(a.flightDate);
            const dateB = new Date(b.flightDate);
            return dateA - dateB;
        });
        
        const uniqueCities = new Map();
        sortedCities.forEach(city => {
            const normalizedName = normalizeCityDisplayName(city.name.trim());
            const normalizedCountry = city.country ? city.country.trim() : '';
            const cityKey = `${normalizedName}-${normalizedCountry}`;
            
            if (!uniqueCities.has(cityKey)) {
                uniqueCities.set(cityKey, { ...city, name: normalizedName });
            }
        });
        
        const uniqueCityArray = Array.from(uniqueCities.values());
        const totalCities = uniqueCityArray.length;
        const animationDuration = 2000; // 2 seconds total
        const delayPerCity = animationDuration / totalCities;
        
        // Animate each city appearing
        uniqueCityArray.forEach((city, index) => {
            setTimeout(() => {
                const _rawNativeForList = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[city.name] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(city.name)])) || '';
                const nativeNameForList = (_rawNativeForList && _rawNativeForList.trim() !== (city.name || '').trim()) ? _rawNativeForList : '';
                const cityItemHTML = `
                    <div class="city-status">${index + 1}</div>
                    <div class="city-info">
                        <div class="city-name">${window.translateCity ? window.translateCity(city.name) : city.name}</div>
                        <div class="city-native">${nativeNameForList}</div>
                        <div class="city-country">${window.translateCountry ? window.translateCountry(city.country) : city.country}</div>
                    </div>
                `;
                
                // Add to desktop list
                if (cityListContainer) {
                    const cityItem = document.createElement('div');
                    cityItem.className = 'city-item';
                    cityItem.innerHTML = cityItemHTML;
                    cityItem.style.opacity = '0';
                    cityItem.style.transform = 'translateY(10px)';
                    cityListContainer.appendChild(cityItem);
                    
                    // Trigger animation
                    setTimeout(() => {
                        cityItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        cityItem.style.opacity = '1';
                        cityItem.style.transform = 'translateY(0)';
                    }, 10);
                }
                
                // Add to mobile list
                if (cityListMobileContainer) {
                    const cityItemMobile = document.createElement('div');
                    cityItemMobile.className = 'city-item';
                    cityItemMobile.innerHTML = cityItemHTML;
                    cityItemMobile.style.opacity = '0';
                    cityItemMobile.style.transform = 'translateY(10px)';
                    cityListMobileContainer.appendChild(cityItemMobile);
                    
                    // Trigger animation
                    setTimeout(() => {
                        cityItemMobile.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        cityItemMobile.style.opacity = '1';
                        cityItemMobile.style.transform = 'translateY(0)';
                    }, 10);
                }
            }, index * delayPerCity);
        });
    }

    updateCityList() {
        const cityListContainer = document.getElementById('cityList');
        const cityListMobileContainer = document.getElementById('cityListMobile');

        // If DOM not ready, retry shortly
        if (!cityListContainer && !cityListMobileContainer) {
            setTimeout(() => this.updateCityList(), 100);
            return;
        }

        // Helper: normalize display name (keeps behavior identical)
        function normalizeCityDisplayName(name) {
            if (!name) return name;
            const trimmed = name.trim();
            const lower = trimmed.toLowerCase();
            if (lower === 'danang' || trimmed === 'Da Nang') return 'Da Nang';
            if (lower === 'pusan' || trimmed === 'Busan') return 'Busan';
            if (lower === 'calcutta') return 'Kolkata';
            if (lower === 'phnompenh' || trimmed === 'Phnom Penh') return 'Phnom Penh';
            if (lower === 'hue') return 'Hue';
            if (lower === 'perth') return 'Perth';
            if (lower === 'ho chi minh (saigon)') return 'Ho Chi Minh City';
            return name;
        }

        // Build sorted unique city collection (same semantics as before)
        const sortedCities = [...this.cities].sort((a, b) => new Date(a.flightDate) - new Date(b.flightDate));
        const uniqueCities = new Map();
        let cityDisplayOrder = 1;

        for (const city of sortedCities) {
            const normalizedName = normalizeCityDisplayName((city.name || '').trim());
            const normalizedCountry = city.country ? city.country.trim() : '';
            const cityKey = `${normalizedName}-${normalizedCountry}`;
            if (!uniqueCities.has(cityKey)) {
                const originalIndex = this.cities.findIndex(c =>
                    normalizeCityDisplayName((c.name || '').trim()) === normalizedName &&
                    (c.country ? c.country.trim() : '') === normalizedCountry &&
                    c.flightDate === city.flightDate
                );
                uniqueCities.set(cityKey, {
                    firstIndex: originalIndex,
                    city: { ...city, name: normalizedName },
                    displayOrder: cityDisplayOrder,
                    travelDate: city.flightDate
                });
                cityDisplayOrder++;
            }
        }

        const newKeys = Array.from(uniqueCities.keys());

        // Incrementally update a single container (desktop or mobile)
        const patchContainer = (container) => {
            if (!container) return;

            // Fast path: empty container — build all nodes once using DocumentFragment
            if (container.children.length === 0) {
                const frag = document.createDocumentFragment();
                newKeys.forEach((key, idx) => {
                    const data = uniqueCities.get(key);
                    const city = data.city;
                    const node = document.createElement('div');
                    node.className = 'city-item';
                    node.setAttribute('data-city-key', key);
                    node.setAttribute('data-city-index', data.firstIndex);
                    node.innerHTML = `
                        <div class="city-status">${idx + 1}</div>
                        <div class="city-info">
                            <div class="city-name"></div>
                            <div class="city-native"></div>
                            <div class="city-country"></div>
                        </div>
                    `;
                    node.querySelector('.city-name').textContent = window.translateCity ? window.translateCity(city.name || '') : (city.name || '');
                    {
                        const _raw = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[city.name] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(city.name)])) || '';
                        node.querySelector('.city-native').textContent = (_raw && _raw.trim() !== (city.name || '').trim()) ? _raw : '';
                    }
                    node.querySelector('.city-country').textContent = window.translateCountry ? window.translateCountry(city.country || '') : (city.country || '');
                    frag.appendChild(node);
                });
                container.appendChild(frag);
                return;
            }

            // Otherwise, walk through newKeys and keep/move/create nodes as required
            for (let i = 0; i < newKeys.length; i++) {
                const key = newKeys[i];
                const data = uniqueCities.get(key);
                const expectedKey = key;
                const existingAtPos = container.children[i];

                if (existingAtPos && existingAtPos.getAttribute('data-city-key') === expectedKey) {
                    // correct node at correct position — update minimal fields
                    const statusDiv = existingAtPos.querySelector('.city-status');
                    const nameEl = existingAtPos.querySelector('.city-name');
                    const nativeEl = existingAtPos.querySelector('.city-native');
                    const countryEl = existingAtPos.querySelector('.city-country');
                    if (statusDiv && statusDiv.textContent !== String(i + 1)) statusDiv.textContent = String(i + 1);
                    { const _tn = window.translateCity ? window.translateCity(data.city.name || '') : (data.city.name || ''); if (nameEl && nameEl.textContent !== _tn) nameEl.textContent = _tn; }
                    if (nativeEl) {
                        const _raw = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[data.city.name] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(data.city.name)])) || '';
                        const _display = (_raw && _raw.trim() !== (data.city.name || '').trim()) ? _raw : '';
                        if (nativeEl.textContent !== _display) nativeEl.textContent = _display;
                    }
                    if (countryEl) {
                        const _tc = window.translateCountry ? window.translateCountry(data.city.country || '') : (data.city.country || '');
                        if (countryEl.textContent !== _tc) countryEl.textContent = _tc;
                    }
                    existingAtPos.setAttribute('data-city-index', data.firstIndex);
                    continue;
                }

                // Try to find an existing node for this key elsewhere in container
                const found = container.querySelector(`[data-city-key="${expectedKey}"]`);
                if (found) {
                    // Move it into the correct position
                    container.insertBefore(found, existingAtPos || null);
                    // Update its content (status / text)
                    const statusDiv = found.querySelector('.city-status');
                    const nameEl = found.querySelector('.city-name');
                    const nativeEl = found.querySelector('.city-native');
                    const countryEl = found.querySelector('.city-country');
                    if (statusDiv) statusDiv.textContent = String(i + 1);
                    if (nameEl) nameEl.textContent = window.translateCity ? window.translateCity(data.city.name || '') : (data.city.name || '');
                    if (nativeEl) {
                        const _raw = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[data.city.name] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(data.city.name)])) || '';
                        nativeEl.textContent = (_raw && _raw.trim() !== (data.city.name || '').trim()) ? _raw : '';
                    }
                    if (countryEl) countryEl.textContent = window.translateCountry ? window.translateCountry(data.city.country || '') : (data.city.country || '');
                    found.setAttribute('data-city-index', data.firstIndex);
                    continue;
                }

                // Node does not exist — create and insert
                const _rawNativeForNode = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[data.city.name] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(data.city.name)])) || '';
                const nativeNameForNode = (_rawNativeForNode && _rawNativeForNode.trim() !== (data.city.name || '').trim()) ? _rawNativeForNode : '';
                const node = document.createElement('div');
                node.className = 'city-item';
                node.setAttribute('data-city-key', expectedKey);
                node.setAttribute('data-city-index', data.firstIndex);
                node.innerHTML = `
                    <div class="city-status">${i + 1}</div>
                    <div class="city-info">
                        <div class="city-name">${window.translateCity ? window.translateCity(data.city.name || '') : (data.city.name || '')}</div>
                        <div class="city-native">${nativeNameForNode}</div>
                        <div class="city-country">${window.translateCountry ? window.translateCountry(data.city.country || '') : (data.city.country || '')}</div>
                    </div>
                `;

                // Insert into correct position
                container.insertBefore(node, existingAtPos || null);

                // Small entrance animation to keep UX consistent
                node.style.opacity = '0';
                node.style.transform = 'translateY(8px)';
                requestAnimationFrame(() => {
                    node.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
                    node.style.opacity = '1';
                    node.style.transform = 'translateY(0)';
                });
            }

            // Remove any trailing nodes that are no longer needed
            while (container.children.length > newKeys.length) {
                container.removeChild(container.lastElementChild);
            }
        };

        // Patch both desktop and mobile containers incrementally
        patchContainer(cityListContainer);
        patchContainer(cityListMobileContainer);

        // Update statuses (visited / current) for existing DOM nodes — minimal work
        uniqueCities.forEach((cityData, cityKey) => {
            const desktopElement = cityListContainer ? cityListContainer.querySelector(`[data-city-key="${cityKey}"]`) : null;
            const mobileElement = cityListMobileContainer ? cityListMobileContainer.querySelector(`[data-city-key="${cityKey}"]`) : null;

            [desktopElement, mobileElement].forEach(cityElement => {
                if (!cityElement) return;
                const statusDiv = cityElement.querySelector('.city-status');

                // Reset classes
                cityElement.className = 'city-item';
                if (statusDiv) statusDiv.className = 'city-status';

                // Determine visited/current using same logic as before
                const isVisited = this.cities.some(c => {
                    const normalizedName = normalizeCityDisplayName((c.name || '').trim());
                    const normalizedCountry = c.country ? c.country.trim() : '';
                    const cityKeyToCheck = `${normalizedName}-${normalizedCountry}`;
                    return cityKeyToCheck === cityKey && c.visited;
                });

                const currentCity = this.cities[this.currentCityIndex];
                let isCurrent = false;
                if (currentCity) {
                    const normalizedCurrentName = normalizeCityDisplayName((currentCity.name || '').trim());
                    const normalizedCurrentCountry = currentCity.country ? currentCity.country.trim() : '';
                    const currentCityKey = `${normalizedCurrentName}-${normalizedCurrentCountry}`;
                    isCurrent = currentCityKey === cityKey;
                }

                if (isCurrent) {
                    cityElement.classList.add('current');
                    if (statusDiv) statusDiv.classList.add('current');
                    cityElement.setAttribute('data-city-index', this.currentCityIndex);
                } else if (isVisited) {
                    cityElement.classList.add('visited');
                    if (statusDiv) statusDiv.classList.add('visited');
                }
            });
        });

        // Ensure current city is visible
        this.scrollToCurrentCity();
    }
    
    scrollToCurrentCity() {
        const cityListContainer = document.getElementById('cityList');
        const cityListMobileContainer = document.getElementById('cityListMobile');
        
        // Scroll desktop list
        if (cityListContainer) {
            this.scrollCityListContainer(cityListContainer);
        }
        
        // Scroll mobile list
        if (cityListMobileContainer) {
            this.scrollCityListContainer(cityListMobileContainer);
        }
    }
    
    scrollCityListContainer(container) {
        const currentCityElement = container.querySelector(`[data-city-index="${this.currentCityIndex}"]`);
        
        if (currentCityElement && container) {
            // Get the position of the current city element
            const containerRect = container.getBoundingClientRect();
            const elementRect = currentCityElement.getBoundingClientRect();
            
            // Calculate if element is outside visible area (vertically)
            const elementTop = elementRect.top - containerRect.top + container.scrollTop;
            const elementBottom = elementTop + elementRect.height;
            const visibleTop = container.scrollTop;
            const visibleBottom = visibleTop + container.clientHeight;
            
            // Only scroll vertically if element is not fully visible
            if (elementTop < visibleTop || elementBottom > visibleBottom) {
                // Calculate center position
                const scrollTop = elementTop - (container.clientHeight / 2) + (elementRect.height / 2);
                
                // Smooth scroll only vertically
                container.scrollTo({
                    top: Math.max(0, scrollTop),
                    behavior: 'smooth'
                });
            }
        }
    }



    // ── Inflation helpers ───────────────────────────────────────────────────

    // Singapore CPI (All Items, 2019 = 100) annual averages.
    // Source: SingStat / MAS. 2025–2026 are estimates.
    _sgCPI = {
        2015: 95.8, 2016: 95.4, 2017: 96.5, 2018: 98.3,
        2019: 100.0, 2020: 99.2, 2021: 101.3, 2022: 105.9,
        2023: 110.4, 2024: 112.8, 2025: 114.5, 2026: 116.0
    };
    _CPI_2025 = 114.5;

    // Return cost adjusted to 2025 SGD. Returns null if year is unknown.
    _toReal2025(cost, date) {
        if (cost == null || !date) return null;
        const year = new Date(date).getFullYear();
        const cpi = this._sgCPI[year];
        if (!cpi) return null;
        return +(cost * (this._CPI_2025 / cpi)).toFixed(2);
    }

    // ── Leg efficiency chart ────────────────────────────────────────────────

    _mergedChartTooltip(context, chartType) {
        const { chart, tooltip } = context;
        const id = 'chartTooltipMerged';
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.classList.add('chart-tooltip');
            document.body.appendChild(el);
        }
        if (tooltip.opacity === 0) {
            el.classList.remove('active');
            this._clearChartRouteHighlight();
            // Clear active elements on both charts
            this._syncChartHighlight(null, chartType);
            this._hoverResume();
            return;
        }

        // Pause animation on chart hover
        this._hoverPause();

        const idx = tooltip.dataPoints?.[0]?.dataIndex;

        // Highlight the same index on the OTHER chart
        this._syncChartHighlight(idx, chartType);
        const tripName = (this._chartTripNames && idx != null) ? this._chartTripNames[idx] : '';

        // Gather data from BOTH charts at the same index
        const rows = [];

        if (this.legChart) {
            const _tl = window.i18n ? window.i18n.t : function(k){return k;};
            const cpk = this.legChart.data.datasets[0]?.data[idx];
            const co2 = this.legChart.data.datasets[1]?.data[idx];
            if (cpk != null) rows.push([_tl('sgdPerKm'), cpk.toFixed(3)]);
            if (co2 != null) rows.push([_tl('co2PerSgd'), (co2 / 1000).toFixed(3)]);
        }
        if (this.priceChart) {
            const _tp = window.i18n ? window.i18n.t : function(k){return k;};
            const nom = this.priceChart.data.datasets[0]?.data[idx];
            const real = this.priceChart.data.datasets[1]?.data[idx];
            if (nom != null) rows.push([_tp('nominal'), 'S$' + nom.toFixed(2)]);
            if (real != null) rows.push([_tp('real2025'), 'S$' + real.toFixed(2)]);
        }

        const d = this._chartDates?.[idx];
        const _locale = window.i18n && window.i18n.getLocale ? window.i18n.getLocale() : 'en-GB';
        const footerText = d ? new Date(d).toLocaleDateString(_locale, { month: 'short', year: 'numeric' }).toUpperCase() : '';

        const tableRows = rows.map(([label, val]) =>
            `<tr><td class="ct-label">${label}</td><td class="ct-value">${val}</td></tr>`
        ).join('');

        el.innerHTML =
            `<div class="ct-title">${tripName.toUpperCase()}</div>` +
            (rows.length ? `<table class="ct-table">${tableRows}</table>` : '') +
            (footerText ? `<div class="ct-footer">${footerText}</div>` : '');

        const canvasRect = chart.canvas.getBoundingClientRect();
        el.style.left = (canvasRect.left + tooltip.caretX + window.scrollX) + 'px';
        el.style.top = (canvasRect.top + tooltip.caretY - el.offsetHeight - 8 + window.scrollY) + 'px';
        el.classList.add('active');

        // Show route on map: highlight polyline + endpoint dots + zoom
        try {
            if (idx != null && this.cities && this.cities[idx] && this.cities[idx + 1]) {
                const from = this.cities[idx];
                const to = this.cities[idx + 1];

                // Only rebuild highlight if the hovered index changed
                if (this._chartHighlightIdx !== idx) {
                    this._clearChartRouteHighlight();
                    this._chartHighlightIdx = idx;

                    // Route highlight polyline
                    const path = this.createGreatCirclePath([from.lat, from.lng], [to.lat, to.lng], 60);
                    const segments = this.splitPathAtDateLine(path);
                    this._chartHighlightLines = segments.map(seg =>
                        L.polyline(seg, { color: '#ffee00', weight: 3, opacity: 0.95, interactive: false, className: 'route-highlight' }).addTo(this.map)
                    );

                    // Endpoint dots
                    this._chartHighlightDots = [from, to].map(c =>
                        L.circleMarker([c.lat, c.lng], { radius: 6, color: '#ffee00', fillColor: '#4CAF50', fillOpacity: 1, interactive: false }).addTo(this.map)
                    );

                    // Zoom to route — account for header (top) and city list (bottom)
                    const header = document.querySelector('.header');
                    const cityList = document.querySelector('.city-list-container');
                    const topPad = (header ? header.offsetHeight : 0) + 20;
                    const bottomPad = (cityList ? cityList.offsetHeight : 0) + 20;
                    const routeBounds = this._chartHighlightLines.reduce((b, line) => {
                        const lb = line.getBounds();
                        return b ? b.extend(lb) : lb;
                    }, null);
                    this.map.stop();
                    requestAnimationFrame(() => {
                        this.map.flyToBounds(routeBounds, { paddingTopLeft: [20, topPad], paddingBottomRight: [20, bottomPad], maxZoom: 9, duration: 0.6 });
                    });
                }
            }
        } catch (err) {}
    }

    // Remove chart-hover route highlight from map
    _clearChartRouteHighlight() {
        if (this._chartHighlightLines) {
            this._chartHighlightLines.forEach(l => { try { this.map.removeLayer(l); } catch (e) {} });
            this._chartHighlightLines = null;
        }
        if (this._chartHighlightDots) {
            this._chartHighlightDots.forEach(d => { try { this.map.removeLayer(d); } catch (e) {} });
            this._chartHighlightDots = null;
        }
        this._chartHighlightIdx = null;
    }

    // Highlight (or clear) the matching data point on the OTHER chart
    _syncChartHighlight(idx, sourceChartType) {
        const other = sourceChartType === 'leg' ? this.priceChart : this.legChart;
        if (!other) return;
        if (idx == null) {
            other.setActiveElements([]);
            other.tooltip.setActiveElements([]);
            other.update('none');
            return;
        }
        const dsCount = other.data.datasets.length;
        const elements = [];
        for (let d = 0; d < dsCount; d++) elements.push({ datasetIndex: d, index: idx });
        other.setActiveElements(elements);
        other.update('none');
    }

    initChart() {
        const _t = window.i18n ? window.i18n.t : function(k){return k;};
        const canvas = document.getElementById('legChart');
        if (!canvas || typeof Chart === 'undefined') return;
        this.legChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: _t('sgdPerKm'),
                        data: [],
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.7)',
                        yAxisID: 'y1',
                        tension: 0.35,
                        pointRadius: 1.5,
                        borderWidth: 0.5,
                        spanGaps: true
                    },
                    {
                        label: _t('co2PerSgd'),
                        data: [],
                        borderColor: '#FF4444',
                        backgroundColor: 'rgba(255, 68, 68, 0.7)',
                        yAxisID: 'y2',
                        tension: 0.35,
                        pointRadius: 1.5,
                        borderWidth: 0.5,
                        spanGaps: true
                    }
                ]
            },
            options: {
                animation: { duration: 600, easing: 'easeOutQuart' },
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        labels: { color: '#b6b6b6', font: { size: 11 }, boxHeight: 5, boxWidth: 5 }
                    },
                    tooltip: {
                        enabled: false,
                        external: (context) => this._mergedChartTooltip(context, 'leg')
                    }
                },
                scales: {
                    x: {
                        ticks: { display: false },
                        grid: { color: '#1e1e1e09' }
                        
                    },
                    y1: {
                        type: 'linear',
                        position: 'left',
                        ticks: { color: '#4CAF50', font: { size: 11 }, maxTicksLimit: 3 },
                        grid: { color: '#1e1e1e09' },
                        title: { display: true, text: '', color: '#4CAF50', font: { size: 8 } }
                    },
                    y2: {
                        type: 'linear',
                        position: 'right',
                        ticks: { color: '#FF6B35', font: { size: 11}, maxTicksLimit: 3, callback: (val) => `${(val / 1000).toFixed(1)}` },
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: '', color: '#FF6B35', font: { size: 8 } }
                    }
                }
            }
        });

        // initialize price chart (simple single‑line showing SGD per leg)
        const priceCanvas = document.getElementById('priceChart');
        if (priceCanvas && typeof Chart !== 'undefined') {
            this.priceChart = new Chart(priceCanvas.getContext('2d'), {
                type: 'line',
                data: {
                    labels: [],
                    datasets: [{
                        label: _t('nominal'),
                        data: [],
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.7)',
                        tension: 0.35,
                        pointRadius: 1.5,
                        borderWidth: 0.5,
                        spanGaps: true
                    }, {
                        label: _t('real2025'),
                        data: [],
                        borderColor: '#FF4444',
                        backgroundColor: 'rgba(255, 68, 68, 0.7)',
                        tension: 0.35,
                        pointRadius: 1.5,
                        borderWidth: 0.5,
                        spanGaps: true
                    }]
                },
                options: {
                    animation: { duration: 600, easing: 'easeOutQuart' },
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { labels: { color: '#b6b6b6', font: { size: 11 }, boxWidth: 5, boxHeight: 5 } },
                        tooltip: {
                            enabled: false,
                            external: (context) => this._mergedChartTooltip(context, 'price')
                        }
                    },
                    scales: {
                        x: {
                            ticks: { display: false },
                            grid: { color: '#1e1e1e09' }
                        },
                        y: {
                            ticks: { color: '#4CAF50', font: { size: 11 }, maxTicksLimit: 3 },
                            grid: { drawOnChartArea: false }
                        }
                    }
                }
            });
        }

        // Wire up filter buttons; disable year buttons initially until enough data is animated
        document.querySelectorAll('.chart-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => this.filterChart(btn.dataset.period));
            if (btn.dataset.period !== 'all') btn.disabled = true;
        });

        // Manual drag-to-pan on X axis (applies to both charts)
        const cvs = [canvas];
        if (priceCanvas) cvs.push(priceCanvas);
        let dragStartX = null, dragStartMin = null, dragStartMax = null;

        const onMouseDown = (e) => {
            if (e.button !== 0) return;
            const cv = e.currentTarget;
            dragStartX = e.clientX;
            const total = this.legChart.data.labels.length;
            dragStartMin = (this._panMin != null) ? this._panMin : (this.legChart.options.scales.x.min ?? 0);
            dragStartMax = (this._panMax != null) ? this._panMax : (this.legChart.options.scales.x.max ?? Math.max(0, total - 1));
            cv.style.cursor = 'grabbing';
        };
        const onMouseMove = (e) => {
            if (dragStartX === null) return;
            const cv = e.currentTarget;
            const total = this.legChart.data.labels.length;
            if (!total) return;
            const range = dragStartMax - dragStartMin;
            const pxPerIdx = this.legChart.chartArea.width / range;
            const shift = (dragStartX - e.clientX) / pxPerIdx;
            const newMin = Math.max(0, dragStartMin + shift);
            const newMax = Math.min(total - 1, newMin + range);
            this._panMin = newMax - range; // persist pan position
            this._panMax = newMax;
            this._applyYBoundsToScales();
            if (this.legChart) {
                this.legChart.options.scales.x.min = this._panMin;
                this.legChart.options.scales.x.max = this._panMax;
                this.legChart.update('none');
            }
            if (this.priceChart) {
                this.priceChart.options.scales.x.min = this._panMin;
                this.priceChart.options.scales.x.max = this._panMax;
                this.priceChart.update('none');
            }
            this._updateScrollbar();
        };
        const endDragFn = (e) => { dragStartX = null; e.currentTarget.style.cursor = 'grab'; };
        const onWheel = (e) => {
            e.preventDefault();
            const total = this.legChart.data.labels.length;
            if (!total) return;
            const currentMin = (this._panMin != null) ? this._panMin : (this.legChart.options.scales.x.min ?? 0);
            const currentMax = (this._panMax != null) ? this._panMax : (this.legChart.options.scales.x.max ?? total - 1);
            const windowRange = currentMax - currentMin;
            if (windowRange <= 0 || windowRange >= total - 1) return;
            // Use whichever axis has the larger movement so both vertical
            // scroll-wheel and horizontal touchpad swipes pan the chart.
            let delta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
            if (e.deltaMode === 1) delta *= 20;
            else if (e.deltaMode === 2) delta *= 400;
            const chartWidth = (this.legChart.chartArea && this.legChart.chartArea.width) || 300;
            const shift = (delta / chartWidth) * windowRange;
            const newMin = Math.max(0, currentMin + shift);
            const newMax = Math.min(total - 1, newMin + windowRange);
            this._panMin = newMax - windowRange;
            this._panMax = newMax;
            this._applyYBoundsToScales();
            if (this.legChart) {
                this.legChart.options.scales.x.min = this._panMin;
                this.legChart.options.scales.x.max = this._panMax;
                this.legChart.update('none');
            }
            if (this.priceChart) {
                this.priceChart.options.scales.x.min = this._panMin;
                this.priceChart.options.scales.x.max = this._panMax;
                this.priceChart.update('none');
            }
            this._updateScrollbar();
        };

        // Touch drag-to-pan (mirrors mouse drag logic above)
        const onTouchStart = (e) => {
            if (e.touches.length !== 1) return;
            const touch = e.touches[0];
            dragStartX = touch.clientX;
            const total = this.legChart.data.labels.length;
            dragStartMin = (this._panMin != null) ? this._panMin : (this.legChart.options.scales.x.min ?? 0);
            dragStartMax = (this._panMax != null) ? this._panMax : (this.legChart.options.scales.x.max ?? Math.max(0, total - 1));
        };
        const onTouchMove = (e) => {
            if (dragStartX === null || e.touches.length !== 1) return;
            const total = this.legChart.data.labels.length;
            if (!total) return;
            const range = dragStartMax - dragStartMin;
            const pxPerIdx = this.legChart.chartArea.width / range;
            const shift = (dragStartX - e.touches[0].clientX) / pxPerIdx;
            const newMin = Math.max(0, dragStartMin + shift);
            const newMax = Math.min(total - 1, newMin + range);
            this._panMin = newMax - range;
            this._panMax = newMax;
            this._applyYBoundsToScales();
            if (this.legChart) {
                this.legChart.options.scales.x.min = this._panMin;
                this.legChart.options.scales.x.max = this._panMax;
                this.legChart.update('none');
            }
            if (this.priceChart) {
                this.priceChart.options.scales.x.min = this._panMin;
                this.priceChart.options.scales.x.max = this._panMax;
                this.priceChart.update('none');
            }
            this._updateScrollbar();
            e.preventDefault(); // prevent page scroll while panning chart
        };
        const onTouchEnd = () => { dragStartX = null; };

        cvs.forEach(cv => {
            cv.style.cursor = 'grab';
            cv.addEventListener('mousedown', onMouseDown);
            cv.addEventListener('mousemove', onMouseMove);
            cv.addEventListener('mouseup', endDragFn);
            cv.addEventListener('mouseleave', endDragFn);
            cv.addEventListener('wheel', onWheel, { passive: false });
            cv.addEventListener('touchstart', onTouchStart, { passive: true });
            cv.addEventListener('touchmove', onTouchMove, { passive: false });
            cv.addEventListener('touchend', onTouchEnd);
        });

        // Scrollbar thumb drag and track click
        const scrollTrack = document.getElementById('chartScrollbarTrack');
        const scrollThumb = document.getElementById('chartScrollbarThumb');
        if (scrollTrack && scrollThumb) {
            let sbDragStartX = null, sbDragStartLeft = null;

            scrollThumb.addEventListener('mousedown', (e) => {
                e.preventDefault();
                sbDragStartX = e.clientX;
                sbDragStartLeft = parseFloat(scrollThumb.style.left) || 0;
                scrollThumb.classList.add('dragging');
            });

            document.addEventListener('mousemove', (e) => {
                if (sbDragStartX === null) return;
                const total = this.legChart.data.labels.length;
                if (!total) return;
                const scMin = this.legChart.options.scales.x.min ?? 0;
                const scMax = this.legChart.options.scales.x.max ?? (total - 1);
                const visible = scMax - scMin + 1;
                const thumbWidth = parseFloat(scrollThumb.style.width) || 20;
                const maxThumbLeft = scrollTrack.offsetWidth - thumbWidth;
                const newLeft = Math.max(0, Math.min(maxThumbLeft, sbDragStartLeft + (e.clientX - sbDragStartX)));
                const newMin = maxThumbLeft > 0 ? (newLeft / maxThumbLeft) * (total - visible) : 0;
                this._panMin = newMin;
                this._panMax = newMin + visible - 1;
                this._applyYBoundsToScales();
                if (this.legChart) {
                    this.legChart.options.scales.x.min = this._panMin;
                    this.legChart.options.scales.x.max = this._panMax;
                    this.legChart.update('none');
                }
                if (this.priceChart) {
                    this.priceChart.options.scales.x.min = this._panMin;
                    this.priceChart.options.scales.x.max = this._panMax;
                    this.priceChart.update('none');
                }
                this._updateScrollbar();
            });

            document.addEventListener('mouseup', () => {
                if (sbDragStartX !== null) { sbDragStartX = null; scrollThumb.classList.remove('dragging'); }
            });

            scrollTrack.addEventListener('click', (e) => {
                if (e.target === scrollThumb) return;
                const total = this.legChart.data.labels.length;
                if (!total) return;
                const scMin = this.legChart.options.scales.x.min ?? 0;
                const scMax = this.legChart.options.scales.x.max ?? (total - 1);
                const visible = scMax - scMin + 1;
                const thumbWidth = parseFloat(scrollThumb.style.width) || 20;
                const maxThumbLeft = scrollTrack.offsetWidth - thumbWidth;
                const clickX = e.clientX - scrollTrack.getBoundingClientRect().left - thumbWidth / 2;
                const newLeft = Math.max(0, Math.min(maxThumbLeft, clickX));
                const newMin = maxThumbLeft > 0 ? (newLeft / maxThumbLeft) * (total - visible) : 0;
                this._panMin = newMin;
                this._panMax = newMin + visible - 1;
                this._applyYBoundsToScales();
                if (this.legChart) {
                    this.legChart.options.scales.x.min = this._panMin;
                    this.legChart.options.scales.x.max = this._panMax;
                    this.legChart.update('none');
                }
                if (this.priceChart) {
                    this.priceChart.options.scales.x.min = this._panMin;
                    this.priceChart.options.scales.x.max = this._panMax;
                    this.priceChart.update('none');
                }
                this._updateScrollbar();
            });
        }
    }

    _getDatasetStartDate() {
        if (this._datasetStartDate) return this._datasetStartDate;
        if (this.cities && this.cities.length > 1) {
            for (let i = 1; i < this.cities.length; i++) {
                const f = this.cities[i].originalFlight;
                if (f && f.date) {
                    const d = new Date(f.date);
                    if (!isNaN(d.getTime())) {
                        this._datasetStartDate = d;
                        return d;
                    }
                }
            }
        }
        return new Date();
    }

    // Only sets scale options — caller is responsible for calling chart.update().
    _setXWindowOpts(resetPan = false) {
        // handle both charts – legChart is primary but priceChart should mirror
        const chart = this.legChart || this.priceChart;
        if (!chart) return;
        const total = chart.data.labels.length;
        if (!total) return;

        if (!this.chartFilter || this.chartFilter === 'all') {
            this._panMin = undefined;
            this._panMax = undefined;
            if (this.legChart) {
                this.legChart.options.scales.x.min = 0;
                this.legChart.options.scales.x.max = total - 1;
            }
            if (this.priceChart) {
                this.priceChart.options.scales.x.min = 0;
                this.priceChart.options.scales.x.max = total - 1;
            }
        } else {
            const years = parseInt(this.chartFilter);
            const cutoff = new Date(this._getDatasetStartDate());
            cutoff.setFullYear(cutoff.getFullYear() + years);
            const dates = this._chartDates || [];
            let windowSize = 0;
            for (let i = 0; i < dates.length; i++) {
                if (dates[i] && new Date(dates[i]) <= cutoff) windowSize = i;
            }
            if (resetPan) this._panMin = 0;
            const min = Math.max(0, Math.min(this._panMin ?? 0, total - 1 - windowSize));
            const max = Math.min(total - 1, min + windowSize);
            this._panMin = min;
            this._panMax = max;
            if (this.legChart) {
                this.legChart.options.scales.x.min = min;
                this.legChart.options.scales.x.max = max;
            }
            if (this.priceChart) {
                this.priceChart.options.scales.x.min = min;
                this.priceChart.options.scales.x.max = max;
            }
        }
    }

    _applyXWindow(resetPan = false) {
        this._setXWindowOpts(resetPan);
        this._applyYBoundsToScales();
        if (this.legChart) { this.legChart.update('none'); this._updateScrollbar(); }
        if (this.priceChart) { this.priceChart.update('none'); }
    }

    filterChart(period) {
        this.chartFilter = period;
        document.querySelectorAll('.chart-filter-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.period === period);
        });
        if (this.legChart) this.legChart.stop();
        if (this.priceChart) this.priceChart.stop();
        this._setXWindowOpts(true);
        this._applyYBoundsToScales();
        if (this.legChart) { this.legChart.update({ duration: 400, easing: 'easeOutCubic' }); this._updateScrollbar(); }
        if (this.priceChart) { this.priceChart.update({ duration: 400, easing: 'easeOutCubic' }); }
    }

    _updateScrollbar() {
        const track = document.getElementById('chartScrollbarTrack');
        const thumb = document.getElementById('chartScrollbarThumb');
        if (!track || !thumb || !this.legChart) return;

        const total = this.legChart.data.labels.length;
        if (!total) { track.style.display = 'none'; return; }

        const scMin = this.legChart.options.scales.x.min ?? 0;
        const scMax = this.legChart.options.scales.x.max ?? (total - 1);
        const visible = scMax - scMin + 1;

        // Hide scrollbar when all data is already visible
        if (visible >= total) { track.style.display = 'none'; return; }
        track.style.display = 'block';

        const trackWidth = track.offsetWidth;
        const thumbWidth = Math.max(16, (visible / total) * trackWidth);
        const maxThumbLeft = trackWidth - thumbWidth;
        const thumbLeft = (total - visible) > 0 ? (scMin / (total - visible)) * maxThumbLeft : 0;

        thumb.style.width = thumbWidth + 'px';
        thumb.style.left = Math.max(0, Math.min(maxThumbLeft, thumbLeft)) + 'px';
    }

    _updateFilterButtons() {
        const dates = this._chartDates;
        const startDate = this._getDatasetStartDate();
        if (!dates || !dates.length || !startDate || isNaN(startDate.getTime())) {
            document.querySelectorAll('.chart-filter-btn[data-period]').forEach(btn => {
                if (btn.dataset.period !== 'all') btn.disabled = true;
            });
            return;
        }

        // Find the latest non-null date currently in the chart
        let latestDate = null;
        for (let i = dates.length - 1; i >= 0; i--) {
            if (dates[i]) {
                const d = new Date(dates[i]);
                if (!isNaN(d.getTime())) { latestDate = d; break; }
            }
        }
        if (!latestDate) return;

        const yearsCovered = (latestDate.getTime() - startDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);

        document.querySelectorAll('.chart-filter-btn[data-period]').forEach(btn => {
            const period = btn.dataset.period;
            if (period === 'all') return;
            btn.disabled = yearsCovered < parseInt(period);
        });

        // If the active filter is now disabled (e.g. scrubbed backward), fall back to 'all'
        if (this.chartFilter && this.chartFilter !== 'all') {
            const activeBtn = document.querySelector(`.chart-filter-btn[data-period="${this.chartFilter}"]`);
            if (activeBtn && activeBtn.disabled) this.filterChart('all');
        }
    }

    // Recompute global Y bounds from the full dataset and store in _globalYBounds.
    // Only call _applyYBoundsToScales() explicitly for 'none' updates (pan/filter/scrub)
    // so animated updates (addChartPoint) don't conflict with line-extension animation.
    _updateYAxisBounds() {
        if (this.legChart) {
            const d0 = this.legChart.data.datasets[0].data.filter(v => v != null);
            const d1 = this.legChart.data.datasets[1].data.filter(v => v != null);
            if (d0.length) {
                const mn = Math.min(...d0), mx = Math.max(...d0);
                const pad = (mx - mn) * 0.15 || mx * 0.15 || 0.01;
                this._globalYBounds.y1Min = Math.max(0, mn - pad);
                this._globalYBounds.y1Max = mx + pad;
            }
            if (d1.length) {
                const mn = Math.min(...d1), mx = Math.max(...d1);
                const pad = (mx - mn) * 0.15 || mx * 0.15 || 0.01;
                this._globalYBounds.y2Min = Math.max(0, mn - pad);
                this._globalYBounds.y2Max = mx + pad;
            }
        }
        if (this.priceChart) {
            const allVals = [
                ...this.priceChart.data.datasets[0].data,
                ...this.priceChart.data.datasets[1].data
            ].filter(v => v != null);
            if (allVals.length) {
                const mn = Math.min(...allVals), mx = Math.max(...allVals);
                const pad = (mx - mn) * 0.15 || mx * 0.15 || 0.01;
                this._globalYBounds.yMin = Math.max(0, mn - pad);
                this._globalYBounds.yMax = mx + pad;
            }
        }
    }

    // Write _globalYBounds into chart scale options. Safe to call before update('none').
    _applyYBoundsToScales() {
        if (this.legChart) {
            if (this._globalYBounds.y1Min != null) {
                this.legChart.options.scales.y1.min = this._globalYBounds.y1Min;
                this.legChart.options.scales.y1.max = this._globalYBounds.y1Max;
            }
            if (this._globalYBounds.y2Min != null) {
                this.legChart.options.scales.y2.min = this._globalYBounds.y2Min;
                this.legChart.options.scales.y2.max = this._globalYBounds.y2Max;
            }
        }
        if (this.priceChart) {
            if (this._globalYBounds.yMin != null) {
                this.priceChart.options.scales.y.min = this._globalYBounds.yMin;
                this.priceChart.options.scales.y.max = this._globalYBounds.yMax;
            }
        }
    }

    addChartPoint(label, costPerKm, co2PerSGD, date, tripName, cost = null) {
        // update efficiency chart
        if (this.legChart) {
            this.legChart.data.labels.push(label);
            this.legChart.data.datasets[0].data.push(costPerKm != null ? +costPerKm.toFixed(4) : null);
            this.legChart.data.datasets[1].data.push(co2PerSGD != null ? +co2PerSGD.toFixed(2) : null);
        }
        // update price chart
        if (this.priceChart) {
            this.priceChart.data.labels.push(label);
            this.priceChart.data.datasets[0].data.push(cost != null ? +cost.toFixed(2) : null);
            this.priceChart.data.datasets[1].data.push(this._toReal2025(cost, date));
        }
        if (!this._chartDates) this._chartDates = [];
        if (!this._chartTripNames) this._chartTripNames = [];
        this._chartDates.push(date || null);
        this._chartTripNames.push(tripName || label);
        this._setXWindowOpts();
        // If the new point falls past the right edge of the window, slide forward
        const newIdx = (this.legChart || this.priceChart).data.labels.length - 1;
        const xMax = this.legChart ? this.legChart.options.scales.x.max : undefined;
        if (xMax !== undefined && newIdx > xMax) {
            const windowSize = xMax - (this.legChart.options.scales.x.min ?? 0);
            this._panMin = Math.max(0, newIdx - windowSize);
            this._setXWindowOpts();
        }
        this._updateYAxisBounds();
        if (this.legChart) this.legChart.update(); // animated line extension
        if (this.priceChart) this.priceChart.update();
        this._updateScrollbar();
        this._updateFilterButtons();
    }

    rebuildChart() {
        if (!this.legChart) return;
        this.legChart.stop();
        const labels = [], costData = [], co2Data = [], priceData = [], dates = [], tripNames = [];
        for (let i = 1; i < this.cities.length && i <= this.currentCityIndex; i++) {
            const city = this.cities[i];
            const d = city.legChartData;
            if (d) {
                labels.push(d.date ? new Date(d.date).getFullYear().toString() : '');
                costData.push(d.costPerKm != null ? +d.costPerKm.toFixed(4) : null);
                co2Data.push(d.co2PerSGD != null ? +d.co2PerSGD.toFixed(2) : null);
                priceData.push(d.cost != null ? +d.cost.toFixed(2) : null);
                dates.push(d.date || null);
                tripNames.push(`${this.cities[i - 1].name} → ${city.name}`);
            }
        }
        this.legChart.data.labels = labels;
        this.legChart.data.datasets[0].data = costData;
        this.legChart.data.datasets[1].data = co2Data;
        if (this.priceChart) {
            this.priceChart.data.labels = labels.slice();
            this.priceChart.data.datasets[0].data = priceData;
            this.priceChart.data.datasets[1].data = priceData.map((v, i) => this._toReal2025(v, dates[i]));
        }
        this._chartDates = dates;
        this._chartTripNames = tripNames;
        this._updateYAxisBounds();
        this._applyXWindow();
        this._updateFilterButtons();
    }

    // ────────────────────────────────────────────────────────────────────────

    // Public method to add cities programmatically
    addCityFromData(name, country, lat, lng) {
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            console.error('Latitude and longitude must be numbers');
            return false;
        }

        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
            console.error('Invalid coordinates');
            return false;
        }

        this.addCity({ name, country, lat, lng });
        return true;
    }

    exportFlightData() {
        // Create comprehensive export data
        const exportData = {
            metadata: {
                exportDate: new Date().toISOString(),
                totalCities: this.cities.length,
                totalFlights: Math.max(0, this.cities.length - 1),
                exportedBy: "Flight Journey Visualizer"
            },
            statistics: {
                totalDistance: {
                    km: Math.round(this.totalDistance),
                    miles: Math.round(this.totalDistance * 0.621371)
                },
                totalTime: {
                    hours: Math.round(this.totalTime * 10) / 10,
                    days: Math.round((this.totalTime / 24) * 10) / 10
                },
                co2Emissions: {
                    kg: Math.round(this.totalCO2),
                    tons: Math.round((this.totalCO2 / 1000) * 100) / 100
                },
                costs: {
                    SGD: Math.round(this.totalCostSGD),
                    USD: Math.round(this.totalCostSGD * (this.exchangeRates.SGD_TO_USD || 0.787))
                }
            },
            cities: this.cities.map((city, index) => ({
                index: index + 1,
                name: city.name,
                country: city.country,
                coordinates: {
                    latitude: city.lat,
                    longitude: city.lng
                },
                airportCode: city.airportCode || null,
                flightDate: city.flightDate || null,
                visited: city.visited || false
            })),
            flightRoutes: this.cities.slice(1).map((city, index) => {
                const fromCity = this.cities[index];
                const toCity = city;
                const distance = this.calculateDistance(fromCity.lat, fromCity.lng, toCity.lat, toCity.lng);
                
                return {
                    flightNumber: index + 1,
                    from: {
                        city: fromCity.name,
                        country: fromCity.country,
                        coordinates: [fromCity.lat, fromCity.lng],
                        airportCode: fromCity.airportCode
                    },
                    to: {
                        city: toCity.name,
                        country: toCity.country,
                        coordinates: [toCity.lat, toCity.lng],
                        airportCode: toCity.airportCode
                    },
                    flightDate: toCity.flightDate,
                    distance: {
                        km: Math.round(distance),
                        miles: Math.round(distance * 0.621371)
                    },
                    estimatedTime: {
                        hours: Math.round((distance / 900) * 10) / 10
                    },
                    estimatedCO2: {
                        kg: Math.round(this.calculateEmissions(distance, toCity.originalFlight))
                    },
                    cost: (() => {
                        // Use actual cost from CSV if available, otherwise fall back to calculation
                        if (toCity.originalFlight && toCity.originalFlight.costSGD && toCity.originalFlight.costSGD > 0) {
                            const actualCostUSD = toCity.originalFlight.costSGD * (this.exchangeRates.SGD_TO_USD || 0.787);
                            return {
                                USD: Math.round(actualCostUSD),
                                SGD: Math.round(toCity.originalFlight.costSGD),
                                source: "actual_csv_data"
                            };
                        } else {
                            const estimatedCostUSD = distance * 0.25;
                            return {
                                USD: Math.round(estimatedCostUSD),
                                SGD: Math.round(estimatedCostUSD * (this.exchangeRates.USD_TO_SGD || 1.27)),
                                source: "calculated_estimate"
                            };
                        }
                    })()
                };
            })
        };

        // Create and download JSON file
        const jsonString = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `flight-journey-data-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        console.log('Flight data exported successfully');
        return exportData;
    }

    // Public method to clear all cities
    clearCities() {
        this.isAnimating = false;
        this.currentCityIndex = 0;
        this.cities = [];
        this.cityMarkers.forEach(item => {
            this.map.removeLayer(item.marker);
        });
        this.cityMarkers = [];
        
        // Remove flight dot and paths
        if (this.flightDot && this.map.hasLayer(this.flightDot)) {
            this.map.removeLayer(this.flightDot);
        }
        
        this.visitedPaths.forEach(path => {
            if (this.map.hasLayer(path)) {
                this.map.removeLayer(path);
            }
        });
        this.visitedPaths = [];
        
        document.getElementById('progressFill').style.width = '0%';
    }

    // Calculate distance between two points using Haversine formula
    calculateDistance(lat1, lng1, lat2, lng2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = 
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // Calculate CO2 emissions based on transportation mode
    calculateEmissions(distanceKm, journey) {
        if (!journey) {
            // Default to flight if no journey data
            return distanceKm * 0.25; // kg CO2 per km for flights
        }

        const transportMode = journey.mode || journey.type || 'flight';
        const mode = transportMode.toLowerCase();

        // CO2 emission factors (kg CO2 per km)
        const emissionFactors = {
            'flight': 0.25,      // Commercial flight
            'plane': 0.25,       // Alternative flight term
            'airplane': 0.25,    // Alternative flight term
            'car': 0.12,         // Gasoline car
            'automobile': 0.12,  // Alternative car term
            'train': 0.04,       // Electric/diesel train
            'rail': 0.04,        // Alternative train term
            'railway': 0.04,     // Alternative train term
            'bus': 0.08,         // Intercity bus
            'coach': 0.08,       // Alternative bus term
            'ferry': 0.15,       // Ferry/boat
            'boat': 0.15,        // Alternative ferry term
            'ship': 0.15,        // Alternative ferry term
            'metro': 0.03,       // Subway/metro
            'subway': 0.03,      // Alternative metro term
            'tram': 0.03,        // Tram/streetcar
            'walk': 0.01,           // Walking
            'walking': 0.01,        // Alternative walking term
            'bike': 0.02,           // Bicycle
            'bicycle': 0.02,        // Alternative bicycle term
            'scooter': 0.02,     // Electric scooter
            'motorcycle': 0.09   // Motorcycle
        };

        // Get emission factor, default to car if unknown mode
        const factor = emissionFactors[mode] || emissionFactors['car'];
        
        console.log(`Emission calculation: ${distanceKm.toFixed(1)}km × ${factor} kg/km = ${(distanceKm * factor).toFixed(2)}kg CO2 (mode: ${mode})`);
        
        return distanceKm * factor;
    }

    // Update statistics display
    updateStatistics() {
        // Calculate journeys and cities up to current index (not total)
        const currentJourneys = Math.max(0, this.currentCityIndex); // Number of journeys completed
        
        // Count unique cities visited up to current index using same normalization and country deduping as city list
        const visitedCities = this.cities.slice(0, Math.min(this.currentCityIndex + 1, this.cities.length));
        const uniqueCityKeys = new Set();
        visitedCities.forEach(city => {
            const normalizedName = this.normalizeCityDisplayName(city.name ? city.name.trim() : city.name);
            const normalizedCountry = city.country ? city.country.trim() : '';
            const cityKey = `${normalizedName}-${normalizedCountry}`;
            uniqueCityKeys.add(cityKey);
        });
        const citiesVisited = uniqueCityKeys.size;

        const currentJourneyIndex = this.currentCityIndex;
        
        // Update DOM elements
        const totalFlightsEl = document.getElementById('totalFlights');
        const citiesVisitedEl = document.getElementById('citiesVisited');
        const totalDistanceEl = document.getElementById('totalDistance');
        const totalTimeEl = document.getElementById('totalTime');
        const co2EmissionEl = document.getElementById('co2Emission');
        const totalCostUSDEl = document.getElementById('totalCostUSD');
        const totalCostSGDEl = document.getElementById('totalCostSGD');
        const currentFlightEl = document.getElementById('currentFlight');
        
        if (totalFlightsEl) this.animateNumber(totalFlightsEl, currentJourneys, 600);
        if (citiesVisitedEl) this.animateNumber(citiesVisitedEl, citiesVisited, 600);
        if (totalDistanceEl) {
            if (this.totalDistance > 0) {
                const distanceKm = Math.round(this.totalDistance);
                const earthCircumference = 40075; // Earth's circumference in km
                const moonDistance = 384400; // Average distance to moon in km
                const earthTimes = (distanceKm / earthCircumference);
                const moonTimes = (distanceKm / moonDistance);
                
                let metaphor = '';
                if (moonTimes >= 1) {
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${moonTimes.toFixed(2)}x ${window.i18n ? window.i18n.t('toTheMoon') : 'To the Moon'}</span>`;
                } else if (moonTimes >= 0.1) {
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${(moonTimes * 100).toFixed(0)}% ${window.i18n ? window.i18n.t('toTheMoon') : 'To the Moon'}</span>`;
                } else if (earthTimes >= 1) {
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${earthTimes.toFixed(1)}x ${window.i18n ? window.i18n.t('aroundEarth') : 'Around Earth'}</span>`;
                } else if (earthTimes >= 0.1) {
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${(earthTimes * 100).toFixed(0)}% ${window.i18n ? window.i18n.t('aroundEarth') : 'Around Earth'}</span>`;
                }
                
                this.animateNumber(totalDistanceEl, distanceKm, 800, (val) => `${Math.round(val).toLocaleString()} km ${metaphor}`);
            } else {
                totalDistanceEl.textContent = '-';
            }
        }
        if (totalTimeEl) {
            if (this.totalTime > 0) {
                const totalMinutes = Math.round(this.totalTime * 60);
                const totalHours = this.totalTime;
                const totalDays = totalHours / 24;
                const totalWeeks = totalDays / 7;
                
                let timeMetaphor = '';
                if (totalWeeks >= 1) {
                    timeMetaphor = `<br><span style="font-size: 0.65em; font-weight: 900; color: #4CAF50;">${totalWeeks.toFixed(1)} ${window.i18n ? window.i18n.t('weeks') : 'Weeks'}</span>`;
                } else if (totalDays >= 1) {
                    timeMetaphor = `<br><span style="font-size: 0.65em; font-weight: 900; color: #4CAF50;">${totalDays.toFixed(1)} ${window.i18n ? window.i18n.t('daysUnit') : 'Days'}</span>`;
                }
                
                this.animateNumber(totalTimeEl, totalMinutes, 700, (val) => {
                    const minutes = Math.round(val);
                    const hours = Math.floor(minutes / 60);
                    const remainingMinutes = minutes % 60;
                    if (hours > 0) {
                        return `${hours}h ${remainingMinutes}m ${timeMetaphor}`;
                    } else {
                        return `${remainingMinutes}m ${timeMetaphor}`;
                    }
                });
            } else {
                totalTimeEl.textContent = '-';
            }
        }
        if (co2EmissionEl) {
            if (this.totalCO2 > 0) {
                const co2Kg = this.totalCO2;
                const co2Tons = co2Kg / 1000;
                
                // CO2 comparisons (in tons)
                // Laptop production: ~0.3 tons CO2
                // Motorcycle year: ~2.5 tons CO2
                // Average person emits: ~4 tons CO2 per year globally
                // Average car emits: ~4.6 tons CO2 per year
                // Average home emits: ~7.5 tons CO2 per year
                // Small town (10,000 people): ~40,000 tons CO2 per year
                const laptopsEquivalent = co2Tons / 0.3;
                const motorcyclesEquivalent = co2Tons / 2.5;
                const personYears = co2Tons / 4;
                const carsEquivalent = co2Tons / 4.6;
                const homesEquivalent = co2Tons / 7.5;
                const smallTownYears = co2Tons / 40000;
                
                const _t = window.i18n ? window.i18n.t : function(k){return k;};
                let co2Metaphor = '';
                
                // Tiered comparisons - each shows ~2x to ~10x range
                if (smallTownYears >= 0.00225) {
                    // 90+ tons: Small town
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${(smallTownYears * 100).toFixed(2)}% ${_t('annualTownEmission')}</span>`;
                }
                else if (homesEquivalent >= 3) {
                    // 22.5+ tons: Home (3x → 12x at 90)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${homesEquivalent.toFixed(1)}x ${_t('annualHouseholdEmission')}</span>`;
                }
                else if (carsEquivalent >= 3) {
                    // 13.8+ tons: Car (3x → 4.9x at 22.5)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${carsEquivalent.toFixed(1)}x ${_t('annualCarEmission')}</span>`;
                }
                else if (personYears >= 2) {
                    // 8+ tons: Per capita (2x → 3.45x at 13.8)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${personYears.toFixed(1)}x ${_t('annualGlobalPerCapitaEmission')}</span>`;
                }
                else if (motorcyclesEquivalent >= 2) {
                    // 5+ tons: Motorcycle (2x → 3.2x at 8)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${motorcyclesEquivalent.toFixed(1)}x ${_t('annualMotorcycleEmission')}</span>`;
                }
                else if (laptopsEquivalent >= 2) {
                    // 0.6+ tons: Laptops (2x → 16.7x at 5)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${laptopsEquivalent.toFixed(0)} ${_t('laptopsProductionEmission')}</span>`;
                }
                
                this.animateNumber(co2EmissionEl, co2Kg, 750, (val) => {
                    if (val >= 1000) {
                        return `${(val / 1000).toFixed(1)} ${_t('tonsCO2')} ${co2Metaphor}`;
                    } else {
                        return `${Math.round(val)} ${_t('kgCO2')} ${co2Metaphor}`;
                    }
                });
            } else {
                co2EmissionEl.textContent = '-';
            }
        }
        
        // Separate USD and SGD cost displays
        if (totalCostUSDEl) {
            if (this.totalCostSGD > 0) {
                const totalCostUSD = this.totalCostSGD * (this.exchangeRates.SGD_TO_USD || 0.787);
                this.animateNumber(totalCostUSDEl, totalCostUSD, 800, (val) => `US$${Math.round(val).toLocaleString()}`);
            } else {
                totalCostUSDEl.textContent = '-';
            }
        }
        
        if (totalCostSGDEl) {
            if (this.totalCostSGD > 0) {
                this.animateNumber(totalCostSGDEl, this.totalCostSGD, 800, (val) => `S$${Math.round(val).toLocaleString()}`);
            } else {
                totalCostSGDEl.textContent = '-';
            }
        }
        if (currentFlightEl) {
            if (currentJourneyIndex >= this.cities.length) {
                this.animateTextTransition(currentFlightEl, window.i18n ? window.i18n.t('complete') : 'Complete');
            } else if (currentJourneyIndex > 0 && currentJourneyIndex < this.cities.length) {
                // Find the nearest journey with different city names
                let displayIndex = currentJourneyIndex;
                let fromCity = this.cities[displayIndex - 1];
                let toCity = this.cities[displayIndex];
                
                // Search forward for a journey with different city names
                while (displayIndex < this.cities.length && this.normalizeCityName(fromCity.name) === this.normalizeCityName(toCity.name)) {
                    displayIndex++;
                    if (displayIndex < this.cities.length) {
                        fromCity = this.cities[displayIndex - 1];
                        toCity = this.cities[displayIndex];
                    }
                }
                
                // If not found forward, search backward
                if (displayIndex >= this.cities.length || this.normalizeCityName(fromCity.name) === this.normalizeCityName(toCity.name)) {
                    displayIndex = currentJourneyIndex;
                    while (displayIndex > 0 && this.normalizeCityName(fromCity.name) === this.normalizeCityName(toCity.name)) {
                        displayIndex--;
                        if (displayIndex > 0) {
                            fromCity = this.cities[displayIndex - 1];
                            toCity = this.cities[displayIndex];
                        }
                    }
                }
                
                // Display if we found a valid journey with different cities
                if (displayIndex > 0 && displayIndex < this.cities.length && this.normalizeCityName(fromCity.name) !== this.normalizeCityName(toCity.name)) {
                    const _from = window.translateCity ? window.translateCity(fromCity.name) : fromCity.name;
                    const _to = window.translateCity ? window.translateCity(toCity.name) : toCity.name;
                    const _isoFrom = window.COUNTRY_ISO && fromCity.country ? window.COUNTRY_ISO[fromCity.country.trim()] : null;
                    const _isoTo = window.COUNTRY_ISO && toCity.country ? window.COUNTRY_ISO[toCity.country.trim()] : null;
                    const _fFrom = _isoFrom ? `<img src="asset/flags/${_isoFrom}.png" width="16" height="12" style="vertical-align:middle;border-radius:2px;margin:0 5px 0 2px;">` : '';
                    const _fTo = _isoTo ? `<img src="asset/flags/${_isoTo}.png" width="16" height="12" style="vertical-align:middle;border-radius:2px;margin:0 5px 0 2px;">` : '';
                    this.animateTextTransition(currentFlightEl, `${_fFrom}${_from} → ${_fTo}${_to}`, true);
                } else {
                    currentFlightEl.textContent = '';
                }
            } else {
                currentFlightEl.textContent = '';
            }
        }
    }

    // Animate text with scrambling effect
    animateText(element, finalText, duration = 1000) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
        const finalLength = finalText.length;
        let currentText = '';
        const startTime = performance.now();
        
        element.classList.add('scrambling');
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            if (progress < 1) {
                // Generate scrambled text
                currentText = '';
                for (let i = 0; i < finalLength; i++) {
                    if (Math.random() < progress) {
                        currentText += finalText[i];
                    } else {
                        currentText += chars[Math.floor(Math.random() * chars.length)];
                    }
                }
                element.textContent = currentText;
                requestAnimationFrame(animate);
            } else {
                element.textContent = finalText;
                element.classList.remove('scrambling');
            }
        };
        
        requestAnimationFrame(animate);
    }

    // Animate number counting
    animateNumber(element, targetValue, duration = 800, formatter = null) {
        // Get start value from data attribute if it exists, otherwise parse from text
        let startValue = parseFloat(element.getAttribute('data-value'));
        if (isNaN(startValue)) {
            startValue = parseFloat(element.textContent.replace(/[^0-9.-]/g, '')) || 0;
        }
        
        const startTime = performance.now();
        
        element.classList.add('counting', 'updating');
        
        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Easing function for smooth animation
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const currentValue = startValue + (targetValue - startValue) * easeOut;
            
            if (progress < 1) {
                if (formatter) {
                    const result = formatter(currentValue);
                    // Check if result contains HTML tags
                    if (result.includes('<')) {
                        element.innerHTML = result;
                    } else {
                        element.textContent = result;
                    }
                } else {
                    element.textContent = Math.round(currentValue);
                }
                requestAnimationFrame(animate);
            } else {
                if (formatter) {
                    const result = formatter(targetValue);
                    // Check if result contains HTML tags
                    if (result.includes('<')) {
                        element.innerHTML = result;
                    } else {
                        element.textContent = result;
                    }
                } else {
                    element.textContent = targetValue;
                }
                // Store final value in data attribute for next animation
                element.setAttribute('data-value', targetValue);
                element.classList.remove('counting', 'updating');
            }
        };
        
        requestAnimationFrame(animate);
    }

    // Smooth text transition with swiping effect
    animateTextTransition(element, newText, useHTML = false) {
        // If text is the same, don't animate
        const currentContent = useHTML ? element.innerHTML : element.textContent;
        if (currentContent === newText) return;
        
        // Add fade-out class
        element.classList.add('fade-out');
        
        // After fade-out completes, change text and fade-in
        setTimeout(() => {
            if (useHTML) {
                element.innerHTML = newText;
            } else {
                element.textContent = newText;
            }
            element.classList.remove('fade-out');
            element.classList.add('fade-in');
            
            // Remove fade-in class after animation
            setTimeout(() => {
                element.classList.remove('fade-in');
            }, 300);
        }, 300);
    }

    // Show increment displays next to each stat
    showIncrement(distance, time, co2, costSGD, isTrainJourney) {
        console.log('showIncrement called:', { distance, time, co2, costSGD, isTrainJourney });
        
        const incDistance = document.getElementById('incDistance');
        const incTime = document.getElementById('incTime');
        const incCO2 = document.getElementById('incCO2');
        const incCostUSD = document.getElementById('incCostUSD');
        const incCostSGD = document.getElementById('incCostSGD');
        
        // Clear any existing increment timeout
        if (this.incrementTimeout) {
            clearTimeout(this.incrementTimeout);
        }
        
        // Remove 'show' class from all increments first to reset any existing display
        [incDistance, incTime, incCO2, incCostUSD, incCostSGD].forEach(el => {
            if (el) el.classList.remove('show');
        });
        
        // Small delay to allow class removal to take effect, then show new values
        requestAnimationFrame(() => {
            // Update and show distance increment
            if (incDistance) {
                incDistance.textContent = `+${Math.round(distance)} km`;
                incDistance.classList.add('show');
            }
            
            // Update and show time increment
            if (incTime) {
                const hours = Math.floor(time);
                const minutes = Math.round((time - hours) * 60);
                if (hours > 0) {
                    incTime.textContent = `+${hours}h ${minutes}m`;
                } else {
                    incTime.textContent = `+${minutes}m`;
                }
                incTime.classList.add('show');
            }
            
            // Update and show CO2 increment
            if (incCO2) {
                if (co2 >= 1000) {
                    incCO2.textContent = `+${(co2 / 1000).toFixed(1)}t`;
                } else {
                    incCO2.textContent = `+${Math.round(co2)}kg`;
                }
                incCO2.classList.add('show');
            }
            
            // Update and show USD cost increment (convert from SGD)
            if (incCostUSD) {
                const costUSD = costSGD * (this.exchangeRates.SGD_TO_USD || 0.787);
                incCostUSD.textContent = `+US$${Math.round(costUSD)}`;
                incCostUSD.classList.add('show');
            }
            
            // Update and show SGD cost increment
            if (incCostSGD) {
                incCostSGD.textContent = `+S$${Math.round(costSGD)}`;
                incCostSGD.classList.add('show');
            }
        });
        
        // Calculate display duration based on animation speed
        // At 1x speed: show for 3 seconds
        // At faster speeds: reduce proportionally but minimum 500ms
        const baseDuration = 3000; // 3 seconds at 1x speed
        const displayDuration = Math.max(500, baseDuration / this.speedMultiplier);
        
        // Hide all increments after calculated duration
        this.incrementTimeout = setTimeout(() => {
            [incDistance, incTime, incCO2, incCostUSD, incCostSGD].forEach(el => {
                if (el) el.classList.remove('show');
            });
        }, displayDuration);
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.flightMap = new AnimatedFlightMap();

    // Set up export button — comprehensive data + dashboard export
    const exportButton = document.getElementById('exportButton');
    if (exportButton) {
        exportButton.addEventListener('click', () => {
            const fm = window.flightMap;
            if (!fm) return;

            // Base flight data
            const exportData = fm.exportFlightData() || {};

            // Dashboard widget data
            exportData.dashboard = {};

            // Return visits
            if (window._rvData) {
                exportData.dashboard.returnVisits = window._rvData;
            }
            // Longest stays
            if (window._lsData) {
                exportData.dashboard.longestStays = window._lsData;
            }
            // Top airlines
            if (window._taData) {
                exportData.dashboard.topAirlines = window._taData;
            }

            // Country spending from cost choropleth
            const countryMap = window.AIRPORT_TO_COUNTRY || {};
            const cityCountryMap = window.CITY_TO_COUNTRY || {};
            const spend = {};
            (fm.flightData || []).forEach(j => {
                let country = null;
                const cost = j.costSGD || j.actualCostSGD || 0;
                if (j.type === 'land') {
                    country = cityCountryMap[j.destination] || cityCountryMap[j.origin];
                } else {
                    const toCode = j.toCode || (j.to && j.to.match(/\(([A-Z]{3})\//)?.[1]);
                    country = countryMap[toCode];
                }
                if (country && cost > 0) spend[country] = (spend[country] || 0) + cost;
            });
            exportData.dashboard.countrySpending = spend;

            // Chart images (canvas to PNG)
            exportData.charts = {};
            document.querySelectorAll('canvas').forEach(canvas => {
                const id = canvas.id || canvas.closest('[id]')?.id || 'chart';
                try {
                    exportData.charts[id] = canvas.toDataURL('image/png');
                } catch (e) { /* skip tainted canvases */ }
            });

            // Download
            const jsonString = JSON.stringify(exportData, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `worldoyster-export-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });
    }

    // Center the page horizontally when the window is narrower than the content
    function centerScroll() {
        if (window.innerWidth < document.body.scrollWidth) {
            window.scrollTo((document.body.scrollWidth - window.innerWidth) / 2, 0);
        }
    }
    centerScroll();
    window.addEventListener('resize', centerScroll);
});

// Expose methods for external use
window.addCity = function(name, country, lat, lng) {
    if (window.flightMap) {
        return window.flightMap.addCityFromData(name, country, lat, lng);
    }
    return false;
};

window.clearCities = function() {
    if (window.flightMap) {
        window.flightMap.clearCities();
    }
};

