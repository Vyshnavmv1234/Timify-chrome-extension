/**
 * background.js
 *
 * Manifest V3 service worker — the extension's background coordinator.
 * Handles lifecycle events, alarms, and cross-context messaging.
 * Coordinates timer events, notifications, alarms, website monitoring, and reports.
 *
 * Architecture:
 *   UI → background messages → timerService / sessionService → storageService → reportService → UI
 */

import { MESSAGE_TYPES, STORAGE_KEYS } from '../utils/constants.js';
import {
  getTimerState,
  getActiveTimer,
  getActiveStopwatch,
  startCountdownTimer,
  pauseCountdownTimer,
  stopCountdownTimer,
  handleTimerAlarm,
  clockIn,
  clockOut,
  pauseStopwatch,
  resumeStopwatch,
  setTimerMode,
  setCustomDurations,
  migrateLegacyTimerState,
} from '../services/timerService.js';
import { notifyTimerComplete, notifyDistraction } from '../services/notificationService.js';
import {
  triggerMotivationNotification,
  startMotivationAlarm,
  stopMotivationAlarm,
  getRandomQuote,
} from '../services/motivationService.js';
import { getSettings, updateSettings, clear as storageClear } from '../services/storageService.js';
import {
  recordSession,
  recordDistraction,
  getRecentSessions,
  getReportSummary,
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  getStreak,
  getHeatmapData,
  getChartData,
} from '../services/reportService.js';
import { getTasks, addTask, updateTask, deleteTask, completeTask } from '../services/taskService.js';

// ---------------------------------------------------------------------------
// De-duplication guard for timer completion
// ---------------------------------------------------------------------------

/**
 * Tracks which timer session IDs have already been recorded as completed.
 * This prevents the alarm handler from double-recording if it fires twice
 * (e.g., service worker restart race). Keyed by "startTime-endTime" pair.
 * Cleared when a new timer session starts.
 */
const _completedTimerKeys = new Set();

function _timerKey(startTime, endTime) {
  return `${startTime}-${endTime}`;
}

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
    // Initialize reports storage
    await chrome.storage.local.set({
      [STORAGE_KEYS.REPORTS]: { sessions: [], distractions: [] },
    });
    await chrome.storage.local.set({ [STORAGE_KEYS.TASKS]: [] });
    // Initialize new split timer state
    await getTimerState();
    console.log('[Timify] Seeded default settings, timer state, and lists.');
  }

  // Always run migration on install or update (idempotent)
  await migrateLegacyTimerState();
}

// ---------------------------------------------------------------------------
// Alarms
// ---------------------------------------------------------------------------

/**
 * Handles alarm events.
 * @param {chrome.alarms.Alarm} alarm
 * @returns {Promise<void>}
 */
