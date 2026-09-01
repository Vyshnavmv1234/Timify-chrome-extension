/**
 * dashboard.js
 *
 * Three-page SPA for Timify: Study Timer, Tasks, Reports.
 * Holds zero business logic; delegates entirely to the service layer.
 *
 * Key invariants:
 *   - getTimerState() is the single source of display truth (calls background)
 *   - One setInterval drives ALL display updates; no duplicate intervals
 *   - Clock In / Clock Out sends CLOCK_IN / CLOCK_OUT to background
 *   - SESSION_COMPLETED triggers immediate Reports refresh
 */

import { formatRemaining } from '../services/timerService.js';
import { getTasks } from '../services/taskService.js';
import {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  getStreak,
  getChartData,
} from '../services/reportService.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

/** Exactly ONE interval drives all display updates. */
let _timerTickInterval = null;

let currentPage = 'timer';
let currentReportPeriod = 'daily';

/** Track mode to detect switches and animate the ring center crossfade. */
let _prevTimerMode = null;

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------

document.addEventListener('DOMContentLoaded', () => {
  initDashboard().catch((err) => {
    console.error('[Timify] Dashboard init error:', err);
  });
});

async function initDashboard() {
  updateTopbarDate();
  renderMonthNavigator();
  window.addEventListener('resize', _updateMonthIndicatorPosition);
  bindNavigation();
  bindModeSwitch();
  bindTimerControls();
  bindPresetControls();
  bindCustomDurationInput();
  bindTasksPage();
  bindReportsPage();
  _startTimerSync(); // starts exactly one interval
  showPage('timer');

  // Keep UI in sync with background events
  chrome.runtime.onMessage.addListener((message) => {
    switch (message?.type) {
      case 'TIMER_STATE_CHANGED':
      case 'TIMER_FINISHED':
      case 'DATA_RESET':
        syncTimerDisplay();
        break;

      case 'SESSION_COMPLETED':
        // A session was just recorded — refresh timer display and reports immediately
        syncTimerDisplay();
        refreshStopwatchTotal();
        if (currentPage === 'reports') loadReportsData();
        break;

      case 'TASK_UPDATE':
        if (currentPage === 'tasks') renderTaskList();
        if (currentPage === 'reports') loadReportsData();
        break;

      default:
        break;
    }
  });
}

// ---------------------------------------------------------------------------
// NAVIGATION & PAGE SWITCHING
// ---------------------------------------------------------------------------

const PAGE_TITLES = {
  timer: 'Study Timer',
  tasks: 'Tasks',
  reports: 'Reports',
};

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      if (!target) return;
      showPage(target);
    });
  });
}

function showPage(name) {
  currentPage = name;

  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('nav-item--active', btn.dataset.nav === name);
  });

  document.querySelectorAll('.page').forEach((el) => {
    el.classList.add('page--hidden');
  });
  const target = document.getElementById(`page-${name}`);
  if (target) target.classList.remove('page--hidden');

  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[name] || name;

  if (name === 'tasks') renderTaskList();
  if (name === 'reports') loadReportsData();
  if (name === 'timer') syncTimerDisplay();

  requestAnimationFrame(_updateMonthIndicatorPosition);
}

function updateTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (!el) return;
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  el.textContent = new Date().toLocaleDateString('en-US', opts);

  // If month has rolled over, re-render navigator
  if (_currentRenderedMonth !== null && _currentRenderedMonth !== new Date().getMonth()) {
    renderMonthNavigator();
  }
}

// ---------------------------------------------------------------------------
// YEAR PROGRESS MONTH NAVIGATOR
// ---------------------------------------------------------------------------

const MONTH_NAMES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
let _currentRenderedMonth = null;

function renderMonthNavigator() {
  const container = document.getElementById('month-nav');
  if (!container) return;

  const currentMonthIdx = new Date().getMonth();
  _currentRenderedMonth = currentMonthIdx;

  container.innerHTML = `
    <div class="month-nav__track">
      <div class="month-nav__indicator" id="month-nav-indicator" aria-hidden="true">
        <svg width="8" height="6" viewBox="0 0 8 6" fill="currentColor">
          <path d="M4 6L0.535898 0.75L7.4641 0.75L4 6Z"/>
        </svg>
      </div>
      <ul class="month-nav__list" role="list">
        ${MONTH_NAMES.map((m, idx) => `
          <li class="month-nav__item${idx === currentMonthIdx ? ' month-nav__item--active' : ''}" data-month="${idx}">
            ${m}
          </li>
        `).join('')}
      </ul>
    </div>
  `;

  requestAnimationFrame(() => {
    _updateMonthIndicatorPosition();
  });
}

