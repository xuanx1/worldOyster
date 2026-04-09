// Flight Data Management System
class FlightDataManager {
    constructor() {
        this.csvData = [];
        this.landJourneyData = [];
        this.flightRadarData = [];
        this.combinedData = [];
        this.currencyRates = {
            SGD: 1.0,      // Base currency
            USD: 0.787,    // 1 SGD = 0.787 USD
            EUR: 0.68,     // 1 SGD = 0.68 EUR
            RMB: 5.32      // 1 SGD = 5.32 RMB
        };
        this.airportCoords = new Map();
        this.cityCoords = new Map();
        this.airportToCityMap = new Map();

        // Populate Maps from external data files
        for (const [code, coords] of Object.entries(window.AIRPORT_COORDINATES)) {
            this.airportCoords.set(code, coords);
        }
        for (const [city, coords] of Object.entries(window.CITY_COORDINATES)) {
            this.cityCoords.set(city, coords);
        }
        for (const [airport, city] of Object.entries(window.AIRPORT_TO_CITY)) {
            this.airportToCityMap.set(airport, city);
        }
    }

    // Get coordinates for an airport, mapping to city coordinates when appropriate
    getAirportCoordinates(airportCode) {
        if (!airportCode) return null;
        
        // Check if this airport should be mapped to a city
        const mappedCity = this.airportToCityMap.get(airportCode);
        if (mappedCity) {
            const cityCoords = this.cityCoords.get(mappedCity);
            if (cityCoords) {
                return cityCoords;
            }
        }
        
        // Otherwise return the airport's own coordinates
        return this.airportCoords.get(airportCode);
    }

    // Parse CSV data
    async loadCSVData() {
        try {
            const response = await fetch('./data/flightdiary.csv');
            const csvText = await response.text();
            
            const lines = csvText.split('\n').filter(line => line.trim());
            const headers = this.parseCSVLine(lines[0]);
            
            this.csvData = [];
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = this.parseCSVLine(lines[i]);
                    const flight = {};
                    headers.forEach((header, index) => {
                        flight[header] = values[index] || '';
                    });
                    
                    const processedFlight = this.processFlightData(flight, 'csv');
                    if (processedFlight) {
                        this.csvData.push(processedFlight);
                    }
                }
            }
            
