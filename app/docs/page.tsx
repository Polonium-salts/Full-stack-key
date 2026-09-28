'use client';

import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';

interface Endpoint {
  method: string;
  path: string;
  description: string;
  auth: string;
  body?: string;
  response?: string;
  example?: string;
}

const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/api/auth/init',
    description: '检查保险库是否已初始化',
    auth: '公开',
    response: `{ "success": true, "data": { "initialized": false } }`,
  },
  {
    method: 'POST',
    path: '/api/auth/init',
    description: '使用主密码初始化保险库并获得首个 API 密钥',
    auth: '公开',
    body: `{ "masterPassword": "your-strong-password" }`,
    response: `{ "success": true, "data": { "apiKey": "pm_...", "apiKeyId": "...", "message": "...", "warning": "..." } }`,
    example: `curl -X POST https://your-domain.com/api/auth/init \\\n  -H "Content-Type: application/json" \\\n  -d '{"masterPassword":"CorrectHorseBatteryStaple1!"}'`,
  },
  {
    method: 'POST',
    path: '/api/auth/login',
    description: '创建 Web 会话（供浏览器 UI 使用），设置 HttpOnly Cookie。',
    auth: '公开',
    body: `{ "masterPassword": "..." }`,
  },
  {
    method: 'GET',
    path: '/api/auth/api-keys',
    description: '列出所有 API 密钥',
    auth: 'API 密钥',
  },
  {
    method: 'POST',
    path: '/api/auth/api-keys',
    description: '创建新的 API 密钥',
    auth: 'API 密钥',
    body: `{ "name": "Desktop App" }`,
  },
  {
    method: 'DELETE',
    path: '/api/auth/api-keys/:id',
    description: '吊销 API 密钥',
    auth: 'API 密钥',
  },
  {
    method: 'POST',
    path: '/api/auth/api-keys/:id',
    description: '重新生成 API 密钥（旧密钥立即失效）',
    auth: 'API 密钥',
  },
  {
    method: 'GET',
    path: '/api/passwords',
    description: '列出密码条目。查询参数：page, perPage, search, categoryId, tag, trashed',
    auth: 'API 密钥 + 主密码',
    example: `curl https://your-domain.com/api/passwords?search=github \\\n  -H "X-API-Key: pm_yourkey" \\\n  -H "X-Master-Password: your-master-password"`,
  },
  {
    method: 'POST',
    path: '/api/passwords',
    description: '创建新的密码条目',
    auth: 'API 密钥 + 主密码',
    body: `{ "site": "GitHub", "url": "https://github.com", "username": "you", "password": "secr3t", "notes": "...", "tags": ["work"], "categoryId": "..." }`,
  },
  {
    method: 'GET',
    path: '/api/passwords/:id',
    description: '获取单条密码条目（解密后返回）',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'PUT',
    path: '/api/passwords/:id',
    description: '更新密码条目。需携带 version 进行乐观锁定。',
    auth: 'API 密钥 + 主密码',
    body: `{ "password": "newP@ss", "version": 1 }`,
  },
  {
    method: 'DELETE',
    path: '/api/passwords/:id',
    description: '软删除（移入回收站）',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'POST',
    path: '/api/passwords/:id/restore',
    description: '从回收站恢复',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'DELETE',
    path: '/api/passwords/:id/permanent',
    description: '永久删除',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'GET',
    path: '/api/passwords/sync',
    description: '增量同步。查询参数：since（ISO 时间戳）',
    auth: 'API 密钥 + 主密码',
    response: `{ "created": [...], "updated": [...], "deleted": [{ "id": "...", "trashedAt": "..." }], "syncedAt": "..." }`,
  },
  {
    method: 'GET',
    path: '/api/categories',
    description: '列出全部分类',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'POST',
    path: '/api/categories',
    description: '创建分类：{ "name": "Work" }',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'GET/PUT/DELETE',
    path: '/api/categories/:id',
    description: '获取 / 更新 / 删除分类',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'GET/POST',
    path: '/api/tags',
    description: '列出或创建标签：{ "name": "2fa", "color": "#22c55e" }',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'GET/PUT/DELETE',
    path: '/api/tags/:id',
    description: '获取 / 更新 / 删除标签',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'GET',
    path: '/api/data/export',
    description: '导出全部数据为 JSON 备份。添加 ?download=true 触发文件下载。',
    auth: 'API 密钥 + 主密码',
  },
  {
    method: 'POST',
    path: '/api/data/import',
    description: '导入备份。冲突策略：skip | overwrite | duplicate。',
    auth: 'API 密钥 + 主密码',
    body: `{ "strategy": "skip", "data": { "version": "1.0.0", "passwords": [...], ... } }`,
  },
  {
    method: 'GET/POST',
    path: '/api/tools/generate-password',
    description: '生成密码。请求体或查询参数：length, uppercase, lowercase, numbers, symbols',
    auth: '公开',
  },
  {
    method: 'POST',
    path: '/api/tools/evaluate-password',
    description: '评估密码强度（0-4 分）',
    auth: '公开',
    body: `{ "password": "test123" }`,
  },
];

