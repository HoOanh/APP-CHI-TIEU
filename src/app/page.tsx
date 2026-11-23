'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { QuickEntryAccess } from '@/components/QuickEntryAccess';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Flame,
  Plus,
  ReceiptText,
  Settings,
  ShieldCheck,
  Siren,
  Wallet,
  WalletCards,
} from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { LedgerSwitcher } from '@/components/LedgerSwitcher';
import { PendingRecurringBanner } from '@/components/PendingRecurringBanner';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { WeeklyInsightCard, type Insight } from '@/components/WeeklyInsightCard';
import type { SafeToSpendSummary } from '@/lib/budget-evaluator';
import type { EnabledModules } from '@/lib/modules';
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
  type: 'income' | 'expense' | 'transfer';
  category_name: string | null;
  category_icon?: string | null;
  category_color: string | null;
  account_name?: string | null;
  to_account_name?: string | null;
  created_by_name?: string | null;
  in_budget_jar?: number;
}

interface DashboardAccount {
  id: number;
  name: string;
  type: string;
  balance: number;
  is_default: boolean;
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

interface BudgetHealthJar {
  id: string;
  category_name: string;
  category_color: string;
  budget_basis: 'daily' | 'monthly';
  budget_amount: number;
  spent_amount: number;
  daily_amount: number;
  today_spent: number;
  percentage: number;
  severity: 'safe' | 'warning' | 'danger';
}

interface BudgetHealth {
  totalCount: number;
  dailyCount: number;
  monthlyCount: number;
  safeCount: number;
  warningCount: number;
  dangerCount: number;
  totalBudget: number;
  totalSpent: number;
  jars: BudgetHealthJar[];
}

interface Dashboard {
  walletBalance: number;
  income: number;
  expense: number;
  prevIncome?: number;
  prevExpense?: number;
  dailyAverage: number;
  dailyTargetAverage?: number;
  dailyJarsCount?: number;
  dailyJarSpent?: number;
  dailyJarBudget?: number;
  monthlyJarsCount?: number;
  monthlyJarSpent?: number;
  monthlyJarBudget?: number;
  unplannedExpense?: number;
  unplannedCount?: number;
  elapsedDays?: number;
  transactionCount: number;
}

interface CategorySpending {
  id: string;
  name: string;
  color: string;
  spent_amount: number;
}

interface DashboardResponse {
  summary: Dashboard;
  safeToSpend?: SafeToSpendSummary;
  budgetHealth?: BudgetHealth;
  ledger?: {
    id: number;
    name: string;
    kind: 'personal' | 'family' | 'business';
    role: 'owner' | 'editor' | 'viewer';
    isShared?: boolean;
  };
  accounts?: DashboardAccount[];
  modules?: EnabledModules;
  recent: Transaction[];
  attentionBudgets: Budget[];
  categorySpending: CategorySpending[];
  latestInsight?: Insight | null;
}

const fetchDashboard = async (url: string): Promise<DashboardResponse> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Không thể tải dữ liệu dashboard');
  return response.json() as Promise<DashboardResponse>;
};

