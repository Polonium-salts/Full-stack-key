'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import {
  listApiKeysAction,
  createApiKeyAction,
  revokeApiKeyAction,
  regenerateApiKeyAction,
  changeMasterPasswordAction,
  exportDataAction,
  importDataAction,
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

  async function loadKeys() {
    const data = await listApiKeysAction();
    setApiKeys(data as ApiKeyRow[]);
  }

  useEffect(() => {
    let cancelled = false;
    listApiKeysAction()
      .then((data) => {
        if (!cancelled) setApiKeys(data as ApiKeyRow[]);
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
      toast.success(
        `导入完成：新增 ${res.imported}，跳过 ${res.skipped}，覆盖 ${res.overwritten}，重复 ${res.duplicated}`
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
        <TabsContent value="data" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="font-semibold">导出数据</h2>
              <p className="text-sm text-muted-foreground">将所有密码下载为 JSON 备份文件。</p>
              <Button onClick={handleExport} className="w-full">
                <Download />
                下载备份
              </Button>
            </div>
            <div className="space-y-3 rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="font-semibold">导入数据</h2>
              <p className="text-sm text-muted-foreground">从之前导出的 JSON 文件恢复数据。</p>
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
              <h2 className="font-semibold text-destructive">危险操作</h2>
              <p className="mt-1 text-sm text-muted-foreground">以下操作不可撤销，请谨慎操作。</p>
            </div>
            <div className="space-y-3 border-t pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">清空回收站</div>
                  <div className="text-xs text-muted-foreground">永久删除所有已回收的密码</div>
                </div>
                <Button variant="outline" disabled className="text-destructive">
                  即将上线
                </Button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">重置整个保险库</div>
                  <div className="text-xs text-muted-foreground">删除所有密码、分类和标签</div>
                </div>
                <Button variant="outline" disabled className="text-destructive">
                  即将上线
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

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
