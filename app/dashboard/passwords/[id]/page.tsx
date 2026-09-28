'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Copy,
  Check,
  Eye,
  EyeOff,
  Pencil,
  RotateCcw,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  getPasswordDetailAction,
  updatePasswordAction,
  deletePasswordAction,
  restorePasswordAction,
  listCategoriesAction,
  listTagsAction,
  generatePasswordAction,
} from '@/app/actions/auth';
import type { PasswordEntryDecrypted, Category, Tag } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { PasswordStrength } from '@/components/password-strength';

export const dynamic = 'force-dynamic';

export default function PasswordDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [entry, setEntry] = useState<PasswordEntryDecrypted | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [strength, setStrength] = useState<number | null>(null);
  const [confirmPermanent, setConfirmPermanent] = useState(false);

  useEffect(() => {
    params.then((p) => setResolvedId(p.id));
  }, [params]);

  useEffect(() => {
    if (!resolvedId) return;
    (async () => {
      try {
        const [e, cats, tgs] = await Promise.all([
          getPasswordDetailAction(resolvedId),
          listCategoriesAction(),
          listTagsAction(),
        ]);
        setEntry(e);
        setSelectedTags(e.tags);
        setCategoryId(e.categoryId || '');
        setCategories(cats);
        setTags(tgs);
      } finally {
        setLoading(false);
      }
    })();
  }, [resolvedId]);

  async function handleCopy(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('复制失败');
    }
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    if (!resolvedId || !entry) return;
    e.preventDefault();
    setError('');
    const formData = new FormData(e.currentTarget);
    formData.set('tags', selectedTags.join(','));
    formData.set('categoryId', categoryId);
    formData.set('version', String(entry.version));
    const res = await updatePasswordAction(resolvedId, formData);
    if (!res.ok) {
      setError(res.error || '更新失败');
    } else {
      toast.success('已保存');
      const updated = await getPasswordDetailAction(resolvedId);
      setEntry(updated);
      setSelectedTags(updated.tags);
      setCategoryId(updated.categoryId || '');
      setMode('view');
    }
  }

  function askDelete(permanent: boolean) {
    if (permanent) {
      setConfirmPermanent(true);
    } else {
      doDelete(false);
    }
  }

  async function doDelete(permanent: boolean) {
    if (!resolvedId) return;
    try {
      await deletePasswordAction(resolvedId, permanent);
      toast.success(permanent ? '已永久删除' : '已移入回收站');
      router.push('/dashboard');
    } catch {
      toast.error('删除失败');
    }
  }

  async function handleRestore() {
    if (!resolvedId) return;
    try {
      await restorePasswordAction(resolvedId);
      toast.success('已恢复');
      router.push('/dashboard');
    } catch {
      toast.error('恢复失败');
    }
  }

  async function handleGenerate(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const res = await generatePasswordAction();
    const input = document.getElementById('edit-password') as HTMLInputElement | null;
    if (input) {
      input.value = res.password;
      setStrength(res.strength.score);
    }
  }

  if (loading || !entry) {
    return (
      <div className="mx-auto max-w-2xl space-y-4 py-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  function scorePassword(pwd: string): number | null {
    if (pwd.length < 1) return null;
    let s = 0;
    if (pwd.length >= 8) s++;
    if (pwd.length >= 12) s++;
    if (/[A-Z]/.test(pwd)) s++;
    if (/[a-z]/.test(pwd)) s++;
    if (/[0-9]/.test(pwd)) s++;
    if (/[^A-Za-z0-9]/.test(pwd)) s++;
    return Math.min(4, Math.floor((s * 4) / 6));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard" aria-label="返回">
            <ArrowLeft />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{entry.site}</h1>
          {entry.url && <p className="truncate text-sm text-muted-foreground">{entry.url}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {entry.trashed ? (
            <Button onClick={handleRestore}>
              <RotateCcw />
              恢复
            </Button>
          ) : (
            <Button
              variant={mode === 'view' ? 'default' : 'outline'}
              onClick={() => setMode(mode === 'view' ? 'edit' : 'view')}
            >
              <Pencil />
              {mode === 'view' ? '编辑' : '取消'}
            </Button>
          )}
          <Button variant="destructive" size="icon" onClick={() => askDelete(entry.trashed)} title={entry.trashed ? '永久删除' : '移入回收站'}>
            <Trash2 />
            <span className="sr-only">{entry.trashed ? '永久删除' : '移入回收站'}</span>
          </Button>
        </div>
      </div>

      {error && mode === 'edit' && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSave} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm md:p-8">
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>网站 / 服务</Label>
            {mode === 'view' ? (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm font-medium">{entry.site}</div>
            ) : (
              <Input name="site" required defaultValue={entry.site} />
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>URL</Label>
            {mode === 'view' ? (
              entry.url ? (
                <a
                  href={entry.url.startsWith('http') ? entry.url : 'https://' + entry.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border bg-muted/40 px-3 py-2.5 text-sm text-primary hover:underline"
                >
                  {entry.url}
                </a>
              ) : (
                <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm italic text-muted-foreground">未设置</div>
              )
            ) : (
              <Input name="url" type="url" defaultValue={entry.url || ''} />
            )}
          </div>

          <div className="space-y-2">
            <Label>用户名</Label>
            {mode === 'view' ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{entry.username}</span>
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => handleCopy('user', entry.username)}>
                  {copied === 'user' ? <Check className="text-green-600" /> : <Copy />}
                  <span className="sr-only">复制用户名</span>
                </Button>
              </div>
            ) : (
              <Input name="username" required defaultValue={entry.username} autoComplete="off" />
            )}
          </div>

          <div className="space-y-2">
            <Label>分类</Label>
            {mode === 'view' ? (
              <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
                {categories.find((c) => c.id === entry.categoryId)?.name || '无'}
              </div>
            ) : (
              <Select value={categoryId || 'none'} onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="无" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">无</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>密码</Label>
            {mode === 'view' ? (
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
                <code className="min-w-0 flex-1 break-all font-mono text-sm tracking-wide">
                  {showPassword ? entry.password : '•'.repeat(entry.password.length)}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7 text-muted-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                  <span className="sr-only">{showPassword ? '隐藏密码' : '显示密码'}</span>
                </Button>
                <Button type="button" variant="ghost" size="icon" className="size-7" onClick={() => handleCopy('pwd', entry.password)}>
                  {copied === 'pwd' ? <Check className="text-green-600" /> : <Copy />}
                  <span className="sr-only">复制密码</span>
                </Button>
              </div>
            ) : (
              <div>
                <div className="relative">
                  <Input
                    id="edit-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    onChange={(e) => setStrength(scorePassword(e.target.value))}
                    defaultValue={entry.password}
                    autoComplete="off"
                    className="pr-20 font-mono"
                  />
                  <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1">
                    <Button type="button" variant="secondary" size="sm" className="h-7 px-2 text-xs" onClick={handleGenerate}>
                      <Wand2 className="size-3" />
                      生成
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7 text-muted-foreground"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      <span className="sr-only">{showPassword ? '隐藏密码' : '显示密码'}</span>
                    </Button>
                  </div>
                </div>
                {strength !== null && <PasswordStrength score={strength} className="mt-2" />}
              </div>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>备注</Label>
            {mode === 'view' ? (
              <div className="min-h-16 whitespace-pre-wrap rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
                {entry.notes || <span className="italic text-muted-foreground">暂无备注</span>}
              </div>
            ) : (
              <Textarea name="notes" rows={3} defaultValue={entry.notes || ''} className="resize-none" />
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>标签</Label>
            {mode === 'view' ? (
              <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg border bg-muted/40 p-3">
                {entry.tags.length === 0 ? (
                  <span className="text-sm italic text-muted-foreground">暂无标签</span>
                ) : (
                  entry.tags.map((tid) => {
                    const t = tags.find((x) => x.id === tid);
                    return t ? (
                      <Badge
                        key={t.id}
                        variant="outline"
                        style={t.color ? { borderColor: t.color, color: t.color } : undefined}
                      >
                        #{t.name}
                      </Badge>
                    ) : null;
                  })
                )}
              </div>
            ) : (
              <div className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-input bg-transparent p-3">
                {tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id]
                      )
                    }
                    style={t.color && selectedTags.includes(t.id) ? { borderColor: t.color, color: t.color } : undefined}
                  >
                    <Badge variant={selectedTags.includes(t.id) ? 'default' : 'outline'} className="cursor-pointer select-none">
                      #{t.name}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1 border-t pt-4 text-xs text-muted-foreground">
          <div>创建于:{new Date(entry.createdAt).toLocaleString()}</div>
          <div>
            更新于:{new Date(entry.updatedAt).toLocaleString()} · 版本 {entry.version}
          </div>
          {entry.trashedAt && <div>删除于:{new Date(entry.trashedAt).toLocaleString()}</div>}
        </div>

        {mode === 'edit' && (
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={() => setMode('view')}>
              取消
            </Button>
            <Button type="submit" className="flex-1 md:flex-none md:px-8">
              保存修改
            </Button>
          </div>
        )}
      </form>

      <AlertDialog open={confirmPermanent} onOpenChange={setConfirmPermanent}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>永久删除该密码？</AlertDialogTitle>
            <AlertDialogDescription>此操作无法撤销，密码条目将被永久删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                setConfirmPermanent(false);
                doDelete(true);
              }}
            >
              永久删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
