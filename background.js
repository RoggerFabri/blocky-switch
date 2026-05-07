// Background script for Blocky Switch extension

function logWithTimestamp(message, data = null) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}`;
  if (data) {
    console.log(formattedMessage, data);
  } else {
    console.log(formattedMessage);
  }
}

/**
 * Compute aggregate badge state from per-host statuses.
 * Intentionally duplicated in popup.js — both files need it independently.
 * @param {Object.<string, boolean|null>} statuses
 * @param {string[]} hosts
 * @returns {'on' | 'off' | 'mixed' | null}
 */
function computeAggregate(statuses, hosts) {
  if (!hosts || hosts.length === 0) return null;
  const known = hosts.map(h => statuses[h]).filter(v => v === true || v === false);
  if (known.length === 0) return null;
  const anyOn  = known.some(v => v === true);
  const anyOff = known.some(v => v === false);
  if (anyOn && anyOff) return 'mixed';
  return anyOn ? 'on' : 'off';
}

/**
 * @param {'on' | 'off' | 'mixed' | null} state
 */
function updateBadge(state) {
  chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
  switch (state) {
    case 'on':
      chrome.action.setBadgeText({ text: 'ON' });
      chrome.action.setBadgeBackgroundColor({ color: '#4ade80' }); // green
      break;
    case 'off':
      chrome.action.setBadgeText({ text: 'OFF' });
      chrome.action.setBadgeBackgroundColor({ color: '#f87171' }); // red
      break;
    case 'mixed':
      chrome.action.setBadgeText({ text: '~' });
      chrome.action.setBadgeBackgroundColor({ color: '#fb923c' }); // orange
      break;
    default:
      chrome.action.setBadgeText({ text: '' });
      break;
  }
  logWithTimestamp(`Badge updated: ${state ?? 'blank'}`);
}

chrome.runtime.onInstalled.addListener((details) => {
  logWithTimestamp(`Blocky Switch extension ${details.reason}`, {
    version: chrome.runtime.getManifest().version,
    previousVersion: details.previousVersion
  });

  if (details.reason === 'install') {
    chrome.storage.sync.set({
      blockySwitchHosts: [],
      lastBlockingStatuses: {},
      lastRefreshTime: new Date().toISOString()
    }, () => {
      logWithTimestamp('Default settings initialized');
      updateBadge(null);
    });
    return;
  }

  // On update: migrate from v1 storage schema if needed
  chrome.storage.sync.get(null, (all) => {
    const needsMigration = ('blockySwitchHost' in all) && !('blockySwitchHosts' in all);

    if (!needsMigration) {
      const statuses = all.lastBlockingStatuses || {};
      const hosts = all.blockySwitchHosts || [];
      updateBadge(computeAggregate(statuses, hosts));
      return;
    }

    const oldHost = (all.blockySwitchHost || '').trim().replace(/\/+$/, '');
    const newHosts = oldHost ? [oldHost] : [];
    const newStatuses = {};
    if (oldHost && (all.lastBlockingStatus === true || all.lastBlockingStatus === false)) {
      newStatuses[oldHost] = all.lastBlockingStatus;
    }

    chrome.storage.sync.set({
      blockySwitchHosts: newHosts,
      lastBlockingStatuses: newStatuses,
      lastRefreshTime: new Date().toISOString()
    }, () => {
      chrome.storage.sync.remove(
        ['blockySwitchHost', 'lastBlockingStatus', 'lastConnectionStatus'],
        () => {
          logWithTimestamp('Migrated v1 → v2 storage schema');
          updateBadge(computeAggregate(newStatuses, newHosts));
        }
      );
    });
  });
});

function testConnectionWithXHR(url) {
  return new Promise((resolve, reject) => {
    logWithTimestamp(`Testing connection with XHR: ${url}`);
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = 10000;

    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        logWithTimestamp(`XHR readyState 4, status: ${xhr.status}`);
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({ status: xhr.status, statusText: xhr.statusText, data, headers: xhr.getAllResponseHeaders() });
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        } else {
          reject(new Error(`Server returned status: ${xhr.status} ${xhr.statusText}`));
        }
      }
    };

    xhr.ontimeout = () => { logWithTimestamp('XHR timed out'); reject(new Error('Request timed out after 10 seconds')); };
    xhr.onerror  = () => { logWithTimestamp('XHR network error'); reject(new Error('Network error or CORS issue')); };
    xhr.onabort  = () => reject(new Error('Request aborted'));
    xhr.send();
  });
}

/**
 * Fetch blocking status for a single host. Pure — no side effects.
 * @returns {Promise<{enabled: boolean}>}
 */
async function checkStatus(host) {
  if (!host) throw new Error('No host provided');

  const url = `${host}/api/blocking/status`;
  logWithTimestamp(`Background checking status: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      headers: { 'Accept': 'application/json' }
    });
    if (!response.ok) throw new Error(`Server returned ${response.status} ${response.statusText}`);
    return await response.json();
  } catch (fetchErr) {
    logWithTimestamp('fetch failed, trying XHR fallback', { error: fetchErr.message });
    const xhrResult = await testConnectionWithXHR(url);
    return xhrResult.data;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'testConnection') {
    logWithTimestamp('testConnection request received', { url: message.url });
    testConnectionWithXHR(message.url)
      .then(response => {
        logWithTimestamp('XHR connection successful');
        sendResponse({ success: true, data: response });
      })
      .catch(error => {
        logWithTimestamp('XHR connection failed', { error: error.message });
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }

  if (message.action === 'updateBadge') {
    updateBadge(message.state); // 'on' | 'off' | 'mixed' | null
    chrome.storage.sync.set({ lastRefreshTime: new Date().toISOString() });
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'checkStatus') {
    checkStatus(message.host)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Create the alarm only if it doesn't already exist — module-level code runs on
// every service worker wake-up, so calling create unconditionally would reset the
// timer on each wake and fire spurious immediate checks.
chrome.alarms.get('checkStatus', (alarm) => {
  if (!alarm) {
    chrome.alarms.create('checkStatus', { periodInMinutes: 1 });
  }
});

// Check all configured hosts on each alarm tick
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'checkStatus') return;

  const { blockySwitchHosts: hosts = [], lastBlockingStatuses: statuses = {} } =
    await chrome.storage.sync.get(['blockySwitchHosts', 'lastBlockingStatuses']);

  if (hosts.length === 0) {
    updateBadge(null);
    return;
  }

  const results = await Promise.allSettled(
    hosts.map(host => checkStatus(host).then(data => ({ host, enabled: data.enabled })))
  );

  const updatedStatuses = { ...statuses };
  for (const result of results) {
    if (result.status === 'fulfilled') {
      updatedStatuses[result.value.host] = result.value.enabled;
    } else {
      logWithTimestamp('Alarm status check failed for a host', { reason: result.reason?.message });
      // Preserve last known value — don't overwrite with null on transient errors
    }
  }

  await chrome.storage.sync.set({
    lastBlockingStatuses: updatedStatuses,
    lastRefreshTime: new Date().toISOString()
  });

  updateBadge(computeAggregate(updatedStatuses, hosts));
});
