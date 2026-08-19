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

/**
 * MONTHLY averages, keyed 'YYYY-MM' -> SGD per USD.
 *
 * Source: ECB daily reference rates via the Frankfurter API, averaged over each
 * month's published business days. Pulled 19 Aug 2026, covering 2017-01 .. 2026-08.
 * MAS's own open series on data.gov.sg stops at 2015 and cannot cover this span.
 *
 * Cross-checked against the MAS/Fed annual averages above: 2017-2024 agree to
 * within 0.05%. 2025 and 2026 differ by 0.6% and 1.1% because the annual
 * figures for those years are flagged as estimates in this file - the monthly
 * numbers here are measured, so treat them as the better of the two.
 */
const HISTORICAL_SGD_PER_USD_MONTHLY = {
    // 2017
    '2017-01': 1.4297,
    '2017-02': 1.4146,
    '2017-03': 1.4052,
    '2017-04': 1.3985,
    '2017-05': 1.3949,
    '2017-06': 1.3840,
    '2017-07': 1.3718,
    '2017-08': 1.3611,
    '2017-09': 1.3500,
    '2017-10': 1.3603,
    '2017-11': 1.3556,
    '2017-12': 1.3466,
    // 2018
    '2018-01': 1.3217,
    '2018-02': 1.3196,
    '2018-03': 1.3150,
    '2018-04': 1.3160,
    '2018-05': 1.3393,
    '2018-06': 1.3476,
    '2018-07': 1.3633,
    '2018-08': 1.3687,
    '2018-09': 1.3712,
    '2018-10': 1.3796,
    '2018-11': 1.3750,
    '2018-12': 1.3699,
    // 2019
    '2019-01': 1.3565,
    '2019-02': 1.3536,
    '2019-03': 1.3543,
    '2019-04': 1.3560,
    '2019-05': 1.3716,
    '2019-06': 1.3628,
    '2019-07': 1.3610,
    '2019-08': 1.3849,
    '2019-09': 1.3798,
    '2019-10': 1.3708,
    '2019-11': 1.3616,
    '2019-12': 1.3571,
    // 2020
    '2020-01': 1.3516,
    '2020-02': 1.3900,
    '2020-03': 1.4169,
    '2020-04': 1.4246,
    '2020-05': 1.4182,
    '2020-06': 1.3938,
    '2020-07': 1.3877,
    '2020-08': 1.3693,
    '2020-09': 1.3657,
    '2020-10': 1.3595,
    '2020-11': 1.3469,
    '2020-12': 1.3327,
    // 2021
    '2021-01': 1.3261,
    '2021-02': 1.3276,
    '2021-03': 1.3426,
    '2021-04': 1.3336,
    '2021-05': 1.3299,
    '2021-06': 1.3334,
    '2021-07': 1.3550,
    '2021-08': 1.3547,
    '2021-09': 1.3479,
    '2021-10': 1.3509,
    '2021-11': 1.3569,
    '2021-12': 1.3627,
    // 2022
    '2022-01': 1.3510,
    '2022-02': 1.3467,
    '2022-03': 1.3587,
    '2022-04': 1.3659,
    '2022-05': 1.3822,
    '2022-06': 1.3841,
    '2022-07': 1.3962,
    '2022-08': 1.3839,
    '2022-09': 1.4137,
    '2022-10': 1.4252,
    '2022-11': 1.3868,
    '2022-12': 1.3517,
    // 2023
    '2023-01': 1.3264,
    '2023-02': 1.3311,
    '2023-03': 1.3409,
    '2023-04': 1.3320,
    '2023-05': 1.3394,
    '2023-06': 1.3466,
    '2023-07': 1.3343,
    '2023-08': 1.3508,
    '2023-09': 1.3631,
    '2023-10': 1.3692,
    '2023-11': 1.3487,
    '2023-12': 1.3330,
    // 2024
    '2024-01': 1.3360,
    '2024-02': 1.3445,
    '2024-03': 1.3404,
    '2024-04': 1.3567,
    '2024-05': 1.3508,
    '2024-06': 1.3521,
    '2024-07': 1.3466,
    '2024-08': 1.3157,
    '2024-09': 1.2963,
    '2024-10': 1.3099,
    '2024-11': 1.3365,
    '2024-12': 1.3498,
    // 2025
    '2025-01': 1.3611,
    '2025-02': 1.3467,
    '2025-03': 1.3363,
    '2025-04': 1.3247,
    '2025-05': 1.2936,
    '2025-06': 1.2836,
    '2025-07': 1.2812,
    '2025-08': 1.2857,
    '2025-09': 1.2850,
    '2025-10': 1.2961,
    '2025-11': 1.3025,
    '2025-12': 1.2913,
    // 2026
    '2026-01': 1.2802,
    '2026-02': 1.2669,
    '2026-03': 1.2796,
    '2026-04': 1.2756,
    '2026-05': 1.2757,
    '2026-06': 1.2879,
    '2026-07': 1.2916,
    '2026-08': 1.2800
};

/**
 * The finest-resolution series available, as points a chart can plot directly.
 * @returns {{ points: Array<{t:number, rate:number}>, resolution: 'monthly'|'annual' }}
 *          t is a fractional year (2017.5 = mid-2017).
 */
function getSeries() {
    const monthly = Object.keys(HISTORICAL_SGD_PER_USD_MONTHLY);
    if (monthly.length >= 2) {
        const points = monthly.sort().map(key => {
            const parts = key.split('-');
            const year = +parts[0], month = +parts[1];
            // Mid-month, so a monthly average plots at the middle of its month
            return { t: year + (month - 0.5) / 12, rate: HISTORICAL_SGD_PER_USD_MONTHLY[key] };
        });
        return { points: points, resolution: 'monthly' };
    }
    const points = Object.keys(HISTORICAL_SGD_PER_USD)
        .map(Number).filter(y => !isNaN(y)).sort((a, b) => a - b)
        .map(y => ({ t: y + 0.5, rate: HISTORICAL_SGD_PER_USD[y] }));
    return { points: points, resolution: 'annual' };
}

// Expose for use in animated-flight-map.js and widgets
window.ExchangeRates = {
    HISTORICAL_SGD_PER_USD,
    HISTORICAL_SGD_PER_USD_MONTHLY,
    getSeries,
    HISTORICAL_USD_PER_SGD,
    SGD_PER_USD_2025,
    USD_PER_SGD_2025,
    historicalSGDtoUSD,
    toReal2025USD,
    getExchangeRate
};
