/**
 * constants.js
 *
 * Shared constants used across Timify extension modules.
 * Centralizes storage keys, timer defaults, and message types
 * to avoid magic strings and enable consistent communication.
 */

/** @type {Readonly<Record<string, string>>} */
export const STORAGE_KEYS = Object.freeze({
  TASKS: 'timify_tasks',
  TIMER_STATE: 'timify_timer_state',
  SETTINGS: 'timify_settings',
  REPORTS: 'timify_reports',
  DISTRACTION_LIST: 'timify_distraction_list',
});

/** @type {Readonly<{ focusMinutes: number; breakMinutes: number; status: string }>} */
export const TIMER_DEFAULTS = Object.freeze({
  focusMinutes: 25,
  breakMinutes: 5,
  status: 'idle',
});

/** @type {Readonly<Record<string, string>>} */
export const MESSAGE_TYPES = Object.freeze({
  TIMER_START: 'TIMER_START',
  TIMER_PAUSE: 'TIMER_PAUSE',
  TIMER_STOP: 'TIMER_STOP',
  TIMER_TICK: 'TIMER_TICK',
  TASK_UPDATE: 'TASK_UPDATE',
  DISTRACTION_DETECTED: 'DISTRACTION_DETECTED',
  GET_STATE: 'GET_STATE',
  OPEN_DASHBOARD: 'OPEN_DASHBOARD',
  OPEN_SETTINGS: 'OPEN_SETTINGS',
  FOCUS_SCORE_UPDATE: 'FOCUS_SCORE_UPDATE',
});

/** @type {Readonly<{ id: string; title: string }>} */
export const EXTENSION_INFO = Object.freeze({
  id: 'timify',
  title: 'Timify',
});
