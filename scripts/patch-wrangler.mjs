import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const binPath = 'node_modules/wrangler/bin/wrangler.js';
if (!existsSync(binPath)) {
  process.exit(0);
}

try {
  let content = readFileSync(binPath, 'utf8');

  // 确保恢复原始的参数传递
  content = content.replace(/\.\.\.userArgs,/g, '...process.argv.slice(2),');

  // 清除任何旧的 patch 内容
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
		if (!fs.existsSync('.open-next/worker.js')) {
			console.log('\\x1b[36m[wrangler-worker]\\x1b[0m 自动执行 Worker 构建 (npx opennextjs-cloudflare build)...');
			execSync('npx opennextjs-cloudflare build', { stdio: 'inherit' });
		}
	}\n\n`;

      content = before + workerShim + '\t' + after;
    }
  }

  writeFileSync(binPath, content, 'utf8');
  console.log('[patch-wrangler] Successfully configured Cloudflare Worker deploy hook.');
} catch (err) {
  console.warn('[patch-wrangler] Skipping wrangler patch:', err.message);
}
