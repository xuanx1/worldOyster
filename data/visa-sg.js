// Visa requirements for Singapore passport holders
// Sources: ICA, Henley Passport Index, IATA Timatic, VisaIndex
// VISA_SG_ASOF is shown in the widget header - bump it whenever either map below
// is reviewed, so the UI never claims to be fresher than the data.
window.VISA_SG_ASOF = '19 Aug 2026';
// VISA_SG   = NATIONAL visa policy of the sovereign state you enter on.
// Categories: 'free' = visa-free, 'arrival' = visa on arrival, 'evisa' = e-Visa, 'required' = visa required
// LOCAL_PERMIT (bottom of file) is a SEPARATE axis: a restricted-area permit for the place
// itself, needed on top of whatever the national policy says. Visa-free is not permit-free —
// PR China is visa-free for SG passports, but Tibet still needs a Tibet Travel Permit.
window.VISA_SG = {
    // Asia
    'Japan': 'free', 'ROK Korea': 'free', 'PR China': 'free',
    'Hong Kong SAR': 'free', 'Macau SAR': 'free', 'ROC Taiwan': 'free',
    'Malaysia': 'free', 'Indonesia': 'free', 'Thailand': 'free',
    'Vietnam': 'free', 'Cambodia': 'free', 'Laos': 'free',
    'Myanmar': 'free', 'Philippines': 'free', 'Brunei': 'free',
    'India': 'evisa', 'Sri Lanka': 'free', 'Bangladesh': 'arrival',
    'Bhutan': 'evisa', 'Nepal': 'arrival', 'Pakistan': 'evisa',
    'Afghanistan': 'evisa', 'Maldives': 'arrival', 'Mongolia': 'free',
    'Timor-Leste': 'free', 'Singapore': 'free',
    'Uzbekistan': 'free', 'Kazakhstan': 'free', 'Turkmenistan': 'required',
    'Kyrgyzstan': 'free', 'Tajikistan': 'free',
    'Gorno-Badakhshan': 'evisa',   // Tajikistan
    'Azerbaijan': 'evisa', 'Georgia': 'free', 'Armenia': 'free',
    'DPR Korea': 'required',
    'Andaman and Nicobar Islands': 'evisa', 'Lakshadweep': 'evisa',   // India
    'Tibet': 'free',                                                 // PR China
    'Kinmen': 'free',                                                // ROC Taiwan
    'Meizhou Island': 'free',                                        // PR China
    'Christmas Island': 'free', 'Cocos Islands': 'free',
    'British Indian Ocean Territory': 'required',
    // Middle East
    'Israel': 'free', 'Palestine': 'free', 'Jordan': 'arrival',
    'Lebanon': 'arrival', 'Saudi Arabia': 'evisa', 'UAE': 'free',
    'Oman': 'evisa', 'Kuwait': 'evisa', 'Qatar': 'free',
    'Bahrain': 'free', 'Iraq': 'evisa', 'Iran': 'free',
    'Syria': 'evisa', 'Yemen': 'required', 'Socotra': 'required', 'Turkey': 'free',   // Socotra: Yemen
    // Europe
    'Albania': 'free', 'Andorra': 'free', 'Austria': 'free',
    'Belarus': 'free', 'Belgium': 'free',
    'Bosnia and Herzegovina': 'free', 'Bulgaria': 'free',
    'Croatia': 'free', 'Cyprus': 'free', 'Czech Republic': 'free',
    'Denmark': 'free', 'Estonia': 'free', 'Finland': 'free',
    'France': 'free', 'Germany': 'free', 'Greece': 'free',
    'Hungary': 'free', 'Iceland': 'free', 'Ireland': 'free',
    'Italy': 'free', 'Latvia': 'free', 'Liechtenstein': 'free',
    'Lithuania': 'free', 'Luxembourg': 'free', 'Malta': 'free',
    'Moldova': 'free', 'Monaco': 'free', 'Montenegro': 'free',
    'Netherlands': 'free', 'North Macedonia': 'free', 'Norway': 'free',
    'Poland': 'free', 'Portugal': 'free', 'Romania': 'free',
    'Russia': 'evisa', 'San Marino': 'free', 'Serbia': 'free',
    'Slovakia': 'free', 'Slovenia': 'free', 'Spain': 'free',
    'Sweden': 'free', 'Switzerland': 'free', 'UK': 'free',
    'Ukraine': 'free', 'Vatican City': 'free',
    'Kosovo': 'free',
    'Gibraltar': 'free', 'Faroe Islands': 'free', 'Guernsey': 'free',
    'Jersey': 'free', 'Isle of Man': 'free', 'Svalbard': 'free',
    'Azores': 'free', 'Madeira': 'free', 'Canary Islands': 'free',
    // Africa
    'Algeria': 'required', 'Angola': 'free', 'Benin': 'free',
    'Botswana': 'free', 'Burkina Faso': 'free',
    'Burundi': 'arrival', 'Cameroon': 'evisa', 'Cape Verde': 'free',
    'Central African Republic': 'required', 'Chad': 'evisa',
    'Comoros': 'arrival', "Côte d'Ivoire": 'free',
    'DR Congo': 'evisa', 'Djibouti': 'free',
    'Egypt': 'evisa', 'Equatorial Guinea': 'evisa',
    'Eritrea': 'required', 'Eswatini': 'free', 'Ethiopia': 'evisa',
    'Gabon': 'free', 'Gambia': 'free',
    'Ghana': 'free', 'Guinea': 'free', 'Guinea-Bissau': 'arrival',
    'Kenya': 'free', 'Lesotho': 'free', 'Liberia': 'evisa',
    'Libya': 'evisa', 'Madagascar': 'arrival', 'Malawi': 'free',
    'Mali': 'required', 'Mauritania': 'evisa', 'Mauritius': 'free',
    'Morocco': 'free', 'Mozambique': 'free', 'Namibia': 'free',
    'Niger': 'required', 'Nigeria': 'evisa',
    'Republic of the Congo': 'required', 'Rwanda': 'free',
    'São Tomé and Príncipe': 'evisa', 'Senegal': 'free',
    'Seychelles': 'free', 'Sierra Leone': 'arrival',
    'Somalia': 'evisa', 'South Africa': 'free',
    'South Sudan': 'evisa', 'Sudan': 'required',
    'Tanzania': 'free', 'Togo': 'evisa', 'Tunisia': 'free',
    'Uganda': 'evisa', 'Sahrawi Republic': 'required',
    'Zambia': 'free', 'Zimbabwe': 'free',
    'Réunion': 'free', 'Mayotte': 'free',
    'Saint Helena': 'free', 'Ascension Island': 'free', 'Tristan da Cunha': 'free',
    // Americas
    'Argentina': 'free', 'Bahamas': 'free', 'Belize': 'free',
    'Bolivia': 'arrival', 'Brazil': 'free', 'Canada': 'free',
    'Chile': 'free', 'Colombia': 'free', 'Costa Rica': 'free',
    'Cuba': 'free', 'Dominican Republic': 'free', 'Ecuador': 'free',
    'El Salvador': 'free', 'Guatemala': 'free', 'Guyana': 'free',
    'Haiti': 'free', 'Honduras': 'free', 'Jamaica': 'free',
    'Mexico': 'free', 'Nicaragua': 'free', 'Panama': 'free',
    'Paraguay': 'free', 'Peru': 'free', 'Suriname': 'free',
    'Trinidad and Tobago': 'free', 'Uruguay': 'free', 'USA': 'free',
    'Venezuela': 'evisa',
    'Anguilla': 'free', 'Antigua and Barbuda': 'free', 'Aruba': 'free',
    'Barbados': 'free', 'Bermuda': 'free', 'Bonaire': 'free',
    'British Virgin Islands': 'free', 'Cayman Islands': 'free',
    'Curaçao': 'free', 'Dominica': 'free', 'Falkland Islands': 'free',
    'French Guiana': 'free', 'Greenland': 'free',
    'Grenada': 'free', 'Guadeloupe': 'free', 'Martinique': 'free',
    'Montserrat': 'free', 'Puerto Rico': 'free',
    'Saint Barthélemy': 'free', 'Saint Kitts and Nevis': 'free',
    'Saint Lucia': 'free', 'Saint Vincent and the Grenadines': 'free',
    'Saint Martin / Sint Maarten': 'free', 'Turks and Caicos Islands': 'free',
    'US Virgin Islands': 'free',
    // Oceania
    'Australia': 'free', 'Fiji': 'free', 'Kiribati': 'free',
    'Marshall Islands': 'free', 'Micronesia': 'free', 'Nauru': 'free',
    'New Caledonia': 'free', 'New Zealand': 'free', 'Palau': 'arrival',
    'Papua New Guinea': 'free', 'Samoa': 'free', 'Solomon Islands': 'free',
    'Tonga': 'free', 'Tuvalu': 'free', 'Vanuatu': 'free',
    'American Samoa': 'free', 'Cook Islands': 'free',
    'French Polynesia': 'free', 'Guam': 'free', 'Hawaii': 'free', 'Niue': 'free',
    'Norfolk Island': 'free', 'Northern Mariana Islands': 'free',
    'Pitcairn Islands': 'free', 'Tokelau': 'free',
    'Wallis and Futuna': 'free',
    // Disputed / unrecognised
    'Transnistria': 'free', 'Abkhazia': 'required',
    'South Ossetia': 'required', 'Northern Cyprus': 'free',
    'Somaliland': 'required', 'Artsakh': 'required',
    // Special territories
    'Antarctica': 'required',   // no national visa regime exists
    'Baikonur': 'free',         // Kazakhstan
    'Kaliningrad': 'evisa',
    'Kish Island': 'free',
    'Panmunjom': 'free',        // ROK
    'Ceuta': 'free',
    'Melilla': 'free',
    'Rapa Nui': 'free',
    'Galapagos': 'free'
};

