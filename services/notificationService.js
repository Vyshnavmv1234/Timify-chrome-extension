/**
 * notificationService.js
 *
 * Handles browser notifications for timer events,
 * focus reminders, and distraction alerts.
 * All notifications respect the user's notificationsEnabled setting.
 */

import { EXTENSION_INFO } from '../utils/constants.js';
import { getSettings } from './settingsService.js';

// --- Constants ---
const DEFAULT_ICON = 'assets/icons/icon128.png';

// --- Reusable Internal Helpers ---

/**
 * Gets a clean URL for extension assets.
 * Falls back to the string path if chrome.runtime is unavailable.
 *
 * @param {string} path - Relative asset path.
 * @returns {string}
 */
function _getAssetUrl(path) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL) {
    return chrome.runtime.getURL(path);
  }
  return path;
}

/**
 * Checks if the chrome.notifications API is supported and active in the current context.
 *
 * @returns {boolean}
 */
function _isNotificationsApiAvailable() {
  return typeof chrome !== 'undefined' && typeof chrome.notifications !== 'undefined';
}

// --- Public API ---

/**
 * Shows a Chrome notification, honouring the user's notificationsEnabled setting.
 *
 * @param {Object} options
 * @param {string} options.title - Notification title.
 * @param {string} [options.message] - Notification body text.
 * @param {string} [options.iconUrl] - Optional icon URL.
 * @param {'basic'|'image'|'list'|'progress'} [options.type] - Notification type.
 * @param {boolean} [options.ignoreSettings] - Skip settings check (for critical alerts).
 * @returns {Promise<string|null>} Notification ID or null if creation failed or disabled.
 */
export async function showNotification({ title, message = '', iconUrl, type = 'basic', ignoreSettings = false }) {
  if (!_isNotificationsApiAvailable()) {
    console.warn('[notificationService] chrome.notifications API is not available in this context.');
    return null;
  }

  // Respect the user's notification preference unless explicitly overridden
  if (!ignoreSettings) {
    try {
      const settings = await getSettings();
      if (!settings.notificationsEnabled) return null;
    } catch {
      // If settings can't be read, allow the notification through
    }
  }

  const finalIconUrl = iconUrl || _getAssetUrl(DEFAULT_ICON);

  return new Promise((resolve) => {
    try {
      chrome.notifications.create(
        '', // Let Chrome generate a random unique ID
        {
          type,
          iconUrl: finalIconUrl,
          title,
          message,
          priority: 2, // High priority to show immediately
        },
        (notificationId) => {
          if (chrome.runtime.lastError) {
            console.error('[notificationService] Failed to create notification:', chrome.runtime.lastError.message);
            resolve(null);
          } else {
            resolve(notificationId);
          }
        }
      );
    } catch (error) {
      console.error('[notificationService] Exception during notification creation:', error);
      resolve(null);
    }
  });
}

/**
 * Clears an active notification by ID.
 *
 * @param {string} notificationId - The ID of the notification to clear.
 * @returns {Promise<void>}
 */
export async function clearNotification(notificationId) {
  if (!notificationId || !_isNotificationsApiAvailable()) return;

  return new Promise((resolve) => {
    chrome.notifications.clear(notificationId, () => {
      if (chrome.runtime.lastError) {
        console.error('[notificationService] Failed to clear notification:', chrome.runtime.lastError.message);
      }
      resolve();
    });
  });
}

/**
 * Shows a timer completion notification (focus or break).
 *
 * @param {'focus'|'break'} sessionType
 * @returns {Promise<string|null>}
 */
export async function notifyTimerComplete(sessionType) {
  const isFocus = sessionType === 'focus';
  const title = isFocus
    ? `${EXTENSION_INFO.title} — Focus session complete!`
    : `${EXTENSION_INFO.title} — Break over!`;

  const message = isFocus
    ? 'Excellent deep work. Time for a well-deserved break!'
    : 'Ready to get back in the zone? Focus session starting now.';

  return showNotification({ title, message });
}

/**
 * Shows a random motivational notification to encourage the user.
 *
 * @param {string} [quoteText] - Optional quote text to display.
 * @returns {Promise<string|null>}
 */
export async function notifyMotivational(quoteText) {
  const message = quoteText || 'Keep pushing. Every minute of focus counts.';

  return showNotification({
    title: `${EXTENSION_INFO.title} — Keep going!`,
    message,
  });
}

/**
 * Shows a distraction warning notification when visiting restricted websites.
 *
 * @param {string} [websiteUrl] - Optional URL of the distracting website.
 * @returns {Promise<string|null>}
 */
export async function notifyDistraction(websiteUrl = '') {
  let domain = '';
  if (websiteUrl) {
    try {
      domain = new URL(websiteUrl).hostname;
    } catch (e) {
      domain = websiteUrl;
    }
  }

  const message = domain
    ? `It looks like you're visiting ${domain}. Focus mode is active—let's get back to work!`
    : 'Focus mode is active—stay clear of distracting sites!';

  return showNotification({
    title: `${EXTENSION_INFO.title} — Distraction Detected`,
    message,
  });
}
