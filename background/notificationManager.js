/**
 * === notificationManager.js ===
 * Boosta Jira Notifier - Desktop Notification & Sound Manager
 * 
 * Creates system desktop notifications, deduplicates events, manages notification click & close routing,
 * plays Web Audio anime girl voice / chime alerts, and maintains history storage.
 * 
 * @module background/notificationManager
 */

import { storageManager } from './storage.js';

export class NotificationManager {
  constructor() {
    this.setupListeners();
  }

  /**
   * Registers global chrome.notifications click, button, and close listeners.
   */
  setupListeners() {
    // 1. Handle notification card click (opens Jira issue URL)
    chrome.notifications.onClicked.addListener(async (notificationId) => {
      console.log(`[NotificationManager] Notification clicked: ${notificationId}`);
      try {
        const history = await storageManager.getNotificationHistory();
        const targetNotif = history.find(n => n.id === notificationId);
        
        if (targetNotif && targetNotif.url) {
          await chrome.tabs.create({ url: targetNotif.url, active: true });
        }
        await storageManager.markNotificationsAsRead(notificationId);
      } catch (error) {
        console.error('[NotificationManager] Click error:', error);
      } finally {
        chrome.notifications.clear(notificationId);
      }
    });

    // 2. Handle notification button click (e.g., "Закрыть" button)
    chrome.notifications.onButtonClicked.addListener((notificationId) => {
      console.log(`[NotificationManager] Notification button clicked: ${notificationId}`);
      chrome.notifications.clear(notificationId);
    });

    // 3. Handle notification dismissal / close
    chrome.notifications.onClosed.addListener((notificationId, byUser) => {
      console.log(`[NotificationManager] Notification closed (byUser: ${byUser}): ${notificationId}`);
      chrome.notifications.clear(notificationId);
    });
  }

  isDndActive(settings) {
    if (settings.dndUntil) {
      const until = new Date(settings.dndUntil).getTime();
      if (Date.now() < until) {
        return true;
      }
    }
    return false;
  }

  isQuietHours(settings) {
    if (!settings.enableQuietHours) return false;

    const now = new Date();
    const day = now.getDay();
    if (settings.quietHoursWeekends && (day === 0 || day === 6)) {
      return true;
    }

    const startStr = settings.quietHoursStart || '19:00';
    const endStr = settings.quietHoursEnd || '09:00';

    const [startH, startM] = (startStr || '19:00').split(':').map(Number);
    const [endH, endM] = (endStr || '09:00').split(':').map(Number);

    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    }
  }

  async processEvents(events, settings, completedIssueKeys = []) {
    if (settings.autoClearCompleted !== false && completedIssueKeys && completedIssueKeys.length > 0) {
      await this.autoClearCompletedNotifications(completedIssueKeys);
    }

    if (!events || events.length === 0) return 0;
    const knownEvents = await storageManager.getKnownEvents();
    const knownSet = new Set(knownEvents);
    const newEventsToAlert = [];
    const newEventIds = [];

    for (const event of events) {
      if (!knownSet.has(event.id)) {
        newEventsToAlert.push(event);
        newEventIds.push(event.id);
      }
    }

    if (newEventsToAlert.length === 0) return 0;
    await storageManager.addKnownEvents(newEventIds);

    const isSilenced = this.isDndActive(settings) || this.isQuietHours(settings);

    let alertCount = 0;
    for (const event of newEventsToAlert) {
      await storageManager.addNotification(event);
      if (settings.enableNotifications !== false && !isSilenced) {
        await this.createDesktopNotification(event);
        alertCount++;
      }
    }

    if (alertCount > 0 && settings.enableSound !== false && !isSilenced) {
      this.playChimeSound(settings.soundType || 'anime');
    }

    await this.updateExtensionBadge();
    return alertCount;
  }

  async autoClearCompletedNotifications(completedIssueKeys = []) {
    if (!completedIssueKeys || completedIssueKeys.length === 0) return 0;
    try {
      const history = await storageManager.getNotificationHistory();
      const keysSet = new Set(completedIssueKeys);

      for (const notif of history) {
        if (keysSet.has(notif.issueKey)) {
          chrome.notifications.clear(notif.id);
        }
      }

      const clearedCount = await storageManager.markNotificationsAsReadByIssueKeys(completedIssueKeys);
      if (clearedCount > 0) {
        console.log(`[NotificationManager] Auto-cleared ${clearedCount} notifications for completed tasks:`, completedIssueKeys);
        await this.updateExtensionBadge();
      }
      return clearedCount;
    } catch (error) {
      console.error('[NotificationManager] Error auto-clearing completed notifications:', error);
      return 0;
    }
  }

  async createDesktopNotification(event) {
    const iconUrl = chrome.runtime.getURL('icons/icon128.png');
    return new Promise((resolve) => {
      chrome.notifications.create(event.id, {
        type: 'basic',
        iconUrl: iconUrl,
        title: event.title || `Jira Alert: ${event.issueKey}`,
        message: event.message || event.issueSummary,
        contextMessage: `Boosta Jira • ${event.issueKey}`,
        priority: 2,
        // Set requireInteraction to false so notifications automatically dismiss after a few seconds on Windows
        requireInteraction: false
      }, (createdId) => resolve(createdId));
    });
  }

  async playChimeSound(soundType = 'anime') {
    try {
      if (chrome.offscreen) {
        const existingContexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
        if (existingContexts.length === 0) {
          await chrome.offscreen.createDocument({
            url: 'background/offscreen.html',
            reasons: ['AUDIO_PLAYBACK'],
            justification: 'Notification chime sound playback for Boosta Jira Notifier'
          });
        }
        chrome.runtime.sendMessage({
          action: 'PLAY_NOTIFICATION_SOUND',
          soundType: soundType
        });
      }
    } catch (error) {
      console.warn('[NotificationManager] Offscreen audio trigger note:', error.message);
    }
  }

  async updateExtensionBadge() {
    try {
      const history = await storageManager.getNotificationHistory();
      const unreadCount = history.filter(n => !n.read).length;
      if (unreadCount > 0) {
        await chrome.action.setBadgeText({ text: String(unreadCount) });
        await chrome.action.setBadgeBackgroundColor({ color: '#0052CC' });
      } else {
        await chrome.action.setBadgeText({ text: '' });
      }
    } catch (error) {
      console.error('[NotificationManager] Badge error:', error);
    }
  }
}

export const notificationManager = new NotificationManager();
