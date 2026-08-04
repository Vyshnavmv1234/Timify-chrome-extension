/**
 * storageService.js
 *
 * Abstraction layer over chrome.storage.local for reading and writing
 * extension data. All persistence should go through this service.
 *
 * API surface:
 *   get(key)           → Promise<unknown|null>
 *   set(key, value)    → Promise<void>
 *   remove(key)        → Promise<void>
 *   getAll()           → Promise<Record<string, unknown>>
 *   clear()            → Promise<void>
 */

import { STORAGE_KEYS } from '../utils/constants.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Wraps chrome.storage.local.get in a Promise.
 * Passing null retrieves the entire storage area.
 *
 * @param {string|string[]|null} keyOrKeys - Key(s) to retrieve, or null for all.
 * @returns {Promise<Record<string, unknown>>}
 */
function _chromeGet(keyOrKeys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(keyOrKeys, (result) => {
      if (chrome.runtime.lastError) {
        reject(new Error(`[storageService] get failed: ${chrome.runtime.lastError.message}`));
      } else {
        resolve(result);
      }
    });
  });
}

/**
 * Wraps chrome.storage.local.set in a Promise.
 * Only the keys present in `items` are written; unrelated keys are untouched.
 *
 * @param {Record<string, unknown>} items - Object of key/value pairs to store.
 * @returns {Promise<void>}
 */
function _chromeSet(items) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(`[storageService] set failed: ${chrome.runtime.lastError.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Wraps chrome.storage.local.remove in a Promise.
 *
 * @param {string|string[]} keyOrKeys - Key(s) to remove.
 * @returns {Promise<void>}
 */
function _chromeRemove(keyOrKeys) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.remove(keyOrKeys, () => {
      if (chrome.runtime.lastError) {
        reject(new Error(`[storageService] remove failed: ${chrome.runtime.lastError.message}`));
      } else {
        resolve();
      }
    });
  });
}

/**
 * Wraps chrome.storage.local.clear in a Promise.
 *
 * @returns {Promise<void>}
 */
function _chromeClear() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        reject(new Error(`[storageService] clear failed: ${chrome.runtime.lastError.message}`));
      } else {
        resolve();
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Retrieves a single value from chrome.storage.local by key.
 *
 * @param {string} key - The storage key to look up.
 * @returns {Promise<unknown|null>} Resolves to the stored value, or null if absent.
 */
export async function get(key) {
  const result = await _chromeGet(key);
  return Object.prototype.hasOwnProperty.call(result, key) ? result[key] : null;
}

/**
 * Stores a single key/value pair in chrome.storage.local.
 * Only the specified key is written; all other keys remain untouched.
 *
 * @param {string} key   - The storage key.
 * @param {unknown} value - Any JSON-serialisable value.
 * @returns {Promise<void>}
 */
export async function set(key, value) {
  await _chromeSet({ [key]: value });
}

/**
 * Removes a key (or array of keys) from chrome.storage.local.
 *
 * @param {string|string[]} key - Key or array of keys to delete.
 * @returns {Promise<void>}
 */
export async function remove(key) {
  await _chromeRemove(key);
}

/**
 * Retrieves every key/value pair currently in chrome.storage.local.
 *
 * @returns {Promise<Record<string, unknown>>} The complete storage contents.
 */
export async function getAll() {
  return _chromeGet(null);
}

/**
 * Erases all data from chrome.storage.local.
 * Use with caution — this removes every key written by the extension.
 *
 * @returns {Promise<void>}
 */
export async function clear() {
  await _chromeClear();
}


// ---------------------------------------------------------------------------
// Settings helpers — delegated to settingsService.
// Re-exported here so existing import sites require no changes.
// ---------------------------------------------------------------------------

export { getSettings, updateSettings, resetSettings } from './settingsService.js';

/** Re-export storage keys for convenience. */
export { STORAGE_KEYS };
