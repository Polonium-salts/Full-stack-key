'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Copy,
  Check,
  FolderOpen,
  KeyRound,
  MoreHorizontal,
  RotateCcw,
  Search,
  Tag as TagIcon,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listPasswordsAction,
  deletePasswordAction,
  restorePasswordAction,
  listCategoriesAction,
  listTagsAction,
} from '@/app/actions/auth';
import type { PasswordEntryDecrypted, Category, Tag } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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

function DashboardInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get('search') || '';
  const initialCategory = searchParams.get('categoryId') || '';
  const initialTag = searchParams.get('tag') || '';
  const initialTrashed = searchParams.get('trashed') === 'true';

  const [passwords, setPasswords] = useState<PasswordEntryDecrypted[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [search, setSearch] = useState(initialSearch);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [selectedTag, setSelectedTag] = useState(initialTag);
  const [showTrashed, setShowTrashed] = useState(initialTrashed);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; permanent: boolean } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // 数据加载（含搜索/过滤防抖）
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const [result, cats, tgs] = await Promise.all([
          listPasswordsAction({
            search,
            categoryId: selectedCategory || undefined,
            tag: selectedTag || undefined,
            trashed: showTrashed,
          }),
          listCategoriesAction(),
          listTagsAction(),
        ]);
        if (!cancelled) {
          setPasswords(result.items || []);
          setCategories(cats);
          setTags(tgs);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, selectedCategory, selectedTag, showTrashed, reloadKey]);

  async function handleCopy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.error('复制失败');
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    try {
      await deletePasswordAction(pendingDelete.id, pendingDelete.permanent);
      toast.success(pendingDelete.permanent ? '已永久删除' : '已移入回收站');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('删除失败');
    } finally {
      setPendingDelete(null);
    }
  }

  async function handleRestore(id: string) {
    try {
      await restorePasswordAction(id);
      toast.success('已恢复');
      setReloadKey((k) => k + 1);
    } catch {
      toast.error('恢复失败');
    }
  }

  function getTagById(id: string) {
    return tags.find((t) => t.id === id);
  }
  function getCategoryById(id: string) {
    return categories.find((c) => c.id === id);
  }
  function getTagLabel(tid: string) {
    const t = getTagById(tid);
    // 已删除/未知标签的兑底显示
    return { name: t?.name ?? '未知标签', color: t?.color };
  }

  return (
    <div className="space-y-6">
      {/* 页头 */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {showTrashed ? '回收站' : '全部密码'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">共 {passwords.length} 条</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showTrashed}
              onChange={(e) => setShowTrashed(e.target.checked)}
              className="size-4 rounded border-input accent-[foreground]"
            />
            显示回收站
          </label>
        </div>
      </div>

      {/* 搜索与过滤 */}
      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="按网站、网址或用户名搜索..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={selectedCategory || 'all'} onValueChange={(v) => setSelectedCategory(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="全部分类" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部分类</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={selectedTag || 'all'} onValueChange={(v) => setSelectedTag(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-full md:w-44">
            <SelectValue placeholder="全部标签" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部标签</SelectItem>
            {tags.map((t) => (
              <SelectItem key={t.id} value={t.id}>#{t.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border bg-card p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-40" />
                </div>
              </div>
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </div>
      ) : passwords.length === 0 ? (
        <div className="rounded-xl border border-dashed py-20 text-center">
          <div className="mb-4 inline-flex size-16 items-center justify-center rounded-2xl bg-muted">
            <KeyRound className="size-8 text-muted-foreground" />
          </div>
          <h3 className="mb-2 text-lg font-semibold">{showTrashed ? '回收站为空' : '还没有密码'}</h3>
          <p className="mb-6 text-sm text-muted-foreground">
            {showTrashed
              ? '已删除的密码会显示在这里。'
              : '可通过浏览器扩展自动保存密码，或在设置中导入已有密码。'}
          </p>
          {!showTrashed && (
            <Button asChild variant="outline">
              <Link href="/dashboard/settings">
                前往导入或配置扩展
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {passwords.map((entry) => (
            <div
              key={entry.id}
              className="group cursor-pointer rounded-xl border bg-card p-5 shadow-sm transition-all hover:border-ring/50 hover:shadow-md"
              onClick={() => router.push(`/dashboard/passwords/${entry.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') router.push(`/dashboard/passwords/${entry.id}`);
              }}
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 font-semibold text-primary">
                    {entry.site.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold">{entry.site}</h3>
                    {entry.url && (
                      <p className="truncate text-xs text-muted-foreground">
                        {entry.url.replace(/^https?:\/\//, '')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal />
                        <span className="sr-only">操作</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {showTrashed ? (
                        <>
                          <DropdownMenuItem onClick={() => handleRestore(entry.id)}>
                            <RotateCcw />
                            恢复
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => setPendingDelete({ id: entry.id, permanent: true })}
                          >
                            <Trash2 />
                            永久删除
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => setPendingDelete({ id: entry.id, permanent: false })}
                        >
                          <Trash2 />
                          移入回收站
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">用户名</span>
                  <span className="min-w-0 flex-1 truncate font-medium">{entry.username}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(entry.id + '-u', entry.username);
                    }}
                  >
                    {copied === entry.id + '-u' ? <Check className="text-green-600" /> : <Copy />}
                    <span className="sr-only">复制用户名</span>
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-10 shrink-0 text-xs text-muted-foreground">密码</span>
                  <span className="min-w-0 flex-1 truncate font-mono tracking-wide">
                    {'•'.repeat(Math.min(entry.password.length, 16))}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(entry.id + '-p', entry.password);
                    }}
                  >
                    {copied === entry.id + '-p' ? <Check className="text-green-600" /> : <Copy />}
                    <span className="sr-only">复制密码</span>
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-1.5">
                {entry.categoryId && (
                  <Badge variant="secondary">
                    <FolderOpen className="size-3" />
                    {getCategoryById(entry.categoryId)?.name || '未分类'}
                  </Badge>
                )}
                {entry.tags.slice(0, 3).map((tid) => {
                  const { name, color } = getTagLabel(tid);
                  return (
                    <Badge
                      key={tid}
                      variant="outline"
                      className="gap-1"
                      style={color ? { borderColor: color, color } : undefined}
                    >
                      <TagIcon className="size-3" />
                      {name}
                    </Badge>
                  );
                })}
                {entry.tags.length > 3 && (
                  <Badge variant="secondary">+{entry.tags.length - 3}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 删除确认 */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingDelete?.permanent ? '永久删除该密码？' : '移入回收站？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.permanent
                ? '此操作无法撤销，密码条目将被永久删除。'
                : '密码将移入回收站，之后仍可恢复。'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className={pendingDelete?.permanent ? 'bg-destructive text-white hover:bg-destructive/90' : ''}
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
            >
              {pendingDelete?.permanent ? '永久删除' : '移入回收站'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-2xl space-y-4 py-20">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      }
    >
      <DashboardInner />
    </Suspense>
  );
}
