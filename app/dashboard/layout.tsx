'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import {
  BookOpen,
  Database,
  Folder,
  FolderTree,
  KeyRound,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { logoutAction } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { ThemeToggle } from '@/components/theme-toggle';
import { cn } from '@/lib/utils/cn';
import type { Category, Tag } from '@/lib/types';

const navItems = [
  { href: '/dashboard', label: '全部密码', icon: KeyRound },
  { href: '/dashboard/categories', label: '分类与标签', icon: FolderTree },
  { href: '/dashboard/database', label: '数据库监控', icon: Database },
  { href: '/dashboard/settings', label: '设置', icon: Settings2 },
  { href: '/docs', label: 'API 文档', icon: BookOpen },
];

function VaultLogo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-3 px-2">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <ShieldCheck className="size-5" />
      </div>
      <div>
        <div className="font-semibold tracking-tight">密码保险库</div>
        <div className="text-xs text-muted-foreground">私密 · 安全 · 同步</div>
      </div>
    </Link>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {navItems.map(({ href, label, icon: Icon }) => {
        const active =
          href === '/dashboard'
            ? pathname === '/dashboard'
            : href === '/dashboard/categories'
              ? pathname.startsWith('/dashboard/categories') || pathname.startsWith('/dashboard/tags')
              : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarMetaSection({
  categories,
  tags,
  onNavigate,
}: {
  categories: Category[];
  tags: Tag[];
  onNavigate?: () => void;
}) {
  return (
    <>
      {categories.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between px-3 text-xs font-medium text-muted-foreground">
            <span>分类</span>
            <Link
              href="/dashboard/categories?tab=categories"
              onClick={onNavigate}
              className="text-[11px] text-muted-foreground/80 hover:text-foreground transition-colors"
            >
              管理
            </Link>
          </div>
          <div className="space-y-1">
            {categories.slice(0, 8).map((category) => (
              <Link
                key={category.id}
                href={`/dashboard?categoryId=${category.id}`}
                onClick={onNavigate}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                <Folder className="size-4" />
                <span className="truncate">{category.name}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between px-3 text-xs font-medium text-muted-foreground">
            <span>常用标签</span>
            <Link
              href="/dashboard/categories?tab=tags"
              onClick={onNavigate}
              className="text-[11px] text-muted-foreground/80 hover:text-foreground transition-colors"
            >
              管理
            </Link>
          </div>
          <div className="flex flex-wrap gap-1.5 px-2">
            {tags.slice(0, 12).map((tag) => (
              <Link
                key={tag.id}
                href={`/dashboard?tag=${tag.id}`}
                onClick={onNavigate}
                className="rounded-md border px-2 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
                style={tag.color ? { borderColor: tag.color, color: tag.color } : undefined}
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function SidebarFooter() {
  return (
    <div className="mt-auto border-t pt-4">
      <div className="mb-3 rounded-lg bg-muted p-3">
        <div className="flex items-center gap-2 text-xs font-medium">
          <span className="size-2 rounded-full bg-emerald-500" />
          端到端加密已启用
        </div>
        <p className="mt-1 pl-4 text-[11px] leading-relaxed text-muted-foreground">
          只有你可以解密保险库中的内容
        </p>
      </div>
      <form action={logoutAction}>
        <button
          type="submit"
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
        >
          <LogOut className="size-4" />
          退出登录
        </button>
      </form>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<{ categories: Category[]; tags: Tag[] }>({
    categories: [],
    tags: [],
  });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { listCategoriesAction, listTagsAction } = await import('@/app/actions/auth');
      const [categories, tags] = await Promise.all([
        listCategoriesAction().catch(() => []),
        listTagsAction().catch(() => []),
      ]);
      if (!cancelled) setMeta({ categories, tags });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen flex-1 flex-col bg-background text-foreground lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* 桌面侧边栏 */}
      <aside className="hidden flex-col border-r bg-card px-4 py-5 lg:flex lg:min-h-screen">
        <VaultLogo />
        <div className="mb-2 mt-8 px-3 text-xs font-medium text-muted-foreground">工作区</div>
        <SidebarNav />
        <SidebarMetaSection {...meta} />
        <SidebarFooter />
      </aside>

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-3 border-b bg-background/80 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-2">
            {/* 移动端抽屉导航 */}
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="打开菜单">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 gap-0 overflow-y-auto px-4 py-5">
                <SheetTitle className="sr-only">导航菜单</SheetTitle>
                <VaultLogo />
                <div className="mt-8" />
                <SidebarNav onNavigate={() => setOpen(false)} />
                <SidebarMetaSection {...meta} onNavigate={() => setOpen(false)} />
                <div className="mt-6">
                  <SidebarFooter />
                </div>
              </SheetContent>
            </Sheet>
            <div className="hidden text-sm text-muted-foreground md:block">
              个人工作区 <span className="mx-2 text-muted-foreground/50">/</span>
              <span className="text-foreground">保险库</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="hidden items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground sm:flex">
              <ShieldCheck className="size-3.5" />
              安全连接
            </div>
            <ThemeToggle />
          </div>
        </header>
        <div className="mx-auto w-full max-w-7xl p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