function _updateMonthIndicatorPosition() {
  const activeItem = document.querySelector('.month-nav__item--active');
  const indicator = document.getElementById('month-nav-indicator');
  const track = document.querySelector('.month-nav__track');
  if (!activeItem || !indicator || !track) return;

  const activeRect = activeItem.getBoundingClientRect();
  const trackRect = track.getBoundingClientRect();
  if (trackRect.width === 0) return;

  const relativeLeft = (activeRect.left - trackRect.left) + (activeRect.width / 2);
  indicator.style.transform = `translateX(${relativeLeft}px) translateX(-50%)`;
  indicator.style.opacity = '1';
}

// ---------------------------------------------------------------------------
// TIMER SYNC — single interval, safe to call multiple times
// ---------------------------------------------------------------------------

function _startTimerSync() {
  if (_timerTickInterval) {
    clearInterval(_timerTickInterval);
    _timerTickInterval = null;
  }
  syncTimerDisplay();
  _timerTickInterval = setInterval(syncTimerDisplay, 1000);
}

/**
 * Fetches current unified state from background and routes to the correct renderer.
 * This is the only function allowed to touch the timer DOM.
 */
async function syncTimerDisplay() {
  let state;
  try {
    state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  } catch (err) {
    // Background may be restarting; skip this tick
    return;
  }
  if (!state) return;

  const isStopwatch = state.timerMode === 'stopwatch';
  const modeChanged = _prevTimerMode !== null && _prevTimerMode !== state.timerMode;

  // Mode button highlight
  document.getElementById('mode-btn-timer')?.classList.toggle('mode-switch__btn--active', !isStopwatch);
  document.getElementById('mode-btn-stopwatch')?.classList.toggle('mode-switch__btn--active', isStopwatch);

  // Preset / divider visibility (Timer mode only) — CSS handles the fade via [hidden] attribute
  const presetsSection = document.getElementById('timer-presets-section');
  const timerDivider   = document.getElementById('timer-divider');
  const customPanel    = document.getElementById('custom-duration-panel');
  if (presetsSection) presetsSection.hidden = isStopwatch;
  if (timerDivider)   timerDivider.hidden   = isStopwatch;
  if (isStopwatch && customPanel) customPanel.setAttribute('hidden', 'true');

  // On mode change: briefly fade ring center out, render new content, fade back in
  const ringCenter = document.querySelector('.timer-ring__center');
  if (modeChanged && ringCenter) {
    ringCenter.style.opacity = '0';
    // Let the fade-out play (200ms matches CSS transition), then render & fade in
    await new Promise((r) => setTimeout(r, 160));
    if (isStopwatch) {
      _renderStopwatchMode(state);
    } else {
      _renderCountdownMode(state);
    }
    // Force reflow so the new opacity transition starts fresh
    void ringCenter.offsetHeight;
    ringCenter.style.opacity = '';
  } else {
    if (isStopwatch) {
      _renderStopwatchMode(state);
    } else {
      _renderCountdownMode(state);
    }
  }

  _prevTimerMode = state.timerMode;
}

// ---------------------------------------------------------------------------
// STOPWATCH RENDERER
// ---------------------------------------------------------------------------

