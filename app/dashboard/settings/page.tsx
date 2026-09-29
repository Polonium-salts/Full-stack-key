'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Download,
  Upload,
  KeyRound,
  Database,
  HardDrive,
  Layers,
  ShieldCheck,
  RefreshCw,
  Check,
  Copy,
  Folder,
  Tag as TagIcon,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listApiKeysAction,
  createApiKeyAction,
  revokeApiKeyAction,
  regenerateApiKeyAction,
  changeMasterPasswordAction,
  exportDataAction,
  importDataAction,
  getDataMetricsAction,
  type DataMetrics,
  emptyTrashAction,
  resetVaultAction,
} from '@/app/actions/auth';
import type { ExportData } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export const dynamic = 'force-dynamic';

type ApiKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  createdAt: string;
  lastUsedAt?: string;
  revoked: boolean;
};

export default function SettingsPage() {
  const router = useRouter();
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[] | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyRow | null>(null);
  const [pendingRegen, setPendingRegen] = useState<ApiKeyRow | null>(null);
  const [openEmptyTrashDialog, setOpenEmptyTrashDialog] = useState(false);
  const [emptyTrashLoading, setEmptyTrashLoading] = useState(false);
  const [openResetVaultDialog, setOpenResetVaultDialog] = useState(false);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetVaultLoading, setResetVaultLoading] = useState(false);
  const [dataMetrics, setDataMetrics] = useState<DataMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);

  async function loadKeys() {
    const data = await listApiKeysAction();
    setApiKeys(data as ApiKeyRow[]);
  }

  async function loadMetrics(silent = false) {
    setMetricsLoading(true);
    try {
      const data = await getDataMetricsAction();
      setDataMetrics(data);
      if (!silent) {
        toast.success('存储统计指标已刷新');
      }
    } catch {
      if (!silent) {
        toast.error('获取存储统计失败');
      }
    } finally {
      setMetricsLoading(false);
    }
  }

  function copyDbPath(p: string) {
    navigator.clipboard.writeText(p);
    setCopiedPath(true);
    toast.success('数据库路径已复制到剪贴板');
    setTimeout(() => setCopiedPath(false), 2000);
  }

  useEffect(() => {
    let cancelled = false;
    listApiKeysAction()
      .then((data) => {
        if (!cancelled) setApiKeys(data as ApiKeyRow[]);
      })
      .catch(() => {});
    getDataMetricsAction()
      .then((metrics) => {
        if (!cancelled) setDataMetrics(metrics);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    const fd = new FormData();
    fd.set('name', newKeyName.trim());
    const res = await createApiKeyAction(fd);
    if (!res.ok) {
      toast.error(res.error || '创建失败');
    } else {
      setNewKey(res.apiKey!);
      setNewKeyName('');
      loadKeys();
      toast.success('API 密钥已创建');
    }
  }

  async function handleRevoke() {
    if (!pendingRevoke) return;
    await revokeApiKeyAction(pendingRevoke.id);
    loadKeys();
    setPendingRevoke(null);
    toast.success('API 密钥已吊销');
  }

  async function handleRegenerate() {
    if (!pendingRegen) return;
    const res = await regenerateApiKeyAction(pendingRegen.id);
    if (res.ok) {
      setNewKey(res.apiKey!);
      loadKeys();
      toast.success('API 密钥已重新生成');
    }
    setPendingRegen(null);
  }

  async function handleChangePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await changeMasterPasswordAction(fd);
    if (!res.ok) {
      toast.error(res.error || '修改失败');
    } else {
      toast.success('主密码已修改，请重新登录。');
      setTimeout(() => router.push('/login'), 1500);
    }
  }

  async function handleExport() {
    const data = await exportDataAction();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `password-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('数据已导出');
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const strategy = (prompt('导入策略？（skip / overwrite / duplicate）', 'skip') || 'skip') as
      | 'skip'
      | 'overwrite'
      | 'duplicate';
    if (!['skip', 'overwrite', 'duplicate'].includes(strategy)) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportData;
      if (!data.passwords || !Array.isArray(data.passwords)) throw new Error('文件格式无效');
      const res = await importDataAction(data, strategy);
      const metaParts: string[] = [];
      if (res.categoriesCreated > 0) metaParts.push(`新分类 ${res.categoriesCreated}`);
      if (res.tagsCreated > 0) metaParts.push(`新标签 ${res.tagsCreated}`);
      toast.success(
        `导入完成：新增 ${res.imported}，跳过 ${res.skipped}，覆盖 ${res.overwritten}，重复 ${res.duplicated}` +
          (metaParts.length > 0 ? `（${metaParts.join('，')}）` : '')
      );
      e.target.value = '';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '导入失败');
      e.target.value = '';
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">管理你的密码保险库</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="general">安全</TabsTrigger>
          <TabsTrigger value="apikeys">API 密钥</TabsTrigger>
          <TabsTrigger value="data">数据</TabsTrigger>
          <TabsTrigger value="danger">危险操作</TabsTrigger>
        </TabsList>

        {/* 安全 */}
        <TabsContent value="general" className="mt-4">
          <div className="space-y-5 rounded-xl border bg-card p-6 shadow-sm">
            <div>
              <h2 className="font-semibold">修改主密码</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                所有已存储的密码都将使用新密码重新加密。
              </p>
            </div>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="oldPassword">当前密码</Label>
                <Input id="oldPassword" name="oldPassword" type="password" required autoComplete="current-password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">新密码（至少 8 位）</Label>
                <Input id="newPassword" name="newPassword" type="password" minLength={8} required autoComplete="new-password" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">确认新密码</Label>
                <Input id="confirmPassword" name="confirmPassword" type="password" minLength={8} required autoComplete="new-password" />
              </div>
              <Button type="submit">更新密码</Button>
            </form>
          </div>
        </TabsContent>

        {/* API 密钥 */}
        <TabsContent value="apikeys" className="mt-4">
          <div className="space-y-4">
            <div className="space-y-4 rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="font-semibold">创建新的 API 密钥</h2>
              <form onSubmit={handleCreateKey} className="flex gap-3">
                <Input
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="为此密钥命名（例如：桌面应用、浏览器扩展）"
                />
                <Button type="submit">创建</Button>
              </form>
              {newKey && (
                <Alert className="border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  <KeyRound />
                  <AlertTitle>请妥善保管此密钥！它只会显示一次。</AlertTitle>
                  <AlertDescription>
                    <div className="mt-1 flex w-full items-center gap-2 rounded-lg border border-amber-500/30 bg-background p-3 font-mono text-sm break-all">
                      <span className="min-w-0 flex-1">{newKey}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0"
                        onClick={() => {
                          navigator.clipboard.writeText(newKey);
                          toast.success('已复制到剪贴板');
                        }}
                      >
                        复制
                      </Button>
                    </div>
                    <button
                      onClick={() => setNewKey(null)}
                      className="mt-2 text-xs hover:underline"
                    >
                      关闭（我已保存）
                    </button>
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="font-semibold">
                API 密钥（{apiKeys?.length ?? 0}）
              </h2>
              {apiKeys === null ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-lg" />
                  ))}
                </div>
              ) : apiKeys.length === 0 ? (
                <p className="text-sm text-muted-foreground">还没有 API 密钥，请在上方创建。</p>
              ) : (
                <div className="divide-y">
                  {apiKeys.map((k) => (
                    <div key={k.id} className="flex items-center gap-3 py-3">
                      <span className={`size-2 shrink-0 rounded-full ${k.revoked ? 'bg-destructive' : 'bg-emerald-500'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">
                          {k.name}
                          {k.revoked && (
                            <span className="ml-2 rounded-md bg-destructive/10 px-2 py-0.5 text-xs text-destructive">
                              已吊销
                            </span>
                          )}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {k.keyPrefix} · 创建于 {new Date(k.createdAt).toLocaleDateString()}
                          {k.lastUsedAt && ` · 最近使用 ${new Date(k.lastUsedAt).toLocaleString()}`}
                        </div>
                      </div>
                      {!k.revoked && (
                        <Button variant="outline" size="sm" onClick={() => setPendingRegen(k)}>
                          重新生成
                        </Button>
                      )}
                      <Button
                        variant={k.revoked ? 'secondary' : 'outline'}
                        size="sm"
                        className={k.revoked ? '' : 'text-destructive hover:text-destructive'}
                        onClick={() => setPendingRevoke(k)}
                      >
                        {k.revoked ? '重新启用' : '吊销'}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* 数据 */}
        <TabsContent value="data" className="mt-4 space-y-5">
          {/* 顶部标题与刷新 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border bg-card p-5 shadow-sm">
            <div>
              <div className="flex items-center gap-2">
                <Database className="size-5 text-primary" />
                <h2 className="text-lg font-semibold tracking-tight">数据存储与资源占用</h2>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                实时监控数据库驱动类型、物理占用空间与保险库数据体量
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={metricsLoading}
              onClick={() => loadMetrics(false)}
              className="gap-2 shrink-0 self-start sm:self-auto"
            >
              <RefreshCw className={`size-3.5 ${metricsLoading ? 'animate-spin' : ''}`} />
              <span>刷新指标</span>
            </Button>
          </div>

          {/* 4 大核心指标卡片 */}
          {metricsLoading && !dataMetrics ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : dataMetrics ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 卡片 1: 数据库类型 */}
              <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">数据库引擎</span>
                  <Database className="size-4 text-primary" />
                </div>
                <div className="text-lg font-bold tracking-tight text-foreground truncate">
                  {dataMetrics.storage.driverName}
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground">{dataMetrics.storage.environmentName}</span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      dataMetrics.storage.isPersistent
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {dataMetrics.storage.isPersistent ? '● 持久存储' : '○ 内存临时'}
                  </span>
                </div>
              </div>

              {/* 卡片 2: 存储磁盘占用 */}
              <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">当前存储占用</span>
                  <HardDrive className="size-4 text-blue-500" />
                </div>
                <div className="text-lg font-bold tracking-tight text-foreground">
                  {dataMetrics.storage.fileSizeFormatted}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">
                  负载数据量约 {dataMetrics.storage.estimatedPayloadFormatted}
                </div>
              </div>

              {/* 卡片 3: 底层键值记录数 */}
              <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">底层存储条目</span>
                  <Layers className="size-4 text-emerald-500" />
                </div>
                <div className="text-lg font-bold tracking-tight text-foreground">
                  {dataMetrics.storage.totalKeys} 条
                </div>
                <div className="text-[11px] text-muted-foreground">
                  已索引 KV 数据条目数
                </div>
              </div>

              {/* 卡片 4: 密码库资产 */}
              <div className="rounded-xl border bg-card p-4 shadow-sm space-y-2">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="text-xs font-medium">密码资产记录</span>
                  <ShieldCheck className="size-4 text-amber-500" />
                </div>
                <div className="text-lg font-bold tracking-tight text-foreground">
                  {dataMetrics.counts.totalPasswords} 组
                </div>
                <div className="text-[11px] text-muted-foreground">
                  正常 {dataMetrics.counts.activePasswords} · 回收站 {dataMetrics.counts.trashedPasswords}
                </div>
              </div>
            </div>
          ) : null}

          {/* 详细资源与资产分布 */}
          {dataMetrics && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 左侧：存储驱动与环境详情 */}
              <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <HardDrive className="size-4 text-primary" />
                  底层存储配置明细
                </h3>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                    <span className="text-muted-foreground">配置模式 / 运行时</span>
                    <span className="font-mono font-medium">{dataMetrics.storage.configuredType} / {dataMetrics.storage.environment}</span>
                  </div>
                  {dataMetrics.storage.dbPath && (
                    <div className="space-y-1 rounded-lg bg-muted/40 p-2.5">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>SQLite 本地数据库路径</span>
                        <button
                          type="button"
                          onClick={() => copyDbPath(dataMetrics.storage.dbPath!)}
                          className="flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
                        >
                          {copiedPath ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
                          {copiedPath ? '已复制' : '复制路径'}
                        </button>
                      </div>
                      <div className="font-mono text-[11px] text-foreground break-all">
                        {dataMetrics.storage.dbPath}
                      </div>
                    </div>
                  )}
                  {dataMetrics.storage.bindingName && (
                    <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                      <span className="text-muted-foreground">Cloudflare KV 命名空间绑定</span>
                      <span className="font-mono font-medium">{dataMetrics.storage.bindingName}</span>
                    </div>
                  )}
                  {dataMetrics.storage.fallbackReason && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 p-2.5 text-[11px] text-amber-800 dark:bg-amber-950/20 dark:text-amber-300">
                      ℹ️ {dataMetrics.storage.fallbackReason}
                    </div>
                  )}
                  <div className="text-[11px] text-muted-foreground/80 leading-relaxed pt-1">
                    {dataMetrics.storage.description}
                  </div>
                </div>
              </div>

              {/* 右侧：资产构成分布 */}
              <div className="rounded-xl border bg-card p-5 shadow-sm space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Layers className="size-4 text-primary" />
                  保险库资产构成明细
                </h3>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <KeyRound className="size-3.5 text-foreground" />
                      有效密码记录
                    </span>
                    <span className="font-semibold">{dataMetrics.counts.activePasswords} 条</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Trash2 className="size-3.5 text-muted-foreground" />
                      回收站暂存密码
                    </span>
                    <span className="font-semibold text-muted-foreground">{dataMetrics.counts.trashedPasswords} 条</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Folder className="size-3.5 text-foreground" />
                      自定义分类
                    </span>
                    <span className="font-semibold">{dataMetrics.counts.categories} 个</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <TagIcon className="size-3.5 text-foreground" />
                      自定义标签
                    </span>
                    <span className="font-semibold">{dataMetrics.counts.tags} 个</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 p-2.5">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <ShieldCheck className="size-3.5 text-foreground" />
                      已授权 API 密钥
                    </span>
                    <span className="font-semibold">{dataMetrics.counts.apiKeys} 个</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 备份与恢复 */}
          <div className="grid gap-4 md:grid-cols-2 pt-1">
            <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="font-semibold flex items-center gap-2">
                <Download className="size-4 text-primary" />
                导出数据
              </h2>
              <p className="text-sm text-muted-foreground">将所有密码、分类与标签下载为 JSON 完整备份文件。</p>
              <Button onClick={handleExport} className="w-full">
                <Download />
                下载备份
              </Button>
            </div>
            <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="font-semibold flex items-center gap-2">
                <Upload className="size-4 text-primary" />
                导入数据
              </h2>
              <p className="text-sm text-muted-foreground">从之前导出的 JSON 备份文件恢复或合并数据。</p>
              <label className="flex h-10 w-full cursor-pointer items-center justify-center rounded-lg border border-dashed border-input text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground">
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                选择 JSON 文件...
              </label>
            </div>
          </div>
        </TabsContent>

        {/* 危险操作 */}
        <TabsContent value="danger" className="mt-4">
          <div className="space-y-4 rounded-xl border border-destructive/40 bg-card p-6 shadow-sm">
            <div>
              <h2 className="flex items-center gap-2 font-semibold text-destructive">
                <AlertTriangle className="size-5" />
                危险操作
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">以下操作不可撤销，请谨慎操作。</p>
            </div>
            <div className="space-y-4 border-t pt-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium">清空回收站</div>
                  <div className="text-xs text-muted-foreground">永久删除所有已回收的密码</div>
                </div>
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto w-full"
                  onClick={() => setOpenEmptyTrashDialog(true)}
                >
                  <Trash2 className="size-4" />
                  清空回收站
                </Button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-3 border-t">
                <div>
                  <div className="font-medium">重置整个保险库</div>
                  <div className="text-xs text-muted-foreground">删除所有密码、分类和标签，保留主密码与 API 密钥</div>
                </div>
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto w-full"
                  onClick={() => {
                    setResetConfirmText('');
                    setOpenResetVaultDialog(true);
                  }}
                >
                  <AlertTriangle className="size-4" />
                  重置保险库
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 清空回收站确认 */}
      <AlertDialog open={openEmptyTrashDialog} onOpenChange={setOpenEmptyTrashDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <Trash2 className="size-5" />
              清空回收站？
            </AlertDialogTitle>
            <AlertDialogDescription>
              此操作将永久删除所有已在回收站中的密码，删除后无法找回或恢复。确定要继续清空吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={emptyTrashLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={emptyTrashLoading}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={async (e) => {
                e.preventDefault();
                setEmptyTrashLoading(true);
                try {
                  const res = await emptyTrashAction();
                  if (res.deletedCount === 0) {
                    toast.info('回收站目前为空，无需清理');
                  } else {
                    toast.success(`已清空回收站，永久删除了 ${res.deletedCount} 条记录`);
                  }
                  setOpenEmptyTrashDialog(false);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : '清空回收站失败');
                } finally {
                  setEmptyTrashLoading(false);
                }
              }}
            >
              {emptyTrashLoading ? '正在清空...' : '确定清空'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 重置整个保险库确认 */}
      <AlertDialog
        open={openResetVaultDialog}
        onOpenChange={(open) => {
          if (!open) {
            setResetConfirmText('');
            setOpenResetVaultDialog(false);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5" />
              危险：确认重置整个保险库？
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>
                  此操作将<strong className="text-foreground">永久删除保险库中所有的密码记录（包括回收站）、全部自定义分类与标签</strong>。
                </p>
                <p className="text-xs">
                  注意：您的主登录密码和 API 密钥仍将保留，操作完成后保险库将完全恢复为空白状态。
                </p>
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  为防止误触，请在下方输入 <span className="font-bold underline">重置</span> 或{' '}
                  <span className="font-bold underline font-mono">RESET</span> 以确认执行：
                </div>
                <Input
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="输入 重置 或 RESET"
                  className="font-mono text-sm"
                  autoFocus
                />
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetVaultLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                resetVaultLoading ||
                (resetConfirmText.trim() !== '重置' && resetConfirmText.trim().toUpperCase() !== 'RESET')
              }
              className="bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50"
              onClick={async (e) => {
                e.preventDefault();
                setResetVaultLoading(true);
                try {
                  const res = await resetVaultAction();
                  toast.success(
                    `保险库已重置：已清空 ${res.deletedPasswords} 条密码、${res.deletedCategories} 个分类、${res.deletedTags} 个标签`
                  );
                  setOpenResetVaultDialog(false);
                  setResetConfirmText('');
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : '重置保险库失败');
                } finally {
                  setResetVaultLoading(false);
                }
              }}
            >
              {resetVaultLoading ? '正在重置...' : '确认重置保险库'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 吊销确认 */}
      <AlertDialog open={!!pendingRevoke} onOpenChange={(open) => !open && setPendingRevoke(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>吊销「{pendingRevoke?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>该 API 密钥将立即停止工作，使用它的客户端将无法访问保险库。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleRevoke();
              }}
            >
              吊销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 重新生成确认 */}
      <AlertDialog open={!!pendingRegen} onOpenChange={(open) => !open && setPendingRegen(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>重新生成「{pendingRegen?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>旧密钥将立即失效，将生成一个新密钥且只显示一次。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleRegenerate();
              }}
            >
              重新生成
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
