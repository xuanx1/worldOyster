class AnimatedFlightMap {
    constructor() {
        this.map = null;
        this.cities = [];
        this.currentCityIndex = 0;
        this.isAnimating = false;
        this.animationSpeed = 2000; // milliseconds per flight
        this.flightDot = null;
        this.flightPath = null;
        this.visitedPaths = [];
        this.cityMarkers = [];
        this.totalDistance = 0; // Track total distance traveled
        this.totalTime = 0; // Track total travel time in hours
        this.totalCO2 = 0; // Track total CO2 emissions in kg
        this.totalCostUSD = 0; // Track total cost in USD
        
        // Initialize exchange rates with fallback values
        this.exchangeRates = {
            USD_TO_SGD: 1.35, // Fallback values
            SGD_TO_USD: 0.74, // Inverse of USD_TO_SGD
            USD_TO_EUR: 0.9,
            USD_TO_RMB: 7.2
        };
        
        this.initializeMap();
        this.loadFlightData(); // Load from CSV instead of sample data
        this.fetchExchangeRates(); // Fetch live rates
        this.updateStatistics();
        
        // Auto-start animation after data loads (increased delay for CSV loading)
        setTimeout(() => {
            this.startAnimation();
        }, 3000);
    }

    initializeMap() {
        // Initialize map with minimal styling
        this.map = L.map('map', {
            center: [25, 10],
            zoom: 1.4,
            minZoom: 1.4,
            maxZoom: 6,
            zoomControl: false,
            dragging: false
        });

        // Add simple continent outlines using a minimal tile layer
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
            attribution: '',
            subdomains: 'abcd',
            maxZoom: 6
        }).addTo(this.map);

        // Add custom reset view button
        this.addResetViewButton();

        // Create custom flight dot marker
        this.createFlightDot();
    }

    async fetchExchangeRates() {
        try {
            // Using exchangerate-api.com which provides free tier
            const response = await fetch('https://api.exchangerate-api.com/v4/latest/USD');
            if (response.ok) {
                const data = await response.json();
                this.exchangeRates = {
                    USD_TO_SGD: data.rates.SGD || 1.3,
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
                
                button.onclick = function() {
                    map.setView([25, 10], 1.4);
                };
                
                return button;
            }
        });
        
        // Create skip animation control
        const SkipAnimationControl = L.Control.extend({
            onAdd: function(map) {
                const button = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');
                button.innerHTML = '⏭️';
                button.style.backgroundColor = '#333';
                button.style.color = '#fff';
                button.style.width = '30px';
                button.style.height = '30px';
                button.style.display = 'flex';
                button.style.alignItems = 'center';
                button.style.justifyContent = 'center';
                button.style.cursor = 'pointer';
                button.style.fontSize = '14px';
                button.title = 'Skip Animation';
                button.style.marginTop = '2px';
                
                button.onclick = () => {
                    this.skipAnimation();
                };
                
                this.skipButton = button;
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
        
        new ResetViewControl({ position: 'topright' }).addTo(this.map);
        new SkipAnimationControl({ position: 'topright' }).addTo(this.map);
        new ReplayAnimationControl({ position: 'topright' }).addTo(this.map);
    }



    async loadFlightData() {
        try {
            // Create flight data manager and load both CSV and land journey data
            const flightDataManager = new FlightDataManager();
            const combinedData = await flightDataManager.loadData(); // Use loadData() instead of loadCSVData()
            
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
                citySequence.forEach(city => this.addCity(city));
                this.updateCityList();
                
                console.log(`Added ${this.cities.length} cities to map`);
                console.log('Final cities array:', this.cities.map(c => ({ name: c.name, code: c.airportCode, flightDate: c.flightDate })));
                
                // TEST: Immediately try to update year with first city
                console.log('=== TESTING IMMEDIATE YEAR UPDATE ===');
                if (this.cities.length > 0) {
                    console.log('First city data:', this.cities[0]);
                    this.updateCurrentTripYear(0);
                }
                
            } else {
                console.warn('No journey data loaded, using sample data');
                this.loadSampleCities();
            }
        } catch (error) {
            console.error('Error loading journey data:', error);
            console.warn('Falling back to sample data');
            this.loadSampleCities();
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
            console.log('Header element found in updateHeaderYear:', headerTitle);
            
            if (headerTitle && !isNaN(firstYear)) {
                headerTitle.textContent = firstYear.toString();
                console.log('Initial header year set to:', headerTitle.textContent);
            } else {
                // If header not found, try again after a short delay
                setTimeout(() => {
                    const retryHeader = document.querySelector('.header h1');
                    if (retryHeader && !isNaN(firstYear)) {
                        retryHeader.textContent = firstYear.toString();
                        console.log('Header year set on retry:', retryHeader.textContent);
                    }
                }, 100);
            }
        }
    }

    updateCurrentTripYear(cityIndex) {
        // Update header year based on current city's flight date
        console.log(`=== YEAR UPDATE: Updating year for city index ${cityIndex} ===`);
        
        const headerTitle = document.querySelector('.header h1');
        console.log('=== YEAR UPDATE: Header element found:', headerTitle);
        console.log('=== YEAR UPDATE: Current header text:', headerTitle ? headerTitle.textContent : 'No header found');
        
        if (headerTitle) {
            if (this.cities && this.cities[cityIndex] && this.cities[cityIndex].flightDate) {
                const currentFlightDate = new Date(this.cities[cityIndex].flightDate);
                const currentYear = currentFlightDate.getFullYear();
                
                console.log(`=== YEAR UPDATE: City: ${this.cities[cityIndex].name}, Date: ${this.cities[cityIndex].flightDate}, Year: ${currentYear} ===`);
                
                if (!isNaN(currentYear)) {
                    headerTitle.textContent = currentYear.toString();
                    console.log(`=== YEAR UPDATE: Header updated to: ${currentYear} ===`);
                    console.log('=== YEAR UPDATE: Header text after update:', headerTitle.textContent);
                } else {
                    console.log('=== YEAR UPDATE: Invalid year calculated:', currentYear);
                    headerTitle.textContent = 'INVALID_YEAR';
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
            
            // Always add departure city for first journey
            if (citySequence.length === 0 && fromCode) {
                const coords = this.getJourneyCoordinates(journey, 'from');
                if (coords) {
                    console.log('=== CREATING FIRST CITY ===');
                    console.log('journey object:', journey);
                    console.log('journey.date value:', journey.date);
                    console.log('typeof journey.date:', typeof journey.date);
                    
                    const city = {
                        name: this.extractLocationName(fromLocation, fromCode),
                        country: this.extractCountry(fromLocation),
                        lat: coords[0],
                        lng: coords[1],
                        airportCode: fromCode,
                        locationCode: fromCode,
                        flightDate: journey.date,
                        flightIndex: this.flightSequence.length,
                        journeyType: 'flight' // Treat all as flights visually
                    };
                    console.log('=== CREATED FIRST CITY ===');
                    console.log('city.flightDate:', city.flightDate);
                    console.log('Adding first city:', city);
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
        return this.coordinateManager.airportCoords.get(airportCode);
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
                
                // Asia - Hong Kong
                'HKG': 'Hong Kong',
                
                // Asia - Taiwan
                'TPE': 'Taiwan', 'TSA': 'Taiwan',
                
                // Asia - Singapore
                'SIN': 'Singapore',
                
                // Asia - Malaysia
                'KUL': 'Malaysia',
                
                // Asia - Indonesia
                'CGK': 'Indonesia',
                
                // Asia - Thailand
                'BKK': 'Thailand', 'DMK': 'Thailand', 'CNX': 'Thailand',
                
                // Asia - Vietnam
                'SGN': 'Vietnam', 'DAD': 'Vietnam',
                
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
            'Prague': 'Czech Republic', 'Pilsen': 'Czech Republic',
            
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
            'Casablanca': 'Morocco', 'Marrakech': 'Morocco', 'Chefchaoun': 'Morocco',
            'Tunis': 'Tunisia', 'Algiers': 'Algeria',
            'Larnaca': 'Cyprus', 'Kyrenia': 'Cyprus',
            
            // Asia
            'Seoul': 'South Korea', 'Busan': 'South Korea', 'Daegu': 'South Korea', 'Daejeon': 'South Korea',
            'Beijing': 'China', 'Tianjin': 'China', 'Shanghai': 'China',
            'Hong Kong': 'Hong Kong', 'Taipei': 'Taiwan',
            'Singapore': 'Singapore', 'Johor Bahru': 'Malaysia', 'Malacca': 'Malaysia', 'Batam': 'Indonesia',
            'Moscow': 'Russia', 'St. Petersburg': 'Russia', 'Tallinn': 'Estonia',
            'Da Nang': 'Vietnam', 'Hoi An': 'Vietnam',
            
            // North America
            'New York': 'USA', 'Philadelphia': 'USA', 'Los Angeles': 'USA', 'Los Angles': 'USA',
            'Chicago': 'USA', 'Milwaukee': 'USA', 'San Francisco': 'USA', 'Seattle': 'USA',
            'Boston': 'USA', 'Atlantic City': 'USA', 'Washington DC': 'USA',
            'Toronto': 'Canada', 'Vancouver': 'Canada', 'Montreal': 'Canada', 'Ottawa': 'Canada', 'Niagara': 'Canada',
            'Tijuana': 'Mexico',
            
            // South America
            'La Paz': 'Bolivia', 'Uyuni': 'Bolivia', 'Puno': 'Peru', 'Cusco': 'Peru',
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

        const marker = L.marker([city.lat, city.lng], { icon: markerIcon })
            .bindPopup(`<strong>${city.name}</strong><br>${city.country}<br>Order: ${city.order}`);
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

        // Create flight path
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
        
        // Use same flight calculations for all journeys (simplified)
        const timeHours = distanceKm / 900;      // Flight speed for all
        const co2EmissionKg = distanceKm * 0.25; // Flight emissions for all
        
        // Use actual cost from CSV if available (works for both flight and land journey CSVs)
        let costUSD;
        if (journey && journey.costSGD && journey.costSGD > 0) {
            costUSD = journey.costSGD * (this.exchangeRates.SGD_TO_USD || 0.74);
            console.log(`Using actual cost from CSV: ${journey.costSGD} SGD = ${costUSD.toFixed(2)} USD`);
        } else {
            costUSD = distanceKm * 0.25; // Default cost calculation
            console.log(`Using calculated cost: ${costUSD.toFixed(2)} USD`);
        }
        
        this.totalTime += timeHours;
        this.totalCO2 += co2EmissionKg;
        this.totalCostUSD += costUSD;
        
        // Show increment box
        this.showIncrement(distanceKm, timeHours, co2EmissionKg, costUSD, false);
        
        // Faster animation - reduced timing (min 500ms, max 2000ms)
        const animationDuration = Math.max(500, Math.min(2000, distance * 100));

        // Create empty path line that will be progressively drawn (same styling for all journeys)
        const pathLine = L.polyline([], {
            color: '#4CAF50',  // Green for all journeys
            weight: 1,         // Same weight for all
            opacity: 0.8
        }).addTo(this.map);

        this.visitedPaths.push(pathLine);

        // Easing function (ease-in-out)
        const easeInOut = (t) => {
            return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        };

        // Use requestAnimationFrame for smoother animation
        const startTime = performance.now();
        
        const animate = (currentTime) => {
            if (!this.isAnimating) {
                callback();
                return;
            }

            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / animationDuration, 1);
            const easedProgress = easeInOut(progress);
            
            // Calculate current step based on eased progress
            const currentStep = Math.floor(easedProgress * (path.length - 1));
            
            if (progress >= 1) {
                // Animation complete
                this.flightDot.setLatLng(path[path.length - 1]);
                pathLine.setLatLngs(path);
                pathLine.setStyle({
                    opacity: 0.6
                });
                callback();
                return;
            }

            // Update dot position with eased timing
            if (currentStep < path.length) {
                this.flightDot.setLatLng(path[currentStep]);
                
                // Add current point to the path (progressive drawing)
                const currentPath = path.slice(0, currentStep + 1);
                pathLine.setLatLngs(currentPath);
            }
            
            requestAnimationFrame(animate);
        };

        requestAnimationFrame(animate);
    }

    createGreatCirclePath(start, end, numPoints = 100) {
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

    completeAnimation() {
        this.isAnimating = false;
        
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
        
        // Set current flight to show completion
        const currentFlightElement = document.getElementById('currentFlight');
        if (currentFlightElement) {
            currentFlightElement.textContent = 'Journey Complete!';
        }
        
        // Show replay button instead of auto-restarting
        this.showReplayButton();
    }

    restartAnimation() {
        // Use the new reset method for consistency
        this.resetAnimationState();
        
        // Restart the animation
        setTimeout(() => {
            this.startAnimation();
        }, 1000);
    }

    skipAnimation() {
        // Prevent multiple executions - check if already completed or if no animation is running
        if (!this.isAnimating && this.currentCityIndex >= this.cities.length) {
            return; // Already completed
        }
        
        // Check if all cities are already visited (already skipped)
        const allVisited = this.cities.every(city => city.visited);
        if (allVisited && this.currentCityIndex >= this.cities.length) {
            return; // Already skipped
        }
        
        // Stop current animation
        this.isAnimating = false;
        
        // Show all cities immediately
        this.cities.forEach((city, index) => {
            city.visited = true;
            
            // Show all city markers
            if (this.cityMarkers[index]) {
                this.cityMarkers[index].marker.addTo(this.map);
                this.updateCityMarkerStyle(index, 'visited');
            }
            
            // Add all flight paths
            if (index > 0) {
                const fromCity = this.cities[index - 1];
                const toCity = this.cities[index];
                
                console.log(`Skip: Drawing path from ${fromCity.name} to ${toCity.name}`);
                console.log(`From coords: [${fromCity.lat}, ${fromCity.lng}]`);
                console.log(`To coords: [${toCity.lat}, ${toCity.lng}]`);
                
                // Create path coordinates (same for all journeys)
                const pathCoords = this.createGreatCirclePath(
                    [fromCity.lat, fromCity.lng],
                    [toCity.lat, toCity.lng]
                );
                
                console.log(`Path coords length: ${pathCoords.length}`);
                
                // Create path with same styling for all journeys
                const journeyPath = L.polyline(pathCoords, {
                    color: '#4CAF50',  // Green for all
                    weight: 2,         // Same weight for all
                    opacity: 0.8
                }).addTo(this.map);
                
                console.log(`Path added to map:`, journeyPath);
                this.visitedPaths.push(journeyPath);
            }
        });
        
        // Update current city index to the last city
        this.currentCityIndex = this.cities.length;
        
        // Reset statistics before recalculating to avoid double-counting
        this.totalDistance = 0;
        this.totalTime = 0;
        this.totalCO2 = 0;
        this.totalCostUSD = 0;
        
        // Calculate all statistics using the same logic as normal animation
        this.cities.forEach((city, index) => {
            if (index > 0) {
                const fromCity = this.cities[index - 1];
                const toCity = this.cities[index];
                
                // Calculate distance (same as normal animation)
                const distanceKm = this.calculateDistance(fromCity.lat, fromCity.lng, toCity.lat, toCity.lng);
                this.totalDistance += distanceKm;
                
                // Use same calculations for all journeys (simplified)
                const journey = toCity.originalFlight;
                const timeHours = distanceKm / 900;      // Flight speed for all
                const co2EmissionKg = distanceKm * 0.25; // Flight emissions for all
                
                // Use actual cost from CSV if available (works for both CSVs)
                let costUSD;
                if (journey && journey.costSGD && journey.costSGD > 0) {
                    costUSD = journey.costSGD * (this.exchangeRates.SGD_TO_USD || 0.74);
                } else {
                    costUSD = distanceKm * 0.25; // Default cost calculation
                }
                
                this.totalTime += timeHours;
                this.totalCO2 += co2EmissionKg;
                this.totalCostUSD += costUSD;
            }
        });
        
        // Update year to the last flight's year
        if (this.cities.length > 0) {
            this.updateCurrentTripYear(this.cities.length - 1);
        }
        
        // Update UI to show final state
        this.updateProgress();
        this.updateCityList();
        this.updateStatistics();
        
        // Set current flight to show completion
        const currentFlightElement = document.getElementById('currentFlight');
        if (currentFlightElement) {
            currentFlightElement.textContent = 'Journey Complete!';
        }
        
        // Show replay button and hide skip button
        this.showReplayButton();
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
        
        // Reset counters
        this.currentCityIndex = 0;
        this.totalDistance = 0;
        this.totalTime = 0;
        this.totalCO2 = 0;
        this.totalCostUSD = 0;
        
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
        if (this.skipButton) {
            this.skipButton.style.display = 'none';
        }
    }
    
    hideReplayButton() {
        if (this.replayButton) {
            this.replayButton.style.display = 'none';
        }
        if (this.skipButton) {
            this.skipButton.style.display = 'flex';
        }
    }

    updateProgress() {
        const visitedCount = this.cities.filter(city => city.visited).length;
        const progress = this.cities.length > 0 ? (visitedCount / this.cities.length) * 100 : 0;
        document.getElementById('progressFill').style.width = progress + '%';
    }

    updateCityList() {
        const cityListContainer = document.getElementById('cityList');
        cityListContainer.innerHTML = '';

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

        // First pass: identify unique cities with their earliest travel date
        sortedCities.forEach((city, index) => {
            const cityKey = `${city.name}-${city.country}`;
            
            // If this city hasn't been seen before, record it
            if (!uniqueCities.has(cityKey)) {
                const originalIndex = this.cities.findIndex(c => 
                    c.name === city.name && 
                    c.country === city.country && 
                    c.flightDate === city.flightDate
                );
                
                uniqueCities.set(cityKey, { 
                    firstIndex: originalIndex,
                    city: city,
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
                const cityItem = document.createElement('div');
                cityItem.className = 'city-item';
                cityItem.setAttribute('data-city-key', cityKey);
                cityItem.setAttribute('data-city-index', cityData.firstIndex);
                
                cityItem.innerHTML = `
                    <div class="city-status">${displayIndex + 1}</div>
                    <div class="city-info">
                        <div class="city-name">${city.name}</div>
                        <div class="city-country">${city.country}</div>
                    </div>
                `;

                cityListContainer.appendChild(cityItem);
                cityElements.set(cityKey, cityItem);
            });

        // Update status for all unique cities based on current position
        uniqueCities.forEach((cityData, cityKey) => {
            const cityElement = cityElements.get(cityKey);
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
        
        // Auto-scroll to current city
        this.scrollToCurrentCity();
    }
    
    scrollToCurrentCity() {
        const cityListContainer = document.getElementById('cityList');
        const currentCityElement = cityListContainer.querySelector(`[data-city-index="${this.currentCityIndex}"]`);
        
        if (currentCityElement && cityListContainer) {
            // Get the position of the current city element
            const containerRect = cityListContainer.getBoundingClientRect();
            const elementRect = currentCityElement.getBoundingClientRect();
            
            // Calculate if element is outside visible area (vertically)
            const elementTop = elementRect.top - containerRect.top + cityListContainer.scrollTop;
            const elementBottom = elementTop + elementRect.height;
            const visibleTop = cityListContainer.scrollTop;
            const visibleBottom = visibleTop + cityListContainer.clientHeight;
            
            // Only scroll vertically if element is not fully visible
            if (elementTop < visibleTop || elementBottom > visibleBottom) {
                // Calculate center position
                const scrollTop = elementTop - (cityListContainer.clientHeight / 2) + (elementRect.height / 2);
                
                // Smooth scroll only vertically
                cityListContainer.scrollTo({
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
                    USD: Math.round(this.totalCostUSD),
                    SGD: Math.round(this.totalCostUSD * (this.exchangeRates.USD_TO_SGD || 1.35))
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
                        kg: Math.round(distance * 0.25)
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

    // Update statistics display
    updateStatistics() {
        const totalJourneys = Math.max(0, this.cities.length - 1); // Number of journeys is cities - 1
        
        // Count unique cities by name (not airport code)
        const uniqueCityNames = new Set(this.cities.map(city => city.name));
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
        
        if (totalFlightsEl) this.animateNumber(totalFlightsEl, totalJourneys, 600);
        if (citiesVisitedEl) this.animateNumber(citiesVisitedEl, citiesVisited, 600);
        if (totalDistanceEl) {
            if (this.totalDistance > 0) {
                const distanceKm = Math.round(this.totalDistance);
                const earthCircumference = 40075; // Earth's circumference in km
                const earthTimes = (distanceKm / earthCircumference);
                
                let metaphor = '';
                if (earthTimes >= 1) {
                    metaphor = `<span style="font-size: 0.65em; font-weight: 700;">${earthTimes.toFixed(1)}x Around Earth</span>`;
                } else if (earthTimes >= 0.5) {
                    metaphor = `<span style="font-size: 0.65em; font-weight: 700;">${(earthTimes * 100).toFixed(0)}% Around Earth</span>`;
                } else if (earthTimes >= 0.1) {
                    metaphor = `<span style="font-size: 0.65em; font-weight: 700;">${(earthTimes * 100).toFixed(0)}% Around Earth</span>`;
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
                    timeMetaphor = `<span style="font-size: 0.65em; font-weight: 900;">${totalWeeks.toFixed(1)} Weeks</span>`;
                } else if (totalDays >= 1) {
                    timeMetaphor = `<span style="font-size: 0.65em; font-weight: 900;">${totalDays.toFixed(1)} Days</span>`;
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
            if (this.totalCostUSD > 0) {
                this.animateNumber(totalCostUSDEl, this.totalCostUSD, 800, (val) => `US$${Math.round(val).toLocaleString()}`);
            } else {
                totalCostUSDEl.textContent = '-';
            }
        }
        
        if (totalCostSGDEl) {
            if (this.totalCostUSD > 0) {
                const sgdValue = this.totalCostUSD * this.exchangeRates.USD_TO_SGD;
                this.animateNumber(totalCostSGDEl, sgdValue, 800, (val) => `S$${Math.round(val).toLocaleString()}`);
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
        const startValue = parseFloat(element.textContent.replace(/[^0-9.-]/g, '')) || 0;
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
    showIncrement(distance, time, co2, cost, isTrainJourney) {
        console.log('showIncrement called:', { distance, time, co2, cost, isTrainJourney });
        
        const incDistance = document.getElementById('incDistance');
        const incTime = document.getElementById('incTime');
        const incCO2 = document.getElementById('incCO2');
        const incCostUSD = document.getElementById('incCostUSD');
        const incCostSGD = document.getElementById('incCostSGD');
        
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
        
        // Update and show USD cost increment
        if (incCostUSD) {
            incCostUSD.textContent = `+US$${Math.round(cost)}`;
            incCostUSD.classList.add('show');
        }
        
        // Update and show SGD cost increment
        if (incCostSGD) {
            const sgdCost = cost * this.exchangeRates.USD_TO_SGD;
            incCostSGD.textContent = `+S$${Math.round(sgdCost)}`;
            incCostSGD.classList.add('show');
        }
        
        // Hide all increments after 6 seconds
        setTimeout(() => {
            [incDistance, incTime, incCO2, incCostUSD, incCostSGD].forEach(el => {
                if (el) el.classList.remove('show');
            });
        }, 6000);
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

