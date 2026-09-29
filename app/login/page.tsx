'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, LockKeyhole, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { initAppAction, loginAction, getInitStatus } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ThemeToggle } from '@/components/theme-toggle';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'login' | 'init'>('login');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function checkInit() {
      try {
        const s = await getInitStatus();
        if (mounted && s && typeof s.initialized === 'boolean') {
          setMode(s.initialized ? 'login' : 'init');
          return;
        }
      } catch (err) {
        console.warn('getInitStatus action failed, trying /api/auth/init fallback:', err);
      }

      try {
        const res = await fetch('/api/auth/init');
        if (res.ok) {
          const data = await res.json();
          if (mounted && typeof data.initialized === 'boolean') {
            setMode(data.initialized ? 'login' : 'init');
          }
        }
      } catch (err) {
        console.warn('Failed to query /api/auth/init:', err);
      }
    }

    checkInit();
    return () => {
      mounted = false;
    };
  }, []);

  function formatErrorMessage(msg?: string): string {
    if (!msg) return '操作失败，请重试';
    if (msg.includes('Master password is incorrect') || msg.includes('AUTH_INVALID_PASSWORD')) {
      return '主密码错误，请重新输入';
    }
    if (msg.includes('Application is not initialized') || msg.includes('AUTH_NOT_INITIALIZED')) {
      return '密码保险库尚未创建，请先创建主密码';
    }
    if (msg.includes('at least 8 characters')) {
      return '主密码长度至少为 8 位';
    }
    if (msg.includes('Passwords do not match')) {
      return '两次输入的密码不一致';
    }
    return msg;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const formData = new FormData(e.currentTarget);

    try {
      if (mode === 'init') {
        const res = await initAppAction(formData);
        if (!res.ok) {
          setError(formatErrorMessage(res.error));
        } else {
          toast.success('保险库已创建');
          router.push('/dashboard');
        }
      } else {
        const res = await loginAction(formData);
        if (!res.ok) {
          if (res.error?.includes('not initialized') || res.error?.includes('AUTH_NOT_INITIALIZED')) {
            setMode('init');
            setError('密码保险库尚未创建，请先创建主密码');
          } else {
            setError(formatErrorMessage(res.error));
          }
        } else {
          router.push('/dashboard');
        }
      }
    } catch (err) {
      setError(err instanceof Error ? formatErrorMessage(err.message) : '提交失败，请重试');
    } finally {
      setLoading(false);
    }
  }

  const isInit = mode === 'init';

  return (
    <div className="relative flex min-h-screen flex-1 items-center justify-center bg-background px-4 py-12">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex size-16 items-center justify-center rounded-2xl border bg-card shadow-sm">
            <LockKeyhole className="size-8 text-foreground" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {isInit ? '创建密码保险库' : '解锁密码保险库'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isInit ? '设置你的主密码以开始使用' : '输入主密码以继续'}
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-xl border bg-card p-8 shadow-sm"
        >
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="masterPassword">主密码</Label>
            <div className="relative">
              <Input
                id="masterPassword"
                name="masterPassword"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete={isInit ? 'new-password' : 'current-password'}
                placeholder="请输入主密码"
                className="h-11 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                tabIndex={-1}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>

          {isInit && (
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">确认主密码</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="new-password"
                placeholder="再次输入主密码"
                className="h-11"
              />
              <p className="text-xs text-muted-foreground">
                ⚠️ 如果忘记主密码，数据将无法恢复。
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="h-11 w-full"
          >
            {loading && <Loader2 className="animate-spin" />}
            {loading ? '请稍候...' : isInit ? '创建保险库' : '解锁'}
          </Button>

          {!isInit && (
            <p className="flex items-center justify-center gap-1.5 pt-1 text-xs text-muted-foreground">
              <ShieldCheck className="size-3.5" />
              会话已通过加密 Cookie 保护
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