function _renderStopwatchMode(state) {
  const elapsedMs      = state.remainingMs || 0; // shim: remainingMs = elapsed for stopwatch
  const status         = state.status;            // 'idle' | 'running' | 'paused'

  const timeEl         = document.getElementById('timer-display');
  const labelEl        = document.getElementById('timer-session-label');
  const progressCircle = document.querySelector('.timer-ring__progress');
  const modeLabelEl    = document.getElementById('timer-mode-label');
  const modePill       = document.getElementById('timer-mode-pill');
  const metaRow        = document.getElementById('timer-meta');
  const swMetaRow      = document.getElementById('stopwatch-meta');
  const startBtn       = document.getElementById('timerStart');
  const resetBtn       = document.getElementById('timerReset');
  const stopBtn        = document.getElementById('timerStop');

  // Time display
  if (timeEl) timeEl.textContent = formatRemaining(elapsedMs);

  // Session label
  if (labelEl) {
    if (status === 'running') labelEl.textContent = 'Session in progress…';
    else if (status === 'paused') labelEl.textContent = 'Session paused';
    else labelEl.textContent = 'Stopwatch';
  }

  // Mode pill
  if (modeLabelEl) modeLabelEl.textContent = status === 'running' ? 'Recording' : 'Stopwatch';
  if (modePill) modePill.classList.toggle('is-running', status === 'running');

  // Progress ring — fill as elapsed grows (1-hour reference circle)
  if (progressCircle) {
    const refMs = 60 * 60 * 1000;
    const pct   = Math.min(elapsedMs / refMs, 1);
    progressCircle.style.strokeDashoffset = 616 * (1 - pct);
  }

  // Meta rows
  metaRow?.setAttribute('hidden', 'true');
  swMetaRow?.removeAttribute('hidden');

  // ── Stopwatch button layout ──
  //  idle:    [          Clock In           ]    ← single centred button
  //  running: [  Pause  ]  [  Clock Out  ]        ← two buttons
  //  paused:  [ Resume  ]  [  Clock Out  ]        ← two buttons
  //
  // Reset button is never needed in stopwatch — fully collapse it from layout.
  if (resetBtn) {
    resetBtn.hidden = true;
    resetBtn.classList.remove('btn--invisible');
  }

  if (status === 'idle') {
    // ── Idle: only Clock In, no stop/finish button at all ──
    if (startBtn) {
      startBtn.hidden = false;
      startBtn.className = 'btn btn--primary btn--timer-pill';
      startBtn.setAttribute('data-sw-action', 'clock-in');
      startBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
          <path d="M4.4 2.8L11.2 7L4.4 11.2V2.8Z" fill="currentColor"/>
        </svg>
        Clock In
      `;
    }
    // Force-hide stop button and strip any stale classes from countdown mode
    if (stopBtn) {
      stopBtn.hidden = true;
      stopBtn.className = 'btn btn--timer-finish';
      stopBtn.removeAttribute('data-sw-action');
    }

  } else if (status === 'running') {
    // ── Running: Pause + Clock Out ──
    if (startBtn) {
      startBtn.hidden = false;
      startBtn.className = 'btn btn--primary btn--timer-pill';
      startBtn.setAttribute('data-sw-action', 'pause');
      startBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="3" y="2" width="3" height="10" fill="currentColor"/>
          <rect x="8" y="2" width="3" height="10" fill="currentColor"/>
        </svg>
        Pause
      `;
    }
    if (stopBtn) {
      stopBtn.hidden = false;
      stopBtn.className = 'btn btn--danger';
      stopBtn.setAttribute('aria-label', 'Clock Out');
      stopBtn.setAttribute('title', 'Clock out and record session');
      stopBtn.setAttribute('data-sw-action', 'clock-out');
      stopBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.6" fill="currentColor"/>
        </svg>
        Clock Out
      `;
    }

  } else if (status === 'paused') {
    // ── Paused: Resume + Clock Out ──
    if (startBtn) {
      startBtn.hidden = false;
      startBtn.className = 'btn btn--primary btn--timer-pill';
      startBtn.setAttribute('data-sw-action', 'resume');
      startBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
          <path d="M4.4 2.8L11.2 7L4.4 11.2V2.8Z" fill="currentColor"/>
        </svg>
        Resume
      `;
    }
    if (stopBtn) {
      stopBtn.hidden = false;
      stopBtn.className = 'btn btn--danger';
      stopBtn.setAttribute('aria-label', 'Clock Out');
      stopBtn.setAttribute('title', 'Clock out and record session');
      stopBtn.setAttribute('data-sw-action', 'clock-out');
      stopBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="1.6" fill="currentColor"/>
        </svg>
        Clock Out
      `;
    }
  }
}

// ---------------------------------------------------------------------------
// COUNTDOWN TIMER RENDERER
// ---------------------------------------------------------------------------

function _renderCountdownMode(state) {
  const timeEl         = document.getElementById('timer-display');
  const labelEl        = document.getElementById('timer-session-label');
  const progressCircle = document.querySelector('.timer-ring__progress');
  const startBtn       = document.getElementById('timerStart');
  const resetBtn       = document.getElementById('timerReset');
  const stopBtn        = document.getElementById('timerStop');
  const modeLabelEl    = document.getElementById('timer-mode-label');
  const modePill       = document.getElementById('timer-mode-pill');
  const metaRow        = document.getElementById('timer-meta');
  const swMetaRow      = document.getElementById('stopwatch-meta');
  const elapsedVal     = document.getElementById('timer-elapsed');
  const pctVal         = document.getElementById('timer-pct');
  const finishVal      = document.getElementById('timer-finish');


  if (modePill) modePill.classList.remove('is-running');

  if (timeEl) timeEl.textContent = formatRemaining(state.remainingMs);

  if (labelEl) {
    labelEl.textContent = state.status === 'idle'
      ? 'Ready'
      : state.status === 'paused' ? 'Paused' : 'Studying';
  }

  if (modeLabelEl) modeLabelEl.textContent = 'Timer';

  if (progressCircle) {
    const totalMs = state.focusMinutes * 60 * 1000;
    const pct     = totalMs > 0 ? state.remainingMs / totalMs : 1;
    progressCircle.style.strokeDashoffset = 616 * (1 - Math.max(0, Math.min(1, pct)));
  }

  // Countdown meta row
  if (state.status !== 'idle') {
    metaRow?.removeAttribute('hidden');
    const totalMs       = state.focusMinutes * 60 * 1000;
    const elapsedMs     = Math.max(0, totalMs - state.remainingMs);
    const completionPct = totalMs > 0 ? Math.min(100, Math.round((elapsedMs / totalMs) * 100)) : 0;
    if (elapsedVal) elapsedVal.textContent = formatRemaining(elapsedMs);
    if (pctVal)     pctVal.textContent     = `${completionPct}%`;
    if (finishVal) {
      const refTime = state.endTime || (Date.now() + state.remainingMs);
      finishVal.textContent = new Date(refTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  } else {
    metaRow?.setAttribute('hidden', 'true');
  }

  swMetaRow?.setAttribute('hidden', 'true');

  // Show/restore all countdown buttons — remove invisible class to reveal reset
  if (resetBtn) {
    resetBtn.hidden = false;
    resetBtn.classList.remove('btn--invisible');
  }
  if (stopBtn) {
    stopBtn.hidden = false;
    stopBtn.className = 'btn btn--ghost-icon';
    stopBtn.setAttribute('aria-label', 'Stop');
    stopBtn.setAttribute('title', 'Stop session');
    stopBtn.removeAttribute('data-sw-action');
    stopBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
        <rect x="3" y="3" width="8" height="8" rx="1.6" fill="currentColor"/>
      </svg>
    `;
  }

  // Start/Pause button label
  if (startBtn) {
    startBtn.removeAttribute('data-sw-action');
    if (state.status === 'running') {
      startBtn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <rect x="3" y="2" width="3" height="10" fill="currentColor"/>
          <rect x="8" y="2" width="3" height="10" fill="currentColor"/>
        </svg>
        Pause
      `;
    } else {
      const label = state.status === 'paused' ? 'Resume' : 'Start';
      startBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 14 14" fill="none">
          <path d="M4.4 2.8L11.2 7L4.4 11.2V2.8Z" fill="currentColor"/>
        </svg>
        ${label}
      `;
    }
  }

  syncPresetChips(state);
}

// ---------------------------------------------------------------------------
// PRESET CHIPS
// ---------------------------------------------------------------------------

function syncPresetChips(state) {
  const chips       = document.querySelectorAll('.timer-card__presets .chip');
  const customChip  = document.getElementById('chip-custom');
  const customPanel = document.getElementById('custom-duration-panel');
  let matchFound    = false;

  chips.forEach((chip) => {
    if (chip === customChip) return;
    const chipMinutes = parseInt(chip.dataset.minutes, 10);
    const isActive    = chipMinutes === state.focusMinutes;
    chip.classList.toggle('chip--active', isActive);
    if (isActive) matchFound = true;
  });

  const isCustomPanelOpen = customPanel && !customPanel.hasAttribute('hidden');
  if (customChip) {
    customChip.classList.toggle('chip--active', !matchFound || isCustomPanelOpen);
  }
}

// ---------------------------------------------------------------------------
// MODE SWITCH
// ---------------------------------------------------------------------------

function bindModeSwitch() {
  document.querySelectorAll('.mode-switch__btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode; // 'countdown' | 'stopwatch'
      await chrome.runtime.sendMessage({ type: 'SET_TIMER_MODE', mode });
      // Refresh today's total immediately when switching to stopwatch
      if (mode === 'stopwatch') await refreshStopwatchTotal();
      syncTimerDisplay();
    });
  });
}

