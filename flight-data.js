// Flight Data Management System
class FlightDataManager {
    constructor() {
        this.csvData = [];
        this.flightRadarData = [];
        this.combinedData = [];
        this.currencyRates = {
            SGD: 1.0,      // Base currency
            USD: 0.74,     // 1 SGD = 0.74 USD
            EUR: 0.68,     // 1 SGD = 0.68 EUR
            RMB: 5.32      // 1 SGD = 5.32 RMB
        };
        this.airportCoords = new Map();
        this.initializeAirportCoordinates();
    }

    // Initialize airport coordinates for mapping
    initializeAirportCoordinates() {
        // COMPLETE airports database - ALL airports from CSV file
        const airports = {
            // USA
            'EWR': [40.6925, -74.1686], // Newark
            'FLL': [26.0742, -80.1506], // Fort Lauderdale
            'LGA': [40.7769, -73.8740], // LaGuardia
            'MSY': [29.9934, -90.2581], // New Orleans
            'LAS': [36.0840, -115.1537], // Las Vegas
            'SEA': [47.4502, -122.3088], // Seattle
            'JFK': [40.6413, -73.7781], // JFK
            'MIA': [25.7933, -80.2906], // Miami
            'ORD': [41.9742, -87.9073], // Chicago O'Hare
            'BUR': [34.2007, -118.3588], // Burbank
            'LAX': [33.9416, -118.4085], // Los Angeles
            'SFO': [37.6213, -122.3790], // San Francisco
            'DEN': [39.8561, -104.6737], // Denver
            
            // South America
            'BOG': [4.7016, -74.1469],  // Bogota
            'LPB': [-16.5133, -68.1925], // La Paz
            'CUZ': [-13.5355, -71.9388], // Cusco
            'LIM': [-12.0219, -77.1143], // Lima
            'SCL': [-33.3927, -70.7857], // Santiago
            
            // Mexico
            'MEX': [19.4363, -99.0721], // Mexico City
            'NLU': [19.4741, -99.0185], // Santa Lucia
            'OAX': [17.0006, -96.7269], // Oaxaca
            
            // Europe
            'MXP': [45.6306, 8.7281],   // Milan Malpensa
            'BVA': [49.4545, 2.1126],   // Beauvais
            'ZRH': [47.4647, 8.5492],   // Zurich
            'AMS': [52.3105, 4.7683],   // Amsterdam
            'CDG': [49.0097, 2.5479],   // Paris CDG
            'BER': [52.3667, 13.5033],  // Berlin
            'PRG': [50.1008, 14.2632],  // Prague
            'BUD': [47.4381, 19.2558],  // Budapest
            'OTP': [44.5711, 26.0850],  // Bucharest
            'FRA': [50.0379, 8.5622],   // Frankfurt
            'LHR': [51.4700, -0.4543],  // London Heathrow
            'LGW': [51.1537, -0.1821],  // London Gatwick
            'BGY': [45.6739, 9.7042],   // Bergamo
            'MLA': [35.8575, 14.4775],  // Malta
            'TUN': [36.8510, 10.2272],  // Tunis
            'TRF': [59.1867, 10.2586],  // Torp Sandefjord
            'ARN': [59.6519, 17.9186],  // Stockholm Arlanda
            'SOF': [42.6952, 23.4114],  // Sofia
            'BEG': [44.8184, 20.3091],  // Belgrade
            'LIN': [45.4456, 9.2767],   // Milan Linate
            'BRU': [50.9014, 4.4844],   // Brussels
            'GVA': [46.2381, 6.1090],   // Geneva
            'MAD': [40.4719, -3.5626],  // Madrid
            'LIS': [38.7813, -9.1357],  // Lisbon
            'TIA': [41.4147, 19.7206],  // Tirana
            'SJJ': [43.8246, 18.3316],  // Sarajevo
            'TGD': [42.3594, 19.2519],  // Podgorica
            'PMO': [38.1756, 13.0910],  // Palermo
            'TXL': [52.5597, 13.2877],  // Berlin Tegel (closed)
            'HEL': [60.3172, 24.9633],  // Helsinki
            'ATH': [37.9364, 23.9445],  // Athens
            'IAS': [47.1785, 27.6206],  // Iasi
            'IST': [41.2753, 28.7519],  // Istanbul Airport
            'FCO': [41.8002, 12.2389],  // Rome Fiumicino
            'BCN': [41.2971, 2.0784],   // Barcelona
            'OPO': [41.2481, -8.6814],  // Porto
            'RAK': [31.6069, -8.0363],  // Marrakech
            'SKG': [40.5197, 22.9709],  // Thessaloniki
            'MRS': [43.4393, 5.2214],   // Marseille
            'WAW': [52.1657, 20.9671],  // Warsaw
            'HAM': [53.6304, 9.9882],   // Hamburg
            
            // Turkey & Caucasus
            'SAW': [40.9059, 29.3092],  // Istanbul Sabiha
            'ESB': [40.1281, 32.9951],  // Ankara Esenboga
            'AYT': [36.8987, 30.8005],  // Antalya
            'TBS': [41.6692, 44.9547],  // Tbilisi
            'BUS': [41.6102, 41.5997],  // Batumi
            'GYD': [40.4675, 50.0467],  // Baku
            'EVN': [40.1474, 44.3959],  // Yerevan
            
            // Middle East
            'SIN': [1.3644, 103.9915],  // Singapore
            'JED': [21.6796, 39.1564],  // Jeddah
            'MCT': [23.5933, 58.2844],  // Muscat
            'AUH': [24.4331, 54.6511],  // Abu Dhabi
            'SHJ': [25.3286, 55.5172],  // Sharjah
            'DOH': [25.2854, 51.6085],  // Doha
            'TLV': [32.0114, 34.8866],  // Tel Aviv
            'LCA': [34.8751, 33.6249],  // Larnaca
            'CAI': [30.1219, 31.4056],  // Cairo
            'AMM': [31.7226, 35.9932],  // Amman
            'BEY': [33.8209, 35.4883],  // Beirut
            'KWI': [29.2267, 47.9689],  // Kuwait
            'BAH': [26.2707, 50.6336],  // Manama, Bahrain
            
            // Africa
            'ALG': [36.6910, 3.2155],   // Algiers
            'CZL': [36.2760, 6.6204],   // Constantine
            'SPX': [30.1167, 31.1500],  // Giza Sphinx
            
            // Asia - East Asia
            'HND': [35.5494, 139.7798], // Tokyo Haneda
            'CTS': [42.7752, 141.6929], // Sapporo New Chitose
            'ITM': [34.7855, 135.4381], // Osaka Itami
            'ICN': [37.4602, 126.4407], // Seoul Incheon
            'CJU': [33.5113, 126.4930], // Jeju
            'GMP': [37.5583, 126.7906], // Seoul Gimpo
            'PUS': [35.1795, 129.0756], // Busan
            
            // Asia - Southeast Asia
            'MNL': [14.5086, 121.0194], // Manila
            'KUL': [2.7456, 101.7072],  // Kuala Lumpur
            'CNX': [18.7668, 98.9628],  // Chiang Mai
            'BKK': [13.6900, 100.7501], // Bangkok Suvarnabhumi
            'DAD': [16.0439, 108.1987], // Da Nang
            
            // Asia - South Asia
            'BOM': [19.0896, 72.8656],  // Mumbai
            'DEL': [28.5562, 77.1000],  // Delhi
            'CCU': [22.6549, 88.4469],  // Kolkata
            'DAC': [23.8103, 90.4125],  // Dhaka
            
            // China
            'CAN': [23.3924, 113.2988], // Guangzhou
            'PKX': [39.5098, 116.4105], // Beijing Daxing
            
            // Russia
            'VKO': [55.5915, 37.2615],  // Moscow Vnukovo
            
            // Ukraine
            'KBP': [50.3450, 30.8947],  // Kiev Boryspil
            'LWO': [49.8125, 23.9561],  // Lviv
        };

        for (const [code, coords] of Object.entries(airports)) {
            this.airportCoords.set(code, coords);
        }
    }

