/**
 * settings.js
 *
 * Controller for the full Settings page (pages/settings.html).
 * Loads all settings from the background service, renders them into the UI,
 * and persists changes immediately on change/blur events.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sends a message to the background service worker.
 * @param {Object} msg
 * @returns {Promise<unknown>}
 */
function sendMsg(msg) {
  return chrome.runtime.sendMessage(msg);
}

/**
 * Shows the "Settings saved" toast briefly.
 */
function showSaveToast() {
  const toast = document.getElementById('save-toast');
  if (!toast) return;
  toast.hidden = false;
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => { toast.hidden = true; }, 2000);
}

/**
 * Persists a partial settings update.
 * @param {Record<string, unknown>} updates
 */
async function saveSettings(updates) {
  try {
    const res = await sendMsg({ type: 'UPDATE_SETTINGS', updates });
    if (res && res.error) {
      throw new Error(res.error);
    }
    showSaveToast();
  } catch (err) {
    alert(err.message || 'Failed to save settings.');
    // Revert UI to match stored settings
    const settings = await sendMsg({ type: 'GET_SETTINGS' });
    populateUI(settings);
  }
}

// ---------------------------------------------------------------------------
// Render chip lists
// ---------------------------------------------------------------------------

/**
 * Renders a chip list for a website list (allowed or blocked).
 * @param {string} containerId - ID of the chip-list element.
 * @param {string[]} sites - List of domain strings.
 * @param {'allowed'|'blocked'} type
 */
function renderChipList(containerId, sites, type) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  sites.forEach((site) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `
      <span class="chip__dot ${type === 'blocked' ? 'chip__dot--blocked' : ''}"></span>
      ${site}
      <button class="chip__remove" aria-label="Remove ${site}" data-site="${site}" data-type="${type}">✕</button>
    `;
    chip.querySelector('.chip__remove').addEventListener('click', () => removeSite(site, type));
    container.appendChild(chip);
  });
}

// ---------------------------------------------------------------------------
// Website management
// ---------------------------------------------------------------------------

/** @type {{ allowedWebsites: string[], blockedWebsites: string[] }} */
let _siteLists = { allowedWebsites: [], blockedWebsites: [] };

/**
 * Adds a domain to the allowed or blocked list.
 * @param {'allowed'|'blocked'} type
 */
async function addSite(type) {
  const inputId = type === 'allowed' ? 'input-add-allowed' : 'input-add-blocked';
  const input = document.getElementById(inputId);
  if (!input) return;

  const raw = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!raw) return;

  const key = type === 'allowed' ? 'allowedWebsites' : 'blockedWebsites';
  if (!_siteLists[key].includes(raw)) {
    _siteLists[key] = [..._siteLists[key], raw];
    await saveSettings({ [key]: _siteLists[key] });
    renderChipList(
      type === 'allowed' ? 'allowed-chip-list' : 'blocked-chip-list',
      _siteLists[key],
      type
    );
  }
  input.value = '';
}

/**
 * Removes a domain from the allowed or blocked list.
 * @param {string} site
 * @param {'allowed'|'blocked'} type
 */
async function removeSite(site, type) {
  const key = type === 'allowed' ? 'allowedWebsites' : 'blockedWebsites';
  _siteLists[key] = _siteLists[key].filter((s) => s !== site);
  await saveSettings({ [key]: _siteLists[key] });
  renderChipList(
    type === 'allowed' ? 'allowed-chip-list' : 'blocked-chip-list',
    _siteLists[key],
    type
  );
}

// ---------------------------------------------------------------------------
// Populate UI from settings
// ---------------------------------------------------------------------------

/**
 * Reads all settings and populates every control.
 * @param {Object} settings
 */
