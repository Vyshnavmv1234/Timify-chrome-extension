/**
 * motivationService.js
 *
 * Manages study motivation alerts, quote catalog, frequency scheduling,
 * and future AI-based generation pathways.
 */

import { STORAGE_KEYS } from '../utils/constants.js';
import { getSettings, updateSettings } from './storageService.js';

// --- Constants ---
const MOTIVATION_ALARM_NAME = 'timify_motivation_alarm';
const DEFAULT_MOTIVATION_INTERVAL_MINUTES = 45;
let _motivationIntervalId = null;

const QUOTE_DATABASE = {
  discipline: [
    { text: "stop negotiating with the work you already chose.", author: "Timify" },
    { text: "do the work before your mood gets a vote.", author: "Timify" },
    { text: "comfort is expensive when your goals demand more.", author: "Timify" },
    { text: "you don't need motivation; you need another hour.", author: "Timify" },
    { text: "make progress your habit, not your occasional mood.", author: "Timify" },
    { text: "the work gets easier after you stop avoiding it.", author: "Timify" },
    { text: "your excuses don't count toward the finished result.", author: "Timify" },
    { text: "do it tired. do it bored. just keep moving.", author: "Timify" },
    { text: "discipline starts where convenient choices end.", author: "Timify" },
    { text: "the task won't finish itself while you overthink it.", author: "Timify" },
    { text: "stop preparing to work and start doing the work.", author: "Timify" },
    { text: "your standards mean nothing without repeated action.", author: "Timify" },
    { text: "work quietly until your results become difficult to ignore.", author: "Timify" },
    { text: "don't make today's laziness tomorrow's unfinished business.", author: "Timify" },
    { text: "you already know what needs to be done.", author: "Timify" },
    { text: "less planning. fewer excuses. more finished work.", author: "Timify" },
    { text: "discipline is keeping promises nobody else can see.", author: "Timify" },
    { text: "if it matters, give it your attention.", author: "Timify" },
    { text: "your next hour matters more than your last mistake.", author: "Timify" },
    { text: "do the boring part. that's where progress hides.", author: "Timify" }
  ],
  focus: [
    { text: "protect your attention like your goals depend on it.", author: "Timify" },
    { text: "every distraction is time borrowed from your future work.", author: "Timify" },
    { text: "focus isn't talent; it's refusing to keep switching.", author: "Timify" },
    { text: "close the noise. finish what you started.", author: "Timify" },
    { text: "you cannot build momentum while constantly changing direction.", author: "Timify" },
    { text: "one focused hour beats three distracted ones.", author: "Timify" },
    { text: "stop checking progress and start creating more of it.", author: "Timify" },
    { text: "your attention is limited. spend it deliberately.", author: "Timify" },
    { text: "don't let five minutes of distraction become an hour.", author: "Timify" },
    { text: "finish this task before finding another one.", author: "Timify" },
    { text: "the fastest way forward is usually fewer distractions.", author: "Timify" },
    { text: "you don't need more time; you need fewer interruptions.", author: "Timify" },
    { text: "put the phone down and give the work a chance.", author: "Timify" },
    { text: "focus long enough to become difficult to stop.", author: "Timify" },
    { text: "protect the hour. the hour builds everything else.", author: "Timify" }
  ],
  progress: [
    { text: "small progress still counts when nobody notices it.", author: "Timify" },
    { text: "today's unfinished work becomes tomorrow's heavier workload.", author: "Timify" },
    { text: "progress becomes visible after enough invisible effort.", author: "Timify" },
    { text: "don't underestimate what repeated effort can quietly build.", author: "Timify" },
    { text: "one better decision today changes tomorrow's workload.", author: "Timify" },
    { text: "measure what improved, then raise the standard.", author: "Timify" },
    { text: "progress rewards repetition more than occasional intensity.", author: "Timify" },
    { text: "you don't need a breakthrough. you need another rep.", author: "Timify" },
    { text: "keep stacking days that your future work can use.", author: "Timify" },
    { text: "small gains become serious when you stop resetting.", author: "Timify" },
    { text: "improvement gets real when repetition becomes non-negotiable.", author: "Timify" },
    { text: "every completed task removes weight from tomorrow.", author: "Timify" },
    { text: "progress is often just unfinished work finally finished.", author: "Timify" },
    { text: "make today's version slightly harder to beat.", author: "Timify" },
    { text: "you are not behind; you're underworked on the goal.", author: "Timify" }
  ],
  brutal: [
    { text: "nobody is coming to finish the work for you.", author: "Timify" },
    { text: "your potential means nothing without output.", author: "Timify" },
    { text: "wanting it badly doesn't count as doing it.", author: "Timify" },
    { text: "your results eventually expose your daily habits.", author: "Timify" },
    { text: "you can't outthink work you refuse to start.", author: "Timify" },
    { text: "stop waiting to feel ready. readiness follows repetition.", author: "Timify" },
    { text: "the gap grows every time you choose comfort.", author: "Timify" },
    { text: "you have enough information. now produce something.", author: "Timify" },
    { text: "your goal doesn't care how tired your excuses sound.", author: "Timify" },
    { text: "being busy isn't useful if nothing important gets finished.", author: "Timify" },
    { text: "you don't need another plan. you need execution.", author: "Timify" },
    { text: "the version you want requires different daily behavior.", author: "Timify" },
    { text: "every skipped session makes restarting more expensive.", author: "Timify" },
    { text: "you can rest later. finish the important part first.", author: "Timify" },
    { text: "results don't care how convincing your intentions were.", author: "Timify" }
  ],
  tracking: [
    { text: "another session finished. now make the next one count.", author: "Timify" },
    { text: "you showed up. don't waste the momentum.", author: "Timify" },
    { text: "one more focused session changes the numbers.", author: "Timify" },
    { text: "keep going. your consistency is starting to compound.", author: "Timify" },
    { text: "you've already started. don't become your own interruption.", author: "Timify" },
    { text: "do the work before your mood gets a vote.", author: "Timify" },
    { text: "your potential means nothing without output.", author: "Timify" },
    { text: "you already know what needs to be done.", author: "Timify" },
    { text: "stop negotiating with the work you already chose.", author: "Timify" },
    { text: "one focused hour beats three distracted ones.", author: "Timify" },
    { text: "you don't need another plan. you need execution.", author: "Timify" },
    { text: "the work gets easier after you stop avoiding it.", author: "Timify" },
    { text: "your results eventually expose your daily habits.", author: "Timify" },
    { text: "close the noise. finish what you started.", author: "Timify" },
    { text: "don't underestimate what repeated effort can quietly build.", author: "Timify" },
    { text: "you don't need a breakthrough. you need another rep.", author: "Timify" },
    { text: "finish this task before finding another one.", author: "Timify" }
  ],
  "hard-hitting": [
    { text: "you want the result. now earn the hours behind it.", author: "Timify" },
    { text: "someone with your goal is working while you're still thinking.", author: "Timify" },
    { text: "your competition isn't more talented. they may simply be more consistent.", author: "Timify" },
    { text: "you said you wanted it. your schedule should prove it.", author: "Timify" },
    { text: "the goal isn't getting easier. your work ethic has to get stronger.", author: "Timify" },
    { text: "stop asking if you're motivated. ask if the work is done.", author: "Timify" },
    { text: "you have time. you're just spending it somewhere else.", author: "Timify" },
    { text: "your future won't care why you skipped today.", author: "Timify" },
    { text: "every hour wasted is an hour someone else used to improve.", author: "Timify" },
    { text: "you can't complain about results you didn't work for.", author: "Timify" },
    { text: "you don't need another excuse. you need another focused hour.", author: "Timify" },
    { text: "your goals are expensive. pay for them with effort.", author: "Timify" },
    { text: "nobody owes you the outcome. build it yourself.", author: "Timify" },
    { text: "you know what you're capable of. start acting like it.", author: "Timify" },
    { text: "the difference is rarely talent. it's what happens when nobody is watching.", author: "Timify" }
  ],
  aggressive: [
    { text: "someone is putting in the hours you keep postponing.", author: "Timify" },
    { text: "while you're waiting for motivation, someone else is finishing.", author: "Timify" },
    { text: "your dream doesn't need another plan. it needs today's work.", author: "Timify" },
    { text: "you can rest after the work. not instead of it.", author: "Timify" },
    { text: "stop protecting your comfort. start protecting your goal.", author: "Timify" },
    { text: "the version of you that succeeds doesn't keep choosing easy.", author: "Timify" },
    { text: "if you keep working at this pace, where will you be next year?", author: "Timify" },
    { text: "your excuses are getting more consistent than your effort.", author: "Timify" },
    { text: "you don't need permission to work harder. start.", author: "Timify" },
    { text: "nobody sees the hours. everyone sees the result.", author: "Timify" },
    { text: "you wanted a different life. different effort comes first.", author: "Timify" },
    { text: "the clock is moving either way. make the hours useful.", author: "Timify" },
    { text: "you can scroll now. you can regret the lost hour later.", author: "Timify" },
    { text: "stop waiting for the perfect moment. this hour is available.", author: "Timify" },
    { text: "you haven't finished yet. so why are you stopping?", author: "Timify" }
  ],
  competition: [
    { text: "while you're hesitating, someone else is putting in another rep.", author: "Timify" },
    { text: "someone else is learning the skill you keep saying you'll start.", author: "Timify" },
    { text: "someone else is finishing what you keep postponing.", author: "Timify" },
    { text: "the person ahead of you may simply have fewer skipped days.", author: "Timify" },
    { text: "someone is already doing the work you keep planning to do.", author: "Timify" },
    { text: "your future competition is practicing right now.", author: "Timify" },
    { text: "someone else is turning their free hour into an advantage.", author: "Timify" },
    { text: "the gap isn't closing while you wait.", author: "Timify" },
    { text: "every focused session is another brick between you and average.", author: "Timify" },
    { text: "someone is using this hour. you decide whether it's you.", author: "Timify" },
    { text: "you said you wanted this. prove it.", author: "Timify" }
  ]
};

