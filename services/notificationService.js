/**
 * notificationService.js
 *
 * Handles browser notifications for timer events,
 * focus reminders, and distraction alerts.
 */

import { EXTENSION_INFO } from '../utils/constants.js';

/**
 * Shows a Chrome notification.
 * @param {Object} options
 * @param {string} options.title - Notification title
 * @param {string} [options.message] - Notification body text
 * @param {string} [options.iconUrl] - Optional icon URL
 * @returns {Promise<string|null>} Notification ID or null
 */
export async function showNotification({ title, message = '', iconUrl }) {
  // TODO: Implement chrome.notifications.create
  void title;
  void message;
  void iconUrl;
  return null;
}

/**
 * Clears a notification by ID.
 * @param {string} notificationId
 * @returns {Promise<void>}
 */
export async function clearNotification(notificationId) {
  // TODO: Implement chrome.notifications.clear
  void notificationId;
}

/**
 * Shows a timer completion notification.
 * @param {'focus'|'break'} sessionType
 * @returns {Promise<string|null>}
 */
export async function notifyTimerComplete(sessionType) {
  const title = sessionType === 'focus'
    ? `${EXTENSION_INFO.title} — Focus session complete!`
    : `${EXTENSION_INFO.title} — Break over!`;

  return showNotification({
    title,
    message: sessionType === 'focus'
      ? 'Time for a break.'
      : 'Ready to focus again?',
  });
}