function populateUI(settings) {
  _siteLists.allowedWebsites = settings.allowedWebsites || [];
  _siteLists.blockedWebsites = settings.blockedWebsites || [];

  // General
  _setCheck('toggle-notifications', settings.notificationsEnabled);
  _setCheck('toggle-sound', settings.soundEnabled);
  _setCheck('toggle-dark-mode', settings.darkMode);
  _setVal('input-username', settings.username || '');

  // Focus mode
  _setCheck('toggle-focus-mode', settings.focusModeEnabled);
  _setCheck('toggle-strict-mode', settings.strictMode);

  // Timer
  _setVal('input-focus-minutes', settings.focusMinutes ?? 25);
  _setVal('input-break-minutes', settings.breakMinutes ?? 5);

  // Goals
  _setVal('input-daily-goal', settings.dailyGoalMinutes ?? 480);

  // Motivation
  _setVal('select-motivation-interval', settings.motivationInterval ?? 45);
  _setVal('select-motivation-category', settings.motivationCategory ?? 'all');

  // Websites
  renderChipList('allowed-chip-list', _siteLists.allowedWebsites, 'allowed');
  renderChipList('blocked-chip-list', _siteLists.blockedWebsites, 'blocked');
}

function _setCheck(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = !!value;
}

function _setVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

// ---------------------------------------------------------------------------
// Event bindings
// ---------------------------------------------------------------------------

/**
 * Wires up all settings controls to fire saveSettings on change/blur.
 */
function bindControls() {
  // Toggles
  const toggleMap = {
    'toggle-notifications': 'notificationsEnabled',
    'toggle-sound': 'soundEnabled',
    'toggle-dark-mode': 'darkMode',
    'toggle-focus-mode': 'focusModeEnabled',
    'toggle-strict-mode': 'strictMode',
  };
  Object.entries(toggleMap).forEach(([id, key]) => {
    document.getElementById(id)?.addEventListener('change', (e) => {
      saveSettings({ [key]: e.target.checked });
    });
  });

  // Text / number inputs (save on blur)
  document.getElementById('input-username')?.addEventListener('blur', (e) => {
    saveSettings({ username: e.target.value.trim() || 'Student' });
  });
  document.getElementById('input-focus-minutes')?.addEventListener('blur', (e) => {
    const v = parseInt(e.target.value, 10);
    if (v >= 5 && v <= 180) saveSettings({ focusMinutes: v });
  });
  document.getElementById('input-break-minutes')?.addEventListener('blur', (e) => {
    const v = parseInt(e.target.value, 10);
    if (v >= 1 && v <= 60) saveSettings({ breakMinutes: v });
  });
  document.getElementById('input-daily-goal')?.addEventListener('blur', (e) => {
    const v = parseInt(e.target.value, 10);
    if (v >= 30 && v <= 720) saveSettings({ dailyGoalMinutes: v });
  });

  // Selects
  document.getElementById('select-motivation-interval')?.addEventListener('change', (e) => {
    saveSettings({ motivationInterval: parseInt(e.target.value, 10) });
  });
  document.getElementById('select-motivation-category')?.addEventListener('change', (e) => {
    saveSettings({ motivationCategory: e.target.value });
  });

  // Website lists
  document.getElementById('btn-add-allowed')?.addEventListener('click', () => addSite('allowed'));
  document.getElementById('input-add-allowed')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSite('allowed');
  });
  document.getElementById('btn-add-blocked')?.addEventListener('click', () => addSite('blocked'));
  document.getElementById('input-add-blocked')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addSite('blocked');
  });

  // Data actions
  document.getElementById('btn-export')?.addEventListener('click', async () => {
    const data = await sendMsg({ type: 'GET_ALL_DATA' });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `timify_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-reset')?.addEventListener('click', async () => {
    if (!confirm('Reset ALL data? This cannot be undone.')) return;
    await sendMsg({ type: 'RESET_DATA' });
    const settings = await sendMsg({ type: 'GET_SETTINGS' });
    populateUI(settings);
    showSaveToast();
  });

  // Open Dashboard
  document.getElementById('btn-open-dashboard')?.addEventListener('click', () => {
    sendMsg({ type: 'OPEN_DASHBOARD' });
  });

  // Live sync: settings changed in another context (popup, dashboard)
  chrome.runtime.onMessage.addListener(async (message) => {
    if (message?.type === 'SETTINGS_UPDATE' && message.settings) {
      populateUI(message.settings);
    }
    if (message?.type === 'DATA_RESET') {
      const settings = await sendMsg({ type: 'GET_SETTINGS' });
      populateUI(settings);
    }
  });
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

async function initSettings() {
  const settings = await sendMsg({ type: 'GET_SETTINGS' });
  populateUI(settings);
  bindControls();
}

document.addEventListener('DOMContentLoaded', initSettings);
