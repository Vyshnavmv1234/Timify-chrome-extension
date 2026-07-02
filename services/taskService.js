/**
 * taskService.js
 *
 * CRUD operations for study tasks.
 * Tasks are persisted via storageService in future implementations.
 */

import { generateId } from '../utils/helpers.js';
import { STORAGE_KEYS } from '../utils/constants.js';

/**
 * @typedef {Object} Task
 * @property {string} id
 * @property {string} title
 * @property {boolean} completed
 * @property {number} createdAt
 */

/**
 * Retrieves all tasks.
 * @returns {Promise<Task[]>}
 */
export async function getTasks() {
  // TODO: Load tasks from storage
  return [];
}

/**
 * Adds a new task.
 * @param {string} title - Task title
 * @returns {Promise<Task>}
 */
export async function addTask(title) {
  // TODO: Persist new task to storage
  return {
    id: generateId(),
    title,
    completed: false,
    createdAt: Date.now(),
  };
}

/**
 * Updates an existing task.
 * @param {string} id - Task ID
 * @param {Partial<Task>} updates - Fields to update
 * @returns {Promise<Task|null>}
 */
export async function updateTask(id, updates) {
  // TODO: Find and update task in storage
  void id;
  void updates;
  return null;
}

/**
 * Deletes a task by ID.
 * @param {string} id - Task ID
 * @returns {Promise<boolean>}
 */
export async function deleteTask(id) {
  // TODO: Remove task from storage
  void id;
  return false;
}

/** Re-export storage key for tasks. */
export { STORAGE_KEYS };