// ---------------------------------------------------------------------------
// TIMER CONTROLS — mode-aware
// ---------------------------------------------------------------------------

function bindTimerControls() {
  const startBtn = document.getElementById('timerStart');
  const resetBtn = document.getElementById('timerReset');
  const stopBtn  = document.getElementById('timerStop');

  // ── Primary / Start button ──────────────────────────────────────────────
  startBtn?.addEventListener('click', async () => {
    const swAction = startBtn.getAttribute('data-sw-action');

    if (swAction) {
      // Stopwatch mode actions
      if (swAction === 'clock-in') {
        await chrome.runtime.sendMessage({ type: 'CLOCK_IN' });
      } else if (swAction === 'pause') {
        await chrome.runtime.sendMessage({ type: 'STOPWATCH_PAUSE' });
      } else if (swAction === 'resume') {
        await chrome.runtime.sendMessage({ type: 'STOPWATCH_RESUME' });
      }
    } else {
      // Countdown timer mode
      const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (state.status === 'running') {
        await chrome.runtime.sendMessage({ type: 'TIMER_PAUSE' });
      } else {
        await chrome.runtime.sendMessage({ type: 'TIMER_START' });
      }
    }

    syncTimerDisplay();
  });

  // ── Reset button (countdown mode only) ─────────────────────────────────
  resetBtn?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'TIMER_STOP' });
    syncTimerDisplay();
  });

  // ── Stop / Clock-Out button ─────────────────────────────────────────────
  stopBtn?.addEventListener('click', async () => {
    const swAction = stopBtn.getAttribute('data-sw-action');

    if (swAction === 'clock-out') {
      await chrome.runtime.sendMessage({ type: 'CLOCK_OUT' });
      await refreshStopwatchTotal();
    } else {
      // Countdown: plain stop (alarm records the session when complete)
      await chrome.runtime.sendMessage({ type: 'TIMER_STOP' });
    }

    syncTimerDisplay();
  });
}

