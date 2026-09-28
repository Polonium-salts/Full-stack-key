'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Folder, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  listCategoriesAction,
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from '@/app/actions/auth';
import type { Category } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [error, setError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listCategoriesAction();
      setCategories(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listCategoriesAction();
        if (!cancelled) setCategories(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setError('');
    const fd = new FormData();
    fd.set('name', newName.trim());
    const res = await createCategoryAction(fd);
    if (!res.ok) {
      setError(res.error || '创建失败');
    } else {
      toast.success('分类已创建');
      setNewName('');
      load();
    }
  }

  function startEdit(c: Category) {
    setEditingId(c.id);
    setEditName(c.name);
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    const fd = new FormData();
    fd.set('name', editName.trim());
    await updateCategoryAction(id, fd);
    toast.success('分类已更新');
    setEditingId(null);
    load();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteCategoryAction(deleteId);
    toast.success('分类已删除');
    setDeleteId(null);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">分类管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">将密码整理到不同的分类中</p>
      </div>

      <form onSubmit={handleCreate} className="flex gap-3 rounded-xl border bg-card p-4 shadow-sm">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="新建分类名称..."
        />
        <Button type="submit">
          <Plus />
          添加
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {loading ? (
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
          <p className="text-sm text-muted-foreground">在上方创建你的第一个分类</p>
        </div>
      ) : (
        <div className="space-y-2">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-ring/50"
            >
              <Link href={`/dashboard?categoryId=${cat.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Folder className="size-4" />
                </div>
                {editingId === cat.id ? (
                  <Input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onBlur={() => saveEdit(cat.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveEdit(cat.id);
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onClick={(e) => e.preventDefault()}
                    className="h-8"
                  />
                ) : (
                  <div className="min-w-0">
                    <div className="truncate font-medium">{cat.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(cat.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </Link>
              <div className="flex shrink-0 gap-1">
                {editingId === cat.id ? (
                  <>
                    <Button variant="ghost" size="icon" className="size-8 text-green-600" onClick={() => saveEdit(cat.id)}>
                      <Check />
                      <span className="sr-only">保存</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => setEditingId(null)}>
                      <X />
                      <span className="sr-only">取消</span>
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => startEdit(cat)}>
                      <Pencil />
                      <span className="sr-only">编辑</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteId(cat.id)}
                    >
                      <Trash2 />
                      <span className="sr-only">删除</span>
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
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
                handleDelete();
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