// Aliases for compatibility with settings and variations
QUOTE_DATABASE['work'] = QUOTE_DATABASE.discipline;
QUOTE_DATABASE['discipline / work'] = QUOTE_DATABASE.discipline;
QUOTE_DATABASE['deep work'] = QUOTE_DATABASE.focus;
QUOTE_DATABASE['consistency'] = QUOTE_DATABASE.progress;
QUOTE_DATABASE['reality check'] = QUOTE_DATABASE.brutal;
QUOTE_DATABASE['brutal / reality check'] = QUOTE_DATABASE.brutal;
QUOTE_DATABASE['success'] = QUOTE_DATABASE.tracking;
QUOTE_DATABASE['momentum'] = QUOTE_DATABASE.tracking;
QUOTE_DATABASE['for someone tracking their progress'] = QUOTE_DATABASE.tracking;
QUOTE_DATABASE['hard hitting'] = QUOTE_DATABASE['hard-hitting'];
QUOTE_DATABASE['more aggressive'] = QUOTE_DATABASE.aggressive;
QUOTE_DATABASE['someone else is working'] = QUOTE_DATABASE.competition;
QUOTE_DATABASE['someone else is working style'] = QUOTE_DATABASE.competition;

/**
 * Future AI Integration Endpoint.
 * Placeholder for connecting with LLM APIs in future iterations.
 *
 * @param {string} category - Target quote category.
 * @returns {Promise<{ text: string, author: string }|null>}
 */
