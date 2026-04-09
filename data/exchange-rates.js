/**
 * Historical SGD/USD exchange rates (annual averages).
 * Source: MAS / Federal Reserve. 2025-2026 are estimates.
 *
 * SGD_PER_USD  – how many SGD you pay for 1 USD
 * USD_PER_SGD  – how many USD you get for 1 SGD  (inverse)
 *
 * Usage:
 *   toUSD(costSGD, date)   – convert a historical SGD amount to USD at
 *                            the exchange rate that prevailed in that year.
 *   toReal2025USD(costSGD, date) – inflation-adjust to 2025 SGD first,
 *                            then convert at the 2025 exchange rate.
 */

const HISTORICAL_SGD_PER_USD = {
    2017: 1.3807,
    2018: 1.3491,
    2019: 1.3642,
    2020: 1.3792,
    2021: 1.3439,
    2022: 1.3793,
    2023: 1.3431,
    2024: 1.3353,
    2025: 1.3152,
    2026: 1.2943 
};

// Pre-compute the inverse table
const HISTORICAL_USD_PER_SGD = {};
for (const [year, rate] of Object.entries(HISTORICAL_SGD_PER_USD)) {
    HISTORICAL_USD_PER_SGD[year] = +(1 / rate).toFixed(6);
}

const REFERENCE_YEAR = 2025;
const SGD_PER_USD_2025 = HISTORICAL_SGD_PER_USD[REFERENCE_YEAR];
const USD_PER_SGD_2025 = HISTORICAL_USD_PER_SGD[REFERENCE_YEAR];

/**
 * Convert a historical SGD cost to USD at the exchange rate of that year.
 * @param {number} costSGD  – amount in SGD
 * @param {string|Date} date – date of the transaction
 * @returns {number|null}
 */
function historicalSGDtoUSD(costSGD, date) {
    if (costSGD == null || !date) return null;
    const year = new Date(date).getFullYear();
    const rate = HISTORICAL_USD_PER_SGD[year];
    if (!rate) return null;
    return +(costSGD * rate).toFixed(2);
}

/**
 * Convert a historical SGD cost to 2025-real USD.
 * Steps: inflate SGD to 2025 via CPI, then convert at 2025 exchange rate.
 * Requires the SG CPI table (passed in or from the global FlightMap).
 * @param {number} costSGD
 * @param {string|Date} date
 * @param {Object} sgCPI  – { year: cpiValue, ... }
 * @param {number} cpi2025
 * @returns {number|null}
 */
function toReal2025USD(costSGD, date, sgCPI, cpi2025) {
    if (costSGD == null || !date) return null;
    const year = new Date(date).getFullYear();
    const cpi = sgCPI[year];
    if (!cpi) return null;
    const realSGD = costSGD * (cpi2025 / cpi);
    return +(realSGD * USD_PER_SGD_2025).toFixed(2);
}

/**
 * Get the SGD/USD rate for a given year.
 * @param {number} year
 * @returns {{ sgdPerUsd: number, usdPerSgd: number } | null}
 */
function getExchangeRate(year) {
    const sgd = HISTORICAL_SGD_PER_USD[year];
    if (!sgd) return null;
    return { sgdPerUsd: sgd, usdPerSgd: HISTORICAL_USD_PER_SGD[year] };
}

// Expose for use in animated-flight-map.js and widgets
window.ExchangeRates = {
    HISTORICAL_SGD_PER_USD,
    HISTORICAL_USD_PER_SGD,
    SGD_PER_USD_2025,
    USD_PER_SGD_2025,
    historicalSGDtoUSD,
    toReal2025USD,
    getExchangeRate
};
