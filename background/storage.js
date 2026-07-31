/**
 * === storage.js ===
 * Boosta Jira Notifier - Storage Manager
 * 
 * Centralized abstraction layer over chrome.storage.sync and chrome.storage.local.
 * Supports both Jira Server / Data Center (REST API v2) and Jira Cloud (REST API v3).
 * 
 * @module background/storage
 */

/**
 * Default settings configuration for the extension.
 * @type {Object}
 */
export const DEFAULT_SETTINGS = {
  checkInterval: 30,         // Interval in seconds: 15, 30, 60, 120
  enableMentions: true,      // Notify when user is @mentioned
  enableAssignment: true,    // Notify when user is assigned to an issue
  enableComments: true,      // Notify when new comments are posted on watched/assigned issues
  enableStatus: true,        // Notify when issue status changes
  enableReview: true,        // Notify when review or approval is requested
  autoClearCompleted: true,  // Automatically clear notifications when task is marked Done/Resolved
  enableSound: true,         // Play audio notification chime
  soundType: 'anime',        // 'anime' (Anime Girl Voice), 'chime' (Classic Bell), 'custom' (MP3)
  enableNotifications: true, // Display desktop notifications
  language: 'ru',            // 'en' (English), 'ru' (Russian), 'ua' (Ukrainian)
  darkTheme: false,          // Toggle UI theme in popup and options
  // Smart Alerts & Quiet Hours
  dndUntil: null,           // ISO string timestamp until which DND is active
  enableQuietHours: false,  // Enable quiet hours during off-work hours
  quietHoursStart: '19:00', // Start time for quiet hours
  quietHoursEnd: '09:00',   // End time for quiet hours
  quietHoursWeekends: true, // Silence alerts on Saturday and Sunday
  enableDueAlerts: true,    // Alert about upcoming Due Dates / Deadlines
  dueAlertDays: 1,          // Alert N days before Due Date (0 = day of deadline, 1 = 1 day before)
  // Telegram Bot Integration
  enableTelegram: false,    // Send duplicate notifications to Telegram Bot
  telegramBotToken: '',     // Telegram Bot Token from @BotFather
  telegramChatId: ''        // User Telegram Chat ID
};

/**
 * Default initial storage state structure.
 * @type {Object}
 */
export const DEFAULT_STORAGE_STATE = {
  jiraType: 'server',         // 'server' (Server / Data Center v2) or 'cloud' (Cloud v3)
  authType: 'pat',            // 'pat' (Personal Access Token) or 'basic' (Username/Pass) or 'oauth'
  serverUrl: '',              // Jira Server / Cloud Base URL e.g. https://jira.boosta.co
  username: '',               // Jira Server username or key
  email: '',                  // Jira email address
  apiToken: '',               // Jira Personal Access Token or Cloud API Token / Password
  oauthToken: null,           // OAuth 2.0 Token object
  settings: { ...DEFAULT_SETTINGS },
  lastSync: null,             // ISO string timestamp of the last successful sync
  knownEvents: [],            // Array of unique event IDs already processed
  notificationHistory: [],    // Array of stored notification objects for UI rendering
  cache: {}                   // Auxiliary cache storage
};

export class StorageManager {
  constructor() {
    this.syncStorage = chrome.storage.sync;
    this.localStorage = chrome.storage.local;
  }

  async load() {
    try {
      const syncData = await this.syncStorage.get([
        'jiraType',
        'authType',
        'serverUrl',
        'settings',
        'lastSync',
        // Legacy keys for migration check
        'username',
        'email',
        'apiToken',
        'oauthToken'
      ]);

      const localData = await this.localStorage.get([
        'username',
        'email',
        'apiToken',
        'oauthToken',
        'knownEvents',
        'notificationHistory',
        'cache',
        'customAudioDataUrl',
        'customAudioName'
      ]);

      // Legacy Migration: If sensitive keys exist in syncStorage, move to localStorage and remove from syncStorage
      const migrationLocal = {};
      const syncKeysToRemove = [];

      ['username', 'email', 'apiToken', 'oauthToken'].forEach(key => {
        if (!localData[key] && syncData[key]) {
          migrationLocal[key] = syncData[key];
          localData[key] = syncData[key];
          syncKeysToRemove.push(key);
        }
      });

      if (Object.keys(migrationLocal).length > 0) {
        await this.localStorage.set(migrationLocal);
        await this.syncStorage.remove(syncKeysToRemove);
        console.log('[StorageManager] Migrated sensitive credentials from sync to local storage.');
      }

      return {
        jiraType: syncData.jiraType || localData.jiraType || DEFAULT_STORAGE_STATE.jiraType,
        authType: syncData.authType || localData.authType || DEFAULT_STORAGE_STATE.authType,
        serverUrl: syncData.serverUrl || localData.serverUrl || DEFAULT_STORAGE_STATE.serverUrl,
        username: localData.username || DEFAULT_STORAGE_STATE.username,
        email: localData.email || DEFAULT_STORAGE_STATE.email,
        apiToken: localData.apiToken || DEFAULT_STORAGE_STATE.apiToken,
        oauthToken: localData.oauthToken || DEFAULT_STORAGE_STATE.oauthToken,
        settings: { ...DEFAULT_SETTINGS, ...(syncData.settings || {}) },
        lastSync: syncData.lastSync || DEFAULT_STORAGE_STATE.lastSync,
        knownEvents: localData.knownEvents || DEFAULT_STORAGE_STATE.knownEvents,
        notificationHistory: localData.notificationHistory || DEFAULT_STORAGE_STATE.notificationHistory,
        cache: localData.cache || DEFAULT_STORAGE_STATE.cache,
        customAudioDataUrl: localData.customAudioDataUrl || null,
        customAudioName: localData.customAudioName || null
      };
    } catch (error) {
      console.error('[StorageManager] Error loading data from chrome.storage:', error);
      return { ...DEFAULT_STORAGE_STATE };
    }
  }

