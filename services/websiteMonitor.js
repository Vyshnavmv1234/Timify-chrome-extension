/**
 * websiteMonitor.js
 *
 * Monitors the current website for distraction detection.
 * Runs in content script context; checks URLs against blocklist.
 */

import { STORAGE_KEYS } from '../utils/constants.js';

/** @type {boolean} */
let isInitialized = false;

/**
 * Initializes the website monitor in the content script context.
 * @returns {void}
 */
export function initWebsiteMonitor() {
  if (isInitialized) {
    return;
  }

  // TODO: Load distraction list and start monitoring
  isInitialized = true;
}

/**
 * Checks the current page URL against the distraction list.
 * @returns {Promise<{ url: string; isDistracting: boolean }>}
 */
export async function checkCurrentSite() {
  const url = window.location.href;
  const distracting = await isDistracting(url);

  return { url, isDistracting: distracting };
}

/**
 * Determines whether a URL is on the distraction list.
 * @param {string} url - URL to check
 * @returns {Promise<boolean>}
 */
export async function isDistracting(url) {
  // TODO: Compare URL against stored distraction list
  void url;
  void STORAGE_KEYS;
  return false;
}

/**
 * Resets the monitor state (useful for testing or re-init).
 * @returns {void}
 */
export function resetWebsiteMonitor() {
  isInitialized = false;
}
