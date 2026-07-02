/**
 * dashboard.js
 *
 * Entry point for the full-page Timify dashboard.
 * Handles section navigation, stats rendering, and service delegation.
 * No feature logic implemented yet — stubs only.
 */

import { getReportSummary } from '../services/reportService.js';
import { getTasks } from '../services/taskService.js';

/** @type {string} */
let activeSection = 'overview';

/**
 * Initializes the dashboard on DOM ready.
 * @returns {Promise<void>}
 */
async function initDashboard() {
  bindNavigation();
  await renderOverview();
  await renderTaskList();
}

/**
 * Binds navigation tab click handlers.
 * @returns {void}
 */
function bindNavigation() {
  const navItems = document.querySelectorAll('.dashboard__nav-item');

  navItems.forEach((item) => {
    item.addEventListener('click', () => {
      const section = item.getAttribute('data-section');
      if (section) {
        switchSection(section);
      }
    });
  });
}

/**
 * Switches the visible dashboard section.
 * @param {string} sectionId - Section identifier
 * @returns {void}
 */
function switchSection(sectionId) {
  activeSection = sectionId;

  document.querySelectorAll('.dashboard__nav-item').forEach((item) => {
    item.classList.toggle(
      'dashboard__nav-item--active',
      item.getAttribute('data-section') === sectionId
    );
  });

  document.querySelectorAll('.dashboard__section').forEach((section) => {
    section.classList.add('hidden');
  });

  document.getElementById(`section-${sectionId}`)?.classList.remove('hidden');
}

/**
 * Renders the overview stats section.
 * @returns {Promise<void>}
 */
async function renderOverview() {
  const summary = await getReportSummary();

  const focusEl = document.getElementById('stat-focus-minutes');
  const sessionsEl = document.getElementById('stat-sessions');
  const tasksEl = document.getElementById('stat-tasks');

  if (focusEl) focusEl.textContent = String(summary.totalFocusMinutes);
  if (sessionsEl) sessionsEl.textContent = String(summary.sessionsCompleted);
  if (tasksEl) tasksEl.textContent = String(summary.tasksCompleted);
}

/**
 * Renders the task list in the tasks section.
 * @returns {Promise<void>}
 */
async function renderTaskList() {
  const listEl = document.getElementById('dashboard-task-list');
  if (!listEl) return;

  const tasks = await getTasks();

  if (tasks.length === 0) {
    listEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = tasks
    .map((task) => `<li>${task.title}</li>`)
    .join('');
}

document.addEventListener('DOMContentLoaded', () => {
  initDashboard().catch((error) => {
    console.error('[Timify] Dashboard init error:', error);
  });
});

// Exported for future section-specific renderers
void activeSection;