            console.log(`Loaded ${this.csvData.length} flights from CSV`);
            return this.csvData;
        } catch (error) {
            console.error('Error loading CSV data:', error);
            return [];
        }
    }

    // Load land journey data from CSV
    async loadLandJourneyData() {
        try {
            const response = await fetch('./data/land-journey.csv');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const csvText = await response.text();
            const lines = csvText.split('\n').filter(line => line.trim());
            const headers = this.parseCSVLine(lines[0]);
            
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = this.parseCSVLine(lines[i]);
                    const journey = {};
                    headers.forEach((header, index) => {
                        journey[header] = values[index] || '';
                    });
                    
                    const processedJourney = this.processLandJourneyData(journey);
                    if (processedJourney) {
                        this.landJourneyData.push(processedJourney);
                    }
                }
            }
            
            console.log(`Loaded ${this.landJourneyData.length} land journeys`);
            return this.landJourneyData;
        } catch (error) {
            console.error('Error loading land journey data:', error.message);
            return [];
        }
    }

    // Parse CSV line handling quoted values
    parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        result.push(current.trim());
        return result;
    }


    // Process and standardize flight data
    processFlightData(flight, source) {
        try {
            // Extract actual cost from CSV (Cost_sgd field)
            const actualCostSGD = flight['Cost_sgd'] || flight.Cost_sgd;
            const hasActualCost = actualCostSGD && !isNaN(parseFloat(actualCostSGD)) && parseFloat(actualCostSGD) > 0;
            
            const processedFlight = {
                date: flight.Date || flight.date,
                flightNumber: flight['Flight number'] || flight.flightNumber,
                from: flight.From || flight.from,
                to: flight.To || flight.to,
                depTime: flight['Dep time'] || flight.depTime || '00:00:00',
                arrTime: flight['Arr time'] || flight.arrTime || '00:00:00',
                duration: flight.Duration || flight.duration,
                airline: flight.Airline || flight.airline,
                aircraft: flight.Aircraft || flight.aircraft,
                registration: flight.Registration || flight.registration,
                seatNumber: flight['Seat number'] || flight.seatNumber,
                seatType: flight['Seat type'] || flight.seatType,
                flightClass: flight['Flight class'] || flight.flightClass,
                flightReason: flight['Flight reason'] || flight.flightReason,
                note: flight.Note || flight.note,
                source: 'flight-diary',  // Force source to be flight-diary
                type: 'flight',         // Force type to be flight
                actualCostSGD: hasActualCost ? parseFloat(actualCostSGD) : null,
                costSGD: hasActualCost ? parseFloat(actualCostSGD) : this.estimateFlightCost(flight),
                estimatedCost: flight.estimatedCost || this.estimateFlightCost(flight)
            };
            
            // Extract airport codes
            processedFlight.fromCode = this.extractAirportCode(processedFlight.from);
            processedFlight.toCode = this.extractAirportCode(processedFlight.to);
            
            // Calculate distance
            processedFlight.distance = this.calculateDistance(
                processedFlight.fromCode, 
                processedFlight.toCode
            );

            return processedFlight;
        } catch (error) {
            console.error('Error processing flight data:', error);
            return null;
        }
    }

    // Extract airport code from airport string
    extractAirportCode(airportString) {
        const match = airportString.match(/\(([A-Z]{3})\/[A-Z]+\)/);
        return match ? match[1] : null;
    }

    // Estimate flight cost based on distance and other factors
    estimateFlightCost(flight) {
        const fromCode = this.extractAirportCode(flight.From || flight.from);
        const toCode = this.extractAirportCode(flight.To || flight.to);
        const distance = this.calculateDistance(fromCode, toCode);
        
        if (!distance) return 500; // Default cost if distance unknown
        
        // Base cost calculation (in SGD)
        let baseCost = distance * 0.15; // $0.15 per km base rate
        
        // Adjust for airline class
        const airline = (flight.Airline || flight.airline || '').toLowerCase();
        if (airline.includes('singapore airlines') || airline.includes('emirates') || airline.includes('qatar')) {
            baseCost *= 1.5; // Premium airlines
        } else if (airline.includes('spirit') || airline.includes('frontier') || airline.includes('ryanair')) {
            baseCost *= 0.6; // Budget airlines
        }
        
        // Adjust for aircraft type
        const aircraft = (flight.Aircraft || flight.aircraft || '').toLowerCase();
        if (aircraft.includes('a380') || aircraft.includes('747')) {
            baseCost *= 1.3; // Large aircraft
        }
        
        // Add some randomness for realism
        baseCost *= (0.8 + Math.random() * 0.4);
        
        return Math.round(baseCost);
    }

    // Calculate distance between airports
    calculateDistance(fromCode, toCode) {
        if (!fromCode || !toCode) return null;
        
        const fromCoords = this.getAirportCoordinates(fromCode);
        const toCoords = this.getAirportCoordinates(toCode);
        
        if (!fromCoords || !toCoords) return null;
        
        return this.haversineDistance(fromCoords, toCoords);
    }

    // Haversine formula for distance calculation
    haversineDistance(coords1, coords2) {
        const R = 6371; // Earth's radius in kilometers
        const dLat = this.toRadians(coords2[0] - coords1[0]);
        const dLon = this.toRadians(coords2[1] - coords1[1]);
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.toRadians(coords1[0])) * 
                  Math.cos(this.toRadians(coords2[0])) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return Math.round(R * c);
    }

    toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Format duration from hours to a readable string
     * @param {number} hours - Duration in hours
     * @returns {string} Formatted duration (e.g., "3h 45m")
     */
    formatDuration(hours) {
        if (!hours || hours <= 0) return '0m';
        
        const wholeHours = Math.floor(hours);
        const minutes = Math.round((hours - wholeHours) * 60);
        
        if (wholeHours === 0) {
            return `${minutes}m`;
        } else if (minutes === 0) {
            return `${wholeHours}h`;
        } else {
            return `${wholeHours}h ${minutes}m`;
        }
    }

    // Process and standardize land journey data
    processLandJourneyData(journey) {
        try {
            // Convert DD/MM/YYYY format to standard date format
            let convertedDate = journey.date;
            if (journey.date && journey.date.includes('/')) {
                const dateParts = journey.date.split('/');
                if (dateParts.length === 3) {
                    // Convert DD/MM/YYYY to YYYY-MM-DD
                    const day = dateParts[0].padStart(2, '0');
                    const month = dateParts[1].padStart(2, '0');
                    const year = dateParts[2];
                    convertedDate = `${year}-${month}-${day}`;
                }
            }

            // Normalize city names: treat 'Danang' as 'Da Nang', 'Pusan' as 'Busan', etc.
            function normalizeCityName(name) {
                if (!name) return name;
                const trimmed = name.trim();
                const lower = trimmed.toLowerCase();
                if (lower === 'danang') return 'Da Nang';
                if (lower === 'pusan') return 'Busan';
                if (lower === 'calcutta') return 'Kolkata';
                if (lower === 'phnompenh' || lower === 'phnom penh') return 'Phnom Penh';
                if (lower === 'hue') return 'Hue';
                if (lower === 'perth') return 'Perth';
                if (lower === 'malta') return 'Valletta';
                return name;
            }

            const normalizedOrigin = normalizeCityName(journey.origin);
            const normalizedDestination = normalizeCityName(journey.destination);
            
            // Extract actual cost from CSV (cost_sgd field)
            const actualCostSGD = journey['cost_sgd'] || journey.cost_sgd;
            const hasActualCost = actualCostSGD && !isNaN(parseFloat(actualCostSGD)) && parseFloat(actualCostSGD) > 0;
            
            const processedJourney = {
                date: convertedDate,  // Use converted date
                origin: normalizedOrigin,
                destination: normalizedDestination,
                mode: journey.mode,
                actualCostSGD: hasActualCost ? parseFloat(actualCostSGD) : null,
                costSGD: hasActualCost ? parseFloat(actualCostSGD) : this.estimateLandJourneyCost(journey),
                estimatedCost: this.estimateLandJourneyCost(journey),
                source: 'land-journey',
                type: 'land'
            };

            // Get coordinates for origin and destination cities
            const originCoords = this.cityCoords.get(processedJourney.origin);
            const destinationCoords = this.cityCoords.get(processedJourney.destination);
            
            if (originCoords && destinationCoords) {
                processedJourney.distance = this.haversineDistance(originCoords, destinationCoords);
                processedJourney.originCoords = originCoords;
                processedJourney.destinationCoords = destinationCoords;
                
                // Calculate duration for land journey
                processedJourney.duration = this.calculateLandTripDuration(processedJourney.distance, processedJourney.mode);
                processedJourney.durationFormatted = this.formatDuration(processedJourney.duration);
            }

            return processedJourney;
        } catch (error) {
            console.error('Error processing land journey data:', error);
            return null;
        }
    }

    // Estimate land journey cost based on distance and mode
    estimateLandJourneyCost(journey) {
        const origin = journey.origin;
        const destination = journey.destination;
        const mode = (journey.mode || '').toLowerCase();
        
        const originCoords = this.cityCoords.get(origin);
        const destinationCoords = this.cityCoords.get(destination);
        
        if (!originCoords || !destinationCoords) return 50; // Default cost if coordinates unknown
        
        const distance = this.haversineDistance(originCoords, destinationCoords);
        
        // Base cost calculation per km (in SGD)
        let costPerKm = 0.10; // Default rate
        
        if (mode.includes('train') || mode.includes('rail')) {
            costPerKm = 0.12; // Train rates
        } else if (mode.includes('bus')) {
            costPerKm = 0.08; // Bus rates (cheaper)
        } else if (mode.includes('car') || mode.includes('taxi')) {
            costPerKm = 0.15; // Car/taxi rates
        } else if (mode.includes('ferry') || mode.includes('boat')) {
            costPerKm = 0.20; // Ferry rates
        }
        
        let baseCost = distance * costPerKm;
        
        // Add some randomness for realism
        baseCost *= (0.8 + Math.random() * 0.4);
        
        return Math.round(baseCost);
    }

    /**
     * Calculate duration of land trips based on distance and mode of transport
     * @param {number} distance - Distance in kilometers
     * @param {string} mode - Mode of transport (train, bus, car, ferry, etc.)
     * @returns {number} Duration in hours
     */
    calculateLandTripDuration(distance, mode = '') {
        if (!distance || distance <= 0) {
            console.warn('Invalid distance provided for duration calculation');
            return 0;
        }
        
        const modeStr = mode.toLowerCase();
        let averageSpeed; // km/h
        let minimumDuration; // hours
        
        // Determine average speed and minimum duration based on mode of transport
        if (modeStr.includes('train') || modeStr.includes('rail')) {
            // For short distances (<50km), trains spend time at stations, boarding, etc.
            if (distance < 50) {
                averageSpeed = 60; // Slower average for short regional trains with stops
                minimumDuration = 0.5; // At least 30 minutes (boarding, waiting, etc.)
            } else if (distance < 200) {
                averageSpeed = 80; // Medium speed for regional trains
                minimumDuration = 0.75; // At least 45 minutes
            } else {
                averageSpeed = 100; // High-speed/intercity trains
                minimumDuration = 1; // At least 1 hour
            }
        } else if (modeStr.includes('bus')) {
            // Buses are slower in cities and with traffic
            if (distance < 50) {
                averageSpeed = 40; // City/regional buses with stops and traffic
                minimumDuration = 0.5; // At least 30 minutes
            } else {
                averageSpeed = 70; // Long-distance buses on highways
                minimumDuration = 0.75; // At least 45 minutes
            }
        } else if (modeStr.includes('car') || modeStr.includes('taxi')) {
            // Cars vary greatly based on distance
            if (distance < 50) {
                averageSpeed = 50; // City driving with traffic
                minimumDuration = 0.33; // At least 20 minutes
            } else {
                averageSpeed = 90; // Highway driving
                minimumDuration = 0.5; // At least 30 minutes
            }
        } else if (modeStr.includes('ferry') || modeStr.includes('boat')) {
            // Ferries include boarding/departure time
            averageSpeed = 40;
            minimumDuration = 0.5; // At least 30 minutes (boarding, etc.)
        } else {
            // Default for unknown mode
            averageSpeed = 60;
            minimumDuration = 0.33; // At least 20 minutes
        }
        
        // Calculate duration in hours
        let durationHours = distance / averageSpeed;
        
        // Apply minimum duration (accounts for boarding, waiting, city traffic, etc.)
        durationHours = Math.max(durationHours, minimumDuration);
        
        // Round to 2 decimal places
        return Math.round(durationHours * 100) / 100;
    }

    /**
     * Calculate duration for a land journey object
     * @param {Object} journey - Land journey object with origin, destination, and mode
     * @returns {number} Duration in hours, or null if coordinates not found
     */
    calculateLandJourneyDuration(journey) {
        if (!journey || !journey.origin || !journey.destination) {
            console.warn('Invalid journey object provided for duration calculation');
            return null;
        }
        
        // Try to use pre-calculated distance if available
        let distance = journey.distance;
        
        // If distance not provided, calculate it
        if (!distance) {
            const originCoords = this.cityCoords.get(journey.origin);
            const destinationCoords = this.cityCoords.get(journey.destination);
            
            if (!originCoords || !destinationCoords) {
                console.warn(`Missing coordinates for journey: ${journey.origin} -> ${journey.destination}`);
                return null;
            }
            
            distance = this.haversineDistance(originCoords, destinationCoords);
        }
        
        return this.calculateLandTripDuration(distance, journey.mode || '');
    }


    // Main data loading method - loads both flights and land journeys
    async loadData() {
        try {
            const flightDataResult = await this.loadCSVData();
            const landJourneyResult = await this.loadLandJourneyData();
            
            // First, filter out journeys with same origin and destination, then do a simple date sort
            const dateSorted = [...this.csvData, ...this.landJourneyData]
                .filter(journey => {
                    const origin = this.normalizeCityForComparison(this.getOrigin(journey));
                    const destination = this.normalizeCityForComparison(this.getDestination(journey));
                    return origin !== destination; // Skip if same city (after normalization)
                })
                .sort((a, b) => new Date(a.date) - new Date(b.date));
            
            // Then intelligently order same-day journeys by checking connections
            this.combinedData = [];
            let i = 0;
            while (i < dateSorted.length) {
                const currentDate = new Date(dateSorted[i].date).toDateString();
                const sameDayJourneys = [];
                
                // Collect all journeys on the same day
                while (i < dateSorted.length && new Date(dateSorted[i].date).toDateString() === currentDate) {
                    sameDayJourneys.push(dateSorted[i]);
                    i++;
                }
                
                // If only one journey this day, just add it
                if (sameDayJourneys.length === 1) {
                    this.combinedData.push(sameDayJourneys[0]);
                    continue;
                }
                
                // Sort same-day journeys by finding the ordering with fewest gaps.
                // Groups are small (2-4) so backtracking is trivial.
                const prevDest = this.combinedData.length > 0
                    ? this.getDestination(this.combinedData[this.combinedData.length - 1])
                    : null;

                const bestOrder = this._chainSameDayJourneys(sameDayJourneys, prevDest);
                this.combinedData.push(...bestOrder);
            }
                
            console.log(`Data loaded: ${this.csvData.length} flights, ${this.landJourneyData.length} land journeys`);
            
            return this.combinedData;
        } catch (error) {
            console.error('Error loading data:', error.message);
            throw error;
        }
    }

    // Find the ordering of same-day journeys that produces the fewest gaps.
    // Uses backtracking (groups are small, typically 2-4 journeys).
    _chainSameDayJourneys(journeys, prevDest) {
        let bestResult = null;
        let bestGaps = Infinity;

        const tryChain = (remaining, chain, lastDest, gaps) => {
            if (remaining.length === 0) {
                if (gaps < bestGaps) {
                    bestGaps = gaps;
                    bestResult = [...chain];
                }
                return;
            }
            // Prune: can't beat current best
            if (gaps >= bestGaps) return;

            for (let i = 0; i < remaining.length; i++) {
                const j = remaining[i];
                const origin = this.getOrigin(j);
                const dest = this.getDestination(j);
                const isGap = lastDest && origin !== lastDest ? 1 : 0;

                remaining.splice(i, 1);
                chain.push(j);
                tryChain(remaining, chain, dest, gaps + isGap);
                chain.pop();
                remaining.splice(i, 0, j);
            }
        };

        tryChain([...journeys], [], prevDest, 0);
        return bestResult || journeys;
    }

    // Helper to get origin from a journey (flight or land)
    getOrigin(journey) {
        if (journey.type === 'land') {
            return journey.origin;
        }
        // For flights, prefer airport-to-city mapping for a clean city name
        const airportCode = this.extractAirportCode(journey.from);
        if (airportCode) {
            const mapped = this.airportToCityMap.get(airportCode);
            if (mapped) return mapped;
        }
        // Fallback: extract city name (first part before " / ")
        const slashIdx = journey.from.indexOf(' / ');
        let city = slashIdx > 0 ? journey.from.substring(0, slashIdx).trim() : journey.from;

        // Normalize Ho Chi Minh (Saigon) to Ho Chi Minh City (Saigon)
        if (city === 'Ho Chi Minh (Saigon)') {
            city = 'Ho Chi Minh City (Saigon)';
        }

        return city;
    }

    // Helper to get destination from a journey (flight or land)
    getDestination(journey) {
        if (journey.type === 'land') {
            return journey.destination;
        }
        // For flights, prefer airport-to-city mapping for a clean city name
        const airportCode = this.extractAirportCode(journey.to);
        if (airportCode) {
            const mapped = this.airportToCityMap.get(airportCode);
            if (mapped) return mapped;
        }
        // Fallback: extract city name (first part before " / ")
        const slashIdx = journey.to.indexOf(' / ');
        let city = slashIdx > 0 ? journey.to.substring(0, slashIdx).trim() : journey.to;

        // Normalize Ho Chi Minh (Saigon) to Ho Chi Minh City (Saigon)
        if (city === 'Ho Chi Minh (Saigon)') {
            city = 'Ho Chi Minh City (Saigon)';
        }

        return city;
    }

    // Normalize city name for comparison (handle spelling variations)
    normalizeCityForComparison(name) {
        if (!name) return '';
        // Convert to lowercase and remove spaces, hyphens, apostrophes
        let normalized = name.toLowerCase().replace(/[\s\-\']/g, '');
        
        // Handle spelling variations
        if (normalized === 'marrakech') normalized = 'marrakesh';
        if (normalized === 'danang') normalized = 'danang';
        if (normalized === 'pusan') normalized = 'busan';
        if (normalized === 'phnompenh') normalized = 'phnompenh';
        if (normalized === 'hue') normalized = 'hue';
        if (normalized === 'perth') normalized = 'perth';
        if (normalized === 'calcutta') normalized = 'kolkata';
        
        return normalized;
    }

    // Filter data by date range
    filterByDateRange(startDate, endDate) {
        return this.combinedData.filter(flight => {
            const flightDate = new Date(flight.date);
            return flightDate >= startDate && flightDate <= endDate;
        });
    }

}

// Global instance
const flightDataManager = new FlightDataManager();

// Initialize data loading when page loads
document.addEventListener('DOMContentLoaded', async function() {
    try {
        await flightDataManager.loadData();
        document.getElementById('last-updated').textContent = new Date().toLocaleString();
        
        setTimeout(() => {
            if (typeof initializeVisualization === 'function') {
                initializeVisualization();
            }
        }, 100);
    } catch (error) {
        console.error('Error loading flight data:', error.message);
    }
});