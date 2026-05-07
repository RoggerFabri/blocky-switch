const DISABLE_SHORTCUTS = [
  { label: '1m',  seconds: 60 },
  { label: '5m',  seconds: 300 },
  { label: '30m', seconds: 1800 },
  { label: '1h',  seconds: 3600 },
  { label: '2h',  seconds: 7200 },
  { label: '6h',  seconds: 21600 },
  { label: '12h', seconds: 43200 },
  { label: '24h', seconds: 86400 },
];

document.addEventListener('DOMContentLoaded', function () {
  const hostList        = document.getElementById('host-list');
  const emptyState      = document.getElementById('empty-state');
  const addHostInput    = document.getElementById('add-host-input');
  const addHostBtn      = document.getElementById('add-host-btn');
  const addHostHint     = document.getElementById('add-host-hint');
  const globalError     = document.getElementById('error-message');
  const allToggleRow    = document.getElementById('all-toggle-row');
  const allToggle       = document.getElementById('all-toggle');
  const allBlockingLabel = document.getElementById('all-blocking-label');
  const allShortcuts    = document.getElementById('all-shortcuts');

  let hosts         = [];  // string[] — ordered list of host URLs
  let hostStatuses  = {};  // { [url]: true | false | undefined }
  let disableTimers = {};  // { [url]: { expiresAt: timestamp } }

  // ── Utilities ─────────────────────────────────────────────────────────────

  function normalizeHost(url) {
    return url.trim().replace(/\/+$/, '');
  }

  function showGlobalError(msg) {
    globalError.textContent = msg;
    globalError.style.display = 'block';
  }

  function clearGlobalError() {
    globalError.textContent = '';
    globalError.style.display = 'none';
  }

  function showAddHint(msg) {
    addHostHint.textContent = msg;
    addHostHint.style.display = 'block';
  }

  function clearAddHint() {
    addHostHint.style.display = 'none';
  }

  // Intentionally duplicated from background.js — both contexts need it independently.
  function computeAggregate() {
    const known = hosts.map(h => hostStatuses[h]).filter(v => v === true || v === false);
    if (known.length === 0) return null;
    const anyOn  = known.some(v => v === true);
    const anyOff = known.some(v => v === false);
    if (anyOn && anyOff) return 'mixed';
    return anyOn ? 'on' : 'off';
  }

  function recomputeAndUpdateBadge() {
    chrome.runtime.sendMessage({ action: 'updateBadge', state: computeAggregate() }, () => {
      if (chrome.runtime.lastError) {
        console.error('Badge update failed:', chrome.runtime.lastError.message);
      }
    });
    updateAllToggle();
  }

  function updateAllToggle() {
    if (hosts.length === 0) {
      allToggleRow.style.display = 'none';
      return;
    }
    allToggleRow.style.display = 'block';
    const state = computeAggregate();
    allToggle.disabled = false;

    if (state === 'on') {
      allToggle.checked = true;
      allBlockingLabel.textContent = 'On';
      allBlockingLabel.className = 'all-blocking-label label-on';
    } else if (state === 'off') {
      allToggle.checked = false;
      allBlockingLabel.textContent = 'Off';
      allBlockingLabel.className = 'all-blocking-label label-off';
    } else if (state === 'mixed') {
      allToggle.checked = false;
      allBlockingLabel.textContent = '~';
      allBlockingLabel.className = 'all-blocking-label label-mixed';
    } else {
      allToggle.checked = false;
      allBlockingLabel.textContent = '--';
      allBlockingLabel.className = 'all-blocking-label';
    }
  }

  function saveHosts() {
    chrome.storage.sync.set({ blockySwitchHosts: hosts }, () => {
      if (chrome.runtime.lastError) console.error('Failed to save hosts:', chrome.runtime.lastError.message);
    });
  }

  function saveStatuses() {
    chrome.storage.sync.set({ lastBlockingStatuses: hostStatuses }, () => {
      if (chrome.runtime.lastError) console.error('Failed to save statuses:', chrome.runtime.lastError.message);
    });
  }

  function saveTimer(host, expiresAt) {
    disableTimers[host] = { expiresAt };
    chrome.storage.local.get(['disableTimers'], (data) => {
      const timers = data.disableTimers || {};
      timers[host] = { expiresAt };
      chrome.storage.local.set({ disableTimers: timers });
    });
  }

  function clearTimer(host) {
    delete disableTimers[host];
    chrome.storage.local.get(['disableTimers'], (data) => {
      const timers = data.disableTimers || {};
      delete timers[host];
      chrome.storage.local.set({ disableTimers: timers });
    });
    const card = getCard(host);
    if (card) card.querySelector('.host-timer').style.display = 'none';
  }

  function formatCountdown(ms) {
    const totalSecs = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function updateCountdowns() {
    const now = Date.now();
    hosts.forEach(host => {
      const timer = disableTimers[host];
      if (!timer) return;
      const card = getCard(host);
      if (!card) return;
      const timerEl = card.querySelector('.host-timer');
      const remaining = timer.expiresAt - now;
      if (remaining <= 0) {
        clearTimer(host);
      } else {
        timerEl.textContent = `⏱ Re-enables in ~${formatCountdown(remaining)}`;
        timerEl.style.display = 'block';
      }
    });
  }

  // ── Card DOM helpers ───────────────────────────────────────────────────────

  function getCard(host) {
    return hostList.querySelector(`[data-host="${CSS.escape(host)}"]`);
  }

  function setDotState(card, state) {
    const dot = card.querySelector('.status-dot');
    dot.classList.remove('online', 'offline', 'connecting');
    if (state) dot.classList.add(state);
  }

  function setCardBusy(card, busy) {
    card.querySelector('.host-toggle').disabled = busy;
    card.querySelectorAll('.host-shortcuts .shortcut-btn').forEach(btn => btn.disabled = busy);
  }

  function updateCardUI(card, enabled) {
    const toggle = card.querySelector('.host-toggle');
    const label  = card.querySelector('.host-blocking-label');

    toggle.checked = enabled === true;
    setCardBusy(card, false);
    if (enabled === true) clearTimer(card.dataset.host);

    setTimeout(() => {
      if (enabled === true) {
        label.textContent = 'On';
        label.className = 'host-blocking-label label-on';
      } else if (enabled === false) {
        label.textContent = 'Off';
        label.className = 'host-blocking-label label-off';
      } else {
        label.textContent = '--';
        label.className = 'host-blocking-label';
      }
    }, 150);
  }

  function showCardError(card, msg) {
    const err = card.querySelector('.card-error');
    err.textContent = msg;
    err.style.display = 'block';
    setTimeout(() => { err.style.display = 'none'; }, 4000);
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  function renderHosts() {
    hostList.innerHTML = '';
    emptyState.style.display = hosts.length === 0 ? 'block' : 'none';
    hosts.forEach(host => hostList.appendChild(createHostCard(host)));
    updateAllToggle();
  }

  function createHostCard(host) {
    const cached = hostStatuses[host];
    const isOn   = cached === true;
    const isOff  = cached === false;

    // Show host:port without protocol — full URL visible on hover via title
    let displayText = host;
    try { displayText = new URL(host).host; } catch {}

    const card = document.createElement('div');
    card.className = 'host-card';
    card.dataset.host = host;

    card.innerHTML = `
      <div class="host-card-main">
        <div class="status-dot${cached === undefined ? '' : isOn ? ' online' : ' offline'}"></div>
        <span class="host-url" title="${host}">${displayText}</span>
        <span class="host-blocking-label${isOn ? ' label-on' : isOff ? ' label-off' : ''}">${isOn ? 'On' : isOff ? 'Off' : '--'}</span>
        <label class="toggle-switch" aria-label="Toggle blocking">
          <input type="checkbox" class="host-toggle"${isOn ? ' checked' : ''}>
          <span class="slider"></span>
        </label>
        <button class="host-expand-btn" title="Expand" aria-label="Expand host options">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>
        <button class="host-remove-btn" title="Remove" aria-label="Remove host">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
          </svg>
        </button>
      </div>
      <div class="host-timer" style="display:none"></div>
      <div class="host-shortcuts" style="display:none">
        ${DISABLE_SHORTCUTS.map(s => `<button class="shortcut-btn" data-seconds="${s.seconds}">${s.label}</button>`).join('')}
      </div>
      <span class="card-error" style="display:none"></span>
    `;

    card.querySelector('.host-expand-btn').addEventListener('click', () => {
      card.classList.toggle('expanded');
      const shortcuts = card.querySelector('.host-shortcuts');
      shortcuts.style.display = card.classList.contains('expanded') ? 'grid' : 'none';
    });

    card.querySelector('.host-toggle').addEventListener('change', function () {
      setCardBusy(card, true);
      card.querySelector('.host-blocking-label').textContent = '...';
      if (this.checked) {
        enableBlocking(host, card);
      } else {
        disableBlocking(host, card);
      }
    });

    card.querySelector('.host-remove-btn').addEventListener('click', () => removeHost(host));
    card.querySelectorAll('.host-shortcuts .shortcut-btn').forEach(btn => {
      btn.addEventListener('click', () => temporaryDisable(host, parseInt(btn.dataset.seconds), card));
    });

    return card;
  }

  // ── Status checking ────────────────────────────────────────────────────────

  function checkHostStatus(host) {
    const card = getCard(host);
    if (!card) return;

    // Only show loading state on first check — silent refresh otherwise to avoid blinking
    if (hostStatuses[host] === undefined) {
      setDotState(card, 'connecting');
      card.querySelector('.host-blocking-label').textContent = '...';
    }

    fetch(`${host}/api/blocking/status`, {
      method: 'GET',
      mode: 'cors',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => {
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      return res.json();
    })
    .then(data => {
      setDotState(card, 'online');
      hostStatuses[host] = data.enabled;
      updateCardUI(card, data.enabled);
      saveStatuses();
      recomputeAndUpdateBadge();
    })
    .catch(() => {
      // Fallback: route through background service worker (handles some CORS scenarios)
      chrome.runtime.sendMessage(
        { action: 'testConnection', url: `${host}/api/blocking/status` },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            setDotState(card, 'offline');
            setCardBusy(card, false);
            card.querySelector('.host-blocking-label').textContent = '?';
            return;
          }
          setDotState(card, 'online');
          // response.data is the XHR wrapper: { status, statusText, data: {enabled}, headers }
          hostStatuses[host] = response.data.data.enabled;
          updateCardUI(card, response.data.data.enabled);
          saveStatuses();
          recomputeAndUpdateBadge();
        }
      );
    });
  }

  // ── Blocking actions ───────────────────────────────────────────────────────

  function enableBlocking(host, card) {
    fetch(`${host}/api/blocking/enable`, {
      method: 'GET',
      mode: 'cors',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => {
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      hostStatuses[host] = true;
      setDotState(card, 'online');
      updateCardUI(card, true);
      saveStatuses();
      recomputeAndUpdateBadge();
    })
    .catch(() => {
      chrome.runtime.sendMessage(
        { action: 'testConnection', url: `${host}/api/blocking/enable` },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            showCardError(card, 'Failed to enable blocking');
            hostStatuses[host] = false;
            updateCardUI(card, false);
            return;
          }
          hostStatuses[host] = true;
          setDotState(card, 'online');
          updateCardUI(card, true);
          saveStatuses();
          recomputeAndUpdateBadge();
        }
      );
    });
  }

  function disableBlocking(host, card) {
    fetch(`${host}/api/blocking/disable`, {
      method: 'GET',
      mode: 'cors',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => {
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      hostStatuses[host] = false;
      setDotState(card, 'online');
      updateCardUI(card, false);
      saveStatuses();
      recomputeAndUpdateBadge();
    })
    .catch(() => {
      chrome.runtime.sendMessage(
        { action: 'testConnection', url: `${host}/api/blocking/disable` },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            showCardError(card, 'Failed to disable blocking');
            hostStatuses[host] = true;
            updateCardUI(card, true);
            return;
          }
          hostStatuses[host] = false;
          setDotState(card, 'online');
          updateCardUI(card, false);
          saveStatuses();
          recomputeAndUpdateBadge();
        }
      );
    });
  }

  function temporaryDisable(host, seconds, card) {
    setCardBusy(card, true);

    fetch(`${host}/api/blocking/disable?duration=${seconds}s`, {
      method: 'GET',
      mode: 'cors',
      headers: { 'Accept': 'application/json' }
    })
    .then(res => {
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      hostStatuses[host] = false;
      saveTimer(host, Date.now() + seconds * 1000);
      setDotState(card, 'online');
      updateCardUI(card, false);
      saveStatuses();
      recomputeAndUpdateBadge();
    })
    .catch(() => {
      chrome.runtime.sendMessage(
        { action: 'testConnection', url: `${host}/api/blocking/disable?duration=${seconds}s` },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            showCardError(card, 'Could not reach the Blocky server');
            setCardBusy(card, false);
            return;
          }
          hostStatuses[host] = false;
          saveTimer(host, Date.now() + seconds * 1000);
          setDotState(card, 'online');
          updateCardUI(card, false);
          saveStatuses();
          recomputeAndUpdateBadge();
        }
      );
    });
  }

  function disableAllTemporary(seconds) {
    const btns = allShortcuts.querySelectorAll('.shortcut-btn');
    btns.forEach(b => b.disabled = true);
    allToggle.disabled = true;

    const pending = hosts.map(host => {
      const card = getCard(host);
      if (card) setCardBusy(card, true);
      return fetch(`${host}/api/blocking/disable?duration=${seconds}s`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      })
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        hostStatuses[host] = false;
        saveTimer(host, Date.now() + seconds * 1000);
        if (card) { setDotState(card, 'online'); updateCardUI(card, false); }
      })
      .catch(() => new Promise(resolve => {
        chrome.runtime.sendMessage(
          { action: 'testConnection', url: `${host}/api/blocking/disable?duration=${seconds}s` },
          (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              if (card) { showCardError(card, 'Could not reach the Blocky server'); setCardBusy(card, false); }
            } else {
              hostStatuses[host] = false;
              saveTimer(host, Date.now() + seconds * 1000);
              if (card) { setDotState(card, 'online'); updateCardUI(card, false); }
            }
            resolve();
          }
        );
      }));
    });

    Promise.allSettled(pending).then(() => {
      btns.forEach(b => b.disabled = false);
      allToggle.disabled = false;
      saveStatuses();
      recomputeAndUpdateBadge();
    });
  }

  // ── Host management ────────────────────────────────────────────────────────

  function addHost(rawUrl) {
    const url = normalizeHost(rawUrl);
    if (!url) return;

    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      showAddHint('Must start with http:// or https://');
      return;
    }

    let origin;
    try {
      origin = new URL(url).origin + '/*';
    } catch {
      showAddHint('Invalid URL format.');
      return;
    }

    if (hosts.includes(url)) {
      showAddHint('This host is already in the list.');
      return;
    }

    chrome.permissions.request({ origins: [origin] }, (granted) => {
      if (!granted) {
        showGlobalError('Permission denied. Cannot connect to that host.');
        return;
      }
      hosts.push(url);
      saveHosts();
      clearAddHint();
      clearGlobalError();
      addHostInput.value = '';
      addHostInput.classList.remove('invalid-host');
      renderHosts();
      checkHostStatus(url);
    });
  }

  function removeHost(host) {
    hosts = hosts.filter(h => h !== host);
    delete hostStatuses[host];
    saveHosts();
    saveStatuses();
    try {
      const origin = new URL(host).origin + '/*';
      chrome.permissions.remove({ origins: [origin] });
    } catch {}
    renderHosts();
    recomputeAndUpdateBadge();
  }

  // ── Add-host UI ────────────────────────────────────────────────────────────

  addHostBtn.addEventListener('click', () => addHost(addHostInput.value.trim()));

  addHostInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addHost(addHostInput.value.trim());
  });

  addHostInput.addEventListener('input', () => {
    const val = addHostInput.value.trim();
    if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
      addHostInput.classList.add('invalid-host');
    } else {
      addHostInput.classList.remove('invalid-host');
      clearAddHint();
    }
  });

  // ── All-hosts toggle ──────────────────────────────────────────────────────

  allToggle.addEventListener('change', function () {
    allToggle.disabled = true;
    allBlockingLabel.textContent = '...';
    allBlockingLabel.className = 'all-blocking-label';

    const action = allToggle.checked ? 'enable' : 'disable';
    const pending = hosts.map(host => {
      const card = getCard(host);
      if (card) setCardBusy(card, true);
      return fetch(`${host}/api/blocking/${action}`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      })
      .then(res => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        hostStatuses[host] = allToggle.checked;
        if (action === 'enable') clearTimer(host);
        if (card) { setDotState(card, 'online'); updateCardUI(card, allToggle.checked); }
      })
      .catch(() => {
        chrome.runtime.sendMessage(
          { action: 'testConnection', url: `${host}/api/blocking/${action}` },
          (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
              if (card) { showCardError(card, `Failed to ${action} blocking`); setCardBusy(card, false); }
              return;
            }
            hostStatuses[host] = allToggle.checked;
            if (action === 'enable') clearTimer(host);
            if (card) { setDotState(card, 'online'); updateCardUI(card, allToggle.checked); }
          }
        );
      });
    });

    Promise.allSettled(pending).then(() => {
      saveStatuses();
      recomputeAndUpdateBadge();
    });
  });

  // ── All-hosts shortcuts ────────────────────────────────────────────────────

  DISABLE_SHORTCUTS.forEach(s => {
    const btn = document.createElement('button');
    btn.className = 'shortcut-btn';
    btn.dataset.seconds = s.seconds;
    btn.textContent = s.label;
    btn.addEventListener('click', () => disableAllTemporary(s.seconds));
    allShortcuts.appendChild(btn);
  });

  // ── Initialization ─────────────────────────────────────────────────────────

  async function loadHosts() {
    const all = await new Promise(resolve => chrome.storage.sync.get(null, resolve));

    if (!('blockySwitchHosts' in all) && ('blockySwitchHost' in all)) {
      // Inline migration from v1 format (in case background onInstalled hasn't fired yet)
      const oldHost = normalizeHost(all.blockySwitchHost || '');
      hosts = oldHost ? [oldHost] : [];
      hostStatuses = {};
      if (oldHost && (all.lastBlockingStatus === true || all.lastBlockingStatus === false)) {
        hostStatuses[oldHost] = all.lastBlockingStatus;
      }
      chrome.storage.sync.set({ blockySwitchHosts: hosts, lastBlockingStatuses: hostStatuses });
      chrome.storage.sync.remove(['blockySwitchHost', 'lastBlockingStatus', 'lastConnectionStatus']);
    } else {
      hosts = all.blockySwitchHosts || [];
      hostStatuses = all.lastBlockingStatuses || {};
    }

    // Load timers from local storage and drop any that already expired
    const local = await new Promise(resolve => chrome.storage.local.get(['disableTimers'], resolve));
    const now = Date.now();
    disableTimers = Object.fromEntries(
      Object.entries(local.disableTimers || {}).filter(([, t]) => t.expiresAt > now)
    );

    renderHosts();
    hosts.forEach(host => checkHostStatus(host));
    updateCountdowns(); // paint immediately so there's no 1s blank flash
  }

  loadHosts();
  setInterval(() => hosts.forEach(checkHostStatus), 10000);
  setInterval(updateCountdowns, 1000);
});
