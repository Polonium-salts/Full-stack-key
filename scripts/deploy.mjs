#!/usr/bin/env node
/**
 * 自动化 Cloudflare Pages 部署与 KV 绑定脚本
 *
 * 用户只需在 wrangler.toml 中填写 KV 绑定名（binding），其余全自动：
 *   1. 校验 wrangler 登录状态
 *   2. 按绑定名自动创建/匹配 KV 命名空间，并把真实 ID 自动回写到 wrangler.toml（无需手动填写 id）
 *   3. 自动创建 Pages 项目（如不存在）
 *   4. 自动生成随机 SESSION_SECRET 并写入项目 Secret
 *   5. next build + wrangler pages deploy（KV 绑定随 wrangler.toml 自动生效）
 *
 * 用法：
 *   npm run cf:bind-kv               # 仅绑定/创建 KV 命名空间并自动回写 id 到 wrangler.toml
 *   npm run cf:deploy                # 自动绑定 KV + 构建 + 部署
 *   npm run cf:deploy:skip-build     # 跳过构建直接部署
 */

import { spawnSync, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';

const WRANGLER_BIN = 'node_modules/wrangler/bin/wrangler.js';
const SKIP_BUILD = process.argv.includes('--skip-build');
const BIND_ONLY = process.argv.includes('--bind-only');

function log(msg) {
  console.log(`\x1b[36m[deploy]\x1b[0m ${msg}`);
}

function die(msg) {
  cleanTempConfig();
  console.error(`\x1b[31m[deploy] ✗ ${msg}\x1b[0m`);
  process.exit(1);
}

let tempConfigPath = null;
function cleanTempConfig() {
  if (tempConfigPath) {
    try { unlinkSync(tempConfigPath); } catch {}
    tempConfigPath = null;
  }
}
process.on('exit', cleanTempConfig);
process.on('SIGINT', () => { cleanTempConfig(); process.exit(1); });
process.on('SIGTERM', () => { cleanTempConfig(); process.exit(1); });

function wrangler(args, opts = {}) {
  const extraArgs = tempConfigPath ? ['-c', tempConfigPath] : [];
  const res = spawnSync(process.execPath, [WRANGLER_BIN, ...args, ...extraArgs], {
    encoding: 'utf8',
    ...opts,
  });
  return {
    ok: res.status === 0,
    out: (res.stdout || '') + (res.stderr || ''),
    stdout: res.stdout || '',
    stderr: res.stderr || '',
  };
}

function wranglerInherit(args) {
  const extraArgs = tempConfigPath ? ['-c', tempConfigPath] : [];
  const res = spawnSync(process.execPath, [WRANGLER_BIN, ...args, ...extraArgs], {
    stdio: 'inherit',
  });
  return { ok: res.status === 0 };
}

/* ---------- 1. 解析 wrangler.toml ---------- */

const TOML_PATH = 'wrangler.toml';
let toml;
try {
  toml = readFileSync(TOML_PATH, 'utf8');
} catch {
  die('找不到 wrangler.toml，请在项目根目录运行此脚本');
}

const projectName = toml.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
if (!projectName) die('wrangler.toml 中缺少 name 字段');

// 解析 [[kv_namespaces]] 配置块
let kvBinding = null;
let kvNamespaceId = '';

const kvBlockMatch = toml.match(/\[\[kv_namespaces\]\]([\s\S]*?)(?=\n\s*\[|$)/);
if (kvBlockMatch) {
  const body = kvBlockMatch[1];
  kvBinding = body.match(/binding\s*=\s*"([^"]+)"/)?.[1] || null;
  const idMatch = body.match(/id\s*=\s*"([^"]*)"/);
  if (idMatch) {
    kvNamespaceId = idMatch[1];
  }
}

// 若 [[kv_namespaces]] 未配置 binding，回退至 vars.KV_MAIN_BINDING
const declaredMainBinding = toml.match(/^KV_MAIN_BINDING\s*=\s*"([^"]+)"/m)?.[1];
if (!kvBinding && declaredMainBinding) {
  kvBinding = declaredMainBinding;
}

