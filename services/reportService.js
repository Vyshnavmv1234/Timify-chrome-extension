/**
 * reportService.js
 *
 * Generates and retrieves study session reports and analytics.
 * Aggregates timer, distraction, and task data for the dashboard.
 */

import { STORAGE_KEYS } from '../utils/constants.js';
import { getStartOfDay, getEndOfDay, formatDate, getStartOfWeek, getEndOfWeek } from '../utils/dateUtils.js';
import { get as storageGet, set as storageSet, getSettings, updateSettings } from './storageService.js';
import { getTasks } from './taskService.js';

// --- Constants ---
const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * @typedef {Object} ReportSummary
 * @property {number} totalFocusMinutes
 * @property {number} sessionsCompleted
 * @property {number} tasksCompleted
 * @property {string} periodLabel
 */

/**
 * @typedef {Object} SessionRecord
 * @property {string} id - Unique identifier
 * @property {'focus'|'break'} type - Session type
 * @property {number} startTime - Start timestamp in ms
 * @property {number} endTime - End timestamp in ms
 * @property {number} durationMs - Actual duration completed in ms
 * @property {boolean} completed - Whether the session completed successfully
 */

/**
 * @typedef {Object} DistractionRecord
 * @property {string} id - Unique identifier
 * @property {string} url - Target URL
 * @property {number} timestamp - Epoch timestamp in ms
 */

// --- Internal Reusable Helpers ---

/**
 * Ensures the reports structure is initialized in storage.
 *
 * @returns {Promise<{ sessions: SessionRecord[], distractions: DistractionRecord[] }>}
 */
async function _getReportData() {
  const data = await storageGet(STORAGE_KEYS.REPORTS);
  if (!data || typeof data !== 'object') {
    const freshData = { sessions: [], distractions: [] };
    await storageSet(STORAGE_KEYS.REPORTS, freshData);
    return freshData;
  }
  return {
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    distractions: Array.isArray(data.distractions) ? data.distractions : []
  };
}

/**
 * Saves report data structure back to storage.
 */
async function _saveReportData(data) {
  await storageSet(STORAGE_KEYS.REPORTS, data);
}

// --- Date Math Helpers (local-only; week helpers imported from dateUtils) ---

function getStartOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function getEndOfMonth(date) {
  const d = new Date(date);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

// --- Public API ---

/**
 * Records a completed or partial session.
 *
 * @param {Omit<SessionRecord, 'id'>} session - Session details.
 * @returns {Promise<SessionRecord>} Persisted session record.
 */
export async function recordSession(session) {
  const data = await _getReportData();
  
  const newSession = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    ...session
  };

  data.sessions.push(newSession);
  await _saveReportData(data);
  return newSession;
}

/**
 * Records a distraction event.
 *
 * @param {string} url - Target distraction URL.
 * @returns {Promise<DistractionRecord>} Persisted distraction record.
 */
export async function recordDistraction(url) {
  const data = await _getReportData();

  const newDistraction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    url,
    timestamp: Date.now()
  };

  data.distractions.push(newDistraction);
  await _saveReportData(data);
  return newDistraction;
}

/**
 * Generates a report for the given date range.
 *
 * @param {Date} startDate - Start bounding date.
 * @param {Date} endDate - End bounding date.
 * @returns {Promise<Record<string, any>>}
 */
