#!/usr/bin/env node
/**
 * 自动化 Cloudflare Pages 部署脚本
 *
 * 用户只需在 wrangler.toml 中填写 KV 绑定名（binding），其余全自动：
 *   1. 校验 wrangler 登录状态
 *   2. 按绑定名自动创建 KV 命名空间（已存在则复用），并把真实 ID 回写到 wrangler.toml
 *   3. 自动创建 Pages 项目（如不存在）
 *   4. 自动生成随机 SESSION_SECRET 并写入项目 Secret
 *   5. next build + wrangler pages deploy（KV 绑定随 wrangler.toml 自动生效）
 *
 * 用法：
 *   npm run cf:deploy                # 构建 + 部署
 *   npm run cf:deploy:skip-build     # 跳过构建直接部署
 */

import { spawnSync, execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const WRANGLER_BIN = 'node_modules/wrangler/bin/wrangler.js';
const SKIP_BUILD = process.argv.includes('--skip-build');

function log(msg) {
  console.log(`\x1b[36m[deploy]\x1b[0m ${msg}`);
}

function die(msg) {
  console.error(`\x1b[31m[deploy] ✗ ${msg}\x1b[0m`);
  process.exit(1);
}

function wrangler(args, opts = {}) {
  const res = spawnSync(process.execPath, [WRANGLER_BIN, ...args], {
    encoding: 'utf8',
    ...opts,
  });
  return {
    ok: res.status === 0,
    out: (res.stdout || '') + (res.stderr || ''),
  };
}

function wranglerInherit(args) {
  const res = spawnSync(process.execPath, [WRANGLER_BIN, ...args], {
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

const kvBlock = toml.match(
  /\[\[kv_namespaces\]\][\s\S]*?binding\s*=\s*"([^"]+)"[\s\S]*?id\s*=\s*"([^"]*)"/
);
if (!kvBlock) die('wrangler.toml 中缺少 [[kv_namespaces]] 配置块');

const kvBinding = kvBlock[1];
let kvNamespaceId = kvBlock[2] || '';

// 零占位 ID（仅用于通过 wrangler 本地配置校验）视为“未设置”
const PLACEHOLDER_ID = '00000000000000000000000000000000';
const isPlaceholderId = (id) => !id || !/[1-9a-f]/i.test(id) || id === PLACEHOLDER_ID;
if (isPlaceholderId(kvNamespaceId)) {
  kvNamespaceId = '';
}

const declaredMainBinding = toml.match(/^KV_MAIN_BINDING\s*=\s*"([^"]+)"/m)?.[1];
if (declaredMainBinding && declaredMainBinding !== kvBinding) {
  die(
    `KV_MAIN_BINDING ("${declaredMainBinding}") 与 [[kv_namespaces]].binding ("${kvBinding}") 不一致，请先统一后再部署`
  );
}

console.log(`\n========== 密码保险库 · Cloudflare Pages 自动部署 ==========`);
log(`Pages 项目名: ${projectName}`);
log(`KV 绑定名:   ${kvBinding}${kvNamespaceId ? '（已有 ID，复用）' : '（ID 为空，将自动创建）'}\n`);

/* ---------- 2. 登录校验 + 账号 ID ---------- */

log('检查 Cloudflare 登录状态...');
const whoami = wrangler(['whoami']);
if (!whoami.ok || /not authenticated|You are not authenticated/i.test(whoami.out)) {
  console.error('\n  尚未登录 Cloudflare。请先运行：\n\n    npx wrangler login\n\n  在浏览器完成授权后再执行 npm run cf:deploy。\n');
  process.exit(1);
}

const accountId = whoami.out.match(/\b[0-9a-f]{32}\b/i)?.[0];
if (accountId) {
  process.env.CLOUDFLARE_ACCOUNT_ID = accountId;
  log(`账号: ...${accountId.slice(-6)}`);
}

/* ---------- 3. 确保 KV 命名空间存在，回写 ID ---------- */

function listNamespaces() {
  const res = wrangler(['kv', 'namespace', 'list']);
  if (!res.ok) die(`读取 KV 命名空间列表失败:\n${res.out}`);
  const start = res.out.indexOf('[');
  const end = res.out.lastIndexOf(']');
  try {
    return JSON.parse(res.out.slice(start, end + 1));
  } catch {
    die(`解析 KV 命名空间列表失败:\n${res.out}`);
  }
}

if (!kvNamespaceId) {
  const expectedTitle = `${projectName}-${kvBinding}`;
  const existing = listNamespaces().find((ns) => ns.title === expectedTitle);

  if (existing) {
    kvNamespaceId = existing.id;
    log(`发现已存在的命名空间 "${expectedTitle}"，复用 ID: ${kvNamespaceId}`);
  } else {
    log(`创建 KV 命名空间 "${expectedTitle}"...`);
    const created = wranglerInherit(['kv', 'namespace', 'create', kvBinding]);
    if (!created.ok) die('创建 KV 命名空间失败');
    const after = listNamespaces().find((ns) => ns.title === expectedTitle);
    if (!after) die('无法确定新建命名空间的 ID');
    kvNamespaceId = after.id;
    log(`创建成功，ID: ${kvNamespaceId}`);
  }

  toml = toml.replace(
    /(\[\[kv_namespaces\]\][^[]*?binding\s*=\s*"[^"]+"\s*\n\s*id\s*=\s*")([^"]*)(")/,
    `$1${kvNamespaceId}$3`
  );
  writeFileSync(TOML_PATH, toml);
  log(`已把命名空间 ID 回写到 ${TOML_PATH}（下次部署将直接复用）`);
}

/* ---------- 4. 确保 Pages 项目存在 ---------- */

// 兼容表格输出（│ name │）与 JSON 输出（"name"）两种格式，
// 并避免 "password-manager" 误匹配到 "password-manager-v2" 之类的子串
function projectListContains(name) {
  const res = wrangler(['pages', 'project', 'list']);
  if (!res.ok) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`["│]\\s*${escaped}\\s*["│]`).test(res.out);
}

if (projectListContains(projectName)) {
  log(`Pages 项目 "${projectName}" 已存在`);
} else {
  log(`创建 Pages 项目 "${projectName}"...`);
  const created = wranglerInherit([
    'pages',
    'project',
    'create',
    projectName,
    '--production-branch=main',
  ]);
  if (!created.ok && !projectListContains(projectName)) {
    die(`创建 Pages 项目失败，请手动执行:\n  npx wrangler pages project create ${projectName} --production-branch=main`);
  }
}

/* ---------- 5. 确保 SESSION_SECRET ---------- */

const secretList = wrangler([
  'pages',
  'secret',
  'list',
  `--project-name=${projectName}`,
]);

if (secretList.ok && /SESSION_SECRET/.test(secretList.out)) {
  log('SESSION_SECRET 已存在，跳过');
} else {
  const secret = randomBytes(32).toString('hex');
  log('生成并写入 SESSION_SECRET...');
  const put = wrangler(
    ['pages', 'secret', 'put', 'SESSION_SECRET', `--project-name=${projectName}`],
    { input: `${secret}\n` }
  );
  if (!put.ok) {
    die(`写入 SESSION_SECRET 失败，请手动执行:\n  npx wrangler pages secret put SESSION_SECRET --project-name=${projectName}`);
  }
  log('SESSION_SECRET 写入成功（随机 32 字节 hex）');
}

/* ---------- 6. 构建 ---------- */

if (!SKIP_BUILD) {
  log('开始构建（npm run build）...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
  } catch {
    die('构建失败');
  }
} else {
  log('跳过构建（--skip-build）');
}

/* ---------- 7. 部署 ---------- */

log('部署到 Cloudflare Pages...');
const deployed = wranglerInherit([
  'pages',
  'deploy',
  '--branch=main',
  '--commit-dirty=true',
]);
if (!deployed.ok) die('部署失败');

console.log(`
==============================================================
\x1b[32m ✓ 部署完成！\x1b[0m

 生产地址:  https://${projectName}.pages.dev
 KV 绑定:   ${kvBinding} (${kvNamespaceId})

 首次访问会跳转到 /login → "设置主密码" 即可开始使用。
==============================================================
`);