function computeMomDelta(current: number, previous?: number): number | null {
  if (!previous || previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export default function DashboardPage() {
  const month = getCurrentMonth();
  const { data, error, mutate } = useSWR(`/api/dashboard?month=${month}`, fetchDashboard, {
    dedupingInterval: 10_000,
    revalidateOnFocus: true,
  });
  const summary = data?.summary ?? null;
  const safeToSpend = data?.safeToSpend ?? null;
  const budgetHealth = data?.budgetHealth ?? null;
  const accounts = data?.accounts ?? [];
  const showAccountsStrip = Boolean(data?.modules?.multi_account || accounts.length > 1);
  const recent = data?.recent ?? null;
  const attentionBudgets = data?.attentionBudgets ?? null;
  const categorySpending = data?.categorySpending ?? null;
  const categoryTotal = categorySpending?.reduce((total, item) => total + Number(item.spent_amount), 0) ?? 0;
  const isViewer = data?.ledger?.role === 'viewer';
  const showCreatorBadge = Boolean(data?.ledger?.isShared || (data?.ledger?.kind && data.ledger.kind !== 'personal'));

  const netCashflow = summary ? summary.income - summary.expense : 0;
  const savingRate = summary && summary.income > 0
    ? Math.round(((summary.income - summary.expense) / summary.income) * 100)
    : null;
  const expenseDelta = summary ? computeMomDelta(summary.expense, summary.prevExpense) : null;
  const incomeDelta = summary ? computeMomDelta(summary.income, summary.prevIncome) : null;

  const dailyTodayUsagePct = safeToSpend && safeToSpend.dailyConfiguredLimit > 0
    ? Math.min(100, Math.round((safeToSpend.todaySpent / safeToSpend.dailyConfiguredLimit) * 100))
    : 0;
  const isDailyPaceOver = Boolean(
    summary && summary.dailyTargetAverage && summary.dailyTargetAverage > 0 && summary.dailyAverage > summary.dailyTargetAverage,
  );

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1400px] overflow-x-hidden px-4 pb-nav pt-5 md:px-8 md:py-8 xl:px-10">
      <header className="mb-6 flex items-center justify-between gap-3 md:mb-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#00a970]">
              <span className="size-1.5 rounded-full bg-[#00bc7c]" />
              {data?.ledger?.name || 'Ví cá nhân'}
            </span>
            <span className="hidden text-xs font-medium text-slate-400 sm:inline">· {getMonthLabel(month)}</span>
          </div>
          <h1 className="mt-0.5 text-xl font-bold tracking-[-0.03em] text-slate-900 md:text-2xl">
            Tổng quan tài chính
          </h1>
          <p className="mt-0.5 text-xs text-slate-400 sm:hidden">{getMonthLabel(month)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="lg:hidden">
            <LedgerSwitcher compact className="w-32 sm:w-44" />
          </div>
          {!isViewer ? (
            <>
              <Link
                href="/chat"
                className="hidden h-9 items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 md:inline-flex"
              >
                <Plus className="size-3.5" />
                Ghi nhanh
              </Link>
              <QuickEntryAccess iconOnMobile />
            </>
          ) : (
            <span className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              Chỉ xem
            </span>
          )}
          <Link
            href="/settings"
            aria-label="Cài đặt"
            className="flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-700 md:hidden"
          >
            <Settings className="size-4" />
            <span className="sr-only">Cài đặt</span>
          </Link>
        </div>
      </header>

      {error ? (
        <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <p>Không tải được Tổng quan.</p>
          <button type="button" className="shrink-0 font-semibold underline" onClick={() => void mutate()}>Thử lại</button>
        </div>
      ) : null}

      {(!error || data) && (
        <>
          {/* Executive Hero Bento Grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left 7: Net Worth & Cashflow Hero Card */}
            <section className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#00c482] via-[#00bc7c] to-[#00a36c] p-5 text-white shadow-[0_20px_42px_-24px_rgba(0,188,124,0.8)] ring-1 ring-white/20 sm:p-6 lg:col-span-7">
              <div className="pointer-events-none absolute -right-14 -top-16 size-56 rounded-full bg-white/15 blur-2xl" />
              <div className="pointer-events-none absolute -bottom-20 left-1/3 size-52 rounded-full bg-white/10 blur-2xl" />

              <div className="relative flex min-w-0 items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/85">
                      Số dư ròng hiện tại
                    </p>
                    {summary ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/18 px-2 py-0.5 text-[10px] font-semibold text-white ring-1 ring-white/20">
                        {summary.transactionCount} giao dịch tháng này
                      </span>
                    ) : null}
                  </div>
                  {summary ? (
                    <p className="mt-2.5 truncate text-[clamp(2rem,8vw,3.15rem)] font-bold leading-none tracking-[-0.045em] tabular-nums">
                      {formatCurrency(summary.walletBalance)}
                    </p>
                  ) : (
                    <Skeleton className="mt-3 h-10 w-52 bg-white/25" />
                  )}
                  <p className="mt-2 text-xs text-white/80">
                    {showAccountsStrip
                      ? `Tổng hợp từ ${accounts.length} ví đang hoạt động`
                      : 'Tổng hợp toàn bộ thu chi trong sổ hiện tại'}
                  </p>
                </div>
                <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/18 ring-1 ring-white/25 backdrop-blur-sm">
                  <WalletCards className="size-5 text-white" />
                </span>
              </div>

              <div className="relative mt-6 grid grid-cols-3 gap-3 border-t border-white/20 pt-4">
                <HeroMetric
                  label="Thu tháng này"
                  value={summary?.income}
                  prefix="+"
                  delta={incomeDelta}
                  tone="income"
                />
                <HeroMetric
                  label="Chi tháng này"
                  value={summary?.expense}
                  prefix="−"
                  delta={expenseDelta}
                  invertDeltaColor
                  tone="expense"
                />
                <div className="min-w-0">
                  <p className="text-[11px] text-white/80">Dòng tiền ròng</p>
                  {summary ? (
                    <>
                      <p className={cn(
                        'mt-1 truncate text-sm font-bold tabular-nums sm:text-base',
                        netCashflow >= 0 ? 'text-white' : 'text-rose-100',
                      )}>
                        {netCashflow >= 0 ? '+' : '−'}{formatCurrency(Math.abs(netCashflow))}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-white/75">
                        {savingRate !== null ? `Giữ lại ${savingRate}%` : 'Chưa có thu'}
                      </p>
                    </>
                  ) : (
                    <Skeleton className="mt-2 h-5 w-20 bg-white/25" />
                  )}
                </div>
              </div>
            </section>

            {/* Right 5: Safe-to-Spend (Daily Jars Only!) & Daily Average */}
            <section className="flex flex-col justify-between rounded-[26px] border border-slate-200/90 bg-white p-5 shadow-2xs sm:p-6 lg:col-span-5">
              {!data ? (
                <div className="space-y-4">
                  <Skeleton className="h-5 w-44" />
                  <Skeleton className="h-9 w-36" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-14 w-full" />
                </div>
              ) : safeToSpend && safeToSpend.activeJarsCount > 0 ? (
                <>
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-[#00a970]">
                        <CalendarClock className="size-3.5" />
                        Hạn mức an toàn hôm nay
                      </span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                        {safeToSpend.activeJarsCount} hũ theo ngày
                      </span>
                    </div>

                    <div className="mt-3 flex items-baseline justify-between gap-2">
                      <div>
                        <p className={cn(
                          'text-2xl font-bold tracking-tight tabular-nums sm:text-[28px]',
                          safeToSpend.todayRemaining === 0 && safeToSpend.todaySpent > 0 ? 'text-rose-600' : 'text-slate-900',
                        )}>
                          {formatCurrency(Math.max(0, Math.min(safeToSpend.todayRemaining, safeToSpend.dailySafeToSpend || safeToSpend.todayRemaining)))}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          Còn lại hôm nay · Định mức {formatCurrency(safeToSpend.dailyConfiguredLimit)}/ngày
                        </p>
                      </div>
                      <span className={cn(
                        'shrink-0 rounded-lg px-2 py-1 text-xs font-semibold tabular-nums',
                        dailyTodayUsagePct >= 100
                          ? 'bg-rose-50 text-rose-700'
                          : dailyTodayUsagePct >= 80
                            ? 'bg-amber-50 text-amber-700'
                            : 'bg-emerald-50 text-[#00a970]',
                      )}>
                        {dailyTodayUsagePct}%
                      </span>
                    </div>

                    <div className="mt-3">
                      <Progress
                        value={dailyTodayUsagePct}
                        className="h-2 bg-slate-100"
                        indicatorColor={
                          dailyTodayUsagePct >= 100
                            ? 'bg-rose-500'
                            : dailyTodayUsagePct >= 80
                              ? 'bg-amber-500'
                              : 'bg-[#00bc7c]'
                        }
                      />
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>Hôm nay đã chi: <strong className="text-slate-600">{formatCurrency(safeToSpend.todaySpent)}</strong></span>
                        <span>Còn {safeToSpend.daysLeft} ngày</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2.5 border-t border-slate-100 pt-3.5">
                    <div className="rounded-xl bg-slate-50/90 px-3 py-2.5">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        TB chi hũ ngày
                      </p>
                      <p className={cn(
                        'mt-1 text-sm font-bold tabular-nums',
                        isDailyPaceOver ? 'text-rose-600' : 'text-slate-900',
                      )}>
                        {formatCurrency(summary?.dailyAverage ?? 0)}<span className="text-[11px] font-medium text-slate-500">/ngày</span>
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-400">
                        {summary?.elapsedDays ? `Qua ${summary.elapsedDays} ngày` : 'Hũ chi theo ngày'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50/90 px-3 py-2.5">
                      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Tiến độ hũ ngày
                      </p>
                      <p className="mt-1 truncate text-sm font-bold tabular-nums text-[#00a970]">
                        {formatCurrency(safeToSpend.totalSpent)}
                      </p>
                      <p className="mt-0.5 truncate text-[10px] text-slate-400">
                        / {formatCurrency(safeToSpend.totalEffectiveBudget)} ({safeToSpend.totalEffectiveBudget > 0 ? Math.round((safeToSpend.totalSpent / safeToSpend.totalEffectiveBudget) * 100) : 0}%)
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex h-full flex-col justify-between gap-4">
                  <div>
                    <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
                      <CalendarClock className="size-3.5 text-[#00a970]" />
                      Hạn mức &amp; TB chi theo ngày
                    </span>
                    <h2 className="mt-2.5 text-base font-semibold text-slate-800">
                      Chưa thiết lập hũ chi theo ngày
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Hạn mức an toàn và TB chi ngày chỉ áp dụng cho các hũ ghi nhận theo ngày (như Ăn uống, Cà phê).
                    </p>
                  </div>
                  <Link
                    href="/budgets"
                    className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 text-xs font-semibold text-[#00a970] transition hover:bg-emerald-100"
                  >
                    Tạo hũ theo ngày <ChevronRight className="size-3.5" />
                  </Link>
                </div>
              )}
            </section>
          </div>

          {/* Compact Monthly Plan vs Unplanned Breakdown */}
          {summary && summary.expense > 0 ? (
            (() => {
              const plannedSpent = (summary.dailyJarSpent ?? 0) + (summary.monthlyJarSpent ?? 0);
              const unplannedSpent = summary.unplannedExpense ?? 0;
              const plannedPct = Math.min(100, Math.round((plannedSpent / summary.expense) * 100));
              const unplannedPct = Math.max(0, 100 - plannedPct);
              return (
                <section className="mt-4 rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:px-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-slate-700">
                      Cơ cấu chi tháng này · <span className="tabular-nums text-slate-900">{formatCurrency(summary.expense)}</span>
                    </p>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-[#00bc7c]" />
                        Trong hũ ({plannedPct}%)
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-amber-400" />
                        Ngoài hũ ({unplannedPct}%)
                      </span>
                    </div>
                  </div>
                  <div className="mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    {plannedPct > 0 ? (
                      <div className="h-full bg-[#00bc7c] transition-all" style={{ width: `${plannedPct}%` }} />
                    ) : null}
                    {unplannedPct > 0 ? (
                      <div className="h-full bg-amber-400 transition-all" style={{ width: `${unplannedPct}%` }} />
                    ) : null}
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Link
                      href="/budgets"
                      className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3.5 py-2.5 text-xs transition hover:bg-slate-100/80"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-slate-600">
                          Chi trong hũ
                          {(summary.dailyJarsCount ?? 0) > 0 ? ` (${summary.dailyJarsCount} hũ ngày` : ''}
                          {(summary.monthlyJarsCount ?? 0) > 0
                            ? `${(summary.dailyJarsCount ?? 0) > 0 ? ', ' : ' ('}${summary.monthlyJarsCount} hũ tháng)`
                            : (summary.dailyJarsCount ?? 0) > 0 ? ')' : ''}
                        </p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(plannedSpent)}</p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-slate-400" />
                    </Link>
                    <Link
                      href="/expenses?unplanned=1"
                      className="flex items-center justify-between rounded-xl bg-slate-50/80 px-3.5 py-2.5 text-xs transition hover:bg-slate-100/80"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 font-medium text-slate-600">
                          <span className="size-1.5 rounded-full bg-amber-400" />
                          Phát sinh ngoài hũ ({summary.unplannedCount ?? 0} khoản)
                        </p>
                        <p className="mt-0.5 text-sm font-bold tabular-nums text-slate-900">{formatCurrency(unplannedSpent)}</p>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-slate-400" />
                    </Link>
                  </div>
                </section>
              );
            })()
          ) : null}

          {/* Accounts Strip */}
          {showAccountsStrip ? (
            <section className="mt-5">
              <div className="mb-2.5 flex items-center justify-between px-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Các ví của bạn</p>
                <Link href="/settings/accounts" className="text-xs font-semibold text-[#00a970] hover:underline">
                  Quản lý ví →
                </Link>
              </div>
              <div className="no-scrollbar flex gap-2.5 overflow-x-auto pb-1">
                {accounts.map((acc) => (
                  <Link
                    key={acc.id}
                    href={`/expenses?account_id=${acc.id}`}
                    className="flex min-w-[165px] shrink-0 items-center gap-3 rounded-2xl border border-slate-200/90 bg-white px-3.5 py-3 shadow-2xs transition hover:border-emerald-300 hover:shadow-xs"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#00a970]">
                      <Wallet className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium text-slate-500">{acc.name}</p>
                      <p className="truncate text-sm font-bold tabular-nums text-slate-900">{formatCurrency(acc.balance)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-5">
            <PendingRecurringBanner onResolved={() => void mutate()} />
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
                      Cảnh báo chi tiêu vượt ngưỡng!
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

          {/* Main Bento Grid */}
          <div className="mt-5 grid grid-cols-1 gap-6 xl:grid-cols-12">
            <div className="min-w-0 space-y-6 xl:col-span-7">
              {/* Recent Transactions */}
              <section className="min-w-0">
                <SectionTitle title="Giao dịch gần đây" href="/expenses" />
                <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-2xs">
                  {!recent ? (
                    <div className="space-y-4 p-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-12 w-full rounded-xl" />)}</div>
                  ) : recent.length ? (
                    <div className="divide-y divide-slate-100">
                      {recent.map((transaction) => {
                        const isTransfer = transaction.type === 'transfer';
                        const isUnplanned = transaction.type === 'expense' && transaction.in_budget_jar === 0;
                        return (
                          <div key={transaction.id} className="flex min-w-0 items-center gap-3 px-4 py-3.5 transition hover:bg-slate-50/60">
                            {isTransfer ? (
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
                                <ArrowRightLeft className="size-4" />
                              </span>
                            ) : (
                              <CategoryIcon
                                name={transaction.category_name || 'Chưa phân loại'}
                                icon={transaction.category_icon}
                                color={transaction.category_color || '#64748b'}
                                className="size-10 rounded-xl"
                                iconClassName="size-4"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p className="truncate text-sm font-semibold text-slate-800">
                                  {transaction.description || transaction.category_name}
                                </p>
                                {isUnplanned ? (
                                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                                    Ngoài hũ
                                  </span>
                                ) : null}
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                {isTransfer
                                  ? `${transaction.account_name || 'Ví nguồn'} → ${transaction.to_account_name || 'Ví đích'}`
                                  : transaction.category_name}
                                {transaction.account_name && !isTransfer ? ` · ${transaction.account_name}` : ''}
                                {' · '}
                                {formatShortDate(transaction.date)}
                                {showCreatorBadge && transaction.created_by_name ? ` · Bởi ${transaction.created_by_name}` : ''}
                              </p>
                            </div>
                            <p className={cn(
                              'max-w-[36%] shrink-0 truncate text-right text-sm font-bold tabular-nums',
                              isTransfer ? 'text-sky-700' : transaction.type === 'income' ? 'text-[#00a970]' : 'text-[#f15b64]',
                            )}>
                              {isTransfer ? '' : transaction.type === 'income' ? '+' : '−'}{formatCurrency(transaction.amount)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center px-4 py-10 text-center">
                      <ReceiptText className="size-8 text-slate-300" />
                      <p className="mt-2 text-sm font-medium text-slate-600">Chưa có giao dịch nào.</p>
                      <Link href="/chat" className="mt-2 text-xs font-semibold text-[#00a970] hover:underline">
                        Ghi giao dịch đầu tiên →
                      </Link>
                    </div>
                  )}
                </div>
              </section>

              {/* Budget Health Overview Matrix */}
              {budgetHealth && budgetHealth.totalCount > 0 ? (
                <section className="min-w-0">
                  <SectionTitle title="Sức khỏe các hũ ngân sách" href="/budgets" mobileHref="/planning" />
                  <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
                      <div>
                        <p className="text-xs text-slate-500">Tổng đã chi / Tổng định mức hũ</p>
                        <p className="mt-0.5 text-base font-bold tabular-nums text-slate-900">
                          {formatCurrency(budgetHealth.totalSpent)}{' '}
                          <span className="text-xs font-normal text-slate-400">/ {formatCurrency(budgetHealth.totalBudget)}</span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700">
                          <CheckCircle2 className="size-3" /> {budgetHealth.safeCount} An toàn
                        </span>
                        {budgetHealth.warningCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-amber-700">
                            <AlertTriangle className="size-3" /> {budgetHealth.warningCount} Lưu ý
                          </span>
                        ) : null}
                        {budgetHealth.dangerCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-1 text-rose-700">
                            <Flame className="size-3" /> {budgetHealth.dangerCount} Vượt
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3.5">
                      {budgetHealth.jars.map((jar) => (
                        <div key={jar.id} className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2 text-xs">
                            <span className="flex min-w-0 items-center gap-2 font-semibold text-slate-700">
                              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: jar.category_color }} />
                              <span className="truncate">{jar.category_name}</span>
                              <span className={cn(
                                'shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                                jar.budget_basis === 'daily' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
                              )}>
                                {jar.budget_basis === 'daily' ? 'Theo ngày' : 'Theo tháng'}
                              </span>
                            </span>
                            <span className="shrink-0 font-semibold tabular-nums text-slate-600">
                              {formatCurrency(jar.spent_amount)} / {formatCurrency(jar.budget_amount)}{' '}
                              <span className={cn(
                                'ml-1',
                                jar.severity === 'danger' ? 'text-rose-600' : jar.severity === 'warning' ? 'text-amber-600' : 'text-emerald-700',
                              )}>
                                ({jar.percentage}%)
                              </span>
                            </span>
                          </div>
                          <Progress
                            value={Math.min(jar.percentage, 100)}
                            className="h-2 bg-slate-100"
                            indicatorColor={
                              jar.severity === 'danger'
                                ? 'bg-rose-500'
                                : jar.severity === 'warning'
                                  ? 'bg-amber-500'
                                  : 'bg-[#00bc7c]'
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              ) : null}
            </div>

            <aside className="min-w-0 space-y-6 xl:col-span-5">
              <WeeklyInsightCard
                initialInsight={data?.latestInsight ?? null}
                isDashboardLoading={!data && !error}
              />

              {/* Category Spending Donut & Breakdown */}
              <section className="min-w-0">
                <SectionTitle title="Cơ cấu chi tiêu" href="/stats" />
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs sm:p-5">
                  {categorySpending === null ? (
                    <div className="space-y-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-9 w-full" />)}</div>
                  ) : categorySpending.length ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 border-b border-slate-100 pb-4">
                        <CategoryDonut items={categorySpending} total={categoryTotal} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Tổng chi đã ghi</p>
                          <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-slate-900">
                            {formatCurrency(categoryTotal)}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            Top {categorySpending.length} nhóm chi nhiều nhất
                          </p>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {categorySpending.map((category) => {
                          const percentage = categoryTotal ? Math.round((Number(category.spent_amount) / categoryTotal) * 100) : 0;
                          return (
                            <div key={category.id} className="min-w-0">
                              <div className="mb-1.5 flex min-w-0 items-center justify-between gap-3 text-xs">
                                <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: category.color }} />
                                  <span className="truncate">{category.name}</span>
                                </span>
                                <span className="shrink-0 font-semibold tabular-nums text-slate-700">
                                  {formatCurrency(Number(category.spent_amount))} · <span className="text-slate-400">{percentage}%</span>
                                </span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${percentage}%`, backgroundColor: category.color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <p className="py-4 text-center text-sm text-slate-500">Chưa có khoản chi trong tháng này.</p>
                  )}
                </div>
              </section>

              {/* Attention Budgets */}
              <section className="min-w-0">
                <SectionTitle title="Cảnh báo ngân sách" href="/budgets" mobileHref="/planning" />
                <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs">
                  {attentionBudgets === null ? (
                    <div className="space-y-3">{[1, 2].map((item) => <Skeleton key={item} className="h-8 w-full" />)}</div>
                  ) : attentionBudgets.length ? (
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
                    <div className="flex items-center justify-center gap-2 py-3 text-sm text-emerald-700">
                      <ShieldCheck className="size-4 shrink-0" />
                      <span>Tất cả hũ ngân sách đang trong tầm kiểm soát.</span>
                    </div>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function HeroMetric({
  label,
  value,
  prefix,
  delta,
  invertDeltaColor = false,
  tone,
}: {
  label: string;
  value?: number;
  prefix: string;
  delta: number | null;
  invertDeltaColor?: boolean;
  tone: 'income' | 'expense';
}) {
  const isPositiveGood = invertDeltaColor ? (delta ?? 0) <= 0 : (delta ?? 0) >= 0;
  return (
    <div className="min-w-0">
      <p className={cn('text-[11px]', tone === 'income' ? 'text-white/80' : 'text-white/80')}>{label}</p>
      {value === undefined ? (
        <Skeleton className="mt-2 h-5 w-20 bg-white/25" />
      ) : (
        <>
          <p className={cn('mt-1 truncate text-sm font-bold tabular-nums sm:text-base', tone === 'income' ? 'text-white' : 'text-rose-100')}>
            {prefix}{formatCurrency(value)}
          </p>
          {delta !== null ? (
            <p className={cn('mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-medium', isPositiveGood ? 'text-emerald-50' : 'text-amber-100')}>
              {delta > 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
              {Math.abs(delta)}% tháng trước
            </p>
          ) : (
            <p className="mt-0.5 text-[10px] text-white/65">Tháng này</p>
          )}
        </>
      )}
    </div>
  );
}

function CategoryDonut({ items, total }: { items: CategorySpending[]; total: number }) {
  const size = 68;
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const segments = items.reduce<Array<{ id: string; color: string; dash: number; offset: number }>>((acc, item) => {
    const val = Number(item.spent_amount) || 0;
    const share = total > 0 ? val / total : 0;
    const dash = share * circumference;
    const prevOffset = acc.length > 0 ? acc[acc.length - 1].offset - acc[acc.length - 1].dash : 0;
    acc.push({ id: String(item.id), color: item.color, dash, offset: prevOffset });
    return acc;
  }, []);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0 -rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={strokeWidth} />
      {segments.map((seg) => (
        <circle
          key={seg.id}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={seg.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${seg.dash} ${circumference}`}
          strokeDashoffset={seg.offset}
          strokeLinecap="butt"
        />
      ))}
    </svg>
  );
}

function SectionTitle({ title, href, mobileHref }: { title: string; href: string; mobileHref?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-bold tracking-[-0.02em] text-slate-900">{title}</h2>
      {mobileHref ? (
        <>
          <Link href={mobileHref} className="flex items-center gap-0.5 text-xs font-semibold text-[#00a970] md:hidden">Xem thêm <ChevronRight className="size-3.5" /></Link>
          <Link href={href} className="hidden items-center gap-0.5 text-xs font-semibold text-[#00a970] hover:underline md:flex">Xem thêm <ChevronRight className="size-3.5" /></Link>
        </>
      ) : (
        <Link href={href} className="flex items-center gap-0.5 text-xs font-semibold text-[#00a970] hover:underline">Xem thêm <ChevronRight className="size-3.5" /></Link>
      )}
    </div>
  );
}