    // Parse CSV data
    async loadCSVData() {
        try {
            const response = await fetch('./flightdiary_2025_09_15_05_15.csv');
            const csvText = await response.text();
            
            const lines = csvText.split('\n').filter(line => line.trim()); // Filter out empty lines
            const headers = this.parseCSVLine(lines[0]); // First non-empty line is headers
            
            console.log('=== CSV PARSING DEBUG ===');
            console.log('Total lines after filtering:', lines.length);
            console.log('First line (headers):', lines[0]);
            console.log('CSV Headers:', headers);
            console.log('Second line (first data):', lines[1]);
            
            this.csvData = [];
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = this.parseCSVLine(lines[i]);
                    const flight = {};
                    headers.forEach((header, index) => {
                        flight[header] = values[index] || '';
                    });
                    
                    console.log(`=== RAW FLIGHT PARSING ROW ${i} ===`);
                    console.log('Raw values array:', values);
                    console.log('Headers length:', headers.length, 'Values length:', values.length);
                    console.log('Raw flight object:', flight);
                    console.log('flight["Date"]:', flight["Date"]);
                    console.log('flight.Date:', flight.Date);
                    
                    // Process and enrich flight data
                    const processedFlight = this.processFlightData(flight, 'csv');
                    if (processedFlight) {
                        console.log(`Processed flight:`, processedFlight);
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
            console.log('=== PROCESSING FLIGHT DATA ===');
            console.log('Raw flight object:', flight);
            console.log('flight.Date:', flight.Date);
            console.log('flight.date:', flight.date);
            
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
                source: source,
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

            console.log('=== FINAL PROCESSED FLIGHT ===');
            console.log('processedFlight.date:', processedFlight.date);
            console.log('Full processed flight:', processedFlight);

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
        
        const fromCoords = this.airportCoords.get(fromCode);
        const toCoords = this.airportCoords.get(toCode);
        
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
    console.log('Loading flight data...');
    
    try {
        await flightDataManager.loadCSVData();
        
        // Update last updated timestamp
        document.getElementById('last-updated').textContent = new Date().toLocaleString();
        
        // Wait a bit for DOM to be fully ready, then initialize visualization
        setTimeout(() => {
            if (typeof initializeVisualization === 'function') {
                console.log('Initializing visualization...');
                initializeVisualization();
            }
        }, 500);
        
        console.log('Flight data loaded successfully');
    } catch (error) {
        console.error('Error loading flight data:', error);
    }
});