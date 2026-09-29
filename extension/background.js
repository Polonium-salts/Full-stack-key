/**
 * KeyVault Chrome Extension - Background Service Worker (Manifest V3)
 */

const DEFAULT_CONFIG = {
  apiUrl: 'http://localhost:3000',
  apiKey: '',
  masterPassword: '',
};

// Initialize default storage on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['apiUrl', 'apiKey', 'masterPassword']);
  if (!current.apiUrl) {
    await chrome.storage.local.set(DEFAULT_CONFIG);
  }

  // Create context menus
  chrome.contextMenus.create({
    id: 'keyvault-generate',
    title: '🔐 生成高强度随机密码',
    contexts: ['editable', 'page'],
  });

  chrome.contextMenus.create({
    id: 'keyvault-open-vault',
    title: '🗂️ 打开密码保险库设置',
    contexts: ['action'],
  });
});

// Handle context menus
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'keyvault-generate') {
    const password = generatePassword({ length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'FILL_GENERATED_PASSWORD',
        password,
      });
    }
  } else if (info.menuItemId === 'keyvault-open-vault') {
    chrome.runtime.openOptionsPage();
  }
});

// Helper: Normalize API Base URL
function cleanUrl(url) {
  if (!url) return 'http://localhost:3000';
  let cleaned = url.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(cleaned)) {
    cleaned = 'http://' + cleaned;
  }
  return cleaned;
}

