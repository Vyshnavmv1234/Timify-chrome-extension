/**
 * dashboard.js
 *
 * Three-page SPA for Timify: Study Timer, Tasks, Reports.
 * Holds zero business logic; delegates entirely to the service layer.
 */

import { getTimerState, formatRemaining } from '../services/timerService.js';
import { getTasks } from '../services/taskService.js';
import {
  generateDailyReport,
  generateWeeklyReport,
  generateMonthlyReport,
  getStreak,
  getChartData,
} from '../services/reportService.js';

// --- Module-level state ---
let timerTickInterval = null;
let currentPage = 'timer';
let currentReportPeriod = 'daily';

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initDashboard().catch((err) => {
    console.error('[Timify] Dashboard init error:', err);
  });
});

async function initDashboard() {
  updateTopbarDate();
  bindNavigation();
  bindModeSwitch();
  bindTimerControls();
  bindPresetControls();
  bindCustomDurationInput();
  bindTasksPage();
  bindReportsPage();
  startTimerSync();
  showPage('timer');

  // Keep UI in sync with background events
  chrome.runtime.onMessage.addListener((message) => {
    const syncTypes = ['TIMER_STATE_CHANGED', 'TIMER_FINISHED', 'TASK_UPDATE', 'DATA_RESET'];
    if (!syncTypes.includes(message?.type)) return;

    syncTimerDisplay();

    // Refresh stopwatch today-total whenever a session ends
    if (message?.type === 'TIMER_FINISHED') {
      refreshStopwatchTotal();
    }

    if (currentPage === 'tasks') renderTaskList();
    if (currentPage === 'reports') loadReportsData();
  });
}

// ============================================================
// NAVIGATION & PAGE SWITCHING
// ============================================================

const PAGE_TITLES = {
  timer:   'Study Timer',
  tasks:   'Tasks',
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

  // Update nav active state
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('nav-item--active', btn.dataset.nav === name);
  });

  // Switch page visibility
  document.querySelectorAll('.page').forEach((el) => {
    el.classList.add('page--hidden');
  });
  const target = document.getElementById(`page-${name}`);
  if (target) target.classList.remove('page--hidden');

  // Update topbar title
  const titleEl = document.getElementById('topbar-title');
  if (titleEl) titleEl.textContent = PAGE_TITLES[name] || name;

  // Load page data on switch
  if (name === 'tasks')   renderTaskList();
  if (name === 'reports') loadReportsData();
}

function updateTopbarDate() {
  const el = document.getElementById('topbar-date');
  if (!el) return;
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  el.textContent = new Date().toLocaleDateString('en-US', opts);
}

// ============================================================
// STUDY TIMER PAGE
// ============================================================

function startTimerSync() {
  if (timerTickInterval) clearInterval(timerTickInterval);
  syncTimerDisplay();
  timerTickInterval = setInterval(syncTimerDisplay, 1000);
}

/**
 * Master display sync — called every second and on every background message.
 * Routes to countdown-specific or stopwatch-specific rendering based on timerMode.
 */
