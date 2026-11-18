'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { QuickEntryAccess } from '@/components/QuickEntryAccess';
import { useToast } from '@/hooks/useToast';
import {
  AlertTriangle,
  ChevronRight,
  ReceiptText,
  Settings,
  Siren,
  WalletCards,
} from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { WeeklyInsightCard, type Insight } from '@/components/WeeklyInsightCard';
import {
  cn,
  formatCurrency,
  formatShortDate,
  getCurrentMonth,
  getMonthLabel,
  getPercentage,
} from '@/lib/utils';

interface Transaction {
  id: string;
  amount: number;
  description: string;
  date: string;
  type: 'income' | 'expense';
  category_name: string;
  category_color: string;
}

interface Budget {
  id: string;
  category_name: string;
  category_color: string;
  budget_amount: number;
  spent_amount: number;
  today_spent?: number;
  daily_limit?: number;
  alert_type?: 'monthly' | 'daily';
  warning_percent: number;
  alert_severity: 'warning' | 'danger';
  alert_message: string;
}

interface Dashboard {
  walletBalance: number;
  income: number;
  expense: number;
  dailyAverage: number;
  transactionCount: number;
}

interface DashboardResponse {
  summary: Dashboard;
  recent: Transaction[];
  attentionBudgets: Budget[];
  categorySpending: CategorySpending[];
  latestInsight?: Insight | null;
}

interface CategorySpending {
  id: string;
  name: string;
  color: string;
  spent_amount: number;
}

const fetchDashboard = async (url: string): Promise<DashboardResponse> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Không thể tải dữ liệu dashboard');
  return response.json() as Promise<DashboardResponse>;
};

