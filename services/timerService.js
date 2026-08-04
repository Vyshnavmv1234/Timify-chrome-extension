/**
 * timerService.js
 *
 * Manages focus/break timer state and lifecycle.
 * Coordinates with alarms and notifications.
 */

import { TIMER_DEFAULTS, STORAGE_KEYS } from '../utils/constants.js';
import { formatDuration } from '../utils/dateUtils.js';
import { get as storageGet, set as storageSet } from './storageService.js';
import { notifyTimerComplete } from './notificationService.js';

// --- Constants ---
const TIMER_ALARM_NAME = 'timify_timer_alarm';

const DEFAULT_STATE = {
  status: 'idle', // 'idle' | 'running' | 'paused'
  remainingMs: TIMER_DEFAULTS.focusMinutes * 60 * 1000,
  startTime: null,
  endTime: null,
  sessionType: 'focus', // 'focus' | 'break'
  timerMode: 'pomodoro', // 'pomodoro' | 'countdown' | 'stopwatch'
  focusMinutes: TIMER_DEFAULTS.focusMinutes,
  breakMinutes: TIMER_DEFAULTS.breakMinutes,
  accumulatedMs: 0 // Used to track elapsed time in stopwatch mode
};

// --- Reusable Internal Helpers ---

/**
 * Creates a Chrome alarm if the alarms API is available.
 *
 * @param {string} name - Alarm identifier.
 * @param {number} when - Timestamp in milliseconds.
 */
function _createAlarm(name, when) {
  if (typeof chrome !== 'undefined' && chrome.alarms && chrome.alarms.create) {
    try {
      chrome.alarms.create(name, { when });
    } catch (error) {
      console.error('[timerService] Failed to create alarm:', error);
    }
  }
}

/**
 * Clears a Chrome alarm by name if the alarms API is available.
 *
 * @param {string} name - Alarm identifier.
 * @returns {Promise<boolean>} Resolves with a boolean indicating success.
 */
function _clearAlarm(name) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.alarms && chrome.alarms.clear) {
      try {
        chrome.alarms.clear(name, resolve);
      } catch (error) {
        console.error('[timerService] Failed to clear alarm:', error);
        resolve(false);
      }
    } else {
      resolve(false);
    }
  });
}

// --- Public API ---

/**
 * Returns the current timer state, dynamically calculating values if active.
 *
 * @returns {Promise<TimerState>}
 */
export async function getTimerState() {
  let state = await storageGet(STORAGE_KEYS.TIMER_STATE);
  if (!state) {
    state = { ...DEFAULT_STATE };
    await storageSet(STORAGE_KEYS.TIMER_STATE, state);
    return state;
  }

  // Handle dynamic time calculations if the timer is actively running
  if (state.status === 'running') {
    if (state.timerMode === 'stopwatch') {
      state.remainingMs = Date.now() - state.startTime + state.accumulatedMs;
    } else {
      const now = Date.now();
      if (now >= state.endTime) {
        // Complete the timer
        state.status = 'idle';
        state.remainingMs = 0;
        state.startTime = null;
        state.endTime = null;
        await storageSet(STORAGE_KEYS.TIMER_STATE, state);
      } else {
        state.remainingMs = state.endTime - now;
      }
    }
  } else if (state.status === 'paused') {
    if (state.timerMode === 'stopwatch') {
      state.remainingMs = state.accumulatedMs;
    }
  }

  return state;
}

/**
 * Starts or resumes the focus/break timer.
 *
 * @param {number} [minutes] - Optional override for focus/countdown duration.
 * @returns {Promise<TimerState>} Updated timer state.
 */
export async function startTimer(minutes) {
  const state = await getTimerState();

  if (state.status === 'paused') {
    return resumeTimer();
  }

  state.status = 'running';
  state.startTime = Date.now();

  if (state.timerMode === 'stopwatch') {
    state.endTime = null;
    state.accumulatedMs = 0;
    state.remainingMs = 0;
  } else {
    const finalMinutes = typeof minutes === 'number' && minutes > 0
      ? minutes
      : (state.sessionType === 'focus' ? state.focusMinutes : state.breakMinutes);
    
    const durationMs = finalMinutes * 60 * 1000;
    state.remainingMs = durationMs;
    state.endTime = Date.now() + durationMs;

    _createAlarm(TIMER_ALARM_NAME, state.endTime);
  }

  await storageSet(STORAGE_KEYS.TIMER_STATE, state);
  return state;
}

/**
 * Pauses the running timer, freezing its elapsed/remaining duration.
 *
 * @returns {Promise<TimerState>} Updated timer state.
 */
export async function pauseTimer() {
  const state = await getTimerState();
  if (state.status !== 'running') return state;

  state.status = 'paused';
  await _clearAlarm(TIMER_ALARM_NAME);

  if (state.timerMode === 'stopwatch') {
    state.accumulatedMs += Date.now() - state.startTime;
    state.remainingMs = state.accumulatedMs;
  } else {
    state.remainingMs = Math.max(0, state.endTime - Date.now());
    state.endTime = null;
  }

  state.startTime = null;
  await storageSet(STORAGE_KEYS.TIMER_STATE, state);
  return state;
}