export async function generateReport(startDate, endDate) {
  const startMs = startDate.getTime();
  const endMs = endDate.getTime();

  // Load datasets
  const reportData = await _getReportData();
  const tasks = await getTasks();

  // Filter records in range
  const rangeSessions = reportData.sessions.filter(
    (s) => s.startTime >= startMs && s.endTime <= endMs && s.type === 'focus' && s.completed
  );

  const rangeDistractions = reportData.distractions.filter(
    (d) => d.timestamp >= startMs && d.timestamp <= endMs
  );

  const rangeCompletedTasks = tasks.filter(
    (t) => t.completed && t.completedAt && t.completedAt >= startMs && t.completedAt <= endMs
  );

  // Calculations
  let totalStudyTimeMs = 0;
  let longestSessionMs = 0;
  const dayDurations = Array(7).fill(0); // Sun-Sat durations in ms

  rangeSessions.forEach((s) => {
    totalStudyTimeMs += s.durationMs;
    if (s.durationMs > longestSessionMs) {
      longestSessionMs = s.durationMs;
    }
    
    // Track daily distribution for "most productive day"
    const dayIndex = new Date(s.startTime).getDay();
    dayDurations[dayIndex] += s.durationMs;
  });

  const pomodoroCount = rangeSessions.length;
  const averageSessionMs = pomodoroCount > 0 ? Math.round(totalStudyTimeMs / pomodoroCount) : 0;

  // Most productive day calculation
  let maxDuration = 0;
  let maxDayIndex = -1;
  dayDurations.forEach((duration, index) => {
    if (duration > maxDuration) {
      maxDuration = duration;
      maxDayIndex = index;
    }
  });
  const mostProductiveDay = maxDayIndex !== -1 ? DAYS_OF_WEEK[maxDayIndex] : 'None';

  // Dynamic Focus Score: Base score is 80. +5 per completed task, -5 per distraction. Clamped [0, 100]
  const baseScore = 80;
  const distractionPenalty = rangeDistractions.length * 5;
  const taskBonus = rangeCompletedTasks.length * 5;
  const focusScore = Math.min(100, Math.max(0, baseScore - distractionPenalty + taskBonus));

  const weeklyDistribution = [1, 2, 3, 4, 5, 6, 0].map(idx => Math.round(dayDurations[idx] / 60000));

  return {
    totalStudyTimeMs,
    totalStudyTimeMinutes: Math.round(totalStudyTimeMs / 60000),
    averageSessionMs,
    averageSessionMinutes: Math.round(averageSessionMs / 60000),
    longestSessionMs,
    longestSessionMinutes: Math.round(longestSessionMs / 60000),
    focusScore,
    mostProductiveDay,
    completedTasksCount: rangeCompletedTasks.length,
    pomodoroCount,
    distractionsCount: rangeDistractions.length,
    startDate,
    endDate,
    weeklyDistribution
  };
}

/**
 * Generates a Daily report for a given date.
 *
 * @param {Date} [date=new Date()]
 * @returns {Promise<Record<string, any>>}
 */
export async function generateDailyReport(date = new Date()) {
  const start = getStartOfDay(date);
  const end = getEndOfDay(date);
  const report = await generateReport(start, end);
  report.periodLabel = `Daily Report - ${formatDate(start)}`;
  return report;
}

/**
 * Generates a Weekly report for the week containing the given date.
 *
 * @param {Date} [date=new Date()]
 * @returns {Promise<Record<string, any>>}
 */
export async function generateWeeklyReport(date = new Date()) {
  const start = getStartOfWeek(date);
  const end = getEndOfWeek(date);
  const report = await generateReport(start, end);
  report.periodLabel = `Weekly Report - Week of ${formatDate(start)}`;
  return report;
}

/**
 * Generates a Monthly report for the month containing the given date.
 *
 * @param {Date} [date=new Date()]
 * @returns {Promise<Record<string, any>>}
 */
export async function generateMonthlyReport(date = new Date()) {
  const start = getStartOfMonth(date);
  const end = getEndOfMonth(date);
  const report = await generateReport(start, end);
  report.periodLabel = `Monthly Report - ${date.toLocaleString('default', { month: 'long', year: 'numeric' })}`;
  return report;
}

/**
 * Returns a summary of today's study activity.
 *
 * @returns {Promise<ReportSummary>}
 */
export async function getReportSummary() {
  const todayReport = await generateDailyReport();

  return {
    totalFocusMinutes: todayReport.totalStudyTimeMinutes,
    sessionsCompleted: todayReport.pomodoroCount,
    tasksCompleted: todayReport.completedTasksCount,
    periodLabel: todayReport.periodLabel
  };
}

/**
 * Returns the default report date range (today).
 *
 * @returns {{ start: Date; end: Date }}
 */
export function getDefaultDateRange() {
  const now = new Date();
  return {
    start: getStartOfDay(now),
    end: getEndOfDay(now),
  };
}

/**
 * Retrieves the recent logged study/break sessions.
 *
 * @param {number} [limit=4] - Maximum number of sessions to return.
 * @returns {Promise<SessionRecord[]>}
 */
export async function getRecentSessions(limit = 4) {
  const data = await _getReportData();
  return data.sessions.sort((a, b) => b.startTime - a.startTime).slice(0, limit);
}

/**
 * Calculates the current daily streak of completed focus sessions.
 * Automatically updates personal best streak in settings if exceeded.
 *
 * @returns {Promise<number>} Current streak.
 */