export default function DashboardPage() {
  const month = getCurrentMonth();
  const hasNotifiedAlerts = useRef(false);
  const { showToast } = useToast();
  const { data, error, mutate } = useSWR(`/api/dashboard?month=${month}`, fetchDashboard, {
    dedupingInterval: 10_000,
    revalidateOnFocus: true,
  });
  const summary = data?.summary ?? null;
  const recent = data?.recent ?? null;
  const attentionBudgets = data?.attentionBudgets ?? null;
  const categorySpending = data?.categorySpending ?? null;
  const categoryTotal = categorySpending?.reduce((total, item) => total + Number(item.spent_amount), 0) ?? 0;

  useEffect(() => {
    if (!attentionBudgets || hasNotifiedAlerts.current) return;
    hasNotifiedAlerts.current = true;
    attentionBudgets.forEach((alert) => {
      const spent = Number(alert.spent_amount) || 0;
      const limit = Number(alert.budget_amount) || 0;
      const todaySpent = Number(alert.today_spent) || 0;
      const dailyLimit = Number(alert.daily_limit) || 0;

      if (limit > 0 && spent >= limit) {
        showToast(
          `🚨 THỦNG NGÂN SÁCH THÁNG — ${alert.category_name}`,
          'error',
          `Đã chi ${formatCurrency(spent)}/${formatCurrency(limit)}${spent > limit ? `, lố ${formatCurrency(spent - limit)}` : ''}. Bớt vung tay ngay đại ca!`,
        );
      } else if (dailyLimit > 0 && todaySpent > dailyLimit) {
        showToast(
          `🚨 CHI LỐ HẠN MỨC NGÀY — ${alert.category_name}`,
          'error',
          `Hôm nay đã chi ${formatCurrency(todaySpent)}/${formatCurrency(dailyLimit)} (vượt lố ${formatCurrency(todaySpent - dailyLimit)}). Dừng chi hũ này hôm nay nhé!`,
        );
      }
    });
  }, [attentionBudgets, showToast]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1400px] overflow-x-hidden px-4 pb-nav pt-5 md:px-8 md:py-8 xl:px-10">
      <header className="mb-6 flex items-center justify-between md:mb-8">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#00a970]">Tài chính</p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-slate-800 md:text-2xl">Tổng quan</h1>
          <p className="mt-0.5 text-sm text-slate-400">{getMonthLabel(month)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
        <QuickEntryAccess />
        <Link
          href="/settings"
          aria-label="Cài đặt"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 md:hidden"
        >
          <Settings className="size-5" />
          <span className="sr-only">Cài đặt</span>
        </Link>
        </div>
      </header>

      {error && <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
        <p>Không tải được Tổng quan.</p>
        <button type="button" className="shrink-0 font-semibold underline" onClick={() => void mutate()}>Thử lại</button>
      </div>}

      {(!error || data) && <>

      <section className="overflow-hidden rounded-[24px] bg-[#00bc7c] text-white shadow-[0_18px_38px_-24px_rgba(0,188,124,0.75)]">
        <div className="relative p-5 sm:p-6">
          <div className="absolute -right-12 -top-20 size-52 rounded-full border-[28px] border-white/10" />
          <div className="relative flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/65">Số dư hiện tại</p>
              {summary ? (
                <p className="mt-2 truncate text-[clamp(1.9rem,9vw,3.2rem)] font-semibold leading-none tracking-[-0.055em] tabular-nums">{formatCurrency(summary.walletBalance)}</p>
              ) : <Skeleton className="mt-3 h-9 w-48 bg-white/20" />}
              <p className="mt-2 text-xs text-white/70">Tổng số dư ví từ tất cả giao dịch</p>
            </div>
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/20">
              <WalletCards className="size-5" />
            </span>
          </div>
          <div className="relative mt-5 grid grid-cols-2 divide-x divide-white/20 border-t border-white/20 pt-4">
            <MoneyMetric label="Thu tháng này" value={summary?.income} prefix="+" tone="income" />
            <MoneyMetric label="Chi tháng này" value={summary?.expense} prefix="−" tone="expense" className="pl-4" />
          </div>
        </div>
      </section>

      <div className="my-4 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-slate-500">
        <span className="flex shrink-0 items-center gap-1.5"><ReceiptText className="size-4 text-[#00a970]" /> {summary ? `${summary.transactionCount} giao dịch tháng này` : 'Đang tải giao dịch…'}</span>
        <span className="h-3 w-px shrink-0 bg-slate-200" />
        <span className="min-w-0 truncate">TB chi: <strong className="font-semibold text-slate-700">{summary ? formatCurrency(summary.dailyAverage) : '—'}</strong>/ngày</span>
      </div>

      {attentionBudgets && attentionBudgets.some((item) => item.alert_severity === 'danger') ? (
        <section
          role="alert"
          className="overspend-card-pulse mb-6 rounded-2xl border-2 border-rose-500 bg-rose-600 p-4 text-white shadow-[0_18px_40px_-14px_rgba(225,29,72,0.75)]"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white">
                <Siren className="size-5 animate-bounce" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold uppercase tracking-wide text-white">
                  Cảnh báo chi tiêu lố hạn mức!
                </p>
                <div className="mt-1.5 space-y-1">
                  {attentionBudgets
                    .filter((item) => item.alert_severity === 'danger')
                    .map((item) => (
                      <p key={item.id} className="break-words text-xs font-medium leading-5 text-rose-50">
                        • <strong className="font-bold text-white">{item.category_name}:</strong> {item.alert_message.replace(/^🚨\s*/, '')}
                      </p>
                    ))}
                </div>
              </div>
            </div>
            <Link
              href="/planning"
              className="shrink-0 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-rose-700 shadow-xs transition hover:bg-rose-50"
            >
              Xem hũ
            </Link>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <section className="mb-7 min-w-0 xl:col-span-7">
        <SectionTitle title="Giao dịch gần đây" href="/expenses" />
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {!recent ? (
            <div className="space-y-4 p-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-12 w-full" />)}</div>
          ) : recent.length ? (
            <div className="divide-y divide-slate-100">
              {recent.map((transaction) => (
                <div key={transaction.id} className="flex min-w-0 items-center gap-3 px-3.5 py-3.5 sm:px-4">
                  <CategoryIcon name={transaction.category_name} color={transaction.category_color} className="size-9 rounded-xl" iconClassName="size-4" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800">{transaction.description || transaction.category_name}</p>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{transaction.category_name} · {formatShortDate(transaction.date)}</p>
                  </div>
                  <p className={cn('max-w-[36%] shrink-0 truncate text-right text-[13px] font-semibold tabular-nums', transaction.type === 'income' ? 'text-[#00a970]' : 'text-[#f15b64]')}>
                    {transaction.type === 'income' ? '+' : '−'}{formatCurrency(transaction.amount)}
                  </p>
                </div>
              ))}
            </div>
          ) : <p className="px-4 py-8 text-center text-sm text-slate-400">Chưa có giao dịch nào.</p>}
        </div>
      </section>

      <aside className="min-w-0 space-y-6 xl:col-span-5">
      <WeeklyInsightCard
        initialInsight={data?.latestInsight ?? null}
        isDashboardLoading={!data && !error}
      />
      <section className="min-w-0">
        <SectionTitle title="Chi theo danh mục" href="/stats" mobileHref="/settings#thong-ke" />
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {categorySpending === null ? <div className="space-y-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-9 w-full" />)}</div> : categorySpending.length ? (
            <div className="space-y-4">
              {categorySpending.map((category) => {
                const percentage = categoryTotal ? Math.round((Number(category.spent_amount) / categoryTotal) * 100) : 0;
                return (
                  <div key={category.id} className="min-w-0">
                    <div className="mb-2 flex min-w-0 items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-medium text-slate-700">{category.name}</span>
                      <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-600">{formatCurrency(Number(category.spent_amount))} · {percentage}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full" style={{ width: `${percentage}%`, backgroundColor: category.color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="py-2 text-center text-sm text-slate-500">Chưa có khoản chi trong tháng này.</p>}
        </div>
      </section>

      <section className="min-w-0">
        <SectionTitle title="Theo dõi ngân sách" href="/budgets" mobileHref="/planning" />
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {attentionBudgets === null ? <div className="space-y-3">{[1, 2].map((item) => <Skeleton key={item} className="h-8 w-full" />)}</div> : attentionBudgets.length ? (
            <div className="space-y-3">
              {attentionBudgets.map((budget) => {
                const isDailyAlert = budget.alert_type === 'daily' && Number(budget.daily_limit) > 0;
                const currentVal = isDailyAlert ? Number(budget.today_spent || 0) : budget.spent_amount;
                const limitVal = isDailyAlert ? Number(budget.daily_limit || 0) : budget.budget_amount;
                const progress = getPercentage(currentVal, limitVal);
                const isDanger = budget.alert_severity === 'danger';

                return (
                  <div
                    key={budget.id}
                    className={cn(
                      'min-w-0 rounded-xl p-3 transition-all',
                      isDanger
                        ? 'overspend-card-pulse border-2 border-rose-500 bg-rose-50/80'
                        : 'border border-amber-200 bg-amber-50/50',
                    )}
                  >
                    <div className="mb-2 flex min-w-0 items-center justify-between gap-2 text-sm">
                      <span className={cn('flex min-w-0 items-center gap-1.5 truncate font-bold', isDanger ? 'text-rose-700' : 'text-amber-800')}>
                        {isDanger ? <Siren className="size-4 shrink-0 text-rose-600" /> : <AlertTriangle className="size-4 shrink-0 text-amber-600" />}
                        <span className="truncate">{budget.category_name}</span>
                      </span>
                      <span className={cn('shrink-0 text-xs font-bold tabular-nums', isDanger ? 'text-rose-700' : 'text-amber-800')}>
                        {isDailyAlert ? 'Hôm nay: ' : ''}{formatCurrency(currentVal)} / {formatCurrency(limitVal)}
                      </span>
                    </div>
                    <Progress
                      value={Math.min(progress, 100)}
                      className="h-2 bg-white/80"
                      indicatorColor={isDanger ? 'bg-rose-600' : 'bg-[#f4b740]'}
                    />
                    <p className={cn('mt-2 break-words text-xs font-medium leading-4', isDanger ? 'text-rose-700' : 'text-amber-800')}>
                      {budget.alert_message}
                    </p>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-2 text-center text-sm text-slate-500">Ngân sách đang trong tầm kiểm soát.</p>
          )}
        </div>
      </section>
      </aside>
      </div>
      </>}
    </div>
  );
}

function MoneyMetric({ label, value, prefix, tone, className }: { label: string; value?: number; prefix: string; tone: 'income' | 'expense'; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className={cn('text-[11px]', tone === 'income' ? 'text-emerald-50/75' : 'text-rose-100/80')}>{label}</p>
      {value === undefined ? <Skeleton className="mt-2 h-5 w-24 bg-white/20" /> : <p className={cn('mt-1 truncate text-sm font-semibold tabular-nums sm:text-base', tone === 'income' ? 'text-emerald-50' : 'text-rose-100')}>{prefix}{formatCurrency(value)}</p>}
    </div>
  );
}

function SectionTitle({ title, href, mobileHref }: { title: string; href: string; mobileHref?: string }) {
  return (
    <div className="mb-3 flex min-w-0 items-center justify-between gap-2">
      <h2 className="min-w-0 truncate text-[15px] font-semibold text-slate-800">{title}</h2>
      <Link href={href} className={cn('shrink-0 items-center text-xs font-medium text-slate-500', mobileHref ? 'hidden md:flex' : 'flex')}>Xem tất cả <ChevronRight className="size-3.5" /></Link>
      {mobileHref && <Link href={mobileHref} className="flex shrink-0 items-center text-xs font-medium text-slate-500 md:hidden">Xem tất cả <ChevronRight className="size-3.5" /></Link>}
    </div>
  );
}