async function syncTimerDisplay() {
  const state = await getTimerState();
  const isStopwatch = state.timerMode === 'stopwatch';

  // ── Mode switch button highlight ──
  document.getElementById('mode-btn-timer')?.classList.toggle('mode-switch__btn--active', !isStopwatch);
  document.getElementById('mode-btn-stopwatch')?.classList.toggle('mode-switch__btn--active', isStopwatch);

  // ── Preset / divider visibility (Timer mode only) ──
  const presetsSection  = document.getElementById('timer-presets-section');
  const timerDivider    = document.getElementById('timer-divider');
  const customPanel     = document.getElementById('custom-duration-panel');
  if (presetsSection) presetsSection.hidden = isStopwatch;
  if (timerDivider)   timerDivider.hidden   = isStopwatch;
  if (isStopwatch && customPanel) customPanel.setAttribute('hidden', 'true');

  // ── Shared elements ──
  const timeEl         = document.getElementById('timer-display');
  const labelEl        = document.getElementById('timer-session-label');
  const progressCircle = document.querySelector('.timer-ring__progress');
  const startBtn       = document.getElementById('timerStart');
  const modeLabelEl    = document.getElementById('timer-mode-label');
  const modePill       = document.getElementById('timer-mode-pill');

  // ── Countdown meta row ──
  const metaRow  = document.getElementById('timer-meta');
  const elapsedVal = document.getElementById('timer-elapsed');
  const pctVal     = document.getElementById('timer-pct');
  const finishVal  = document.getElementById('timer-finish');

  // ── Stopwatch meta row ──
  const swMetaRow = document.getElementById('stopwatch-meta');

  // ─────────────────────────────────────────────────────────
  // STOPWATCH MODE
  // ─────────────────────────────────────────────────────────
  if (isStopwatch) {
    // In stopwatch mode, remainingMs is actually elapsed time (see timerService)
    const elapsedMs = state.remainingMs || 0;

    if (timeEl)  timeEl.textContent = formatRemaining(elapsedMs);
    if (labelEl) labelEl.textContent = state.status === 'running'
      ? 'Tracking session…'
      : state.status === 'paused' ? 'Paused' : 'Stopwatch';

    if (modeLabelEl) modeLabelEl.textContent = state.status === 'running' ? 'Recording' : 'Stopwatch';
    if (modePill) modePill.classList.toggle('is-running', state.status === 'running');

    // Ring: spin forward as elapsed grows (cap at 1h for visual reference)
    if (progressCircle) {
      const refMs = 60 * 60 * 1000; // 1-hour reference circle
      const pct   = Math.min(elapsedMs / refMs, 1);
      progressCircle.style.strokeDashoffset = 616 * (1 - pct);
    }

    // Hide countdown meta, show stopwatch meta
    metaRow?.setAttribute('hidden', 'true');
    swMetaRow?.removeAttribute('hidden');

  // ─────────────────────────────────────────────────────────
  // COUNTDOWN (TIMER) MODE
  // ─────────────────────────────────────────────────────────
  } else {
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

    // Countdown meta row: show when active
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

    // Hide stopwatch meta
    swMetaRow?.setAttribute('hidden', 'true');

    syncPresetChips(state);
  }

  // ── Start/Pause button label (shared) ──
  if (startBtn) {
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
}

/**
 * Highlights the chip whose data-minutes matches the current focusMinutes.
 * Falls back to highlighting Custom when no chip matches.
 */
function syncPresetChips(state) {
  const chips      = document.querySelectorAll('.timer-card__presets .chip');
  const customChip = document.getElementById('chip-custom');
  const customPanel = document.getElementById('custom-duration-panel');
  let matchFound   = false;

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

/** Segmented control — switches between Timer (countdown) and Stopwatch modes. */
function bindModeSwitch() {
  document.querySelectorAll('.mode-switch__btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mode = btn.dataset.mode; // 'countdown' | 'stopwatch'
      await chrome.runtime.sendMessage({ type: 'SET_TIMER_MODE', mode });
      // Load today's total immediately when switching to stopwatch
      if (mode === 'stopwatch') await refreshStopwatchTotal();
      syncTimerDisplay();
    });
  });
}

/**
 * Reads today's study time from reportService and updates the stopwatch meta row.
 * Called: on switch to stopwatch, on TIMER_FINISHED, after STOPWATCH_STOP.
 */
async function refreshStopwatchTotal() {
  const report  = await generateDailyReport();
  const totalEl = document.getElementById('stopwatch-today-total');
  if (totalEl) totalEl.textContent = formatStudyTime(report.totalStudyTimeMinutes);
}

function bindTimerControls() {
  const startBtn = document.getElementById('timerStart');
  const resetBtn = document.getElementById('timerReset');
  const stopBtn  = document.getElementById('timerStop');

  startBtn?.addEventListener('click', async () => {
    const state = await getTimerState();
    if (state.status === 'running') {
      await chrome.runtime.sendMessage({ type: 'TIMER_PAUSE' });
    } else {
      await chrome.runtime.sendMessage({ type: 'TIMER_START' });
    }
  });

  resetBtn?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'TIMER_STOP' });
  });

  // Stop behaves differently per mode:
  // • Countdown → plain TIMER_STOP (no recording; alarm handles that)
  // • Stopwatch → STOPWATCH_STOP (records session then stops)
  stopBtn?.addEventListener('click', async () => {
    const state = await getTimerState();
    if (state.timerMode === 'stopwatch') {
      await chrome.runtime.sendMessage({ type: 'STOPWATCH_STOP' });
      await refreshStopwatchTotal();
    } else {
      await chrome.runtime.sendMessage({ type: 'TIMER_STOP' });
    }
  });
}

function bindPresetControls() {
  const chips      = document.querySelectorAll('.timer-card__presets .chip');
  const customPanel = document.getElementById('custom-duration-panel');
  const customChip  = document.getElementById('chip-custom');

  chips.forEach((chip) => {
    chip.addEventListener('click', async () => {
      // Custom chip toggles the custom panel
      if (chip === customChip) {
        if (customPanel) {
          const isHidden = customPanel.hasAttribute('hidden');
          isHidden ? customPanel.removeAttribute('hidden') : customPanel.setAttribute('hidden', 'true');
          syncPresetChips(await getTimerState());
        }
        return;
      }

      customPanel?.setAttribute('hidden', 'true');
      chips.forEach((c) => c.classList.remove('chip--active'));
      chip.classList.add('chip--active');

      // Read duration from data-minutes attribute
      const minutes = parseInt(chip.dataset.minutes, 10);
      if (minutes > 0) {
        await chrome.runtime.sendMessage({
          type: 'SET_CUSTOM_DURATIONS',
          focusMinutes: minutes,
          breakMinutes: 5,
        });
        // Stop any running timer so the display resets to the new duration
        await chrome.runtime.sendMessage({ type: 'TIMER_STOP' });
      }
    });
  });
}

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