if (!kvBinding) {
  die('wrangler.toml 中未找到 KV 绑定名（请配置 [[kv_namespaces]].binding 或 vars.KV_MAIN_BINDING）');
}

if (declaredMainBinding && kvBinding && declaredMainBinding !== kvBinding) {
  die(
    `KV_MAIN_BINDING ("${declaredMainBinding}") 与 [[kv_namespaces]].binding ("${kvBinding}") 不一致，请先统一后再执行`
  );
}

// 零占位 ID 视为“未设置”
const PLACEHOLDER_ID = '00000000000000000000000000000000';
const isPlaceholderId = (id) => !id || !/[1-9a-f]/i.test(id) || id === PLACEHOLDER_ID;
if (isPlaceholderId(kvNamespaceId)) {
  kvNamespaceId = '';
}

console.log(`\n========== 密码管理器 · Cloudflare KV 自动绑定与部署 ==========`);
log(`Pages 项目名: ${projectName}`);
log(`KV 绑定名:   ${kvBinding}${kvNamespaceId ? '（已有真实 ID，将复用）' : '（ID 待自动生成/获取）'}\n`);

/* ---------- 2. 辅助函数：更新或插入 KV ID ---------- */

function updateOrInsertKvId(tomlContent, binding, id) {
  const kvSectionRegex = /\[\[kv_namespaces\]\]([\s\S]*?)(?=\n\s*\[|$)/g;
  let matched = false;

  let updated = tomlContent.replace(kvSectionRegex, (fullMatch, body) => {
    const hasBinding = new RegExp(`binding\\s*=\\s*"${binding}"`).test(body);
    if (!hasBinding) return fullMatch;

    matched = true;
    if (/id\s*=\s*"[^"]*"/.test(body)) {
      return `[[kv_namespaces]]${body.replace(/id\s*=\s*"[^"]*"/, `id = "${id}"`)}`;
    } else {
      return `[[kv_namespaces]]${body.replace(
        new RegExp(`(binding\\s*=\\s*"${binding}"[^\n]*)`),
        `$1\nid = "${id}"`
      )}`;
    }
  });

  if (!matched) {
    const trimmed = updated.trimEnd();
    updated = `${trimmed}\n\n[[kv_namespaces]]\nbinding = "${binding}"\nid = "${id}"\n`;
  }

  return updated;
}

/* ---------- 3. 准备临时配置（避免 wrangler 因缺失 id 阻断运行） ---------- */

if (!kvNamespaceId) {
  // 如果 wrangler.toml 没有合法的 id，Wrangler 会阻断命令执行。
  // 创建一个临时的安全配置文件供早期命令（whoami、kv namespace）调用。
  tempConfigPath = '.wrangler.bind_temp.toml';
  const safeToml = updateOrInsertKvId(toml, kvBinding, PLACEHOLDER_ID);
  writeFileSync(tempConfigPath, safeToml, 'utf8');
}

/* ---------- 4. 登录校验 + 账号 ID ---------- */

log('检查 Cloudflare 登录状态...');
const whoami = wrangler(['whoami']);
if (!whoami.ok || /not authenticated|You are not authenticated/i.test(whoami.out)) {
  console.error('\n  尚未检测到 Cloudflare 登录授权。请先在终端运行：\n\n    npx wrangler login\n\n  在浏览器完成授权后再执行。\n');
  process.exit(1);
}

const accountId = whoami.out.match(/\b[0-9a-f]{32}\b/i)?.[0];
if (accountId) {
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  log(`账号: ...${accountId.slice(-6)}`);
}

function listNamespaces() {
  const res = wrangler(['kv', 'namespace', 'list']);
  if (!res.ok) die(`读取 KV 命名空间列表失败:\n${res.out}`);
  const start = res.out.indexOf('[');
  const end = res.out.lastIndexOf(']');
  if (start === -1 || end === -1) {
    die(`解析 KV 命名空间列表失败:\n${res.out}`);
  }
  try {
    return JSON.parse(res.out.slice(start, end + 1));
  } catch {
    die(`解析 KV 命名空间列表失败:\n${res.out}`);
  }
}

