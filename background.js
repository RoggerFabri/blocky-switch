// Background script for Blocky Switch extension

// Log with timestamp for better debugging
function logWithTimestamp(message, data = null) {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] ${message}`;
  
  if (data) {
    console.log(formattedMessage, data);
  } else {
    console.log(formattedMessage);
  }
}

// Update badge with current status
function updateBadge(enabled) {
  // Set badge text color to white
  chrome.action.setBadgeTextColor({ color: "#FFFFFF" }); // White text
  
  if (enabled === true) {
    chrome.action.setBadgeText({ text: "ON" });
    chrome.action.setBadgeBackgroundColor({ color: "#4ade80" }); // Green
  } else if (enabled === false) {
    chrome.action.setBadgeText({ text: "OFF" });
    chrome.action.setBadgeBackgroundColor({ color: "#f87171" }); // Red
  } else {
    // If status is unknown, clear the badge
    chrome.action.setBadgeText({ text: "" });
  }
  
  logWithTimestamp(`Badge updated: ${enabled === true ? 'ON' : enabled === false ? 'OFF' : 'unknown'}`);
}

// Log when extension is installed or updated
chrome.runtime.onInstalled.addListener((details) => {
  logWithTimestamp(`Blocky Switch extension ${details.reason}`, {
    version: chrome.runtime.getManifest().version,
    previousVersion: details.previousVersion
  });
  
  // Initialize default settings if needed
  if (details.reason === 'install') {
    chrome.storage.sync.set({ 
      'blockySwitchHost': '',
      'lastConnectionStatus': false,
      'lastBlockingStatus': null,
      'lastRefreshTime': new Date().toISOString()
    }, function() {
      logWithTimestamp('Default settings initialized');
      // Initialize badge to unknown state
      updateBadge(null);
    });
  } else {
    // Load last known status from storage and set badge
    chrome.storage.sync.get(['lastBlockingStatus'], function(data) {
      updateBadge(data.lastBlockingStatus);
    });
  }
  
  // Set badge alignment - this only needs to be done once
  if (chrome.action.setBadgeTextColor) {
    chrome.action.setBadgeTextColor({ color: "#FFFFFF" });
  }
  
  // Set badge alignment to right side
  if (chrome.action.setBadgeAlignment) {
    chrome.action.setBadgeAlignment({ alignment: 'right' });
  }
});

// Function to test connection using XMLHttpRequest to see if it works better than fetch
function testConnectionWithXHR(url) {
  return new Promise((resolve, reject) => {
    logWithTimestamp(`Testing connection with XHR: ${url}`);
    
    const xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.timeout = 10000; // 10 second timeout
    
    xhr.onreadystatechange = function() {
      if (xhr.readyState === 4) {
        logWithTimestamp(`XHR readyState 4, status: ${xhr.status}`);
        
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({
              status: xhr.status,
              statusText: xhr.statusText,
              data: data,
              headers: xhr.getAllResponseHeaders()
            });
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        } else {
          reject(new Error(`Server returned status: ${xhr.status} ${xhr.statusText}`));
        }
      }
    };
    
    xhr.ontimeout = function() {
      logWithTimestamp('XHR request timed out');
      reject(new Error('Request timed out after 10 seconds'));
    };
    
    xhr.onerror = function() {
      logWithTimestamp('XHR network error or CORS issue');
      reject(new Error('Network error or CORS issue'));
    };
    
    xhr.send();
  });
}

// Function to check status even when popup is closed
function checkStatus(host) {
  if (!host) {
    logWithTimestamp('No host provided for status check');
    return Promise.reject(new Error('No host provided'));
  }
  
  const url = `${host}/api/blocking/status`;
  logWithTimestamp(`Background checking status: ${url}`);
  
  return fetch(url, {
    method: 'GET',
    mode: 'cors',
    headers: {
      'Accept': 'application/json'
    }
  })
  .then(response => {
    if (!response.ok) {
      throw new Error(`Server returned ${response.status} ${response.statusText}`);
    }
    return response.json();
  })
  .then(data => {
    // Update badge and save status
    updateBadge(data.enabled);
    chrome.storage.sync.set({
      'lastBlockingStatus': data.enabled,
      'lastRefreshTime': new Date().toISOString()
    });
    
    return data;
  })
  .catch(error => {
    logWithTimestamp('Background status check failed', { error: error.message });
    // Try XHR as fallback
    return testConnectionWithXHR(url)
      .then(response => {
        updateBadge(response.data.enabled);
        chrome.storage.sync.set({
          'lastBlockingStatus': response.data.enabled,
          'lastRefreshTime': new Date().toISOString()
        });
        
        return response.data;
      })
      .catch(xhrError => {
        // If both methods fail, don't update badge
        logWithTimestamp('Both fetch and XHR methods failed');
        throw xhrError;
      });
  });
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'testConnection') {
    logWithTimestamp('Background script received testConnection request', message);
    
    testConnectionWithXHR(message.url)
      .then(response => {
        logWithTimestamp('XHR connection successful', response);
        
        // If this was a status check, update the badge
        if (message.url.includes('/status')) {
          updateBadge(response.data.enabled);
          chrome.storage.sync.set({
            'lastBlockingStatus': response.data.enabled,
            'lastRefreshTime': new Date().toISOString()
          });
        }
        
        sendResponse({ success: true, data: response });
      })
      .catch(error => {
        logWithTimestamp('XHR connection failed', { error: error.message });
        sendResponse({ success: false, error: error.message });
      });
    
    // Keep the message channel open for the async response
    return true;
  }
  
  if (message.action === 'updateBadge') {
    updateBadge(message.enabled);
    chrome.storage.sync.set({
      'lastBlockingStatus': message.enabled,
      'lastRefreshTime': new Date().toISOString()
    });
    sendResponse({ success: true });
    return false;
  }
  
  if (message.action === 'checkStatus') {
    checkStatus(message.host)
      .then(data => {
        sendResponse({ success: true, data: data });
      })
      .catch(error => {
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Create an alarm to check status periodically
chrome.alarms.create('checkStatus', {
  periodInMinutes: 0.5, // Check every 30 seconds
  delayInMinutes: 0 // Start immediately
});

// Listen for alarm
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'checkStatus') {
    chrome.storage.sync.get(['blockySwitchHost'], function(data) {
      if (data.blockySwitchHost) {
        checkStatus(data.blockySwitchHost).catch(error => {
          // Log errors but don't do anything else
          logWithTimestamp('Periodic status check failed', { error: error.message });
        });
      }
    });
  }
}); 