// ============================================================
// TASKS PAGE
// ============================================================

function bindTasksPage() {
  const input  = document.getElementById('task-input');
  const addBtn = document.getElementById('task-add-btn');

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddTask();
  });

  addBtn?.addEventListener('click', handleAddTask);
}

async function handleAddTask() {
  const input = document.getElementById('task-input');
  const title = input?.value.trim();
  if (!title) return;

  await chrome.runtime.sendMessage({
    type: 'TASK_ADD',
    task: { title },
  });

  input.value = '';
  input.focus();
  renderTaskList();
}

async function renderTaskList() {
  const activeListEl   = document.getElementById('tasks-active');
  const completedListEl= document.getElementById('tasks-completed');
  const activeEmptyEl  = document.getElementById('active-empty');
  const activeCountEl  = document.getElementById('active-count');
  const completedCountEl = document.getElementById('completed-count');
  const sectionCompleted = document.getElementById('section-completed');
  if (!activeListEl || !completedListEl) return;

  const allTasks = await getTasks();

  const active    = allTasks.filter((t) => !t.completed);
  const completed = allTasks.filter((t) =>  t.completed);

  // Active count badge
  if (activeCountEl) activeCountEl.textContent = active.length > 0 ? active.length : '';
  // Completed count badge
  if (completedCountEl) completedCountEl.textContent = completed.length > 0 ? completed.length : '';

  // Active section empty state
  if (active.length === 0) {
    activeListEl.innerHTML = '';
    activeEmptyEl?.removeAttribute('hidden');
  } else {
    activeEmptyEl?.setAttribute('hidden', 'true');
    activeListEl.innerHTML = '';
    active.forEach((t) => activeListEl.appendChild(buildTaskRow(t)));
  }

  // Completed section — show only when there are completed tasks
  if (completed.length === 0) {
    if (sectionCompleted) sectionCompleted.hidden = true;
  } else {
    if (sectionCompleted) sectionCompleted.hidden = false;
    completedListEl.innerHTML = '';
    completed.forEach((t) => completedListEl.appendChild(buildTaskRow(t)));
  }
}

function buildTaskRow(task) {
  const li = document.createElement('li');
  li.className = `task-row${task.completed ? ' task-row--done' : ''}`;
  li.dataset.id = task.id;

  // Checkbox
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
    await chrome.runtime.sendMessage({ type: 'TASK_COMPLETE', id: task.id, completed: !task.completed });
    renderTaskList();
  };
  checkbox.addEventListener('click',   (e) => { e.stopPropagation(); toggleComplete(); });
  checkbox.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggleComplete(); } });

  // Body
  const body  = document.createElement('div');
  body.className = 'task-row__body';

  const title = document.createElement('span');
  title.className = 'task-row__title';
  title.textContent = task.title;

  body.appendChild(title);

  // Delete button
  const delBtn = document.createElement('button');
  delBtn.className = 'task-row__delete';
  delBtn.setAttribute('aria-label', 'Delete task');
  delBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M3 3.5L11 10.5M11 3.5L3 10.5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
    </svg>
  `;
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await chrome.runtime.sendMessage({ type: 'TASK_DELETE', id: task.id });
    renderTaskList();
  });

  li.appendChild(checkbox);
  li.appendChild(body);
  li.appendChild(delBtn);

  return li;
}

// ============================================================
// REPORTS PAGE
// ============================================================

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

/**
 * Renders the bar chart for the given period.
 * • daily   → last 7 days (Mon…Sun style)
 * • weekly  → Mon–Sun of this week
 * • monthly → 7 week buckets (W1…W7)
 */
async function renderBarChart(period) {
  const chartBars = document.getElementById('reports-chart-bars');
  const chartLabel = document.getElementById('chart-period-label');
  if (!chartBars) return;

  // getChartData returns minutes per bar
  const data = await getChartData(period);
  const maxMinutes = Math.max(...data, 1);

  // Build bar labels
  let labels;
  if (period === 'monthly') {
    labels = data.map((_, i) => `W${i + 1}`);
    if (chartLabel) chartLabel.textContent = 'Last 7 Weeks';
  } else if (period === 'weekly') {
    const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    labels = DAY_LABELS;
    if (chartLabel) chartLabel.textContent = 'This Week';
  } else {
    // daily: last 7 days
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
    }
    labels = days;
    if (chartLabel) chartLabel.textContent = 'Last 7 Days';
  }

  // Determine today index for highlighting
  let todayIdx = -1;
  if (period === 'daily') {
    todayIdx = 6; // last bar is always today
  } else if (period === 'weekly') {
    const d = new Date().getDay(); // 0=Sun
    todayIdx = d === 0 ? 6 : d - 1; // Mon-indexed
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

// ============================================================
// HELPERS
// ============================================================

function formatStudyTime(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  const hours = Math.floor(minutes / 60);
  const mins  = minutes % 60;
  if (hours > 0) return `${hours}h ${String(mins).padStart(2, '0')}m`;
  return `${mins}m`;
}

function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}
