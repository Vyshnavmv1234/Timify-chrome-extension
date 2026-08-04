/**
 * popup.js
 *
 * Quick Control Center — handles the popup's single home view.
 * Manages the timer display, daily stats, preset chips, and navigation
 * to the full Dashboard and Settings pages.
 *
 * All heavier views (Tasks, Reports, Settings) live in the Dashboard tab.
 */

import { injectIcons } from './icons.js';
import { formatDuration } from '../utils/dateUtils.js';

// --- State ---
let currentSettings = null;
let timerTickInterval = null;

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

/**
 * Initialises the popup UI.
 */
async function initPopup() {
  injectIcons();
  initTimerControls();
  initPresetControls();
  initQuickTimers();
  initNavActions();

  await refreshAll();
  startTimerSync();
  await refreshQuote();

  // Listen for broadcast events from the background coordinator
  chrome.runtime.onMessage.addListener((message) => {
    const syncTypes = [
      'TIMER_STATE_CHANGED',
      'TIMER_FINISHED',
      'SETTINGS_UPDATE',
      'DATA_RESET',
      'DISTRACTION_LOGGED',
      'FOCUS_SCORE_UPDATE',
    ];
    if (syncTypes.includes(message?.type)) {
      refreshAll();
    }
  });
}

// ---------------------------------------------------------------------------
// Data refresh
// ---------------------------------------------------------------------------

/**
 * Refreshes all data on the home view.
 */
async function refreshAll() {
  try {
    const [timerState, settings, dailyReport, streak] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_STATE' }),
      chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }),
      chrome.runtime.sendMessage({ type: 'GET_REPORTS', period: 'daily' }),
      chrome.runtime.sendMessage({ type: 'GET_STREAK' }),
    ]);

    currentSettings = settings;

    updateGreeting(settings, dailyReport, streak);
    updateStats(dailyReport);
    syncTimerDisplay(timerState);
  } catch (e) {
    console.error('[Timify] Popup refresh failed:', e);
  }
}

// ---------------------------------------------------------------------------
// Timer sync
// ---------------------------------------------------------------------------

/**
 * Starts a 1-second tick to keep the countdown display accurate.
 */
function startTimerSync() {
  if (timerTickInterval) clearInterval(timerTickInterval);
  timerTickInterval = setInterval(async () => {
    try {
      const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      syncTimerDisplay(state);
    } catch {
      // Popup may have been closed; interval will be GC'd
    }
  }, 1000);
}

/**
 * Updates the timer card display from the given state.
 * @param {Object} state - Timer state from background.
 */
function syncTimerDisplay(state) {
  if (!state) return;

  const display = document.querySelector('.timer-card__display');
  const label = document.querySelector('.timer-card__label');
  const startBtn = document.getElementById('btn-timer-start');

  if (display) display.textContent = formatDuration(state.remainingMs);
  if (label) label.textContent = state.sessionType === 'focus' ? 'Focus Timer' : 'Break Timer';

  if (startBtn) {
    if (state.status === 'running') {
      startBtn.textContent = 'Pause';
      startBtn.className = 'btn btn--secondary';
    } else {
      startBtn.textContent = state.status === 'paused' ? 'Resume' : 'Start';
      startBtn.className = 'btn btn--primary';
    }
  }

  syncPresetChips(state);
}

/**
 * Highlights the preset chip that matches the current timer durations.
 * @param {Object} state - Timer state.
 */
function syncPresetChips(state) {
  document.querySelectorAll('.preset-group__buttons .btn').forEach((chip) => {
    const text = chip.textContent.trim();
    if (text.includes('/')) {
      const [fStr, bStr] = text.split('/');
      const match = state &&
        parseInt(fStr.trim(), 10) === state.focusMinutes &&
        parseInt(bStr.trim(), 10) === state.breakMinutes;
      chip.classList.toggle('btn--active', match);
    }
  });
}

// ---------------------------------------------------------------------------
// Header / stats
// ---------------------------------------------------------------------------

/**
 * Updates the greeting, streak badge, and daily goal progress ring.
 * @param {Object} settings
 * @param {Object} report
 * @param {number} streak
 */
