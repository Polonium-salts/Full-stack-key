import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const TOML_PATH = 'wrangler.toml';
const PLACEHOLDER_ID = '00000000000000000000000000000000';

export async function ensureKvNamespace() {
  let toml = readFileSync(TOML_PATH, 'utf8');

  const bindingMatch = toml.match(/\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"([^"]+)"/);
  if (!bindingMatch) return null;
  const bindingName = bindingMatch[1];

  const idMatch = toml.match(/\[\[kv_namespaces\]\][\s\S]*?id\s*=\s*"([^"]*)"/);
  const currentId = idMatch ? idMatch[1] : '';

  // 如果已经配置了合法的 32 位 hex ID（非占位符），直接复用
  if (currentId && currentId !== PLACEHOLDER_ID && /[1-9a-f]/i.test(currentId)) {
    return currentId;
  }

  const projectName = toml.match(/^name\s*=\s*"([^"]+)"/m)?.[1] || 'full-stack-key';
  const expectedTitle = `${projectName}-${bindingName}`;

  console.log(`[ensure-kv] 正在为绑定 ${bindingName} 自动获取或创建真实 KV 命名空间...`);

  let resolvedId = null;

  // 1. 若存在 CLOUDFLARE_API_TOKEN，直接通过 Cloudflare 官方 REST API 获取（CI 环境极速直连）
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (apiToken) {
    try {
      let accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      if (!accountId) {
        const accRes = await fetch('https://api.cloudflare.com/client/v4/accounts', {
          headers: { Authorization: `Bearer ${apiToken}` },
        });
        const accJson = await accRes.json();
        accountId = accJson?.result?.[0]?.id || '2b61309eab74a1f396c219096ae178ec';
      }

      // 查询已有的 KV 命名空间列表
      const listRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces?per_page=100`,
        { headers: { Authorization: `Bearer ${apiToken}` } }
      );
      const listJson = await listRes.json();
      if (listJson.success && Array.isArray(listJson.result)) {
        const found = listJson.result.find(
          (ns) => ns.title === expectedTitle || ns.title === bindingName
        );
        if (found) {
          resolvedId = found.id;
          console.log(`[ensure-kv] 发现已存在的 KV 命名空间 "${found.title}"，复用 ID: ${resolvedId}`);
        }
      }

      // 若未存在，则通过 API 自动创建
      if (!resolvedId) {
        console.log(`[ensure-kv] 正在创建新的 KV 命名空间 "${expectedTitle}"...`);
        const createRes = await fetch(
          `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ title: expectedTitle }),
          }
        );
        const createJson = await createRes.json();
        if (createJson.success && createJson.result?.id) {
          resolvedId = createJson.result.id;
          console.log(`[ensure-kv] 创建成功，ID: ${resolvedId}`);
        }
      }
    } catch (e) {
      console.warn('[ensure-kv] REST API 获取失败，回退到 wrangler CLI:', e.message);
    }
  }

  // 2. 本地回退：使用 wrangler CLI 查询 / 创建
  if (!resolvedId) {
    try {
      const listCmd = spawnSync(
        process.execPath,
        ['node_modules/wrangler/bin/wrangler.js', 'kv', 'namespace', 'list'],
        { encoding: 'utf8' }
      );
      if (listCmd.status === 0) {
        const start = listCmd.stdout.indexOf('[');
        const end = listCmd.stdout.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
          const namespaces = JSON.parse(listCmd.stdout.slice(start, end + 1));
          const found = namespaces.find(
            (ns) => ns.title === expectedTitle || ns.title === bindingName
          );
          if (found) resolvedId = found.id;
        }
      }

      if (!resolvedId) {
        const createCmd = spawnSync(
          process.execPath,
          ['node_modules/wrangler/bin/wrangler.js', 'kv', 'namespace', 'create', bindingName],
          { encoding: 'utf8' }
        );
        const matched = (createCmd.stdout + createCmd.stderr).match(/id\s*=\s*"([0-9a-f]{32})"/i);
        if (matched) resolvedId = matched[1];
      }
    } catch (e) {
      console.warn('[ensure-kv] wrangler CLI 获取失败:', e.message);
    }
  }

  // 3. 将真实 ID 自动持久化写入 wrangler.toml
  if (resolvedId) {
    if (/id\s*=\s*"[^"]*"/.test(toml)) {
      toml = toml.replace(/id\s*=\s*"[^"]*"/, `id = "${resolvedId}"`);
    } else {
      toml = toml.replace(
        new RegExp(`(binding\\s*=\\s*"${bindingName}"[^\n]*)`),
        `$1\nid = "${resolvedId}"`
      );
    }
    writeFileSync(TOML_PATH, toml, 'utf8');
    console.log(`[ensure-kv] ✓ 已将真实 KV 命名空间 ID (${resolvedId}) 自动写入 ${TOML_PATH}`);
    return resolvedId;
  }

  return null;
}

if (process.argv[1] && process.argv[1].endsWith('ensure-kv.mjs')) {
  ensureKvNamespace().catch(console.error);
}
