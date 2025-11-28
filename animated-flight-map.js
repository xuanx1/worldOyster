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
            USD_TO_SGD: 1.35, // Fallback values
            SGD_TO_USD: 0.74, // Inverse of USD_TO_SGD
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
        this.updateLoadingProgress(50, 'Fetching exchange rates...');
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
            maxZoom: 6,
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
                console.log('Panning enabled - zoom level:', currentZoom);
            }
        } else {
            if (this.map.dragging.enabled()) {
                this.map.dragging.disable();
                console.log('Panning disabled - at minimum zoom level:', currentZoom);
            }
            // When at minimum zoom, always return to original centered view
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
                    SGD_TO_USD: 1 / usdToSgd, // Calculate inverse
                    USD_TO_EUR: data.rates.EUR || 0.9,
                    USD_TO_RMB: data.rates.CNY || 7.2
                };
                console.log('Live exchange rates loaded:', this.exchangeRates);
                // Update statistics with new rates
                this.updateStatistics();
            } else {
                console.warn('Failed to fetch live exchange rates, using fallback values');
            }
        } catch (error) {
            console.warn('Error fetching exchange rates:', error, 'Using fallback values');
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
            const combinedData = await flightDataManager.loadData(); // Use loadData() instead of loadCSVData()
            
            this.updateLoadingProgress(60, 'Processing journeys...');
            if (combinedData && combinedData.length > 0) {
                console.log(`Loading ${combinedData.length} journeys (${flightDataManager.csvData.length} flights + ${flightDataManager.landJourneyData.length} land journeys)`);
                
                // DEBUG: Check if combined data is properly sorted
                console.log('=== COMBINED DATA SORTING DEBUG ===');
                console.log('First 20 combined journeys by date:');
                combinedData.slice(0, 20).forEach((journey, i) => {
                    console.log(`${i+1}. ${journey.date} - ${journey.type} - ${journey.from || journey.origin} -> ${journey.to || journey.destination}`);
                });
                
                console.log('Last 20 combined journeys by date:');
                combinedData.slice(-20).forEach((journey, i) => {
                    const index = combinedData.length - 20 + i;
                    console.log(`${index+1}. ${journey.date} - ${journey.type} - ${journey.from || journey.origin} -> ${journey.to || journey.destination}`);
                });
                
                console.log('First few journeys:', combinedData.slice(0, 3).map(j => ({
                    date: j.date,
                    from: j.from,
                    to: j.to,
                    fromCode: j.fromCode,
                    toCode: j.toCode,
                    source: j.source,
                    type: j.type,
                    origin: j.origin,
                    destination: j.destination
                })));
                
                // DEBUG: Check for suspicious land journeys
                const suspiciousLandJourneys = combinedData.filter(j => 
                    j.type === 'land' && 
                    (j.origin === 'Singapore' || j.destination === 'Singapore') &&
                    (j.destination === 'Beijing' || j.destination === 'Busan' || j.origin === 'Beijing' || j.origin === 'Busan')
                );
                if (suspiciousLandJourneys.length > 0) {
                    console.error('FOUND SUSPICIOUS LAND JOURNEYS:', suspiciousLandJourneys);
                }
                
                // Calculate year range from combined journey dates
                this.updateHeaderYear(combinedData);
                
                // Convert journeys to city sequence
                const citySequence = this.convertFlightsToCities(combinedData);
                
                // Add cities to map
                this.updateLoadingProgress(80, 'Adding cities to map...');
                citySequence.forEach(city => this.addCity(city));
                this.updateCityList();
                
                this.updateLoadingProgress(90, 'Finalizing...');
                console.log(`Added ${this.cities.length} cities to map`);
                
                // Identify all disconnected cities
                const disconnectedCities = this.cities.filter(city => city.isDisconnected);
                console.log('========================================');
                console.log('DISCONNECTED CITIES (New journey starting points):');
                console.log('========================================');
                disconnectedCities.forEach((city, index) => {
                    const prevCity = this.cities[this.cities.indexOf(city) - 1];
                    console.log(`${index + 1}. ${city.name} (${city.airportCode}) on ${city.flightDate}`);
                    console.log(`   Previous city: ${prevCity ? prevCity.name + ' (' + prevCity.airportCode + ')' : 'N/A'}`);
                    console.log(`   --> Journey breaks here, new trip starts at ${city.name}`);
                });
                console.log(`Total disconnected cities: ${disconnectedCities.length}`);
                console.log('========================================');
                console.log('Final cities array:', this.cities.map(c => ({ name: c.name, code: c.airportCode, flightDate: c.flightDate })));
                
                // TEST: Immediately try to update year with first city
                console.log('=== TESTING IMMEDIATE YEAR UPDATE ===');
                if (this.cities.length > 0) {
                    console.log('First city data:', this.cities[0]);
                    this.updateCurrentTripYear(0);
                }
                
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
            
            console.log('Setting initial header year to:', firstYear);
            
            const headerTitle = document.querySelector('.header h1');
            const yearOverlay = document.getElementById('yearOverlay');
            console.log('Header element found in updateHeaderYear:', headerTitle);
            console.log('Year overlay found in updateHeaderYear:', yearOverlay);
            
            if ((headerTitle || yearOverlay) && !isNaN(firstYear)) {
                if (headerTitle) {
                    headerTitle.textContent = firstYear.toString();
                    console.log('Initial header year set to:', headerTitle.textContent);
                }
                if (yearOverlay) {
                    yearOverlay.textContent = firstYear.toString();
                    console.log('Initial year overlay set to:', yearOverlay.textContent);
                }
            } else {
                // If header not found, try again after a short delay
                setTimeout(() => {
                    const retryHeader = document.querySelector('.header h1');
                    const retryOverlay = document.getElementById('yearOverlay');
                    if (retryHeader && !isNaN(firstYear)) {
                        retryHeader.textContent = firstYear.toString();
                        console.log('Header year set on retry:', retryHeader.textContent);
                    }
                    if (retryOverlay && !isNaN(firstYear)) {
                        retryOverlay.textContent = firstYear.toString();
                        console.log('Year overlay set on retry:', retryOverlay.textContent);
                    }
                }, 100);
            }
        }
    }

    updateCurrentTripYear(cityIndex) {
        // Update header year based on current city's flight date
        console.log(`=== YEAR UPDATE: Updating year for city index ${cityIndex} ===`);
        
        const headerTitle = document.querySelector('.header h1');
        const yearOverlay = document.getElementById('yearOverlay');
        console.log('=== YEAR UPDATE: Header element found:', headerTitle);
        console.log('=== YEAR UPDATE: Year overlay found:', yearOverlay);
        console.log('=== YEAR UPDATE: Current header text:', headerTitle ? headerTitle.textContent : 'No header found');
        
        if (headerTitle || yearOverlay) {
            if (this.cities && this.cities[cityIndex] && this.cities[cityIndex].flightDate) {
                const currentFlightDate = new Date(this.cities[cityIndex].flightDate);
                const currentYear = currentFlightDate.getFullYear();
                
                console.log(`=== YEAR UPDATE: City: ${this.cities[cityIndex].name}, Date: ${this.cities[cityIndex].flightDate}, Year: ${currentYear} ===`);
                
                if (!isNaN(currentYear)) {
                    if (headerTitle) {
                        headerTitle.textContent = currentYear.toString();
                        console.log(`=== YEAR UPDATE: Header updated to: ${currentYear} ===`);
                    }
                    if (yearOverlay) {
                        yearOverlay.textContent = currentYear.toString();
                        console.log(`=== YEAR UPDATE: Year overlay updated to: ${currentYear} ===`);
                    }
                    console.log('=== YEAR UPDATE: Header text after update:', headerTitle ? headerTitle.textContent : 'N/A');
                } else {
                    console.log('=== YEAR UPDATE: Invalid year calculated:', currentYear);
                    if (headerTitle) headerTitle.textContent = 'INVALID_YEAR';
                    if (yearOverlay) yearOverlay.textContent = 'INVALID_YEAR';
                }
            } else {
                console.log(`=== YEAR UPDATE: No flight date found for city index ${cityIndex} ===`);
                if (this.cities && this.cities[cityIndex]) {
                    console.log(`=== YEAR UPDATE: City data:`, this.cities[cityIndex]);
                } else {
                    console.log(`=== YEAR UPDATE: No city found at index ${cityIndex}, total cities: ${this.cities ? this.cities.length : 'no cities array'}`);
                }
                headerTitle.textContent = 'NO_DATE';
            }
        } else {
            console.log('=== YEAR UPDATE: Header element not found!');
        }
    }

    convertFlightsToCities(journeys) {
        console.log('Converting journeys to cities, input journeys:', journeys.length);
        console.log('Sample journey data:', journeys[0]);
        
        const citySequence = [];
        const addedCities = new Set(); // Track cities we've already added
        
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
                    console.log('city.flightDate:', city.flightDate);
                    console.log('Adding destination city:', city);
                    citySequence.push(city);
                    this.flightSequence.push(journey);
                }
            }
        });
        
        console.log('Journey route sequence (chronological):', citySequence.map(c => `${c.name} (${c.locationCode}) - ${c.flightDate} [${c.journeyType}]`));
        console.log(`Total cities in sequence: ${citySequence.length}`);
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
        
        // For flights, extract city name from "City Name / Airport Name (CODE/ICAO)" format
        if (locationString.includes(' / ')) {
            return this.extractCityName(locationString);
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
                'MXP': 'Italy', 'FCO': 'Italy', 'CIA': 'Italy', 'BGY': 'Italy', 'LIN': 'Italy', 'PMO': 'Italy',
                
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
                'ARN': 'Sweden', 'CPH': 'Denmark', 'OSL': 'Norway', 'TRF': 'Norway',
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
                'PVG': 'China', 'PEK': 'China', 'CAN': 'China', 'PKX': 'China',
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
                
                // Asia - Thailand
                'BKK': 'Thailand', 'DMK': 'Thailand', 'CNX': 'Thailand',
                
                // Asia - Vietnam
                'SGN': 'Vietnam', 'DAD': 'Vietnam', 'VTE': 'Laos',
                
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
                'PER': 'Australia', 'AKL': 'New Zealand', 'WLG': 'New Zealand',
                
                // Canada
                'YYZ': 'Canada', 'YVR': 'Canada', 'YUL': 'Canada', 'YYC': 'Canada',
                
                // Russia & Former Soviet Union
                'VKO': 'Russia',
                'KBP': 'Ukraine', 'LWO': 'Ukraine'
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
            'Turin': 'Italy', 'Brescia': 'Italy', 'Brecia': 'Italy', 'Naples': 'Italy', 'Pompeii': 'Italy',
            'Salerno': 'Italy', 'Amalfi': 'Italy', 'Catania': 'Italy', 'Palermo': 'Italy', 'Modena': 'Italy',
            'San Marino': 'San Marino', 'Bozen': 'Italy', 'Trieste': 'Italy', 'Novara': 'Italy', 'Pisa': 'Italy',
            
            // Europe - Nordic
            'Stockholm': 'Sweden', 'Gothenburg': 'Sweden', 'Malmö': 'Sweden', 'Malmo': 'Sweden',
            'Copenhagen': 'Denmark', 'Oslo': 'Norway', 'Helsinki': 'Finland',
            
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
            'Hong Kong': 'Hong Kong', 'Taipei': 'Taiwan',
            'Singapore': 'Singapore', 'Johor Bahru': 'Malaysia', 'Malacca': 'Malaysia', 'Batam': 'Indonesia',
            'Penang': 'Malaysia', 'Kota Kinabalu': 'Malaysia',
            'Moscow': 'Russia', 'St. Petersburg': 'Russia', 'Tallinn': 'Estonia',
            'Da Nang': 'Vietnam', 'Danang': 'Vietnam', 'Hoi An': 'Vietnam', 'Ho Chi Minh (Saigon)': 'Vietnam', 'Saigon': 'Vietnam', 'Hochiminh': 'Vietnam', 'Ho Chi Minh City': 'Vietnam',
            'Vientiane': 'Laos', 'Luang Prabang': 'Laos',
            'Bangkok': 'Thailand', 'Phuket': 'Thailand',
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
            'Lima': 'Peru', 'Ica': 'Peru', 'Huacachina': 'Peru'
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
        const city = {
            id: this.cities.length + 1,
            name: cityData.name,
            country: cityData.country,
            lat: cityData.lat,
            lng: cityData.lng,
            visited: false,
            order: this.cities.length + 1,
            // Preserve all additional properties like flightDate, airportCode, etc.
            ...cityData,
            // Override with the computed values
            id: this.cities.length + 1,
            visited: false,
            order: this.cities.length + 1
        };

        console.log('=== ADDING CITY TO this.cities ===');
        console.log('Original cityData:', cityData);
        console.log('Final city object:', city);
        console.log('City flightDate preserved:', city.flightDate);

        this.cities.push(city);
        this.createCityMarker(city);
        this.updateCityList();
    }

    createCityMarker(city) {
        const markerIcon = L.divIcon({
            className: 'city-marker',
            html: `<div style="
                width: 4px; 
                height: 4px; 
                background: #666; 
                border-radius: 50%;
                transition: all 0.3s;
            "></div>`,
            iconSize: [4, 4],
            iconAnchor: [2, 2]
        });

        const marker = L.marker([city.lat, city.lng], { icon: markerIcon });
        
        // Create popup content with journey information
        let popupContent = `<strong>${city.name}</strong><br>${city.country}<br>Order: ${city.order}`;
        
        // Add journey details if available
        if (city.originalFlight) {
            const journey = city.originalFlight;
            if (journey.type === 'land') {
                popupContent += `<br><br>🚂 Land Journey`;
                if (journey.mode) {
                    popupContent += `<br>Mode: ${journey.mode.charAt(0).toUpperCase() + journey.mode.slice(1)}`;
                }
                if (journey.distance) {
                    popupContent += `<br>Distance: ${journey.distance} km`;
                }
                if (journey.durationFormatted) {
                    popupContent += `<br>Duration: ${journey.durationFormatted}`;
                }
            } else {
                popupContent += `<br><br>✈️ Flight`;
                if (journey.distance) {
                    popupContent += `<br>Distance: ${journey.distance} km`;
                }
            }
            if (journey.date) {
                popupContent += `<br>Date: ${journey.date}`;
            }
        }
        
        marker.bindPopup(popupContent);
        // Don't add to map initially - will be added when flight reaches city

        this.cityMarkers.push({ city: city, marker: marker });
    }

    updateCityMarkerStyle(cityIndex, status) {
        if (this.cityMarkers[cityIndex]) {
            const marker = this.cityMarkers[cityIndex].marker;
            let color, size;
            
            switch (status) {
                case 'visited':
                    color = '#4CAF50';
                    size = '4px';
                    break;
                case 'current':
                    color = '#FFD700';
                    size = '8px';
                    break;
                default:
                    color = '#666';
                    size = '4px';
            }

            marker.setIcon(L.divIcon({
                className: 'city-marker',
                html: `<div style="
                    width: ${size}; 
                    height: ${size}; 
                    background: ${color}; 
                    border-radius: 50%;
                    transition: all 0.3s;
                    box-shadow: 0 0 8px rgba(${color === '#FFD700' ? '255, 215, 0' : '76, 175, 80'}, 0.6);
                "></div>`,
                iconSize: [parseInt(size), parseInt(size)],
                iconAnchor: [parseInt(size)/2, parseInt(size)/2]
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
        if (!this.scrubberElement) return;
        
        // Clamp the position between 0 and 100%
        const clampedProgress = Math.max(0, Math.min(100, progressPercentage));
        this.scrubberElement.style.left = clampedProgress + '%';
        
        // Also update the progress fill to follow the scrubber
        const progressFill = document.getElementById('progressFill');
        if (progressFill) {
            progressFill.style.width = clampedProgress + '%';
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
            
            // Continue animation from next city position
            // Increment currentCityIndex to move to next city for animation
            if (this.currentCityIndex < this.cities.length - 1) {
                this.currentCityIndex++; // Move to next city for animation
                setTimeout(() => {
                    this.animateToNextCity();
                }, 800); // Small delay to allow user to see the position
            }
        }
    }

    handleProgressBarClick(e) {
        if (this.isDragging) return;
        
        const rect = this.progressBarElement.getBoundingClientRect();
        const x = e.clientX - rect.left;
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
    updateCurrentFlightDisplay() {
        const currentFlightElement = document.getElementById('currentFlight');
        if (currentFlightElement) {
            if (this.currentCityIndex >= this.cities.length) {
                currentFlightElement.textContent = 'Journey Complete!';
            } else if (this.currentCityIndex > 0) {
                const fromCity = this.cities[this.currentCityIndex - 1];
                const toCity = this.cities[this.currentCityIndex];
                
                // Check if this is a land journey and add mode info
                const journeyData = toCity.originalFlight;
                if (journeyData && journeyData.type === 'land' && journeyData.mode) {
                    const mode = journeyData.mode.charAt(0).toUpperCase() + journeyData.mode.slice(1);
                    const durationText = journeyData.durationFormatted ? ` (${journeyData.durationFormatted})` : '';
                    currentFlightElement.textContent = `${fromCity.name} → ${toCity.name} [${mode}${durationText}]`;
                } else {
                    currentFlightElement.textContent = `${fromCity.name} → ${toCity.name}`;
                }
            } else if (this.currentCityIndex === 0 && this.cities.length > 0) {
                currentFlightElement.textContent = `Starting at ${this.cities[0].name}`;
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
        
        // Add city markers
        this.addCityMarkers();
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

    updateCityList() {
        const cityListContainer = document.getElementById('cityList');
        const cityListMobileContainer = document.getElementById('cityListMobile');
        
        // Wait for DOM to be ready if containers don't exist yet
        if (!cityListContainer && !cityListMobileContainer) {
            setTimeout(() => this.updateCityList(), 100);
            return;
        }
        
        if (cityListContainer) cityListContainer.innerHTML = '';
        if (cityListMobileContainer) cityListMobileContainer.innerHTML = '';

        // Debug: Check the order of cities before sorting
        console.log('=== CITY ORDER DEBUG ===');
        console.log('Original cities order (first 10):');
        this.cities.slice(0, 10).forEach((city, i) => {
            console.log(`${i+1}. ${city.name} - ${city.flightDate} (${new Date(city.flightDate).toISOString()})`);
        });

        // Sort cities by flight date to ensure chronological order
        const sortedCities = [...this.cities].sort((a, b) => {
            const dateA = new Date(a.flightDate);
            const dateB = new Date(b.flightDate);
            return dateA - dateB;
        });

        console.log('Sorted cities order (first 10):');
        sortedCities.slice(0, 10).forEach((city, i) => {
            console.log(`${i+1}. ${city.name} - ${city.flightDate} (${new Date(city.flightDate).toISOString()})`);
        });

        // Create a map to track unique cities and their first travel date
        const uniqueCities = new Map();
        const cityElements = new Map();
        let cityDisplayOrder = 1; // Independent numbering for displayed cities

        // Helper to normalize city names for display (treat 'Danang' and 'Da Nang' as the same)
        function normalizeCityDisplayName(name) {
            if (!name) return name;
            if (name.trim().toLowerCase() === 'danang' || name.trim() === 'Da Nang') return 'Da Nang';
            return name;
        }

        // First pass: identify unique cities with their earliest travel date
        sortedCities.forEach((city, index) => {
            // Normalize city name and create a unique key
            const normalizedName = normalizeCityDisplayName(city.name.trim());
            const normalizedCountry = city.country ? city.country.trim() : '';
            const cityKey = `${normalizedName}-${normalizedCountry}`;
            
            // If this city hasn't been seen before, record it
            if (!uniqueCities.has(cityKey)) {
                const originalIndex = this.cities.findIndex(c => 
                    normalizeCityDisplayName(c.name.trim()) === normalizedName && 
                    (c.country ? c.country.trim() : '') === normalizedCountry && 
                    c.flightDate === city.flightDate
                );
                // Force display name to 'Da Nang'
                const cityForDisplay = { ...city, name: normalizedName };
                uniqueCities.set(cityKey, { 
                    firstIndex: originalIndex,
                    city: cityForDisplay,
                    displayOrder: cityDisplayOrder,
                    travelDate: city.flightDate
                });
                cityDisplayOrder++;
            }
        });

        // Second pass: create elements in chronological order
        const sortedUniqueCities = Array.from(uniqueCities.entries())
            .sort((a, b) => new Date(a[1].travelDate) - new Date(b[1].travelDate));
            
        console.log('Final unique cities order (first 10):');
        sortedUniqueCities.slice(0, 10).forEach(([cityKey, cityData], i) => {
            console.log(`${i+1}. ${cityData.city.name} - ${cityData.travelDate} (${new Date(cityData.travelDate).toISOString()})`);
        });
        
        sortedUniqueCities.forEach(([cityKey, cityData], displayIndex) => {
                const city = cityData.city;
                
                // Create city item HTML
                const cityItemHTML = `
                    <div class="city-status">${displayIndex + 1}</div>
                    <div class="city-info">
                        <div class="city-name">${city.name}</div>
                        <div class="city-country">${city.country}</div>
                    </div>
                `;

                // Add to desktop list
                if (cityListContainer) {
                    const cityItem = document.createElement('div');
                    cityItem.className = 'city-item';
                    cityItem.setAttribute('data-city-key', cityKey);
                    cityItem.setAttribute('data-city-index', cityData.firstIndex);
                    cityItem.innerHTML = cityItemHTML;
                    cityListContainer.appendChild(cityItem);
                }
                
                // Add to mobile list
                if (cityListMobileContainer) {
                    const cityItemMobile = document.createElement('div');
                    cityItemMobile.className = 'city-item';
                    cityItemMobile.setAttribute('data-city-key', cityKey);
                    cityItemMobile.setAttribute('data-city-index', cityData.firstIndex);
                    cityItemMobile.innerHTML = cityItemHTML;
                    cityListMobileContainer.appendChild(cityItemMobile);
                }
            });

        // Update status for all unique cities based on current position
        uniqueCities.forEach((cityData, cityKey) => {
            // Get both desktop and mobile elements
            const desktopElement = cityListContainer ? cityListContainer.querySelector(`[data-city-key="${cityKey}"]`) : null;
            const mobileElement = cityListMobileContainer ? cityListMobileContainer.querySelector(`[data-city-key="${cityKey}"]`) : null;
            
            [desktopElement, mobileElement].forEach(cityElement => {
                if (!cityElement) return;
                
                const statusDiv = cityElement.querySelector('.city-status');
                
                // Reset classes
                cityElement.className = 'city-item';
                statusDiv.className = 'city-status';
                
                // Check if any instance of this city has been visited
                const isVisited = this.cities.some((city, index) => 
                    `${city.name}-${city.country}` === cityKey && city.visited
                );
                
                // Check if this city is currently active
                const currentCity = this.cities[this.currentCityIndex];
                const isCurrent = currentCity && `${currentCity.name}-${currentCity.country}` === cityKey;
                
                // Apply appropriate status
                if (isCurrent) {
                    cityElement.classList.add('current');
                    statusDiv.classList.add('current');
                    // Update the data-city-index to current for scrolling
                    cityElement.setAttribute('data-city-index', this.currentCityIndex);
                } else if (isVisited) {
                    cityElement.classList.add('visited');
                    statusDiv.classList.add('visited');
                }
            });
        });
        
        // Auto-scroll to current city
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
                                SGD: Math.round(estimatedCostUSD * (this.exchangeRates.USD_TO_SGD || 1.35)),
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
        
        // Count unique cities visited up to current index
        const visitedCities = this.cities.slice(0, this.currentCityIndex + 1);
        const uniqueCityNames = new Set(visitedCities.map(city => city.name));
        const citiesVisited = uniqueCityNames.size;
        
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
                const earthTimes = (distanceKm / earthCircumference);
                
                let metaphor = '';
                if (earthTimes >= 1) {
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${earthTimes.toFixed(1)}x Around Earth</span>`;
                } else if (earthTimes >= 0.5) {
                    metaphor = `<br><span style="font-size: 0.65em; font-weight: 700; color: #4CAF50;">${(earthTimes * 100).toFixed(0)}% Around Earth</span>`;
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
                this.animateNumber(co2EmissionEl, this.totalCO2, 750, (val) => {
                    if (val >= 1000) {
                        return `${(val / 1000).toFixed(1)} tons CO₂`;
                    } else {
                        return `${Math.round(val)} kg CO₂`;
                    }
                });
            } else {
                co2EmissionEl.textContent = '-';
            }
        }
        
        // Separate USD and SGD cost displays
        if (totalCostUSDEl) {
            if (this.totalCostSGD > 0) {
                const totalCostUSD = this.totalCostSGD * (this.exchangeRates.SGD_TO_USD || 0.74);
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
            if (this.isAnimating && currentJourneyIndex > 0 && currentJourneyIndex < this.cities.length) {
                const fromCity = this.cities[currentJourneyIndex - 1];
                const toCity = this.cities[currentJourneyIndex];
                this.animateTextTransition(currentFlightEl, `${fromCity.name} → ${toCity.name}`);
            } else if (!this.isAnimating && this.cities.length > 0) {
                this.animateTextTransition(currentFlightEl, 'Complete');
            } else {
                currentFlightEl.textContent = '-';
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

