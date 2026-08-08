/**
 * timerService.js
 *
 * Manages two independent session types:
 *   1. Countdown Timer  — stored in ACTIVE_TIMER
 *   2. Stopwatch        — stored in ACTIVE_STOPWATCH
 *
 * Switching modes never touches the other session.
 * Timestamps are the source of truth; setInterval only drives the UI display.
 */

import { TIMER_DEFAULTS, STORAGE_KEYS } from '../utils/constants.js';
import { formatDuration } from '../utils/dateUtils.js';
import { get as storageGet, set as storageSet, remove as storageRemove } from './storageService.js';
import { notifyTimerComplete } from './notificationService.js';
import { recordSession } from './reportService.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TIMER_ALARM_NAME = 'timify_timer_alarm';

/** Default timer preferences (UI state only, not session state) */
const DEFAULT_PREFS = {
  focusMinutes: TIMER_DEFAULTS.focusMinutes,
  breakMinutes: TIMER_DEFAULTS.breakMinutes,
  /** 'countdown' | 'stopwatch' — which tab the UI shows */
  timerMode: 'countdown',
};

/** Default (idle) countdown timer state */
const DEFAULT_ACTIVE_TIMER = {
  status: 'idle',           // 'idle' | 'running' | 'paused'
  sessionType: 'focus',     // 'focus' | 'break'
  startTime: null,          // timestamp when current run segment began
  endTime: null,            // timestamp when countdown expires
  remainingMs: TIMER_DEFAULTS.focusMinutes * 60 * 1000,
};

