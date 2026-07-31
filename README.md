# 🚀 Boosta Jira Notifier — Chrome Extension (Manifest V3)

![Boosta Jira Notifier Banner](assets/banner.png)

[![Manifest V3](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-EA1C2C?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Security Audited](https://img.shields.io/badge/Security-Audited_%26_Hardened-10B981?style=for-the-badge&logo=shield&logoColor=white)](#-security--privacy-architecture)
[![Jira Support](https://img.shields.io/badge/Jira-Server_%26_Cloud-0052CC?style=for-the-badge&logo=jira&logoColor=white)](https://www.atlassian.com/software/jira)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

> A high-performance, enterprise-grade Google Chrome Extension designed for real-time Jira notification monitoring across **Jira Server / Data Center (REST API v2)** and **Jira Cloud (REST API v3)** environments.

---

## ✨ Highlights & Features

- 🔔 **Real-Time Jira Event Monitoring**:
  - 💬 **@Mentions**: Instant alerts when mentioned in issue comments or descriptions.
  - 👤 **Task Assignments**: Real-time popups when assigned to Jira tickets.
  - 📝 **Comment Stream**: Background tracking of discussion threads on watched/assigned tickets.
  - 🔄 **Status Transitions**: Automated notifications on issue lifecycle changes.
  - 🔍 **Code Review & Approvals**: Flagged review status detection.
  - ✅ **Auto-Clear Completed Tasks**: Automatically marks notifications as read when issues transition to *Done / Resolved / Closed*.
- 🌸 **Anime Voice & Custom MP3 Audio Player**: Offscreen Web Audio API chime player supporting built-in synthesized voice or custom user MP3 file uploads.
- 🎨 **Boosta Design System**: Built with Boosta's corporate brand identity palette (`#EA1C2C`), glassmorphic containers, and full Dark Mode / Light Mode UI.
- 🔐 **Hardened Security First**: Compliant with OWASP Application Security Verification Standards (ASVS) and Chrome Extension MV3 security practices.

---

## 🏛️ System Architecture

Built entirely on modern **Vanilla JavaScript (ES6 Modules)** with **Zero Third-Party Runtime Dependencies** for maximum security, auditability, and speed.

```text
[ Chrome Browser Extension Environment (Manifest V3) ]
├── Popup UI (popup.html / popup.js / popup.css)
│   └── Minimalist dashboard rendering top 10 unread alerts & relative timestamps
├── Options Page (options.html / options.js / options.css)
│   └── Configuration management, Jira connectivity diagnostic tester, and sound preview
└── Background Service Worker (background/background.js)
    ├── Storage Manager (storage.js) — Isolated chrome.storage.local credentials
    ├── Dual API Client (jiraApi.js) — Dual-Engine (Jira Server v2 & Cloud v3)
    ├── Auth Coordinator (authManager.js) — PAT / Basic Auth / OAuth 2.0
    ├── Notification Dispatcher (notificationManager.js) — Deduplication & Badges
    └── Offscreen Audio (offscreen.html / offscreen.js) — Web Audio Synthesizer
```

---

## 🔒 Security & Privacy Architecture

Safety and credential protection are core architectural design principles of this repository:

1. **Zero Hardcoded Credentials**: No API keys, passwords, or personal access tokens are stored in the source code. All user credentials are configured dynamically at runtime.
2. **Local Credential Storage Isolation (`chrome.storage.local`)**:
   - Authentication credentials (`apiToken`, `password`, `oauthToken`) are strictly persisted in `chrome.storage.local` to prevent unencrypted syncing over Google Sync accounts (`chrome.storage.sync`).
3. **Cross-Origin & Sender Verification**:
   - Background message listeners validate `sender.id === chrome.runtime.id` to block unauthorized cross-extension messaging attacks.
4. **DOM XSS Sanitization**:
   - All external payload attributes (issue keys, comments, titles, author names) pass through HTML escaping filters before DOM insertion.
5. **HTTPS Traffic Enforcement**:
   - All REST API endpoints enforce encrypted HTTPS protocol channels to prevent Man-in-the-Middle (MITM) credential interception.
6. **Strict Content Security Policy (CSP)**:
   - Manifest V3 compliant CSP (`script-src 'self'; object-src 'self';`), eliminating `eval()` and unsafe inline script execution.

---

## 🔑 Authentication Guide

### Option 1: Jira Server / Data Center (PAT)
1. Open your Jira Server (e.g. `https://jira.yourcompany.com`).
2. Click your Avatar icon in the top right &rarr; **Profile** &rarr; **Personal Access Tokens**.
3. Click **Create token**, set a name (e.g., `Chrome Notifier`), and copy the generated token.

### Option 2: Jira Cloud (API Token)
1. Navigate to Atlassian API Tokens: [id.atlassian.com/manage-profile/security/api-tokens](https://id.atlassian.com/manage-profile/security/api-tokens).
2. Click **Create API token**, copy the token, and use your Atlassian Email Address in settings.

---

## 📥 Installation (Developer Mode)

1. Clone or download this repository:
   ```bash
   git clone https://github.com/your-username/boosta-jira-notifier.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** toggle in the top-right corner.
4. Click **Load unpacked** and select the project directory.
5. Open Extension Options, configure your Jira Server URL & token, click **Test Connection**, and save!

---

## 📄 License

Distributed under the **MIT License**. See [`LICENSE`](LICENSE) for details.
