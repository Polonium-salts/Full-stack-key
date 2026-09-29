# Password Manager（密码管理器）

基于 **Next.js 16 + TypeScript + Tailwind CSS 4** 的多端密码管理服务，灵感来自 Google Password Manager。支持通过统一 **REST API + API Key** 在 **PC、Mac、Android、浏览器、iPhone、TV、Linux、Linux Server** 等任意支持 HTTP 客户端的平台互通密码数据。后端部署到 **Cloudflare Pages**，所有加密条目存储在 **Cloudflare KV** 命名空间。

> 安全特性：**密码永远不以明文存储在服务端**。密码字段使用 **AES-256-GCM** 加密，加密主密钥由用户的主密码通过 **PBKDF2-HMAC-SHA256（默认 200,000 次迭代）** 派生，每个条目都有独立随机 **IV（初始化向量）和认证标签**，API Key 仅以 **SHA-256 哈希** 存储。

---

## 功能概览

### Web UI Dashboard
- 🔐 登录 / 首次初始化（设置主密码）
- 🗂️ 密码列表网格 + 搜索 + 分类/标签过滤 + 回收站
- ✏️ 新建 / 详情 / 编辑密码条目（密码生成器 + 强度评分）
- 🏷️ 分类管理 + 标签管理（带颜色选择）
- ⚙️ 设置页：修改主密码、API Key 管理（创建/吊销/重新生成）、数据导入/导出、危险区
- 📚 `/docs` 页：完整 API 文档（含 curl 示例）

### 统一 REST API（供第三方客户端接入）
- 认证：`POST /api/auth/init`（初始化）、`POST /api/auth/login`（Web 会话）、API Key CRUD
- 密码：CRUD + 软删除/恢复/永久删除 + 增量同步 `/api/passwords/sync?since=ISO`
- 分类 & 标签：完整 CRUD
- 数据：JSON 导出 + 导入（冲突策略：skip / overwrite / duplicate）
- 工具：密码生成器 + 强度评估

### 跨平台客户端协议（任意语言实现即可）
1. 携带 `X-API-Key` 请求头（从 Web UI 设置页或 `/api/auth/init` 初始化响应获取）
2. 携带 `X-Master-Password` 请求头（主密码，由服务端派生密钥并加解密，服务端不存储明文）
3. 访问 `https://<你的域名>/api/*` 获取/提交 **AES-256-GCM 加密字段**，按协议本地解密

---

## 多环境存储适配器（Multi-Environment Storage Adapter）

系统内置智能多环境存储适配器，根据当前运行时与生产环境配置**全自动选择最佳存储引擎**：

| 环境 / 部署方式 | 自动选择存储 | 特性说明 |
| :--- | :--- | :--- |
| **Cloudflare Pages / Workers (生产环境)** | **Cloudflare KV** | 全球边缘分布式键值存储，高并发、低延迟 |
| **本地开发 / 自建 Node.js 服务 (本地环境)** | **SQLite 本地数据库** | 零配置单文件持久化（默认 `.data/vault.sqlite`），服务重启数据不丢失 |
| **测试 / 临时调试环境** | **MemoryKV** | 内存易失性存储，进程退出即清空 |

### 存储配置环境变量（`.env.local` 或生产环境变量）

```bash
# 存储驱动选择：auto（自动检测，推荐） | sqlite | cloudflare | memory
STORAGE_TYPE=auto

# SQLite 数据库文件存储路径（本地/Node.js 生效，支持自定义或 :memory:）
SQLITE_PATH=.data/vault.sqlite
```

---

## 快速开始：本地开发（无需 Cloudflare 账号）

本地运行自动使用 **SQLite 本地轻量级数据库** 进行持久化存储，无需任何外部数据库服务：

```bash
# 1. 安装依赖
npm install

# 2. （可选）准备环境变量
cp .env.example .env.local

# 3. 启动 Next.js 开发服务器
npm run dev
```

