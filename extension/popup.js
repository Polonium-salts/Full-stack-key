/**
 * KeyVault Chrome Extension - Popup Logic
 * Aligned with Server-side Design System & Components
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const statusBadge = document.getElementById('status-badge');
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const btnToggleSettings = document.getElementById('btn-toggle-settings');
  const viewSetup = document.getElementById('view-setup');
  const viewMain = document.getElementById('view-main');

  // Setup Form Elements
  const setupForm = document.getElementById('setup-form');
  const setupApiUrl = document.getElementById('setup-api-url');
  const setupApiKey = document.getElementById('setup-api-key');
  const setupMasterPassword = document.getElementById('setup-master-password');
  const setupFeedback = document.getElementById('setup-feedback');
  const btnSaveSetup = document.getElementById('btn-save-setup');

  // Tab Navigation
  const tabTriggers = document.querySelectorAll('.tab-trigger');
  const tabPanels = document.querySelectorAll('.tab-panel');

  // Current Site Tab
  const currentHostnameEl = document.getElementById('current-hostname');
  const currentSiteCards = document.getElementById('current-site-cards');
  const btnShowAddCurrent = document.getElementById('btn-show-add-current');
  const addCurrentPanel = document.getElementById('add-current-panel');
  const btnCancelAddCurrent = document.getElementById('btn-cancel-add-current');
  const btnCancelAddCard = document.getElementById('btn-cancel-add-card');
  const addCurrentForm = document.getElementById('add-current-form');
  const addSiteInput = document.getElementById('add-site');
  const addUsernameInput = document.getElementById('add-username');
  const addPasswordInput = document.getElementById('add-password');
  const btnGenForAdd = document.getElementById('btn-gen-for-add');

  // Vault Tab
  const vaultSearchInput = document.getElementById('vault-search-input');
  const vaultCardsList = document.getElementById('vault-cards-list');
  const btnOpenWebDashboard = document.getElementById('btn-open-web-dashboard');

  // Generator Tab
  const genPasswordDisplay = document.getElementById('gen-password-display');
  const btnRegenPwd = document.getElementById('btn-regen-pwd');
  const btnCopyGenPwd = document.getElementById('btn-copy-gen-pwd');
  const genLengthSlider = document.getElementById('gen-length-slider');
  const genLengthVal = document.getElementById('gen-length-val');
  const genOptUpper = document.getElementById('gen-opt-upper');
  const genOptLower = document.getElementById('gen-opt-lower');
  const genOptNumbers = document.getElementById('gen-opt-numbers');
  const genOptSymbols = document.getElementById('gen-opt-symbols');
  const genStrengthSegments = document.getElementById('gen-strength-segments');
  const genStrengthText = document.getElementById('gen-strength-text');
  const btnFillCurrentGen = document.getElementById('btn-fill-current-gen');

  // Toast
  const toastEl = document.getElementById('popup-toast');

  let currentTabInfo = null;
  let activeConfig = null;
  let allVaultItems = [];
  let isShowingSettings = false;

  // Theme Management (Light / Dark)
  async function initTheme() {
    const stored = await chrome.storage.local.get(['themePreference']);
    const pref = stored.themePreference || 'system';
    applyTheme(pref);
  }

  function applyTheme(theme) {
    document.documentElement.classList.remove('light', 'dark');
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else if (theme === 'light') {
      document.documentElement.classList.add('light');
    }
  }

  btnThemeToggle.addEventListener('click', async () => {
    const isDark = document.documentElement.classList.contains('dark') ||
      (!document.documentElement.classList.contains('light') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const next = isDark ? 'light' : 'dark';
    applyTheme(next);
    await chrome.storage.local.set({ themePreference: next });
  });

  // Toast Helper
  function showToast(msg, duration = 2000) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => {
      toastEl.classList.remove('show');
    }, duration);
  }

  // Status Indicator
  function setStatus(text, state = 'normal') {
    if (!statusBadge) return;
    const textEl = statusBadge.querySelector('.status-text') || statusBadge;
    textEl.textContent = text;
    statusBadge.className = 'status-indicator';
    if (state === 'online') statusBadge.classList.add('online');
    if (state === 'offline') statusBadge.classList.add('offline');
  }

  // Clipboard copy
  async function copyToClipboard(text, successMsg = '已复制到剪贴板') {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMsg);
    } catch {
      showToast('复制失败，请手动选取');
    }
  }

  // Active Tab
  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0] || null;
  }

  // 5-Segment Password Strength Calculation (Matches server components/password-strength.tsx)
  const strengthLabels = ['非常弱', '弱', '一般', '强', '非常强'];
  const strengthClasses = ['weak', 'fair', 'good', 'strong', 'veryStrong'];

  function evaluateStrength(pwd) {
    if (!pwd) return 0;
    let score = 0;
    if (pwd.length >= 8) score += 1;
    if (pwd.length >= 14) score += 1;
    if (pwd.length >= 20) score += 1;
    if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score += 1;
    if (/[0-9]/.test(pwd)) score += 1;
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1;

    // Convert 0-6 score to 0-4 clamp
    if (score <= 1) return 0; // 非常弱
    if (score <= 2) return 1; // 弱
    if (score <= 3) return 2; // 一般
    if (score <= 4) return 3; // 强
    return 4; // 非常强
  }

  function updateStrengthUI(pwd) {
    const clamped = evaluateStrength(pwd);
    const segs = genStrengthSegments.querySelectorAll('.seg');
    const activeClass = strengthClasses[clamped];

    segs.forEach((seg, idx) => {
      seg.className = 'seg';
      if (idx <= clamped) {
        seg.classList.add(activeClass);
      }
    });

    genStrengthText.textContent = strengthLabels[clamped];
  }

  // Password Generation
  async function triggerGenerate() {
    const length = parseInt(genLengthSlider.value, 10);
    const uppercase = genOptUpper.checked;
    const lowercase = genOptLower.checked;
    const numbers = genOptNumbers.checked;
    const symbols = genOptSymbols.checked;

    if (!uppercase && !lowercase && !numbers && !symbols) {
      genOptLower.checked = true;
    }

    const res = await chrome.runtime.sendMessage({
      type: 'GENERATE_PASSWORD',
      options: { length, uppercase, lowercase, numbers, symbols },
    });

    if (res && res.ok && res.password) {
      genPasswordDisplay.value = res.password;
      updateStrengthUI(res.password);
    }
  }

  // Send fill to active page tab
  async function sendFillToTab(username, password) {
    if (!currentTabInfo || !currentTabInfo.id) {
      showToast('未找到活动网页标签');
      return;
    }
    chrome.tabs.sendMessage(
      currentTabInfo.id,
      { type: 'FILL_CREDENTIAL', username, password },
      () => {
        if (chrome.runtime.lastError) {
          showToast('请刷新当前页面后再尝试填入');
        } else {
          showToast('已填入网页输入框！');
        }
      }
    );
  }

  // Create Card Element matching server UI
  function createPasswordCard(item, showFillButton = true) {
    const card = document.createElement('div');
    card.className = 'password-entry-card';

    const initial = (item.site || 'Key').charAt(0).toUpperCase();
    const siteTitle = escapeHtml(item.site || '未命名网站');
    const displayUrl = item.url ? escapeHtml(item.url.replace(/^https?:\/\//, '')) : '';
    const userText = item.username ? escapeHtml(item.username) : '<span style="color:var(--muted-foreground);font-style:italic;">(无账号)</span>';

    card.innerHTML = `
      <div class="card-top-row">
        <div class="card-avatar-box">${initial}</div>
        <div class="card-meta-col">
          <div class="card-site-title truncate">${siteTitle}</div>
          ${displayUrl ? `<div class="card-url-sub truncate">${displayUrl}</div>` : ''}
        </div>
      </div>
      <div class="card-body-row">
        <div class="card-detail-item">
          <span class="card-detail-label">账号</span>
          <span class="card-detail-value" title="${escapeHtml(item.username || '')}">${userText}</span>
          ${
            item.username
              ? `
          <button class="card-btn-action" data-action="copy-user" title="复制账号">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
            复制
          </button>
          `
              : ''
          }
        </div>
        <div class="card-detail-item">
          <span class="card-detail-label">密码</span>
          <span class="card-detail-value mono card-pwd-text">••••••••••••</span>
          <div class="flex-row-end gap-1">
            <button class="card-btn-action" data-action="reveal-pwd" title="查看/隐藏">
              <svg class="icon-eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="card-btn-action" data-action="copy-pwd" title="复制密码">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
              复制
            </button>
          </div>
        </div>
      </div>
      ${
        showFillButton
          ? `
        <div class="card-footer-buttons">
          <button class="btn btn-primary btn-xs btn-full" data-action="fill-site">
            <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            填入当前网页
          </button>
        </div>
      `
          : ''
      }
    `;

    // Action bindings
    card.querySelector('[data-action="copy-user"]').addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(item.username, '账号已复制');
    });

    const pwdText = card.querySelector('.card-pwd-text');
    const btnReveal = card.querySelector('[data-action="reveal-pwd"]');
    let isRevealed = false;

    btnReveal.addEventListener('click', (e) => {
      e.stopPropagation();
      isRevealed = !isRevealed;
      if (isRevealed) {
        pwdText.textContent = item.password;
        btnReveal.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>';
      } else {
        pwdText.textContent = '••••••••••••';
        btnReveal.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
      }
    });

    card.querySelector('[data-action="copy-pwd"]').addEventListener('click', (e) => {
      e.stopPropagation();
      copyToClipboard(item.password, '密码已复制');
    });

    if (showFillButton) {
      card.querySelector('[data-action="fill-site"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        sendFillToTab(item.username, item.password);
      });
    }

    return card;
  }

  // Load Current Site Credentials
  async function loadCurrentSiteCredentials() {
    currentTabInfo = await getActiveTab();
    let hostname = '';

    if (currentTabInfo && currentTabInfo.url) {
      try {
        const u = new URL(currentTabInfo.url);
        if (u.protocol.startsWith('http')) {
          hostname = u.hostname;
        }
      } catch {
        hostname = '';
      }
    }

    if (!hostname) {
      currentHostnameEl.textContent = '非网页环境';
      btnShowAddCurrent.style.display = 'none';
      currentSiteCards.innerHTML = `
        <div class="empty-box">
          <div class="empty-icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <div class="empty-heading">不支持当前页面</div>
          <p class="empty-subtext">请切换至普通 http/https 网页标签</p>
        </div>
      `;
      return;
    }

    currentHostnameEl.textContent = hostname;
    addSiteInput.value = hostname;
    btnShowAddCurrent.style.display = 'inline-flex';

    currentSiteCards.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted-foreground); font-size:12px;">查找此网站密码...</div>';

    const res = await chrome.runtime.sendMessage({
      type: 'QUERY_CREDENTIALS',
      hostname,
    });

    if (!res || !res.ok) {
      setStatus('异常', 'offline');
      currentSiteCards.innerHTML = `
        <div class="empty-box">
          <div class="empty-heading" style="color: var(--destructive);">${res?.error || '无法获取密码列表'}</div>
          <p class="empty-subtext">请检查 API 服务或网络连接</p>
          <button class="btn btn-outline btn-xs mt-3" id="btn-reconnect-site">重新配置连接</button>
        </div>
      `;
      document.getElementById('btn-reconnect-site')?.addEventListener('click', toggleSettingsView);
      return;
    }

    setStatus('已连接', 'online');
    const items = res.items || [];

    if (items.length === 0) {
      currentSiteCards.innerHTML = `
        <div class="empty-box">
          <div class="empty-icon-circle">
            <!-- KeyRound icon identical to dashboard/page.tsx line 225 -->
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2.586 16.726A2 2 0 0 1 2 15.312V9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v6.312a2 2 0 0 1-.586 1.414l-4 4a2 2 0 0 1-2.828 0l-1.414-1.414a2 2 0 0 0-2.828 0l-1.414 1.414a2 2 0 0 1-2.828 0z"/>
              <circle cx="7.5" cy="11.5" r="1.5"/>
            </svg>
          </div>
          <div class="empty-heading">暂无此站密码</div>
          <p class="empty-subtext">点击上方「新建此站」或在网页登录时自动保存</p>
        </div>
      `;
      return;
    }

    currentSiteCards.innerHTML = '';
    items.forEach((item) => {
      currentSiteCards.appendChild(createPasswordCard(item, true));
    });
  }

  // Load All Vault Credentials
  async function loadVaultCredentials(searchQuery = '') {
    vaultCardsList.innerHTML = '<div style="text-align:center; padding: 24px; color: var(--muted-foreground); font-size:12px;">读取保险库中...</div>';

    const res = await chrome.runtime.sendMessage({
      type: 'LIST_ALL_PASSWORDS',
      search: searchQuery,
    });

    if (!res || !res.ok) {
      vaultCardsList.innerHTML = `
        <div class="empty-box">
          <div class="empty-heading" style="color: var(--destructive);">${res?.error || '无法获取密码列表'}</div>
        </div>
      `;
      return;
    }

    allVaultItems = res.data?.items || [];
    renderVaultList(allVaultItems);
  }

  function renderVaultList(items) {
    if (!items || items.length === 0) {
      vaultCardsList.innerHTML = `
        <div class="empty-box">
          <div class="empty-icon-circle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </div>
          <div class="empty-heading">未找到匹配记录</div>
          <p class="empty-subtext">换个关键词试一试</p>
        </div>
      `;
      return;
    }

    vaultCardsList.innerHTML = '';
    items.forEach((item) => {
      vaultCardsList.appendChild(createPasswordCard(item, false));
    });
  }

  // Toggle Settings View
  function toggleSettingsView() {
    isShowingSettings = !isShowingSettings;
    if (isShowingSettings) {
      viewMain.style.display = 'none';
      viewSetup.style.display = 'flex';
      if (activeConfig) {
        setupApiUrl.value = activeConfig.apiUrl || 'http://localhost:3000';
        setupApiKey.value = activeConfig.apiKey || '';
      }
    } else {
      viewSetup.style.display = 'none';
      viewMain.style.display = 'flex';
    }
  }

  btnToggleSettings.addEventListener('click', toggleSettingsView);

  // Tab Navigation Switching
  tabTriggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      tabTriggers.forEach((t) => t.classList.remove('active'));
      tabPanels.forEach((p) => p.classList.remove('active'));

      trigger.classList.add('active');
      const targetId = trigger.dataset.tab;
      document.getElementById(targetId)?.classList.add('active');

      if (targetId === 'tab-vault') {
        loadVaultCredentials(vaultSearchInput.value);
      } else if (targetId === 'tab-generator') {
        if (!genPasswordDisplay.value) {
          triggerGenerate();
        }
      }
    });
  });

  // Generator Controls
  genLengthSlider.addEventListener('input', () => {
    genLengthVal.textContent = genLengthSlider.value;
    triggerGenerate();
  });

  [genOptUpper, genOptLower, genOptNumbers, genOptSymbols].forEach((cb) => {
    cb.addEventListener('change', triggerGenerate);
  });

  btnRegenPwd.addEventListener('click', triggerGenerate);

  btnCopyGenPwd.addEventListener('click', () => {
    if (genPasswordDisplay.value) {
      copyToClipboard(genPasswordDisplay.value, '强密码已复制');
    }
  });

  btnFillCurrentGen.addEventListener('click', async () => {
    const pwd = genPasswordDisplay.value;
    if (!pwd) return;
    const tab = await getActiveTab();
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'FILL_GENERATED_PASSWORD',
        password: pwd,
      });
      showToast('已填入网页输入框！');
    }
  });

  // Inline Add Card
  btnShowAddCurrent.addEventListener('click', () => {
    addCurrentPanel.style.display = 'block';
    addUsernameInput.focus();
  });

  function closeAddCurrent() {
    addCurrentPanel.style.display = 'none';
    addUsernameInput.value = '';
    addPasswordInput.value = '';
  }

  btnCancelAddCurrent.addEventListener('click', closeAddCurrent);
  btnCancelAddCard.addEventListener('click', closeAddCurrent);

  btnGenForAdd.addEventListener('click', async () => {
    const res = await chrome.runtime.sendMessage({
      type: 'GENERATE_PASSWORD',
      options: { length: 20 },
    });
    if (res && res.ok && res.password) {
      addPasswordInput.value = res.password;
      showToast('已生成强密码');
    }
  });

  addCurrentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const site = addSiteInput.value.trim();
    const username = addUsernameInput.value.trim();
    const password = addPasswordInput.value.trim();
    const url = currentTabInfo?.url || `https://${site}`;

    if (!password) {
      showToast('密码不能为空');
      return;
    }

    const submitBtn = document.getElementById('btn-submit-add-card');
    submitBtn.disabled = true;
    submitBtn.textContent = '保存中...';

    const res = await chrome.runtime.sendMessage({
      type: 'SAVE_CREDENTIAL',
      site,
      url,
      username,
      password,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = '保存记录';

    if (res && res.ok) {
      showToast('密码保存成功！');
      closeAddCurrent();
      await loadCurrentSiteCredentials();
    } else {
      showToast(`保存失败: ${res?.error || '未知错误'}`);
    }
  });

  // Live Vault Search
  let searchTimeout = null;
  vaultSearchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      const q = vaultSearchInput.value.trim().toLowerCase();
      if (!q) {
        renderVaultList(allVaultItems);
      } else {
        const filtered = allVaultItems.filter((i) => {
          return (
            (i.site || '').toLowerCase().includes(q) ||
            (i.username || '').toLowerCase().includes(q) ||
            (i.notes || '').toLowerCase().includes(q) ||
            (i.url || '').toLowerCase().includes(q)
          );
        });
        renderVaultList(filtered);
      }
    }, 200);
  });

  // Open Web Dashboard
  btnOpenWebDashboard.addEventListener('click', () => {
    const base = activeConfig?.apiUrl || 'http://localhost:3000';
    chrome.tabs.create({ url: base });
  });

  // Setup Form Submission
  setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const apiUrl = setupApiUrl.value.trim();
    const apiKey = setupApiKey.value.trim();
    const masterPassword = setupMasterPassword.value.trim();

    setupFeedback.style.display = 'block';
    setupFeedback.className = 'alert-box info';
    setupFeedback.textContent = '正在测试 API 连通性...';
    btnSaveSetup.disabled = true;

    const testRes = await chrome.runtime.sendMessage({
      type: 'TEST_CONNECTION',
      apiUrl,
      apiKey,
      masterPassword,
    });

    if (!testRes || !testRes.ok) {
      setupFeedback.className = 'alert-box error';
      setupFeedback.textContent = `连接失败: ${testRes?.error || '请核对服务地址与 Key'}`;
      btnSaveSetup.disabled = false;
      return;
    }

    // Save
    await chrome.runtime.sendMessage({
      type: 'SAVE_CONFIG',
      apiUrl,
      apiKey,
      masterPassword,
    });

    activeConfig = { apiUrl, apiKey, isConfigured: true };
    setupFeedback.className = 'alert-box success';
    setupFeedback.textContent = '连接成功！正在进入保险库...';

    setTimeout(async () => {
      viewSetup.style.display = 'none';
      viewMain.style.display = 'flex';
      btnSaveSetup.disabled = false;
      setupFeedback.style.display = 'none';
      isShowingSettings = false;
      setStatus('已连接', 'online');
      await loadCurrentSiteCredentials();
      triggerGenerate();
    }, 450);
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Initialize
  async function init() {
    await initTheme();
    activeConfig = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });

    if (!activeConfig || !activeConfig.isConfigured) {
      setStatus('未配置', 'offline');
      viewSetup.style.display = 'flex';
      viewMain.style.display = 'none';
      setupApiUrl.value = activeConfig?.apiUrl || 'http://localhost:3000';
      setupApiKey.focus();
    } else {
      viewSetup.style.display = 'none';
      viewMain.style.display = 'flex';
      setStatus('连接中...');
      await loadCurrentSiteCredentials();
      triggerGenerate();
    }
  }

  await init();
});
