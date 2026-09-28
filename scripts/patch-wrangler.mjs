import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const binPath = 'node_modules/wrangler/bin/wrangler.js';
if (!existsSync(binPath)) {
  process.exit(0);
}

try {
  let content = readFileSync(binPath, 'utf8');

  // 恢复原始参数传递
  content = content.replace(/\.\.\.userArgs,/g, '...process.argv.slice(2),');

  // 清理可能存在的旧 hook
  const fnIndex = content.indexOf('function runWrangler() {');
  if (fnIndex !== -1) {
    const semiverIndex = content.indexOf('if (semiver(process.versions.node');
    if (semiverIndex !== -1 && semiverIndex > fnIndex) {
      const before = content.slice(0, fnIndex + 'function runWrangler() {\n'.length);
      const after = content.slice(semiverIndex);

      const workerShim = `	if (process.argv.slice(2)[0] === 'deploy') {
		const { execSync } = require('child_process');
		const fs = require('fs');
		console.log('\\x1b[36m[wrangler-worker]\\x1b[0m 正在准备部署 Cloudflare Worker...');

		// 1. 自动检查并回写真实 KV ID
		try {
			if (fs.existsSync('scripts/ensure-kv.mjs')) {
				console.log('\\x1b[36m[wrangler-worker]\\x1b[0m 检查并绑定真实 KV 命名空间...');
				execSync('node scripts/ensure-kv.mjs', { stdio: 'inherit' });
			}
		} catch (e) {
			console.warn('[wrangler-worker] KV 检查提示:', e.message);
		}

		// 2. 检查并构建 Worker
		if (!fs.existsSync('.open-next/worker.js')) {
			console.log('\\x1b[36m[wrangler-worker]\\x1b[0m 自动执行 Worker 打包 (npm run build:worker)...');
			execSync('npm run build:worker', { stdio: 'inherit' });
		}
	}\n\n`;

      content = before + workerShim + '\t' + after;
    }
  }

  writeFileSync(binPath, content, 'utf8');
  console.log('[patch-wrangler] Successfully configured Cloudflare Worker deploy hook with KV auto-resolution.');
} catch (err) {
  console.warn('[patch-wrangler] Skipping wrangler patch:', err.message);
}
