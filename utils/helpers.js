/**
 * helpers.js
 *
 * Pure utility functions shared across Timify modules.
 * No Chrome API calls or side effects — safe to use in any context.
 */

/**
 * Generates a simple unique identifier.
 * @returns {string}
 */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Debounces a function so it only runs after the wait period elapses.
 * @template {(...args: unknown[]) => unknown} T
 * @param {T} fn - Function to debounce
 * @param {number} wait - Delay in milliseconds
 * @returns {(...args: Parameters<T>) => void}
 */
export function debounce(fn, wait) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timeoutId;

  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

/**
 * Clamps a number between a minimum and maximum value.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Safely parses JSON with a fallback value.
 * @template T
 * @param {string} json
 * @param {T} fallback
 * @returns {T}
 */
export function safeJsonParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}
