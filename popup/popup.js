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
  const btnDnd = document.getElementById('btnDnd');
  const btnSettings = document.getElementById('btnSettings');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const dndBanner = document.getElementById('dndBanner');
  const dndText = document.getElementById('dndText');
  const btnDisableDnd = document.getElementById('btnDisableDnd');

  let currentServerUrl = '';
  let currentSettings = {};

  const tabBtns = document.querySelectorAll('.tab-btn');
  const sectionTitle = document.querySelector('.section-title');
  let activeTab = 'notifications';
  let storedHistory = [];

  /**
   * Initializes the Popup view by requesting background status.
   */
  async function loadStatus() {
    try {
      setSyncingState(true);
      const response = await chrome.runtime.sendMessage({ action: 'GET_STATUS' });

      if (response && response.status === 'success') {
        currentServerUrl = response.serverUrl || '';
        currentSettings = response.settings || {};
        storedHistory = response.history || [];
        updateStatusBadge(response.configured, response.serverUrl);
        updateLastSyncTime(response.lastSync);
        updateUnreadBadge(response.unreadCount || 0);
        applyTheme(currentSettings.darkTheme);
        updateDndUI(currentSettings);

        if (activeTab === 'notifications') {
          renderNotifications(storedHistory);
        } else {
          loadTabIssues(activeTab);
        }
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
   * Tab Navigation Listeners & Issue Loaders
   */
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');
      if (activeTab === targetTab) return;

      activeTab = targetTab;
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      if (targetTab === 'notifications') {
        if (sectionTitle) sectionTitle.textContent = 'Recent Notifications';
        renderNotifications(storedHistory);
      } else {
        if (targetTab === 'assigned' && sectionTitle) sectionTitle.textContent = 'My Assigned Tasks';
        if (targetTab === 'watched' && sectionTitle) sectionTitle.textContent = 'Watched Issues';
        if (targetTab === 'review' && sectionTitle) sectionTitle.textContent = 'Issues In Review';
        loadTabIssues(targetTab);
      }
    });
  });

  async function loadTabIssues(tabType) {
    notificationList.innerHTML = `
      <div class="empty-state">
        <svg class="empty-icon spinning" viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6M1 20v-6h6"></path>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"></path>
        </svg>
        <div class="empty-title">Loading tasks...</div>
      </div>
    `;

    try {
      const response = await chrome.runtime.sendMessage({ action: 'GET_TAB_ISSUES', tabType });
      if (response && response.status === 'success') {
        renderTabIssues(response.issues || []);
      } else {
        notificationList.innerHTML = `
          <div class="empty-state">
            <div class="empty-title">Unable to load issues</div>
            <div>${escapeHtml(response ? response.error : 'Connection error')}</div>
          </div>
        `;
      }
    } catch (err) {
      console.error('[Popup] Error loading tab issues:', err);
      notificationList.innerHTML = `<div class="empty-state"><div class="empty-title">Error loading tasks</div></div>`;
    }
  }

  function renderTabIssues(issues) {
    notificationList.innerHTML = '';

    if (!issues || issues.length === 0) {
      notificationList.innerHTML = `
        <div class="empty-state">
          <svg class="empty-icon" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <polyline points="9 11 12 14 22 4"></polyline>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"></path>
          </svg>
          <div class="empty-title">No issues found</div>
          <div>No tasks match this filter in Jira.</div>
        </div>
      `;
      return;
    }

    issues.forEach(issue => {
      const card = document.createElement('div');
      card.className = 'notification-card';
      const tagText = `[${issue.key}] ${issue.summary}`;
      const relativeTime = formatRelativeTime(issue.updated);

      card.innerHTML = `
        <div class="notif-top">
          <span class="issue-status-badge ${issue.statusCategory}">${escapeHtml(issue.statusName)}</span>
          <div class="issue-key-badge-group">
            <span class="issue-key">${escapeHtml(issue.key)}</span>
            <button class="btn-copy-tag" title="Скопировать тег: ${escapeHtml(tagText)}" aria-label="Copy task tag">
              <svg class="copy-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
              </svg>
              <svg class="check-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="display:none;">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </button>
          </div>
        </div>
        <div class="notif-title" title="${escapeHtml(issue.summary)}">${escapeHtml(issue.summary)}</div>
        <div class="notif-footer">
          <span class="priority-tag">${escapeHtml(issue.priorityName ? `Prior: ${issue.priorityName}` : 'Jira Task')}</span>
          <span>${relativeTime}</span>
        </div>
      `;

      // Handle copy tag button click
      const btnCopy = card.querySelector('.btn-copy-tag');
      if (btnCopy) {
        btnCopy.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(tagText);
            const copyIcon = btnCopy.querySelector('.copy-icon');
            const checkIcon = btnCopy.querySelector('.check-icon');
            btnCopy.classList.add('copied');
            if (copyIcon) copyIcon.style.display = 'none';
            if (checkIcon) checkIcon.style.display = 'inline-block';

            setTimeout(() => {
              btnCopy.classList.remove('copied');
              if (copyIcon) copyIcon.style.display = 'inline-block';
              if (checkIcon) checkIcon.style.display = 'none';
            }, 1500);
          } catch (err) {
            console.error('[Popup] Copy error:', err);
          }
        });
      }

      // Handle card click to open issue in browser tab
      card.addEventListener('click', async () => {
        if (issue.url) {
          await chrome.tabs.create({ url: issue.url, active: true });
        }
      });

      notificationList.appendChild(card);
    });
  }

  /**
   * Updates DND Focus Mode Banner and button state.
   */
  function updateDndUI(settings) {
    if (!settings || !dndBanner) return;
    const dndUntil = settings.dndUntil;
    const isDndActive = dndUntil && new Date(dndUntil).getTime() > Date.now();

    if (isDndActive) {
      const untilDate = new Date(dndUntil);
      const hours = String(untilDate.getHours()).padStart(2, '0');
      const mins = String(untilDate.getMinutes()).padStart(2, '0');
      dndText.textContent = `Focus Mode active until ${hours}:${mins}`;
      dndBanner.style.display = 'flex';
      btnDnd.classList.add('active');
      btnDnd.title = `Focus Mode ON (until ${hours}:${mins}). Click to turn off.`;
    } else {
      dndBanner.style.display = 'none';
      btnDnd.classList.remove('active');
      btnDnd.title = 'Focus Mode (Do Not Disturb)';
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
      const issueKey = item.issueKey || '';
      const title = item.title || item.issueSummary || '';
      const tagText = issueKey ? (title ? `[${issueKey}] ${title}` : `[${issueKey}]`) : title;

      card.innerHTML = `
        <div class="notif-top">
          <div class="notif-type-tag ${item.type || 'comment'}">
            ${iconSvg}
            <span>${capitalize(item.type || 'event')}</span>
          </div>
          <div class="issue-key-badge-group">
            <span class="issue-key">${escapeHtml(issueKey)}</span>
            ${issueKey ? `
              <button class="btn-copy-tag" title="Скопировать тег: ${escapeHtml(tagText)}" aria-label="Copy task tag">
                <svg class="copy-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
                </svg>
                <svg class="check-icon" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" style="display:none;">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="notif-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
        <div class="notif-message">${escapeHtml(item.message || '')}</div>
        <div class="notif-footer">
          <span>${escapeHtml(item.authorName || 'Jira System')}</span>
          <span>${relativeTime}</span>
        </div>
      `;

      // Handle copy tag button click
      const btnCopy = card.querySelector('.btn-copy-tag');
      if (btnCopy) {
        btnCopy.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(tagText);
            const copyIcon = btnCopy.querySelector('.copy-icon');
            const checkIcon = btnCopy.querySelector('.check-icon');
            btnCopy.classList.add('copied');
            if (copyIcon) copyIcon.style.display = 'none';
            if (checkIcon) checkIcon.style.display = 'inline-block';

            setTimeout(() => {
              btnCopy.classList.remove('copied');
              if (copyIcon) copyIcon.style.display = 'inline-block';
              if (checkIcon) checkIcon.style.display = 'none';
            }, 1500);
          } catch (err) {
            console.error('[Popup] Copy error:', err);
          }
        });
      }

      // Handle card click to open Jira issue
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

  btnDnd.addEventListener('click', async () => {
    const isCurrentlyActive = currentSettings.dndUntil && new Date(currentSettings.dndUntil).getTime() > Date.now();
    let newDndUntil = null;
    if (!isCurrentlyActive) {
      // Activate DND for 1 hour by default
      newDndUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    }
    const updatedSettings = { ...currentSettings, dndUntil: newDndUntil };
    await chrome.runtime.sendMessage({ action: 'UPDATE_SETTINGS', settings: updatedSettings });
    currentSettings = updatedSettings;
    updateDndUI(currentSettings);
  });

  if (btnDisableDnd) {
    btnDisableDnd.addEventListener('click', async () => {
      const updatedSettings = { ...currentSettings, dndUntil: null };
      await chrome.runtime.sendMessage({ action: 'UPDATE_SETTINGS', settings: updatedSettings });
      currentSettings = updatedSettings;
      updateDndUI(currentSettings);
    });
  }

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
      case 'due_date':
        return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
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
