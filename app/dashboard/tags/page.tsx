'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Pencil, Plus, Tag as TagIcon, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  listTagsAction,
  createTagAction,
  updateTagAction,
  deleteTagAction,
} from '@/app/actions/auth';
import type { Tag } from '@/lib/types';
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
          } ${value === c ? 'scale-110 border-foreground' : 'border-transparent'}`}
          style={{ backgroundColor: c }}
        />
      ))}
    </div>
  );
}

export default function TagsPage() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await listTagsAction();
      setTags(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await listTagsAction();
        if (!cancelled) setTags(data);
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
    const fd = new FormData();
    fd.set('name', newName.trim());
    if (newColor) fd.set('color', newColor);
    const res = await createTagAction(fd);
    if (res.ok) {
      toast.success('标签已创建');
      setNewName('');
      setNewColor('');
      load();
    }
  }

  function startEdit(t: Tag) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditColor(t.color || '');
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return;
    const fd = new FormData();
    fd.set('name', editName.trim());
    if (editColor) fd.set('color', editColor);
    await updateTagAction(id, fd);
    toast.success('标签已更新');
    setEditingId(null);
    load();
  }

  async function handleDelete() {
    if (!deleteId) return;
    await deleteTagAction(deleteId);
    toast.success('标签已删除');
    setDeleteId(null);
    load();
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">标签管理</h1>
        <p className="mt-1 text-sm text-muted-foreground">为密码添加灵活的自定义标签</p>
      </div>

      <form onSubmit={handleCreate} className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex gap-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="新建标签名称..."
          />
          <Button type="submit">
            <Plus />
            添加
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">颜色:</span>
          <ColorSwatches value={newColor} onChange={setNewColor} />
        </div>
      </form>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : tags.length === 0 ? (
        <div className="rounded-xl border border-dashed py-16 text-center">
          <div className="mb-4 inline-flex size-14 items-center justify-center rounded-xl bg-muted">
            <TagIcon className="size-7 text-muted-foreground" />
          </div>
          <h3 className="mb-1 font-semibold">还没有标签</h3>
          <p className="text-sm text-muted-foreground">创建标签以更好地整理密码</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {tags.map((t) => (
            <div
              key={t.id}
              className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-ring/50"
            >
              <Link href={`/dashboard?tag=${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <div
                  className="flex size-9 shrink-0 items-center justify-center rounded-lg"
                  style={t.color ? { backgroundColor: t.color + '20', color: t.color } : undefined}
                >
                  <TagIcon className={t.color ? '' : 'text-muted-foreground'} />
                </div>
                {editingId === t.id ? (
                  <div className="flex-1 space-y-2">
                    <Input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit(t.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      className="h-8"
                    />
                    <ColorSwatches value={editColor} onChange={setEditColor} size="sm" />
                  </div>
                ) : (
                  <div className="min-w-0">
                    <div className="truncate font-medium">#{t.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </Link>
              <div className="flex shrink-0 gap-1">
                {editingId === t.id ? (
                  <>
                    <Button variant="ghost" size="icon" className="size-8 text-green-600" onClick={() => saveEdit(t.id)}>
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
                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground" onClick={() => startEdit(t)}>
                      <Pencil />
                      <span className="sr-only">编辑</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteId(t.id)}
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
            <AlertDialogTitle>删除该标签？</AlertDialogTitle>
            <AlertDialogDescription>它将被从所有密码中移除。</AlertDialogDescription>
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
