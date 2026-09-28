'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Eye, EyeOff, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  createPasswordAction,
  listCategoriesAction,
  listTagsAction,
  generatePasswordAction,
} from '@/app/actions/auth';
import type { Category, Tag } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PasswordStrength } from '@/components/password-strength';

export const dynamic = 'force-dynamic';

export default function NewPasswordPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [tags, setTags] = useState<Tag[] | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [strength, setStrength] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (categories && tags) return;
    (async () => {
      const [cats, tgs] = await Promise.all([listCategoriesAction(), listTagsAction()]);
      setCategories(cats);
      setTags(tgs);
    })();
  }, [categories, tags]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('tags', selectedTags.join(','));
    formData.set('categoryId', categoryId);
    const res = await createPasswordAction(formData);
    if (!res.ok) {
      setError(res.error || '创建失败');
      setSubmitting(false);
    } else {
      toast.success('密码已创建');
      router.push('/dashboard');
    }
  }

  async function handleGenerate(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const res = await generatePasswordAction({ length: 20, uppercase: true, lowercase: true, numbers: true, symbols: true });
    const pwdInput = document.getElementById('password') as HTMLInputElement | null;
    if (pwdInput) {
      pwdInput.value = res.password;
      setStrength(res.strength.score);
    }
  }

  function onPasswordChange(e: React.ChangeEvent<HTMLInputElement>) {
    const pwd = e.target.value;
    if (pwd.length < 4) {
      setStrength(null);
      return;
    }
    let score = 0;
    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[A-Z]/.test(pwd)) score++;
    if (/[a-z]/.test(pwd)) score++;
    if (/[0-9]/.test(pwd)) score++;
    if (/[^A-Za-z0-9]/.test(pwd)) score++;
    setStrength(Math.min(4, Math.floor((score * 4) / 6)));
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard" aria-label="返回">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">新建密码</h1>
          <p className="text-sm text-muted-foreground">添加一条新的密码记录</p>
        </div>
      </div>

      <form onSubmit={onSubmit} className="space-y-5 rounded-xl border bg-card p-6 shadow-sm md:p-8">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="site">网站 / 服务名称 *</Label>
            <Input id="site" name="site" required placeholder="例如：GitHub、Gmail、Netflix" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="url">URL</Label>
            <Input id="url" name="url" type="url" placeholder="https://example.com" />
          </div>

          <div className="space-y-2">
            <Label htmlFor="username">用户名 / 邮箱 *</Label>
            <Input id="username" name="username" required placeholder="your@email.com" autoComplete="off" />
          </div>

          <div className="space-y-2">
            <Label>分类</Label>
            <Select value={categoryId || 'none'} onValueChange={(v) => setCategoryId(v === 'none' ? '' : v)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="无" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">无</SelectItem>
                {categories?.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="password">密码 *</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                onChange={onPasswordChange}
                autoComplete="new-password"
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

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="notes">备注</Label>
            <Textarea id="notes" name="notes" rows={3} placeholder="补充备注信息..." className="resize-none" />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>标签</Label>
            <div className="flex min-h-12 flex-wrap gap-2 rounded-lg border border-input bg-transparent p-3">
              {tags?.length === 0 && (
                <span className="text-sm text-muted-foreground">暂无标签，请先在「标签管理」页面创建。</span>
              )}
              {tags?.map((t) => (
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
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" asChild>
            <Link href="/dashboard">取消</Link>
          </Button>
          <Button type="submit" disabled={submitting} className="flex-1 md:flex-none md:px-8">
            保存密码
          </Button>
        </div>
      </form>
    </div>
  );
}