/* ---------- 5. 确保 KV 命名空间存在，回写 ID ---------- */

if (!kvNamespaceId) {
  const expectedTitle = `${projectName}-${kvBinding}`;
  const existing = listNamespaces().find(
    (ns) => ns.title === expectedTitle || ns.title === kvBinding
  );

  if (existing) {
    kvNamespaceId = existing.id;
    log(`发现已存在的命名空间 "${existing.title}"，复用 ID: ${kvNamespaceId}`);
  } else {
    log(`创建 KV 命名空间 "${expectedTitle}"...`);
    const createRes = wrangler(['kv', 'namespace', 'create', kvBinding]);
    if (!createRes.ok) die(`创建 KV 命名空间失败:\n${createRes.out}`);

    // 优先从命令输出中直接提取 ID
    const extractedId = createRes.out.match(/id\s*=\s*"([0-9a-f]{32})"/i)?.[1];
    if (extractedId) {
      kvNamespaceId = extractedId;
    } else {
      const after = listNamespaces().find(
        (ns) => ns.title === expectedTitle || ns.title === kvBinding
      );
      if (!after) die('无法确定新建命名空间的 ID');
      kvNamespaceId = after.id;
    }
    log(`创建成功，ID: ${kvNamespaceId}`);
  }

  // 回写到真实的 wrangler.toml（无论原本是否写了 id 字段，均会自动填入）
  toml = updateOrInsertKvId(toml, kvBinding, kvNamespaceId);
  writeFileSync(TOML_PATH, toml, 'utf8');
  log(`已把真实命名空间 ID 自动回写到 ${TOML_PATH} (id = "${kvNamespaceId}")`);

  // 清除临时配置文件，后续命令将直接使用更新后的 wrangler.toml
  cleanTempConfig();
} else {
  cleanTempConfig();
  log(`复用已配置的 KV 命名空间 ID: ${kvNamespaceId}`);
}

if (BIND_ONLY) {
  console.log(`
==============================================================
\x1b[32m ✓ KV 命名空间绑定成功！\x1b[0m

  绑定名称 (binding): ${kvBinding}
  空间标识 (id):      ${kvNamespaceId}
  配置文件:           ${TOML_PATH} 中的 id 已自动填充完成！

  后续可通过 npm run cf:deploy 进行完整部署。
==============================================================
`);
  process.exit(0);
}

/* ---------- 6. 确保 SESSION_SECRET ---------- */

const secretList = wrangler(['secret', 'list']);

if (secretList.ok && /SESSION_SECRET/.test(secretList.out)) {
  log('SESSION_SECRET 已存在，跳过');
} else {
  const secret = randomBytes(32).toString('hex');
  log('生成并写入 Worker SESSION_SECRET...');
  const put = wrangler(['secret', 'put', 'SESSION_SECRET'], {
    input: `${secret}\n`,
  });
  if (put.ok) {
    log('SESSION_SECRET 写入成功（随机 32 字节 hex）');
  } else {
    log('提示: SESSION_SECRET 写入跳过（可后续通过 npx wrangler secret put SESSION_SECRET 设置）');
  }
}

/* ---------- 7. 构建 Cloudflare Worker ---------- */

if (!SKIP_BUILD) {
  log('开始构建 Cloudflare Worker（npx opennextjs-cloudflare build）...');
  try {
    execSync('npx opennextjs-cloudflare build', { stdio: 'inherit' });
  } catch {
    die('构建失败');
  }
} else {
  log('跳过构建（--skip-build）');
}

/* ---------- 8. 部署到 Cloudflare Workers ---------- */

log('部署到 Cloudflare Workers...');
const deployed = wranglerInherit(['deploy']);
if (!deployed.ok) die('部署失败');

console.log(`
==============================================================
\x1b[32m ✓ Cloudflare Worker 部署完成！\x1b[0m

 Worker 名称: ${projectName}
 KV 绑定:     ${kvBinding} (${kvNamespaceId})

 首次访问会跳转到 /login → "设置主密码" 即可开始使用。
==============================================================
`);
