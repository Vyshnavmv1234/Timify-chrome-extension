/**
 * blocked.js
 *
 * Controller for the distraction block page.
 * Displays the remaining focus time plus session context (current task,
 * today's goal progress, session count) and handles three user actions:
 *   - Continue Studying → navigate to the dashboard
 *   - Open Dashboard → open the dashboard in the current tab
 *   - End Session → stop the timer and go back to the original URL
 */

import { formatRemaining } from '../services/timerService.js';

// ---------------------------------------------------------------------------
// Element refs
// ---------------------------------------------------------------------------

const countdownDisplay = document.getElementById('countdown-display');
const continueBtn      = document.getElementById('continue-studying-btn');
const dashboardBtn     = document.getElementById('open-dashboard-btn');
const endBtn           = document.getElementById('end-session-btn');
const ctxTask          = document.getElementById('ctx-task');
const ctxGoal          = document.getElementById('ctx-goal');
const ctxSession       = document.getElementById('ctx-session');

let timerInterval = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns the original URL from query params, or falls back to Google.
 * @returns {string}
 */
function getOriginalUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('url') || 'https://google.com';
}

/**
 * Redirects to the original distraction URL (used when session ends or is idle).
 */
function goBack() {
  window.location.href = getOriginalUrl();
}

/**
 * Sends a message to the background service worker.
 * @param {Object} msg
 * @returns {Promise<unknown>}
 */
function sendMsg(msg) {
  return chrome.runtime.sendMessage(msg);
}

// ---------------------------------------------------------------------------
// Countdown display
// ---------------------------------------------------------------------------

/**
 * Fetches the latest timer state and updates the countdown display.
 * If the session is no longer running, redirects back to the original URL.
 */
async function updateCountdown() {
  try {
    const state = await sendMsg({ type: 'GET_STATE' });

    if (!state || state.status !== 'running' || state.sessionType !== 'focus') {
      clearInterval(timerInterval);
      goBack();
      return;
    }

    if (countdownDisplay) {
      countdownDisplay.textContent = formatRemaining(state.remainingMs);
    }
  } catch (err) {
    console.error('[Blocked] Countdown update error:', err);
  }
}

// ---------------------------------------------------------------------------
// Context info
// ---------------------------------------------------------------------------

/**
 * Loads and displays current task, today's goal, and session info.
 */
async function loadContext() {
  try {
    const [tasks, settings, report] = await Promise.all([
      sendMsg({ type: 'GET_TASKS' }),
      sendMsg({ type: 'GET_SETTINGS' }),
      sendMsg({ type: 'GET_REPORTS', period: 'daily' }),
    ]);

    // Current task: first non-completed task
    if (ctxTask) {
      const active = Array.isArray(tasks) ? tasks.find((t) => !t.completed) : null;
      ctxTask.textContent = active ? active.title : 'No active task';
    }

    // Today's goal
    if (ctxGoal && settings) {
      const goalMinutes = settings.dailyGoalMinutes || 480;
      const studied = report?.totalStudyTimeMinutes || 0;
      const pct = Math.min(100, Math.round((studied / goalMinutes) * 100));
      const goalHrs = Math.round(goalMinutes / 60);
      const studiedHrs = Math.floor(studied / 60);
      const studiedMins = studied % 60;
      const studiedLabel = studiedHrs > 0 ? `${studiedHrs}h ${studiedMins}m` : `${studiedMins}m`;
      ctxGoal.textContent = `${studiedLabel} of ${goalHrs}h goal (${pct}%)`;
    }

    // Session info
    if (ctxSession && report) {
      const count = report.pomodoroCount || 0;
      const scoreLabel = report.focusScore !== undefined ? ` · Score ${report.focusScore}` : '';
      ctxSession.textContent = `${count} session${count !== 1 ? 's' : ''} today${scoreLabel}`;
    }

  } catch (err) {
    console.error('[Blocked] Context load error:', err);
    // Non-critical — context rows will just show "—"
  }
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

// "Continue Studying" → go to the dashboard (safe study environment)
continueBtn?.addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('pages/dashboard.html');
});

// "Open Dashboard" → open in same tab
dashboardBtn?.addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('pages/dashboard.html');
});

// "End Session" → stop the timer, then go back to original URL
endBtn?.addEventListener('click', async () => {
  try {
    await sendMsg({ type: 'TIMER_STOP' });
  } catch {
    // Proceed even if message fails
  }
  goBack();
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

updateCountdown();
timerInterval = setInterval(updateCountdown, 1000);
loadContext();
