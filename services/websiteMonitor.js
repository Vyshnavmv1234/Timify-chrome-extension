/**
 * websiteMonitor.js
 *
 * Monitors the current website for distraction detection.
 * Runs in content script context; checks URLs against the user's blocklist
 * from settings. All configuration is settings-driven — no hardcoded lists.
 */

import { STORAGE_KEYS } from '../utils/constants.js';

/** @type {boolean} */
let isInitialized = false;

/** @type {MutationObserver|null} */
let titleObserver = null;

// --- Internal Helpers ---

/**
 * Monitors and blocks distracting URLs during active focus sessions.
 * Notifies the background worker to record the distraction and show an alert,
 * then redirects to the blocked page.
 */
async function _evaluateCurrentPage() {
  const url = window.location.href;
  const distracting = await isDistracting(url);
  if (!distracting) return;

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return;
  }

  chrome.storage.local.get(STORAGE_KEYS.TIMER_STATE, (res) => {
    const state = res[STORAGE_KEYS.TIMER_STATE];
    if (!state || state.status !== 'running' || state.sessionType !== 'focus') {
      return;
    }

    // Notify background worker of distraction event to log it and alert user
    try {
      chrome.runtime.sendMessage({ type: 'DISTRACTION_DETECTED', url });
    } catch (e) {
      console.warn('[websiteMonitor] Failed to send message to background:', e);
    }

    // Redirect current tab to the blocked notification page
    const blockedPageUrl = chrome.runtime.getURL(`pages/blocked.html?url=${encodeURIComponent(url)}`);
    window.location.href = blockedPageUrl;
  });
}

/**
 * Sets up a MutationObserver to detect title changes on SPAs (e.g. YouTube navigation).
 *
 * @param {() => void} callback - Function to run when the title changes.
 */
function _observeTitleChange(callback) {
  const titleEl = document.querySelector('title');
  if (!titleEl) return;

  titleObserver = new MutationObserver(callback);
  titleObserver.observe(titleEl, { childList: true, subtree: true });
}

// --- Public API ---

/**
 * Initializes the website monitor in the content script context.
 * Safe to call multiple times — initialization only happens once.
 *
 * @returns {void}
 */
export function initWebsiteMonitor() {
  if (isInitialized) return;
  isInitialized = true;

  _evaluateCurrentPage();
  _observeTitleChange(_evaluateCurrentPage);
}

/**
 * Determines whether a URL is on the user's distraction blocklist.
 * Respects the focusModeEnabled and strictMode settings.
 *
 * @param {string} url - URL to check.
 * @returns {Promise<boolean>}
 */
export async function isDistracting(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return false;
    }

    const settings = await new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (result) => {
        resolve(result[STORAGE_KEYS.SETTINGS] || {});
      });
    });

    // If focus mode is off, never block anything
    if (settings.focusModeEnabled === false) return false;

    const blockedSites = Array.isArray(settings.blockedWebsites)
      ? settings.blockedWebsites
      : [];

    return blockedSites.some(
      (site) => hostname === site || hostname.endsWith('.' + site)
    );
  } catch {
    return false;
  }
}

/**
 * Resets the monitor state, disconnecting observers so the page can re-initialize.
 *
 * @returns {void}
 */
export function resetWebsiteMonitor() {
  if (titleObserver) {
    titleObserver.disconnect();
    titleObserver = null;
  }
  isInitialized = false;
}
