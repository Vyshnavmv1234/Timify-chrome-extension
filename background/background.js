/**
 * background.js
 *
 * Manifest V3 service worker — the extension's background coordinator.
 * Handles lifecycle events, alarms, and cross-context messaging.
 * Coordinates timer events, notifications, alarms, website monitoring, and reports.
 */

import { MESSAGE_TYPES, STORAGE_KEYS } from '../utils/constants.js';
import { getTimerState, handleTimerAlarm, startTimer, pauseTimer, stopTimer, setTimerMode, setCustomDurations } from '../services/timerService.js';
import { notifyTimerComplete, notifyDistraction } from '../services/notificationService.js';
import { triggerMotivationNotification, startMotivationAlarm, stopMotivationAlarm, getRandomQuote } from '../services/motivationService.js';
import { getSettings, updateSettings, clear as storageClear } from '../services/storageService.js';
import { recordSession, recordDistraction, getRecentSessions, getReportSummary, generateDailyReport, generateWeeklyReport, generateMonthlyReport, getStreak, getHeatmapData, getChartData } from '../services/reportService.js';
import { getTasks, addTask, updateTask, deleteTask, completeTask } from '../services/taskService.js';

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Handles extension install and update events.
 * @param {chrome.runtime.InstalledDetails} details
 * @returns {Promise<void>}
 */
async function onInstall(details) {
  console.log('[Timify] Extension installed/updated:', details.reason);
  if (details.reason === 'install') {
    await getSettings();
    await getTimerState();
    await chrome.storage.local.set({ [STORAGE_KEYS.REPORTS]: { sessions: [], distractions: [] } });
    await chrome.storage.local.set({ [STORAGE_KEYS.TASKS]: [] });
    console.log('[Timify] Seeded default settings, timer state, and lists.');
  }
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

/**
 * Handles alarm events (timer ticks, scheduled checks).
 * @param {chrome.alarms.Alarm} alarm
 * @returns {Promise<void>}
 */
async function onAlarm(alarm) {
  if (alarm.name === 'timify_timer_alarm') {
    const stateBefore = await getTimerState();
    if (stateBefore && stateBefore.status === 'running') {
      const prevSessionType = stateBefore.sessionType;
      const startTime = stateBefore.startTime;
      const endTime = Date.now();
      const durationMs = stateBefore.remainingMs;

      const newState = await handleTimerAlarm();

      const sessionRecord = {
        type: prevSessionType,
        startTime,
        endTime,
        durationMs,
        completed: true
      };
      await recordSession(sessionRecord);
      await stopMotivationAlarm();

      chrome.runtime.sendMessage({
        type: 'TIMER_FINISHED',
        state: newState,
        session: sessionRecord
      }).catch(() => {}); // Suppress "no receivers" error when popup is closed
    }
  } else if (alarm.name === 'timify_motivation_alarm') {
    await triggerMotivationNotification();
  }
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/**
 * Opens the dashboard in a new tab. If a dashboard tab is already open,
 * focuses it instead of creating a duplicate.
 *
 * @param {string} [hash] - Optional URL hash (e.g. '#settings') to append.
 */
async function openDashboardTab(hash = '') {
  const dashboardUrl = chrome.runtime.getURL('pages/dashboard.html') + hash;
  const existing = await chrome.tabs.query({ url: chrome.runtime.getURL('pages/dashboard.html') + '*' });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true, url: dashboardUrl });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: dashboardUrl });
  }
}

/**
 * Opens the settings page in a new tab.
 */
async function openSettingsTab() {
  const settingsUrl = chrome.runtime.getURL('pages/settings.html');
  const existing = await chrome.tabs.query({ url: settingsUrl });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.windows.update(existing[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: settingsUrl });
  }
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

/**
 * Routes incoming messages from popup, content scripts, and dashboard.
 * @param {Object} message
 * @param {chrome.runtime.MessageSender} sender
 * @returns {Promise<unknown>}
 */
