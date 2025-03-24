# Blocky Switch

A simple Chrome extension to enable or disable blocking on a [Blocky DNS](https://0xerr0r.github.io/blocky/latest/) server.

## About

This extension was created to provide easy access to the API of [Blocky DNS](https://0xerr0r.github.io/blocky/latest/), a DNS proxy, DNS blocker, and DoH/DoT server for the local network. Full credit for Blocky DNS goes to its author [0xERR0R](https://github.com/0xERR0R). This extension is not affiliated with the Blocky DNS project but aims to enhance its usability for users who want quick access to enable or disable blocking.

## Features

- Toggle blocking on/off with a simple switch
- Configure the host URL for your Blocky server
- View current connection and blocking status
- Toolbar badge shows current status at a glance without opening the popup
- Background monitoring keeps the status up to date even when popup is closed

## Installation

1. Clone this repository or download the files
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right corner
4. Click "Load unpacked" and select the extension directory

## Usage

1. Click the Blocky Switch icon in the Chrome toolbar
2. Enter your Blocky server host URL (e.g., `http://localhost:8080`)
3. Use the toggle switch to enable or disable blocking
4. The extension icon in the toolbar will show a badge with the current status:
   - ON (green): Blocking is enabled
   - OFF (red): Blocking is disabled

## API Endpoints

The extension uses the following API endpoints from the Blocky DNS server:

- `GET {host}/api/blocking/status` - Get the current blocking status
- `GET {host}/api/blocking/enable` - Enable blocking
- `GET {host}/api/blocking/disable` - Disable blocking

## Troubleshooting

If you encounter connection issues:

1. Make sure the API paths include `/api/` in the URL
2. Check if your server has CORS configured correctly
3. Verify the host URL is correct and accessible
4. Check the browser console for detailed error messages

## Background Monitoring

The extension periodically checks the blocking status in the background, even when the popup is closed. This ensures the badge on the toolbar icon always shows the current status.

- Status is checked every 30 seconds in the background
- Status is checked every 5 seconds when the popup is open
- The badge will display "ON" (green) when blocking is enabled or "OFF" (red) when disabled 