async function _fetchAiQuote(category) {
  void category;
  return null;
}

// Track last quote text to guarantee non-repeating consecutive notifications
let _lastQuoteText = '';

// --- Public API ---

/**
 * Retrieves a list of quotes for a specific category or the complete mixed pool.
 *
 * @param {string} [category]
 * @returns {Array<{ text: string, author: string }>}
 */
export function getQuotes(category) {
  if (category && category !== 'all' && category !== 'mixed' && category !== 'random') {
    const key = category.toLowerCase().trim();
    if (QUOTE_DATABASE[key]) {
      return QUOTE_DATABASE[key];
    }
  }
  
  // Return all unique quotes merged if no specific category matches or 'all' is selected
  const uniqueTexts = new Set();
  const all = [];
  const primaryLists = [
    QUOTE_DATABASE.discipline,
    QUOTE_DATABASE.focus,
    QUOTE_DATABASE.progress,
    QUOTE_DATABASE.brutal,
    QUOTE_DATABASE.tracking,
    QUOTE_DATABASE['hard-hitting'],
    QUOTE_DATABASE.aggressive,
    QUOTE_DATABASE.competition
  ];

  for (const list of primaryLists) {
    if (!list) continue;
    for (const q of list) {
      if (!uniqueTexts.has(q.text)) {
        uniqueTexts.add(q.text);
        all.push(q);
      }
    }
  }
  return all;
}

