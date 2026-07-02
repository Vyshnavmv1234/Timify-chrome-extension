# Timify

A Manifest V3 Chrome extension that helps students stay focused while studying. Timify will provide timers, task management, reports, and distraction detection.

> **Note:** This repository currently contains scaffold/boilerplate only. Features are not yet implemented.

## Tech Stack

- Manifest V3
- HTML, CSS, Vanilla JavaScript (ES6 Modules)
- Chrome Extension APIs
- No React or other frameworks

## Project Structure

```
Timify/
├── manifest.json          # Extension manifest (MV3)
├── popup/                 # Toolbar popup UI
├── background/            # Service worker (background coordinator)
├── content/               # Content scripts (page context)
├── pages/                 # Full-page UI (dashboard)
├── services/              # Business logic layer
├── utils/                 # Shared helpers and constants
├── assets/                # Icons, sounds, images
├── data/                  # Static data files
└── styles/                # Global styles
```

## Architecture

| Layer | Responsibility |
|-------|----------------|
| **UI** (`popup/`, `pages/`) | DOM, events, rendering — delegates to services |
| **Background** | Lifecycle, alarms, cross-tab coordination |
| **Content** | Page-level hooks for distraction detection |
| **Services** | Business logic (timers, storage, tasks, etc.) |
| **Utils** | Pure helpers and shared constants |

Services shared between background and content scripts must not call context-specific Chrome APIs without guards.

## Permissions

| Permission | Future use |
|------------|------------|
| `storage` | Persist tasks, timer state, settings, reports |
| `tabs` | Track active tabs for distraction detection |
| `notifications` | Timer completion and focus reminders |
| `alarms` | Scheduled timer ticks and periodic checks |
| `scripting` | Inject or update content scripts dynamically |

## Getting Started

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `Timify` project folder
5. Click the Timify icon in the toolbar to open the popup
6. Open the dashboard from the popup link or via `chrome-extension://<extension-id>/pages/dashboard.html`

## Development

No build step is required. Edit files and click **Reload** on the extension card in `chrome://extensions`.

ES modules are used throughout:

- Background service worker: `"type": "module"` in `manifest.json`
- Content scripts: `"type": "module"` in content_scripts entry
- Popup and dashboard: `<script type="module">`

## License

Private — not yet published.
