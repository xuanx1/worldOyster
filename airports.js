// Airport Coordinates and Airport-to-City Mapping
window.AIRPORT_COORDINATES = {
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
    'RAK': [31.6295, -7.9811],  // Marrakech (city center)
    'SKG': [40.5197, 22.9709],  // Thessaloniki
    'MRS': [43.2965, 5.3698],   // Marseille (city center)
    'WAW': [52.1657, 20.9671],  // Warsaw
    'HAM': [53.6304, 9.9882],   // Hamburg
    'VKO': [55.5915, 37.2615],  // Moscow Vnukovo
    'KBP': [50.3450, 30.8947],  // Kiev Boryspil
    'LWO': [49.8125, 23.9561],  // Lviv

    // Turkey & Caucasus
    'SAW': [40.9059, 29.3092],  // Istanbul Sabiha
    'ESB': [40.1281, 32.9951],  // Ankara Esenboga
    'AYT': [36.8987, 30.8005],  // Antalya
    'TBS': [41.6692, 44.9547],  // Tbilisi
    'BUS': [41.6102, 41.5997],  // Batumi
    'GYD': [40.4675, 50.0467],  // Baku
    'EVN': [40.1474, 44.3959],  // Yerevan

    // Middle East
    'JED': [21.6796, 39.1564],  // Jeddah
    'MCT': [23.5933, 58.2844],  // Muscat
    'AUH': [24.4331, 54.6511],  // Abu Dhabi
    'SHJ': [25.3286, 55.5172],  // Sharjah
    'DOH': [25.2854, 51.6085],  // Doha
    'TLV': [32.0114, 34.8866],  // Tel Aviv
    'LCA': [34.9176, 33.6291],  // Larnaca (city center)
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
    'Tamanrasset': [22.7858, 5.5228],
    'TMR': [22.7858, 5.5228], // Tamanrasset / Aguenar
    'Constantine': [36.3650, 6.6147],   // Constantine
    'SPX': [30.1167, 31.1500],  // Giza Sphinx

    // Asia
    'HND': [35.5494, 139.7798], // Tokyo Haneda
    'CTS': [42.7752, 141.6929], // Sapporo New Chitose
    'ITM': [34.7855, 135.4381], // Osaka Itami
    'ICN': [37.4602, 126.4407], // Seoul Incheon
    'CJU': [33.5113, 126.4930], // Jeju
    'GMP': [37.5583, 126.7906], // Seoul Gimpo
    'PUS': [35.1795, 129.0756], // Busan
    'FNJ': [39.2241, 125.7625], // Pyongyang Sunan
    'MNL': [14.5086, 121.0194], // Manila
    'KUL': [2.7456, 101.7072],  // Kuala Lumpur
    'CGK': [-6.1256, 106.6560], // Jakarta Soekarno-Hatta
    'CNX': [18.7668, 98.9628],  // Chiang Mai
    'BKK': [13.6900, 100.7501], // Bangkok Suvarnabhumi
    'SGN': [10.8188, 106.6519], // Ho Chi Minh City (Saigon)
    'DAD': [16.0439, 108.1987], // Da Nang
    'BOM': [19.0896, 72.8656],  // Mumbai
    'DEL': [28.5562, 77.1000],  // Delhi
    'CCU': [22.6549, 88.4469],  // Kolkata
    'DAC': [23.8103, 90.4125],  // Dhaka
    'PEK': [40.0799, 116.6031], // Beijing Capital
    'CAN': [23.3924, 113.2988], // Guangzhou
    'PKX': [39.5098, 116.4105], // Beijing Daxing
    'WUH': [30.7838, 114.2081], // Wuhan Tianhe
    'CKG': [29.4316, 106.9123], // Chongqing
    'TFU': [30.5728, 104.0668], // Chengdu Tianfu
    'HAK': [19.9349, 110.4591], // Haikou Meilan
    'LHW': [36.5152, 103.6203], // Lanzhou Zhongchuan
    'SIN': [1.3644, 103.9915],  // Singapore
    'RGN': [16.9073, 96.1333],   // Yangon / Mingaladon
    'MDL': [21.7028, 95.9778],   // Mandalay / Mandalay Intl
    'CMB': [7.1803, 79.8842],    // Colombo / Bandaranaike
    'VTE': [17.9883, 102.5633], // Vientiane Wattay
    'YIA': [-7.9006, 110.0568], // Yogyakarta International
    'BKI': [5.9372, 116.0517],  // Kota Kinabalu
    'TPE': [25.0777, 121.2320], // Taipei Taoyuan
    'DXB': [25.2532, 55.3657],  // Dubai International
    'KEF': [63.9850, -22.6059], // Keflavik International
    'GAU': [26.1061, 91.5859],  // Guwahati
    'PBH': [27.4032, 89.4246],  // Paro, Bhutan
    'TAS': [41.2571, 69.2817],  // Tashkent
};