// -- Pre-travel authorisations (ETA / ESTA) ----------------------------------
// A THIRD axis. 'free' above means no visa - it does NOT mean no paperwork.
// These are national electronic authorisations a Singapore passport still needs
// before boarding, on top of visa-free entry.
// Verified 19 Aug 2026; deliberately NOT listed:
//   ROK Korea  - K-ETA waived for SG until 31 Dec 2026 (e-Arrival Card instead)
//   Schengen   - ETIAS launch unscheduled as of Jul 2026, so nothing to apply for
window.TRAVEL_AUTH = {
    'USA': 'ESTA (Visa Waiver Programme)',
    'Canada': 'eTA - required for air arrivals',
    'UK': 'UK ETA - mandatory for SG passports since 8 Jan 2025',
    'Australia': 'ETA (subclass 601)',
    'New Zealand': 'NZeTA + International Visitor Levy',
    'Israel': 'ETA-IL - mandatory since 1 Jan 2025',
    'ROK Korea': 'e-Arrival Card - K-ETA waived for SG to 31 Dec 2026',
    // US territories entered under the same Visa Waiver Programme
    'Hawaii': 'ESTA (Visa Waiver Programme)',
    'Puerto Rico': 'ESTA (Visa Waiver Programme)',
    'US Virgin Islands': 'ESTA (Visa Waiver Programme)',
    'Guam': 'ESTA (Visa Waiver Programme)',
    'Northern Mariana Islands': 'ESTA (Visa Waiver Programme)',
    // Australian external territories - same ETA as the mainland
    'Christmas Island': 'ETA (subclass 601)',
    'Cocos Islands': 'ETA (subclass 601)',
    'Norfolk Island': 'ETA (subclass 601)'
};

