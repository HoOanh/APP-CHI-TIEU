'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight, ReceiptText, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CategoryIcon } from '@/components/CategoryIcon';
import { MonthPicker } from '@/components/MonthPicker';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn, formatCurrency, formatShortDate, getCurrentMonth, getPercentage } from '@/lib/utils';

const StatsCharts = dynamic(() => import('@/components/StatsCharts').then((module) => module.StatsCharts), { loading: () => <div className="h-[190px] animate-pulse rounded-2xl bg-slate-200/70" /> });

interface CategoryPoint { category_name: string; category_color: string; total: number; count: number; }
interface DatePoint { date: string; total: number; }
interface StatsResponse { total: number; count: number; daily_average: number; by_category: CategoryPoint[]; by_date: DatePoint[]; previous_total: number; comparison_label: string; }
type Period = 'daily' | 'monthly' | 'quarterly' | 'yearly';

export default function StatsPage() {
  const [period, setPeriod] = useState<Period>('daily');
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [data, setData] = useState<StatsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/expenses/stats?period=${period}&month=${month}&year=${year}`);
      if (!response.ok) throw new Error('Failed to load stats');
      setData(await response.json());
    } catch (error) {
      console.error(error);
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [month, period, year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchStats();
  }, [fetchStats]);

  const topCategory = data?.by_category[0];
  const peak = useMemo(() => data?.by_date.reduce<DatePoint | null>((current, point) => !current || point.total > current.total ? point : current, null) ?? null, [data?.by_date]);
  const change = data?.previous_total ? ((data.total - data.previous_total) / data.previous_total) * 100 : null;

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl bg-[#f7f9fb] pb-nav">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#f7f9fb]/95 px-4 pb-3 pt-4 backdrop-blur-xl md:px-8 md:pb-5 md:pt-6">
        <div className="flex items-center justify-between"><div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#00a970]">Phân tích</p><h1 className="mt-0.5 text-lg font-semibold tracking-[-0.03em] text-slate-800">Thống kê chi tiêu</h1></div><PeriodPicker period={period} month={month} year={year} onMonth={setMonth} onYear={setYear} /></div>
        <Tabs value={period} onValueChange={(value) => setPeriod(value as Period)} className="mt-4"><TabsList className="grid w-full grid-cols-4 rounded-xl bg-slate-200/60 p-1"><TabsTrigger value="daily" className="rounded-lg text-xs">Tháng</TabsTrigger><TabsTrigger value="monthly" className="rounded-lg text-xs">Năm</TabsTrigger><TabsTrigger value="quarterly" className="rounded-lg text-xs">Quý</TabsTrigger><TabsTrigger value="yearly" className="rounded-lg text-xs">5 năm</TabsTrigger></TabsList></Tabs>
      </header>

      <main className="space-y-5 px-4 py-5 md:px-8 md:py-7 lg:grid lg:grid-cols-2 lg:items-start lg:gap-6 lg:space-y-0">
        {isLoading ? <div className="lg:col-span-2"><StatsSkeleton /></div> : data ? <>
          <section className="overflow-hidden rounded-[22px] bg-[#344554] p-5 text-white shadow-[0_18px_36px_-25px_rgba(39,55,73,0.8)]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Tổng chi tiêu</p>
            <p className="mt-2 text-[31px] font-semibold leading-none tracking-[-0.055em] tabular-nums">{formatCurrency(data.total)}</p>
            <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3 text-xs"><span className="flex items-center gap-1.5 text-white/65">{change !== null && change <= 0 ? <TrendingDown className="size-3.5 text-emerald-300" /> : <TrendingUp className="size-3.5 text-rose-300" />}{change === null ? 'Chưa có kỳ đối chiếu' : `${Math.abs(change).toFixed(0)}% ${change <= 0 ? 'thấp hơn' : 'cao hơn'} ${data.comparison_label}`}</span><span className="font-medium text-white/80">{data.count} giao dịch</span></div>
          </section>

          <section className="grid grid-cols-2 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white py-3"><Metric icon={ReceiptText} label="Trung bình" value={formatCurrency(data.daily_average)} suffix={period === 'daily' ? '/ ngày' : '/ kỳ'} /><Metric icon={WalletCards} label="Danh mục nhiều nhất" value={topCategory?.category_name || 'Chưa có'} suffix={topCategory ? formatCurrency(topCategory.total) : ''} className="pl-4" /></section>

          {data.total > 0 ? <>
            <div className="lg:col-span-2"><StatsCharts byDate={data.by_date} period={period} total={data.total} /></div>
            <section className="grid grid-cols-2 gap-3"><Insight title="Ngày chi cao nhất" value={peak ? formatCurrency(peak.total) : '—'} detail={peak ? (period === 'daily' ? formatShortDate(peak.date) : peak.date) : ''} tone="rose" /><Insight title="Tỷ trọng lớn nhất" value={topCategory ? `${Math.round(getPercentage(topCategory.total, data.total))}%` : '—'} detail={topCategory?.category_name || ''} tone="mint" /></section>
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white lg:col-span-2"><div className="border-b border-slate-100 px-4 py-3"><h2 className="text-[15px] font-semibold text-slate-800">Cơ cấu chi tiêu</h2><p className="mt-0.5 text-xs text-slate-400">Danh mục theo tỷ trọng trong kỳ đã chọn</p></div><div className="divide-y divide-slate-100 lg:grid lg:grid-cols-2 lg:divide-y-0 lg:divide-x">{data.by_category.map((item) => <CategoryRow key={item.category_name} item={item} total={data.total} />)}</div></section>
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
  return <div className={cn('min-w-0 px-3.5', className)}><p className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon className="size-3.5 text-[#00a970]" />{label}</p><p className="mt-1 truncate text-[15px] font-semibold text-slate-700">{value}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{suffix}</p></div>;
}

function Insight({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: 'rose' | 'mint' }) {
  return <div className={cn('rounded-2xl border p-3.5', tone === 'rose' ? 'border-rose-100 bg-rose-50/50' : 'border-emerald-100 bg-emerald-50/50')}><p className="text-[11px] text-slate-400">{title}</p><p className={cn('mt-1 text-base font-semibold tabular-nums', tone === 'rose' ? 'text-[#f15b64]' : 'text-[#00a970]')}>{value}</p><p className="mt-0.5 truncate text-[11px] text-slate-500">{detail}</p></div>;
}

function CategoryRow({ item, total }: { item: CategoryPoint; total: number }) {
  const percentage = getPercentage(item.total, total);
  return <div className="px-4 py-3.5"><div className="flex items-center gap-3"><CategoryIcon name={item.category_name} color={item.category_color} className="size-9 rounded-xl" iconClassName="size-4" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700">{item.category_name}</p><p className="mt-0.5 text-[11px] text-slate-400">{item.count} giao dịch · {Math.round(percentage)}%</p></div><p className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">{formatCurrency(item.total)}</p></div><Progress value={percentage} className="mt-2.5 h-1.5" indicatorColor="bg-[#00bc7c]" /></div>;
}

function StatsSkeleton() { return <div className="space-y-4"><Skeleton className="h-36 w-full rounded-[22px]" /><Skeleton className="h-20 w-full rounded-2xl" /><Skeleton className="h-[190px] w-full rounded-2xl" /></div>; }
function EmptyStats() { return <div className="flex flex-col items-center py-20 text-center"><span className="flex size-14 items-center justify-center rounded-3xl bg-emerald-50 text-[#00a970]"><ReceiptText className="size-6" /></span><h2 className="mt-4 text-base font-semibold text-slate-700">Chưa đủ dữ liệu để phân tích</h2><p className="mt-1 max-w-60 text-sm leading-5 text-slate-400">Ghi thêm giao dịch để xem xu hướng, danh mục lớn nhất và biến động chi tiêu.</p></div>; }
