'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Database,
  HardDrive,
  Layers,
  Table as TableIcon,
  RefreshCw,
  Copy,
  Check,
  ShieldCheck,
  Folder,
  Tag as TagIcon,
  KeyRound,
  FileCode,
  Info,
  ExternalLink,
} from 'lucide-react';
import { toast } from 'sonner';
import { getDatabaseDetailsAction, type DatabaseDetails } from '@/app/actions/auth';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';

export default function DatabasePage() {
  const [details, setDetails] = useState<DatabaseDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedPath, setCopiedPath] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);

  async function loadData(silent = false) {
    setLoading(true);
    try {
      const data = await getDatabaseDetailsAction();
      setDetails(data);
      if (!selectedTableId && data.tables.length > 0) {
        setSelectedTableId(data.tables[0].id);
      }
      if (!silent) {
        toast.success('数据库状态与表结构已刷新');
      }
    } catch {
      if (!silent) {
        toast.error('加载数据库监控信息失败');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    getDatabaseDetailsAction()
      .then((data) => {
        if (!cancelled) {
          setDetails(data);
          if (data.tables.length > 0) {
            setSelectedTableId(data.tables[0].id);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function copyText(text: string) {
    navigator.clipboard.writeText(text);
    setCopiedPath(true);
    toast.success('已复制到剪贴板');
    setTimeout(() => setCopiedPath(false), 2000);
  }

  const selectedTable = details?.tables.find((t) => t.id === selectedTableId) || details?.tables[0];

  function getPartitionIcon(id: string) {
    switch (id) {
      case 'kv_store':
        return <TableIcon className="size-4 text-primary" />;
      case 'passwords':
        return <KeyRound className="size-4 text-amber-500" />;
      case 'passwords_index':
        return <Layers className="size-4 text-blue-500" />;
      case 'categories':
        return <Folder className="size-4 text-emerald-500" />;
      case 'tags':
        return <TagIcon className="size-4 text-purple-500" />;
      case 'config':
        return <ShieldCheck className="size-4 text-rose-500" />;
      default:
        return <FileCode className="size-4 text-muted-foreground" />;
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 顶部标题栏 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Database className="size-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">数据库监控与架构</h1>
              <p className="text-xs text-muted-foreground">
                实时检测底层数据库驱动、物理占用容量与数据表存储分区分布
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => loadData(false)}
            className="gap-2"
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>刷新状态</span>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings" className="gap-1.5">
              <span>备份与设置</span>
              <ExternalLink className="size-3 text-muted-foreground" />
            </Link>
          </Button>
        </div>
      </div>

      {/* 4 大核心指标卡片 */}
      {loading && !details ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : details ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* 卡片 1: 数据库引擎 */}
          <div className="space-y-2.5 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">数据库引擎</span>
              <Database className="size-4 text-primary" />
            </div>
            <div className="text-lg font-bold tracking-tight text-foreground truncate">
              {details.driverName}
            </div>
            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-muted-foreground">{details.environmentName}</span>
              <Badge
                variant="outline"
                className={`text-[10px] ${
                  details.isPersistent
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                }`}
              >
                {details.isPersistent ? '● 持久存储' : '○ 内存临时'}
              </Badge>
            </div>
          </div>

          {/* 卡片 2: 容量占用 */}
          <div className="space-y-2.5 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">当前物理占用</span>
              <HardDrive className="size-4 text-blue-500" />
            </div>
            <div className="text-lg font-bold tracking-tight text-foreground">
              {details.capacity.fileSizeFormatted}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              有效加密负载约 {details.capacity.estimatedPayloadFormatted}
            </div>
          </div>

          {/* 卡片 3: 总条目与页面 */}
          <div className="space-y-2.5 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">条目与页面总量</span>
              <Layers className="size-4 text-emerald-500" />
            </div>
            <div className="text-lg font-bold tracking-tight text-foreground">
              {details.capacity.totalKeys} 条
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {details.capacity.pageCount
                ? `Pages: ${details.capacity.pageCount} (Size: ${details.capacity.pageSize}B)`
                : '已索引键值总数'}
            </div>
          </div>

          {/* 卡片 4: 数据表与分区 */}
          <div className="space-y-2.5 rounded-xl border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-xs font-medium">存储分区与结构</span>
              <TableIcon className="size-4 text-purple-500" />
            </div>
            <div className="text-lg font-bold tracking-tight text-foreground">
              {details.tables.length} 个表与分区
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {details.tables.filter((t) => t.type === 'physical').length} 物理主表 ·{' '}
              {details.tables.filter((t) => t.type === 'logical').length} 逻辑分区
            </div>
          </div>
        </div>
      ) : null}

      {/* 存储引擎架构与运行时参数 */}
      {details && (
        <div className="rounded-xl border bg-card p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <HardDrive className="size-4 text-primary" />
              存储驱动架构与运行参数
            </h2>
            <Badge variant="outline" className="text-xs">
              运行状态: {details.status === 'healthy' ? '正常运行' : '回退运行'}
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {details.dbPath && (
              <div className="col-span-full rounded-lg bg-muted/40 p-3 space-y-1.5">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span className="font-semibold text-foreground">SQLite 数据库文件绝对路径:</span>
                  <button
                    type="button"
                    onClick={() => copyText(details.dbPath!)}
                    className="flex items-center gap-1 text-[11px] text-primary hover:underline cursor-pointer"
                  >
                    {copiedPath ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}
                    {copiedPath ? '已复制' : '复制路径'}
                  </button>
                </div>
                <div className="font-mono text-xs break-all text-foreground/90">{details.dbPath}</div>
              </div>
            )}

            {details.bindingName && (
              <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between">
                <span className="text-muted-foreground">Cloudflare KV 命名空间绑定:</span>
                <span className="font-mono font-medium">{details.bindingName}</span>
              </div>
            )}

            {details.capacity.journalMode && (
              <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between">
                <span className="text-muted-foreground">SQLite 日志模式 (Journal Mode):</span>
                <span className="font-mono font-medium">{details.capacity.journalMode}</span>
              </div>
            )}

            {details.capacity.encoding && (
              <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between">
                <span className="text-muted-foreground">数据库字符编码 (Encoding):</span>
                <span className="font-mono font-medium">{details.capacity.encoding}</span>
              </div>
            )}

            {details.capacity.freePages !== undefined && (
              <div className="rounded-lg bg-muted/40 p-3 flex items-center justify-between">
                <span className="text-muted-foreground">空闲页数 (Freelist Pages):</span>
                <span className="font-mono font-medium">{details.capacity.freePages}</span>
              </div>
            )}

            {details.fallbackReason && (
              <div className="col-span-full rounded-lg border border-amber-500/30 bg-amber-50/60 p-3 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300 flex items-start gap-2">
                <Info className="size-4 shrink-0 mt-0.5" />
                <span>{details.fallbackReason}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 数据表与分区浏览器 */}
      {details && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <TableIcon className="size-4 text-primary" />
              数据表与存储分区详情
            </h2>
            <span className="text-xs text-muted-foreground">
              点击下方列表切换查看各表字段与样本数据
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 左侧表列表 */}
            <div className="lg:col-span-5 space-y-2">
              {details.tables.map((table) => {
                const isSelected = selectedTable?.id === table.id;
                return (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setSelectedTableId(table.id)}
                    className={`w-full text-left rounded-xl border p-3.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'bg-card hover:border-ring/50 hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted">
                          {getPartitionIcon(table.id)}
                        </div>
                        <span className="font-medium text-sm truncate">{table.name}</span>
                      </div>
                      <Badge variant={table.type === 'physical' ? 'default' : 'secondary'} className="text-[10px]">
                        {table.type === 'physical' ? '物理表' : '分区'}
                      </Badge>
                    </div>

                    <div className="mt-2.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>记录数: <strong className="text-foreground">{table.recordCount}</strong></span>
                      <span>容量: <strong className="text-foreground">{table.sizeFormatted}</strong></span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* 右侧选中的表详情 */}
            <div className="lg:col-span-7">
              {selectedTable ? (
                <div className="rounded-xl border bg-card p-5 shadow-sm space-y-5">
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {getPartitionIcon(selectedTable.id)}
                        <h3 className="text-base font-bold">{selectedTable.name}</h3>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {selectedTable.type === 'physical' ? 'SQLite 物理表' : '逻辑数据分区'}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                      {selectedTable.description}
                    </p>
                  </div>

                  {/* 统计指标 */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <span className="text-muted-foreground block text-[11px]">总记录数</span>
                      <span className="text-base font-bold text-foreground">{selectedTable.recordCount}</span>
                    </div>
                    <div className="rounded-lg bg-muted/40 p-2.5">
                      <span className="text-muted-foreground block text-[11px]">估算占用体量</span>
                      <span className="text-base font-bold text-foreground">{selectedTable.sizeFormatted}</span>
                    </div>
                    <div className="col-span-2 sm:col-span-1 rounded-lg bg-muted/40 p-2.5">
                      <span className="text-muted-foreground block text-[11px]">存储规则</span>
                      <span className="font-mono text-xs text-foreground truncate block">
                        {selectedTable.type === 'physical' ? 'SQL DDL' : 'Key-Value'}
                      </span>
                    </div>
                  </div>

                  {/* 键名规则表达式 */}
                  <div className="space-y-1.5 text-xs">
                    <span className="font-semibold text-muted-foreground">键名规则表达式 (Key Pattern):</span>
                    <div className="rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs text-foreground break-all">
                      {selectedTable.keyPattern}
                    </div>
                  </div>

                  {/* 物理字段结构 (如果有) */}
                  {selectedTable.columns && selectedTable.columns.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-muted-foreground">物理字段结构 (Schema Columns):</span>
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-muted/50 border-b text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2">列名 (Column)</th>
                              <th className="px-3 py-2">类型 (Type)</th>
                              <th className="px-3 py-2">主键 (PK)</th>
                              <th className="px-3 py-2">非空 (Nullable)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y font-mono">
                            {selectedTable.columns.map((col) => (
                              <tr key={col.name} className="hover:bg-muted/20">
                                <td className="px-3 py-2 font-semibold text-foreground">{col.name}</td>
                                <td className="px-3 py-2 text-primary">{col.type}</td>
                                <td className="px-3 py-2">
                                  {col.primaryKey ? (
                                    <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4">
                                      PK
                                    </Badge>
                                  ) : (
                                    '-'
                                  )}
                                </td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {col.nullable ? 'YES' : 'NOT NULL'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* 样本 Key 列表 */}
                  {selectedTable.sampleKeys && selectedTable.sampleKeys.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-semibold text-muted-foreground">
                        活跃数据键名样本 (Sample Keys):
                      </span>
                      <div className="space-y-1">
                        {selectedTable.sampleKeys.map((k) => (
                          <div
                            key={k}
                            className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-1.5 font-mono text-xs text-foreground/90 group"
                          >
                            <span className="truncate mr-2">{k}</span>
                            <button
                              type="button"
                              onClick={() => copyText(k)}
                              className="text-[10px] text-muted-foreground hover:text-primary shrink-0 opacity-80 group-hover:opacity-100"
                            >
                              复制
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
