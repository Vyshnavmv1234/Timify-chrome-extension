/**
 * content.js
 *
 * Content script entry point — runs in the context of web pages.
 *
 * IMPORTANT: This is a CLASSIC (non-module) content script.
 * Do NOT add ES import/export statements — Chrome does NOT support them
 * in manifest-declared content_scripts (only background service workers support
 * "type":"module"). Using import here silently prevents the entire script
 * from loading on every page.
 *
 * What this file does:
 *   1. Inline website distraction monitor (replaces services/websiteMonitor.js
 *      which could not be imported here due to the module restriction).
 *   2. Listens for SHOW_MOTIVATION_HUD from the background service worker
 *      and calls window.showMotivationHud() (defined by motivationHud.js,
 *      which is listed before this file in manifest content_scripts).
 */

'use strict';

// ---------------------------------------------------------------------------
// 1. Website distraction monitor (inlined — no ES import possible here)
// ---------------------------------------------------------------------------

(function initWebsiteMonitor() {
  let _initialized = false;
  let _titleObserver = null;

  function _evaluateCurrentPage() {
    const url = window.location.href;
    if (!url.startsWith('http')) return;

    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get('timify_settings', function (res) {
      if (chrome.runtime.lastError) return;
      const settings = res['timify_settings'] || {};

      // Only block if focus mode is on
      if (!settings.focusModeEnabled) return;

      const blockedSites = Array.isArray(settings.blockedWebsites) ? settings.blockedWebsites : [];
      let hostname = '';
      try { hostname = new URL(url).hostname.toLowerCase(); } catch (e) { return; }

      const isBlocked = blockedSites.some(
        function (site) { return hostname === site || hostname.endsWith('.' + site); }
      );

      if (!isBlocked) return;

      // Check if a focus session is running before redirecting
      chrome.storage.local.get('timify_timer_state', function (res2) {
        if (chrome.runtime.lastError) return;
        const state = res2['timify_timer_state'];
        if (!state || state.status !== 'running' || state.sessionType !== 'focus') return;

        try {
          chrome.runtime.sendMessage({ type: 'DISTRACTION_DETECTED', url: url });
        } catch (e) {
          console.warn('[Timify websiteMonitor] Failed to send DISTRACTION_DETECTED:', e);
        }

        const blockedPageUrl = chrome.runtime.getURL('pages/blocked.html?url=' + encodeURIComponent(url));
        window.location.href = blockedPageUrl;
      });
    });
  }

  if (!_initialized) {
    _initialized = true;
    _evaluateCurrentPage();

    // Observe SPA title changes (YouTube, Gmail, etc.)
    const titleEl = document.querySelector('title');
    if (titleEl) {
      _titleObserver = new MutationObserver(_evaluateCurrentPage);
      _titleObserver.observe(titleEl, { childList: true, subtree: true });
    }
  }
}());

// ---------------------------------------------------------------------------
// 2. Motivation HUD message listener
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener(function (message, _sender, _sendResponse) {
  console.log('[Timify content.js] Message received:', message && message.type);

  if (message && message.type === 'SHOW_MOTIVATION_HUD') {
    console.log('[Timify content.js] SHOW_MOTIVATION_HUD received — data:', message.data);

    if (typeof window.showMotivationHud === 'function') {
      window.showMotivationHud(message.data || {});
      console.log('[Timify content.js] showMotivationHud() called successfully.');
    } else {
      console.error(
        '[Timify content.js] window.showMotivationHud is NOT defined. ' +
        'motivationHud.js must be listed before content.js in manifest content_scripts.'
      );
    }
  }

  return false; // synchronous handler — no async response
});

console.log('[Timify content.js] Loaded. Message listener active. HUD available:', typeof window.showMotivationHud === 'function');
