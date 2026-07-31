/**
 * === popup.js ===
 * Jira Mention Notifier - Popup View Controller
 * 
 * Handles popup initialization, notification history rendering, manual background sync triggers,
 * connection status indicator updates, and theme toggling.
 * 
 * @module popup/popup
 */

document.addEventListener('DOMContentLoaded', async () => {
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const lastSyncTime = document.getElementById('lastSyncTime');
  const notificationList = document.getElementById('notificationList');
  const unreadBadge = document.getElementById('unreadBadge');
  const btnSync = document.getElementById('btnSync');
  const btnOpenJira = document.getElementById('btnOpenJira');
  const btnSettings = document.getElementById('btnSettings');
  const btnClearHistory = document.getElementById('btnClearHistory');

  let currentServerUrl = '';

  /**
   * Initializes the Popup view by requesting background status.
   */
  async function loadStatus() {
    try {
      setSyncingState(true);
      const response = await chrome.runtime.sendMessage({ action: 'GET_STATUS' });

      if (response && response.status === 'success') {
        currentServerUrl = response.serverUrl || '';
        updateStatusBadge(response.configured, response.serverUrl);
        updateLastSyncTime(response.lastSync);
        renderNotifications(response.history || []);
        updateUnreadBadge(response.unreadCount || 0);
        applyTheme(response.settings && response.settings.darkTheme);
      } else {
        updateStatusBadge(false);
      }
    } catch (error) {
      console.error('[Popup] Error retrieving background status:', error);
      updateStatusBadge(false);
    } finally {
      setSyncingState(false);
    }
  }

  /**
   * Applies dark/light theme attribute to root element.
   * @param {boolean} darkTheme Enable dark mode if true.
   */
  function applyTheme(darkTheme) {
    if (darkTheme) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  /**
   * Updates visual status badge.
   * @param {boolean} isConfigured Whether Jira credentials exist.
   * @param {string} serverUrl Stored Jira server URL.
   */
  function updateStatusBadge(isConfigured, serverUrl) {
    statusBadge.className = 'status-badge';
    if (isConfigured) {
      statusBadge.classList.add('connected');
      statusText.textContent = 'Connected';
    } else {
      statusBadge.classList.add('disconnected');
      statusText.textContent = 'Not Configured';
    }
  }

  /**
   * Sets UI state during manual sync operations.
   * @param {boolean} isSyncing True to enable spinner.
   */
  function setSyncingState(isSyncing) {
    const icon = btnSync.querySelector('.btn-icon');
    if (isSyncing) {
      icon.classList.add('spinning');
      btnSync.disabled = true;
    } else {
      icon.classList.remove('spinning');
      btnSync.disabled = false;
    }
  }

  /**
   * Formats ISO timestamp into relative human-readable string.
   * @param {string|null} isoString Timestamp.
   */
  function updateLastSyncTime(isoString) {
    if (!isoString) {
      lastSyncTime.textContent = 'Never';
      return;
    }
    lastSyncTime.textContent = formatRelativeTime(isoString);
  }

  /**
   * Updates unread badge element.
   * @param {number} count Unread notification count.
   */
  function updateUnreadBadge(count) {
    unreadBadge.textContent = count;
    if (count === 0) {
      unreadBadge.style.display = 'none';
    } else {
      unreadBadge.style.display = 'inline-flex';
    }
  }

  /**
   * Renders notification items array into DOM container.
   * @param {Array<Object>} history Notification objects array.
   */
  function renderNotifications(history) {
    notificationList.innerHTML = '';

    if (!history || history.length === 0) {
      notificationList.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 01-3.46 0"></path>
          </svg>
          <div class="empty-title">All caught up!</div>
          <div>No new Jira notifications recorded.</div>
        </div>
      `;
      return;
    }

    // Display top 10 recent notifications
    const itemsToDisplay = history.slice(0, 10);

    itemsToDisplay.forEach(item => {
      const card = document.createElement('div');
      card.className = `notification-card ${!item.read ? 'unread' : ''}`;

      const iconSvg = getTypeIconSvg(item.type);
      const relativeTime = formatRelativeTime(item.timestamp);

      card.innerHTML = `
        <div class="notif-top">
          <div class="notif-type-tag ${item.type || 'comment'}">
            ${iconSvg}
            <span>${capitalize(item.type || 'event')}</span>
          </div>
          <span class="issue-key">${escapeHtml(item.issueKey || '')}</span>
        </div>
        <div class="notif-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || '')}</div>
        <div class="notif-message">${escapeHtml(item.message || '')}</div>
        <div class="notif-footer">
          <span>${escapeHtml(item.authorName || 'Jira System')}</span>
          <span>${relativeTime}</span>
        </div>
      `;

      // Handle click to open Jira issue
      card.addEventListener('click', async () => {
        if (item.url) {
          await chrome.tabs.create({ url: item.url, active: true });
        } else if (currentServerUrl && item.issueKey) {
          await chrome.tabs.create({ url: `${currentServerUrl}/browse/${item.issueKey}`, active: true });
        }

        // Mark as read
        await chrome.runtime.sendMessage({
          action: 'MARK_READ',
          notificationId: item.id
        });

        card.classList.remove('unread');
        loadStatus();
      });

      notificationList.appendChild(card);
    });
  }

  /**
   * Button Event Handlers
   */
  btnSync.addEventListener('click', async () => {
    setSyncingState(true);
    try {
      const response = await chrome.runtime.sendMessage({ action: 'MANUAL_SYNC' });
      if (response && response.status === 'success') {
        loadStatus();
      }
    } catch (err) {
      console.error('[Popup] Manual sync error:', err);
    } finally {
      setSyncingState(false);
    }
  });

  btnOpenJira.addEventListener('click', async () => {
    if (currentServerUrl) {
      await chrome.tabs.create({ url: currentServerUrl, active: true });
    } else {
      chrome.runtime.openOptionsPage();
    }
  });

  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  btnClearHistory.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'CLEAR_HISTORY' });
    loadStatus();
  });

  /**
   * Helper Utilities
   */
  function formatRelativeTime(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 30) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour}h ago`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay}d ago`;
  }

  function getTypeIconSvg(type) {
    switch (type) {
      case 'mention':
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94"/></svg>`;
      case 'assignment':
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
      case 'status':
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`;
      case 'review':
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
      default:
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`;
    }
  }

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Load status on popup launch
  loadStatus();
});
