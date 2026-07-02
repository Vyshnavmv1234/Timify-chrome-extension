/**
 * storageService.js
 *
 * Abstraction layer over chrome.storage for reading and writing
 * extension data. All persistence should go through this service.
 */

import { STORAGE_KEYS } from '../utils/constants.js';

/**
 * Retrieves a value from chrome.storage.local by key.
 * @param {string} key - Storage key
 * @returns {Promise<unknown|null>}
 */
export async function get(key) {
  // TODO: Implement chrome.storage.local.get
  void key;
  return null;
}

/**
 * Stores a value in chrome.storage.local.
 * @param {string} key - Storage key
 * @param {unknown} value - Value to store
 * @returns {Promise<void>}
 */
export async function set(key, value) {
  // TODO: Implement chrome.storage.local.set
  void key;
  void value;
}

/**
 * Removes a value from chrome.storage.local.
 * @param {string} key - Storage key
 * @returns {Promise<void>}
 */
export async function remove(key) {
  // TODO: Implement chrome.storage.local.remove
  void key;
}

/**
 * Retrieves all stored values.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function getAll() {
  // TODO: Implement chrome.storage.local.get(null)
  return {};
}

/** Re-export storage keys for convenience. */
export { STORAGE_KEYS };
