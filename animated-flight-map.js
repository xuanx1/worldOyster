class AnimatedFlightMap {
    constructor() {
        this.map = null;
        this.cities = [];
        this.currentCityIndex = 0;
        this.isAnimating = false;
        this.animationSpeed = 2000; // milliseconds per flight
        this.speedMultiplier = 1; // 1x, 10x, or 20x speed
        this.flightDot = null;
        this.flightPath = null;
        this.visitedPaths = [];
        this.cityMarkers = [];
        this.routeInteractivePolylines = []; // invisible, interactive polylines for hover
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
        this.loadFlightData();
        this.fetchExchangeRates();
        this.updateStatistics();
        this.initializeScrubber();
        this.initChart();
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



    initializeMap() {
        // Define world bounds to prevent panning outside the map
        const worldBounds = [
            [-90, -180], // Southwest corner
            [90, 180]    // Northeast corner
        ];

        // Initialize map with minimal styling
        this.map = L.map('map', {
            center: [20, 100],
            zoom: 1.45,
            minZoom: 1.45,
            maxZoom: 9,
            zoomControl: false,
            dragging: false,
            maxBounds: worldBounds,
            maxBoundsViscosity: 1.0 // Makes the bounds "sticky"
        });

        // Add simple continent outlines using a minimal tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '',
            subdomains: 'abcd',
            maxZoom: 9
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

    updatePanningState() {
        const currentZoom = this.map.getZoom();
        const minZoom = this.map.options.minZoom;
        
        // Enable panning only when zoomed in beyond the minimum zoom level
        if (currentZoom > minZoom) {
            if (!this.map.dragging.enabled()) {
                this.map.dragging.enable();
            }
        } else {
            if (this.map.dragging.enabled()) {
                this.map.dragging.disable();
            }
            this.map.setView([20, 100], minZoom);
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
        const dotIcon = L.divIcon({
            className: 'flight-dot',
            html: '<div style="width: 16px; height: 16px; background: #FFD700; border-radius: 50%; border: 3px solid #FFF; box-shadow: 0 0 10px rgba(255, 215, 0, 0.8); animation: pulse 2s infinite;"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        // Add pulse animation style
        const style = document.createElement('style');
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

        this.flightDot = L.marker([0, 0], { icon: dotIcon });
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
                button.title = 'Reset View';
                
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
                button.title = 'Pause Animation';
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
                button.title = 'Play Animation';
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
                button.title = 'Speed: 1x (click to cycle)';
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
                button.title = 'Hide Flight Lines';
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
                button.title = 'Follow Flying Dot';
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
        const slogans = {
            2017: 'Return to the Origin',
            2018: 'The Nation Calls',
            2019: 'Beyond the Horizon',
            2020: 'Grounded, Almost',
            2021: 'The Far West',
            2022: 'Middle East\'s First Foray',
            2023: 'Chasing Schengen',
            2024: 'Every Continent Calls',
            2025: 'The Americas Await',
            2026: 'The Southeast Asian Network',
        };
        return slogans[year] || '';
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

    convertFlightsToCities(journeys) {
        const citySequence = [];
        const addedCities = new Set();
        
        // Sort journeys by date
        journeys.sort((a, b) => new Date(a.date) - new Date(b.date));
        console.log('After sorting, first journey date:', journeys[0]?.date);
        console.log('After sorting, last journey date:', journeys[journeys.length - 1]?.date);
        console.log('Sample of sorted journey dates:', journeys.slice(0, 10).map(j => j.date));
        
        // Create a proper journey sequence that maintains chronological order
        this.flightSequence = []; // Store the actual journey sequence for date mapping (keeping name for compatibility)
        
        journeys.forEach((journey, index) => {
            // Treat all journeys the same way visually
            const fromLocation = journey.from || journey.origin;
            const toLocation = journey.to || journey.destination;
            const fromCode = journey.fromCode || journey.origin;
            const toCode = journey.toCode || journey.destination;
            
            console.log(`Processing journey ${index}: ${fromCode} -> ${toCode}, date: ${journey.date}, type: ${journey.type}`);

            // Diagnostic: detect malformed or out-of-range dates that could display as unexpected years (e.g. 2039)
            try {
                const parsed = new Date(journey.date);
                const year = parsed && !isNaN(parsed.getFullYear()) ? parsed.getFullYear() : null;
                if (year === null || year < 1900 || year > 2050) {
                    console.warn('Unusual journey.date parsed year:', { index, rawDate: journey.date, parsedYear: year, journey });
                }
            } catch (e) {
                console.warn('Error parsing journey.date for diagnostic check', { index, rawDate: journey.date, err: e, journey });
            }
            
            // Add departure city only if it's the first journey OR if the previous journey's destination doesn't match this origin
            const previousCity = citySequence.length > 0 ? citySequence[citySequence.length - 1] : null;
            const needsOriginCity = citySequence.length === 0 || (previousCity && previousCity.locationCode !== fromCode);
            
            if (needsOriginCity && fromCode) {
                const coords = this.getJourneyCoordinates(journey, 'from');
                if (coords) {
                    console.log('=== CREATING ORIGIN CITY (disconnected from previous) ===');
                    console.log('journey object:', journey);
                    console.log('journey.date value:', journey.date);
                    console.log('typeof journey.date:', typeof journey.date);
                    
                    // Only mark as disconnected if this origin doesn't match the previous destination
                    const isActuallyDisconnected = previousCity && previousCity.locationCode !== fromCode;
                    
                    const city = {
                        name: this.extractLocationName(fromLocation, fromCode),
                        country: this.extractCountry(fromLocation),
                        lat: coords[0],
                        lng: coords[1],
                        airportCode: fromCode,
                        locationCode: fromCode,
                        flightDate: journey.date,
                        flightIndex: this.flightSequence.length,
                        journeyType: 'flight', // Treat all as flights visually
                        isDisconnected: isActuallyDisconnected // Only mark as disconnected if there's a gap
                    };
                    console.log('=== CREATED ORIGIN CITY ===');
                    console.log('city.flightDate:', city.flightDate);
                    console.log('Adding origin city:', city);
                    citySequence.push(city);
                    addedCities.add(fromCode);
                    this.flightSequence.push(journey);
                }
            }
            
            // Always add arrival city (this represents the journey destination)
            if (toCode) {
                const coords = this.getJourneyCoordinates(journey, 'to');
                if (coords) {
                    console.log('=== CREATING DESTINATION CITY ===');
                    console.log('journey object:', journey);
                    console.log('journey.date value:', journey.date);
                    console.log('typeof journey.date:', typeof journey.date);
                    
                    const city = {
                        name: this.extractLocationName(toLocation, toCode),
                        country: this.extractCountry(toLocation),
                        lat: coords[0],
                        lng: coords[1],
                        airportCode: toCode,
                        locationCode: toCode,
                        flightDate: journey.date,
                        flightIndex: this.flightSequence.length,
                        originalFlight: journey,
                        journeyType: 'flight' // Treat all as flights visually
                    };
                    console.log('=== CREATED DESTINATION CITY ===');
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
            }
            // else: same city name as previous — skip
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
            // Airport code to country mapping - COMPLETE DATABASE
            const airportToCountry = {
                // USA
                'EWR': 'USA', 'FLL': 'USA', 'LGA': 'USA', 'MSY': 'USA', 'LAS': 'USA',
                'SEA': 'USA', 'JFK': 'USA', 'MIA': 'USA', 'ORD': 'USA', 'BUR': 'USA',
                'LAX': 'USA', 'SFO': 'USA', 'DEN': 'USA',
                
                // South America
                'BOG': 'Colombia', 'LPB': 'Bolivia', 'CUZ': 'Peru', 'LIM': 'Peru', 'SCL': 'Chile',
                
                // Mexico
                'MEX': 'Mexico', 'NLU': 'Mexico', 'OAX': 'Mexico',
                
                // Europe - Italy
                'MXP': 'Italy', 'FCO': 'Italy', 'CIA': 'Italy', 'BGY': 'Italy', 'LIN': 'Italy', 'PMO': 'Italy', 'NAP': 'Italy', 'CTA': 'Italy',
                
                // Europe - France  
                'BVA': 'France', 'CDG': 'France', 'ORY': 'France', 'MRS': 'France',
                
                // Europe - UK
                'LHR': 'UK', 'LGW': 'UK', 'STN': 'UK', 'LTN': 'UK',
                
                // Europe - Netherlands
                'AMS': 'Netherlands',
                
                // Europe - Spain
                'MAD': 'Spain', 'BCN': 'Spain', 'PMI': 'Spain',
                
                // Europe - Germany
                'FRA': 'Germany', 'MUC': 'Germany', 'TXL': 'Germany', 'BER': 'Germany', 'HAM': 'Germany',
                
                // Europe - Switzerland
                'ZUR': 'Switzerland', 'ZRH': 'Switzerland', 'GVA': 'Switzerland',
                
                // Europe - Austria
                'VIE': 'Austria',
                
                // Europe - Czech Republic
                'PRG': 'Czech Republic',
                
                // Europe - Poland
                'WAW': 'Poland',
                
                // Europe - Hungary
                'BUD': 'Hungary',
                
                // Europe - Romania
                'OTP': 'Romania', 'IAS': 'Romania',
                
                // Europe - Bulgaria
                'SOF': 'Bulgaria',
                
                // Europe - Serbia
                'BEG': 'Serbia',
                
                // Europe - Bosnia and Herzegovina
                'SJJ': 'Bosnia and Herzegovina',
                
                // Europe - Montenegro
                'TGD': 'Montenegro',
                
                // Europe - Albania
                'TIA': 'Albania',
                
                // Europe - Nordics
                'ARN': 'Sweden', 'CPH': 'Denmark', 'OSL': 'Norway', 'TRF': 'Norway', 'KEF': 'Iceland',
                'HEL': 'Finland',
                
                // Europe - Greece
                'ATH': 'Greece', 'SKG': 'Greece',
                
                // Europe - Portugal
                'LIS': 'Portugal', 'OPO': 'Portugal',
                
                // Europe - Malta
                'MLA': 'Malta',
                
                // Europe - Turkey
                'SAW': 'Turkey', 'IST': 'Turkey', 'ESB': 'Turkey', 'AYT': 'Turkey',
                
                // Europe - Cyprus
                'LCA': 'Cyprus',
                
                // Europe - Belgium
                'BRU': 'Belgium',
                
                // Asia - Japan
                'NRT': 'Japan', 'HND': 'Japan', 'KIX': 'Japan', 'NGO': 'Japan', 'CTS': 'Japan', 'ITM': 'Japan',
                
                // Asia - South Korea
                'ICN': 'South Korea', 'GMP': 'South Korea', 'PUS': 'South Korea', 'CJU': 'South Korea',
                
                // Asia - China
                'PVG': 'China', 'PEK': 'China', 'CAN': 'China', 'PKX': 'China', 'XIY': 'China',
                'WUH': 'China', 'CKG': 'China', 'TFU': 'China', 'HAK': 'China', 'LHW': 'China',
                
                // Asia - North Korea
                'FNJ': 'North Korea',
                
                // Asia - Hong Kong
                'HKG': 'Hong Kong',
                
                // Asia - Taiwan
                'TPE': 'Taiwan', 'TSA': 'Taiwan',
                
                // Asia - Singapore
                'SIN': 'Singapore',
                
                // Asia - Malaysia
                'KUL': 'Malaysia', 'BKI': 'Malaysia',
                
                // Asia - Indonesia
                'CGK': 'Indonesia', 'YIA': 'Indonesia',

                // Asia - Myanmar
                'RGN': 'Myanmar', 'MDL': 'Myanmar',

                // Asia - Sri Lanka
                'CMB': 'Sri Lanka',
                
                // Asia - Thailand
                'BKK': 'Thailand', 'DMK': 'Thailand', 'CNX': 'Thailand',
                
                // Asia - Vietnam
                'SGN': 'Vietnam', 'DAD': 'Vietnam',
                
                // Asia - Laos
                'VTE': 'Laos',
                
                // Asia - Cambodia
                'KTI': 'Cambodia',
                
                // Asia - Philippines
                'MNL': 'Philippines',
                
                // Asia - India
                'DEL': 'India', 'BOM': 'India', 'CCU': 'India',
                
                // Asia - Bangladesh
                'DAC': 'Bangladesh',
                
                // Middle East & Gulf
                'DXB': 'UAE', 'AUH': 'UAE', 'SHJ': 'UAE',
                'DOH': 'Qatar', 
                'KWI': 'Kuwait',
                'RUH': 'Saudi Arabia', 'JED': 'Saudi Arabia',
                'MCT': 'Oman',
                'BAH': 'Bahrain',
                'BEY': 'Lebanon',
                'TLV': 'Israel',
                'AMM': 'Jordan',
                'REP': 'Cambodia',
                
                // Caucasus & Central Asia
                'TBS': 'Georgia', 'BUS': 'Georgia',
                'GYD': 'Azerbaijan',
                'EVN': 'Armenia',
                
                // Africa
                'CAI': 'Egypt', 'SPX': 'Egypt',
                'ALG': 'Algeria', 'CZL': 'Algeria',
                'TUN': 'Tunisia',
                'RAK': 'Morocco',
                'JNB': 'South Africa', 'CPT': 'South Africa',
                'NBO': 'Kenya', 'ADD': 'Ethiopia', 'LOS': 'Nigeria',
                
                // Oceania
                'SYD': 'Australia', 'MEL': 'Australia', 'BNE': 'Australia',
                'AKL': 'New Zealand', 'WLG': 'New Zealand',
                'PER': 'Australia',
                
                // Canada
                'YYZ': 'Canada', 'YVR': 'Canada', 'YUL': 'Canada', 'YYC': 'Canada',
                
                // Russia & Former Soviet Union
                'VKO': 'Russia',
                'KBP': 'Ukraine', 'LWO': 'Ukraine', 'TMR': 'Algeria'
            };
            
            const country = airportToCountry[airportCode];
            if (!country && airportCode) {
                console.warn(`Unknown airport code: ${airportCode} for ${airportString}`);
            }
            return country || 'Unknown';
        }
        
        // If no airport code, treat as city name and use city-to-country mapping
        const cityName = airportString.trim();
        const cityToCountry = {
            // Japan
            'Sapporo': 'Japan', 'Tokyo': 'Japan', 'Osaka': 'Japan', 'Kyoto': 'Japan', 'Nara': 'Japan',
            
            // Europe - Germany
            'Berlin': 'Germany', 'Munich': 'Germany', 'Hamburg': 'Germany', 'Cologne': 'Germany', 
            'Frankfurt': 'Germany', 'Stuttgart': 'Germany', 'Düsseldorf': 'Germany', 'Dusseldorf': 'Germany',
            
            // Europe - Austria & Switzerland
            'Vienna': 'Austria', 'Salzburg': 'Austria', 'Innsbruck': 'Austria',
            'Zurich': 'Switzerland', 'Geneva': 'Switzerland', 'Basel': 'Switzerland',
            
            // Europe - France
            'Paris': 'France', 'Versailles': 'France', 'Monaco': 'Monaco', 'Nice': 'France', 
            'Marseille': 'France', 'Narbonne': 'France',
            
            // Europe - Netherlands
            'Amsterdam': 'Netherlands', 'Utrecht': 'Netherlands', 'Rotterdam': 'Netherlands',
            
            // Europe - Belgium
            'Brussels': 'Belgium', 'Antwerp': 'Belgium',
            
            // Europe - Czech Republic
            'Prague': 'Czech Republic', 'Praha': 'Czech Republic', 'Pilsen': 'Czech Republic',
            
            // Europe - UK & Ireland
            'London': 'UK', 'Edinburgh': 'UK', 'Dublin': 'Ireland',
            
            // Europe - Spain & Portugal
            'Madrid': 'Spain', 'Barcelona': 'Spain', 'Valencia': 'Spain', 'Seville': 'Spain', 'Malaga': 'Spain',
            'Gibraltar': 'Gibraltar', 'La Linea de la Concepcion': 'Spain',
            'Lisbon': 'Portugal', 'Porto': 'Portugal',
            
            // Europe - Italy
            'Rome': 'Italy', 'Florence': 'Italy', 'Venice': 'Italy', 'Milan': 'Italy', 'Verona': 'Italy',
            'Turin': 'Italy', 'Brescia': 'Italy', 'Naples': 'Italy', 'Pompeii': 'Italy',
            'Salerno': 'Italy', 'Amalfi': 'Italy', 'Catania': 'Italy', 'Palermo': 'Italy', 'Modena': 'Italy',
            'San Marino': 'San Marino', 'Bozen': 'Italy', 'Trieste': 'Italy', 'Novara': 'Italy', 'Pisa': 'Italy',
            
            // Europe - Nordic
            'Stockholm': 'Sweden', 'Gothenburg': 'Sweden', 'Malmö': 'Sweden', 'Malmo': 'Sweden',
            'Copenhagen': 'Denmark', 'Oslo': 'Norway', 'Reykjavik': 'Iceland', 'Helsinki': 'Finland',
            
            // Europe - Eastern Europe
            'Warsaw': 'Poland', 'Krakow': 'Poland', 'Poznan': 'Poland',
            'Kyiv': 'Ukraine', 'Lviv': 'Ukraine',
            'Budapest': 'Hungary', 'Bucharest': 'Romania', 'Brașov': 'Romania', 'Brasov': 'Romania',
            'Sofia': 'Bulgaria', 'Skopje': 'North Macedonia', 'Belgrade': 'Serbia', 'Novi Sad': 'Serbia',
            'Ljubljana': 'Slovenia', 'Zagreb': 'Croatia', 'Bratislava': 'Slovakia',
            'Sarajevo': 'Bosnia and Herzegovina', 'Mostar': 'Bosnia and Herzegovina', 'Visoko': 'Bosnia and Herzegovina',
            'Podgorica': 'Montenegro',
            
            // Europe - Greece & Balkans
            'Athens': 'Greece', 'Thessaloniki': 'Greece', 'Ouranoupoli': 'Greece', 'Daphni': 'Greece',
            
            // Europe - Turkey & Caucasus
            'Istanbul': 'Turkey', 'Ankara': 'Turkey', 'Antalya': 'Turkey', 'Denizli': 'Turkey', 'Pamukkale': 'Turkey',
            'Tbilisi': 'Georgia', 'Yerevan': 'Armenia', 'Gori': 'Georgia', 'Batumi': 'Georgia', 'Kutaisi': 'Georgia',
            
            // Middle East
            'Beirut': 'Lebanon', 'Tripoli': 'Lebanon', 'Jerusalem': 'Israel', 'Eilat': 'Israel',
            'Amman': 'Jordan', 'Petra': 'Jordan', 'Taba': 'Egypt',
            
            // Africa
            'Cairo': 'Egypt', 'Alexandria': 'Egypt', 'Luxor': 'Egypt', 'New Cairo City': 'Egypt',
            'Casablanca': 'Morocco', 'Marrakech': 'Morocco', 'Chefchaoun': 'Morocco', 'Tangier': 'Morocco', 'Rabat': 'Morocco', 'Marrakesh': 'Morocco',
            'Tunis': 'Tunisia', 'Bizerte': 'Tunisia',
            'Algiers': 'Algeria', 'Oran': 'Algeria', 'Constantine': 'Algeria',
            'Larnaca': 'Cyprus', 'Kyrenia': 'Cyprus',
            
            // Asia
            'Seoul': 'South Korea', 'Busan': 'South Korea', 'Pusan': 'South Korea', 'Daegu': 'South Korea', 'Daejeon': 'South Korea',
            'Pyongyang': 'North Korea', 'Kaesong': 'North Korea', 'Nampo': 'North Korea', 'Sariwon': 'North Korea',
            'Dandong': 'China',
            'Beijing': 'China', 'Peking': 'China', 'Tianjin': 'China', 'Shanghai': 'China', 'Chengdu': 'China', 'Chongqing': 'China', 'Wuhan': 'China', 
            'Nanyang': 'China', 'Xian': 'China', "Xi'an": 'China', 'Lanzhou': 'China', 'Haikou': 'China',
            'Hong Kong': 'Hong Kong', 'Taipei': 'Taiwan', 'Kuala Lumpur': 'Malaysia',
            'Singapore': 'Singapore', 'Johor Bahru': 'Malaysia', 'Malacca': 'Malaysia', 'Batam': 'Indonesia',
            'Penang': 'Malaysia', 'Kota Kinabalu': 'Malaysia',
            'Moscow': 'Russia', 'St. Petersburg': 'Russia', 'Tallinn': 'Estonia',
            'Da Nang': 'Vietnam', 'Danang': 'Vietnam', 'Hoi An': 'Vietnam', 'Ho Chi Minh City (Saigon)': 'Vietnam', 'Saigon': 'Vietnam', 'Hochiminh': 'Vietnam', 'Ho Chi Minh City': 'Vietnam', 'Hue': 'Vietnam',
            'Vientiane': 'Laos', 'Luang Prabang': 'Laos',
            'Phnom Penh': 'Cambodia', 'Siem Reap': 'Cambodia',
            // Myanmar
            'Yangon': 'Myanmar', 'Mandalay': 'Myanmar',
            'Manila': 'Philippines', 'Cebu': 'Philippines',
            'New Delhi': 'India', 'Delhi': 'India', 'Agra': 'India', 'Jaipur': 'India', 
            'Mumbai': 'India', 'Kolkata': 'India', 'Calcutta': 'India', 'Chennai': 'India',
            'Colombo': 'Sri Lanka', 'Kandy': 'Sri Lanka', 'Galle': 'Sri Lanka', 'Sigiriya': 'Sri Lanka', 'Dambulla': 'Sri Lanka', 'Anuradhapura': 'Sri Lanka',
            'Dhaka': 'Bangladesh',
            'Chiang Mai': 'Thailand','Bangkok': 'Thailand', 'Phuket': 'Thailand',
            'Yogyakarta': 'Indonesia', 'Surakarta': 'Indonesia', 'Jakarta': 'Indonesia', 'Bandung': 'Indonesia',
            
            // North America
            'New York': 'USA', 'Philadelphia': 'USA', 'Los Angeles': 'USA', 'Los Angles': 'USA',
            'Chicago': 'USA', 'Milwaukee': 'USA', 'San Francisco': 'USA', 'Seattle': 'USA',
            'Boston': 'USA', 'Atlantic City': 'USA', 'Washington, D.C.': 'USA',
            'Toronto': 'Canada', 'Vancouver': 'Canada', 'Montreal': 'Canada', 'Ottawa': 'Canada', 'Niagara': 'Canada',
            'Tijuana': 'Mexico', 'Mexico City': 'Mexico', 'Oaxaca': 'Mexico',
            'Miami': 'USA', 'Las Vegas': 'USA', 'Washington DC': 'USA', 'Denver': 'USA', 'New Orleans': 'USA',

            // South America
            'La Paz': 'Bolivia', 'Uyuni': 'Bolivia', 'Puno': 'Peru', 'Cusco': 'Peru', 'Cuzco': 'Peru',
            'Ollantaytambo': 'Peru', 'Aguas Calientes': 'Peru', 'Aguas Caliente': 'Peru',
            'Lima': 'Peru', 'Ica': 'Peru', 'Huacachina': 'Peru', 'Santiago': 'Chile', 'Bogotá': 'Colombia', 'Bogota': 'Colombia',
            'Tamanrasset': 'Algeria', 'Constantine': 'Algeria',

            // Middle East / North Africa extras
            'Jeddah': 'Saudi Arabia', 'Mecca': 'Saudi Arabia', 'Medina': 'Saudi Arabia',
            'Muscat': 'Oman', 'Salalah': 'Oman',
            'Sharjah': 'UAE',
            'Kuwait': 'Kuwait',
            'Giza': 'Egypt',

            // Europe extras
            'Tirana': 'Albania', 'Iasi': 'Romania',

            // Asia extras
            'Jeju': 'South Korea',
            'Dhaka': 'Bangladesh',
            'Baku': 'Azerbaijan',

            //Oceania
            'Sydney': 'Australia', 'Melbourne': 'Australia', 'Brisbane': 'Australia', 'Perth': 'Australia',
            'Auckland': 'New Zealand', 'Wellington': 'New Zealand'
        };
        
        const country = cityToCountry[cityName];
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
        ttName.textContent = city.name || '';

        // Native / local-language name (loaded from `city-native-names.js` if present)
        const ttNative = document.createElement('div');
        ttNative.className = 'city-native';
        const nativeLookupKey = (city.name || '').trim();
        const _rawNative = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[nativeLookupKey] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(nativeLookupKey)])) || '';
        ttNative.textContent = (_rawNative && AnimatedFlightMap._stripAccents(_rawNative.trim()) !== AnimatedFlightMap._stripAccents((city.name || '').trim())) ? _rawNative : '';

        const ttCountry = document.createElement('div');
        ttCountry.className = 'city-country';
        ttCountry.textContent = city.country || '';

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
            this.currentCityIndex++;
        }

        this.animateToNextCity();
    }



    positionDotAtCity(cityIndex) {
        const city = this.cities[cityIndex];
        if (city) {
            this.flightDot.setLatLng([city.lat, city.lng]);
            if (!this.map.hasLayer(this.flightDot)) {
                this.map.addLayer(this.flightDot);
            }
        }
    }

    animateToNextCity() {
        if (!this.isAnimating || this.currentCityIndex >= this.cities.length) {
            this.completeAnimation();
            return;
        }

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
            // Animation complete callback - show and mark destination city when arrived
            if (this.cityMarkers[this.currentCityIndex]) {
                this.cityMarkers[this.currentCityIndex].marker.addTo(this.map);
            }
            
            // Update current trip year in header
            this.updateCurrentTripYear(this.currentCityIndex);
            
            // Mark destination city as visited when flight arrives
            toCity.visited = true;
            this.updateCityMarkerStyle(this.currentCityIndex, 'current');
            this.currentCityIndex++;
            this.updateProgress();
            this.updateCityList();
            this.updateStatistics();
            
            // Continue to next city after a brief pause
            setTimeout(() => {
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
        // Create great circle path for all journeys (same visual treatment)
        const path = this.createGreatCirclePath([fromCity.lat, fromCity.lng], [toCity.lat, toCity.lng]);
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
        const _costPerKm = distanceKm > 0 ? costSGD / distanceKm : 0;
        const _co2PerSGD = costSGD > 0 ? (co2EmissionKg / costSGD) * 1000 : null;
        const _legDate = toCity.originalFlight ? toCity.originalFlight.date : null;
        toCity.legChartData = { costPerKm: _costPerKm, co2PerSGD: _co2PerSGD, date: _legDate, cost: costSGD };
        const _legYear = _legDate ? new Date(_legDate).getFullYear().toString() : '';
        const _tripName = `${fromCity.name} → ${toCity.name}`;
        this.addChartPoint(_legYear, _costPerKm, _co2PerSGD, _legDate, _tripName, costSGD);
        
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

        // Store segment info for date line handling
        const pathLines = [];
        const isDateLineCrossing = Math.abs(toCity.lng - fromCity.lng) > 180;

        if (isDateLineCrossing) {
            // For date line crossing, we still need separate visual segments
            const segments = this.splitPathAtDateLine(path);
            segments.forEach(segment => {
                if (segment.length > 0) {
                    pathLines.push({ points: segment });
                }
            });
        } else {
            pathLines.push({ points: path });
        }
        
        // Store references for pause functionality
        this.currentAnimationPath = path;
        this.currentPathLines = pathLines;

        // Easing function (ease-in-out)
        const easeInOut = (t) => {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        };

        // Use requestAnimationFrame for smoother animation
        const startTime = performance.now();

        const animate = (currentTime) => {
            if (!this.isAnimating) {
                // Complete the path if animation was stopped (paused)
                if (this.currentAnimationPath) {
                    // Add remaining path to continuous line
                    this.allPathCoordinates.push(...path);
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

            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            const easedProgress = easeInOut(progress);

            // Calculate current step based on eased progress
            const currentStep = Math.floor(easedProgress * (path.length - 1));

            if (progress >= 1) {
                // Animation complete - add full segment to continuous path
                this.flightDot.setLatLng(path[path.length - 1]);

                // Check if this segment crosses the date line
                const isDateLineCrossing = Math.abs(toCity.lng - fromCity.lng) > 180;

                if (isDateLineCrossing) {
                    // For date line crossings, split the path into separate segments
                    const segments = this.splitPathAtDateLine(path);

                    // Finalize current path segment if it has points
                    if (this.allPathCoordinates.length > 0 && this.continuousPath) {
                        this.continuousPath.setLatLngs(this.allPathCoordinates);
                        this.continuousPathSegments.push(this.continuousPath);
                    }

                    // Create separate polylines for each date line segment
                    segments.forEach((segment, idx) => {
                        const segmentPolyline = L.polyline(segment, {
                            color: '#4CAF50',
                            weight: 1,
                            opacity: 0.6
                        });

                        if (this.linesVisible) {
                            segmentPolyline.addTo(this.map);
                        }

                        this.continuousPathSegments.push(segmentPolyline);
                    });

                    // Start fresh with the last point of the last segment
                    const lastSegment = segments[segments.length - 1];
                    this.allPathCoordinates = [lastSegment[lastSegment.length - 1]];

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
                this.flightDot.setLatLng(path[currentStep]);

                // Follow the dot if enabled
                if (this.followDot) {
                    this.map.panTo(path[currentStep], { animate: false });
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
            currentFlightElement.textContent = 'Journey Complete!';
        }
        
        // Auto-restart animation after a brief pause (loop the animation)
        setTimeout(() => {
            this.resetAnimationState();
            this.startAnimation();
        }, 2000); // 2 second pause before restarting
    }

    restartAnimation() {
        // Use the new reset method for consistency
        this.resetAnimationState();
        
        // Restart the animation
        setTimeout(() => {
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
                this.fastForwardButton.title = 'Speed: 1x (click to cycle)';
            } else if (this.speedMultiplier === 10) {
                this.fastForwardButton.style.backgroundColor = '#FF9800';
                this.fastForwardButton.style.opacity = '1';
                this.fastForwardButton.title = 'Speed: 10x (click to cycle)';
            } else if (this.speedMultiplier === 20) {
                this.fastForwardButton.style.backgroundColor = '#F44336';
                this.fastForwardButton.style.opacity = '1';
                this.fastForwardButton.title = 'Speed: 20x (click to cycle)';
            } else if (this.speedMultiplier === 100) {
                this.fastForwardButton.style.backgroundColor = '#9C27B0';
                this.fastForwardButton.style.opacity = '1';
                this.fastForwardButton.title = 'Speed: 100x (click to cycle)';
            }
        }
    }

    pauseAnimation() {
        // Instead of immediately stopping, set a flag to pause after current flight
        this.pauseAfterCurrentFlight = true;
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
                this.playPauseButton.title = 'Pausing after current flight...';
                this.playPauseButton.style.opacity = '0.7'; // Visual indication of pending state
            } else if (this.isAnimating) {
                this.playPauseButton.innerHTML = '⏸️';
                this.playPauseButton.title = 'Pause Animation';
                this.playPauseButton.style.opacity = '1';
            } else {
                this.playPauseButton.innerHTML = '▶️';
                this.playPauseButton.title = 'Resume Animation';
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
    }

    updateToggleLinesButton() {
        if (this.toggleLinesButton) {
            if (this.linesVisible) {
                this.toggleLinesButton.innerHTML = '━';
                this.toggleLinesButton.title = 'Hide Flight Lines';
                this.toggleLinesButton.style.backgroundColor = '#333';
                this.toggleLinesButton.style.opacity = '1';
            } else {
                this.toggleLinesButton.innerHTML = '•';
                this.toggleLinesButton.title = 'Show Flight Lines';
                this.toggleLinesButton.style.backgroundColor = '#666';
                this.toggleLinesButton.style.opacity = '0.5';
            }
        }
    }

    toggleFollowDot() {
        this.followDot = !this.followDot;
        this.updateFollowDotButton();
        
        // If enabling follow mode and dot exists, pan to it
        if (this.followDot && this.flightDot) {
            const dotLatLng = this.flightDot.getLatLng();
            this.map.setView(dotLatLng, this.map.getZoom(), { animate: true, duration: 0.5 });
        }
    }

    updateFollowDotButton() {
        if (this.followDotButton) {
            if (this.followDot) {
                this.followDotButton.innerHTML = '🎯';
                this.followDotButton.title = 'Stop Following Dot';
                this.followDotButton.style.backgroundColor = '#4CAF50';
                this.followDotButton.style.opacity = '1';
            } else {
                this.followDotButton.innerHTML = '🎯';
                this.followDotButton.title = 'Follow Flying Dot';
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
        setTimeout(() => {
            this.startAnimation();
        }, 500);
    }
    
    resetAnimationState() {
        // Stop any current animation
        this.isAnimating = false;
        
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
        this.scrubberElement.classList.add('dragging');
        
        // Pause animation while dragging
        this.wasAnimating = this.isAnimating;
        if (this.isAnimating) {
            this.isAnimating = false;
        }
    }

    handleDrag(e) {
        if (!this.isDragging || !this.progressBarElement) return;
        
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
    }

    stopDrag() {
        if (!this.isDragging) return;
        
        this.isDragging = false;
        this.scrubberElement.classList.remove('dragging');
        
        // Resume animation if it was running before scrubbing
        if (this.wasAnimating) {
            this.isAnimating = true;
            this.updatePlayPauseButton(); // Update button state
            
            // Continue animation from current position without incrementing
            if (this.currentCityIndex < this.cities.length - 1) {
                setTimeout(() => {
                    this.animateToNextCity();
                }, 100); // Small delay for smooth transition
            }
        }
    }

    handleProgressBarClick(e) {
        if (this.isDragging) return;
        
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
    }

    jumpToCity(targetIndex) {
        if (targetIndex < 0 || targetIndex >= this.cities.length) return;
        
        // Reset all cities to unvisited
        this.cities.forEach(city => {
            city.visited = false;
            city.current = false;
        });
        
        // Mark cities up to target as visited
        for (let i = 0; i <= targetIndex; i++) {
            this.cities[i].visited = true;
        }
        
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
        this.drawVisitedPaths();
        this.addCityMarkers(); // Add this before positioning dot to ensure markers are visible
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
                const _costPerKm = distanceKm > 0 ? costSGD / distanceKm : 0;
                const _co2PerSGD = costSGD > 0 ? (co2EmissionKg / costSGD) * 1000 : null;
                const _legDate = toCity.originalFlight ? toCity.originalFlight.date : null;
                toCity.legChartData = { costPerKm: _costPerKm, co2PerSGD: _co2PerSGD, date: _legDate, cost: costSGD };
            }
        }
        this.rebuildChart();
    }

    // Position the flight dot at the current city
    positionDotAtCurrentCity() {
        if (this.currentCityIndex >= 0 && this.currentCityIndex < this.cities.length) {
            const currentCity = this.cities[this.currentCityIndex];
            
            // Create or update the flight dot
            if (!this.flightDot) {
                this.flightDot = L.circleMarker([currentCity.lat, currentCity.lng], {
                    color: '#FFD700',
                    fillColor: '#FFD700',
                    fillOpacity: 0.8,
                    radius: 8,
                    weight: 2
                });
            } else {
                this.flightDot.setLatLng([currentCity.lat, currentCity.lng]);
            }
            
            // Add to map if not already there
            if (!this.map.hasLayer(this.flightDot)) {
                this.flightDot.addTo(this.map);
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
                    // Check if this is a land journey and add mode info
                    const journeyData = toCity.originalFlight;
                    if (journeyData && journeyData.type === 'land' && journeyData.mode) {
                        const mode = journeyData.mode.charAt(0).toUpperCase() + journeyData.mode.slice(1);
                        const durationText = journeyData.durationFormatted ? ` (${journeyData.durationFormatted})` : '';
                        currentFlightElement.textContent = `${fromCity.name} → ${toCity.name} [${mode}${durationText}]`;
                    } else {
                        currentFlightElement.textContent = `${fromCity.name} → ${toCity.name}`;
                    }
                    return;
                }
                
                // If no valid journey found, show nothing
                currentFlightElement.textContent = '';
            } else if (this.currentCityIndex === 0 && this.cities.length > 0) {
                currentFlightElement.textContent = `Starting at ${this.cities[0].name}`;
            } else if (this.currentCityIndex >= this.cities.length && this.cities.length > 0) {
                // Only show "Journey Complete!" when currentCityIndex has gone beyond all cities (animation completed)
                currentFlightElement.textContent = 'Journey Complete!';
            } else {
                currentFlightElement.textContent = 'Ready to begin journey';
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
                    // Split the path into separate segments for date line crossing
                    const segments = this.splitPathAtDateLine(pathPoints);
                    
                    // Finalize current segment if it has points
                    if (this.allPathCoordinates.length > 0) {
                        const segment = L.polyline(this.allPathCoordinates, {
                            color: '#4CAF50',
                            weight: 1,
                            opacity: 0.6
                        });
                        
                        if (this.linesVisible) {
                            segment.addTo(this.map);
                        }
                        this.continuousPathSegments.push(segment);
                    }
                    
                    // Create separate polylines for each date line segment
                    segments.forEach((seg, idx) => {
                        const segmentPolyline = L.polyline(seg, {
                            color: '#4CAF50',
                            weight: 1,
                            opacity: 0.6
                        });
                        
                        if (this.linesVisible) {
                            segmentPolyline.addTo(this.map);
                        }
                        
                        this.continuousPathSegments.push(segmentPolyline);
                    });
                    
                    // Start fresh with last point of last segment
                    const lastSegment = segments[segments.length - 1];
                    this.allPathCoordinates = [lastSegment[lastSegment.length - 1]];
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
            this.continuousPath = L.polyline(this.allPathCoordinates, {
                color: '#4CAF50',
                weight: 1,
                opacity: 0.6
            });
            
            // Only add to map if lines are visible
            if (this.linesVisible) {
                this.continuousPath.addTo(this.map);
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

            // Build a simplified great circle for the hop and split if crossing date line
            const hopPath = this.createGreatCirclePath([fromCity.lat, fromCity.lng], [toCity.lat, toCity.lng], 60);
            const segments = this.splitPathAtDateLine(hopPath);

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
                                color: '#4CAF50',
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


                this.routeInteractivePolylines.push(meta);
            });
        }
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

        // Top line mirrors `.city-name` (same size/weight as city tooltip)
        const title = `${fromCity.name} ⇌ ${toCity.name}`;

        // Second line mirrors `.city-country` (smaller, muted)
        const details = [];
        if ((journey.type && journey.type === 'land') || (journey.mode && typeof journey.mode === 'string')) {
            const duration = journey.durationFormatted ? `${mode} • ${journey.durationFormatted}` : mode;
            details.push(duration);
        } else {
            const flightNum = journey.flightNumber || journey.flight || '';
            const airline = journey.airline || '';
            const desc = [flightNum, airline].filter(Boolean).join(' — ');
            details.push(desc || 'Bus/Train');
        }
        if (journey.costSGD) details.push(`S$${Math.round(journey.costSGD)}, One Way`);
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
        // Remove flight dot
        if (this.flightDot && this.map.hasLayer(this.flightDot)) {
            this.map.removeLayer(this.flightDot);
        }
        
        // Remove current flight path
        if (this.flightPath && this.map.hasLayer(this.flightPath)) {
            this.map.removeLayer(this.flightPath);
        }
        
        // Remove city markers
        this.cityMarkers.forEach(cityMarker => {
            if (cityMarker && cityMarker.marker && this.map.hasLayer(cityMarker.marker)) {
                this.map.removeLayer(cityMarker.marker);
            }
        });
        this.cityMarkers = [];
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
                const nativeNameForList = (_rawNativeForList && AnimatedFlightMap._stripAccents(_rawNativeForList.trim()) !== AnimatedFlightMap._stripAccents((city.name || '').trim())) ? _rawNativeForList : '';
                const cityItemHTML = `
                    <div class="city-status">${index + 1}</div>
                    <div class="city-info">
                        <div class="city-name">${city.name}</div>
                        <div class="city-native">${nativeNameForList}</div>
                        <div class="city-country">${city.country}</div>
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
                    node.querySelector('.city-name').textContent = city.name || '';
                    {
                        const _raw = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[city.name] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(city.name)])) || '';
                        node.querySelector('.city-native').textContent = (_raw && AnimatedFlightMap._stripAccents(_raw.trim()) !== AnimatedFlightMap._stripAccents((city.name || '').trim())) ? _raw : '';
                    }
                    node.querySelector('.city-country').textContent = city.country || '';
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
                    if (nameEl && nameEl.textContent !== data.city.name) nameEl.textContent = data.city.name || '';
                    if (nativeEl) {
                        const _raw = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[data.city.name] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(data.city.name)])) || '';
                        const _display = (_raw && AnimatedFlightMap._stripAccents(_raw.trim()) !== AnimatedFlightMap._stripAccents((data.city.name || '').trim())) ? _raw : '';
                        if (nativeEl.textContent !== _display) nativeEl.textContent = _display;
                    }
                    if (countryEl && countryEl.textContent !== (data.city.country || '')) countryEl.textContent = data.city.country || '';
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
                    if (nameEl) nameEl.textContent = data.city.name || '';
                    if (nativeEl) {
                        const _raw = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[data.city.name] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(data.city.name)])) || '';
                        nativeEl.textContent = (_raw && AnimatedFlightMap._stripAccents(_raw.trim()) !== AnimatedFlightMap._stripAccents((data.city.name || '').trim())) ? _raw : '';
                    }
                    if (countryEl) countryEl.textContent = data.city.country || '';
                    found.setAttribute('data-city-index', data.firstIndex);
                    continue;
                }

                // Node does not exist — create and insert
                const _rawNativeForNode = (window.CITY_NATIVE_NAMES && (window.CITY_NATIVE_NAMES[data.city.name] || window.CITY_NATIVE_NAMES[this.normalizeCityDisplayName(data.city.name)])) || '';
                const nativeNameForNode = (_rawNativeForNode && AnimatedFlightMap._stripAccents(_rawNativeForNode.trim()) !== AnimatedFlightMap._stripAccents((data.city.name || '').trim())) ? _rawNativeForNode : '';
                const node = document.createElement('div');
                node.className = 'city-item';
                node.setAttribute('data-city-key', expectedKey);
                node.setAttribute('data-city-index', data.firstIndex);
                node.innerHTML = `
                    <div class="city-status">${i + 1}</div>
                    <div class="city-info">
                        <div class="city-name">${data.city.name || ''}</div>
                        <div class="city-native">${nativeNameForNode}</div>
                        <div class="city-country">${data.city.country || ''}</div>
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

    _externalTooltip(context, chartType) {
        const { chart, tooltip } = context;
        const id = 'chartTooltip_' + chartType;
        let el = document.getElementById(id);
        if (!el) {
            el = document.createElement('div');
            el.id = id;
            el.classList.add('chart-tooltip');
            document.body.appendChild(el);
        }
        if (tooltip.opacity === 0) {
            el.classList.remove('active');
            return;
        }
        const idx = tooltip.dataPoints?.[0]?.dataIndex;
        const tripName = (this._chartTripNames && idx != null) ? this._chartTripNames[idx] : '';
        let bodyHtml = '';
        if (chartType === 'leg') {
            for (const dp of tooltip.dataPoints) {
                if (dp.raw === null) continue;
                const lbl = dp.datasetIndex === 0
                    ? `${dp.raw.toFixed(3)} S$/km`
                    : `${(dp.raw / 1000).toFixed(3)} kg CO\u2082/S$`;
                bodyHtml += `<div>${lbl}</div>`;
            }
        } else {
            for (const dp of tooltip.dataPoints) {
                if (dp.raw === null) continue;
                const prefix = dp.datasetIndex === 1 ? 'Real' : 'Nominal';
                bodyHtml += `<div>${prefix}  S$${dp.raw.toFixed(2)}</div>`;
            }
        }
        const d = this._chartDates?.[idx];
        const footerText = d ? new Date(d).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase() : '';

        el.innerHTML =
            `<div class="ct-title">${tripName.toUpperCase()}</div>` +
            (bodyHtml ? `<div class="ct-body">${bodyHtml}</div>` : '') +
            (footerText ? `<div class="ct-footer">${footerText}</div>` : '');

        const canvasRect = chart.canvas.getBoundingClientRect();
        el.style.left = (canvasRect.left + tooltip.caretX + window.scrollX) + 'px';
        el.style.top = (canvasRect.top + tooltip.caretY - el.offsetHeight - 8 + window.scrollY) + 'px';
        el.classList.add('active');
    }

    initChart() {
        const canvas = document.getElementById('legChart');
        if (!canvas || typeof Chart === 'undefined') return;
        this.legChart = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: [],
                datasets: [
                    {
                        label: 'S$/km',
                        data: [],
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.7)',
                        yAxisID: 'y1',
                        tension: 0.35,
                        pointRadius: 1.5,
                        borderWidth: 0.5,
                        spanGaps: false
                    },
                    {
                        label: 'kg CO₂/S$',
                        data: [],
                        borderColor: '#FF4444',
                        backgroundColor: 'rgba(255, 68, 68, 0.7)',
                        yAxisID: 'y2',
                        tension: 0.35,
                        pointRadius: 1.5,
                        borderWidth: 0.5,
                        spanGaps: false
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
                        external: (context) => this._externalTooltip(context, 'leg')
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
                        label: 'SGD, Nominal',
                        data: [],
                        borderColor: '#4CAF50',
                        backgroundColor: 'rgba(76, 175, 80, 0.7)',
                        tension: 0.35,
                        pointRadius: 1.5,
                        borderWidth: 0.5,
                        spanGaps: false
                    }, {
                        label: 'SGD, Real (2025)',
                        data: [],
                        borderColor: '#FF4444',
                        backgroundColor: 'rgba(255, 68, 68, 0.7)',
                        tension: 0.35,
                        pointRadius: 1.5,
                        borderWidth: 0.5,
                        spanGaps: false
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
                            external: (context) => this._externalTooltip(context, 'price')
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
            let delta = e.deltaY;
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

        cvs.forEach(cv => {
            cv.style.cursor = 'grab';
            cv.addEventListener('mousedown', onMouseDown);
            cv.addEventListener('mousemove', onMouseMove);
            cv.addEventListener('mouseup', endDragFn);
            cv.addEventListener('mouseleave', endDragFn);
            cv.addEventListener('wheel', onWheel, { passive: false });
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
            'walk': 0,           // Walking
            'walking': 0,        // Alternative walking term
            'bike': 0,           // Bicycle
            'bicycle': 0,        // Alternative bicycle term
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
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${moonTimes.toFixed(2)}x To the Moon</span>`;
                } else if (moonTimes >= 0.1) {
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${(moonTimes * 100).toFixed(0)}% To the Moon</span>`;
                } else if (earthTimes >= 1) {
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${earthTimes.toFixed(1)}x Around Earth</span>`;
                } else if (earthTimes >= 0.1) {
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${(earthTimes * 100).toFixed(0)}% Around Earth</span>`;
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
                    timeMetaphor = `<br><span style="font-size: 0.65em; font-weight: 900; color: #4CAF50;">${totalWeeks.toFixed(1)} Weeks</span>`;
                } else if (totalDays >= 1) {
                    timeMetaphor = `<br><span style="font-size: 0.65em; font-weight: 900; color: #4CAF50;">${totalDays.toFixed(1)} Days</span>`;
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
                
                let co2Metaphor = '';
                
                // Tiered comparisons - each shows ~2x to ~10x range
                if (smallTownYears >= 0.00225) {
                    // 90+ tons: Small town
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${(smallTownYears * 100).toFixed(2)}% Annual Town Emission</span>`;
                }
                else if (homesEquivalent >= 3) {
                    // 22.5+ tons: Home (3x → 12x at 90)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${homesEquivalent.toFixed(1)}x Annual Household Emission</span>`;
                }
                else if (carsEquivalent >= 3) {
                    // 13.8+ tons: Car (3x → 4.9x at 22.5)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${carsEquivalent.toFixed(1)}x Annual Car Emission</span>`;
                }
                else if (personYears >= 2) {
                    // 8+ tons: Per capita (2x → 3.45x at 13.8)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${personYears.toFixed(1)}x Annual Global Average Per Capita Emission</span>`;
                }
                else if (motorcyclesEquivalent >= 2) {
                    // 5+ tons: Motorcycle (2x → 3.2x at 8)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${motorcyclesEquivalent.toFixed(1)}x Annual Motorcycle Emission</span>`;
                }
                else if (laptopsEquivalent >= 2) {
                    // 0.6+ tons: Laptops (2x → 16.7x at 5)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${laptopsEquivalent.toFixed(0)} Laptops'${laptopsEquivalent >= 2 ? '' : ''} Production Emission</span>`;
                }
                
                this.animateNumber(co2EmissionEl, co2Kg, 750, (val) => {
                    if (val >= 1000) {
                        return `${(val / 1000).toFixed(1)} tons CO₂ ${co2Metaphor}`;
                    } else {
                        return `${Math.round(val)} kg CO₂ ${co2Metaphor}`;
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
                this.animateTextTransition(currentFlightEl, 'Complete');
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
                    this.animateTextTransition(currentFlightEl, `${fromCity.name} → ${toCity.name}`);
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
    animateTextTransition(element, newText) {
        // If text is the same, don't animate
        if (element.textContent === newText) return;
        
        // Add fade-out class
        element.classList.add('fade-out');
        
        // After fade-out completes, change text and fade-in
        setTimeout(() => {
            element.textContent = newText;
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
    
    // Set up export button
    const exportButton = document.getElementById('exportButton');
    if (exportButton) {
        exportButton.addEventListener('click', () => {
            if (window.flightMap) {
                window.flightMap.exportFlightData();
            }
        });
    }
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

