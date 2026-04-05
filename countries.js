// Airport Code to Country Mapping
window.AIRPORT_TO_COUNTRY = {
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
    'HKG': 'China',

    // Asia - Taiwan
    'TPE': 'ROC (Taiwan)', 'TSA': 'ROC (Taiwan)',

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
    'DEL': 'India', 'BOM': 'India', 'CCU': 'India', 'GAU': 'India',

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
    'TAS': 'Uzbekistan',
    'UBN': 'Mongolia',

    // Asia - Bhutan
    'PBH': 'Bhutan',

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

// City Name to Country Mapping
window.CITY_TO_COUNTRY = {
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
    'Gibraltar': 'British Overseas Territory', 'La Linea de la Concepcion': 'Spain',
    'Lisbon': 'Portugal', 'Porto': 'Portugal',

    // Europe - Italy
    'Rome': 'Italy', 'Florence': 'Italy', 'Venice': 'Italy', 'Milan': 'Italy', 'Verona': 'Italy',
    'Turin': 'Italy', 'Brescia': 'Italy', 'Naples': 'Italy', 'Pompeii': 'Italy',
    'Salerno': 'Italy', 'Amalfi': 'Italy', 'Catania': 'Italy', 'Palermo': 'Italy', 'Modena': 'Italy',
    'Vatican City': 'Vatican City', 'San Marino': 'San Marino', 'Bozen': 'Italy', 'Trieste': 'Italy', 'Novara': 'Italy', 'Pisa': 'Italy',

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
    'Podgorica': 'Montenegro', 'Tirana': 'Albania', 'Iasi': 'Romania',


    // Europe - Greece & Balkans
    'Athens': 'Greece', 'Thessaloniki': 'Greece', 'Ouranoupoli': 'Greece', 'Daphni': 'Greece',

    // Europe - Turkey & Caucasus
    'Istanbul': 'Turkey', 'Ankara': 'Turkey', 'Antalya': 'Turkey', 'Denizli': 'Turkey', 'Pamukkale': 'Turkey',
    'Tbilisi': 'Georgia', 'Yerevan': 'Armenia', 'Gori': 'Georgia', 'Batumi': 'Georgia', 'Kutaisi': 'Georgia',

    // Middle East
    'Beirut': 'Lebanon', 'Tripoli': 'Lebanon', 'Jerusalem': 'Israel', 'Tel Aviv': 'Israel', 'Eilat': 'Israel',
    'Jericho': 'Palestine', 'Ramallah': 'Palestine', 'Bethlehem': 'Palestine',
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
    'Guangzhou': 'China', 'Shenzhen': 'China', 'Foshan': 'China',
    'Hong Kong': 'China', 'Macau': 'China', 'Zhuhai': 'China',
    'Taipei': 'ROC (Taiwan)', 'Taichung': 'ROC (Taiwan)', 'Kaohsiung': 'ROC (Taiwan)',
    'Kuala Lumpur': 'Malaysia',
    'Singapore': 'Singapore', 'Johor Bahru': 'Malaysia', 'Malacca': 'Malaysia', 'Batam': 'Indonesia',
    'Penang': 'Malaysia', 'Kota Kinabalu': 'Malaysia',
    'Moscow': 'Russia', 'St. Petersburg': 'Russia', 'Tallinn': 'Estonia',
    'Da Nang': 'Vietnam', 'Danang': 'Vietnam', 'Hoi An': 'Vietnam', 'Ho Chi Minh City (Saigon)': 'Vietnam', 'Saigon': 'Vietnam', 'Hochiminh': 'Vietnam', 'Ho Chi Minh City': 'Vietnam', 'Hue': 'Vietnam',
    'Vientiane': 'Laos', 'Luang Prabang': 'Laos',
    'Phnom Penh': 'Cambodia', 'Siem Reap': 'Cambodia',
    // Myanmar
    'Yangon': 'Myanmar', 'Mandalay': 'Myanmar', 'Bago': 'Myanmar',
    'Manila': 'Philippines', 'Cebu': 'Philippines',
    'New Delhi': 'India', 'Delhi': 'India', 'Agra': 'India', 'Jaipur': 'India', 'Amritsar': 'India',
    'Mumbai': 'India', 'Kolkata': 'India', 'Calcutta': 'India', 'Chennai': 'India', 'Guwahati': 'India',
    'Colombo': 'Sri Lanka', 'Kandy': 'Sri Lanka', 'Galle': 'Sri Lanka', 'Sigiriya': 'Sri Lanka', 'Dambulla': 'Sri Lanka', 'Anuradhapura': 'Sri Lanka',
    'Dhaka': 'Bangladesh',
    'Paro': 'Bhutan', 'Thimphu': 'Bhutan', 'Punakha': 'Bhutan',
    'Tashkent': 'Uzbekistan', 'Samarkand': 'Uzbekistan', 'Bukhara': 'Uzbekistan', 'Nukus': 'Uzbekistan',
    'Shymkent': 'Kazakhstan', 'Baikonur': 'Kazakhstan',
    'Ulaanbaatar': 'Mongolia',
    'Turkmenabat': 'Turkmenistan', 'Merv': 'Turkmenistan', 'Mary': 'Turkmenistan',
    'Ashgabat': 'Turkmenistan', 'Darvaza': 'Turkmenistan', 'Dashoguz': 'Turkmenistan',
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
    'Abu Dhabi': 'UAE', 'Sharjah': 'UAE',
    'Kuwait': 'Kuwait',
    'Giza': 'Egypt',


    'Jeju': 'South Korea',
    'Dhaka': 'Bangladesh',
    'Baku': 'Azerbaijan',

    //Oceania
    'Sydney': 'Australia', 'Melbourne': 'Australia', 'Brisbane': 'Australia', 'Perth': 'Australia',
    'Auckland': 'New Zealand', 'Wellington': 'New Zealand'
};