export async function handleMessage(message, sender) {
  void sender;

  switch (message?.type) {
    case MESSAGE_TYPES.GET_STATE:
      return getTimerState();

    case MESSAGE_TYPES.TIMER_START: {
      const state = await startTimer(message?.minutes);
      if (state.sessionType === 'focus') {
        await startMotivationAlarm();
      } else {
        await stopMotivationAlarm();
      }
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    case MESSAGE_TYPES.TIMER_PAUSE: {
      const state = await pauseTimer();
      await stopMotivationAlarm();
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    case MESSAGE_TYPES.TIMER_STOP: {
      const state = await stopTimer();
      await stopMotivationAlarm();
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    case 'STOPWATCH_STOP': {
      const currentState = await getTimerState();
      if (currentState.timerMode === 'stopwatch' && currentState.remainingMs > 0) {
        const sessionRecord = {
          type: 'focus',
          startTime: currentState.startTime || (Date.now() - currentState.remainingMs),
          endTime: Date.now(),
          durationMs: currentState.remainingMs,
          completed: true
        };
        await recordSession(sessionRecord);
      }
      const state = await stopTimer();
      await stopMotivationAlarm();
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    case 'SET_TIMER_MODE': {
      const state = await setTimerMode(message?.mode);
      await stopMotivationAlarm();
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    case 'SET_CUSTOM_DURATIONS': {
      const state = await setCustomDurations(message?.focusMinutes, message?.breakMinutes);
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    case 'GET_SETTINGS':
      return getSettings();

    case 'UPDATE_SETTINGS': {
      const settings = await updateSettings(message?.updates);
      if (message?.updates?.focusMinutes !== undefined || message?.updates?.breakMinutes !== undefined) {
        await setCustomDurations(message?.updates?.focusMinutes, message?.updates?.breakMinutes);
      }
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', settings }).catch(() => {});
      return settings;
    }

    case MESSAGE_TYPES.DISTRACTION_DETECTED: {
      // Record the distraction
      await recordDistraction(message?.url);
      // Show a browser notification (respects user's notificationsEnabled setting)
      await notifyDistraction(message?.url);
      // Broadcast so live UIs (popup, dashboard) can refresh their focus score
      chrome.runtime.sendMessage({
        type: 'DISTRACTION_LOGGED',
        url: message?.url
      }).catch(() => {});
      // Also broadcast a focus score update
      chrome.runtime.sendMessage({
        type: MESSAGE_TYPES.FOCUS_SCORE_UPDATE
      }).catch(() => {});
      return { received: true };
    }

    case MESSAGE_TYPES.OPEN_DASHBOARD:
      await openDashboardTab(message?.hash || '');
      return { opened: true };

    case MESSAGE_TYPES.OPEN_SETTINGS:
      await openSettingsTab();
      return { opened: true };

    case 'GET_TASKS':
      return getTasks();

    case 'TASK_ADD': {
      const task = await addTask(message?.task);
      chrome.runtime.sendMessage({ type: 'TASK_UPDATE' }).catch(() => {});
      return task;
    }

    case 'TASK_UPDATE': {
      const task = await updateTask(message?.id, message?.updates);
      chrome.runtime.sendMessage({ type: 'TASK_UPDATE' }).catch(() => {});
      return task;
    }

    case 'TASK_COMPLETE': {
      const task = await completeTask(message?.id, message?.completed);
      chrome.runtime.sendMessage({ type: 'TASK_UPDATE' }).catch(() => {});
      return task;
    }

    case 'TASK_DELETE': {
      const success = await deleteTask(message?.id);
      chrome.runtime.sendMessage({ type: 'TASK_UPDATE' }).catch(() => {});
      return { success };
    }

    case 'GET_REPORTS': {
      const period = message?.period;
      if (period === 'weekly') {
        return generateWeeklyReport();
      } else if (period === 'monthly') {
        return generateMonthlyReport();
      } else {
        return generateDailyReport();
      }
    }

    case 'GET_REPORT_SUMMARY':
      return getReportSummary();

    case 'GET_RECENT_SESSIONS':
      return getRecentSessions(message?.limit);

    case 'GET_ALL_DATA': {
      const allTasks = await getTasks();
      const allReports = await chrome.storage.local.get(STORAGE_KEYS.REPORTS);
      const allSettings = await getSettings();
      const allTimer = await getTimerState();
      return {
        tasks: allTasks,
        reports: allReports?.[STORAGE_KEYS.REPORTS] || { sessions: [], distractions: [] },
        settings: allSettings,
        timer: allTimer
      };
    }

    case 'RESET_DATA': {
      await storageClear();
      const initialSettings = await getSettings();
      const initialTimer = await getTimerState();
      chrome.runtime.sendMessage({ type: 'DATA_RESET', settings: initialSettings, timer: initialTimer }).catch(() => {});
      return { success: true };
    }

    case 'GET_STREAK':
      return getStreak();

    case 'GET_HEATMAP_DATA':
      return getHeatmapData();

    case 'GET_CHART_DATA':
      return getChartData(message?.period);

    case 'GET_RANDOM_QUOTE':
      return getRandomQuote();

    default:
      return { received: true };
  }
}

// ---------------------------------------------------------------------------
// Event listeners
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(onInstall);

// Open (or focus) the Dashboard whenever the extension icon is clicked.
// This only fires because there is no default_popup in manifest.json.
chrome.action.onClicked.addListener(() => {
  openDashboardTab().catch((err) => {
    console.error('[Timify] Failed to open dashboard on icon click:', err);
  });
});

chrome.alarms.onAlarm.addListener(onAlarm);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('[Timify] Message handler error:', error);
      sendResponse({ error: error.message });
    });

  return true; // Keep message channel open for async sendResponse
});

console.log('[Timify] Background service worker initialized');
