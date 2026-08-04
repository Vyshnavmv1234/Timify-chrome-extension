/**
 * content.js
 *
 * Content script entry point — runs in the context of web pages.
 * Delegates all distraction detection to the websiteMonitor service,
 * which handles URL checking, SPA title observation, and redirect logic.
 */

import { initWebsiteMonitor } from '../services/websiteMonitor.js';

initWebsiteMonitor();