// -- Local / entry permits ---------------------------------------------------
// Place -> the permit needed for THAT place, ON TOP OF the national visa above.
// Covers restricted-area permits, place-specific entry permits, and permits
// issued at the border that are not visas.
// Always read the two together: a 'free' national policy can still be gated here.
// Sources: issuing administration sites (as of 2026); see notes per entry.
window.LOCAL_PERMIT = {
    // Asia
    'Tibet': 'Tibet Travel Permit (+ Alien Travel Permit for closed areas)',
    'Lakshadweep': 'Lakshadweep Administration entry permit',
    'Andaman and Nicobar Islands': 'Restricted Area Permit (waived on 30 islands)',
    'Gorno-Badakhshan': 'GBAO permit',
    'Socotra': 'Socotra permit, arranged via a licensed operator',
    'British Indian Ocean Territory': 'BIOT Administration permit',
    'Baikonur': 'Roscosmos site pass',
    'Panmunjom': 'UNC tour clearance',
    // Africa / South Atlantic
    'Ascension Island': "Administrator's entry permit",
    'Tristan da Cunha': 'Island Council permission to land',
    // Pacific
    'Pitcairn Islands': 'Immigration entry permit',
    // Visa-free, but entry is via a gratis Visitor's Permit granted at the border.
    // Duration varies by nationality (30-90 days); not recorded, as the figure
    // for SG passports is not confirmed by an official source.
    'Samoa': "Visitor's Permit, issued gratis on arrival",
    // NOT part of the US immigration system - ESTA does not cover it, so this
    // is a genuinely separate permit. Apply online >=72h ahead, USD 40.
    'American Samoa': '30-Day Entry Permit, applied for in advance',
    // Disputed
    'Abkhazia': 'MFA entry clearance letter',
    'South Ossetia': 'MFA entry permit',
    // Special
    'Antarctica': 'Antarctic Treaty / operator permit'
};