window.AIRPORT_TO_CITY = {
    // New York area airports -> New York
    'JFK': 'New York',
    'LGA': 'New York',
    'EWR': 'New York',

    // Los Angeles area airports -> Los Angeles
    'LAX': 'Los Angeles',
    'BUR': 'Los Angeles',

    // Miami area airports -> Miami
    'MIA': 'Miami',
    'FLL': 'Miami',

    // Paris area airports -> Paris
    'CDG': 'Paris',
    'ORY': 'Paris',
    'BVA': 'Paris',

    // London area airports -> London
    'LHR': 'London',
    'LGW': 'London',
    'STN': 'London',
    'LTN': 'London',

    // Milan area airports -> Milan
    'MXP': 'Milan',
    'LIN': 'Milan',
    'BGY': 'Milan',
    // Malta airport -> Valletta
    'MLA': 'Valletta',

    // Tokyo area airports -> Tokyo
    'HND': 'Tokyo',
    'NRT': 'Tokyo',

    // Osaka area airports -> Osaka
    'KIX': 'Osaka',
    'ITM': 'Osaka',

    // Seoul area airports -> Seoul
    'ICN': 'Seoul',
    'GMP': 'Seoul',
    // Pyongyang Sunan airport -> Pyongyang (use city coordinates)
    'FNJ': 'Pyongyang',

    // Beijing area airports -> Beijing
    'PEK': 'Beijing',
    'PKX': 'Beijing',

    // Shanghai area airports -> Shanghai
    'PVG': 'Shanghai',
    'SHA': 'Shanghai',

    // Istanbul area airports -> Istanbul
    'IST': 'Istanbul',
    'SAW': 'Istanbul',

    // Moscow area airports -> Moscow
    'SVO': 'Moscow',
    'VKO': 'Moscow',
    'DME': 'Moscow',

    // Chicago area airports -> Chicago
    'ORD': 'Chicago',
    'MDW': 'Chicago',

    // Bangkok area airports -> Bangkok
    'BKK': 'Bangkok',
    'DMK': 'Bangkok',

    // Myanmar airports -> Yangon / Mandalay
    'RGN': 'Yangon',
    'MDL': 'Mandalay',

    // Sri Lanka -> Colombo
    'CMB': 'Colombo',

    // Mexico City area airports -> Mexico City
    'MEX': 'Mexico City',
    'NLU': 'Mexico City',

    // Berlin area airports -> Berlin
    'BER': 'Berlin',
    'TXL': 'Berlin',
    'SXF': 'Berlin',

    // Oslo area airports -> Oslo
    'OSL': 'Oslo',
    'TRF': 'Oslo',

    // Rome area airports -> Rome
    'FCO': 'Rome',
    'CIA': 'Rome',

    // Helsinki area airports -> Helsinki
    'HEL': 'Helsinki',

    // Bucharest area airports -> Bucharest
    'OTP': 'Bucharest',

    // Sapporo area airports -> Sapporo
    'CTS': 'Sapporo',

    // Lanzhou area airports -> Lanzhou
    'LHW': 'Lanzhou',

    // Guangzhou area airports -> Guangzhou
    'CAN': 'Guangzhou',

    // Wuhan area airports -> Wuhan
    'WUH': 'Wuhan',

    // Chongqing & Chengdu airports -> Chongqing / Chengdu
    'CKG': 'Chongqing',
    'TFU': 'Chengdu',

    // Haikou area airports -> Haikou
    'HAK': 'Haikou',

    // Jakarta area airports -> Jakarta
    'CGK': 'Jakarta',

    // Yogyakarta area airports -> Yogyakarta
    'YIA': 'Yogyakarta',

    // Kota Kinabalu area airports -> Kota Kinabalu
    'BKI': 'Kota Kinabalu',

    // Beirut area airports -> Beirut
    'BEY': 'Beirut',

    // Cairo area airports -> Cairo
    'CAI': 'Cairo',

    // Antalya area airports -> Antalya
    'AYT': 'Antalya',

    // Ankara area airports -> Ankara
    'ESB': 'Ankara',

    // Podgorica area airports -> Podgorica
    'TGD': 'Podgorica',

    // Sofia area airports -> Sofia
    'SOF': 'Sofia',

    // Sarajevo area airports -> Sarajevo
    'SJJ': 'Sarajevo',

    // Thessaloniki area airports -> Thessaloniki
    'SKG': 'Thessaloniki',

    // Tunis area airports -> Tunis
    'TUN': 'Tunis',

    // Palermo area airports -> Palermo
    'PMO': 'Palermo',

    // Algiers area airports -> Algiers
    'ALG': 'Algiers',
    'TMR': 'Tamanrasset',

    // Marrakesh area airports -> Marrakesh
    'RAK': 'Marrakesh',

    // Lisbon area airports -> Lisbon
    'LIS': 'Lisbon',

    // Porto area airports -> Porto
    'OPO': 'Porto',

    // Madrid area airports -> Madrid
    'MAD': 'Madrid',

    // Zurich area airports -> Zurich
    'ZRH': 'Zurich',

    // Prague area airports -> Prague
    'PRG': 'Prague',

    // Budapest area airports -> Budapest
    'BUD': 'Budapest',

    // Lviv area airports -> Lviv
    'LWO': 'Lviv',

    // Kyiv area airports -> Kyiv
    'KBP': 'Kyiv',

    // Warsaw area airports -> Warsaw
    'WAW': 'Warsaw',

    // Stockholm area airports -> Stockholm
    'ARN': 'Stockholm',

    // Hamburg area airports -> Hamburg
    'HAM': 'Hamburg',

    // Brussels area airports -> Brussels
    'BRU': 'Brussels',

    // Amsterdam area airports -> Amsterdam
    'AMS': 'Amsterdam',

    // Seattle area airports -> Seattle
    'SEA': 'Seattle',

    // La Paz area airports -> La Paz
    'LPB': 'La Paz',

    // Lima area airports -> Lima
    'LIM': 'Lima',

    // Perth area airports -> Perth
    'PER': 'Perth',

    // Phnom Penh & Siem Reap area airports -> Phnom Penh / Siem Reap
    'KTI': 'Phnom Penh',
    'REP': 'Siem Reap',

    // Hue area airports (if any) -> Hue
    'HUI': 'Hue',

    // Belgrade area airports -> Belgrade
    'BEG': 'Belgrade',

    // Amman area airports -> Amman
    'AMM': 'Amman',

    // Tbilisi area airports -> Tbilisi
    'TBS': 'Tbilisi',

    // Yerevan area airports -> Yerevan
    'EVN': 'Yerevan',

    // Singapore area airports -> Singapore
    'SIN': 'Singapore',
    'TPE': 'Taipei',
    'DXB': 'Dubai',
    'KEF': 'Reykjavik',

    // Airports not previously mapped — use string-parsed city name
    // ensures airportToCityMap lookup always wins over string parsing
    'ATH': 'Athens',
    'AUH': 'Abu Dhabi',
    'BAH': 'Manama',
    'BCN': 'Barcelona',
    'BOG': 'Bogotá',
    'BOM': 'Mumbai',
    'BUS': 'Batumi',
    'CCU': 'Kolkata',
    'CJU': 'Jeju',
    'CTA': 'Catania',
    'CUZ': 'Cusco',
    'CZL': 'Constantine',
    'DAC': 'Dhaka',
    'DAD': 'Da Nang',
    'DEL': 'Delhi',
    'DEN': 'Denver',
    'DOH': 'Doha',
    'GVA': 'Geneva',
    'GYD': 'Baku',
    'IAS': 'Iasi',
    'JED': 'Jeddah',
    'KUL': 'Kuala Lumpur',
    'KWI': 'Kuwait City',
    'LAS': 'Las Vegas',
    'LCA': 'Larnaca',
    'MCT': 'Muscat',
    'MNL': 'Manila',
    'MRS': 'Marseille',
    'MSY': 'New Orleans',
    'NAP': 'Naples',
    'OAX': 'Oaxaca',
    'PUS': 'Busan',
    'SCL': 'Santiago',
    'SFO': 'San Francisco',
    'SGN': 'Ho Chi Minh City (Saigon)',
    'SHJ': 'Sharjah',
    'SPX': 'Giza',
    'TIA': 'Tirana',
    'TLV': 'Tel Aviv',
    'VTE': 'Vientiane',
    'GAU': 'Guwahati',
    'PBH': 'Paro',
    'TAS': 'Tashkent',
};
