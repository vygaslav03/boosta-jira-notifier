/**
 * === jiraApi.js ===
 * Boosta Jira Notifier - Jira REST API Client (Server & Cloud Dual Engine)
 * 
 * Interacts with Jira Server / Data Center (REST API v2) and Jira Cloud (REST API v3).
 * Handles user identity mapping (username/key vs accountId), JQL query execution,
 * comment extraction, changelog parsing, and error processing.
 * 
 * @module background/jiraApi
 */

import { AuthManager } from './authManager.js';

export class JiraApiClient {
  /**
   * Constructs the Jira API Client instance.
   * 
   * @param {Object} config Configuration containing jiraType, serverUrl, email, apiToken, etc.
   */
  constructor(config = {}) {
    this.jiraType = config.jiraType || 'server'; // 'server' or 'cloud'
    this.apiVersion = this.jiraType === 'server' ? '2' : '3';
    this.serverUrl = AuthManager.normalizeServerUrl(config.serverUrl || '');
    this.authHandler = AuthManager.getHandler(config);
  }

  /**
   * Sends HTTP request to Jira REST API with auth headers.
   * 
   * @param {string} endpoint Path relative to serverUrl.
   * @param {Object} [options={}] Fetch options.
   * @returns {Promise<Object|Array>} Response JSON.
   */
  async request(endpoint, options = {}) {
    if (!this.serverUrl) {
      throw new Error('Jira Server URL is not configured.');
    }

    const fullUrl = `${this.serverUrl}${endpoint}`;
    const authHeaders = await this.authHandler.getAuthHeaders();

    const headers = {
      ...authHeaders,
      ...(options.headers || {})
    };

    try {
      const response = await fetch(fullUrl, { ...options, headers });

      if (!response.ok) {
        let errorMessage = `HTTP ${response.status} ${response.statusText}`;
        try {
          const errorJson = await response.json();
          if (errorJson.errorMessages && errorJson.errorMessages.length > 0) {
            errorMessage = errorJson.errorMessages.join('; ');
          } else if (errorJson.errors && typeof errorJson.errors === 'object') {
            errorMessage = Object.values(errorJson.errors).join('; ');
          } else if (errorJson.message) {
            errorMessage = errorJson.message;
          }
        } catch (_) {}

        if (response.status === 401) {
          throw new Error(`Authentication Failed (401): ${errorMessage}. Please check your credentials.`);
        } else if (response.status === 403) {
          throw new Error(`Access Forbidden (403): ${errorMessage}. Lacks required permission.`);
        } else if (response.status === 404) {
          throw new Error(`Resource Not Found (404): ${errorMessage}. Verify your Jira URL.`);
        } else if (response.status === 429) {
          throw new Error(`Rate Limit Exceeded (429): Quota exceeded. Try again later.`);
        } else {
          throw new Error(`Jira API Request Failed: ${errorMessage}`);
        }
      }

      if (response.status === 204) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`[JiraApiClient] Request error for ${fullUrl}:`, error);
      throw error;
    }
  }

  /**
   * Validates credentials against Jira `/rest/api/{2|3}/myself`.
   * 
   * @returns {Promise<{success: boolean, user?: Object, error?: string}>} Status object.
   */
  async testConnection() {
    try {
      const user = await this.getCurrentUser();
      const avatar = user.avatarUrls ? (user.avatarUrls['48x48'] || user.avatarUrls['32x32']) : '';
      return {
        success: true,
        user: {
          jiraType: this.jiraType,
          username: user.name || user.username || user.key || '',
          accountId: user.accountId || '',
          displayName: user.displayName || user.name || 'Jira User',
          emailAddress: user.emailAddress || '',
          avatarUrl: avatar
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Failed to connect to Jira server.'
      };
    }
  }

  /**
   * Fetches the current user profile.
   */
  async getCurrentUser() {
    return await this.request(`/rest/api/${this.apiVersion}/myself`);
  }

  /**
   * Polls Jira for recent issue updates, comments, and changelogs.
   * 
   * @param {string|number|null} lastSyncTimestamp ISO timestamp of last check.
   * @param {Object} settings Active settings toggles.
   * @returns {Promise<{events: Array, currentUser: Object, lastSync: string}>}
   */
  async fetchRecentEvents(lastSyncTimestamp, settings) {
    const currentUser = await this.getCurrentUser();
    const myName = currentUser.name || currentUser.username || currentUser.key || '';
    const myAccountId = currentUser.accountId || '';
    const myDisplayName = currentUser.displayName || '';

    // Calculate time window in minutes (default 15 minutes, max 1440m)
    let minutesBack = 15;
    if (lastSyncTimestamp) {
      const diffMs = Date.now() - new Date(lastSyncTimestamp).getTime();
      minutesBack = Math.max(2, Math.min(1440, Math.ceil(diffMs / (1000 * 60))));
    }

    // JQL query works on both Jira Server REST API v2 and Jira Cloud REST API v3
    const jql = `updated >= -${minutesBack}m AND (assignee = currentUser() OR watcher = currentUser() OR text ~ currentUser()) ORDER BY updated DESC`;

    const searchParams = new URLSearchParams({
      jql: jql,
      maxResults: '50',
      fields: 'summary,status,assignee,reporter,comment,updated,created,resolution,duedate',
      expand: 'changelog'
    });

    const searchResult = await this.request(`/rest/api/${this.apiVersion}/search?${searchParams.toString()}`);
    const issues = searchResult.issues || [];
    const events = [];
    const completedIssueKeys = [];
    const syncTimeIso = new Date().toISOString();

    for (const issue of issues) {
      const issueKey = issue.key;
      const issueSummary = issue.fields.summary || 'No Summary';
      const issueUrl = `${this.serverUrl}/browse/${issueKey}`;

      // Check if task status is completed / resolved
      const statusObj = issue.fields.status || {};
      const statusCategoryKey = (statusObj.statusCategory && statusObj.statusCategory.key) || '';
      const statusNameLower = (statusObj.name || '').toLowerCase();
      const isResolved = Boolean(
        issue.fields.resolution ||
        statusCategoryKey === 'done' ||
        ['done', 'resolved', 'closed', 'completed', 'готово', 'решено', 'закрыто'].includes(statusNameLower)
      );

      if (isResolved) {
        completedIssueKeys.push(issueKey);
      }

      // Check Due Date / Deadline Alerts
      if (!isResolved && settings.enableDueAlerts !== false && issue.fields.duedate) {
        try {
          const dueDateStr = issue.fields.duedate; // e.g. "2026-07-31"
          const dueDate = new Date(dueDateStr);
          const now = new Date();
          const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const targetDueDate = new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate());
          const diffMs = targetDueDate - todayDate;
          const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
          const maxAlertDays = settings.dueAlertDays !== undefined ? settings.dueAlertDays : 1;

          if (diffDays <= maxAlertDays) {
            let dueLabel = 'due today';
            if (diffDays < 0) {
              dueLabel = `OVERDUE by ${Math.abs(diffDays)} day(s)`;
            } else if (diffDays === 0) {
              dueLabel = 'due TODAY';
            } else if (diffDays === 1) {
              dueLabel = 'due TOMORROW';
            } else {
              dueLabel = `due in ${diffDays} days`;
            }

            events.push({
              id: `due_${issueKey}_${dueDateStr}`,
              type: 'due_date',
              title: `⏰ Deadline Alert: ${issueKey}`,
              message: `Task "${this.truncateText(issueSummary, 50)}" is ${dueLabel}! (${dueDateStr})`,
              issueKey: issueKey,
              issueSummary: issueSummary,
              url: issueUrl,
              authorName: 'Jira System',
              authorAvatar: '',
              timestamp: new Date().toISOString(),
              read: false
            });
          }
        } catch (e) {
          console.warn(`[JiraApiClient] Error parsing duedate for ${issueKey}:`, e);
        }
      }

      // 1. Check Mentions
      if (settings.enableMentions) {
        const commentData = issue.fields.comment || {};
        const comments = commentData.comments || [];

        for (const comment of comments) {
          const authorName = comment.author ? (comment.author.displayName || comment.author.name) : 'Someone';
          const authorId = comment.author ? (comment.author.accountId || comment.author.name || comment.author.key) : null;
          const authorAvatar = comment.author && comment.author.avatarUrls ? (comment.author.avatarUrls['48x48'] || comment.author.avatarUrls['32x32']) : '';

          const commentCreated = new Date(comment.created).getTime();
          const isRecent = !lastSyncTimestamp || commentCreated > new Date(lastSyncTimestamp).getTime();

          // Check if written by another user
          const isSelf = (myAccountId && authorId === myAccountId) || (myName && authorId === myName);

          if (isRecent && !isSelf) {
            const commentBody = typeof comment.body === 'string' 
              ? comment.body 
              : JSON.stringify(comment.body || '');

            // Match mentions in Jira Server syntax ([~username] or @username) or Jira Cloud ([~accountid:...])
            const isMentioned = 
              (myName && commentBody.includes(`[~${myName}]`)) ||
              (myName && commentBody.toLowerCase().includes(`@${myName.toLowerCase()}`)) ||
              (myAccountId && commentBody.includes(myAccountId)) ||
              (myDisplayName && commentBody.toLowerCase().includes(myDisplayName.toLowerCase()));

            if (isMentioned) {
              events.push({
                id: `mention_${comment.id}`,
                type: 'mention',
                title: `You were mentioned in ${issueKey}`,
                message: `${authorName} mentioned you: "${this.truncateText(this.extractPlainText(commentBody), 120)}"`,
                issueKey: issueKey,
                issueSummary: issueSummary,
                url: issueUrl,
                authorName: authorName,
                authorAvatar: authorAvatar,
                timestamp: comment.created,
                read: false
              });
            }
          }
        }
      }

      // 2. Check Changelogs (Assignment, Status, Review)
      const histories = (issue.changelog && issue.changelog.histories) || [];

      for (const history of histories) {
        const authorName = history.author ? (history.author.displayName || history.author.name) : 'Someone';
        const authorId = history.author ? (history.author.accountId || history.author.name || history.author.key) : null;
        const authorAvatar = history.author && history.author.avatarUrls ? (history.author.avatarUrls['48x48'] || history.author.avatarUrls['32x32']) : '';

        const historyCreated = new Date(history.created).getTime();
        const isRecent = !lastSyncTimestamp || historyCreated > new Date(lastSyncTimestamp).getTime();
        const isSelf = (myAccountId && authorId === myAccountId) || (myName && authorId === myName);

        if (!isRecent || isSelf) {
          continue;
        }

        for (const item of history.items || []) {
          // Assignment change
          if (settings.enableAssignment && item.field === 'assignee') {
            const newAssigneeId = item.to;
            const newAssigneeStr = item.toString || '';

            const isAssignedToMe = 
              (myAccountId && newAssigneeId === myAccountId) ||
              (myName && (newAssigneeId === myName || newAssigneeStr.includes(myName))) ||
              (myDisplayName && newAssigneeStr.includes(myDisplayName));

            if (isAssignedToMe) {
              events.push({
                id: `assign_${history.id}_${item.field}`,
                type: 'assignment',
                title: `Assigned to you: ${issueKey}`,
                message: `${authorName} assigned ${issueKey} ("${this.truncateText(issueSummary, 60)}") to you.`,
                issueKey: issueKey,
                issueSummary: issueSummary,
                url: issueUrl,
                authorName: authorName,
                authorAvatar: authorAvatar,
                timestamp: history.created,
                read: false
              });
            }
          }

          // Status change
          if (settings.enableStatus && item.field === 'status') {
            events.push({
              id: `status_${history.id}_${item.field}`,
              type: 'status',
              title: `Status updated: ${issueKey}`,
              message: `${authorName} changed status from "${item.fromString || 'Unknown'}" to "${item.toString || 'Unknown'}" on ${issueKey}`,
              issueKey: issueKey,
              issueSummary: issueSummary,
              url: issueUrl,
              authorName: authorName,
              authorAvatar: authorAvatar,
              timestamp: history.created,
              read: false
            });
          }

          // Review request
          if (settings.enableReview && (item.field === 'Flagged' || item.field.toLowerCase().includes('review') || item.field.toLowerCase().includes('approver'))) {
            events.push({
              id: `review_${history.id}_${item.field}`,
              type: 'review',
              title: `Review Requested: ${issueKey}`,
              message: `${authorName} updated review flag on ${issueKey}: ${item.field} set to "${item.toString}"`,
              issueKey: issueKey,
              issueSummary: issueSummary,
              url: issueUrl,
              authorName: authorName,
              authorAvatar: authorAvatar,
              timestamp: history.created,
              read: false
            });
          }
        }
      }

      // 3. Check General Comments
      if (settings.enableComments) {
        const commentData = issue.fields.comment || {};
        const comments = commentData.comments || [];

        for (const comment of comments) {
          const authorName = comment.author ? (comment.author.displayName || comment.author.name) : 'Someone';
          const authorId = comment.author ? (comment.author.accountId || comment.author.name || comment.author.key) : null;
          const authorAvatar = comment.author && comment.author.avatarUrls ? (comment.author.avatarUrls['48x48'] || comment.author.avatarUrls['32x32']) : '';

          const commentCreated = new Date(comment.created).getTime();
          const isRecent = !lastSyncTimestamp || commentCreated > new Date(lastSyncTimestamp).getTime();
          const isSelf = (myAccountId && authorId === myAccountId) || (myName && authorId === myName);

          if (isRecent && !isSelf) {
            const commentBody = typeof comment.body === 'string' 
              ? comment.body 
              : JSON.stringify(comment.body || '');

            const isMentioned = 
              (myName && commentBody.includes(`[~${myName}]`)) ||
              (myName && commentBody.toLowerCase().includes(`@${myName.toLowerCase()}`)) ||
              (myAccountId && commentBody.includes(myAccountId)) ||
              (myDisplayName && commentBody.toLowerCase().includes(myDisplayName.toLowerCase()));

            if (!isMentioned) {
              events.push({
                id: `comment_${comment.id}`,
                type: 'comment',
                title: `New Comment on ${issueKey}`,
                message: `${authorName} commented: "${this.truncateText(this.extractPlainText(commentBody), 120)}"`,
                issueKey: issueKey,
                issueSummary: issueSummary,
                url: issueUrl,
                authorName: authorName,
                authorAvatar: authorAvatar,
                timestamp: comment.created,
                read: false
              });
            }
          }
        }
      }
    }

    return {
      events: events,
      currentUser: currentUser,
      lastSync: syncTimeIso,
      completedIssueKeys: completedIssueKeys
    };
  }

  extractPlainText(input) {
    if (!input) return '';
    if (typeof input === 'string') {
      return input
        .replace(/\[~[^\]]+\]/g, '@User')
        .replace(/<[^>]*>/g, '')
        .trim();
    }
    if (typeof input === 'object') {
      try {
        const textParts = [];
        const traverse = (node) => {
          if (!node) return;
          if (node.type === 'text' && node.text) {
            textParts.push(node.text);
          }
          if (node.content && Array.isArray(node.content)) {
            node.content.forEach(traverse);
          }
        };
        traverse(input);
        return textParts.join(' ').trim();
      } catch (_) {
        return JSON.stringify(input);
      }
    }
    return String(input);
  }

  truncateText(text, maxLength = 100) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }

  /**
   * Fetches issues for quick bookmarks/tabs in Popup view.
   * 
   * @param {string} tabType 'assigned', 'watched', or 'review'
   * @returns {Promise<Array<Object>>} List of issue objects formatted for UI display.
   */
  async fetchTabIssues(tabType = 'assigned') {
    let jql = 'assignee = currentUser() AND resolution = Unresolved ORDER BY updated DESC';
    if (tabType === 'watched') {
      jql = 'watcher = currentUser() AND resolution = Unresolved ORDER BY updated DESC';
    } else if (tabType === 'review') {
      jql = 'resolution = Unresolved AND (status in ("In Review", "Code Review", "Review", "Approved") OR text ~ "review") ORDER BY updated DESC';
    }

    const searchParams = new URLSearchParams({
      jql: jql,
      maxResults: '20',
      fields: 'summary,status,assignee,priority,updated,duedate'
    });

    const searchResult = await this.request(`/rest/api/${this.apiVersion}/search?${searchParams.toString()}`);
    const issues = searchResult.issues || [];

    return issues.map(issue => {
      const statusObj = issue.fields.status || {};
      const priorityObj = issue.fields.priority || {};
      return {
        key: issue.key,
        summary: issue.fields.summary || 'No Summary',
        statusName: statusObj.name || 'Unknown',
        statusCategory: (statusObj.statusCategory && statusObj.statusCategory.key) || 'indeterminate',
        priorityName: priorityObj.name || '',
        dueDate: issue.fields.duedate || null,
        updated: issue.fields.updated || new Date().toISOString(),
        url: `${this.serverUrl}/browse/${issue.key}`
      };
    });
  }
}
