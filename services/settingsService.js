/**
 * settingsService.js
 *
 * Owns all user settings defaults, validation, and persistence.
 * All modules that need settings should import from here.
 *
 * Schema (DEFAULT_SETTINGS) is the single source of truth for the
 * full settings shape. Storage is handled via storageService primitives.
 */

import { STORAGE_KEYS } from '../utils/constants.js';

// Inline storage primitives to avoid a circular dependency with storageService
// (storageService re-exports from this module, so we cannot import from it here).

/** @param {string} key @returns {Promise<unknown|null>} */
async function _storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => {
      resolve(Object.prototype.hasOwnProperty.call(result, key) ? result[key] : null);
    });
  });
}

/** @param {string} key @param {unknown} value @returns {Promise<void>} */
async function _storageSet(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve);
  });
}

// ---------------------------------------------------------------------------
// Default settings — single source of truth for the full schema
// ---------------------------------------------------------------------------

export const DEFAULT_SETTINGS = Object.freeze({
  // General
  darkMode: true,
  notificationsEnabled: true,
  soundEnabled: true,
  focusModeEnabled: false,
  strictMode: false,

  // Timer / Pomodoro
  focusMinutes: 25,
  breakMinutes: 5,

  // Goals
  dailyGoalMinutes: 480,
  username: 'Student',

  // Motivation
  motivationInterval: 45,      // minutes between motivation notifications
  motivationCategory: 'all',
  useAiMotivation: false,

  // Websites
  allowedWebsites: [
    'notion.so',
    'docs.google.com',
    'canvas.instructure.com',
    'khanacademy.org'
  ],
  blockedWebsites: [
    'youtube.com',
    'reddit.com',
    'twitter.com',
    'instagram.com',
    'facebook.com',
    'netflix.com',
    'x.com'
  ],

  // Computed / persisted stats
  bestStreak: 0,
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieves settings from storage, deep-merged with defaults so new fields
 * added to DEFAULT_SETTINGS are always available without a data migration.
 *
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function getSettings() {
  const stored = await _storageGet(STORAGE_KEYS.SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored || {}),
  };
}

/**
 * Merges partial updates into the current settings and persists the result.
 * Only keys present in `updates` are modified; all others are preserved.
 *
 * @param {Partial<typeof DEFAULT_SETTINGS>} updates
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function updateSettings(updates) {
  const current = await getSettings();

  // Strict Mode Enforcement:
  // If strictMode is currently enabled, prevent turning off focusMode or strictMode during an active focus session.
  if (current.strictMode && (updates.focusModeEnabled === false || updates.strictMode === false)) {
    const timerState = await _storageGet(STORAGE_KEYS.TIMER_STATE);
    if (timerState && timerState.status === 'running' && timerState.sessionType === 'focus') {
      throw new Error('Strict Mode is active: You cannot disable Focus Mode or Strict Mode during a focus session!');
    }
  }

  const next = { ...current, ...updates };
  await _storageSet(STORAGE_KEYS.SETTINGS, next);
  return next;
}

/**
 * Resets all settings back to DEFAULT_SETTINGS and persists the reset state.
 *
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function resetSettings() {
  const fresh = { ...DEFAULT_SETTINGS };
  await _storageSet(STORAGE_KEYS.SETTINGS, fresh);
  return fresh;
}
