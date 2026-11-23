'use client';

import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CategoryIcon } from '@/components/CategoryIcon';
import { cn, formatCurrency, getPercentage } from '@/lib/utils';
import type { BudgetItem } from './types';

export function BudgetDesktopTable({
  budgets,
  onEdit,
  onDelete,
}: {
  budgets: BudgetItem[];
  onEdit: (budget: BudgetItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="hidden overflow-hidden rounded-2xl border border-border bg-card xl:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-6 py-3 font-medium">Danh mục</th>
              <th className="px-4 py-3 font-medium">Đã chi</th>
              <th className="px-4 py-3 font-medium">Ngân sách</th>
              <th className="px-4 py-3 font-medium">Tỷ lệ</th>
              <th className="px-4 py-3 font-medium">Trạng thái</th>
              <th className="w-28 px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {budgets.map((budget) => {
              const effectiveBudget = Math.max(0, budget.effective_budget ?? (budget.budget_amount + (budget.rollover_amount ?? 0)));
              const pct = getPercentage(budget.spent_amount, effectiveBudget);
              const effectiveDailyLimit = budget.daily_limit > 0
                ? budget.daily_limit
                : budget.budget_basis === 'daily'
                  ? budget.daily_amount
                  : 0;
              const onlyAlertOnOverspend = budget.warning_percent > 100;
              const isOver = onlyAlertOnOverspend ? budget.spent_amount > effectiveBudget : pct >= 100;
              const isDailyOver = effectiveDailyLimit > 0 && budget.today_spent > effectiveDailyLimit;
              const hasDanger = isOver || isDailyOver || Boolean(budget.alerts?.some((alert) => alert.severity === 'danger'));
              const isWarning = !hasDanger && ((!onlyAlertOnOverspend && pct >= budget.warning_percent) || Boolean(budget.alerts?.some((alert) => alert.severity === 'warning')));
              const tone = hasDanger ? 'text-rose-600' : isWarning ? 'text-amber-600' : 'text-emerald-600';
              const statusLabel = isOver
                ? (budget.spent_amount > effectiveBudget ? '🚨 Đã vượt ngân sách tháng' : '🚨 Chạm trần 100%')
                : isDailyOver
                  ? `🚨 Lố định mức ngày (${formatCurrency(budget.today_spent)}/${formatCurrency(effectiveDailyLimit)})`
                  : hasDanger
                    ? '🚨 Vượt giới hạn'
                    : isWarning
                      ? '⚠️ Sắp chạm hạn mức'
                      : 'Trong kế hoạch';

              return (
                <tr key={budget.id} className={cn('group transition-colors', hasDanger ? 'bg-rose-50/70 hover:bg-rose-100/60' : 'hover:bg-muted/30')}>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center gap-3">
                      <CategoryIcon name={budget.category_name} icon={budget.category_icon} color={budget.category_color} className="size-9 rounded-xl" />
                      <span>
                        <span className="block font-semibold text-foreground">{budget.category_name}</span>
                        {budget.budget_basis === 'daily' ? (
                          <span className={cn('mt-0.5 block text-xs', isDailyOver ? 'font-semibold text-rose-600' : 'text-muted-foreground')}>
                            {formatCurrency(budget.daily_amount)}/ngày × {budget.budget_days} ngày
                            {budget.today_spent > 0 ? ` · Hôm nay: ${formatCurrency(budget.today_spent)}` : ''}
                          </span>
                        ) : effectiveDailyLimit > 0 && budget.today_spent > 0 ? (
                          <span className={cn('mt-0.5 block text-xs', isDailyOver ? 'font-semibold text-rose-600' : 'text-muted-foreground')}>
                            Hôm nay: {formatCurrency(budget.today_spent)} / {formatCurrency(effectiveDailyLimit)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 font-medium tabular-nums text-foreground">{formatCurrency(budget.spent_amount)}</td>
                  <td className="whitespace-nowrap px-4 py-4 tabular-nums text-muted-foreground">
                    <span>{formatCurrency(effectiveBudget)}</span>
                    {budget.rollover_amount ? (
                      <span className={cn('block text-[11px]', budget.rollover_amount > 0 ? 'text-emerald-700' : 'text-rose-600')}>
                        {budget.rollover_amount > 0 ? `+${formatCurrency(budget.rollover_amount)} dư` : `${formatCurrency(budget.rollover_amount)}`}
                      </span>
                    ) : null}
                  </td>
                  <td className="min-w-48 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Progress value={isDailyOver && pct < 100 ? 100 : pct} className="h-2 flex-1" indicatorColor={tone.replace('text-', 'bg-')} />
                      <span className={cn('w-10 text-right text-xs font-semibold tabular-nums', tone)}>{Math.round(pct)}%</span>
                    </div>
                  </td>
                  <td className={cn('px-4 py-4 text-xs font-bold', tone)}>{statusLabel}</td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => onEdit(budget)}>Sửa</Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Xóa ngân sách ${budget.category_name}`} onClick={() => onDelete(budget.id)} className="text-muted-foreground hover:text-rose-600">
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
