/**
 * content.js
 *
 * Content script entry point — runs in the context of web pages.
 * Initializes distraction detection via websiteMonitor service.
 * Does not inject UI in this scaffold phase.
 */

import { initWebsiteMonitor, checkCurrentSite } from '../services/websiteMonitor.js';

/**
 * Initializes the content script for the current page.
 * @returns {Promise<void>}
 */
async function initContentScript() {
  initWebsiteMonitor();

  const { url, isDistracting } = await checkCurrentSite();

  if (isDistracting) {
    // TODO: Notify background script of distraction
    console.log('[Timify] Distracting site detected:', url);
  }
}

initContentScript().catch((error) => {
  console.error('[Timify] Content script init error:', error);
});
