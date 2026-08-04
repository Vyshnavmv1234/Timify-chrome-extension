/**
 * taskService.js
 *
 * CRUD operations for study tasks.
 * Tasks are persisted via storageService.
 */

import { generateId } from '../utils/helpers.js';
import { STORAGE_KEYS } from '../utils/constants.js';
import { get as storageGet, set as storageSet } from './storageService.js';

/**
 * @typedef {Object} Task
 * @property {string} id - Unique identifier
 * @property {string} title - Task description
 * @property {boolean} completed - True if task is finished
 * @property {'low'|'medium'|'high'} priority - Priority level
 * @property {number} estimatedMinutes - Estimated focus time in minutes
 * @property {number} createdAt - Creation timestamp in milliseconds
 * @property {number|null} completedAt - Completion timestamp in milliseconds, or null
 * @property {string|null} category - Category string (future expansion support)
 */

// --- Public API ---

/**
 * Retrieves all saved tasks.
 *
 * @returns {Promise<Task[]>} Array of Tasks.
 */
export async function getTasks() {
  const tasks = await storageGet(STORAGE_KEYS.TASKS);
  return Array.isArray(tasks) ? tasks : [];
}

/**
 * Adds a new task to storage.
 *
 * @param {string|Partial<Task>} taskInput - Either the task title (string) or a partial Task object.
 * @returns {Promise<Task>} The newly created Task object.
 */
export async function addTask(taskInput) {
  const tasks = await getTasks();

  let title = '';
  let priority = 'medium';
  let estimatedMinutes = 25;
  let category = null;

  if (typeof taskInput === 'string') {
    title = taskInput;
  } else if (taskInput && typeof taskInput === 'object') {
    title = taskInput.title || 'Untitled Task';
    priority = taskInput.priority || 'medium';
    estimatedMinutes = typeof taskInput.estimatedMinutes === 'number' ? taskInput.estimatedMinutes : 25;
    category = taskInput.category || null;
  }

  const newTask = {
    id: generateId(),
    title,
    completed: false,
    priority,
    estimatedMinutes,
    createdAt: Date.now(),
    completedAt: null,
    category
  };

  tasks.push(newTask);
  await storageSet(STORAGE_KEYS.TASKS, tasks);
  return newTask;
}

/**
 * Updates properties of an existing task in storage.
 * Handles automatic setting/unsetting of completion timestamps.
 *
 * @param {string} id - Task identifier.
 * @param {Partial<Task>} updates - Object containing properties to modify.
 * @returns {Promise<Task|null>} The updated Task, or null if the task was not found.
 */
export async function updateTask(id, updates) {
  const tasks = await getTasks();
  const taskIndex = tasks.findIndex((t) => t.id === id);

  if (taskIndex === -1) {
    return null;
  }

  const task = tasks[taskIndex];
  const mergedUpdates = { ...updates };

  // Sync completion timestamp based on completed status update
  if (mergedUpdates.completed !== undefined) {
    if (mergedUpdates.completed && !task.completed) {
      mergedUpdates.completedAt = Date.now();
    } else if (!mergedUpdates.completed && task.completed) {
      mergedUpdates.completedAt = null;
    }
  }

  const updatedTask = { ...task, ...mergedUpdates };
  tasks[taskIndex] = updatedTask;

  await storageSet(STORAGE_KEYS.TASKS, tasks);
  return updatedTask;
}

/**
 * Deletes a task by ID from storage.
 *
 * @param {string} id - Task identifier.
 * @returns {Promise<boolean>} True if deleted successfully, false if the task didn't exist.
 */
export async function deleteTask(id) {
  const tasks = await getTasks();
  const filteredTasks = tasks.filter((t) => t.id !== id);

  if (filteredTasks.length === tasks.length) {
    return false;
  }

  await storageSet(STORAGE_KEYS.TASKS, filteredTasks);
  return true;
}

/**
 * Marks a task as completed (or incomplete).
 *
 * @param {string} id - Task identifier.
 * @param {boolean} [completed=true] - Target completion status.
 * @returns {Promise<Task|null>} The updated Task, or null if the task was not found.
 */
export async function completeTask(id, completed = true) {
  return updateTask(id, { completed });
}

/** Re-export storage key for tasks. */
export { STORAGE_KEYS };
