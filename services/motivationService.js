/**
 * motivationService.js
 *
 * Manages study motivation alerts, quote catalog, frequency scheduling,
 * and future AI-based generation pathways.
 */

import { STORAGE_KEYS } from '../utils/constants.js';
import { getSettings, updateSettings } from './storageService.js';
import { showNotification } from './notificationService.js';

// --- Constants ---
const MOTIVATION_ALARM_NAME = 'timify_motivation_alarm';

const QUOTE_DATABASE = {
  discipline: [
    { text: "Discipline is choosing between what you want now and what you want most.", author: "Abraham Lincoln" },
    { text: "We must all suffer one of two things: the pain of discipline or the pain of regret.", author: "Jim Rohn" },
    { text: "Discipline is the bridge between goals and accomplishment.", author: "Jim Rohn" },
    { text: "Self-discipline is the magic power that makes you virtually unstoppable.", author: "Dan Kennedy" }
  ],
  consistency: [
    { text: "Consistency is what transforms average into excellence.", author: "Unknown" },
    { text: "It's not what we do once in a while that shapes our lives. It's what we do consistently.", author: "Tony Robbins" },
    { text: "Small daily improvements over time lead to stunning results.", author: "Robin Sharma" },
    { text: "Success is consistency of purpose.", author: "Benjamin Disraeli" }
  ],
  success: [
    { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
    { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
    { text: "The only place where success comes before work is in the dictionary.", author: "Vidal Sassoon" }
  ],
  "deep work": [
    { text: "Deep work is the superpower of the 21st century.", author: "Cal Newport" },
    { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
    { text: "Your ability to concentrate is a competitive advantage in a distracted world.", author: "Unknown" },
    { text: "To produce at your peak level you need to work with full concentration.", author: "Cal Newport" }
  ]
};



/**
 * Future AI Integration Endpoint.
 * Placeholder for connecting with LLM APIs in future iterations.
 *
 * @param {string} category - Target quote category.
 * @returns {Promise<{ text: string, author: string }|null>}
 */
async function _fetchAiQuote(category) {
  // Future AI integration hook
  // Example:
  // try {
  //   const res = await fetch('https://api.openai.com/v1/chat/completions', ...);
  //   const data = await res.json();
  //   return { text: data.choices[0].message.content, author: 'AI Assistant' };
  // } catch (e) {
  //   return null;
  // }
  void category;
  return null;
}

// --- Public API ---

/**
 * Retrieves a list of quotes for a specific category.
 *
 * @param {'discipline'|'consistency'|'success'|'deep work'} [category]
 * @returns {Array<{ text: string, author: string }>}
 */
export function getQuotes(category) {
  if (category && QUOTE_DATABASE[category.toLowerCase()]) {
    return QUOTE_DATABASE[category.toLowerCase()];
  }
  
  // Return all quotes merged if no specific category matches
  return Object.values(QUOTE_DATABASE).flat();
}

/**
 * Returns a randomized quote from the target category.
 * Integrates optional future AI fetching.
 *
 * @param {'discipline'|'consistency'|'success'|'deep work'} [category]
 * @returns {Promise<{ text: string, author: string }>}
 */
export async function getRandomQuote(category) {
  const settings = await getSettings();
  const targetCategory = category || settings.motivationCategory;

  // Try future AI integration first if enabled
  if (settings.useAiMotivation) {
    const aiQuote = await _fetchAiQuote(targetCategory);
    if (aiQuote) return aiQuote;
  }

  const quotes = getQuotes(targetCategory);
  const randomIndex = Math.floor(Math.random() * quotes.length);
  return quotes[randomIndex];
}

/**
 * Starts the motivation alarm scheduled at the interval specified in settings.
 * @returns {Promise<void>}
 */
export async function startMotivationAlarm() {
  const settings = await getSettings();
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    await new Promise((resolve) => chrome.alarms.clear(MOTIVATION_ALARM_NAME, resolve));
    chrome.alarms.create(MOTIVATION_ALARM_NAME, { periodInMinutes: settings.motivationInterval });
    console.log(`[motivationService] Scheduled motivation alarm every ${settings.motivationInterval} minutes.`);
  }
}

/**
 * Stops the scheduled motivation alarm.
 * @returns {Promise<void>}
 */
export async function stopMotivationAlarm() {
  if (typeof chrome !== 'undefined' && chrome.alarms) {
    await new Promise((resolve) => chrome.alarms.clear(MOTIVATION_ALARM_NAME, resolve));
    console.log('[motivationService] Cleared motivation alarm.');
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
 * Triggers a motivation notification with a random quote.
 *
 * @returns {Promise<string|null>}
 */
export async function triggerMotivationNotification() {
  const quote = await getRandomQuote();
  const title = `Timify — Stay Focused!`;
  const message = `"${quote.text}" — ${quote.author}`;

  return showNotification({ title, message });
}