/** Default (idle) stopwatch state */
const DEFAULT_ACTIVE_STOPWATCH = {
  status: 'idle',           // 'idle' | 'running' | 'paused'
  sessionId: null,          // unique id; set at Clock-In; used for de-dup
  clockInTime: null,        // original Clock-In timestamp (for display only)
  startTime: null,          // timestamp when current run segment began
  accumulatedMs: 0,         // total elapsed ms EXCLUDING current segment
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _createAlarm(name, when) {
  if (typeof chrome !== 'undefined' && chrome.alarms && chrome.alarms.create) {
    try {
      chrome.alarms.create(name, { when });
    } catch (err) {
      console.error('[timerService] Failed to create alarm:', err);
    }
  }
}

function _clearAlarm(name) {
  return new Promise((resolve) => {
    if (typeof chrome !== 'undefined' && chrome.alarms && chrome.alarms.clear) {
      try {
        chrome.alarms.clear(name, resolve);
      } catch (err) {
        console.error('[timerService] Failed to clear alarm:', err);
        resolve(false);
      }
    } else {
      resolve(false);
    }
  });
}

function _makeSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ---------------------------------------------------------------------------
// Timer Preferences (UI-only, never resets sessions)
// ---------------------------------------------------------------------------

/**
 * Returns timer UI preferences (focusMinutes, breakMinutes, timerMode).
 * @returns {Promise<typeof DEFAULT_PREFS>}
 */
export async function getTimerPrefs() {
  const prefs = await storageGet(STORAGE_KEYS.TIMER_PREFS);
  if (!prefs || typeof prefs !== 'object') {
    await storageSet(STORAGE_KEYS.TIMER_PREFS, { ...DEFAULT_PREFS });
    return { ...DEFAULT_PREFS };
  }
  return {
    ...DEFAULT_PREFS,
    ...prefs,
  };
}

/**
 * Persists timer UI preferences.
 * @param {Partial<typeof DEFAULT_PREFS>} updates
 * @returns {Promise<typeof DEFAULT_PREFS>}
 */
export async function setTimerPrefs(updates) {
  const prefs = await getTimerPrefs();
  const next = { ...prefs, ...updates };
  await storageSet(STORAGE_KEYS.TIMER_PREFS, next);
  return next;
}

// ---------------------------------------------------------------------------
// Active Countdown Timer
// ---------------------------------------------------------------------------

/**
 * Reads the active countdown timer state, dynamically computing remainingMs
 * for a running timer so callers always get the live value.
 * @returns {Promise<typeof DEFAULT_ACTIVE_TIMER>}
 */
/**
 * Reads the active countdown timer state, dynamically computing remainingMs
 * for a running timer so callers always get the live value.
 * Automatically completes the timer if endTime has passed.
 *
 * @returns {Promise<typeof DEFAULT_ACTIVE_TIMER>}
 */
export async function getActiveTimer() {
  let state = await storageGet(STORAGE_KEYS.ACTIVE_TIMER);
  if (!state || typeof state !== 'object') {
    const prefs = await getTimerPrefs();
    state = {
      ...DEFAULT_ACTIVE_TIMER,
      remainingMs: prefs.focusMinutes * 60 * 1000,
    };
    await storageSet(STORAGE_KEYS.ACTIVE_TIMER, state);
    return state;
  }

  // Live-calculate remaining for running timers
  if (state.status === 'running' && state.endTime) {
    const now = Date.now();
    if (now >= state.endTime) {
      // Countdown expired — process timer completion immediately
      const result = await handleTimerAlarm();
      if (result) {
        return result.state;
      }
      return {
        ...DEFAULT_ACTIVE_TIMER,
        remainingMs: 0,
      };
    } else {
      state.remainingMs = state.endTime - now;
    }
  }

  return state;
}

/**
 * Starts or resumes the countdown timer.
 * @param {number} [minutes] - Duration override (only used when starting fresh).
 * @returns {Promise<typeof DEFAULT_ACTIVE_TIMER>}
 */
export async function startCountdownTimer(minutes) {
  const state = await getActiveTimer();

  if (state.status === 'paused') {
    return resumeCountdownTimer();
  }

  if (state.status === 'running') {
    return state; // Already running
  }

  // Fresh start
  const prefs = await getTimerPrefs();
  const finalMinutes = typeof minutes === 'number' && minutes > 0
    ? minutes
    : (state.sessionType === 'focus' ? prefs.focusMinutes : prefs.breakMinutes);

  const durationMs = finalMinutes * 60 * 1000;
  const now = Date.now();

  state.status = 'running';
  state.startTime = now;
  state.endTime = now + durationMs;
  state.remainingMs = durationMs;

  _createAlarm(TIMER_ALARM_NAME, state.endTime);

  await storageSet(STORAGE_KEYS.ACTIVE_TIMER, state);
  return state;
}

/**
 * Pauses the running countdown timer, freezing remaining duration.
 * @returns {Promise<typeof DEFAULT_ACTIVE_TIMER>}
 */
export async function pauseCountdownTimer() {
  const state = await getActiveTimer();
  if (state.status !== 'running') return state;

  await _clearAlarm(TIMER_ALARM_NAME);

  state.status = 'paused';
  state.remainingMs = state.endTime ? Math.max(0, state.endTime - Date.now()) : state.remainingMs;
  state.startTime = null;
  state.endTime = null;

  await storageSet(STORAGE_KEYS.ACTIVE_TIMER, state);
  return state;
}

/**
 * Resumes a paused countdown timer.
 * @returns {Promise<typeof DEFAULT_ACTIVE_TIMER>}
 */
export async function resumeCountdownTimer() {
  const state = await getActiveTimer();
  if (state.status !== 'paused') return state;

  const now = Date.now();
  state.status = 'running';
  state.startTime = now;
  state.endTime = now + state.remainingMs;

  _createAlarm(TIMER_ALARM_NAME, state.endTime);

  await storageSet(STORAGE_KEYS.ACTIVE_TIMER, state);
  return state;
}

/**
 * Stops and resets the countdown timer to idle.
 * @returns {Promise<typeof DEFAULT_ACTIVE_TIMER>}
 */
export async function stopCountdownTimer() {
  await _clearAlarm(TIMER_ALARM_NAME);
  const prefs = await getTimerPrefs();

  const freshState = {
    ...DEFAULT_ACTIVE_TIMER,
    remainingMs: prefs.focusMinutes * 60 * 1000,
  };
  await storageSet(STORAGE_KEYS.ACTIVE_TIMER, freshState);
  return freshState;
}

/**
 * Handles the alarm firing or expiration check for the countdown timer.
 * Transitions state to idle and returns a completed session record (to be persisted by caller).
 * Returns null if the timer was not running (prevents double-processing).
 *
 * @returns {Promise<{sessionRecord: Object, state: Object}|null>}
 */
export async function handleTimerAlarm() {
  // Read directly from storage to avoid circular getActiveTimer call
  const state = await storageGet(STORAGE_KEYS.ACTIVE_TIMER);

  if (!state || state.status !== 'running' || !state.endTime) {
    return null; // Already handled or not running
  }

  const prefs = await getTimerPrefs();
  const prevSessionType = state.sessionType || 'focus';
  const startTime = state.startTime || (state.endTime - prefs.focusMinutes * 60 * 1000);
  const endTime = state.endTime;

  // In pomodoro-style, alternate session types for next round
  const nextSessionType = prevSessionType === 'focus' ? 'break' : 'focus';
  const nextMinutes = nextSessionType === 'focus' ? prefs.focusMinutes : prefs.breakMinutes;

  const freshState = {
    status: 'idle',
    sessionType: nextSessionType,
    startTime: null,
    endTime: null,
    remainingMs: nextMinutes * 60 * 1000,
  };

  await storageSet(STORAGE_KEYS.ACTIVE_TIMER, freshState);
  await _clearAlarm(TIMER_ALARM_NAME);
  await notifyTimerComplete(prevSessionType);

  const sessionRecord = {
    mode: 'timer',
    type: prevSessionType,
    startTime,
    endTime,
    durationMs: Math.max(0, endTime - startTime),
    completed: true,
  };

  const persisted = await recordSession(sessionRecord);

  return { sessionRecord: persisted, state: freshState };
}

// ---------------------------------------------------------------------------
// Active Stopwatch (Clock In / Clock Out)
// ---------------------------------------------------------------------------

/**
 * Reads the active stopwatch state, dynamically computing total elapsed for
 * a running session so callers always get the live value.
 * @returns {Promise<typeof DEFAULT_ACTIVE_STOPWATCH>}
 */
export async function getActiveStopwatch() {
  let state = await storageGet(STORAGE_KEYS.ACTIVE_STOPWATCH);
  if (!state || typeof state !== 'object') {
    state = { ...DEFAULT_ACTIVE_STOPWATCH };
    await storageSet(STORAGE_KEYS.ACTIVE_STOPWATCH, state);
  }
  return state;
}

/**
 * Computes the live elapsed milliseconds for a stopwatch state object.
 * This is the DISPLAYED value (accumulated + current segment).
 *
 * @param {typeof DEFAULT_ACTIVE_STOPWATCH} state
 * @returns {number}
 */
export function computeStopwatchElapsed(state) {
  if (state.status === 'idle') return 0;
  if (state.status === 'paused') return state.accumulatedMs;
  // running
  if (!state.startTime) return state.accumulatedMs;
  return state.accumulatedMs + (Date.now() - state.startTime);
}

/**
 * Clocks in — creates a new stopwatch session and persists it immediately.
 * Prevents creating a second session if one is already running.
 *
 * @returns {Promise<typeof DEFAULT_ACTIVE_STOPWATCH>}
 */
export async function clockIn() {
  const existing = await getActiveStopwatch();
  if (existing.status !== 'idle') {
    console.warn('[timerService] Clock In ignored — stopwatch already active');
    return existing;
  }

  const now = Date.now();
  const state = {
    status: 'running',
    sessionId: _makeSessionId(),
    clockInTime: now,
    startTime: now,
    accumulatedMs: 0,
  };

  await storageSet(STORAGE_KEYS.ACTIVE_STOPWATCH, state);
  return state;
}

/**
 * Pauses the running stopwatch, freezing accumulated elapsed time.
 * Paused time is NOT counted as study time.
 *
 * @returns {Promise<typeof DEFAULT_ACTIVE_STOPWATCH>}
 */
export async function pauseStopwatch() {
  const state = await getActiveStopwatch();
  if (state.status !== 'running') return state;

  // Accumulate elapsed up to this moment
  const segmentMs = state.startTime ? Date.now() - state.startTime : 0;
  state.accumulatedMs += segmentMs;
  state.status = 'paused';
  state.startTime = null;

  await storageSet(STORAGE_KEYS.ACTIVE_STOPWATCH, state);
  return state;
}

/**
 * Resumes a paused stopwatch.
 *
 * @returns {Promise<typeof DEFAULT_ACTIVE_STOPWATCH>}
 */
export async function resumeStopwatch() {
  const state = await getActiveStopwatch();
  if (state.status !== 'paused') return state;

  state.status = 'running';
  state.startTime = Date.now();

  await storageSet(STORAGE_KEYS.ACTIVE_STOPWATCH, state);
  return state;
}

/**
 * Clocks out — calculates total study duration (excluding paused time),
 * clears the active session, and returns a completed session record.
 * Returns null if no active session exists.
 *
 * @returns {Promise<{sessionRecord: Object, state: Object}|null>}
 */
export async function clockOut() {
  const state = await getActiveStopwatch();
  if (state.status === 'idle') {
    console.warn('[timerService] Clock Out ignored — no active stopwatch session');
    return null;
  }

  const now = Date.now();

  // Add the current in-progress segment (0 if paused)
  const currentSegmentMs = (state.status === 'running' && state.startTime)
    ? now - state.startTime
    : 0;
  const totalDurationMs = state.accumulatedMs + currentSegmentMs;

  const sessionRecord = {
    mode: 'stopwatch',
    type: 'focus',
    startTime: state.clockInTime,
    endTime: now,
    durationMs: Math.max(0, totalDurationMs),
    completed: true,
  };

  // Clear the active stopwatch
  const idleState = { ...DEFAULT_ACTIVE_STOPWATCH };
  await storageSet(STORAGE_KEYS.ACTIVE_STOPWATCH, idleState);

  return { sessionRecord, state: idleState };
}

// ---------------------------------------------------------------------------
// Compatibility shim — getTimerState()
//
// Returns a merged view that the dashboard syncTimerDisplay() and background
// message handlers expect. Keeps the existing GET_STATE API working without
// changes to the dashboard's core polling loop.
// ---------------------------------------------------------------------------

/**
 * Returns a unified timer state object for UI consumption.
 * This is the ONLY function the UI polling interval should call.
 *
 * @returns {Promise<Object>}
 */
export async function getTimerState() {
  const prefs = await getTimerPrefs();
  const timer = await getActiveTimer();
  const sw = await getActiveStopwatch();

  const isStopwatch = prefs.timerMode === 'stopwatch';

  if (isStopwatch) {
    const elapsedMs = computeStopwatchElapsed(sw);
    return {
      // UI rendering fields
      timerMode: 'stopwatch',
      status: sw.status,
      remainingMs: elapsedMs, // for stopwatch, "remaining" is displayed as elapsed
      startTime: sw.startTime,
      endTime: null,
      sessionType: 'focus',
      // Prefs
      focusMinutes: prefs.focusMinutes,
      breakMinutes: prefs.breakMinutes,
      accumulatedMs: sw.accumulatedMs,
      // Stopwatch specifics
      clockInTime: sw.clockInTime,
      sessionId: sw.sessionId,
      // Timer underneath (for cross-mode banner)
      timerStatus: timer.status,
      timerRemainingMs: timer.status === 'running' && timer.endTime
        ? Math.max(0, timer.endTime - Date.now())
        : timer.remainingMs,
    };
  } else {
    // Live-calculate remainingMs
    let remainingMs = timer.remainingMs;
    if (timer.status === 'running' && timer.endTime) {
      remainingMs = Math.max(0, timer.endTime - Date.now());
    }
    return {
      timerMode: prefs.timerMode, // 'countdown'
      status: timer.status,
      remainingMs,
      startTime: timer.startTime,
      endTime: timer.endTime,
      sessionType: timer.sessionType,
      focusMinutes: prefs.focusMinutes,
      breakMinutes: prefs.breakMinutes,
      accumulatedMs: 0,
      // Stopwatch underneath (for cross-mode banner)
      swStatus: sw.status,
      swElapsedMs: computeStopwatchElapsed(sw),
    };
  }
}

// ---------------------------------------------------------------------------
// setTimerMode — now ONLY updates the UI preference; never resets sessions
// ---------------------------------------------------------------------------

/**
 * Sets the active timer mode tab (countdown vs stopwatch).
 * Does NOT reset or cancel any active session.
 *
 * @param {'countdown'|'stopwatch'} mode
 * @returns {Promise<Object>} Updated unified timer state.
 */
export async function setTimerMode(mode) {
  if (!['countdown', 'stopwatch'].includes(mode)) {
    throw new Error(`[timerService] Invalid timer mode: ${mode}`);
  }
  await setTimerPrefs({ timerMode: mode });
  return getTimerState();
}

// ---------------------------------------------------------------------------
// Custom durations
// ---------------------------------------------------------------------------

/**
 * Updates focus/break durations in preferences.
 * Only updates idle timer's remainingMs to reflect the new duration.
 *
 * @param {number} focusMinutes
 * @param {number} breakMinutes
 * @returns {Promise<Object>} Updated unified timer state.
 */
export async function setCustomDurations(focusMinutes, breakMinutes) {
  const updates = {};
  if (typeof focusMinutes === 'number' && focusMinutes > 0) updates.focusMinutes = focusMinutes;
  if (typeof breakMinutes === 'number' && breakMinutes > 0) updates.breakMinutes = breakMinutes;

  if (Object.keys(updates).length > 0) {
    await setTimerPrefs(updates);

    // If timer is idle, update its displayed remainingMs to match new prefs
    const timer = await getActiveTimer();
    if (timer.status === 'idle') {
      const prefs = await getTimerPrefs();
      timer.remainingMs = (timer.sessionType === 'focus' ? prefs.focusMinutes : prefs.breakMinutes) * 60 * 1000;
      await storageSet(STORAGE_KEYS.ACTIVE_TIMER, timer);
    }
  }

  return getTimerState();
}

// ---------------------------------------------------------------------------
// Legacy aliases (kept for any remaining callers)
// ---------------------------------------------------------------------------

/** @deprecated Use startCountdownTimer() */
export async function startTimer(minutes) {
  return startCountdownTimer(minutes);
}

/** @deprecated Use pauseCountdownTimer() */
export async function pauseTimer() {
  return pauseCountdownTimer();
}

/** @deprecated Use stopCountdownTimer() */
export async function stopTimer() {
  return stopCountdownTimer();
}

/** @deprecated Use stopCountdownTimer() */
export async function resetTimer() {
  return stopCountdownTimer();
}

// ---------------------------------------------------------------------------
// Formatting helper (kept for callers)
// ---------------------------------------------------------------------------

export function formatRemaining(ms) {
  return formatDuration(ms);
}

// ---------------------------------------------------------------------------
// One-time migration from legacy timify_timer_state
// ---------------------------------------------------------------------------

/**
 * Migrates data from the old single-key timer state to the new split keys.
 * Called once on extension load. Safe to call multiple times (idempotent).
 */
export async function migrateLegacyTimerState() {
  const legacy = await storageGet(STORAGE_KEYS.TIMER_STATE);
  if (!legacy || typeof legacy !== 'object') return;

  // Check if we've already migrated (new keys exist)
  const existingPrefs = await storageGet(STORAGE_KEYS.TIMER_PREFS);
  if (existingPrefs) {
    // Already migrated; remove legacy key
    await storageRemove(STORAGE_KEYS.TIMER_STATE);
    return;
  }

  console.log('[timerService] Migrating legacy timer state…');

  // Migrate preferences
  const prefs = {
    focusMinutes: legacy.focusMinutes || TIMER_DEFAULTS.focusMinutes,
    breakMinutes: legacy.breakMinutes || TIMER_DEFAULTS.breakMinutes,
    timerMode: legacy.timerMode === 'stopwatch' ? 'stopwatch' : 'countdown',
  };
  await storageSet(STORAGE_KEYS.TIMER_PREFS, prefs);

  // Migrate running countdown state (if the legacy timer was a running countdown)
  if (legacy.timerMode !== 'stopwatch' && legacy.status === 'running' && legacy.endTime) {
    const timerState = {
      status: Date.now() < legacy.endTime ? 'running' : 'idle',
      sessionType: legacy.sessionType || 'focus',
      startTime: legacy.startTime,
      endTime: legacy.endTime,
      remainingMs: Math.max(0, legacy.endTime - Date.now()),
    };
    if (timerState.status === 'running') {
      _createAlarm(TIMER_ALARM_NAME, legacy.endTime);
    }
    await storageSet(STORAGE_KEYS.ACTIVE_TIMER, timerState);
  } else {
    // Default idle state for timer
    await storageSet(STORAGE_KEYS.ACTIVE_TIMER, {
      ...DEFAULT_ACTIVE_TIMER,
      remainingMs: prefs.focusMinutes * 60 * 1000,
    });
  }

  // Stopwatch sessions from the legacy key cannot be reliably migrated
  // (no clockInTime, no accumulatedMs distinction). Start fresh.
  await storageSet(STORAGE_KEYS.ACTIVE_STOPWATCH, { ...DEFAULT_ACTIVE_STOPWATCH });

  // Remove the old key
  await storageRemove(STORAGE_KEYS.TIMER_STATE);
  console.log('[timerService] Migration complete.');
}
