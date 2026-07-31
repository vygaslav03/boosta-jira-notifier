/**
 * === jiraInject.js ===
 * Boosta Jira Notifier - Content Script
 * Injects convenient "Copy Key" and "Copy Tag" buttons directly into Jira issue pages.
 */

(function () {
  'use strict';

  function extractIssueData() {
    // 1. Find Issue Key
    let key = '';
    
    // Jira Server selector
    const keyValEl = document.getElementById('key-val');
    if (keyValEl && keyValEl.textContent) {
      key = keyValEl.textContent.trim();
    }

    // Jira Cloud & SPA selectors
    if (!key) {
      const keyLink = document.querySelector('a[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"], a[data-test-id="issue-key"], a[id*="key-val"]');
      if (keyLink) {
        key = keyLink.textContent.trim();
      }
    }

    // URL fallback e.g. /browse/FINORG-64783
    if (!key) {
      const match = window.location.pathname.match(/\/browse\/([A-Z0-9]+-\d+)/i);
      if (match) {
        key = match[1].toUpperCase();
      }
    }

    // 2. Find Issue Summary / Title
    let summary = '';
    const summaryValEl = document.getElementById('summary-val');
    if (summaryValEl) {
      summary = summaryValEl.textContent.trim();
    }

    if (!summary) {
      const summaryHeading = document.querySelector('h1[data-testid="issue.views.issue-base.foundation.summary.heading"], h1[data-test-id="issue-summary"], header h1, h1');
      if (summaryHeading) {
        summary = summaryHeading.textContent.trim();
      }
    }

    return { key, summary };
  }

  function generateGitBranch(key, summary) {
    if (!summary) return `feature/${key}`;
    const cleanSummary = summary
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 45);
    
    const prefix = /bug|fix|error|fail/i.test(summary) ? 'bugfix' : 'feature';
    return `${prefix}/${key}-${cleanSummary}`;
  }

  function injectCopyButtons() {
    const { key, summary } = extractIssueData();
    if (!key) return;

    // Check if already injected for this exact key
    const existingContainer = document.getElementById('boosta-copy-container');
    if (existingContainer) {
      if (existingContainer.getAttribute('data-key') === key) {
        return; // Already present for current key
      } else {
        existingContainer.remove(); // Remove old key buttons on SPA page change
      }
    }

    // Find insertion target container in Jira header
    let targetEl = document.getElementById('key-val');
    if (!targetEl) {
      targetEl = document.querySelector('a[data-testid="issue.views.issue-base.foundation.breadcrumbs.current-issue.item"], a[data-test-id="issue-key"]');
    }
    if (!targetEl) {
      // Fallback: next to summary h1
      targetEl = document.querySelector('h1[data-testid="issue.views.issue-base.foundation.summary.heading"], #summary-val, h1');
    }

    if (!targetEl || !targetEl.parentElement) return;

    // Create buttons container
    const container = document.createElement('span');
    container.id = 'boosta-copy-container';
    container.className = 'boosta-copy-container';
    container.setAttribute('data-key', key);

    const fullTag = summary ? `[${key}] ${summary}` : `[${key}]`;
    const markdownLink = `[${key}](${window.location.href})`;

    container.innerHTML = `
      <button type="button" class="boosta-copy-btn key-btn" title="Скопировать номер: ${key}">
        <svg class="b-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"></path>
        </svg>
        <span class="b-text">${key}</span>
      </button>
      <button type="button" class="boosta-copy-btn tag-btn" title="Скопировать тег с названием: ${fullTag}">
        <svg class="b-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2"></path>
          <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
        </svg>
        <span class="b-text">[Tag]</span>
      </button>
      <button type="button" class="boosta-copy-btn link-btn" title="Скопировать Markdown ссылку: ${markdownLink}">
        <svg class="b-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"></path>
        </svg>
        <span class="b-text">🔗 Link</span>
      </button>
    `;

    // Add event listeners
    const keyBtn = container.querySelector('.key-btn');
    const tagBtn = container.querySelector('.tag-btn');
    const linkBtn = container.querySelector('.link-btn');

    keyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        await navigator.clipboard.writeText(key);
        const textSpan = keyBtn.querySelector('.b-text');
        const origText = textSpan.textContent;
        keyBtn.classList.add('copied');
        textSpan.textContent = '✓ Copied!';
        setTimeout(() => {
          keyBtn.classList.remove('copied');
          textSpan.textContent = origText;
        }, 1500);
      } catch (err) {
        console.error('[Boosta Notifier] Copy error:', err);
      }
    });

    tagBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const latestData = extractIssueData();
        const latestTag = latestData.summary ? `[${key}] ${latestData.summary}` : `[${key}]`;
        await navigator.clipboard.writeText(latestTag);
        const textSpan = tagBtn.querySelector('.b-text');
        const origText = textSpan.textContent;
        tagBtn.classList.add('copied');
        textSpan.textContent = '✓ Copied Tag!';
        setTimeout(() => {
          tagBtn.classList.remove('copied');
          textSpan.textContent = origText;
        }, 1500);
      } catch (err) {
        console.error('[Boosta Notifier] Copy tag error:', err);
      }
    });

    linkBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        const url = window.location.href;
        const htmlBlob = new Blob([`<a href="${url}">${key}</a>`], { type: 'text/html' });
        const textBlob = new Blob([`<${url}|${key}>`], { type: 'text/plain' });

        if (window.ClipboardItem && navigator.clipboard.write) {
          const item = new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob
          });
          await navigator.clipboard.write([item]);
        } else {
          await navigator.clipboard.writeText(`<${url}|${key}>`);
        }

        const textSpan = linkBtn.querySelector('.b-text');
        const origText = textSpan.textContent;
        linkBtn.classList.add('copied');
        textSpan.textContent = '✓ Copied Link!';
        setTimeout(() => {
          linkBtn.classList.remove('copied');
          textSpan.textContent = origText;
        }, 1500);
      } catch (err) {
        console.error('[Boosta Notifier] Copy link error:', err);
        try {
          await navigator.clipboard.writeText(`<${window.location.href}|${key}>`);
        } catch (_) {}
      }
    });

    // Insert after target element
    if (targetEl.nextSibling) {
      targetEl.parentNode.insertBefore(container, targetEl.nextSibling);
    } else {
      targetEl.parentNode.appendChild(container);
    }
  }

  // Run on load and observe DOM changes for SPA navigation
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectCopyButtons);
  } else {
    injectCopyButtons();
  }

  // Observe page mutations (SPA navigation in Jira)
  const observer = new MutationObserver(() => {
    injectCopyButtons();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
