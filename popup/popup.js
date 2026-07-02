/**
 * popup.js
 *
 * Entry point for the extension toolbar popup.
 * Handles UI initialization, event binding, and service delegation.
 * No feature logic implemented yet — stubs only.
 */

import { EXTENSION_INFO, MESSAGE_TYPES } from '../utils/constants.js';
import { getTimerState, formatRemaining } from '../services/timerService.js';
import { getTasks } from '../services/taskService.js';

/** @type {HTMLElement|null} */
let timerDisplay = null;

/**
 * Initializes the popup UI on DOM ready.
 * @returns {Promise<void>}
 */
async function initPopup() {
  timerDisplay = document.getElementById('timer-display');

  await renderTimerState();
  await renderTasks();
  await loadQuote();

  bindEvents();
}

/**
 * Binds click and interaction handlers to popup elements.
 * @returns {void}
 */
function bindEvents() {
  document.getElementById('btn-start')?.addEventListener('click', handleStart);
  document.getElementById('btn-pause')?.addEventListener('click', handlePause);
  document.getElementById('btn-stop')?.addEventListener('click', handleStop);
  document.getElementById('dashboard-link')?.addEventListener('click', openDashboard);
}

/**
 * Renders the current timer state in the popup.
 * @returns {Promise<void>}
 */
async function renderTimerState() {
  const state = await getTimerState();

  if (timerDisplay) {
    timerDisplay.textContent = formatRemaining(state.remainingMs);
  }
}

/**
 * Renders the task list placeholder.
 * @returns {Promise<void>}
 */
async function renderTasks() {
  const taskList = document.getElementById('task-list');
  if (!taskList) return;

  const tasks = await getTasks();

  if (tasks.length === 0) {
    taskList.innerHTML = '<li class="popup__task-item text-muted">No tasks yet</li>';
    return;
  }

  taskList.innerHTML = tasks
    .map((task) => `<li class="popup__task-item">${task.title}</li>`)
    .join('');
}

/**
 * Loads and displays a random motivational quote.
 * @returns {Promise<void>}
 */
async function loadQuote() {
  const quoteEl = document.getElementById('quote-display');
  if (!quoteEl) return;

  try {
    const url = chrome.runtime.getURL('data/quotes.json');
    const response = await fetch(url);
    const quotes = await response.json();
    const quote = quotes[Math.floor(Math.random() * quotes.length)];
    quoteEl.textContent = `"${quote.text}" — ${quote.author}`;
  } catch {
    quoteEl.textContent = `"Stay focused." — ${EXTENSION_INFO.title}`;
  }
}

/**
 * Opens the full dashboard page in a new tab.
 * @param {Event} event
 * @returns {void}
 */
function openDashboard(event) {
  event.preventDefault();
  const dashboardUrl = chrome.runtime.getURL('pages/dashboard.html');
  chrome.tabs.create({ url: dashboardUrl });
}

/** @returns {Promise<void>} */
async function handleStart() {
  // TODO: Delegate to timerService via background message
  await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.TIMER_START });
  await renderTimerState();
}

/** @returns {Promise<void>} */
async function handlePause() {
  // TODO: Delegate to timerService via background message
  await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.TIMER_PAUSE });
  await renderTimerState();
}

/** @returns {Promise<void>} */
async function handleStop() {
  // TODO: Delegate to timerService via background message
  await chrome.runtime.sendMessage({ type: MESSAGE_TYPES.TIMER_STOP });
  await renderTimerState();
}

document.addEventListener('DOMContentLoaded', () => {
  initPopup().catch((error) => {
    console.error('[Timify] Popup init error:', error);
  });
});