/**
 * Returns a randomized quote from the target category (or all quotes mixed).
 * Guarantees consecutive notifications never show the identical quote twice.
 * Integrates optional future AI fetching.
 *
 * @param {string} [category]
 * @returns {Promise<{ text: string, author: string }>}
 */
export async function getRandomQuote(category) {
  const settings = await getSettings();
  const targetCategory = category || settings.motivationCategory || 'all';

  // Try future AI integration first if enabled
  if (settings.useAiMotivation) {
    const aiQuote = await _fetchAiQuote(targetCategory);
    if (aiQuote) return aiQuote;
  }

  const quotes = getQuotes(targetCategory);
  if (!quotes || quotes.length === 0) {
    return { text: "stay focused — keep going.", author: "Timify" };
  }
  if (quotes.length === 1) return quotes[0];

  // Pick random quote, avoiding repeating the immediately previous one
  let pick = quotes[Math.floor(Math.random() * quotes.length)];
  let attempts = 0;
  while (pick.text === _lastQuoteText && attempts < 10) {
    pick = quotes[Math.floor(Math.random() * quotes.length)];
    attempts++;
  }
  _lastQuoteText = pick.text;
  return pick;
}

/**
 * Starts the motivation alarm scheduled at the interval specified in settings (default 45 minutes).
 * @param {number} [customMinutes]
 * @returns {Promise<void>}
 */
export async function startMotivationAlarm(customMinutes) {
  const settings = await getSettings();
  const intervalMinutes = customMinutes || settings.motivationInterval || DEFAULT_MOTIVATION_INTERVAL_MINUTES;

  if (typeof chrome !== 'undefined' && chrome.alarms) {
    await new Promise((resolve) => chrome.alarms.clear(MOTIVATION_ALARM_NAME, resolve));
    chrome.alarms.create(MOTIVATION_ALARM_NAME, {
      delayInMinutes: intervalMinutes,
      periodInMinutes: intervalMinutes,
    });
    console.log(`[motivationService] Scheduled motivation alarm every ${intervalMinutes} minute(s).`);
  }

  // Clear any lingering interval timer
  if (_motivationIntervalId) {
    clearInterval(_motivationIntervalId);
    _motivationIntervalId = null;
  }
}

/**
 * Stops the scheduled motivation alarm and interval.
 * @returns {Promise<void>}
 */
export async function stopMotivationAlarm() {
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    await new Promise((resolve) => chrome.alarms.clear(MOTIVATION_ALARM_NAME, resolve));
    console.log('[motivationService] Cleared motivation alarm.');
  }

  if (_motivationIntervalId) {
    clearInterval(_motivationIntervalId);
    _motivationIntervalId = null;
  }
}

