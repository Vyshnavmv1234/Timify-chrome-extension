/**
 * reportService.js
 *
 * Generates and retrieves study session reports and analytics.
 * Aggregates timer and task data for the dashboard.
 */

import { STORAGE_KEYS } from '../utils/constants.js';
import { getStartOfDay, getEndOfDay, formatDate } from '../utils/dateUtils.js';

/**
 * @typedef {Object} ReportSummary
 * @property {number} totalFocusMinutes
 * @property {number} sessionsCompleted
 * @property {number} tasksCompleted
 * @property {string} periodLabel
 */

/**
 * Generates a report for the given date range.
 * @param {Date} [startDate]
 * @param {Date} [endDate]
 * @returns {Promise<Record<string, unknown>>}
 */
export async function generateReport(startDate, endDate) {
  // TODO: Aggregate session data from storage
  void startDate;
  void endDate;
  return {};
}

/**
 * Returns a summary of today's study activity.
 * @returns {Promise<ReportSummary>}
 */
export async function getReportSummary() {
  // TODO: Load and summarize today's data
  const today = new Date();

  return {
    totalFocusMinutes: 0,
    sessionsCompleted: 0,
    tasksCompleted: 0,
    periodLabel: formatDate(today),
  };
}

/**
 * Returns the default report date range (today).
 * @returns {{ start: Date; end: Date }}
 */
export function getDefaultDateRange() {
  const now = new Date();
  return {
    start: getStartOfDay(now),
    end: getEndOfDay(now),
  };
}

/** Re-export storage key for reports. */
export { STORAGE_KEYS };