async function onAlarm(alarm) {
  console.log('[Timify background] onAlarm fired:', alarm.name);

  if (alarm.name === 'timify_timer_alarm') {
    const result = await handleTimerAlarm();

    if (result) {
      const { sessionRecord, state } = result;
      await stopMotivationAlarm();

      // Broadcast to all open UIs
      chrome.runtime.sendMessage({
        type: 'SESSION_COMPLETED',
        session: sessionRecord,
        timerState: state,
      }).catch(() => {});

      chrome.runtime.sendMessage({
        type: 'TIMER_FINISHED',
        state,
        session: sessionRecord,
      }).catch(() => {});
    }
  } else if (alarm.name === 'timify_motivation_alarm') {
    console.log('[Timify background] ── Motivation alarm fired → calling triggerMotivationNotification()');
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

    // ── Shared state query ──────────────────────────────────────────────
    case MESSAGE_TYPES.GET_STATE:
      return getTimerState();

    // ── Countdown Timer ─────────────────────────────────────────────────
    case MESSAGE_TYPES.TIMER_START: {
      const state = await startCountdownTimer(message?.minutes);
      if (state.sessionType === 'focus' || state.status === 'running') {
        await startMotivationAlarm();
      }
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    case MESSAGE_TYPES.TIMER_PAUSE: {
      const state = await pauseCountdownTimer();
      await stopMotivationAlarm();
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    case MESSAGE_TYPES.TIMER_STOP: {
      const state = await stopCountdownTimer();
      await stopMotivationAlarm();
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    // ── Stopwatch (Clock In / Clock Out) ────────────────────────────────
    case 'CLOCK_IN': {
      const state = await clockIn();
      await startMotivationAlarm();
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state: await getTimerState() }).catch(() => {});
      return state;
    }

    case 'CLOCK_OUT': {
      const result = await clockOut();
      await stopMotivationAlarm();

      if (result) {
        const { sessionRecord } = result;
        const persisted = await recordSession(sessionRecord);
        console.log('[Timify] Stopwatch session recorded:', persisted.id, 'duration:', persisted.durationMs + 'ms');

        const timerState = await getTimerState();
        chrome.runtime.sendMessage({
          type: 'SESSION_COMPLETED',
          session: persisted,
          timerState,
        }).catch(() => {});
        chrome.runtime.sendMessage({
          type: 'TIMER_STATE_CHANGED',
          state: timerState,
        }).catch(() => {});

        return persisted;
      }
      return null;
    }

    case 'STOPWATCH_PAUSE': {
      const state = await pauseStopwatch();
      await stopMotivationAlarm();
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state: await getTimerState() }).catch(() => {});
      return state;
    }

    case 'STOPWATCH_RESUME': {
      const state = await resumeStopwatch();
      await startMotivationAlarm();
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state: await getTimerState() }).catch(() => {});
      return state;
    }

    // ── Legacy stopwatch stop (kept for backward compat) ────────────────
    case 'STOPWATCH_STOP': {
      // Treat as CLOCK_OUT
      const result = await clockOut();
      await stopMotivationAlarm();
      if (result) {
        const { sessionRecord } = result;
        const persisted = await recordSession(sessionRecord);
        const timerState = await getTimerState();
        chrome.runtime.sendMessage({ type: 'SESSION_COMPLETED', session: persisted, timerState }).catch(() => {});
        chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state: timerState }).catch(() => {});
        return persisted;
      }
      return null;
    }

    // ── Mode switching (preference only — never resets sessions) ────────
    case 'SET_TIMER_MODE': {
      const state = await setTimerMode(message?.mode);
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    case 'SET_CUSTOM_DURATIONS': {
      const state = await setCustomDurations(message?.focusMinutes, message?.breakMinutes);
      chrome.runtime.sendMessage({ type: 'TIMER_STATE_CHANGED', state }).catch(() => {});
      return state;
    }

    // ── Settings ────────────────────────────────────────────────────────
    case 'GET_SETTINGS':
      return getSettings();

    case 'UPDATE_SETTINGS': {
      const settings = await updateSettings(message?.updates);
      if (
        message?.updates?.focusMinutes !== undefined ||
        message?.updates?.breakMinutes !== undefined
      ) {
        await setCustomDurations(message?.updates?.focusMinutes, message?.updates?.breakMinutes);
      }
      chrome.runtime.sendMessage({ type: 'SETTINGS_UPDATE', settings }).catch(() => {});
      return settings;
    }

    // ── Distractions ────────────────────────────────────────────────────
    case MESSAGE_TYPES.DISTRACTION_DETECTED: {
      await recordDistraction(message?.url);
      await notifyDistraction(message?.url);
      chrome.runtime.sendMessage({ type: 'DISTRACTION_LOGGED', url: message?.url }).catch(() => {});
      chrome.runtime.sendMessage({ type: MESSAGE_TYPES.FOCUS_SCORE_UPDATE }).catch(() => {});
      return { received: true };
    }

    // ── Navigation ──────────────────────────────────────────────────────
    case MESSAGE_TYPES.OPEN_DASHBOARD:
      await openDashboardTab(message?.hash || '');
      return { opened: true };

    case MESSAGE_TYPES.OPEN_SETTINGS:
      await openSettingsTab();
      return { opened: true };

    // ── Tasks ───────────────────────────────────────────────────────────
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

    // ── Reports ─────────────────────────────────────────────────────────
    case 'GET_REPORTS': {
      const period = message?.period;
      if (period === 'weekly') return generateWeeklyReport();
      if (period === 'monthly') return generateMonthlyReport();
      return generateDailyReport();
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
        timer: allTimer,
      };
    }

    case 'RESET_DATA': {
      await storageClear();
      const initialSettings = await getSettings();
      const initialTimer = await getTimerState();
      chrome.runtime.sendMessage({
        type: 'DATA_RESET',
        settings: initialSettings,
        timer: initialTimer,
      }).catch(() => {});
      return { success: true };
    }

    // ── Analytics ───────────────────────────────────────────────────────
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

// Migrate on service worker startup (handles browser restarts)
migrateLegacyTimerState().catch((err) => {
  console.error('[Timify] Migration error on startup:', err);
});

// Open (or focus) the Dashboard whenever the extension icon is clicked.
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

// Start motivation alarm scheduled at the configured interval (45 minutes)
startMotivationAlarm().catch((err) => {
  console.error('[Timify] Failed to start motivation alarm on init:', err);
});

console.log('[Timify] Background service worker initialized (45-minute motivation schedule active)');
