/**
 * KeyVault Chrome Extension - Content Script
 * 自动检测表单、自动填充、生成密码、自动捕获并提示保存密码
 */

(function () {
  // Prevent duplicate injection
  if (window.__keyvault_injected__) return;
  window.__keyvault_injected__ = true;

  let cachedCredentials = [];
  let isChecking = false;

  // SVG Icons
  const SHIELD_ICON_SVG = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
      <path d="m9 12 2 2 4-4"/>
    </svg>
  `;

  const SAVE_ICON_SVG = `
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
      <polyline points="17 21 17 13 7 13 7 21"/>
      <polyline points="7 3 7 8 15 8"/>
    </svg>
  `;

  const CHECK_ICON_SVG = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  `;

  // Native input value setter to trigger React/Vue synthetic events
  function setNativeValue(element, value) {
    const valueSetter = Object.getOwnPropertyDescriptor(element, 'value')?.set;
    const prototype = Object.getPrototypeOf(element);
    const prototypeValueSetter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;

    if (prototypeValueSetter && valueSetter !== prototypeValueSetter) {
      prototypeValueSetter.call(element, value);
    } else if (valueSetter) {
      valueSetter.call(element, value);
    } else {
      element.value = value;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  // Find associated username input for a password input
  function findUsernameInput(pwdInput) {
    const form = pwdInput.form;
    const inputs = form
      ? Array.from(form.querySelectorAll('input:not([type="hidden"]):not([type="password"])'))
      : Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"])'));

    // Check by autocomplete/name attributes
    for (const input of inputs) {
      const name = (input.name || '').toLowerCase();
      const id = (input.id || '').toLowerCase();
      const auto = (input.autocomplete || '').toLowerCase();
      const type = (input.type || '').toLowerCase();

      if (auto.includes('username') || auto.includes('email')) return input;
      if (name.includes('user') || name.includes('email') || name.includes('login') || name.includes('account')) return input;
      if (id.includes('user') || id.includes('email') || id.includes('login') || id.includes('account')) return input;
      if (type === 'email') return input;
    }

    // Default to the input immediately preceding the password input
    const allInputs = form ? Array.from(form.querySelectorAll('input')) : Array.from(document.querySelectorAll('input'));
    const pwdIndex = allInputs.indexOf(pwdInput);
    for (let i = pwdIndex - 1; i >= 0; i--) {
      const candidate = allInputs[i];
      if (candidate.type === 'text' || candidate.type === 'email' || !candidate.type) {
        return candidate;
      }
    }

    return null;
  }

  // Load credentials for the current page
  async function loadCredentials() {
    if (isChecking) return;
    isChecking = true;
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'QUERY_CREDENTIALS',
        hostname: window.location.hostname,
      });

      if (res && res.ok && Array.isArray(res.items)) {
        cachedCredentials = res.items;
      }
    } catch {
      // Background worker might be sleeping
    } finally {
      isChecking = false;
    }
  }

  // Attach auto-fill badges to inputs
  function attachBadges() {
    const passwordInputs = document.querySelectorAll('input[type="password"]:not([data-keyvault-bound])');

    passwordInputs.forEach((pwdInput) => {
      pwdInput.setAttribute('data-keyvault-bound', 'true');
      const userInput = findUsernameInput(pwdInput);

      // Wrapper check
      const wrapper = document.createElement('div');
      wrapper.className = 'keyvault-input-badge-wrapper';

      const badge = document.createElement('div');
      badge.className = 'keyvault-input-badge';
      badge.innerHTML = SHIELD_ICON_SVG;
      badge.title = '密码保险库 - 快捷自动填充';

      // Position badge inside or next to input
      positionBadge(badge, pwdInput);

      badge.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showDropdown(pwdInput, userInput, badge);
      });

      pwdInput.addEventListener('focus', () => {
        if (cachedCredentials.length > 0) {
          showDropdown(pwdInput, userInput, badge);
        }
      });
    });
  }

  function positionBadge(badge, input) {
    document.body.appendChild(badge);

    function updatePos() {
      if (!input.isConnected) {
        badge.remove();
        return;
      }
      const rect = input.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || rect.top < -50 || rect.bottom > window.innerHeight + 50) {
        badge.style.display = 'none';
        return;
      }
      badge.style.display = 'flex';
      badge.style.position = 'fixed';
      badge.style.top = `${rect.top + (rect.height - 24) / 2}px`;
      badge.style.left = `${rect.right - 28}px`;
      badge.style.zIndex = '2147483640';
    }

    updatePos();
    window.addEventListener('scroll', updatePos, { passive: true });
    window.addEventListener('resize', updatePos, { passive: true });
  }

  // Floating dropdown for filling or generating password
  function showDropdown(pwdInput, userInput, anchorEl) {
    removeExistingDropdown();

    const dropdown = document.createElement('div');
    dropdown.id = 'keyvault-dropdown';
    dropdown.className = 'keyvault-floating-dropdown';

    let contentHtml = `<div class="keyvault-dropdown-header">密码保险库</div>`;

    if (cachedCredentials.length > 0) {
      contentHtml += `<div class="keyvault-dropdown-section-title">匹配的已保存账号</div>`;
      cachedCredentials.forEach((item, index) => {
        contentHtml += `
          <div class="keyvault-dropdown-item" data-index="${index}">
            <div class="keyvault-dropdown-username">${escapeHtml(item.username)}</div>
            <div class="keyvault-dropdown-site">${escapeHtml(item.site || window.location.hostname)}</div>
          </div>
        `;
      });
    }

    contentHtml += `
      <div class="keyvault-dropdown-divider"></div>
      <div class="keyvault-dropdown-item keyvault-action-remember" id="keyvault-btn-remember">
        <span class="keyvault-item-icon">${SAVE_ICON_SVG}</span>
        <span>记住此网站账号密码...</span>
      </div>
      <div class="keyvault-dropdown-item keyvault-action-generate" id="keyvault-btn-generate">
        <span class="keyvault-item-icon">${SHIELD_ICON_SVG}</span>
        <span>生成高强度随机密码</span>
      </div>
    `;

    dropdown.innerHTML = contentHtml;
    document.body.appendChild(dropdown);

    // Position dropdown under anchor
    const rect = anchorEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 6}px`;
    dropdown.style.right = `${window.innerWidth - rect.right}px`;

    // Click account to autofill
    dropdown.querySelectorAll('.keyvault-dropdown-item[data-index]').forEach((el) => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.getAttribute('data-index'), 10);
        const cred = cachedCredentials[idx];
        if (cred) {
          if (userInput) setNativeValue(userInput, cred.username);
          if (pwdInput) setNativeValue(pwdInput, cred.password);
          showToast(`已自动填充「${cred.username}」`);
        }
        removeExistingDropdown();
      });
    });

    // Click remember current account & password
    const rememberBtn = dropdown.querySelector('#keyvault-btn-remember');
    if (rememberBtn) {
      rememberBtn.addEventListener('click', () => {
        removeExistingDropdown();
        const currentUsername = userInput ? userInput.value.trim() : '';
        const currentPassword = pwdInput ? pwdInput.value : '';
        showSavePrompt({
          site: document.title || window.location.hostname,
          url: window.location.href,
          username: currentUsername,
          password: currentPassword,
        }, true);
      });
    }

    // Click generate password
    const genBtn = dropdown.querySelector('#keyvault-btn-generate');
    if (genBtn) {
      genBtn.addEventListener('click', async () => {
        try {
          const res = await chrome.runtime.sendMessage({
            type: 'GENERATE_PASSWORD',
            options: { length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true },
          });
          if (res && res.ok && res.password) {
            setNativeValue(pwdInput, res.password);
            try {
              await navigator.clipboard.writeText(res.password);
              showToast('强密码已生成并填入（已复制到剪贴板）');
            } catch {
              showToast('强密码已生成并填入');
            }
          }
        } catch (err) {
          console.error(err);
        }
        removeExistingDropdown();
      });
    }

    // Dismiss on outside click
    setTimeout(() => {
      document.addEventListener('click', function onDocClick(e) {
        if (!dropdown.contains(e.target) && e.target !== anchorEl) {
          removeExistingDropdown();
          document.removeEventListener('click', onDocClick);
        }
      });
    }, 10);
  }

  function removeExistingDropdown() {
    const old = document.getElementById('keyvault-dropdown');
    if (old) old.remove();
  }

  // --- Auto Capture & Prompt to Save Password ---
  let lastCapturedCred = null;

  function monitorFormSubmissions() {
    // 1. Listen to form submits
    document.addEventListener('submit', (e) => {
      const form = e.target;
      if (!(form instanceof HTMLFormElement)) return;
      captureFromForm(form);
    }, true);

    // 2. Listen to Enter in password inputs
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target instanceof HTMLInputElement && e.target.type === 'password') {
        const form = e.target.form || e.target.closest('form');
        if (form) {
          captureFromForm(form);
        } else {
          captureSingle(e.target);
        }
      }
    }, true);

    // 3. Listen to submit button clicks
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('button, input[type="submit"]');
      if (!btn) return;
      const form = btn.form || btn.closest('form');
      if (form) {
        captureFromForm(form);
      }
    }, true);
  }

  function captureFromForm(form) {
    const pwdInput = form.querySelector('input[type="password"]');
    if (!pwdInput || !pwdInput.value) return;

    const userInput = findUsernameInput(pwdInput);
    const username = userInput ? userInput.value.trim() : '';
    const password = pwdInput.value;

    if (!password) return;

    lastCapturedCred = {
      site: document.title || window.location.hostname,
      url: window.location.href,
      username,
      password,
    };

    // Show prompt with a small delay so user sees submission
    setTimeout(() => {
      showSavePrompt(lastCapturedCred);
    }, 800);
  }

  function captureSingle(pwdInput) {
    if (!pwdInput || !pwdInput.value) return;
    const userInput = findUsernameInput(pwdInput);
    const username = userInput ? userInput.value.trim() : '';

    lastCapturedCred = {
      site: document.title || window.location.hostname,
      url: window.location.href,
      username,
      password: pwdInput.value,
    };

    setTimeout(() => {
      showSavePrompt(lastCapturedCred);
    }, 800);
  }

  // --- Remember Password / Account Confirmation Modal ---
  async function showSavePrompt(cred, forceShow = false) {
    if (!cred) return;
    if (!forceShow && !cred.password) return;

    const hostname = window.location.hostname;

    // Check if domain is ignored by user
    if (!forceShow) {
      const checkRes = await chrome.runtime.sendMessage({
        type: 'CHECK_DOMAIN_IGNORED',
        domain: hostname,
      });
      if (checkRes && checkRes.ignored) return;
    }

    // Check if existing credential exists in cache for this username
    const existing = cachedCredentials.find((c) => {
      const cUser = (c.username || '').trim().toLowerCase();
      const nUser = (cred.username || '').trim().toLowerCase();
      return cUser === nUser;
    });

    // If exact same username & password already saved and not manual click, skip prompt
    if (!forceShow && existing && existing.password === cred.password) {
      return;
    }

    const isUpdate = !!(existing && existing.password !== cred.password);
    const existingId = existing?.id;

    // Remove any previous prompt or backdrop
    const oldPrompt = document.getElementById('keyvault-save-prompt');
    if (oldPrompt) oldPrompt.remove();
    const oldBackdrop = document.getElementById('keyvault-save-backdrop');
    if (oldBackdrop) oldBackdrop.remove();

    // Create backdrop overlay
    const backdrop = document.createElement('div');
    backdrop.id = 'keyvault-save-backdrop';
    backdrop.className = 'keyvault-confirm-backdrop';
    document.body.appendChild(backdrop);

    // Create modal banner
    const banner = document.createElement('div');
    banner.id = 'keyvault-save-prompt';
    banner.className = 'keyvault-save-banner';

    const titleText = isUpdate ? '更新密码确认' : '记住密码确认';
    const badgeHtml = isUpdate
      ? '<span class="keyvault-badge-tag keyvault-badge-update">更新</span>'
      : '<span class="keyvault-badge-tag">记住</span>';
    const subText = isUpdate
      ? (cred.username ? `检测到账号「${escapeHtml(cred.username)}」的密码已发生变更` : `检测到此网站的密码已发生变更`)
      : `是否将此网站的密码保存到密码保险库？`;
    const saveBtnText = isUpdate ? '确认更新密码' : '确认记住并保存';

    banner.innerHTML = `
      <div class="keyvault-banner-card">
        <div class="keyvault-banner-header">
          <div class="keyvault-banner-icon">${SHIELD_ICON_SVG}</div>
          <div class="keyvault-banner-title-box">
            <div class="keyvault-banner-title-row">
              <span class="keyvault-banner-title">${titleText}</span>
              ${badgeHtml}
            </div>
            <div class="keyvault-banner-subtitle">${subText}</div>
          </div>
          <button class="keyvault-banner-close" id="keyvault-banner-close">&times;</button>
        </div>
        <div class="keyvault-banner-body">
          <div class="keyvault-banner-field">
            <label>网站标识</label>
            <input type="text" id="keyvault-save-site" value="${escapeHtml(cred.site || hostname)}" />
          </div>
          <div class="keyvault-banner-field">
            <label>账号 / 用户名（可选）</label>
            <input type="text" id="keyvault-save-username" value="${escapeHtml(cred.username || '')}" placeholder="输入账号或留空" />
          </div>
          <div class="keyvault-banner-field">
            <label>密码</label>
            <div class="keyvault-password-wrapper">
              <input type="password" id="keyvault-save-password" value="${escapeHtml(cred.password)}" placeholder="输入密码" />
              <button type="button" class="keyvault-eye-btn" id="keyvault-eye-toggle">👁️</button>
            </div>
          </div>
          <label class="keyvault-checkbox-row">
            <input type="checkbox" id="keyvault-opt-never-ask" />
            <span>对此网站不再提示保存</span>
          </label>
        </div>
        <div class="keyvault-banner-footer">
          <button class="keyvault-btn-cancel" id="keyvault-banner-cancel">暂不记住</button>
          <button class="keyvault-btn-save" id="keyvault-banner-save">${saveBtnText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Toggle password mask
    const eyeBtn = banner.querySelector('#keyvault-eye-toggle');
    const pwdEl = banner.querySelector('#keyvault-save-password');
    if (eyeBtn && pwdEl) {
      eyeBtn.addEventListener('click', () => {
        pwdEl.type = pwdEl.type === 'password' ? 'text' : 'password';
      });
    }

    // Dismiss helper
    const dismiss = () => {
      banner.classList.add('keyvault-fade-out');
      backdrop.style.opacity = '0';
      backdrop.style.transition = 'opacity 0.2s';
      setTimeout(() => {
        banner.remove();
        backdrop.remove();
      }, 200);
    };

    // Close on backdrop click
    backdrop.addEventListener('click', dismiss);

    // Close / Cancel buttons
    const closeBtn = banner.querySelector('#keyvault-banner-close');
    const cancelBtn = banner.querySelector('#keyvault-banner-cancel');
    const neverAskCb = banner.querySelector('#keyvault-opt-never-ask');

    async function handleNeverAskIfChecked() {
      if (neverAskCb && neverAskCb.checked) {
        await chrome.runtime.sendMessage({
          type: 'IGNORE_DOMAIN',
          domain: hostname,
        });
      }
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', async () => {
        await handleNeverAskIfChecked();
        dismiss();
      });
    }
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        await handleNeverAskIfChecked();
        dismiss();
      });
    }

    // Save / Update Confirm
    const saveBtn = banner.querySelector('#keyvault-banner-save');
    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const finalSite = banner.querySelector('#keyvault-save-site').value.trim() || hostname;
        const finalUser = banner.querySelector('#keyvault-save-username').value.trim();
        const finalPwd = banner.querySelector('#keyvault-save-password').value;

        if (!finalPwd) {
          showToast('密码不能为空');
          return;
        }

        saveBtn.disabled = true;
        saveBtn.innerText = '正在保存...';

        await handleNeverAskIfChecked();

        try {
          const res = await chrome.runtime.sendMessage({
            type: 'SAVE_CREDENTIAL',
            id: isUpdate ? existingId : undefined,
            site: finalSite,
            url: cred.url || window.location.href,
            username: finalUser,
            password: finalPwd,
          });

          if (res && res.ok) {
            banner.querySelector('.keyvault-banner-card').innerHTML = `
              <div class="keyvault-save-success">
                <div class="keyvault-success-icon">${CHECK_ICON_SVG}</div>
                <div class="keyvault-success-text">${isUpdate ? '已成功更新密码！' : '已成功记住密码账号！'}</div>
              </div>
            `;
            // Refresh local cache
            if (isUpdate && existing) {
              existing.password = finalPwd;
              existing.site = finalSite;
            } else {
              cachedCredentials.push({
                id: res.data?.id,
                site: finalSite,
                username: finalUser,
                password: finalPwd,
              });
            }
            setTimeout(dismiss, 1200);
          } else {
            showToast('保存失败: ' + (res?.error || '请检查 API 密钥'));
            saveBtn.disabled = false;
            saveBtn.innerText = saveBtnText;
          }
        } catch (err) {
          showToast('保存失败: ' + err.message);
          saveBtn.disabled = false;
          saveBtn.innerText = saveBtnText;
        }
      });
    }
  }

  // Toast notification
  function showToast(msg) {
    const old = document.getElementById('keyvault-toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.id = 'keyvault-toast';
    toast.className = 'keyvault-toast';
    toast.innerText = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('keyvault-toast-visible');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('keyvault-toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  }

  // Listen to background messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'FILL_GENERATED_PASSWORD') {
      const activeEl = document.activeElement;
      if (activeEl instanceof HTMLInputElement && (activeEl.type === 'password' || activeEl.type === 'text')) {
        setNativeValue(activeEl, message.password);
        showToast('已填入强随机密码');
      } else {
        const pwdInput = document.querySelector('input[type="password"]');
        if (pwdInput) {
          setNativeValue(pwdInput, message.password);
          showToast('已填入强随机密码');
        }
      }
    } else if (message.type === 'FILL_CREDENTIAL') {
      const { username, password } = message;
      const pwdInput = document.querySelector('input[type="password"]');
      if (pwdInput) {
        const userInput = findUsernameInput(pwdInput);
        if (userInput && username) setNativeValue(userInput, username);
        if (password) setNativeValue(pwdInput, password);
        showToast('已填入账号和密码');
      } else {
        showToast('未在当前网页找到密码输入框');
      }
    }
  });

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Init
  loadCredentials().then(() => {
    attachBadges();
    monitorFormSubmissions();

    // Observe dynamic elements (SPAs)
    const observer = new MutationObserver(() => {
      attachBadges();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
})();