  async save(data) {
    try {
      const syncUpdate = {};
      const localUpdate = {};

      const syncKeys = ['jiraType', 'authType', 'serverUrl', 'settings', 'lastSync'];
      const localKeys = ['username', 'email', 'apiToken', 'oauthToken', 'knownEvents', 'notificationHistory', 'cache', 'customAudioDataUrl', 'customAudioName'];

      for (const [key, value] of Object.entries(data)) {
        if (syncKeys.includes(key)) {
          syncUpdate[key] = value;
        } else if (localKeys.includes(key)) {
          localUpdate[key] = value;
        }
      }

      if (Object.keys(syncUpdate).length > 0) {
        await this.syncStorage.set(syncUpdate);
      }

      if (Object.keys(localUpdate).length > 0) {
        await this.localStorage.set(localUpdate);
      }

      return true;
    } catch (error) {
      console.error('[StorageManager] Error saving data to chrome.storage:', error);
      return false;
    }
  }

  async update(key, value) {
    try {
      const current = await this.load();
      if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof current[key] === 'object') {
        const merged = { ...current[key], ...value };
        return await this.save({ [key]: merged });
      } else {
        return await this.save({ [key]: value });
      }
    } catch (error) {
      console.error(`[StorageManager] Error updating key "${key}":`, error);
      return false;
    }
  }

  async clear() {
    try {
      await this.syncStorage.clear();
      await this.localStorage.clear();
      return true;
    } catch (error) {
      console.error('[StorageManager] Error clearing storage:', error);
      return false;
    }
  }

  async getKnownEvents() {
    try {
      const data = await this.localStorage.get('knownEvents');
      return data.knownEvents || [];
    } catch (error) {
      console.error('[StorageManager] Error fetching knownEvents:', error);
      return [];
    }
  }

  async addKnownEvents(newEventIds) {
    try {
      const current = await this.getKnownEvents();
      const set = new Set([...current, ...newEventIds]);
      let updated = Array.from(set);

      if (updated.length > 500) {
        updated = updated.slice(updated.length - 500);
      }

      await this.localStorage.set({ knownEvents: updated });
      return true;
    } catch (error) {
      console.error('[StorageManager] Error adding knownEvents:', error);
      return false;
    }
  }

  async getNotificationHistory() {
    try {
      const data = await this.localStorage.get('notificationHistory');
      return data.notificationHistory || [];
    } catch (error) {
      console.error('[StorageManager] Error fetching notification history:', error);
      return [];
    }
  }

  async addNotification(notification) {
    try {
      const history = await this.getNotificationHistory();
      const updatedHistory = [notification, ...history].slice(0, 50);
      await this.localStorage.set({ notificationHistory: updatedHistory });
      return true;
    } catch (error) {
      console.error('[StorageManager] Error adding notification to history:', error);
      return false;
    }
  }

  async markNotificationsAsRead(notificationId = null) {
    try {
      const history = await this.getNotificationHistory();
      const updated = history.map(item => {
        if (!notificationId || item.id === notificationId) {
          return { ...item, read: true };
        }
        return item;
      });
      await this.localStorage.set({ notificationHistory: updated });
      return true;
    } catch (error) {
      console.error('[StorageManager] Error marking notifications as read:', error);
      return false;
    }
  }

  async markNotificationsAsReadByIssueKeys(issueKeys = []) {
    if (!issueKeys || issueKeys.length === 0) return 0;
    try {
      const history = await this.getNotificationHistory();
      const keysSet = new Set(issueKeys);
      let count = 0;
      const updated = history.map(item => {
        if (keysSet.has(item.issueKey) && !item.read) {
          count++;
          return { ...item, read: true };
        }
        return item;
      });

      if (count > 0) {
        await this.localStorage.set({ notificationHistory: updated });
      }
      return count;
    } catch (error) {
      console.error('[StorageManager] Error marking notifications by issue keys:', error);
      return 0;
    }
  }

  async clearHistory() {
    try {
      await this.localStorage.set({ notificationHistory: [] });
      return true;
    } catch (error) {
      console.error('[StorageManager] Error clearing notification history:', error);
      return false;
    }
  }
}

export const storageManager = new StorageManager();
