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
            USD_TO_SGD: 1.30, // Fallback values
            SGD_TO_USD: 0.77, // Inverse of USD_TO_SGD
            USD_TO_EUR: 0.9,
            USD_TO_RMB: 7.2
        };
        
        // Loading bar elements
        this.loadingBarContainer = document.getElementById('loadingBarContainer');
        this.loadingBar = document.getElementById('loadingBar');
        this.loadingStatusText = document.getElementById('loadingStatusText');
        
        this.updateLoadingProgress(10, 'Initializing map...');
        this.initializeMap();
        this.updateLoadingProgress(30, 'Loading flight data...');
        this.loadFlightData(); // Load from CSV instead of sample data
        this.updateLoadingProgress(50, 'Fetching forex rates...');
        this.fetchExchangeRates(); // Fetch live rates
        this.updateStatistics();
        this.initializeScrubber(); // Initialize scrubber functionality
        
        // Auto-start animation after data loads (increased delay for CSV loading)
        setTimeout(() => {
            this.startAnimation();
        }, 3000);
    }

    updateLoadingProgress(percent, message) {
        if (this.loadingBar) {
            this.loadingBar.style.width = percent + '%';
        }
        if (this.loadingStatusText && message) {
            this.loadingStatusText.textContent = message;
        }
    }

    hideLoadingBar() {
        if (this.loadingBarContainer) {
            this.loadingBarContainer.classList.add('hidden');
            setTimeout(() => {
                this.loadingBarContainer.style.display = 'none';
            }, 500);
        }
        if (this.loadingStatusText) {
            this.loadingStatusText.classList.add('hidden');
            setTimeout(() => {
                this.loadingStatusText.style.display = 'none';
            }, 500);
        }
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
            maxZoom: 6
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
                const usdToSgd = data.rates.SGD || 1.35;
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
                    this.updatePanningState();
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
            this.updateLoadingProgress(40, 'Loading CSV data...');
            // Create flight data manager and load both CSV and land journey data
            const flightDataManager = new FlightDataManager();
            const combinedData = await flightDataManager.loadData();
            
            this.updateLoadingProgress(60, 'Processing journeys...');
            if (combinedData && combinedData.length > 0) {
                // Calculate year range from combined journey dates
                this.updateHeaderYear(combinedData);
                
                // Convert journeys to city sequence
                const citySequence = this.convertFlightsToCities(combinedData);
                
                // Add cities to map
                this.updateLoadingProgress(80, 'Adding cities to map...');
                
                // Start animating city list population BEFORE cities are fully added
                this.updateLoadingProgress(85, 'Populating city list...');
                this.animateCityListPopulation(citySequence);
                
                // Continue adding cities to map while animation runs
                // Batch-add cities + markers and update the city list once (avoids per-city re-render)
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
                // Single update for the full list
                this.updateCityList();

                // Make startup map view match the first city point
                if (this.cities.length > 0) {
                    const firstCity = this.cities[0];
                    // Center the map on the first city without changing zoom
                    try { this.map.setView([firstCity.lat, firstCity.lng], this.map.getZoom(), { animate: false }); } catch (e) {}

                    // Position the flight dot at the first city and add the city's marker so the initial view and first point are identical
                    try { this.positionDotAtCity(0); } catch (e) {}
                    if (this.cityMarkers[0] && this.cityMarkers[0].marker && !this.map.hasLayer(this.cityMarkers[0].marker)) {
                        this.cityMarkers[0].marker.addTo(this.map);
                    }

                    // Mark first city visually as current in the list & stats
                    this.updateCityMarkerStyle(0, 'current');
                    this.updateCurrentTripYear(0);
                    this.updateStatistics();

                    // Build interactive route hit areas so lines are hoverable immediately
                    this._createRouteInteractivity();
                }

                this.updateLoadingProgress(90, 'Finalizing...');
                
                this.updateLoadingProgress(100, 'Ready!');
                setTimeout(() => this.hideLoadingBar(), 800);
                
            } else {
                console.warn('No journey data loaded, using sample data');
                this.updateLoadingProgress(100, 'Loading sample data...');
                this.loadSampleCities();
                setTimeout(() => this.hideLoadingBar(), 800);
            }
        } catch (error) {
            console.error('Error loading journey data:', error);
            console.warn('Falling back to sample data');
            this.updateLoadingProgress(100, 'Error - using sample data');
            this.loadSampleCities();
            setTimeout(() => this.hideLoadingBar(), 1000);
        }
    }
    
    updateHeaderYear(journeys) {
        // Store journeys for year updates during animation
        this.flightData = journeys;
        
        // Set initial year from first journey (using 'date' field from CSV)
        if (journeys.length > 0) {
            const firstJourneyDate = new Date(journeys[0].date || journeys[0].departureDate);
            const firstYear = firstJourneyDate.getFullYear();
            
            const headerTitle = document.querySelector('.header h1');
            const yearOverlay = document.getElementById('yearOverlay');
            
            if ((headerTitle || yearOverlay) && !isNaN(firstYear)) {
                if (headerTitle) {
                    headerTitle.textContent = firstYear.toString();
                }
                if (yearOverlay) {
                    yearOverlay.textContent = firstYear.toString();
                }
            } else {
                setTimeout(() => {
                    const retryHeader = document.querySelector('.header h1');
                    const retryOverlay = document.getElementById('yearOverlay');
                    if (retryHeader && !isNaN(firstYear)) {
                        retryHeader.textContent = firstYear.toString();
                    }
                    if (retryOverlay && !isNaN(firstYear)) {
                        retryOverlay.textContent = firstYear.toString();
                    }
                }, 100);
            }
        }
    }

    updateCurrentTripYear(cityIndex) {
        const headerTitle = document.querySelector('.header h1');
        const yearOverlay = document.getElementById('yearOverlay');
        
        if (headerTitle || yearOverlay) {
            if (this.cities && this.cities[cityIndex] && this.cities[cityIndex].flightDate) {
                const currentFlightDate = new Date(this.cities[cityIndex].flightDate);
                const currentYear = currentFlightDate.getFullYear();
                
                if (!isNaN(currentYear)) {
                    if (headerTitle) {
                        headerTitle.textContent = currentYear.toString();
                    }
                    if (yearOverlay) {
                        yearOverlay.textContent = currentYear.toString();
                    }
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
        
        return citySequence;
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
                'WUH': 'China', 'HAK': 'China', 'LHW': 'China',
                
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
            'Beijing': 'China', 'Peking': 'China', 'Tianjin': 'China', 'Shanghai': 'China', 'Wuhan': 'China', 
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
            'Mumbai': 'India', 'Kolkata': 'India', 'Calcutta': 'India', 'Colombo': 'Sri Lanka', 'Chennai': 'India',
            'Dhaka': 'Bangladesh',
            'Chiang Mai': 'Thailand','Bangkok': 'Thailand', 'Phuket': 'Thailand',
            'Yogyakarta': 'Indonesia', 'Surakarta': 'Indonesia', 'Jakarta': 'Indonesia', 'Bandung': 'Indonesia',
            
            // North America
            'New York': 'USA', 'Philadelphia': 'USA', 'Los Angeles': 'USA', 'Los Angles': 'USA',
            'Chicago': 'USA', 'Milwaukee': 'USA', 'San Francisco': 'USA', 'Seattle': 'USA',
            'Boston': 'USA', 'Atlantic City': 'USA', 'Washington DC': 'USA',
            'Toronto': 'Canada', 'Vancouver': 'Canada', 'Montreal': 'Canada', 'Ottawa': 'Canada', 'Niagara': 'Canada',
            'Tijuana': 'Mexico',
            
            // South America
            'La Paz': 'Bolivia', 'Uyuni': 'Bolivia', 'Puno': 'Peru', 'Cusco': 'Peru', 'Cuzco': 'Peru',
            'Ollantaytambo': 'Peru', 'Aguas Calientes': 'Peru', 'Aguas Caliente': 'Peru',
            'Lima': 'Peru', 'Ica': 'Peru', 'Huacachina': 'Peru',
            'Tamanrasset': 'Algeria',

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
        
        // Bind a tooltip that mirrors the city list layout: city (top) and country (below)
        const tooltipEl = document.createElement('div');
        tooltipEl.className = 'city-tooltip-inner';
        const ttName = document.createElement('div');
        ttName.className = 'city-name';
        ttName.textContent = city.name || '';
        const ttCountry = document.createElement('div');
        ttCountry.className = 'city-country';
        ttCountry.textContent = city.country || '';
        tooltipEl.appendChild(ttName);
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
            }
        }
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
                const hit = L.polyline(seg, {
                    color: '#4CAF50',
                    weight: 10,
                    opacity: 0,
                    interactive: true,
                    className: 'route-hit'
                });

                if (this.linesVisible) hit.addTo(this.map);

                const meta = { poly: hit, fromIndex: i, toIndex: i + 1, fromCity, toCity };

                // Hover — show tooltip (use same element/classes as city marker tooltip so appearance is identical)
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

                        if (hit._path) hit._path.style.cursor = 'pointer';
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

                hit.on('mouseout', () => this._clearRouteHover(meta));

                // Click to pin a dismissable popup (keep highlight until popup is closed)
                hit.on('click', (e) => {
                    const content = this._buildRoutePopupContent(fromCity, toCity);
                    const pinned = L.popup({ className: 'route-popup', closeButton: true, offset: [0, -10] })
                        .setLatLng(e.latlng)
                        .setContent(content)
                        .openOn(this.map);

                    // Keep a pinned highlight so the route remains emphasized while popup is open
                    try {
                        if (!meta._pinnedHighlight) {
                            meta._pinnedHighlight = L.polyline(seg, {
                                color: '#4CAF50',
                                weight: 3,
                                opacity: 0.95,
                                interactive: false,
                                className: 'route-highlight'
                            }).addTo(this.map);
                        }
                    } catch (err) { /* ignore */ }

                    meta._pinnedPopup = pinned;
                    // Remove pinned highlight and any active endpoint states when popup is closed
                    try {
                        pinned.on('remove', () => {
                            try {
                                if (meta._pinnedHighlight && this.map.hasLayer(meta._pinnedHighlight)) this.map.removeLayer(meta._pinnedHighlight);
                            } catch (err) {}
                            meta._pinnedHighlight = null;
                            meta._pinnedPopup = null;

                            // ensure endpoint markers are not left active
                            ['from', 'to'].forEach(k => {
                                try {
                                    if (meta[`_${k}MarkerActivated`]) {
                                        const idx = k === 'from' ? meta.fromIndex : meta.toIndex;
                                        const mm = (this.cityMarkers && this.cityMarkers[idx] && this.cityMarkers[idx].marker) || null;
                                        if (mm && mm.getElement && mm.getElement()) mm.getElement().classList.remove('active');
                                        meta[`_${k}MarkerActivated`] = false;
                                    }
                                } catch (err) {}
                            });
                        });
                    } catch (err) {}
                });

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
        const modeRaw = (journey.mode || journey.type || 'flight').toString();
        const mode = modeRaw.charAt(0).toUpperCase() + modeRaw.slice(1);

        // Top line mirrors `.city-name` (same size/weight as city tooltip)
        const title = `${fromCity.name} → ${toCity.name}`;

        // Second line mirrors `.city-country` (smaller, muted)
        const details = [];
        if ((journey.type && journey.type === 'land') || (journey.mode && typeof journey.mode === 'string')) {
            const duration = journey.durationFormatted ? `${mode} • ${journey.durationFormatted}` : mode;
            details.push(duration);
        } else {
            const flightNum = journey.flightNumber || journey.flight || '';
            const airline = journey.airline || '';
            const desc = [flightNum, airline].filter(Boolean).join(' — ');
            details.push(desc || 'Flight');
        }
        if (journey.costSGD) details.push(`S$${Math.round(journey.costSGD)}`);
        //if (journey.date) details.push(new Date(journey.date).toLocaleDateString());

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
                const cityItemHTML = `
                    <div class="city-status">${index + 1}</div>
                    <div class="city-info">
                        <div class="city-name">${city.name}</div>
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
                            <div class="city-country"></div>
                        </div>
                    `;
                    node.querySelector('.city-name').textContent = city.name || '';
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
                    const countryEl = existingAtPos.querySelector('.city-country');
                    if (statusDiv && statusDiv.textContent !== String(i + 1)) statusDiv.textContent = String(i + 1);
                    if (nameEl && nameEl.textContent !== data.city.name) nameEl.textContent = data.city.name || '';
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
                    const countryEl = found.querySelector('.city-country');
                    if (statusDiv) statusDiv.textContent = String(i + 1);
                    if (nameEl) nameEl.textContent = data.city.name || '';
                    if (countryEl) countryEl.textContent = data.city.country || '';
                    found.setAttribute('data-city-index', data.firstIndex);
                    continue;
                }

                // Node does not exist — create and insert
                const node = document.createElement('div');
                node.className = 'city-item';
                node.setAttribute('data-city-key', expectedKey);
                node.setAttribute('data-city-index', data.firstIndex);
                node.innerHTML = `
                    <div class="city-status">${i + 1}</div>
                    <div class="city-info">
                        <div class="city-name">${data.city.name || ''}</div>
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
                    USD: Math.round(this.totalCostSGD * (this.exchangeRates.SGD_TO_USD || 0.74))
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
                            const actualCostUSD = toCity.originalFlight.costSGD * (this.exchangeRates.SGD_TO_USD || 0.74);
                            return {
                                USD: Math.round(actualCostUSD),
                                SGD: Math.round(toCity.originalFlight.costSGD),
                                source: "actual_csv_data"
                            };
                        } else {
                            const estimatedCostUSD = distance * 0.25;
                            return {
                                USD: Math.round(estimatedCostUSD),
                                SGD: Math.round(estimatedCostUSD * (this.exchangeRates.USD_TO_SGD || 1.30)),
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
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${(smallTownYears * 100).toFixed(2)}% Town Emissions / Year</span>`;
                }
                else if (homesEquivalent >= 3) {
                    // 22.5+ tons: Home (3x → 12x at 90)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${homesEquivalent.toFixed(1)}x Household Emissions / Year</span>`;
                }
                else if (carsEquivalent >= 3) {
                    // 13.8+ tons: Car (3x → 4.9x at 22.5)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${carsEquivalent.toFixed(1)}x Car Emissions / Year</span>`;
                }
                else if (personYears >= 2) {
                    // 8+ tons: Per capita (2x → 3.45x at 13.8)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${personYears.toFixed(1)}x Annual Per Capita Emissions</span>`;
                }
                else if (motorcyclesEquivalent >= 2) {
                    // 5+ tons: Motorcycle (2x → 3.2x at 8)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${motorcyclesEquivalent.toFixed(1)}x Motorcycle Emissions / Year</span>`;
                }
                else if (laptopsEquivalent >= 2) {
                    // 0.6+ tons: Laptops (2x → 16.7x at 5)
                    co2Metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #FF5722;">${laptopsEquivalent.toFixed(0)} Laptop${laptopsEquivalent >= 2 ? 's' : ''} Production Emissions</span>`;
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
                const totalCostUSD = this.totalCostSGD * (this.exchangeRates.SGD_TO_USD || 0.77);
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
                const costUSD = costSGD * (this.exchangeRates.SGD_TO_USD || 0.74);
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

