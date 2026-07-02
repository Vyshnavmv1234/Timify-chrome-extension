/**
 * timerService.js
 *
 * Manages focus/break timer state and lifecycle.
 * Coordinates with alarms and notifications in future implementations.
 */

import { TIMER_DEFAULTS } from '../utils/constants.js';
import { formatDuration } from '../utils/dateUtils.js';

/**
 * @typedef {Object} TimerState
 * @property {string} status - Current timer status (idle, running, paused)
 * @property {number} remainingMs - Remaining time in milliseconds
 * @property {number} focusMinutes - Focus session length in minutes
 * @property {number} breakMinutes - Break session length in minutes
 */

/**
 * Returns the current timer state.
 * @returns {Promise<TimerState>}
 */
export async function getTimerState() {
  // TODO: Load state from storage
  return {
    status: TIMER_DEFAULTS.status,
    remainingMs: TIMER_DEFAULTS.focusMinutes * 60 * 1000,
    focusMinutes: TIMER_DEFAULTS.focusMinutes,
    breakMinutes: TIMER_DEFAULTS.breakMinutes,
  };
}

/**
 * Starts or resumes the focus timer.
 * @param {number} [minutes] - Optional override for focus duration
 * @returns {Promise<TimerState>}
 */
export async function startTimer(minutes) {
  // TODO: Create alarm and update state
  void minutes;
  return getTimerState();
}

/**
 * Pauses the running timer.
 * @returns {Promise<TimerState>}
 */
export async function pauseTimer() {
  // TODO: Clear alarm and persist paused state
  return getTimerState();
}

/**
 * Stops the timer and resets to idle.
 * @returns {Promise<TimerState>}
 */
export async function stopTimer() {
  // TODO: Clear alarm and reset state
  return getTimerState();
}

/**
 * Formats the remaining timer duration for display.
 * @param {number} remainingMs
 * @returns {string}
 */
export function formatRemaining(remainingMs) {
  return formatDuration(remainingMs);
}
