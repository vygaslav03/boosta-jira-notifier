/**
 * === options.js ===
 * Boosta Jira Notifier - Options View Controller
 * 
 * Handles Jira deployment type switching (Server / Data Center vs Cloud),
 * auth strategy fields, connection diagnostics, Anime Girl audio chime preview, and persistence.
 * 
 * @module options/options
 */

import { storageManager } from '../background/storage.js';
import { AuthManager } from '../background/authManager.js';
import { t } from '../background/i18n.js';

document.addEventListener('DOMContentLoaded', async () => {
  // UI Elements
  const optionsForm = document.getElementById('optionsForm');
  const jiraTypeServer = document.getElementById('jiraTypeServer');
  const jiraTypeCloud = document.getElementById('jiraTypeCloud');
  const serverUrlInput = document.getElementById('serverUrl');
  const urlHelp = document.getElementById('urlHelp');

  // Server Credential Elements
  const serverCredsBlock = document.getElementById('serverCredsBlock');
  const serverAuthPat = document.getElementById('serverAuthPat');
  const serverAuthBasic = document.getElementById('serverAuthBasic');
  const usernameGroup = document.getElementById('usernameGroup');
  const usernameInput = document.getElementById('username');
  const serverTokenInput = document.getElementById('serverToken');
  const tokenLabel = document.getElementById('tokenLabel');
  const serverTokenHelp = document.getElementById('serverTokenHelp');

  // Cloud Credential Elements
  const cloudCredsBlock = document.getElementById('cloudCredsBlock');
  const cloudEmailInput = document.getElementById('cloudEmail');
  const cloudApiTokenInput = document.getElementById('cloudApiToken');

  // Preferences Elements
  const checkIntervalSelect = document.getElementById('checkInterval');
  const enableMentionsCb = document.getElementById('enableMentions');
  const enableAssignmentCb = document.getElementById('enableAssignment');
  const enableCommentsCb = document.getElementById('enableComments');
  const enableStatusCb = document.getElementById('enableStatus');
  const enableReviewCb = document.getElementById('enableReview');
  const autoClearCompletedCb = document.getElementById('autoClearCompleted');
  const enableDueAlertsCb = document.getElementById('enableDueAlerts');
  const enableQuietHoursCb = document.getElementById('enableQuietHours');
  const quietHoursStartInput = document.getElementById('quietHoursStart');
  const quietHoursEndInput = document.getElementById('quietHoursEnd');
  const quietHoursWeekendsCb = document.getElementById('quietHoursWeekends');
  const enableNotificationsCb = document.getElementById('enableNotifications');
  const enableSoundCb = document.getElementById('enableSound');
  const soundTypeSelect = document.getElementById('soundType');
  const languageSelect = document.getElementById('languageSelect');
  const darkThemeCb = document.getElementById('darkTheme');
  const customAudioInput = document.getElementById('customAudioInput');
  const btnClearCustomAudio = document.getElementById('btnClearCustomAudio');
  const customAudioStatus = document.getElementById('customAudioStatus');

  // Telegram Elements
  const enableTelegramCb = document.getElementById('enableTelegram');
  const telegramBotTokenInput = document.getElementById('telegramBotToken');
  const telegramChatIdInput = document.getElementById('telegramChatId');
  const btnTestTelegram = document.getElementById('btnTestTelegram');
  const telegramTestStatus = document.getElementById('telegramTestStatus');
  const enableDailyDigestCb = document.getElementById('enableDailyDigest');
  const digestTimeInput = document.getElementById('digestTime');

  let pendingCustomAudioDataUrl = null;
  let pendingCustomAudioName = null;
  let isCustomAudioCleared = false;

  // Action Elements
  const btnTestConnection = document.getElementById('btnTestConnection');
  const btnTestSound = document.getElementById('btnTestSound');
  const btnTestNotif = document.getElementById('btnTestNotif');
  const btnSave = document.getElementById('btnSave');
  const connectionBanner = document.getElementById('connectionBanner');
  const saveStatus = document.getElementById('saveStatus');

  // Log Console Elements
  const btnRefreshLogs = document.getElementById('btnRefreshLogs');
  const btnCopyLogs = document.getElementById('btnCopyLogs');
  const btnClearLogs = document.getElementById('btnClearLogs');
  const logConsole = document.getElementById('logConsole');

  /**
   * Initializes settings form state from chrome.storage.
   */
  async function loadSettings() {
    try {
      const state = await storageManager.load();

      // Set Jira Deployment Type
      const isServer = (state.jiraType !== 'cloud');
      jiraTypeServer.checked = isServer;
      jiraTypeCloud.checked = !isServer;
      toggleJiraType(isServer ? 'server' : 'cloud');

      // Server URL
      serverUrlInput.value = state.serverUrl || '';

      // Server Credentials
      if (state.authType === 'basic') {
        serverAuthBasic.checked = true;
        toggleServerAuthStrategy('basic');
      } else {
        serverAuthPat.checked = true;
        toggleServerAuthStrategy('pat');
      }

      usernameInput.value = state.username || '';
      serverTokenInput.value = state.apiToken || '';

      // Cloud Credentials
      cloudEmailInput.value = state.email || '';
      cloudApiTokenInput.value = state.apiToken || '';

      // General Preferences
      const settings = state.settings || {};
      checkIntervalSelect.value = String(settings.checkInterval || 30);
      enableMentionsCb.checked = settings.enableMentions !== false;
      enableAssignmentCb.checked = settings.enableAssignment !== false;
      enableCommentsCb.checked = settings.enableComments !== false;
      enableStatusCb.checked = settings.enableStatus !== false;
      enableReviewCb.checked = settings.enableReview !== false;
      if (autoClearCompletedCb) {
        autoClearCompletedCb.checked = settings.autoClearCompleted !== false;
      }
      if (enableDueAlertsCb) {
        enableDueAlertsCb.checked = settings.enableDueAlerts !== false;
      }
      if (enableQuietHoursCb) {
        enableQuietHoursCb.checked = Boolean(settings.enableQuietHours);
      }
      if (quietHoursStartInput) {
        quietHoursStartInput.value = settings.quietHoursStart || '19:00';
      }
      if (quietHoursEndInput) {
        quietHoursEndInput.value = settings.quietHoursEnd || '09:00';
      }
      if (quietHoursWeekendsCb) {
        quietHoursWeekendsCb.checked = settings.quietHoursWeekends !== false;
      }
      enableNotificationsCb.checked = settings.enableNotifications !== false;
      enableSoundCb.checked = settings.enableSound !== false;
      if (languageSelect) {
        languageSelect.value = settings.language || 'ru';
      }
      darkThemeCb.checked = Boolean(settings.darkTheme);

      if (enableTelegramCb) {
        enableTelegramCb.checked = Boolean(settings.enableTelegram);
      }
      if (telegramBotTokenInput) {
        telegramBotTokenInput.value = settings.telegramBotToken || '';
      }
      if (telegramChatIdInput) {
        telegramChatIdInput.value = settings.telegramChatId || '';
      }
      if (enableDailyDigestCb) {
        enableDailyDigestCb.checked = settings.enableDailyDigest !== false;
      }
      if (digestTimeInput) {
        digestTimeInput.value = settings.digestTime || '09:00';
      }

      if (state.customAudioName) {
        customAudioStatus.textContent = `Используется загруженный файл: ${state.customAudioName}`;
        btnClearCustomAudio.classList.remove('hidden');
      }

      applyTheme(darkThemeCb.checked);
      await renderLogs();
    } catch (error) {
      console.error('[Options] Error loading options data:', error);
    }
  }

  async function renderLogs() {
    if (!logConsole) return;
    try {
      const logs = await storageManager.getLogs();
      if (!logs || logs.length === 0) {
        logConsole.innerHTML = '<div class="log-entry info" style="color: #9CA3AF;">[INFO] Лог-журнал пуст. Зафиксированных ошибок нет.</div>';
        return;
      }

      logConsole.innerHTML = '';
      logs.forEach(log => {
        const div = document.createElement('div');
        div.className = `log-line log-${(log.level || 'info').toLowerCase()}`;
        const time = new Date(log.timestamp).toLocaleTimeString();
        let color = '#D4D4D4';
        if (log.level === 'ERROR') color = '#EF4444';
        if (log.level === 'WARN') color = '#F59E0B';
        div.style.color = color;
        div.style.marginBottom = '3px';
        div.textContent = `[${time}] [${log.level || 'INFO'}] [${log.module || 'System'}] ${log.message}`;
        logConsole.appendChild(div);
      });
    } catch (err) {
      console.error('[Options] Error rendering logs:', err);
    }
  }

  if (btnRefreshLogs) {
    btnRefreshLogs.addEventListener('click', renderLogs);
  }

  if (btnClearLogs) {
    btnClearLogs.addEventListener('click', async () => {
      await storageManager.clearLogs();
      await renderLogs();
    });
  }

  if (btnCopyLogs) {
    btnCopyLogs.addEventListener('click', async () => {
      try {
        const logs = await storageManager.getLogs();
        const formatted = logs.map(l => `[${l.timestamp}] [${l.level}] [${l.module}] ${l.message}`).join('\n');
        await navigator.clipboard.writeText(formatted || 'No logs recorded.');
        const origText = btnCopyLogs.textContent;
        btnCopyLogs.textContent = '✓ Скопировано!';
        setTimeout(() => { btnCopyLogs.textContent = origText; }, 1500);
      } catch (err) {
        console.error('[Options] Copy logs error:', err);
      }
    });
  }

  function toggleJiraType(type) {
    if (type === 'cloud') {
      serverCredsBlock.classList.add('hidden');
      cloudCredsBlock.classList.remove('hidden');
      urlHelp.textContent = 'Enter your Jira Cloud URL (e.g., https://your-company.atlassian.net).';
      serverUrlInput.placeholder = 'https://your-company.atlassian.net';
    } else {
      serverCredsBlock.classList.remove('hidden');
      cloudCredsBlock.classList.add('hidden');
      urlHelp.textContent = 'Enter your Boosta Jira Server URL (e.g., https://jira.boosta.co).';
      serverUrlInput.placeholder = 'https://jira.boosta.co';
    }
  }

  function toggleServerAuthStrategy(strategy) {
    if (strategy === 'basic') {
      usernameGroup.classList.remove('hidden');
      tokenLabel.innerHTML = 'Password / Token <span class="required">*</span>';
      serverTokenInput.placeholder = 'Enter Jira Server password or user token';
      serverTokenHelp.textContent = 'Use your standard Jira login password or user API token.';
    } else {
      usernameGroup.classList.add('hidden');
      tokenLabel.innerHTML = 'Personal Access Token (PAT) <span class="required">*</span>';
      serverTokenInput.placeholder = 'Paste your Jira Personal Access Token';
      serverTokenHelp.innerHTML = 'Generate a Personal Access Token in Jira: Click your Avatar icon &rarr; <strong>Profile &rarr; Personal Access Tokens</strong>.';
    }
  }

  function applyTheme(isDark) {
    if (isDark) {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function showBanner(isSuccess, message) {
    connectionBanner.className = `alert-banner ${isSuccess ? 'success' : 'error'}`;
    connectionBanner.innerHTML = message;
    connectionBanner.classList.remove('hidden');
  }

  // Radio & Theme Listeners
  jiraTypeServer.addEventListener('change', () => toggleJiraType('server'));
  jiraTypeCloud.addEventListener('change', () => toggleJiraType('cloud'));
  serverAuthPat.addEventListener('change', () => toggleServerAuthStrategy('pat'));
  serverAuthBasic.addEventListener('change', () => toggleServerAuthStrategy('basic'));
  darkThemeCb.addEventListener('change', (e) => applyTheme(e.target.checked));

  /**
   * Live Connection Tester Handler
   */
  btnTestConnection.addEventListener('click', async () => {
    const isServer = jiraTypeServer.checked;
    const jiraType = isServer ? 'server' : 'cloud';
    const rawUrl = serverUrlInput.value;
    const normalizedUrl = AuthManager.normalizeServerUrl(rawUrl);

    if (!normalizedUrl) {
      showBanner(false, '<strong>Validation Error:</strong> Please enter a valid Jira Server URL.');
      return;
    }

    let config = { jiraType, serverUrl: normalizedUrl };

    if (isServer) {
      const isBasic = serverAuthBasic.checked;
      config.authType = isBasic ? 'basic' : 'pat';
      config.username = usernameInput.value.trim();
      config.apiToken = serverTokenInput.value.trim();

      if (isBasic && (!config.username || !config.apiToken)) {
        showBanner(false, '<strong>Validation Error:</strong> Please provide both Jira Username and Password.');
        return;
      }
      if (!isBasic && !config.apiToken) {
        showBanner(false, '<strong>Validation Error:</strong> Please provide your Jira Personal Access Token (PAT).');
        return;
      }
    } else {
      config.authType = 'pat';
      config.email = cloudEmailInput.value.trim();
      config.apiToken = cloudApiTokenInput.value.trim();

      if (!config.email || !config.apiToken) {
        showBanner(false, '<strong>Validation Error:</strong> Please provide Email and API Token for Jira Cloud.');
        return;
      }
    }

    btnTestConnection.disabled = true;
    btnTestConnection.textContent = 'Testing...';
    connectionBanner.classList.add('hidden');

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'TEST_CONNECTION',
        config: config
      });

      if (response && response.success) {
        const u = response.user || {};
        await storageManager.save(config);
        chrome.runtime.sendMessage({ action: 'MANUAL_SYNC' }).catch(() => {});
        showBanner(true, `<strong>Connection Successful!</strong> Connected to <strong>Jira ${u.jiraType === 'server' ? 'Server / Data Center' : 'Cloud'}</strong> as <strong>${escapeHtml(u.displayName)}</strong> (${escapeHtml(u.username || u.emailAddress || '')}). Settings saved automatically!`);
      } else {
        const err = response ? response.error : 'Unknown connection error';
        showBanner(false, `<strong>Connection Failed:</strong> ${escapeHtml(err)}`);
      }
    } catch (error) {
      showBanner(false, `<strong>Connection Failed:</strong> ${escapeHtml(error.message)}`);
    } finally {
      btnTestConnection.disabled = false;
      btnTestConnection.innerHTML = `
        <svg class="btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Test Connection
      `;
    }
  });

  // Custom Audio Upload Listeners
  if (customAudioInput) {
    customAudioInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        pendingCustomAudioDataUrl = evt.target.result;
        pendingCustomAudioName = file.name;
        isCustomAudioCleared = false;
        if (customAudioStatus) {
          customAudioStatus.textContent = `Загружен новый файл: ${file.name}`;
        }
        if (btnClearCustomAudio) {
          btnClearCustomAudio.classList.remove('hidden');
        }
      };
      reader.readAsDataURL(file);
    });
  }

  if (btnClearCustomAudio) {
    btnClearCustomAudio.addEventListener('click', () => {
      if (customAudioInput) customAudioInput.value = '';
      pendingCustomAudioDataUrl = null;
      pendingCustomAudioName = null;
      isCustomAudioCleared = true;
      if (customAudioStatus) {
        customAudioStatus.textContent = 'Если файл не загружен вручную, подтягивается файл из assets/notice.mp3 или assets/anime_girl.mp3.';
      }
      btnClearCustomAudio.classList.add('hidden');
    });
  }

  if (btnTestNotif) {
    btnTestNotif.addEventListener('click', async () => {
      try {
        await chrome.runtime.sendMessage({ action: 'TEST_NOTIFICATION' });
      } catch (e) {
        console.error('[Options] Error triggering test notification:', e);
      }
    });
  }

  if (btnTestTelegram) {
    btnTestTelegram.addEventListener('click', async () => {
      const token = telegramBotTokenInput ? telegramBotTokenInput.value.trim() : '';
      const chatId = telegramChatIdInput ? telegramChatIdInput.value.trim() : '';

      if (!token || !chatId) {
        if (telegramTestStatus) {
          telegramTestStatus.style.display = 'block';
          telegramTestStatus.style.color = '#EF4444';
          telegramTestStatus.textContent = '❌ Укажите Telegram Bot Token и Chat ID';
        }
        return;
      }

      btnTestTelegram.disabled = true;
      btnTestTelegram.textContent = 'Отправка...';
      if (telegramTestStatus) {
        telegramTestStatus.style.display = 'block';
        telegramTestStatus.style.color = '#6B7280';
        telegramTestStatus.textContent = 'Отправка тестового сообщения в Telegram...';
      }

      try {
        const res = await chrome.runtime.sendMessage({
          action: 'TEST_TELEGRAM',
          token: token,
          chatId: chatId
        });

        if (res && res.success) {
          if (telegramTestStatus) {
            telegramTestStatus.style.color = '#10B981';
            telegramTestStatus.textContent = '✅ Тестовое сообщение успешно доставлено в Telegram!';
          }
        } else {
          if (telegramTestStatus) {
            telegramTestStatus.style.color = '#EF4444';
            telegramTestStatus.textContent = `❌ Ошибка Telegram: ${res ? res.error : 'Не удалось отправить'}`;
          }
        }
      } catch (err) {
        if (telegramTestStatus) {
          telegramTestStatus.style.color = '#EF4444';
          telegramTestStatus.textContent = `❌ Ошибка соединения: ${err.message}`;
        }
      } finally {
        btnTestTelegram.disabled = false;
        btnTestTelegram.textContent = '✈️ Тест Telegram';
      }
    });
  }

  /**
   * Sound Preview Trigger Handler
   */
  btnTestSound.addEventListener('click', async () => {
    const selectedSound = soundTypeSelect.value || 'anime';

    if (selectedSound === 'chime') {
      playClassicChimeSynth();
      return;
    }

    // Determine audio source
    let audioSrc = pendingCustomAudioDataUrl;
    if (!audioSrc && !isCustomAudioCleared) {
      try {
        const state = await storageManager.load();
        audioSrc = state.customAudioDataUrl;
      } catch (_) {}
    }

    if (!audioSrc) {
      if (selectedSound === 'custom') {
        audioSrc = chrome.runtime.getURL('assets/notice.mp3');
      } else {
        audioSrc = chrome.runtime.getURL('assets/anime_girl.mp3');
      }
    }

    try {
      const audio = new Audio(audioSrc);
      audio.volume = 0.9;
      await audio.play();
    } catch (err) {
      console.warn('[Options] Direct audio playback failed, falling back to synthesizer:', err);
      if (selectedSound === 'anime' || selectedSound === 'custom') {
        playAnimeVoiceSynth();
      } else {
        playClassicChimeSynth();
      }
    }

    // Also notify offscreen if background service worker is running
    try {
      chrome.runtime.sendMessage({
        action: 'PLAY_TEST_SOUND',
        soundType: selectedSound
      });
    } catch (_) {}
  });

  function playAnimeVoiceSynth() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const notes = [
        { freq: 783.99, time: 0, duration: 0.12, endFreq: 987.77 },
        { freq: 1046.50, time: 0.10, duration: 0.14, endFreq: 1318.51 },
        { freq: 1567.98, time: 0.22, duration: 0.22, endFreq: 1760.00 }
      ];
      notes.forEach(n => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.time);
        osc.frequency.exponentialRampToValueAtTime(n.endFreq, ctx.currentTime + n.time + n.duration);
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2800, ctx.currentTime);
        filter.Q.setValueAtTime(3.5, ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime + n.time);
        gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + n.time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.time + n.duration);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + n.time);
        osc.stop(ctx.currentTime + n.time + n.duration + 0.05);
      });
      setTimeout(() => ctx.close(), 700);
    } catch (e) {
      console.warn('[Options] Synth error:', e);
    }
  }

  function playClassicChimeSynth() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
      setTimeout(() => ctx.close(), 500);
    } catch (e) {
      console.warn('[Options] Synth error:', e);
    }
  }

  /**
   * Form Save Submission Handler
   */
  optionsForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isServer = jiraTypeServer.checked;
    const jiraType = isServer ? 'server' : 'cloud';
    const serverUrl = AuthManager.normalizeServerUrl(serverUrlInput.value);

    let authType = 'pat';
    let username = '';
    let email = '';
    let apiToken = '';

    if (isServer) {
      authType = serverAuthBasic.checked ? 'basic' : 'pat';
      username = usernameInput.value.trim();
      apiToken = serverTokenInput.value.trim();
    } else {
      authType = 'pat';
      email = cloudEmailInput.value.trim();
      apiToken = cloudApiTokenInput.value.trim();
    }

    const settings = {
      checkInterval: parseInt(checkIntervalSelect.value, 10),
      enableMentions: enableMentionsCb.checked,
      enableAssignment: enableAssignmentCb.checked,
      enableComments: enableCommentsCb.checked,
      enableStatus: enableStatusCb.checked,
      enableReview: enableReviewCb.checked,
      autoClearCompleted: autoClearCompletedCb ? autoClearCompletedCb.checked : true,
      enableDueAlerts: enableDueAlertsCb ? enableDueAlertsCb.checked : true,
      enableQuietHours: enableQuietHoursCb ? enableQuietHoursCb.checked : false,
      quietHoursStart: quietHoursStartInput ? quietHoursStartInput.value : '19:00',
      quietHoursEnd: quietHoursEndInput ? quietHoursEndInput.value : '09:00',
      quietHoursWeekends: quietHoursWeekendsCb ? quietHoursWeekendsCb.checked : true,
      enableNotifications: enableNotificationsCb.checked,
      enableSound: enableSoundCb.checked,
      soundType: soundTypeSelect.value || 'anime',
      language: languageSelect ? languageSelect.value : 'ru',
      darkTheme: darkThemeCb.checked,
      enableTelegram: enableTelegramCb ? enableTelegramCb.checked : false,
      telegramBotToken: telegramBotTokenInput ? telegramBotTokenInput.value.trim() : '',
      telegramChatId: telegramChatIdInput ? telegramChatIdInput.value.trim() : '',
      enableDailyDigest: enableDailyDigestCb ? enableDailyDigestCb.checked : true,
      digestTime: digestTimeInput ? digestTimeInput.value : '09:00'
    };

    btnSave.disabled = true;
    btnSave.textContent = 'Saving...';
    saveStatus.textContent = '';

    try {
      const saveData = {
        jiraType,
        authType,
        serverUrl,
        username,
        email,
        apiToken,
        settings
      };

      if (isCustomAudioCleared) {
        saveData.customAudioDataUrl = null;
        saveData.customAudioName = null;
      } else if (pendingCustomAudioDataUrl) {
        saveData.customAudioDataUrl = pendingCustomAudioDataUrl;
        saveData.customAudioName = pendingCustomAudioName;
      }

      await storageManager.save(saveData);

      await chrome.runtime.sendMessage({
        action: 'UPDATE_SETTINGS',
        settings
      });

      saveStatus.className = 'save-status success';
      saveStatus.textContent = '✓ Settings Saved Successfully!';

      setTimeout(() => { saveStatus.textContent = ''; }, 3000);
    } catch (error) {
      console.error('[Options] Error saving options:', error);
      saveStatus.className = 'save-status error';
      saveStatus.textContent = 'Failed to save settings.';
    } finally {
      btnSave.disabled = false;
      btnSave.textContent = 'Save Settings';
    }
  });

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  loadSettings();
});
