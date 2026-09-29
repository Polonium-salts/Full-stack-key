'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Check,
  Folder,
  FolderTree,
  Pencil,
  Plus,
  Tag as TagIcon,
  Trash2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listCategoriesAction,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
  getCategoryCountsAction,
  listTagsAction,
  createTagAction,
  updateTagAction,
  deleteTagAction,
  getTagCountsAction,
} from '@/app/actions/auth';
import type { Category, Tag } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

const COLOR_OPTIONS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#64748b',
];

function ColorSwatches({
  value,
  onChange,
  size = 'md',
}: {
  value: string;
  onChange: (c: string) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {COLOR_OPTIONS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(value === c ? '' : c)}
          aria-label={`选择颜色 ${c}`}
          className={`rounded-full border-2 transition-transform ${
            size === 'sm' ? 'size-4' : 'size-5'
          } ${value === c ? 'scale-110 border-foreground shadow-sm' : 'border-transparent hover:scale-105'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

function CategoriesAndTagsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get('tab') === 'tags' ? 'tags' : 'categories';

  // Categories state
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loadingCategories, setLoadingCategories] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [categoryError, setCategoryError] = useState('');
  const [deleteCategoryId, setDeleteCategoryId] = useState<string | null>(null);

  // Tags state
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [loadingTags, setLoadingTags] = useState(true);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editTagName, setEditTagName] = useState('');
  const [editTagColor, setEditTagColor] = useState('');
  const [deleteTagId, setDeleteTagId] = useState<string | null>(null);

  const handleTabChange = (value: string) => {
    const nextTab = value === 'tags' ? 'tags' : 'categories';
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', nextTab);
    router.replace(`/dashboard/categories?${params.toString()}`, { scroll: false });
  };

  async function loadCategories() {
    setLoadingCategories(true);
    try {
      const [data, counts] = await Promise.all([
        listCategoriesAction(),
        getCategoryCountsAction(),
      ]);
      setCategories(data);
      setCategoryCounts(counts);
    } finally {
      setLoadingCategories(false);
    }
  }

  async function loadTags() {
    setLoadingTags(true);
    try {
      const [data, counts] = await Promise.all([
        listTagsAction(),
        getTagCountsAction(),
      ]);
      setTags(data);
      setTagCounts(counts);
    } finally {
      setLoadingTags(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [cats, catCounts, tgs, tagCounts] = await Promise.all([
          listCategoriesAction(),
          getCategoryCountsAction(),
          listTagsAction(),
          getTagCountsAction(),
        ]);
        if (!cancelled) {
          setCategories(cats);
          setCategoryCounts(catCounts);
          setTags(tgs);
          setTagCounts(tagCounts);
        }
      } finally {
        if (!cancelled) {
          setLoadingCategories(false);
          setLoadingTags(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Category handlers
  async function handleCreateCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setCategoryError('');
    const fd = new FormData();
    fd.set('name', newCategoryName.trim());
    const res = await createCategoryAction(fd);
    if (!res.ok) {
      setCategoryError(res.error || '创建失败');
    } else {
      toast.success('分类已创建');
      setNewCategoryName('');
      loadCategories();
    }
  }

  function startEditCategory(c: Category) {
    setEditingCategoryId(c.id);
    setEditCategoryName(c.name);
  }

  async function saveEditCategory(id: string) {
    if (!editCategoryName.trim()) return;
    const fd = new FormData();
    fd.set('name', editCategoryName.trim());
    const res = await updateCategoryAction(id, fd);
    if (!res.ok) {
      toast.error(res.error || '更新分类失败');
      return;
    }
    toast.success('分类已更新');
    setEditingCategoryId(null);
    loadCategories();
  }

  async function handleDeleteCategory() {
    if (!deleteCategoryId) return;
    await deleteCategoryAction(deleteCategoryId);
    toast.success('分类已删除');
    setDeleteCategoryId(null);
    loadCategories();
  }

  // Tag handlers
  async function handleCreateTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newTagName.trim()) return;
    const fd = new FormData();
    fd.set('name', newTagName.trim());
    if (newTagColor) fd.set('color', newTagColor);
    const res = await createTagAction(fd);
    if (res.ok) {
      toast.success('标签已创建');
      setNewTagName('');
      setNewTagColor('');
      loadTags();
    }
  }

  function startEditTag(t: Tag) {
    setEditingTagId(t.id);
    setEditTagName(t.name);
    setEditTagColor(t.color || '');
  }

  async function saveEditTag(id: string) {
    if (!editTagName.trim()) return;
    const fd = new FormData();
    fd.set('name', editTagName.trim());
    if (editTagColor) fd.set('color', editTagColor);
    const res = await updateTagAction(id, fd);
    if (!res.ok) {
      toast.error(res.error || '更新标签失败');
      return;
    }
    toast.success('标签已更新');
    setEditingTagId(null);
    loadTags();
  }

  async function handleDeleteTag() {
    if (!deleteTagId) return;
    await deleteTagAction(deleteTagId);
    toast.success('标签已删除');
    setDeleteTagId(null);
    loadTags();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight">
            <FolderTree className="size-6 text-primary" />
            分类与标签
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            集中管理密码分类与多维标签，让检索与归类更加井井有条
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 sm:w-[280px]">
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Folder className="size-4" />
            <span>分类管理 ({categories.length})</span>
          </TabsTrigger>
          <TabsTrigger value="tags" className="flex items-center gap-2">
            <TagIcon className="size-4" />
            <span>标签管理 ({tags.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* Categories Tab */}
        <TabsContent value="categories" className="space-y-6">
          <form onSubmit={handleCreateCategory} className="flex gap-3 rounded-xl border bg-card p-4 shadow-sm">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="新建分类名称..."
              className="flex-1"
            />
            <Button type="submit">
              <Plus className="size-4" />
              添加分类
            </Button>
          </form>

          {categoryError && <p className="text-sm text-destructive">{categoryError}</p>}

          {loadingCategories ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <div className="mb-4 inline-flex size-14 items-center justify-center rounded-xl bg-muted">
                <Folder className="size-7 text-muted-foreground" />
              </div>
              <h3 className="mb-1 font-semibold">还没有分类</h3>
              <p className="text-sm text-muted-foreground">在上方输入名称创建你的第一个分类</p>
            </div>
          ) : (
            <div className="space-y-2">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-ring/50"
                >
                  <Link
                    href={`/dashboard?categoryId=${cat.id}`}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Folder className="size-4" />
                    </div>
                    {editingCategoryId === cat.id ? (
                      <Input
                        autoFocus
                        value={editCategoryName}
                        onChange={(e) => setEditCategoryName(e.target.value)}
                        onBlur={() => saveEditCategory(cat.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEditCategory(cat.id);
                          if (e.key === 'Escape') setEditingCategoryId(null);
                        }}
                        onClick={(e) => e.preventDefault()}
                        className="h-8"
                      />
                    ) : (
                      <div className="min-w-0">
                        <div className="truncate font-medium">{cat.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {(categoryCounts[cat.id] ?? 0) > 0
                            ? `${categoryCounts[cat.id]} 条密码`
                            : '未使用'}
                        </div>
                      </div>
                    )}
                  </Link>
                  <div className="flex shrink-0 gap-1">
                    {editingCategoryId === cat.id ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-green-600 hover:text-green-700"
                          onClick={() => saveEditCategory(cat.id)}
                        >
                          <Check className="size-4" />
                          <span className="sr-only">保存</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          onClick={() => setEditingCategoryId(null)}
                        >
                          <X className="size-4" />
                          <span className="sr-only">取消</span>
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          onClick={() => startEditCategory(cat)}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">编辑</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteCategoryId(cat.id)}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">删除</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tags Tab */}
        <TabsContent value="tags" className="space-y-6">
          <form onSubmit={handleCreateTag} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex gap-3">
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="新建标签名称..."
                className="flex-1"
              />
              <Button type="submit">
                <Plus className="size-4" />
                添加标签
              </Button>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <span className="text-xs text-muted-foreground">颜色:</span>
              <ColorSwatches value={newTagColor} onChange={setNewTagColor} />
            </div>
          </form>

          {loadingTags ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : tags.length === 0 ? (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <div className="mb-4 inline-flex size-14 items-center justify-center rounded-xl bg-muted">
                <TagIcon className="size-7 text-muted-foreground" />
              </div>
              <h3 className="mb-1 font-semibold">还没有标签</h3>
              <p className="text-sm text-muted-foreground">创建标签以更好地为密码打上个性化标记</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tags.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-ring/50"
                >
                  <Link href={`/dashboard?tag=${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <div
                      className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                      style={
                        t.color
                          ? { backgroundColor: `${t.color}20`, color: t.color }
                          : { backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)' }
                      }
                    >
                      <TagIcon className="size-4" />
                    </div>
                    {editingTagId === t.id ? (
                      <div className="flex-1 space-y-2">
                        <Input
                          autoFocus
                          value={editTagName}
                          onChange={(e) => setEditTagName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEditTag(t.id);
                            if (e.key === 'Escape') setEditingTagId(null);
                          }}
                          className="h-8"
                        />
                        <ColorSwatches value={editTagColor} onChange={setEditTagColor} size="sm" />
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 truncate font-medium">
                          <span>#{t.name}</span>
                          {t.color && (
                            <span
                              className="size-2 rounded-full inline-block shrink-0"
                              style={{ backgroundColor: t.color }}
                            />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {(tagCounts[t.id] ?? 0) > 0
                            ? `${tagCounts[t.id]} 条密码`
                            : '未使用'}
                        </div>
                      </div>
                    )}
                  </Link>
                  <div className="flex shrink-0 gap-1">
                    {editingTagId === t.id ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-green-600 hover:text-green-700"
                          onClick={() => saveEditTag(t.id)}
                        >
                          <Check className="size-4" />
                          <span className="sr-only">保存</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          onClick={() => setEditingTagId(null)}
                        >
                          <X className="size-4" />
                          <span className="sr-only">取消</span>
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground"
                          onClick={() => startEditTag(t)}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">编辑</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteTagId(t.id)}
                        >
                          <Trash2 className="size-4" />
                          <span className="sr-only">删除</span>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Category Dialog */}
      <AlertDialog open={!!deleteCategoryId} onOpenChange={(open) => !open && setDeleteCategoryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该分类？</AlertDialogTitle>
            <AlertDialogDescription>该分类下的密码将被移出分类，密码本身不会被删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDeleteCategory();
              }}
            >
              删除分类
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Tag Dialog */}
      <AlertDialog open={!!deleteTagId} onOpenChange={(open) => !open && setDeleteTagId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除该标签？</AlertDialogTitle>
            <AlertDialogDescription>该标签将被从所有包含它的密码记录中移除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                handleDeleteTag();
              }}
            >
              删除标签
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function CategoriesAndTagsPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl space-y-6">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        </div>
      }
    >
      <CategoriesAndTagsContent />
    </Suspense>
  );
}