打开浏览器访问 [http://localhost:3000](http://localhost:3000)。首次访问会被重定向到 [/login](http://localhost:3000/login)：
- **未初始化**：显示"设置主密码"表单，输入两次主密码 → 自动创建首枚 API Key 并跳转 Dashboard
- **已初始化**：输入主密码 → 通过 HttpOnly Cookie 建立会话 → 进入 Dashboard
- **数据持久化**：本地密码数据保存在 `.data/vault.sqlite` 中，开发调试与重启服务数据不丢失。如需使用纯内存模式，设置 `STORAGE_TYPE=memory` 即可。

---

## 部署到 Cloudflare Pages + KV（一键自动部署）

Cloudflare Pages 是边缘 Serverless 运行时，全球分布、免费额度充足；KV 是最终一致的全局键值存储。

本项目提供自动化部署脚本（`scripts/deploy.mjs`）：**你只需在 `wrangler.toml` 中填写 KV 绑定名（`binding`），其余全部自动完成**：

| 通常需要手动做的事 | 脚本自动化行为 |
|---|---|
| 创建 KV 命名空间、复制 ID、回填 wrangler.toml | 按绑定名自动创建（已存在则复用），真实 ID **自动回写**到 wrangler.toml |
| 在 Dashboard 创建 Pages 项目 | 不存在时自动创建 |
| 手工生成并保存 SESSION_SECRET | 自动生成 32 字节随机 hex 并写入项目 Secret |
| 手工配置 KV 绑定与环境变量 | KV 绑定与 vars 随 `wrangler.toml` 自动生效 |
| 构建 + 上传 | `next build` + `wrangler pages deploy` 一气呵成 |

### 前置条件

1. 注册 Cloudflare 账号：<https://dash.cloudflare.com/>
2. 安装 Node.js ≥ 18（wrangler 已在 devDependencies 中，无需全局安装）

### 一键部署

```bash
# 1. 登录 Cloudflare（浏览器授权，只需一次）
npx wrangler login

# 2. 部署：自动创建 KV / Pages 项目 / Secret，构建并上传
npm run cf:deploy
```

首次部署后，脚本会把创建好的 KV 命名空间 ID 回写到 `wrangler.toml`，此后再次部署会直接复用。部署完成会输出生产地址（默认 `https://password-manager.pages.dev`）。

> 💡 **自定义 KV 绑定名**：把 `wrangler.toml` 中的 `KV_MAIN_BINDING` 和 `[[kv_namespaces]].binding` 改成同名新名字（两处保持一致），重新运行 `npm run cf:deploy` —— 脚本会按新名字自动创建新命名空间并回写 ID。
>
> 💡 **只改了少量代码**：可用 `npm run cf:deploy:skip-build` 跳过构建直接上传。
>
> 💡 **SESSION_SECRET 安全性**：脚本生成的 Secret 只存在于 Cloudflare 项目设置中，不会写入代码仓库。

### 验证部署

1. 浏览器访问 Pages URL，首次会跳转到 `/login` → 设置主密码
2. 复制初始化响应中返回的 API Key（格式：`pm_{64位hex}`）
3. 用 curl 验证 API：

```bash
# 检查初始化状态（无需认证）
curl -s https://<your-pages-url>/api/auth/init

# 生成密码（无需认证，仅工具）
curl -s -X POST "https://<your-pages-url>/api/tools/generate-password" \
  -H "Content-Type: application/json" \
  -d '{"length":32,"uppercase":true,"lowercase":true,"numbers":true,"symbols":true}'

# 创建密码条目（需要 X-API-Key + X-Master-Password）
curl -s -X POST "https://<your-pages-url>/api/passwords" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: pm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -H "X-Master-Password: your-master-password" \
  -d '{
    "site":"GitHub","url":"https://github.com","username":"you@example.com",
    "password":"your-plaintext-password",
    "notes":"personal account"
  }'

# 增量同步所有条目
curl -s "https://<your-pages-url>/api/passwords/sync?since=1970-01-01T00:00:00Z" \
  -H "X-API-Key: pm_xxxxxxxx..." \
  -H "X-Master-Password: your-master-password"
```

### 绑定自定义域名（可选）

Cloudflare Dashboard → Pages → password-manager → **Custom domains** → 添加 `vault.yourdomain.com` 即可。

### 手工部署（可选，脱离脚本）

如果希望完全手动控制，可按以下顺序执行（等价于脚本行为）：

```bash
npx wrangler kv namespace create PASSWORD_MANAGER_KV   # 把输出的 id 填入 wrangler.toml
npx wrangler pages project create password-manager --production-branch=main
npm run build
npx wrangler pages secret put SESSION_SECRET --project-name=password-manager
npx wrangler pages deploy .next --branch=main --commit-dirty=true
```

---

## 安全架构

| 层级 | 方案 |
|---|---|
| 主密码校验 | PBKDF2 派生密钥后 **比较 hash**，服务端仅存 `masterPasswordHash` + `masterSalt`，**不存明文** |
| 主密钥派生 | `PBKDF2-HMAC-SHA256(masterPwd, hex(salt), iterations=200000, dkLen=32)` → AES-256 密钥 |
| 字段加密 | `AES-256-GCM`，每条密码独立随机 **12 字节 IV** + **128 位认证标签**，密文/IV/Tag 分别 base64 存储 |
| API Key | `pm_{64 字节安全随机 hex}`，仅以 `SHA-256(rawKey)` 存储，首字母 6 位前缀用于 Web UI 展示 |
| Web 会话 | HttpOnly Cookie 存 `sessionId` → KV 中 `pm:sessions:{id}` 存 **加密的主密钥**（由 per-session 密钥再包装一层 AES），防止 KV 数据泄露时直接拿到主密钥 |
| 会话 TTL | 默认 24 小时（`SESSION_DURATION`），过期自动清退 |
| 乐观并发 | `PasswordEntry.version` 字段，更新时冲突返回 HTTP 409 |
| 软删除 | `trashed:boolean + trashedAt:ISO`，可恢复，`/api/passwords/[id]/permanent` 才物理删除 |
| 同步协议 | `/api/passwords/sync?since=ISO` 返回 `{created:[], updated:[], deleted:[], syncedAt}`，便于多端增量拉取 |
| 导入/导出 | JSON 格式带版本号，冲突策略 `skip / overwrite / duplicate` 可选 |

### 跨平台客户端开发指南

为 Android / iOS / PC / TV / Linux Server / CLI 编写客户端时：

1. 让用户输入：`API Endpoint`（你的 `*.pages.dev` 或自定义域）、`API Key`、`Master Password`
2. `GET /api/passwords/sync?since=...` 获取 `created/updated` 条目中的 `encryptedPassword/passwordIv/passwordTag`，本地 AES-GCM 解密（密钥派生方式与服务端相同）
3. 提交时：客户端把明文密码 **AES-GCM 加密**（生成新 IV），再 POST 给 `/api/passwords`；**不要把明文密码发给服务端以外的任何第三方**
4. 参考 [/docs](http://localhost:3000/docs) 中字段定义和示例；Web UI 的 `app/lib/apiClient.ts` 是参考 TypeScript 客户端实现

---

## 项目结构

```
my-app/
├── app/
│   ├── actions/auth.ts              # Server Actions（Web UI 使用）
│   ├── api/                         # REST API 路由（客户端 SDK 直接调用）
│   │   ├── auth/{init,login,api-keys}/*
│   │   ├── passwords/{sync,[id],...}/*
│   │   ├── categories/*, tags/*
│   │   ├── data/{import,export}/*
│   │   └── tools/{generate,evaluate}-password/*
│   ├── dashboard/                   # Web UI 受保护页面
│   ├── docs/page.tsx                # API 文档页
│   ├── login/page.tsx               # 登录 / 初始化页
│   ├── lib/apiClient.ts             # 浏览器侧 SDK（Web UI 使用）
│   ├── layout.tsx, page.tsx, globals.css
│   └── favicon.ico
├── components/                      # shadcn/ui 组件 + 主题
│   ├── ui/*                         # Button/Card/Input/Select/Dialog 等
│   ├── theme-provider.tsx           # next-themes 封装
│   └── theme-toggle.tsx             # 亮/暗切换
├── lib/
│   ├── auth/{apiKey,context,init}.ts   # 认证与授权上下文
│   ├── crypto/{ciphers,keyDerivation,generator,index}.ts  # AES/PBKDF2/密码生成
│   ├── errors/index.ts               # 自定义错误 + handleRouteError
│   ├── repositories/{password,category,tag,config}Repository.ts
│   ├── storage/{types,memoryKV,cloudflareKV,sqliteKV,adapter,index}.ts   # 多环境存储适配器 + SQLite/Cloudflare/Memory 实现
│   ├── types/index.ts                # 全局 TypeScript 类型
│   └── utils/{response,validation}.ts  # JSON 响应包装 + Zod 校验
├── proxy.ts                          # Next.js 16 Proxy（CORS + 页面重定向 + 安全头）
├── scripts/deploy.mjs                # Cloudflare Pages 一键自动部署脚本
├── wrangler.toml                     # Cloudflare Pages 配置（KV 只需填绑定名）
├── next.config.ts
├── tsconfig.json, eslint.config.mjs
├── package.json, package-lock.json
└── .env.example, .gitignore, README.md
```

---

## 环境变量

复制 `.env.example` 为 `.env.local` 后修改（本地开发用）：

| 变量 | 说明 | 默认 |
|---|---|---|
| `STORAGE_TYPE` | 存储驱动方式（`auto` 自动检测 / `sqlite` / `cloudflare` / `memory`） | `auto` |
| `SQLITE_PATH` | SQLite 数据库文件路径（本地 / Node.js 运行时生效） | `.data/vault.sqlite` |
| `CORS_ALLOWED_ORIGINS` | 允许的 CORS 源，逗号分隔或 `*` | `*` |
| `CORS_ALLOW_CREDENTIALS` | 是否允许 Cookie | `true` |
| `PBKDF2_ITERATIONS` | PBKDF2 迭代次数，越高越安全但越慢 | `200000` |
| `SESSION_SECRET` | 会话密钥派生种子。生产环境由部署脚本**自动生成**并写入 Cloudflare Secret | `please-change-...` |
| `SESSION_COOKIE_NAME` | Web 会话 Cookie 名 | `pm_session` |
| `SESSION_DURATION` | 会话有效期（秒） | `86400` |
| `KV_MAIN_BINDING` | Cloudflare KV 绑定名（与 wrangler.toml 的 binding 一致） | `PASSWORD_MANAGER_KV` |
| `RATE_LIMIT_AUTH_PER_MINUTE` | 单 IP 每分钟认证失败阈值（预留） | `10` |
| `RATE_LIMIT_API_PER_MINUTE` | 单 API Key 每分钟请求阈值（预留） | `600` |

---

## 常见问题

**Q1：手机端/TV 端/Linux CLI 怎么用？**
A：任何能发 HTTP 的都可以。客户端代码参考上面的「跨平台客户端开发指南」，只需实现：PBKDF2 派生密钥 + AES-256-GCM 加解密 + 调用 `/api/passwords/sync` 拉取数据。

**Q2：主密码忘了怎么办？**
A：**没有任何后门**。服务端只存 PBKDF2 哈希 + 加密后的条目，无法恢复。请务必妥善保管主密码，或定期在设置页 → Data → 导出 JSON 备份。

**Q3：可以部署到 Vercel / 自托管 Node 吗？**
A：可以。Vercel 直接 `vercel deploy` 即可（需要自行提供持久化方案，推荐连接 Neon / Postgres 或 Redis；本项目默认的 MemoryKV 仅适合单机单实例）。自托管：`npm run build && npm start`，环境变量与 `.env.example` 相同。

**Q4：多用户/团队共享？浏览器插件？2FA？**
A：v1 为单用户设计。这些都是 v2 路线图，欢迎自行扩展仓储层（`passwordRepository` 增加 `ownerId` 维度已预留）。

---

## 开发命令速查

```bash
npm run dev                  # Next.js 开发服务器（MemoryKV）
npm run build                # Next.js 生产构建
npm run start                # Next.js 生产启动（Node）
npm run lint                 # ESLint 检查
npm run cf:bind-kv           # 自动绑定/创建 KV 空间并将真实 ID 回写到 wrangler.toml（无需手动填写 id）
npm run cf:deploy            # 一键部署到 Cloudflare Pages（自动创建 KV / 项目 / Secret）
npm run cf:deploy:skip-build # 跳过构建，直接部署已有 .next 产物
```