const methodColors: Record<string, string> = {
  GET: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  POST: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
  PUT: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  PATCH: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
  DELETE: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30',
};

const authBadgeVariant: Record<string, 'secondary' | 'default' | 'outline'> = {
  公开: 'secondary',
  会话: 'default',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen flex-1 bg-background">
      <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="size-4"
              >
                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h1 className="font-bold">密码保险库 API</h1>
              <p className="text-xs text-muted-foreground">v1.0.0 · REST API 参考</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="outline" asChild>
              <Link href="/dashboard">← 返回应用</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-10 px-6 py-10">
        <section className="space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">快速开始</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2 rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-semibold">
                <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                  1
                </span>
                初始化保险库
              </h3>
              <p className="text-sm text-muted-foreground">
                首先，使用主密码调用{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">POST /api/auth/init</code>。
              </p>
            </div>
            <div className="space-y-2 rounded-xl border bg-card p-5 shadow-sm">
              <h3 className="flex items-center gap-2 font-semibold">
                <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-xs font-bold text-primary">
                  2
                </span>
                请求认证
              </h3>
              <p className="text-sm text-muted-foreground">对于所有 /api/passwords 接口，需要发送两个请求头：</p>
              <ul className="space-y-1 rounded-lg bg-muted/50 p-3 font-mono text-xs">
                <li>X-API-Key: pm_yourkey</li>
                <li>X-Master-Password: yourpassword</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-amber-500/40 bg-amber-50 p-5 dark:bg-amber-950/20">
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-amber-900 dark:text-amber-400">
            <TriangleAlert className="size-5" />
            安全说明
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-amber-800 dark:text-amber-300/90">
            <li>
              <strong>生产环境必须使用 HTTPS。</strong> 主密码通过请求头发送。
            </li>
            <li>
              <strong>不要在客户端代码中硬编码 API 密钥。</strong> 浏览器端请使用基于会话的 Web UI。
            </li>
            <li>
              密码在服务端使用 <strong>AES-256-GCM 加密存储</strong>，仅在请求处理时解密。
            </li>
            <li>桌面 / 移动 / TV 客户端，建议先在本地完成加密再发送。</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-3xl font-bold tracking-tight">API 接口</h2>
          <div className="space-y-3">
            {endpoints.map((e, i) => (
              <details key={i} className="group overflow-hidden rounded-xl border bg-card shadow-sm">
                <summary className="flex cursor-pointer list-none items-center gap-3 p-4 transition-colors hover:bg-muted/50">
                  <span
                    className={`w-20 shrink-0 rounded-md border py-1.5 text-center text-xs font-bold ${methodColors[e.method] || methodColors.GET}`}
                  >
                    {e.method}
                  </span>
                  <code className="flex-1 truncate font-mono text-sm">{e.path}</code>
                  <Badge variant={authBadgeVariant[e.auth] || 'outline'} className="shrink-0">
                    {e.auth}
                  </Badge>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </summary>
                <div className="space-y-3 border-t px-4 pb-4 pt-3">
                  <p className="text-sm text-muted-foreground">{e.description}</p>
                  {e.body && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">请求体</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-900 p-3 font-mono text-xs text-zinc-200 dark:bg-black/60">
                        <code>{e.body}</code>
                      </pre>
                    </div>
                  )}
                  {e.response && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">响应示例</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-900 p-3 font-mono text-xs text-emerald-300 dark:bg-black/60">
                        <code>{e.response}</code>
                      </pre>
                    </div>
                  )}
                  {e.example && (
                    <div>
                      <div className="mb-1 text-xs font-medium text-muted-foreground">cURL 示例</div>
                      <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-zinc-900 p-3 font-mono text-xs text-sky-300 dark:bg-black/60">
                        <code>{e.example}</code>
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>

        <footer className="border-t pt-8 text-center text-xs text-muted-foreground">
          密码管理器 · 部署于 Cloudflare Workers + KV · 数据使用 AES-256-GCM 加密
        </footer>
      </main>
    </div>
  );
}
