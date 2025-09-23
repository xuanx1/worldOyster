// Flight Data Management System
class FlightDataManager {
    constructor() {
        this.csvData = [];
        this.landJourneyData = [];
        this.flightRadarData = [];
        this.combinedData = [];
        this.currencyRates = {
            SGD: 1.0,      // Base currency
            USD: 0.74,     // 1 SGD = 0.74 USD
            EUR: 0.68,     // 1 SGD = 0.68 EUR
            RMB: 5.32      // 1 SGD = 5.32 RMB
        };
        this.airportCoords = new Map();
        this.cityCoords = new Map();
        this.initializeAirportCoordinates();
        this.initializeCityCoordinates();
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
                        'Tunis': [36.8065, 10.1815],
            'Bizerte': [37.2746, 9.8739],
            'Tangier': [35.7595, -5.8340],
            'Chefchaouen': [35.1688, -5.2636],
            'Rabat': [34.0209, -6.8416],
            'Marrakesh': [31.6295, -7.9811],
            'Algiers': [36.7538, 3.0588],
            'Oran': [35.6969, -0.6331],
            'Constantine': [36.3650, 6.6147],   // Constantine
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

    // Initialize city coordinates for land journeys
    initializeCityCoordinates() {
        const cities = {
            // Japan
            'Sapporo': [43.0642, 141.3469],
            'Tokyo': [35.6762, 139.6503],
            'Osaka': [34.6937, 135.5023],
            'Kyoto': [35.0116, 135.7681],
            'Nara': [34.6851, 135.8048],
            'Hiroshima': [34.3853, 132.4553],
            'Fukuoka': [33.5904, 130.4017],
            'Sendai': [38.2682, 140.8694],
            'Nagoya': [35.1815, 136.9066],
            'Kanazawa': [36.5944, 136.6256],
            'Takayama': [36.1460, 137.2531],
            'Matsumoto': [36.2381, 137.9722],
            
            // Europe
            'Berlin': [52.5200, 13.4050],
            'Munich': [48.1351, 11.5820],
            'Prague': [50.0755, 14.4378],
            'Pilsen': [49.7384, 13.3736],
            'Vienna': [48.2082, 16.3738],
            'Salzburg': [47.8095, 13.0550],
            'Zurich': [47.3769, 8.5417],
            'Geneva': [46.2044, 6.1432],
            'Paris': [48.8566, 2.3522],
            'Versailles': [48.8048, 2.1203],
            'Monaco': [43.7384, 7.4246],
            'Nice': [43.7102, 7.2620],
            'Marseille': [43.2965, 5.3698],
            'Narbonne': [43.1837, 3.0032],
            'Amsterdam': [52.3676, 4.9041],
            'Utrecht': [52.0907, 5.1214],
            'Rotterdam': [51.9244, 4.4777],
            'Brussels': [50.8503, 4.3517],
            'Antwerp': [51.2194, 4.4025],
            'Düsseldorf': [51.2277, 6.7735],
            'Dusseldorf': [51.2277, 6.7735],
            'Cologne': [50.9375, 6.9603],
            'Hamburg': [53.5511, 9.9937],
            'Munich': [48.1351, 11.5820],
            'Stuttgart': [48.7758, 9.1829],
            'Frankfurt': [50.1109, 8.6821],
            'Basel': [47.5596, 7.5886],
            'Innsbruck': [47.2692, 11.4041],
            'London': [51.5074, -0.1278],
            'Edinburgh': [55.9533, -3.1883],
            'Dublin': [53.3498, -6.2603],
            'Madrid': [40.4168, -3.7038],
                        'Gibraltar': [36.1408, -5.3536],
            'La Linea de la Concepcion': [36.1659, -5.3477],
            'Gibraltar': [36.1408, -5.3536],
            'Barcelona': [41.3851, 2.1734],
            'Malaga': [36.7213, -4.4214],
            'Seville': [37.3886, -5.9823],
            'Valencia': [39.4699, -0.3763],
            'Rome': [41.9028, 12.4964],
            'Florence': [43.7696, 11.2558],
            'Venice': [45.4408, 12.3155],
            'Milan': [45.4642, 9.1900],
            'Verona': [45.4384, 10.9916],
            'Turin': [45.0703, 7.6869],
            'Brescia': [45.5416, 10.2118],
            'Brecia': [45.5416, 10.2118],
            'Naples': [40.8518, 14.2681],
            'Pompeii': [40.7489, 14.4989],
            'Salerno': [40.6824, 14.7681],
            'Amalfi': [40.6340, 14.6026],
            'Catania': [37.5079, 15.0830],
            'Palermo': [38.1157, 13.3613],
            'Modena': [44.6478, 10.9249],
            'San Marino': [43.9424, 12.4578],
            'Bozen': [46.4983, 11.3548],
            'Trieste': [45.6495, 13.7768],
            'Novara': [45.4469, 8.6216],
            'Pisa': [43.7228, 10.4017],
            'Stockholm': [59.3293, 18.0686],
            'Gothenburg': [57.7089, 11.9746],
            'Malmö': [55.6044, 13.0038],
            'Malmo': [55.6044, 13.0038],
            'Copenhagen': [55.6761, 12.5683],
            'Oslo': [59.9139, 10.7522],
            'Helsinki': [60.1699, 24.9384],
            'Warsaw': [52.2297, 21.0122],
            'Krakow': [50.0647, 19.9450],
            'Poznan': [52.4064, 16.9252],
            'Kyiv': [50.4501, 30.5234],
            'Lviv': [49.8397, 24.0297],
            'Budapest': [47.4979, 19.0402],
            'Bucharest': [44.4268, 26.1025],
            'Brașov': [45.6427, 25.5887],
            'Brasov': [45.6427, 25.5887],
            'Sofia': [42.6977, 23.3219],
            'Skopje': [41.9973, 21.4280],
            'Belgrade': [44.7866, 20.4489],
            'Novi Sad': [45.2671, 19.8335],
            'Ljubljana': [46.0569, 14.5058],
            'Zagreb': [45.8150, 15.9819],
            'Bratislava': [48.1486, 17.1077],
            'Sarajevo': [43.8563, 18.4131],
            'Mostar': [43.3438, 17.8078],
            'Visoko': [43.9869, 18.1797],
            'Podgorica': [42.4304, 19.2594],
            'Athens': [37.9838, 23.7275],
            'Thessaloniki': [40.6401, 22.9444],
            'Ouranoupoli': [40.3211, 23.9781],
            'Daphni': [40.2397, 24.2036],
            'Istanbul': [41.0082, 28.9784],
            'Ankara': [39.9334, 32.8597],
            'Antalya': [36.8969, 30.7133],
            'Denizli': [37.7765, 29.0864],
            'Pamukkale': [37.9200, 29.1200],
            'Tbilisi': [41.7151, 44.8271],
            'Yerevan': [40.1792, 44.4991],
            'Gori': [41.9847, 44.1097],
            'Batumi': [41.6168, 41.6367],
            'Kutaisi': [42.2679, 42.6958],
            'Beirut': [33.8938, 35.5018],
            'Tripoli': [34.4333, 35.8500],
            'Lisbon': [38.7223, -9.1393],
            'Porto': [41.1579, -8.6291],
            
            // Asia
            'Seoul': [37.5665, 126.9780],
            'Busan': [35.1796, 129.0756],
            'Daegu': [35.8722, 128.6025],
            'Daejeon': [36.3504, 127.3845],
            'Beijing': [39.9042, 116.4074],
            'Tianjin': [39.3434, 117.3616],
            'Shanghai': [31.2304, 121.4737],
            'Hong Kong': [22.3193, 114.1694],
            'Taipei': [25.0330, 121.5654],
            'Singapore': [1.3521, 103.8198],
            'Johor Bahru': [1.4927, 103.7414],
            'Malacca': [2.1896, 102.2501],
            'Batam': [1.1307, 104.0532],
            'Moscow': [55.7558, 37.6176],
            'St. Petersburg': [59.9311, 30.3609],
            'Tallinn': [59.4370, 24.7536],
            'Da Nang': [16.0544, 108.2022],
            'Hoi An': [15.8801, 108.3380],
            'Bangkok': [13.7563, 100.5018],
            'Kuala Lumpur': [3.1390, 101.6869],
            'Singapore': [1.3521, 103.8198],
            'Manila': [14.5995, 120.9842],
            'Ho Chi Minh City': [10.8231, 106.6297],
            'Hanoi': [21.0285, 105.8542],
            'Mumbai': [19.0760, 72.8777],
            'Delhi': [28.7041, 77.1025],
            'Bangalore': [12.9716, 77.5946],
            
            // Middle East
            'Dubai': [25.2048, 55.2708],
            'Abu Dhabi': [24.4539, 54.3773],
            'Doha': [25.2854, 51.5310],
            'Kuwait City': [29.3759, 47.9774],
            'Riyadh': [24.7136, 46.6753],
            'Tel Aviv': [32.0853, 34.7818],
            'Jerusalem': [31.7683, 35.2137],
            'Eilat': [29.5581, 34.9482],
            'Amman': [31.9454, 35.9284],
            'Petra': [30.3285, 35.4444],
            'Taba': [29.4881, 34.8997],
            'Cairo': [30.0444, 31.2357],
            'Alexandria': [31.2001, 29.9187],
            'Luxor': [25.6872, 32.6396],
            'New Cairo City': [30.0330, 31.4978],
            'Larnaca': [34.9176, 33.6291],
            'Kyrenia': [35.3413, 33.3192],
            'Casablanca': [33.5731, -7.5898],
            'Chefchaoun': [35.1689, -5.2636],
            
            // North America
            'New York': [40.7128, -74.0060],
            'Philadelphia': [39.9526, -75.1652],
            'Los Angeles': [34.0522, -118.2437],
            'Los Angles': [34.0522, -118.2437],
            'Chicago': [41.8781, -87.6298],
            'Milwaukee': [43.0389, -87.9065],
            'San Francisco': [37.7749, -122.4194],
            'Seattle': [47.6062, -122.3321],
            'Boston': [42.3601, -71.0589],
            'Atlantic City': [39.3643, -74.4229],
            'Washington DC': [38.9072, -77.0369],
            'Miami': [25.7617, -80.1918],
            'Las Vegas': [36.1699, -115.1398],
            'Toronto': [43.6532, -79.3832],
            'Niagara': [43.0896, -79.0849],
            'Vancouver': [49.2827, -123.1207],
            'Montreal': [45.5017, -73.5673],
            'Ottawa': [45.4215, -75.6972],
            'Tijuana': [32.5149, -117.0382],
            
            // South America
            'São Paulo': [-23.5558, -46.6396],
            'Rio de Janeiro': [-22.9068, -43.1729],
            'Buenos Aires': [-34.6118, -58.3960],
            'La Paz': [-16.5000, -68.1500],
            'Uyuni': [-20.4637, -66.8267],
            'Puno': [-15.8422, -70.0199],
            'Cusco': [-13.5319, -71.9675],
            'Ollantaytambo': [-13.2594, -72.2653],
            'Aguas Calientes': [-13.1549, -72.5250],
            'Aguas Caliente': [-13.1549, -72.5250],
            'Lima': [-12.0464, -77.0428],
            'Ica': [-14.0678, -75.7286],
            'Huacachina': [-14.0873, -75.7627],
            'Santiago': [-33.4489, -70.6693],
            'Bogotá': [4.7110, -74.0721],
            
            // Australia & Oceania
            'Sydney': [-33.8688, 151.2093],
            'Melbourne': [-37.8136, 144.9631],
            'Brisbane': [-27.4698, 153.0251],
            'Perth': [-31.9505, 115.8605],
            'Adelaide': [-34.9285, 138.6007],
            'Auckland': [-36.8485, 174.7633],
            'Wellington': [-41.2924, 174.7787],
            
            // Africa
            'Cape Town': [-33.9249, 18.4241],
            'Johannesburg': [-26.2041, 28.0473],
            'Nairobi': [-1.2864, 36.8172],
            'Lagos': [6.5244, 3.3792],
            'Marrakech': [31.6295, -7.9811],
            'Tunis': [36.8065, 10.1815],
            'Algiers': [36.7538, 3.0588]
        };

        for (const [city, coords] of Object.entries(cities)) {
            this.cityCoords.set(city, coords);
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
            
            console.log('=== FLIGHT DATA PROCESSING COMPLETED ===');
            console.log(`Total flights processed: ${this.csvData.length}`);
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
            console.log('=== ATTEMPTING TO LOAD LAND JOURNEY CSV ===');
            const response = await fetch('./land-journey.csv');
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            console.log('Land journey CSV response OK, reading text...');
            const csvText = await response.text();
            console.log('Land journey CSV text length:', csvText.length);
            console.log('First 200 chars:', csvText.substring(0, 200));
            
            const lines = csvText.split('\n').filter(line => line.trim()); // Filter out empty lines
            const headers = this.parseCSVLine(lines[0]); // First non-empty line is headers
            
            console.log('Land journey headers:', headers);
            console.log(`Processing ${lines.length - 1} land journey records`);
            
            for (let i = 1; i < lines.length; i++) {
                if (lines[i].trim()) {
                    const values = this.parseCSVLine(lines[i]);
                    const journey = {};
                    headers.forEach((header, index) => {
                        journey[header] = values[index] || '';
                    });
                    
                    // Process and enrich land journey data
                    const processedJourney = this.processLandJourneyData(journey);
                    if (processedJourney) {
                        // DEBUG: Check for impossible routes
                        if ((processedJourney.origin === 'Singapore' && processedJourney.destination === 'Helsinki') ||
                            (processedJourney.origin === 'Helsinki' && processedJourney.destination === 'Singapore') ||
                            (processedJourney.origin === 'Singapore' && processedJourney.destination === 'Beijing') ||
                            (processedJourney.origin === 'Beijing' && processedJourney.destination === 'Singapore')) {
                            console.error('IMPOSSIBLE LAND JOURNEY DETECTED IN PROCESSING:', processedJourney);
                            console.error('Raw journey data:', journey);
                            console.error('This should NOT happen - land journey CSV should not contain these routes');
                        }
                        this.landJourneyData.push(processedJourney);
                    }
                }
            }
            
            console.log(`Loaded ${this.landJourneyData.length} land journeys from CSV`);
            return this.landJourneyData;
        } catch (error) {
            console.error('Error loading land journey data:', error);
            console.error('Error details:', error.message);
            console.error('Error stack:', error.stack);
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
                source: 'flight-diary',  // Force source to be flight-diary
                type: 'flight',         // Force type to be flight
                actualCostSGD: hasActualCost ? parseFloat(actualCostSGD) : null,
                costSGD: hasActualCost ? parseFloat(actualCostSGD) : this.estimateFlightCost(flight),
                estimatedCost: flight.estimatedCost || this.estimateFlightCost(flight)
            };

            console.log('=== PROCESSED FLIGHT TYPE CHECK ===');
            console.log('processedFlight.type:', processedFlight.type);
            console.log('processedFlight.source:', processedFlight.source);
            
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

    // Process and standardize land journey data
    processLandJourneyData(journey) {
        try {
            console.log('=== PROCESSING LAND JOURNEY DATA ===');
            console.log('Raw journey object:', journey);
            console.log('Raw date value:', journey.date);
            
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
                    console.log(`Converted date from ${journey.date} to ${convertedDate}`);
                }
            }
            
            // Extract actual cost from CSV (cost_sgd field)
            const actualCostSGD = journey['cost_sgd'] || journey.cost_sgd;
            const hasActualCost = actualCostSGD && !isNaN(parseFloat(actualCostSGD)) && parseFloat(actualCostSGD) > 0;
            
            const processedJourney = {
                date: convertedDate,  // Use converted date
                origin: journey.origin,
                destination: journey.destination,
                mode: journey.mode,
                actualCostSGD: hasActualCost ? parseFloat(actualCostSGD) : null,
                costSGD: hasActualCost ? parseFloat(actualCostSGD) : this.estimateLandJourneyCost(journey),
                estimatedCost: this.estimateLandJourneyCost(journey),
                source: 'land-journey',  // Force source to be land-journey
                type: 'land'             // Force type to be land
            };
            
            console.log('=== PROCESSED LAND JOURNEY TYPE CHECK ===');
            console.log('processedJourney.type:', processedJourney.type);
            console.log('processedJourney.source:', processedJourney.source);

            // Get coordinates for origin and destination cities
            const originCoords = this.cityCoords.get(processedJourney.origin);
            const destinationCoords = this.cityCoords.get(processedJourney.destination);
            
            if (originCoords && destinationCoords) {
                processedJourney.distance = this.haversineDistance(originCoords, destinationCoords);
                processedJourney.originCoords = originCoords;
                processedJourney.destinationCoords = destinationCoords;
            } else {
                console.warn(`Missing coordinates for land journey: ${processedJourney.origin} -> ${processedJourney.destination}`);
            }

            console.log('=== FINAL PROCESSED LAND JOURNEY ===');
            console.log('processedJourney.date:', processedJourney.date);
            console.log('Full processed journey:', processedJourney);

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


    // Main data loading method - loads both flights and land journeys
    async loadData() {
        try {
            console.log('=== STARTING loadData() ===');
            
            // Load flight data
            console.log('Loading flight data...');
            const flightDataResult = await this.loadCSVData();
            console.log('=== FLIGHT DATA LOAD RESULT ===');
            console.log(`Flight data loaded: ${this.csvData.length} records`);
            console.log('Flight data result:', flightDataResult ? flightDataResult.length : 'null/undefined');
            
            // Load land journey data
            console.log('=== ABOUT TO LOAD LAND JOURNEY DATA ===');
            console.log('Loading land journey data...');
            const landJourneyResult = await this.loadLandJourneyData();
            console.log('=== LAND JOURNEY DATA LOAD RESULT ===');
            console.log(`Land journey data loaded: ${this.landJourneyData.length} records`);
            console.log('Land journey result:', landJourneyResult ? landJourneyResult.length : 'null/undefined');
            
            // Combine and sort all data by date
            this.combinedData = [...this.csvData, ...this.landJourneyData]
                .sort((a, b) => new Date(a.date) - new Date(b.date));
                
            console.log('=== DATA TYPE VERIFICATION ===');
            console.log(`Flight data types: ${this.csvData.map(f => f.type).slice(0, 5)}`);
            console.log(`Land journey types: ${this.landJourneyData.map(l => l.type).slice(0, 5)}`);
            console.log(`Combined data types: ${this.combinedData.map(c => c.type).slice(0, 10)}`);
            
            // DEBUG: Check date ranges
            console.log('=== DATE RANGE ANALYSIS ===');
            if (this.csvData.length > 0) {
                const flightDates = this.csvData.map(f => new Date(f.date)).sort((a, b) => a - b);
                console.log(`Flight date range: ${flightDates[0].toISOString().split('T')[0]} to ${flightDates[flightDates.length-1].toISOString().split('T')[0]}`);
            }
            if (this.landJourneyData.length > 0) {
                const landDates = this.landJourneyData.map(l => new Date(l.date)).sort((a, b) => a - b);
                console.log(`Land journey date range: ${landDates[0].toISOString().split('T')[0]} to ${landDates[landDates.length-1].toISOString().split('T')[0]}`);
            }
            if (this.combinedData.length > 0) {
                const combinedDates = this.combinedData.map(c => new Date(c.date)).sort((a, b) => a - b);
                console.log(`Combined date range: ${combinedDates[0].toISOString().split('T')[0]} to ${combinedDates[combinedDates.length-1].toISOString().split('T')[0]}`);
            }
                
            console.log('Data loading complete:', {
                flights: this.csvData.length,
                landJourneys: this.landJourneyData.length,
                combined: this.combinedData.length
            });
            
            // Show first few records with their types
            console.log('First 5 combined records:');
            this.combinedData.slice(0, 5).forEach((record, i) => {
                console.log(`${i+1}. Type: ${record.type}, Source: ${record.source}, Date: ${record.date}`);
                if (record.type === 'land') {
                    console.log(`   Land: ${record.origin} -> ${record.destination} (${record.mode})`);
                } else {
                    console.log(`   Flight: ${record.fromCode} -> ${record.toCode}`);
                }
            });
            
            return this.combinedData;
        } catch (error) {
            console.error('Error loading data:', error);
            throw error;
        }
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
    console.log('Loading all travel data...');
    
    try {
        await flightDataManager.loadData();
        
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