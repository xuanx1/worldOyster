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
            // Create flight data manager and load CSV
            const flightDataManager = new FlightDataManager();
            const flights = await flightDataManager.loadCSVData();
            
            if (flights && flights.length > 0) {
                console.log(`Loading ${flights.length} flights from CSV`);
                console.log('First few flights:', flights.slice(0, 3).map(f => ({
                    date: f.date,
                    from: f.from,
                    to: f.to,
                    fromCode: f.fromCode,
                    toCode: f.toCode
                })));
                
                // Calculate year range from flight dates
                this.updateHeaderYear(flights);
                
                // Convert flights to city sequence
                const citySequence = this.convertFlightsToCities(flights);
                
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
                console.warn('No flight data loaded, using sample data');
                this.loadSampleCities();
            }
        } catch (error) {
            console.error('Error loading flight data:', error);
            console.warn('Falling back to sample data');
            this.loadSampleCities();
        }
    }
    
    updateHeaderYear(flights) {
        // Store flights for year updates during animation
        this.flightData = flights;
        
        // Set initial year from first flight (using 'date' field from CSV)
        if (flights.length > 0) {
            const firstFlightDate = new Date(flights[0].date || flights[0].departureDate);
            const firstYear = firstFlightDate.getFullYear();
            
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

    convertFlightsToCities(flights) {
        console.log('Converting flights to cities, input flights:', flights.length);
        console.log('Sample flight data:', flights[0]);
        
        const citySequence = [];
        const addedCities = new Set(); // Track cities we've already added
        
        // Sort flights by date
        flights.sort((a, b) => new Date(a.date) - new Date(b.date));
        console.log('After sorting, first flight date:', flights[0]?.date);
        console.log('After sorting, last flight date:', flights[flights.length - 1]?.date);
        console.log('Sample of sorted flight dates:', flights.slice(0, 10).map(f => f.date));
        
        // Create a proper flight sequence that maintains chronological order
        this.flightSequence = []; // Store the actual flight sequence for date mapping
        
        flights.forEach((flight, index) => {
            console.log(`Processing flight ${index}: ${flight.fromCode} -> ${flight.toCode}, date: ${flight.date}`);
            
            // Always add departure city for first flight
            if (citySequence.length === 0 && flight.fromCode) {
                const coords = this.getAirportCoordinates(flight.fromCode);
                if (coords) {
                    console.log('=== CREATING FIRST CITY ===');
                    console.log('flight object:', flight);
                    console.log('flight.date value:', flight.date);
                    console.log('typeof flight.date:', typeof flight.date);
                    
                    const city = {
                        name: this.extractCityName(flight.from),
                        country: this.extractCountry(flight.from),
                        lat: coords[0],
                        lng: coords[1],
                        airportCode: flight.fromCode,
                        flightDate: flight.date,
                        flightIndex: this.flightSequence.length
                    };
                    console.log('=== CREATED FIRST CITY ===');
                    console.log('city.flightDate:', city.flightDate);
                    console.log('Adding first city:', city);
                    citySequence.push(city);
                    addedCities.add(flight.fromCode);
                    this.flightSequence.push(flight);
                }
            }
            
            // Always add arrival city (this represents the flight destination)
            if (flight.toCode) {
                const coords = this.getAirportCoordinates(flight.toCode);
                if (coords) {
                    console.log('=== CREATING DESTINATION CITY ===');
                    console.log('flight object:', flight);
                    console.log('flight.date value:', flight.date);
                    console.log('typeof flight.date:', typeof flight.date);
                    
                    const city = {
                        name: this.extractCityName(flight.to),
                        country: this.extractCountry(flight.to),
                        lat: coords[0],
                        lng: coords[1],
                        airportCode: flight.toCode,
                        flightDate: flight.date,
                        flightIndex: this.flightSequence.length,
                        originalFlight: flight
                    };
                    console.log('=== CREATED DESTINATION CITY ===');
                    console.log('city.flightDate:', city.flightDate);
                    console.log('Adding destination city:', city);
                    citySequence.push(city);
                    this.flightSequence.push(flight);
                }
            }
        });
        
        console.log('Flight route sequence (chronological):', citySequence.map(c => `${c.name} (${c.airportCode}) - ${c.flightDate}`));
        console.log(`Total cities in sequence: ${citySequence.length}`);
        return citySequence;
    }
    
    getAirportCoordinates(airportCode) {
        // Use the airport coordinates from flight-data.js
        const flightDataManager = new FlightDataManager();
        return flightDataManager.airportCoords.get(airportCode);
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
        // Extract airport code first
        const airportCode = this.extractAirportCode(airportString);
        
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
        // Create great circle path
        const path = this.createGreatCirclePath(
            [fromCity.lat, fromCity.lng],
            [toCity.lat, toCity.lng]
        );

        // Calculate distance for timing (rough distance in degrees)
        const distance = Math.sqrt(
            Math.pow(toCity.lat - fromCity.lat, 2) + 
            Math.pow(toCity.lng - fromCity.lng, 2)
        );
        
        // Calculate and add to total distance (approximate km)
        const distanceKm = this.calculateDistance(fromCity.lat, fromCity.lng, toCity.lat, toCity.lng);
        this.totalDistance += distanceKm;
        
        // All journeys in CSV are flights - calculate flight statistics
        const flightTimeHours = distanceKm / 900; // Flight average speed 900 km/h
        const co2EmissionKg = distanceKm * 0.25;  // Flight CO2: 0.25 kg per km
        
        // Use actual cost from CSV if available, otherwise fall back to calculation
        let costUSD;
        if (toCity.originalFlight && toCity.originalFlight.costSGD && toCity.originalFlight.costSGD > 0) {
            // Convert actual SGD cost to USD
            costUSD = toCity.originalFlight.costSGD * (this.exchangeRates.SGD_TO_USD || 0.74);
            console.log(`Using actual cost from CSV: ${toCity.originalFlight.costSGD} SGD = ${costUSD.toFixed(2)} USD`);
        } else {
            // Fall back to calculation method
            costUSD = distanceKm * 0.25;        // Flight cost: ~$0.25/km
            console.log(`Using calculated cost: ${costUSD.toFixed(2)} USD (no CSV cost available)`);
        }
        
        this.totalTime += flightTimeHours;
        this.totalCO2 += co2EmissionKg;
        this.totalCostUSD += costUSD;
        
        // Show increment box for flight journey
        this.showIncrement(distanceKm, flightTimeHours, co2EmissionKg, costUSD, false);
        
        // Faster animation - reduced timing (min 500ms, max 2000ms)
        const animationDuration = Math.max(500, Math.min(2000, distance * 100));

        // Create empty path line that will be progressively drawn
        const pathLine = L.polyline([], {
            color: '#4CAF50',
            weight: 1,
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
                
                // Create and add flight path
                const pathCoords = this.createGreatCirclePath(
                    [fromCity.lat, fromCity.lng],
                    [toCity.lat, toCity.lng]
                );
                
                const flightPath = L.polyline(pathCoords, {
                    color: '#4CAF50',
                    weight: 2,
                    opacity: 0.8
                }).addTo(this.map);
                
                this.visitedPaths.push(flightPath);
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
                
                // All journeys in CSV are flights - calculate flight statistics (same as normal animation)
                const flightTimeHours = distanceKm / 900; // Flight average speed 900 km/h
                const co2EmissionKg = distanceKm * 0.25;  // Flight CO2: 0.25 kg per km
                
                // Use actual cost from CSV if available, otherwise fall back to calculation (same as normal animation)
                let costUSD;
                if (toCity.originalFlight && toCity.originalFlight.costSGD && toCity.originalFlight.costSGD > 0) {
                    // Convert actual SGD cost to USD
                    costUSD = toCity.originalFlight.costSGD * (this.exchangeRates.SGD_TO_USD || 0.74);
                } else {
                    // Fall back to calculation method
                    costUSD = distanceKm * 0.25;        // Flight cost: ~$0.25/km
                }
                
                this.totalTime += flightTimeHours;
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

        // Create a map to track unique cities and their display elements
        const uniqueCities = new Map();
        const cityElements = new Map();
        let cityDisplayOrder = 1; // Independent numbering for displayed cities

        this.cities.forEach((city, index) => {
            const cityKey = `${city.name}-${city.country}`;
            
            // If this city hasn't been seen before, create its display element
            if (!uniqueCities.has(cityKey)) {
                const cityItem = document.createElement('div');
                cityItem.className = 'city-item';
                cityItem.setAttribute('data-city-key', cityKey);
                cityItem.setAttribute('data-city-index', index);
                
                cityItem.innerHTML = `
                    <div class="city-status">${cityDisplayOrder}</div>
                    <div class="city-info">
                        <div class="city-name">${city.name}</div>
                        <div class="city-country">${city.country}</div>
                    </div>
                `;

                cityListContainer.appendChild(cityItem);
                uniqueCities.set(cityKey, { firstIndex: index, element: cityItem, displayOrder: cityDisplayOrder });
                cityElements.set(cityKey, cityItem);
                cityDisplayOrder++; // Increment for next unique city
            }
        });

        // Update status for all unique cities based on current position
        uniqueCities.forEach((cityData, cityKey) => {
            const cityElement = cityData.element;
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
                this.animateNumber(totalDistanceEl, distanceKm, 800, (val) => `${Math.round(val).toLocaleString()} km`);
            } else {
                totalDistanceEl.textContent = '-';
            }
        }
        if (totalTimeEl) {
            if (this.totalTime > 0) {
                const totalMinutes = Math.round(this.totalTime * 60);
                this.animateNumber(totalTimeEl, totalMinutes, 700, (val) => {
                    const minutes = Math.round(val);
                    const hours = Math.floor(minutes / 60);
                    const remainingMinutes = minutes % 60;
                    if (hours > 0) {
                        return `${hours}h ${remainingMinutes}m`;
                    } else {
                        return `${remainingMinutes}m`;
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
                    element.textContent = formatter(currentValue);
                } else {
                    element.textContent = Math.round(currentValue);
                }
                requestAnimationFrame(animate);
            } else {
                if (formatter) {
                    element.textContent = formatter(targetValue);
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