export async function getStreak() {
  const reportData = await _getReportData();
  const sessions = reportData.sessions.filter((s) => s.type === 'focus' && s.completed);
  if (sessions.length === 0) return 0;

  // Extract unique dates of completed focus sessions (YYYY-MM-DD)
  const uniqueDates = [...new Set(sessions.map((s) => {
    const d = new Date(s.startTime);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }))].sort((a, b) => new Date(b) - new Date(a)); // Descending order

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  // If no sessions today or yesterday, streak is broken
  if (!uniqueDates.includes(todayStr) && !uniqueDates.includes(yesterdayStr)) {
    return 0;
  }

  let streak = 0;
  // Start counting from the most recent active date (either today or yesterday)
  const currentDate = uniqueDates.includes(todayStr) ? today : yesterday;

  while (true) {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
    if (uniqueDates.includes(dateStr)) {
      streak++;
      currentDate.setDate(currentDate.getDate() - 1);
    } else {
      break;
    }
  }

  // Update best streak in settings if exceeded
  const settings = await getSettings();
  if (streak > (settings.bestStreak || 0)) {
    await updateSettings({ bestStreak: streak });
  }

  return streak;
}

/**
 * Returns focus study time metrics grouped by day for consistency heatmap.
 *
 * @param {number} [totalDays=96] - Number of days to include in the heatmap.
 * @returns {Promise<Array<{ date: string; minutes: number; level: number }>>}
 */
export async function getHeatmapData(totalDays = 96) {
  const reportData = await _getReportData();
  const sessions = reportData.sessions.filter((s) => s.type === 'focus' && s.completed);

  // Accumulate study minutes by date (YYYY-MM-DD)
  const studyTimeByDate = {};
  sessions.forEach((s) => {
    const dateStr = new Date(s.startTime).toISOString().slice(0, 10);
    studyTimeByDate[dateStr] = (studyTimeByDate[dateStr] || 0) + s.durationMs;
  });

  const heatmap = [];
  const now = new Date();

  // Generate date entries chronologically left-to-right (from totalDays-1 ago to today)
  for (let i = totalDays - 1; i >= 0; i--) {
    const tempDate = new Date(now);
    tempDate.setDate(now.getDate() - i);
    const dateStr = tempDate.toISOString().slice(0, 10);
    const minutes = Math.round((studyTimeByDate[dateStr] || 0) / 60000);

    let level = 0;
    if (minutes > 90) level = 3;
    else if (minutes > 30) level = 2;
    else if (minutes > 0) level = 1;

    heatmap.push({
      date: dateStr,
      minutes,
      level
    });
  }

  return heatmap;
}

/**
 * Returns focus minutes array for charts.
 * Supports:
 * - 'daily': Last 7 days.
 * - 'weekly': Monday through Sunday of the current week.
 * - 'monthly': Last 7 weeks (each bar is a 7-day total).
 *
 * @param {'daily'|'weekly'|'monthly'} period - Reporting period.
 * @returns {Promise<number[]>} Focus minutes per chart bar.
 */
export async function getChartData(period) {
  const now = new Date();
  const data = [];

  if (period === 'daily') {
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(now.getDate() - i);
      const start = getStartOfDay(date);
      const end = getEndOfDay(date);
      const rep = await generateReport(start, end);
      data.push(rep.totalStudyTimeMinutes);
    }
  } else if (period === 'weekly') {
    const start = getStartOfWeek(now);
    // Align start of week (Sunday) to Monday
    const mon = new Date(start);
    mon.setDate(start.getDate() + 1);

    for (let i = 0; i < 7; i++) {
      const date = new Date(mon);
      date.setDate(mon.getDate() + i);
      const startDay = getStartOfDay(date);
      const endDay = getEndOfDay(date);
      const rep = await generateReport(startDay, endDay);
      data.push(rep.totalStudyTimeMinutes);
    }
  } else if (period === 'monthly') {
    for (let i = 6; i >= 0; i--) {
      const startOfWeek = getStartOfWeek(now);
      startOfWeek.setDate(startOfWeek.getDate() - i * 7);
      const endOfWeek = getEndOfWeek(startOfWeek);
      const rep = await generateReport(startOfWeek, endOfWeek);
      data.push(rep.totalStudyTimeMinutes);
    }
  }

  return data;
}

/** Re-export storage key for reports. */
export { STORAGE_KEYS };
