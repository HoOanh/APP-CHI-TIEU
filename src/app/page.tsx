'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  ChevronRight,
  ReceiptText,
  Settings,
  WalletCards,
} from 'lucide-react';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
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
  const { data, error } = useSWR(`/api/dashboard?month=${month}`, fetchDashboard, {
    dedupingInterval: 10_000,
    revalidateOnFocus: false,
  });
  const summary = data?.summary ?? null;
  const recent = data?.recent ?? null;
  const attentionBudgets = data?.attentionBudgets ?? null;
  const categorySpending = data?.categorySpending ?? null;
  const categoryTotal = categorySpending?.reduce((total, item) => total + Number(item.spent_amount), 0) ?? 0;

  return (
    <div className="mx-auto min-h-screen w-full max-w-[1120px] overflow-x-hidden px-4 pb-nav pt-5 md:px-8 md:py-8 xl:px-10">
      <header className="mb-6 flex items-center justify-between md:mb-8">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#00a970]">Tài chính</p>
          <h1 className="mt-1 text-xl font-semibold tracking-[-0.035em] text-slate-800">Xin chào 👋</h1>
          <p className="mt-0.5 text-sm text-slate-400">{getMonthLabel(month)}</p>
        </div>
        <Link
          href="/settings"
          aria-label="Cài đặt"
          className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <Settings className="size-5" />
          <span className="sr-only">Cài đặt</span>
        </Link>
      </header>

      {error ? <p className="mb-5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">Không thể tải dữ liệu. Hãy thử lại.</p> : null}

      <section className="overflow-hidden rounded-[24px] bg-[#00bc7c] text-white shadow-[0_18px_38px_-24px_rgba(0,188,124,0.75)]">
        <div className="relative p-5 sm:p-6">
          <div className="absolute -right-12 -top-20 size-52 rounded-full border-[28px] border-white/10" />
          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0">
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

      <div className="my-4 flex items-center gap-3 px-1 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><ReceiptText className="size-4 text-[#00a970]" /> {summary ? `${summary.transactionCount} giao dịch tháng này` : 'Đang tải giao dịch…'}</span>
        <span className="h-3 w-px bg-slate-200" />
        <span className="truncate">TB chi: <strong className="font-semibold text-slate-700">{summary ? formatCurrency(summary.dailyAverage) : '—'}</strong>/ngày</span>
      </div>

      <section className="mb-7">
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

      <section className="mb-7">
        <SectionTitle title="Chi theo danh mục" href="/settings#thong-ke" />
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {categorySpending === null ? <div className="space-y-4">{[1, 2, 3].map((item) => <Skeleton key={item} className="h-9 w-full" />)}</div> : categorySpending.length ? (
            <div className="space-y-4">
              {categorySpending.map((category) => {
                const percentage = categoryTotal ? Math.round((Number(category.spent_amount) / categoryTotal) * 100) : 0;
                return (
                  <div key={category.id}>
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="truncate font-medium text-slate-700">{category.name}</span>
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

      <section className="mb-4">
        <SectionTitle title="Theo dõi ngân sách" href="/budgets" />
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          {attentionBudgets === null ? <div className="space-y-3">{[1, 2].map((item) => <Skeleton key={item} className="h-8 w-full" />)}</div> : attentionBudgets.length ? attentionBudgets.map((budget) => {
            const progress = getPercentage(budget.spent_amount, budget.budget_amount);
            return (
              <div key={budget.id} className="mb-4 last:mb-0">
                <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                  <span className={cn('truncate font-semibold', budget.alert_severity === 'danger' ? 'text-rose-600' : 'text-amber-700')}>{budget.category_name}</span>
                  <span className="shrink-0 text-xs tabular-nums text-slate-400">{formatCurrency(budget.spent_amount)} / {formatCurrency(budget.budget_amount)}</span>
                </div>
                <Progress value={Math.min(progress, 100)} className="h-1.5" indicatorColor={progress >= 100 ? 'bg-[#f15b64]' : 'bg-[#f4b740]'} />
                <p className={cn('mt-2 text-[11px] leading-4', budget.alert_severity === 'danger' ? 'text-rose-600' : 'text-amber-700')}>{budget.alert_message}</p>
              </div>
            );
          }) : (
            <p className="py-2 text-center text-sm text-slate-500">Ngân sách đang trong tầm kiểm soát.</p>
          )}
        </div>
      </section>
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

function SectionTitle({ title, href }: { title: string; href: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-semibold text-slate-800">{title}</h2>
      <Link href={href} className="flex items-center text-xs font-medium text-slate-400">Xem tất cả <ChevronRight className="size-3.5" /></Link>
    </div>
  );
}
