/**
 * background.js
 *
 * Manifest V3 service worker — the extension's background coordinator.
 * Handles lifecycle events, alarms, and cross-context messaging.
 * Business logic is delegated to services.
 */

import { MESSAGE_TYPES } from '../utils/constants.js';
import { getTimerState } from '../services/timerService.js';
import { notifyTimerComplete } from '../services/notificationService.js';

/**
 * Initializes the background service worker.
 * @returns {void}
 */
export function initBackground() {
  console.log('[Timify] Background service worker initialized');
}

/**
 * Handles extension install and update events.
 * @param {chrome.runtime.InstalledDetails} details
 * @returns {Promise<void>}
 */
async function onInstall(details) {
  // TODO: Seed default settings and distraction list on first install
  console.log('[Timify] Extension installed/updated:', details.reason);
}

/**
 * Handles alarm events (timer ticks, scheduled checks).
 * @param {chrome.alarms.Alarm} alarm
 * @returns {Promise<void>}
 */
async function onAlarm(alarm) {
  // TODO: Route alarm to appropriate handler based on alarm.name
  console.log('[Timify] Alarm fired:', alarm.name);
}

/**
 * Routes incoming messages from popup, content scripts, and dashboard.
 * @param {Object} message
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<unknown>}
 */
export async function handleMessage(message, sender) {
  // TODO: Implement full message routing
  void sender;

  switch (message?.type) {
    case MESSAGE_TYPES.GET_STATE:
      return getTimerState();

    case MESSAGE_TYPES.TIMER_START:
    case MESSAGE_TYPES.TIMER_PAUSE:
    case MESSAGE_TYPES.TIMER_STOP:
      return { received: true, type: message.type };

    case MESSAGE_TYPES.DISTRACTION_DETECTED:
      return { received: true };

    default:
      return { received: true };
  }
}

// --- Event listeners ---

chrome.runtime.onInstalled.addListener(onInstall);

chrome.alarms.onAlarm.addListener(onAlarm);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('[Timify] Message handler error:', error);
      sendResponse({ error: error.message });
    });

  return true;
});

initBackground();

// Exported for testing; notifyTimerComplete will be used by timer alarm handler
void notifyTimerComplete;