// Helper: Generate Secure Password
function generatePassword(options = {}) {
  const length = Math.max(8, Math.min(64, options.length || 20));
  const uppercase = options.uppercase !== false;
  const lowercase = options.lowercase !== false;
  const numbers = options.numbers !== false;
  const symbols = options.symbols !== false;

  const upperChars = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowerChars = 'abcdefghijkmnopqrstuvwxyz';
  const numberChars = '23456789';
  const symbolChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  let pool = '';
  const guaranteed = [];

  if (uppercase) {
    pool += upperChars;
    guaranteed.push(upperChars[Math.floor(Math.random() * upperChars.length)]);
  }
  if (lowercase) {
    pool += lowerChars;
    guaranteed.push(lowerChars[Math.floor(Math.random() * lowerChars.length)]);
  }
  if (numbers) {
    pool += numberChars;
    guaranteed.push(numberChars[Math.floor(Math.random() * numberChars.length)]);
  }
  if (symbols) {
    pool += symbolChars;
    guaranteed.push(symbolChars[Math.floor(Math.random() * symbolChars.length)]);
  }

  if (!pool) pool = lowerChars + numberChars;

  const array = new Uint32Array(length);
  crypto.getRandomValues(array);

  const result = [...guaranteed];
  for (let i = guaranteed.length; i < length; i++) {
    result.push(pool[array[i] % pool.length]);
  }

  // Shuffle
  for (let i = result.length - 1; i > 0; i--) {
    const j = array[i] % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result.join('');
}

// 按名称查找标签，不存在则创建，返回标签 ID（find-or-create）
async function findOrCreateTagId(name) {
  const res = await apiRequest('/api/tags', 'POST', { name });
  if (!res.ok) return null;
  return res.data?.id || null;
}

// API Client
async function apiRequest(endpoint, method = 'GET', body = null) {
  const config = await chrome.storage.local.get(['apiUrl', 'apiKey', 'masterPassword']);
  const apiUrl = cleanUrl(config.apiUrl);
  const apiKey = config.apiKey ? config.apiKey.trim() : '';

  if (!apiKey) {
    return { ok: false, error: '请先在插件中填写 API Key' };
  }

  const headers = {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  };

  if (config.masterPassword) {
    headers['X-Master-Password'] = config.masterPassword;
  }

  try {
    const res = await fetch(`${apiUrl}${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const json = await res.json().catch(() => null);

    if (!res.ok) {
      const msg = json?.error?.message || json?.message || `请求失败 (${res.status})`;
      return { ok: false, error: msg, status: res.status };
    }

    return { ok: true, data: json?.data };
  } catch (err) {
    return { ok: false, error: `无法连接到服务: ${err.message}` };
  }
}

// Message Dispatcher
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = async () => {
    switch (message.type) {
      case 'GET_CONFIG': {
        const conf = await chrome.storage.local.get(['apiUrl', 'apiKey', 'masterPassword']);
        return {
          apiUrl: cleanUrl(conf.apiUrl),
          apiKey: conf.apiKey || '',
          hasMasterPassword: !!conf.masterPassword,
          isConfigured: !!(conf.apiKey && conf.apiKey.trim()),
        };
      }

      case 'SAVE_CONFIG': {
        const { apiUrl, apiKey, masterPassword } = message;
        await chrome.storage.local.set({
          apiUrl: cleanUrl(apiUrl),
          apiKey: (apiKey || '').trim(),
          masterPassword: (masterPassword || '').trim(),
        });
        return { ok: true };
      }

      case 'TEST_CONNECTION': {
        const targetUrl = cleanUrl(message.apiUrl);
        const targetKey = (message.apiKey || '').trim();
        const targetMasterPassword = (message.masterPassword || '').trim();

        if (!targetKey) {
          return { ok: false, error: '请输入 API Key' };
        }

        try {
          const headers = {
            'Content-Type': 'application/json',
            'X-API-Key': targetKey,
          };
          if (targetMasterPassword) {
            headers['X-Master-Password'] = targetMasterPassword;
          }

          // Test passwords endpoint
          const res = await fetch(`${targetUrl}/api/passwords?perPage=1`, {
            method: 'GET',
            headers,
          });

          const json = await res.json().catch(() => null);
          if (res.ok) {
            return { ok: true, count: json?.data?.total ?? 0 };
          }

          return { ok: false, error: json?.error?.message || `连接失败 (${res.status})` };
        } catch (err) {
          return { ok: false, error: `网络请求失败: ${err.message}` };
        }
      }

      case 'QUERY_CREDENTIALS': {
        const { hostname } = message;
        if (!hostname) return { ok: true, items: [] };

        const res = await apiRequest('/api/passwords?perPage=100');
        if (!res.ok) return res;

        const allItems = res.data?.items || [];
        const cleanHost = hostname.toLowerCase().replace(/^www\./, '');

        // Match site or url containing hostname or root domain
        const matched = allItems.filter((item) => {
          if (item.trashed) return false;
          const site = (item.site || '').toLowerCase();
          const url = (item.url || '').toLowerCase();
          return (
            site.includes(cleanHost) ||
            cleanHost.includes(site) ||
            url.includes(cleanHost) ||
            cleanHost.includes(url)
          );
        });

        return { ok: true, items: matched, total: allItems.length };
      }

      case 'LIST_ALL_PASSWORDS': {
        const query = message.search ? `&search=${encodeURIComponent(message.search)}` : '';
        return await apiRequest(`/api/passwords?perPage=200${query}`);
      }

      case 'SAVE_CREDENTIAL': {
        const { id, site, url, username, password, notes } = message;
        if (!password) {
          return { ok: false, error: '密码不能为空' };
        }

        if (id) {
          return await apiRequest(`/api/passwords/${id}`, 'PUT', {
            site: site || new URL(url).hostname,
            url,
            username: username || '',
            password,
            notes: notes || '由密码保险库浏览器插件更新',
          });
        }

        // 先确保「chrome-extension」标签存在，再以标签 ID 引用
        const tagId = await findOrCreateTagId('chrome-extension');

        return await apiRequest('/api/passwords', 'POST', {
          site: site || new URL(url).hostname,
          url,
          username: username || '',
          password,
          notes: notes || '由密码保险库浏览器插件保存',
          tags: tagId ? [tagId] : [],
        });
      }

      case 'IGNORE_DOMAIN': {
        const { domain } = message;
        if (!domain) return { ok: false };
        const stored = await chrome.storage.local.get(['neverAskDomains']);
        const list = stored.neverAskDomains || [];
        if (!list.includes(domain)) {
          list.push(domain);
          await chrome.storage.local.set({ neverAskDomains: list });
        }
        return { ok: true };
      }

      case 'CHECK_DOMAIN_IGNORED': {
        const { domain } = message;
        if (!domain) return { ok: true, ignored: false };
        const stored = await chrome.storage.local.get(['neverAskDomains']);
        const list = stored.neverAskDomains || [];
        return { ok: true, ignored: list.includes(domain) };
      }

      case 'GENERATE_PASSWORD': {
        const password = generatePassword(message.options || {});
        return { ok: true, password };
      }

      default:
        return { ok: false, error: `未知消息类型: ${message.type}` };
    }
  };

  handler().then(sendResponse).catch((err) => {
    sendResponse({ ok: false, error: err.message });
  });

  return true; // Keep message channel open for async response
});
