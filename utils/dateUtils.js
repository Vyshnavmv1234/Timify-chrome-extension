/**
 * dateUtils.js
 *
 * Date and time formatting utilities for timers and reports.
 * Pure functions with no external dependencies.
 */

/**
 * Formats a duration in milliseconds as MM:SS or HH:MM:SS.
 * @param {number} ms - Duration in milliseconds
 * @returns {string}
 */
export function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Formats a Date object as a locale-friendly date string.
 * @param {Date} date
 * @returns {string}
 */
export function formatDate(date) {
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Returns a new Date set to the start of the given day (00:00:00.000).
 * @param {Date} [date=new Date()] - Reference date
 * @returns {Date}
 */
export function getStartOfDay(date = new Date()) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * Returns a new Date set to the end of the given day (23:59:59.999).
 * @param {Date} [date=new Date()] - Reference date
 * @returns {Date}
 */
export function getEndOfDay(date = new Date()) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}
