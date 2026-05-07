# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Chrome extension (Manifest V3) that controls a [Blocky DNS](https://0xerr0r.github.io/blocky/latest/) server — toggling blocking on/off, temporary disables, and a live badge. Published on the Chrome Web Store (`ijljpfdmompfofnlgknfnihmpplieamb`).

## Development

There is no build step. Load the extension directly:

1. `chrome://extensions/` → Enable **Developer mode**
2. **Load unpacked** → select this directory
3. After any code change, hit the **↺** refresh icon on the extension card

To inspect the popup: right-click the toolbar icon → **Inspect popup**.  
To inspect the service worker: click the **Service worker** link on the extension card.

### Regenerating icons

If `images/icon.svg` changes, regenerate the PNGs:

```
npm install
npm run generate-icons
```

## Architecture

The extension has no bundler or framework — plain JS, inline CSS in `popup.html`.

### Files

| File | Role |
|------|------|
| `manifest.json` | MV3 manifest. `optional_host_permissions: ["<all_urls>"]` — permissions are requested at runtime per host via `chrome.permissions.request`. |
| `background.js` | MV3 service worker. Owns badge updates, periodic status checks (1-min alarm), and storage migrations. |
| `popup.html` | 320px popup. All CSS is inline in `<style>`. No external resources. |
| `popup.js` | All popup logic. Renders per-host cards, handles user actions, manages countdowns. |

### Storage

Two storage areas are used:

**`chrome.storage.sync`** (persists across devices):
- `blockySwitchHosts: string[]` — ordered list of host URLs
- `lastBlockingStatuses: { [url]: boolean }` — cached per-host status for badge on startup

**`chrome.storage.local`** (device-local, ephemeral):
- `disableTimers: { [url]: { expiresAt: timestamp } }` — active temporary-disable countdowns

Storage schema changed from v1 (single `blockySwitchHost` string) to v2 (array). Both `background.js` (`onInstalled`) and `popup.js` (`loadHosts`) run the same idempotent migration so whichever context wakes first handles it.

### Badge states

`computeAggregate(statuses, hosts)` is intentionally duplicated in both `background.js` and `popup.js` (both contexts need it independently, and there's no module system):

| State | Text | Colour |
|-------|------|--------|
| `'on'` — all enabled | `ON` | green `#4ade80` |
| `'off'` — all disabled | `OFF` | red `#f87171` |
| `'mixed'` — some on, some off | `~` | orange `#fb923c` |
| `null` — none configured / all unknown | _(blank)_ | — |

### Network / CORS fallback

Every API call in `popup.js` tries `fetch()` first (direct, CORS). On failure it retries via `chrome.runtime.sendMessage({ action: 'testConnection', url })`, which routes through the service worker using `XMLHttpRequest`. The XHR response wrapper is `{ status, statusText, data: <parsed JSON>, headers }`, so the blocking status lives at `response.data.data.enabled` in the fallback path — the double `.data` is intentional.

### Blocky API endpoints used

All are `GET` (Blocky's own design):

- `{host}/api/blocking/status` → `{ enabled: bool }`
- `{host}/api/blocking/enable`
- `{host}/api/blocking/disable`
- `{host}/api/blocking/disable?duration=300s`

### Disable shortcuts

Defined as `DISABLE_SHORTCUTS` at the top of `popup.js`. Adding or removing durations only requires editing that array — card rendering and event wiring are driven from it.

### Collapsible host cards

Per-host shortcuts (`.host-shortcuts` grid) are hidden by default. A chevron button (`.host-expand-btn`) toggles `.host-card.expanded`, which CSS-rotates the chevron 90° and JS sets `shortcuts.style.display = 'grid'`. The timer line and main card row are always visible regardless of expand state.

### "All" section

The `#all-toggle-row` (`.all-section`) contains a header row with the all-toggle and a `#all-shortcuts` grid below it. Buttons are generated at init time from `DISABLE_SHORTCUTS`. Clicking one calls `disableAllTemporary(seconds)`, which fans out a temporary-disable request to every host in parallel using `Promise.allSettled` with the same fetch → XHR fallback pattern as the per-host `temporaryDisable` function.
