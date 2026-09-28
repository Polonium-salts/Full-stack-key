import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const binPath = 'node_modules/wrangler/bin/wrangler.js';
if (!existsSync(binPath)) {
  process.exit(0);
}

try {
  let content = readFileSync(binPath, 'utf8');

  const injection = `
	let userArgs = process.argv.slice(2);
	if (userArgs[0] === 'deploy') {
		const { execSync } = require('child_process');
		const fs = require('fs');
		console.log('\\x1b[36m[wrangler-compat]\\x1b[0m 检测到 Pages 项目正在执行 deploy 命令...');
		if (!fs.existsSync('.next')) {
			console.log('\\x1b[36m[wrangler-compat]\\x1b[0m 正在自动触发 Next.js 生产构建 (npm run build)...');
			execSync('npm run build', { stdio: 'inherit' });
		}
		console.log('\\x1b[36m[wrangler-compat]\\x1b[0m 正在自动转为执行: wrangler pages deploy .next ...');
		userArgs = ['pages', 'deploy', '.next', ...userArgs.slice(1)];
	}
`;

  if (!content.includes('[wrangler-compat]')) {
    content = content.replace(
      /(\.\.\.process\.argv\.slice\(2\),)/,
      `...userArgs,`
    );
    content = content.replace(
      /(function runWrangler\(\) \{)/,
      `$1${injection}`
    );
    writeFileSync(binPath, content, 'utf8');
    console.log('[patch-wrangler] Successfully configured Cloudflare CI compatibility shim.');
  }
} catch (err) {
  console.warn('[patch-wrangler] Note: Could not patch wrangler, skipping:', err.message);
}