function updateGreeting(settings, report, streak) {
  const timeEl = document.querySelector('.home-greeting__time');
  const nameEl = document.querySelector('.home-greeting__name');
  if (timeEl && nameEl) {
    const hour = new Date().getHours();
    let greeting = 'Good Morning,';
    if (hour >= 12 && hour < 17) greeting = 'Good Afternoon,';
    else if (hour >= 17) greeting = 'Good Evening,';
    timeEl.textContent = greeting;
    nameEl.textContent = settings?.username || 'Student';
  }

  const streakEl = document.querySelector('.home-streak__count');
  if (streakEl) streakEl.textContent = typeof streak === 'number' ? streak : 0;

  const goalMinutes = settings?.dailyGoalMinutes || 480;
  const studyMinutes = report?.totalStudyTimeMinutes || 0;
  const pct = Math.min(100, Math.round((studyMinutes / goalMinutes) * 100));

  const goalTitleEl = document.querySelector('.home-goal__title');
  if (goalTitleEl) {
    const hrs = Math.round(goalMinutes / 60);
    goalTitleEl.textContent = goalMinutes >= 60
      ? `${hrs} Hour${hrs !== 1 ? 's' : ''}`
      : `${goalMinutes} Minutes`;
  }

  const ringFill = document.querySelector('.progress-ring__fill');
  const ringLabel = document.querySelector('.progress-ring__label');
  if (ringLabel) ringLabel.textContent = `${pct}%`;
  if (ringFill) {
    const maxOffset = 188.5;
    ringFill.style.strokeDashoffset = maxOffset * (1 - pct / 100);
  }
}

/**
 * Updates the three quick-stats values.
 * @param {Object} report
 */
function updateStats(report) {
  const timeEl = document.getElementById('stat-study-time');
  const sessionsEl = document.getElementById('stat-sessions');
  const scoreEl = document.getElementById('stat-focus-score');

  if (report) {
    const hours = Math.floor(report.totalStudyTimeMinutes / 60);
    const mins = report.totalStudyTimeMinutes % 60;
    if (timeEl) timeEl.textContent = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
    if (sessionsEl) sessionsEl.textContent = report.pomodoroCount ?? 0;
    if (scoreEl) scoreEl.textContent = report.focusScore ?? 80;
  }
}

// ---------------------------------------------------------------------------
// Quote
// ---------------------------------------------------------------------------

/**
 * Fetches and displays a random motivational quote.
 */
async function refreshQuote() {
  try {
    const quote = await chrome.runtime.sendMessage({ type: 'GET_RANDOM_QUOTE' });
    const textEl = document.querySelector('.quote-card__text');
    const authorEl = document.querySelector('.quote-card__author');
    if (quote && textEl && authorEl) {
      textEl.innerHTML = quote.text.replace(/\. /g, '.<br>');
      authorEl.textContent = `— ${quote.author}`;
    }
  } catch {
    // Non-critical — silently skip
  }
}

// ---------------------------------------------------------------------------
// Timer controls
// ---------------------------------------------------------------------------

/**
 * Binds Start/Pause and Stop buttons.
 */
function initTimerControls() {
  const startBtn = document.getElementById('btn-timer-start');
  const stopBtn = document.getElementById('btn-timer-stop');

  startBtn?.addEventListener('click', async () => {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (state.status === 'running') {
      await chrome.runtime.sendMessage({ type: 'TIMER_PAUSE' });
    } else {
      await chrome.runtime.sendMessage({ type: 'TIMER_START' });
    }
  });

  stopBtn?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'TIMER_STOP' });
  });
}

/**
 * Binds Pomodoro preset chips.
 */
function initPresetControls() {
  document.querySelectorAll('.preset-group__buttons .btn').forEach((chip) => {
    chip.addEventListener('click', async () => {
      const text = chip.textContent.trim();
      if (!text.includes('/')) return;

      const [focusStr, breakStr] = text.split('/');
      await chrome.runtime.sendMessage({
        type: 'SET_CUSTOM_DURATIONS',
        focusMinutes: parseInt(focusStr.trim(), 10),
        breakMinutes: parseInt(breakStr.trim(), 10),
      });
      await chrome.runtime.sendMessage({ type: 'TIMER_STOP' });
    });
  });
}

/**
 * Binds Quick Timer buttons.
 */
function initQuickTimers() {
  document.querySelectorAll('.quick-timers .btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.textContent.trim();
      const hours = parseInt(text.split(' ')[0], 10);
      if (isNaN(hours)) return;
      await chrome.runtime.sendMessage({ type: 'SET_TIMER_MODE', mode: 'countdown' });
      await chrome.runtime.sendMessage({ type: 'TIMER_START', minutes: hours * 60 });
    });
  });
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Binds the Open Dashboard and Open Settings buttons.
 * Uses the background service worker to open tabs (avoids popup needing tabs permission directly).
 */
function initNavActions() {
  document.getElementById('btn-open-dashboard')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  });

  document.getElementById('btn-open-settings')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', initPopup);