// ---------------------------------------------------------------------------
// PRESET CONTROLS
// ---------------------------------------------------------------------------

function bindPresetControls() {
  const chips       = document.querySelectorAll('.timer-card__presets .chip');
  const customPanel = document.getElementById('custom-duration-panel');
  const customChip  = document.getElementById('chip-custom');

  chips.forEach((chip) => {
    chip.addEventListener('click', async () => {
      if (chip === customChip) {
        if (customPanel) {
          const isHidden = customPanel.hasAttribute('hidden');
          isHidden ? customPanel.removeAttribute('hidden') : customPanel.setAttribute('hidden', 'true');
          const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
          syncPresetChips(state);
        }
        return;
      }

      customPanel?.setAttribute('hidden', 'true');
      chips.forEach((c) => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');

      const minutes = parseInt(chip.dataset.minutes, 10);
      if (minutes > 0) {
        await chrome.runtime.sendMessage({
          type: 'SET_CUSTOM_DURATIONS',
          focusMinutes: minutes,
          breakMinutes: 5,
        });
        await chrome.runtime.sendMessage({ type: 'TIMER_STOP' });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// CUSTOM DURATION INPUT
// ---------------------------------------------------------------------------

function bindCustomDurationInput() {
  const hoursInput   = document.getElementById('input-hours');
  const minutesInput = document.getElementById('input-minutes');
  const startBtn     = document.getElementById('btn-custom-start');
  const hintEl       = document.getElementById('custom-duration-hint');
  const customPanel  = document.getElementById('custom-duration-panel');

  const updateHint = () => {
    if (!hintEl || !hoursInput || !minutesInput) return;
    const hrs   = parseInt(hoursInput.value  || 0, 10);
    const mins  = parseInt(minutesInput.value || 0, 10);
    const total = (hrs * 60) + mins;
    hintEl.textContent = total > 0
      ? `Session: ${hrs > 0 ? `${hrs}h ` : ''}${mins}m (${total} min total)`
      : 'Please enter a duration greater than 0.';
  };

  [hoursInput, minutesInput].forEach((inp) => {
    inp?.addEventListener('input',  updateHint);
    inp?.addEventListener('change', updateHint);
  });

  startBtn?.addEventListener('click', async () => {
    if (!hoursInput || !minutesInput) return;
    const hrs   = Math.max(0, parseInt(hoursInput.value  || 0, 10));
    const mins  = Math.max(0, Math.min(59, parseInt(minutesInput.value || 0, 10)));
    const total = (hrs * 60) + mins;

    if (total <= 0) {
      if (hintEl) hintEl.textContent = 'Please enter a duration greater than 0.';
      return;
    }

    await chrome.runtime.sendMessage({ type: 'SET_CUSTOM_DURATIONS', focusMinutes: total, breakMinutes: 5 });
    await chrome.runtime.sendMessage({ type: 'TIMER_STOP' });
    await chrome.runtime.sendMessage({ type: 'TIMER_START', minutes: total });
    customPanel?.setAttribute('hidden', 'true');
    syncTimerDisplay();
  });

  updateHint();
}

// ---------------------------------------------------------------------------
// STOPWATCH TOTAL
// ---------------------------------------------------------------------------

/**
 * Reads today's completed study time from reportService and updates the stopwatch meta row.
 * ONLY counts completed sessions — active/in-progress sessions are excluded.
 */
async function refreshStopwatchTotal() {
  const report  = await generateDailyReport();
  const totalEl = document.getElementById('stopwatch-today-total');
  if (totalEl) totalEl.textContent = formatStudyTime(report.totalStudyTimeMinutes);
}

// ---------------------------------------------------------------------------
// TASKS PAGE
// ---------------------------------------------------------------------------

/** ID of the task currently loaded into the input for editing, or null. */
let _editingTaskId = null;

function bindTasksPage() {
  const input  = document.getElementById('task-input');
  const addBtn = document.getElementById('task-add-btn');

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddOrUpdateTask();
    if (e.key === 'Escape') _cancelEdit();
  });
  addBtn?.addEventListener('click', handleAddOrUpdateTask);

  // Click outside the compose bar cancels editing
  document.addEventListener('click', (e) => {
    if (!_editingTaskId) return;
    const compose = document.querySelector('.task-compose');
    if (compose && !compose.contains(e.target)) {
      _cancelEdit();
    }
  });
}

function _cancelEdit() {
  if (!_editingTaskId) return;
  _editingTaskId = null;
  const input  = document.getElementById('task-input');
  const addBtn = document.getElementById('task-add-btn');
  if (input) { input.value = ''; input.placeholder = 'Add a new task...'; }
  if (addBtn) {
    addBtn.textContent = 'Add';
    addBtn.className = 'btn btn--primary btn--sm';
  }
  // Remove any editing highlight
  document.querySelectorAll('.task-row--editing').forEach((el) => el.classList.remove('task-row--editing'));
}

async function handleAddOrUpdateTask() {
  const input = document.getElementById('task-input');
  const title = input?.value.trim();
  if (!title) return;

  if (_editingTaskId) {
    // UPDATE existing task
    await chrome.runtime.sendMessage({ type: 'TASK_UPDATE', id: _editingTaskId, updates: { title } });
    _cancelEdit();
  } else {
    // ADD new task
    await chrome.runtime.sendMessage({ type: 'TASK_ADD', task: { title } });
    if (input) input.value = '';
    input?.focus();
  }
  renderTaskList();
}

/** @deprecated kept for backward compat if called elsewhere */
async function handleAddTask() {
  return handleAddOrUpdateTask();
}

/** Returns midnight (start of day) timestamp for a given ms timestamp */
function _startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

async function renderTaskList() {
  const todayListEl    = document.getElementById('tasks-today');
  const overdueListEl  = document.getElementById('tasks-overdue');
  const completedListEl = document.getElementById('tasks-completed');
  const todayCountEl   = document.getElementById('today-count');
  const overdueCountEl = document.getElementById('overdue-count');
  const completedCountEl = document.getElementById('completed-count');
  const sectionToday    = document.getElementById('section-today');
  const sectionOverdue  = document.getElementById('section-overdue');
  const sectionCompleted = document.getElementById('section-completed');
  if (!todayListEl || !completedListEl) return;

  const allTasks   = await getTasks();
  const todayStart = _startOfDay(Date.now());

  // TODAY: created today, not yet completed
  const todayTasks = allTasks.filter(
    (t) => !t.completed && _startOfDay(t.createdAt) === todayStart
  );

  // PENDING / OVERDUE: created before today, not yet completed
  const overdueTasks = allTasks.filter(
    (t) => !t.completed && _startOfDay(t.createdAt) < todayStart
  );

  // COMPLETED: finished today only (older ones disappear automatically)
  const completedToday = allTasks.filter(
    (t) => t.completed && t.completedAt && _startOfDay(t.completedAt) === todayStart
  );

  // Update count badges
  if (todayCountEl)     todayCountEl.textContent     = todayTasks.length > 0 ? todayTasks.length : '';
  if (overdueCountEl)   overdueCountEl.textContent   = overdueTasks.length > 0 ? overdueTasks.length : '';
  if (completedCountEl) completedCountEl.textContent = completedToday.length > 0 ? completedToday.length : '';

  // Always reset lists before appending
  todayListEl.innerHTML = '';
  if (overdueListEl) overdueListEl.innerHTML = '';
  completedListEl.innerHTML = '';

  // Render TODAY list
  todayTasks.forEach((t) => todayListEl.appendChild(buildTaskRow(t, false)));

  // Render OVERDUE list (show section only when there are overdue tasks)
  if (sectionOverdue) {
    sectionOverdue.hidden = overdueTasks.length === 0;
  }
  if (overdueListEl && overdueTasks.length > 0) {
    overdueTasks.forEach((t) => overdueListEl.appendChild(buildTaskRow(t, true)));
  }

  // Render COMPLETED list (show section only when completed today)
  if (sectionCompleted) {
    sectionCompleted.hidden = completedToday.length === 0;
  }
  if (completedToday.length > 0) {
    completedToday.forEach((t) => completedListEl.appendChild(buildTaskRow(t, false)));
  }
}

function buildTaskRow(task, isOverdue = false) {
  const li = document.createElement('li');
  li.className = `task-row${task.completed ? ' task-row--done' : ''}${isOverdue ? ' task-row--overdue' : ''}`;
  li.dataset.id = task.id;

  const checkbox = document.createElement('span');
  checkbox.className = `task-row__checkbox${task.completed ? ' task-row__checkbox--checked' : ''}`;
  checkbox.setAttribute('role', 'checkbox');
  checkbox.setAttribute('aria-checked', task.completed ? 'true' : 'false');
  checkbox.setAttribute('tabindex', '0');

  if (task.completed) {
    checkbox.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
        <path d="M2 5.5L4.4 7.9L9 2.5" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `;
  }

  const toggleComplete = async () => {
    if (task.completed) {
      // Uncompleting: reset createdAt to today so the task re-appears in TODAY section
      await chrome.runtime.sendMessage({
        type: 'TASK_UPDATE',
        id: task.id,
        updates: { completed: false, completedAt: null, createdAt: Date.now() },
      });
    } else {
      // Completing normally
      await chrome.runtime.sendMessage({ type: 'TASK_COMPLETE', id: task.id, completed: true });
    }
    await renderTaskList();
  };
  checkbox.addEventListener('click',   (e) => { e.stopPropagation(); toggleComplete(); });
  checkbox.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleComplete(); } });

  const body = document.createElement('div');
  body.className = 'task-row__body';

  const title = document.createElement('span');
  title.className = 'task-row__title';
  title.textContent = task.title;
  body.appendChild(title);

  // Click on task title loads it into the input for editing (incomplete tasks only)
  if (!task.completed) {
    body.style.cursor = 'pointer';
    body.addEventListener('click', (e) => {
      e.stopPropagation();
      const input  = document.getElementById('task-input');
      const addBtn = document.getElementById('task-add-btn');
      document.querySelectorAll('.task-row--editing').forEach((el) => el.classList.remove('task-row--editing'));
      _editingTaskId = task.id;
      if (input) { input.value = task.title; input.placeholder = 'Edit task...'; input.focus(); input.select(); }
      if (addBtn) { addBtn.textContent = 'Update'; addBtn.className = 'btn btn--update btn--sm'; }
      li.classList.add('task-row--editing');
    });
  }

  // Delete button — works for ALL tasks including completed
  const delBtn = document.createElement('button');
  delBtn.className = `task-row__delete${task.completed ? ' task-row__delete--visible' : ''}`;
  delBtn.setAttribute('aria-label', 'Delete task');
  delBtn.setAttribute('type', 'button');
  delBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 3.5L11 10.5M11 3.5L3 10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
  `;
  // Use mousedown instead of click so it fires before any blur/focus events
  delBtn.addEventListener('mousedown', (e) => {
    e.preventDefault();  // prevent focus change
    e.stopPropagation();
  });
  delBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (_editingTaskId === task.id) _cancelEdit();
    li.style.opacity = '0';
    li.style.transition = 'opacity 0.18s ease';
    await chrome.runtime.sendMessage({ type: 'TASK_DELETE', id: task.id });
    await renderTaskList();
  });

  li.appendChild(checkbox);
  li.appendChild(body);
  li.appendChild(delBtn);

  return li;
}

// ---------------------------------------------------------------------------
// REPORTS PAGE
// ---------------------------------------------------------------------------

function bindReportsPage() {
  document.querySelectorAll('.period-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentReportPeriod = btn.dataset.period;
      document.querySelectorAll('.period-tab').forEach((b) => b.classList.remove('period-tab--active'));
      btn.classList.add('period-tab--active');
      loadReportsData();
    });
  });
}

async function loadReportsData() {
  const labelEl = document.getElementById('reports-period-label');
  let report;

  if (currentReportPeriod === 'daily') {
    report = await generateDailyReport();
    if (labelEl) labelEl.textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  } else if (currentReportPeriod === 'weekly') {
    report = await generateWeeklyReport();
    if (labelEl) labelEl.textContent = report.periodLabel || '';
  } else if (currentReportPeriod === 'monthly') {
    report = await generateMonthlyReport();
    if (labelEl) labelEl.textContent = report.periodLabel || '';
  }

  renderStatCards(report);
  await renderStreak();
  await renderBarChart(currentReportPeriod);
}

function renderStatCards(report) {
  const studyTime  = document.getElementById('stat-study-time');
  const sessions   = document.getElementById('stat-sessions');
  const tasks      = document.getElementById('stat-tasks');
  const avgSession = document.getElementById('stat-avg-session');

  if (studyTime)  studyTime.textContent  = formatStudyTime(report.totalStudyTimeMinutes);
  if (sessions)   sessions.textContent   = report.pomodoroCount;
  if (tasks)      tasks.textContent      = report.completedTasksCount;
  if (avgSession) avgSession.textContent = report.averageSessionMinutes > 0
    ? formatStudyTime(report.averageSessionMinutes)
    : '—';
}

async function renderStreak() {
  const streakEl = document.getElementById('stat-streak');
  if (!streakEl) return;
  const streak = await getStreak();
  streakEl.textContent = streak > 0 ? `${streak} day${streak !== 1 ? 's' : ''}` : '—';
}

async function renderBarChart(period) {
  const chartBars  = document.getElementById('reports-chart-bars');
  const chartLabel = document.getElementById('chart-period-label');
  if (!chartBars) return;

  const data = await getChartData(period);
  const maxMinutes = Math.max(...data, 1);

  let labels;
  if (period === 'monthly') {
    labels = data.map((_, i) => `W${i + 1}`);
    if (chartLabel) chartLabel.textContent = 'Last 7 Weeks';
  } else if (period === 'weekly') {
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    labels = DAY_LABELS;
    if (chartLabel) chartLabel.textContent = 'This Week';
  } else {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }
    labels = days;
    if (chartLabel) chartLabel.textContent = 'Last 7 Days';
  }

  let todayIdx = -1;
  if (period === 'daily') {
    todayIdx = 6;
  } else if (period === 'weekly') {
    const d = new Date().getDay(); // 0=Sun
    todayIdx = d === 0 ? 6 : d - 1;
  }

  chartBars.innerHTML = '';
  data.forEach((minutes, index) => {
    const pct  = Math.max(Math.round((minutes / maxMinutes) * 100), 2);
    const hrs  = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const tip  = minutes > 0 ? (hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`) : 'No study';

    const span = document.createElement('span');
    span.style.setProperty('--h', `${pct}%`);
    if (index === todayIdx) span.classList.add('bar-chart__bars--today');

    const bar = document.createElement('i');
    bar.setAttribute('title', `${labels[index]}: ${tip}`);

    const lbl = document.createElement('label');
    lbl.textContent = labels[index];

    span.appendChild(bar);
    span.appendChild(lbl);
    chartBars.appendChild(span);
  });
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function formatStudyTime(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins  = minutes % 60;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m`;
  return `${mins}m`;
}
