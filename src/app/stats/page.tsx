'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { onTransactionsChanged } from '@/lib/transaction-events';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, Hash, ReceiptText, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/CategoryIcon';
import { MonthPicker } from '@/components/MonthPicker';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCurrency, formatShortDate, getCurrentMonth, getPercentage } from '@/lib/utils';

const StatsCharts = dynamic(() => import('@/components/StatsCharts').then((module) => module.StatsCharts), { loading: () => <div className="h-[190px] animate-pulse rounded-2xl bg-slate-200/70" /> });

interface CategoryPoint { category_name: string; category_icon?: string; category_color: string; total: number; count: number; }
interface DatePoint { date: string; total: number; }
interface TagPnlPoint {
  tag_id: number;
  tag_name: string;
  tag_color: string;
  income: number;
  expense: number;
  net: number;
  count: number;
}
interface StatsResponse {
  total: number;
  income_total?: number;
  net_savings?: number;
  saving_rate_percent?: number;
  liquid_balance?: number;
  runway_months?: number | null;
  ledgerKind?: 'personal' | 'family' | 'business';
  ledgerName?: string;
  tagsEnabled?: boolean;
  pnl?: {
    revenue: number;
    operating_expense: number;
    gross_profit: number;
    margin_percent: number | null;
    pending_reimburse_total: number;
    pending_reimburse_count: number;
    settled_reimburse_total: number;
    by_tag: TagPnlPoint[];
  };
  count: number;
  daily_average: number;
  by_category: CategoryPoint[];
  by_date: DatePoint[];
  previous_total: number;
  comparison_label: string;
}
interface TagOption { id: number; name: string; color: string; usage_count: number; }
type Period = 'daily' | 'monthly' | 'quarterly' | 'yearly';

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('daily');
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [activeTag, setActiveTag] = useState('all');

  const { data: tagsData } = useSWR<{ tags: TagOption[] }>('/api/tags', async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) return { tags: [] };
    return res.json() as Promise<{ tags: TagOption[] }>;
  });

  const tagParam = activeTag !== 'all' ? `&tag=${encodeURIComponent(activeTag)}` : '';
  const { data, error, isLoading, mutate } = useSWR<StatsResponse>(
    `/api/expenses/stats?period=${period}&month=${month}&year=${year}${tagParam}`,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Không tải được thống kê');
      return response.json();
    },
  );

  useEffect(() => onTransactionsChanged(() => void mutate()), [mutate]);

  const topCategory = data?.by_category[0];
  const peak = useMemo(() => data?.by_date.reduce<DatePoint | null>((current, point) => !current || point.total > current.total ? point : current, null) ?? null, [data?.by_date]);
  const change = data?.previous_total ? ((data.total - data.previous_total) / data.previous_total) * 100 : null;

  const availableTags = tagsData?.tags ?? [];
  const showBusinessPnl = Boolean(
    data?.tagsEnabled
    || data?.ledgerKind === 'business'
    || (data?.pnl?.by_tag.length ?? 0) > 0
    || (data?.pnl?.pending_reimburse_count ?? 0) > 0,
  );

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl bg-[#f7f9fb] pb-nav">
      <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-[#f7f9fb]/95 px-4 pb-3.5 pt-4 backdrop-blur-xl md:px-8 md:pb-5 md:pt-6">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#00a970]">
              <span className="size-1.5 rounded-full bg-[#00bc7c]" />
              Phân tích{data?.ledgerName ? ` · ${data.ledgerName}` : ''}
            </p>
            <h1 className="mt-0.5 text-xl font-bold tracking-[-0.03em] text-slate-900 md:text-2xl">Thống kê chi tiêu</h1>
          </div>
          <PeriodPicker period={period} month={month} year={year} onMonth={setMonth} onYear={setYear} />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)}><TabsList className="grid w-full grid-cols-4 md:max-w-sm rounded-xl bg-slate-200/60 p-1"><TabsTrigger value="daily" className="rounded-lg text-xs">Tháng</TabsTrigger><TabsTrigger value="monthly" className="rounded-lg text-xs">Năm</TabsTrigger><TabsTrigger value="quarterly" className="rounded-lg text-xs">Quý</TabsTrigger><TabsTrigger value="yearly" className="rounded-lg text-xs">5 năm</TabsTrigger></TabsList></Tabs>
          {availableTags.length > 0 || activeTag !== 'all' ? (
            <Select value={activeTag} onValueChange={setActiveTag}>
              <SelectTrigger aria-label="Lọc thống kê theo tag" className="h-9 w-44 rounded-xl bg-white text-xs">
                <Hash className="mr-1.5 size-3.5 text-slate-500" />
                <SelectValue placeholder="Tất cả #tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả #tag</SelectItem>
                {availableTags.map((t) => (
                  <SelectItem key={t.id} value={t.name}>#{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </header>

      <main className="space-y-5 px-4 py-5 md:px-8 md:py-7 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        {error ? <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-white p-4 lg:col-span-2"><p className="text-sm text-rose-800">Không tải được thống kê kỳ này.</p><Button variant="outline" onClick={() => void mutate()}>Thử lại</Button></div> : isLoading ? <div className="lg:col-span-2"><StatsSkeleton /></div> : data ? <>
          <section className="relative overflow-hidden rounded-[22px] bg-gradient-to-br from-[#00c482] via-[#00bc7c] to-[#00a36c] p-5 text-white shadow-[0_18px_36px_-22px_rgba(0,188,124,0.7)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">Tổng chi tiêu</p>
            <p className="mt-2 text-[31px] font-bold leading-none tracking-[-0.04em] tabular-nums">{formatCurrency(data.total)}</p>
            <div className="mt-4 flex items-center justify-between border-t border-white/20 pt-3 text-xs">
              <span className="flex items-center gap-1.5 text-white/90">
                {change !== null && change <= 0 ? <TrendingDown className="size-3.5 text-white" /> : <TrendingUp className="size-3.5 text-rose-100" />}
                {change === null ? 'Chưa có kỳ đối chiếu' : `${Math.abs(change).toFixed(0)}% ${change <= 0 ? 'thấp hơn' : 'cao hơn'} ${data.comparison_label}`}
              </span>
              <span className="font-semibold text-white">{data.count} giao dịch</span>
            </div>
          </section>

          <section className="grid grid-cols-2 divide-x divide-slate-200 rounded-2xl border border-slate-200/90 bg-white py-3.5 shadow-2xs">
            <Metric icon={ReceiptText} label="Trung bình" value={formatCurrency(data.daily_average)} suffix={period === 'daily' ? '/ ngày' : '/ kỳ'} />
            <Metric icon={WalletCards} label="Chi nhiều nhất" value={topCategory?.category_name || 'Chưa có'} suffix={topCategory ? formatCurrency(topCategory.total) : ''} className="pl-4" />
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs lg:col-span-2">
            <div className="grid grid-cols-2 md:grid-cols-4">
              <div className="border-b border-r border-slate-100 p-4 md:border-b-0">
                <p className="text-[11px] font-medium text-slate-500">Tổng thu kỳ này</p>
                <p className="mt-1 text-base font-bold tabular-nums text-slate-900">
                  +{formatCurrency(data.income_total ?? 0)}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  Thu nhập ghi nhận
                </p>
              </div>
              <div className="border-b border-slate-100 p-4 md:border-b-0 md:border-r">
                <p className="text-[11px] font-medium text-slate-500">Chênh lệch thu chi</p>
                <p className={cn('mt-1 text-base font-bold tabular-nums', (data.net_savings ?? 0) >= 0 ? 'text-[#00a970]' : 'text-rose-600')}>
                  {(data.net_savings ?? 0) >= 0 ? '+' : '−'}{formatCurrency(Math.abs(data.net_savings ?? 0))}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {(data.net_savings ?? 0) >= 0 ? 'Thặng dư trong kỳ' : 'Chi vượt thu'}
                </p>
              </div>
              <div className="border-r border-slate-100 p-4">
                <p className="text-[11px] font-medium text-slate-500">Tỷ lệ giữ lại</p>
                <p className={cn('mt-1 text-base font-bold tabular-nums', (data.saving_rate_percent ?? 0) >= 20 ? 'text-[#00a970]' : 'text-slate-900')}>
                  {data.saving_rate_percent ?? 0}%
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {(data.income_total ?? 0) > 0 ? 'Trên tổng thu nhập' : 'Chưa có khoản thu'}
                </p>
              </div>
              <div className="p-4">
                <p className="text-[11px] font-medium text-slate-500">Quỹ dự phòng</p>
                <p className="mt-1 text-base font-bold tabular-nums text-slate-900">
                  {data.runway_months !== null && data.runway_months !== undefined ? `${data.runway_months} tháng` : '—'}
                </p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">
                  {data.liquid_balance !== undefined ? `Số dư: ${formatCurrency(data.liquid_balance)}` : 'Theo mức chi hiện tại'}
                </p>
              </div>
            </div>
          </section>

          {showBusinessPnl && data.pnl ? (
            <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-slate-800">
                    Doanh thu, chi phí &amp; hoàn ứng
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {data.ledgerName || 'Sổ tài chính'} · Tổng hợp thu chi theo thẻ ghi chú
                  </p>
                </div>
                {data.pnl.pending_reimburse_count > 0 ? (
                  <span className="rounded-md bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                    {data.pnl.pending_reimburse_count} khoản chờ hoàn ứng ({formatCurrency(data.pnl.pending_reimburse_total)})
                  </span>
                ) : null}
              </div>
              <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="text-[11px] text-slate-500">Doanh thu</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-[#00a970]">
                    +{formatCurrency(data.pnl.revenue)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="text-[11px] text-slate-500">Chi phí vận hành</p>
                  <p className="mt-1 text-base font-bold tabular-nums text-[#f15b64]">
                    −{formatCurrency(data.pnl.operating_expense)}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="text-[11px] text-slate-500">Lợi nhuận ròng</p>
                  <p className={cn('mt-1 text-base font-bold tabular-nums', data.pnl.gross_profit >= 0 ? 'text-[#00a970]' : 'text-[#f15b64]')}>
                    {data.pnl.gross_profit >= 0 ? '+' : '−'}{formatCurrency(Math.abs(data.pnl.gross_profit))}
                  </p>
                  {data.pnl.margin_percent !== null ? (
                    <p className="mt-0.5 text-[10px] text-slate-500">Biên lợi nhuận: {data.pnl.margin_percent}%</p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                  <p className="text-[11px] text-slate-500">Hoàn ứng trong kỳ</p>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-amber-700">
                    Chờ: {formatCurrency(data.pnl.pending_reimburse_total)}
                  </p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-emerald-700">
                    Đã hoàn: {formatCurrency(data.pnl.settled_reimburse_total)}
                  </p>
                </div>
              </div>
              {data.pnl.by_tag.length > 0 ? (
                <div className="border-t border-slate-100 px-4 py-3">
                  <p className="mb-2 text-xs font-semibold text-slate-600">Hiệu quả theo `#tag`</p>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {data.pnl.by_tag.map((tag) => (
                      <div key={tag.tag_id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs">
                        <div className="min-w-0">
                          <span className="inline-flex items-center gap-1 font-semibold text-slate-800">
                            <span className="size-2 rounded-full" style={{ backgroundColor: tag.tag_color }} />
                            #{tag.tag_name}
                          </span>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            {tag.count} giao dịch · Thu {formatCurrency(tag.income)} · Chi {formatCurrency(tag.expense)}
                          </p>
                        </div>
                        <span className={cn('shrink-0 font-bold tabular-nums', tag.net >= 0 ? 'text-[#00a970]' : 'text-[#f15b64]')}>
                          {tag.net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(tag.net))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>
          ) : null}

          {data.total > 0 ? <>
            <div className="lg:col-span-2"><StatsCharts byDate={data.by_date} period={period} total={data.total} /></div>
            <section className="grid grid-cols-2 divide-x divide-slate-100 rounded-2xl border border-slate-200/90 bg-white shadow-2xs lg:col-span-2">
              <div className="min-w-0 p-4">
                <p className="text-[11px] font-medium text-slate-500">Ngày chi cao nhất</p>
                <p className="mt-1 truncate text-base font-bold tabular-nums text-[#f15b64]">{peak ? formatCurrency(peak.total) : '—'}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">{peak ? (period === 'daily' ? formatShortDate(peak.date) : peak.date) : ''}</p>
              </div>
              <div className="min-w-0 p-4">
                <p className="text-[11px] font-medium text-slate-500">Tỷ trọng lớn nhất</p>
                <p className="mt-1 truncate text-base font-bold tabular-nums text-slate-900">{topCategory ? `${Math.round(getPercentage(topCategory.total, data.total))}%` : '—'}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-400">{topCategory?.category_name || ''}</p>
              </div>
            </section>
            <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs lg:col-span-2"><div className="border-b border-slate-100 px-4 py-3"><h2 className="text-[15px] font-semibold text-slate-800">Cơ cấu chi tiêu</h2><p className="mt-0.5 text-xs text-slate-400">Danh mục theo tỷ trọng trong kỳ đã chọn</p></div><div className="divide-y divide-slate-100 lg:grid lg:grid-cols-2 lg:divide-y-0 lg:divide-x">{data.by_category.map((item) => <CategoryRow key={item.category_name} item={item} total={data.total} />)}</div></section>
          </> : <div className="lg:col-span-2"><EmptyStats /></div>}
        </> : <div className="lg:col-span-2"><EmptyStats /></div>}
      </main>
    </div>
  );
}

function PeriodPicker({ period, month, year, onMonth, onYear }: { period: Period; month: string; year: string; onMonth: (value: string) => void; onYear: (value: string) => void }) {
  if (period === 'daily') return <MonthPicker month={month} onChange={onMonth} />;
  return <div className="flex h-9 items-center rounded-xl border border-slate-200 bg-white p-0.5"><Button variant="ghost" size="icon-sm" onClick={() => onYear(String(Number(year) - 1))}><ChevronLeft className="size-4" /></Button><span className="min-w-16 text-center text-sm font-semibold text-slate-700">{period === 'yearly' ? '5 năm' : year}</span><Button variant="ghost" size="icon-sm" onClick={() => onYear(String(Number(year) + 1))}><ChevronRight className="size-4" /></Button></div>;
}

function Metric({ icon: Icon, label, value, suffix, className }: { icon: typeof ReceiptText; label: string; value: string; suffix: string; className?: string }) {
  return <div className={cn('min-w-0 px-4', className)}><p className="flex items-center gap-1.5 text-[11px] text-slate-500"><Icon className="size-3.5 text-[#00a970]" />{label}</p><p className="mt-1 truncate text-[15px] font-bold text-slate-900">{value}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{suffix}</p></div>;
}

function CategoryRow({ item, total }: { item: CategoryPoint; total: number }) {
  const percentage = getPercentage(item.total, total);
  return <div className="px-4 py-3.5"><div className="flex items-center gap-3"><CategoryIcon name={item.category_name} icon={item.category_icon} color={item.category_color} className="size-9 rounded-xl" iconClassName="size-4" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700">{item.category_name}</p><p className="mt-0.5 text-[11px] text-slate-400">{item.count} giao dịch · {Math.round(percentage)}%</p></div><p className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">{formatCurrency(item.total)}</p></div><Progress value={percentage} className="mt-2.5 h-1.5" indicatorColor="bg-[#00bc7c]" /></div>;
}

function StatsSkeleton() { return <div className="space-y-4"><Skeleton className="h-36 w-full rounded-[22px]" /><Skeleton className="h-20 w-full rounded-2xl" /><Skeleton className="h-[190px] w-full rounded-2xl" /></div>; }
function EmptyStats() { return <div className="flex flex-col items-center py-20 text-center"><span className="flex size-14 items-center justify-center rounded-3xl bg-emerald-50 text-[#00a970]"><ReceiptText className="size-6" /></span><h2 className="mt-4 text-base font-semibold text-slate-700">Chưa đủ dữ liệu để phân tích</h2><p className="mt-1 max-w-60 text-sm leading-5 text-slate-400">Ghi thêm giao dịch để xem xu hướng, danh mục lớn nhất và biến động chi tiêu.</p></div>; }
