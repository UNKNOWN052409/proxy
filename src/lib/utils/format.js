/**
 * Format large numbers with K, M, B suffixes
 * @param {number} num - Number to format
 * @param {number} decimals - Decimal places (default: 1)
 * @returns {string} Formatted number
 */
export function formatNumber(num, decimals = 1) {
  if (num === null || num === undefined) return '0';

  const n = Math.abs(num);

  if (n >= 1e9) {
    return (num / 1e9).toFixed(decimals) + 'B';
  }
  if (n >= 1e6) {
    return (num / 1e6).toFixed(decimals) + 'M';
  }
  if (n >= 1e3) {
    return (num / 1e3).toFixed(decimals) + 'K';
  }

  return num.toString();
}

/**
 * Format number with comma separators
 * @param {number} num - Number to format
 * @returns {string} Formatted number with commas
 */
export function formatNumberWithCommas(num) {
  if (num === null || num === undefined) return '0';
  return num.toLocaleString();
}

/**
 * Time period options for metrics
 */
export const TIME_PERIODS = [
  { value: '1d', label: '1 Day', days: 1 },
  { value: '3d', label: '3 Days', days: 3 },
  { value: '7d', label: '7 Days', days: 7 },
  { value: '14d', label: '2 Weeks', days: 14 },
  { value: '21d', label: '3 Weeks', days: 21 },
  { value: '28d', label: '4 Weeks', days: 28 },
  { value: '1m', label: '1 Month', days: 30 },
  { value: '3m', label: '3 Months', days: 90 },
  { value: '6m', label: '6 Months', days: 180 },
  { value: '1y', label: '1 Year', days: 365 },
];
