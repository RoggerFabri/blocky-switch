# Blocky Switch

<div align="center">
  <img src="images/icon128.png" alt="Blocky Switch Icon" width="128">
</div>
</br>

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/ijljpfdmompfofnlgknfnihmpplieamb?label=Chrome%20Web%20Store)](https://chromewebstore.google.com/detail/blocky-switch/ijljpfdmompfofnlgknfnihmpplieamb)

A simple Chrome extension to enable or disable blocking on a [Blocky DNS](https://0xerr0r.github.io/blocky/latest/) server.

## About

This extension was created to provide easy access to the API of [Blocky DNS](https://0xerr0r.github.io/blocky/latest/), a DNS proxy, DNS blocker, and DoH/DoT server for the local network. Full credit for Blocky DNS goes to its author [0xERR0R](https://github.com/0xERR0R). This extension is not affiliated with the Blocky DNS project but aims to enhance its usability for users who want quick access to enable or disable blocking.

## Features

- Manage **multiple Blocky hosts** — each with its own independent toggle
- Toggle blocking on/off per host with a simple switch
- **All** row at the top — one toggle and one set of shortcuts to control every host at once
- Quick temporary disable buttons: **1m, 5m, 30m, 1h, 2h, 6h, 12h, 24h** (available both in the All row and per-host)
- Host cards are **collapsed by default** — click the chevron `›` to expand per-host shortcuts for fine-grained control
- **Re-enable countdown** shown on each card after a temporary disable (⏱ Re-enables in ~4:32)
- Toolbar badge shows current status at a glance without opening the popup
- Background monitoring keeps the status up to date even when the popup is closed

## Installation

1. Clone this repository or download the files
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

## Usage

1. Click the Blocky Switch icon in the Chrome toolbar
2. Enter your Blocky server host URL (e.g., `http://192.168.1.1:4000`) and click **Add**
3. Chrome will ask for permission to access that host — click **Allow**
4. Use the **All** toggle to enable or disable blocking on every host at once, or use the **All** shortcuts row to temporarily disable all hosts for a set duration
5. Click the chevron `›` on any host card to expand per-host controls for fine-grained individual control
6. A countdown timer appears on each card showing when temporary blocking will re-enable
7. Repeat to add more hosts (e.g., home server, work VPN)

The toolbar badge reflects the combined state across all hosts:

| Badge        | Meaning                                |
| ------------ | -------------------------------------- |
| `ON` (green) | All hosts have blocking enabled        |
| `OFF` (red)  | All hosts have blocking disabled       |
| `~` (orange) | Mixed — some hosts on, some off        |
| _(blank)_    | No hosts configured, or status unknown |

## Permissions

The extension requests access only to the specific host URLs you add — not to all websites. Chrome will prompt you when you save a new host.

## API Endpoints

The extension uses the following Blocky DNS API endpoints:

- `GET {host}/api/blocking/status` — get the current blocking status
- `GET {host}/api/blocking/enable` — enable blocking
- `GET {host}/api/blocking/disable` — disable blocking
- `GET {host}/api/blocking/disable?duration=300s` — temporarily disable for the given duration (in seconds)

## Troubleshooting

If you encounter connection issues:

1. Make sure the host URL includes the protocol (`http://` or `https://`)
2. Verify the host is reachable from your browser
3. Check that your Blocky server has CORS configured correctly
4. Check the browser console for detailed error messages (right-click the popup → **Inspect**)

## Background Monitoring

The extension periodically checks the blocking status in the background, even when the popup is closed. This keeps the badge on the toolbar icon accurate.

- Status is checked every **1 minute** in the background (via Chrome alarm)
- Status is refreshed every **10 seconds** while the popup is open