/**
 * Resumes a paused timer.
 *
 * @returns {Promise<TimerState>} Updated timer state.
 */
export async function resumeTimer() {
  const state = await getTimerState();
  if (state.status !== 'paused') return state;

  state.status = 'running';
  state.startTime = Date.now();

  if (state.timerMode === 'stopwatch') {
    state.endTime = null;
  } else {
    state.endTime = Date.now() + state.remainingMs;
    _createAlarm(TIMER_ALARM_NAME, state.endTime);
  }

  await storageSet(STORAGE_KEYS.TIMER_STATE, state);
  return state;
}

/**
 * Stops the timer and resets it to the default idle state.
 *
 * @returns {Promise<TimerState>} Reset timer state.
 */
export async function stopTimer() {
  const state = await getTimerState();

  state.status = 'idle';
  state.startTime = null;
  state.endTime = null;
  state.accumulatedMs = 0;
  await _clearAlarm(TIMER_ALARM_NAME);

  if (state.timerMode === 'stopwatch') {
    state.remainingMs = 0;
  } else {
    const finalMinutes = state.sessionType === 'focus' ? state.focusMinutes : state.breakMinutes;
    state.remainingMs = finalMinutes * 60 * 1000;
  }

  await storageSet(STORAGE_KEYS.TIMER_STATE, state);
  return state;
}

/**
 * Resets the timer (behaves identically to stopTimer).
 *
 * @returns {Promise<TimerState>} Reset timer state.
 */
export async function resetTimer() {
  return stopTimer();
}

/**
 * Configures the active timer mode.
 *
 * @param {'pomodoro'|'countdown'|'stopwatch'} mode
 * @returns {Promise<TimerState>}
 */
export async function setTimerMode(mode) {
  if (!['pomodoro', 'countdown', 'stopwatch'].includes(mode)) {
    throw new Error(`[timerService] Invalid timer mode: ${mode}`);
  }

  const state = await getTimerState();
  state.timerMode = mode;
  
  // Stop and clean up to prevent overlap state
  state.status = 'idle';
  state.startTime = null;
  state.endTime = null;
  state.accumulatedMs = 0;
  await _clearAlarm(TIMER_ALARM_NAME);

  if (mode === 'stopwatch') {
    state.remainingMs = 0;
  } else {
    state.sessionType = 'focus';
    state.remainingMs = state.focusMinutes * 60 * 1000;
  }

  await storageSet(STORAGE_KEYS.TIMER_STATE, state);
  return state;
}

/**
 * Configures custom durations for focus and break sessions.
 *
 * @param {number} focusMinutes
 * @param {number} breakMinutes
 * @returns {Promise<TimerState>}
 */
export async function setCustomDurations(focusMinutes, breakMinutes) {
  const state = await getTimerState();

  if (typeof focusMinutes === 'number' && focusMinutes > 0) {
    state.focusMinutes = focusMinutes;
  }
  if (typeof breakMinutes === 'number' && breakMinutes > 0) {
    state.breakMinutes = breakMinutes;
  }

  // Update default remainingMs if the timer is currently idle
  if (state.status === 'idle' && state.timerMode !== 'stopwatch') {
    state.remainingMs = (state.sessionType === 'focus' ? state.focusMinutes : state.breakMinutes) * 60 * 1000;
  }

  await storageSet(STORAGE_KEYS.TIMER_STATE, state);
  return state;
}

/**
 * Formats the remaining timer duration for display.
 *
 * @param {number} remainingMs
 * @returns {string} Formatted duration (MM:SS or HH:MM:SS)
 */
export function formatRemaining(remainingMs) {
  return formatDuration(remainingMs);
}

/**
 * Handles the alarm trigger event.
 * Transitions session state and fires completion notifications.
 *
 * @returns {Promise<void>}
 */
export async function handleTimerAlarm() {
  const state = await getTimerState();
  if (state.status === 'running' && state.timerMode !== 'stopwatch') {
    const prevSessionType = state.sessionType;

    // Reset parameters to default idle state
    state.status = 'idle';
    state.startTime = null;
    state.endTime = null;
    state.accumulatedMs = 0;

    // In Pomodoro mode, alternate the next session type automatically
    if (state.timerMode === 'pomodoro') {
      if (prevSessionType === 'focus') {
        state.sessionType = 'break';
        state.remainingMs = state.breakMinutes * 60 * 1000;
      } else {
        state.sessionType = 'focus';
        state.remainingMs = state.focusMinutes * 60 * 1000;
      }
    }

    await storageSet(STORAGE_KEYS.TIMER_STATE, state);

    // Trigger timer completion notification
    await notifyTimerComplete(prevSessionType);

    return state;
  }
  return null;
}
