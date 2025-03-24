document.addEventListener('DOMContentLoaded', function() {
  const hostInput = document.getElementById('host');
  const blockingToggle = document.getElementById('blocking-toggle');
  const blockingStatus = document.getElementById('blocking-status');
  const statusDot = document.getElementById('status-dot');
  const connectionStatus = document.getElementById('connection-status');

  // Load saved host from storage
  chrome.storage.sync.get(['blockySwitchHost', 'lastBlockingStatus'], function(data) {
    if (data.blockySwitchHost) {
      hostInput.value = data.blockySwitchHost;
      
      // If we have a cached status, show it while we check for updates
      if (data.lastBlockingStatus !== null && data.lastBlockingStatus !== undefined) {
        updateBlockingUI(data.lastBlockingStatus);
      }
      
      checkBlockingStatus();
    }
  });

  // Save host when changed
  hostInput.addEventListener('change', function() {
    chrome.storage.sync.set({ 'blockySwitchHost': hostInput.value });
    checkBlockingStatus();
  });

  // Real-time validation for host input
  hostInput.addEventListener('input', function() {
    const host = hostInput.value.trim();
    if (host && !host.startsWith('http://') && !host.startsWith('https://')) {
      hostInput.classList.add('invalid-host');
    } else {
      hostInput.classList.remove('invalid-host');
    }
  });

  // Toggle blocking when switch is clicked
  blockingToggle.addEventListener('change', function() {
    // Show loading state while the request is in progress
    blockingStatus.textContent = '...';
    
    if (blockingToggle.checked) {
      enableBlocking();
    } else {
      disableBlocking();
    }
  });

  // Check the blocking status
  function checkBlockingStatus() {
    const host = hostInput.value.trim();
    if (!host) {
      updateConnectionStatus(false);
      return;
    }

    // Add loading indicator while checking
    connectionStatus.textContent = 'Connecting...';
    statusDot.classList.remove('online', 'offline');
    statusDot.classList.add('connecting');

    console.log(`Checking status: ${host}/api/blocking/status`);
    
    fetch(`${host}/api/blocking/status`, { 
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      updateConnectionStatus(true);
      updateBlockingUI(data.enabled);
      // Update badge in background script
      updateBadgeStatus(data.enabled);
    })
    .catch(fetchError => {
      console.error('Connection error:', fetchError.message);
      
      // Try with background script as fallback
      chrome.runtime.sendMessage(
        { action: 'testConnection', url: `${host}/api/blocking/status` },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            updateConnectionStatus(false);
            return;
          }
          
          updateConnectionStatus(true);
          updateBlockingUI(response.data.data.enabled);
          // Update badge in background script
          updateBadgeStatus(response.data.data.enabled);
        }
      );
    });
  }

  // Update badge status in the background script
  function updateBadgeStatus(enabled) {
    chrome.runtime.sendMessage(
      { action: 'updateBadge', enabled: enabled },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('Error updating badge:', chrome.runtime.lastError);
        }
      }
    );
  }

  // Enable blocking
  function enableBlocking() {
    const host = hostInput.value.trim();
    if (!host) {
      console.error('Please enter a valid host URL');
      blockingToggle.checked = false;
      updateBlockingUI(false);
      updateBadgeStatus(false);
      return;
    }

    console.log(`Enabling blocking at: ${host}/api/blocking/enable`);
    
    fetch(`${host}/api/blocking/enable`, { 
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      updateBlockingUI(true);
      updateBadgeStatus(true);
    })
    .catch(fetchError => {
      console.error('Enable error:', fetchError.message);
      
      // Try with background script as fallback
      chrome.runtime.sendMessage(
        { action: 'testConnection', url: `${host}/api/blocking/enable` },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            updateBlockingUI(false);
            updateBadgeStatus(false);
            return;
          }
          
          updateBlockingUI(true);
          updateBadgeStatus(true);
        }
      );
    });
  }

  // Disable blocking
  function disableBlocking() {
    const host = hostInput.value.trim();
    if (!host) {
      console.error('Please enter a valid host URL');
      blockingToggle.checked = true;
      updateBlockingUI(true);
      updateBadgeStatus(true);
      return;
    }

    console.log(`Disabling blocking at: ${host}/api/blocking/disable`);
    
    fetch(`${host}/api/blocking/disable`, { 
      method: 'GET',
      mode: 'cors',
      headers: {
        'Accept': 'application/json',
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      updateBlockingUI(false);
      updateBadgeStatus(false);
    })
    .catch(fetchError => {
      console.error('Disable error:', fetchError.message);
      
      // Try with background script as fallback
      chrome.runtime.sendMessage(
        { action: 'testConnection', url: `${host}/api/blocking/disable` },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            updateBlockingUI(true);
            updateBadgeStatus(true);
            return;
          }
          
          updateBlockingUI(false);
          updateBadgeStatus(false);
        }
      );
    });
  }

  // Update the UI based on blocking status
  function updateBlockingUI(enabled) {
    blockingToggle.checked = enabled;
    
    // Animate the status change
    blockingStatus.classList.add('status-changing');
    
    setTimeout(() => {
      blockingStatus.textContent = enabled ? 'On' : 'Off';
      blockingStatus.className = 'status ' + (enabled ? 'status-on' : 'status-off');
      blockingStatus.classList.remove('status-changing');
    }, 150);
  }

  // Update connection status indicator
  function updateConnectionStatus(connected) {
    // Remove connecting state
    statusDot.classList.remove('connecting');
    
    if (connected) {
      statusDot.classList.add('online');
      statusDot.classList.remove('offline');
      connectionStatus.textContent = 'Connected';
    } else {
      statusDot.classList.add('offline');
      statusDot.classList.remove('online');
      connectionStatus.textContent = 'Not connected';
    }
  }

  // Auto refresh status every 5 seconds
  setInterval(checkBlockingStatus, 5000);
}); 