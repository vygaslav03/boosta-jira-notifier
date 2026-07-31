/**
 * === background.js ===
 * Boosta Jira Notifier - Service Worker Entry Point
 * 
 * Orchestrates background lifecycle events, alarm scheduling, Jira API polling,
 * desktop notifications, and message passing between extension popup/options pages.
 * 
 * @module background/background
 */

import { storageManager } from './storage.js';
import { JiraApiClient } from './jiraApi.js';
import { notificationManager } from './notificationManager.js';

const ALARM_NAME = 'jiraPollAlarm';

/**
 * Main Initialization on Extension Lifecycle Events
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`[Background] Boosta Jira Notifier installed/updated. Reason: ${details.reason}`);
  const state = await storageManager.load();
  await setupAlarm(state.settings.checkInterval);
  // Run initial poll if credentials are ready
  if (state.serverUrl && (state.apiToken || state.oauthToken)) {
    await pollJira();
  }
});

chrome.runtime.onStartup.addListener(async () => {
  console.log('[Background] Browser startup detected. Verifying background polling alarm...');
  const state = await storageManager.load();
  await setupAlarm(state.settings.checkInterval);
});

/**
 * Handles Alarm Triggers
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log('[Background] Poll alarm fired. Executing background Jira sync...');
    await pollJira();
  }
});

/**
 * Core Background Sync Logic
 * Fetches recent Jira events, detects mentions/assignments/comments/status changes,
 * creates desktop notifications, and updates state history.
 */
async function pollJira() {
  const state = await storageManager.load();

  if (!state.serverUrl || (!state.apiToken && !state.oauthToken)) {
    console.log('[Background] Polling skipped: Jira credentials not fully configured.');
    return { success: false, reason: 'unconfigured' };
  }

  try {
    const jiraClient = new JiraApiClient(state);
    const result = await jiraClient.fetchRecentEvents(state.lastSync, state.settings);

    // Process events with notification manager
    const alertsTriggered = await notificationManager.processEvents(result.events, state.settings, result.completedIssueKeys);

    // Save updated lastSync timestamp
    await storageManager.save({ lastSync: result.lastSync });

    console.log(`[Background] Jira sync completed successfully. Events found: ${result.events.length}, Alerts spawned: ${alertsTriggered}`);

    return {
      success: true,
      eventsCount: result.events.length,
      alertsCount: alertsTriggered,
      lastSync: result.lastSync
    };
  } catch (error) {
    console.error('[Background] Error during Jira background polling:', error);
    return {
      success: false,
      error: error.message || 'Polling failed'
    };
  }
}

/**
 * Configures chrome.alarms for background periodic execution.
 * 
 * @param {number} intervalSeconds Interval in seconds (15, 30, 60, 120).
 */
async function setupAlarm(intervalSeconds = 30) {
  try {
    await chrome.alarms.clear(ALARM_NAME);
    const periodInMinutes = Math.max(0.25, intervalSeconds / 60); // 15s = 0.25m
    chrome.alarms.create(ALARM_NAME, {
      delayInMinutes: 0.1, // First run after 6 seconds
      periodInMinutes: periodInMinutes
    });
    console.log(`[Background] Alarm "${ALARM_NAME}" scheduled every ${intervalSeconds} seconds (${periodInMinutes} mins).`);
  } catch (error) {
    console.error('[Background] Error configuring background alarm:', error);
  }
}

/**
 * Handles Incoming Runtime Messages from Popup and Options Pages
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Defense-in-depth: Reject any external message not coming from this extension
  if (sender.id !== chrome.runtime.id) {
    console.warn('[Security] Rejected runtime message from unauthorized sender ID:', sender.id);
    sendResponse({ status: 'error', error: 'Unauthorized sender' });
    return false;
  }

  console.log('[Background] Received message:', message.action);

  // Return true to enable asynchronous sendResponse handling
  (async () => {
    try {
      if (message.action === 'MANUAL_SYNC') {
        const syncResult = await pollJira();
        const state = await storageManager.load();
        sendResponse({
          status: 'success',
          result: syncResult,
          state: state
        });
      } else if (message.action === 'TEST_CONNECTION') {
        const tempState = message.config || (await storageManager.load());
        const validUrl = AuthManager.normalizeServerUrl(tempState.serverUrl);

        if (!validUrl || (!validUrl.startsWith('https://') && !validUrl.startsWith('http://localhost') && !validUrl.startsWith('http://127.0.0.1'))) {
          sendResponse({ success: false, error: 'Insecure or invalid Jira URL. HTTPS is required.' });
          return;
        }

        const jiraClient = new JiraApiClient({ ...tempState, serverUrl: validUrl });
        const testResult = await jiraClient.testConnection();
        sendResponse(testResult);
      } else if (message.action === 'GET_STATUS') {
        const state = await storageManager.load();
        const unreadCount = state.notificationHistory.filter(n => !n.read).length;
        sendResponse({
          status: 'success',
          serverUrl: state.serverUrl,
          email: state.email,
          configured: Boolean(state.serverUrl && (state.apiToken || state.oauthToken)),
          lastSync: state.lastSync,
          unreadCount: unreadCount,
          history: state.notificationHistory,
          settings: state.settings
        });
      } else if (message.action === 'MARK_READ') {
        await storageManager.markNotificationsAsRead(message.notificationId);
        await notificationManager.updateExtensionBadge();
        sendResponse({ status: 'success' });
      } else if (message.action === 'CLEAR_HISTORY') {
        await storageManager.clearHistory();
        await notificationManager.updateExtensionBadge();
        sendResponse({ status: 'success' });
      } else if (message.action === 'UPDATE_SETTINGS') {
        if (message.settings) {
          await storageManager.update('settings', message.settings);
          if (message.settings.checkInterval) {
            await setupAlarm(message.settings.checkInterval);
          }
        }
        sendResponse({ status: 'success' });
      } else if (message.action === 'PLAY_TEST_SOUND') {
        await notificationManager.playChimeSound(message.soundType || 'anime');
        sendResponse({ status: 'success' });
      } else {
        sendResponse({ status: 'unknown_action' });
      }
    } catch (err) {
      console.error('[Background] Error processing message:', err);
      sendResponse({ status: 'error', error: err.message });
    }
  })();

  return true;
});