/**
 * Configures the motivation interval.
 * Supported values: 15, 30, 45 minutes.
 *
 * @param {15|30|45} minutes - Interval length.
 * @returns {Promise<void>}
 */
export async function setMotivationInterval(minutes) {
  if (![15, 30, 45].includes(minutes)) {
    throw new Error('[motivationService] Invalid interval. Supported values: 15, 30, 45 minutes.');
  }

  await updateSettings({ motivationInterval: minutes });
  await startMotivationAlarm();
}

/**
 * Sets the active motivation category.
 *
 * @param {'discipline'|'consistency'|'success'|'deep work'} category
 * @returns {Promise<void>}
 */
export async function setMotivationCategory(category) {
  const formattedCategory = category.toLowerCase();
  if (!QUOTE_DATABASE[formattedCategory]) {
    throw new Error(`[motivationService] Invalid category: ${category}`);
  }

  await updateSettings({ motivationCategory: formattedCategory });
}

/**
 * Toggles the AI integration state.
 *
 * @param {boolean} enabled
 * @returns {Promise<void>}
 */
export async function toggleAiMotivation(enabled) {
  await updateSettings({ useAiMotivation: !!enabled });
}

/**
 * Triggers the in-page motivation HUD on the currently active browser tab.
 *
 * Step-by-step logging is intentional for debugging — each stage is marked
 * so you can see exactly where the flow stops if the HUD doesn't appear.
 * Check the SERVICE WORKER console at chrome://extensions → Timify → "service worker".
 *
 * @returns {Promise<void>}
 */
export async function triggerMotivationNotification() {
  console.log('[motivationService] ── STEP 1: triggerMotivationNotification() called ──');

  const quote = await getRandomQuote();
  console.log('[motivationService] ── STEP 2: Quote fetched:', quote.text, '—', quote.author);

  let tabs;
  try {
    tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    }
    if (!tabs || tabs.length === 0) {
      tabs = await chrome.tabs.query({ active: true });
    }
  } catch (err) {
    console.error('[motivationService] ── STEP 3 FAILED: chrome.tabs.query threw:', err);
    return;
  }

  console.log('[motivationService] ── STEP 3: Tabs queried, count:', tabs ? tabs.length : 0, tabs);

  if (!tabs || tabs.length === 0) {
    console.warn('[motivationService] ── STEP 3: No active tab found — skipping HUD.');
    return;
  }

  const tab = tabs[0];
  console.log('[motivationService] ── STEP 4: Active tab:', tab.id, tab.url);

  // Bail out for pages where content scripts cannot run
  const url = tab.url || '';
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com')
  ) {
    console.log(`[motivationService] ── STEP 4: Restricted tab (${url}) — skipping HUD.`);
    return;
  }

  console.log(`[motivationService] ── STEP 5: Sending SHOW_MOTIVATION_HUD to tab ${tab.id}…`);

  try {
    await chrome.tabs.sendMessage(tab.id, {
      type: 'SHOW_MOTIVATION_HUD',
      data: {
        quote: quote.text,
        author: quote.author,
      },
    });
    console.log('[motivationService] ── STEP 6: Message delivered successfully to tab', tab.id);
  } catch (err) {
    console.warn(`[motivationService] ── STEP 5: Direct message failed to tab ${tab.id}, attempting injection:`, err);
    try {
      if (chrome.scripting && chrome.scripting.executeScript) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content/motivationHud.js', 'content/content.js'],
        });
        await new Promise((r) => setTimeout(r, 80));
        await chrome.tabs.sendMessage(tab.id, {
          type: 'SHOW_MOTIVATION_HUD',
          data: {
            quote: quote.text,
            author: quote.author,
          },
        });
        console.log('[motivationService] ── STEP 6: Injected and delivered successfully to tab', tab.id);
      }
    } catch (injectErr) {
      console.warn('[motivationService] Injection also failed:', injectErr);
    }
  }
}

