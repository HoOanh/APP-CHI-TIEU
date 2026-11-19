'use client';

import {
  AlertTriangle,
  CalendarDays,
  Clock,
  Edit,
  MoreVertical,
  Siren,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Progress } from '@/components/ui/progress';
import { CategoryIcon } from '@/components/CategoryIcon';
import { cn, formatCurrency, getPercentage } from '@/lib/utils';
import { getFreqLabel, type BudgetItem } from './types';

export function BudgetMobileGrid({
  budgets,
  onEdit,
  onDelete,
}: {
  budgets: BudgetItem[];
  onEdit: (budget: BudgetItem) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:hidden">
      {budgets.map((budget) => {
        const effectiveBudget = Math.max(0, budget.effective_budget ?? (budget.budget_amount + (budget.rollover_amount ?? 0)));
        const pct = getPercentage(budget.spent_amount, effectiveBudget);
        const effectiveDailyLimit = budget.daily_limit > 0
          ? budget.daily_limit
          : budget.budget_basis === 'daily'
            ? budget.daily_amount
            : 0;
        const isDailyOver = effectiveDailyLimit > 0 && budget.today_spent > effectiveDailyLimit;
        const isOver = pct >= 100;
        const hasDanger = isOver || isDailyOver || Boolean(budget.alerts?.some((alert) => alert.severity === 'danger'));
        const isWarning = !hasDanger && (pct >= budget.warning_percent || Boolean(budget.alerts?.some((alert) => alert.severity === 'warning')));
        const hasLimits = effectiveDailyLimit > 0 || budget.frequency_limit > 0;

        return (
          <Card
            key={budget.id}
            className={cn(
              'overflow-hidden rounded-2xl shadow-sm transition-all',
              hasDanger
                ? 'overspend-card-pulse border-2 border-rose-500 bg-rose-50/40'
                : isWarning
                  ? 'border-2 border-amber-300 bg-amber-50/20'
                  : 'border-border bg-card',
            )}
          >
            <CardContent className="p-4">
              <div className="mb-3 flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <CategoryIcon name={budget.category_name} color={budget.category_color} />
                  <div>
                    <p className="font-semibold text-foreground">{budget.category_name}</p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatCurrency(budget.spent_amount)} / {formatCurrency(effectiveBudget)}
                    </p>
                    {budget.rollover_amount ? (
                      <p className={cn('mt-0.5 text-[11px] font-medium', budget.rollover_amount > 0 ? 'text-emerald-700' : 'text-rose-600')}>
                        {budget.rollover_amount > 0 ? `+${formatCurrency(budget.rollover_amount)} dư tháng trước` : `${formatCurrency(budget.rollover_amount)} bù tháng trước`}
                      </p>
                    ) : null}
                    {budget.budget_basis === 'daily' ? (
                      <p className={cn('mt-1 text-[11px] font-medium', isDailyOver ? 'text-rose-600' : 'text-blue-600')}>
                        {formatCurrency(budget.daily_amount)} / ngày × {budget.budget_days} ngày
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {hasDanger ? (
                    <Badge variant="destructive" className="rounded-lg bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white">
                      {isOver ? '🚨 Vượt tháng' : '🚨 Lố ngày'}
                    </Badge>
                  ) : null}
                  <Badge
                    variant="secondary"
                    className={cn(
                      'rounded-lg font-semibold tabular-nums',
                      hasDanger
                        ? 'bg-rose-500/15 text-rose-700'
                        : isWarning
                          ? 'bg-amber-500/15 text-amber-700'
                          : 'bg-emerald-500/10 text-emerald-600',
                    )}
                  >
                    {Math.round(pct)}%
                  </Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-mr-2 h-8 w-8 rounded-full">
                        <MoreVertical className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl">
                      <DropdownMenuItem onClick={() => onEdit(budget)} className="cursor-pointer rounded-lg">
                        <Edit className="mr-2 h-4 w-4" /> Chỉnh sửa
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(budget.id)}
                        className="cursor-pointer rounded-lg text-rose-500 focus:bg-rose-500/10 focus:text-rose-500"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Xóa ngân sách
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <Progress
                value={isDailyOver && pct < 100 ? Math.max(pct, 100) : pct}
                className="h-2.5 rounded-full bg-secondary"
                indicatorColor={cn(
                  'rounded-full transition-all duration-500',
                  hasDanger ? 'bg-rose-600' : isWarning ? 'bg-amber-500' : 'bg-emerald-500',
                )}
              />

              {hasLimits && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {effectiveDailyLimit > 0 && (
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold',
                        isDailyOver ? 'border border-rose-300 bg-rose-100 text-rose-700' : 'bg-blue-500/10 text-blue-600',
                      )}
                    >
                      <CalendarDays className="h-3 w-3" />
                      <span>Định mức: {formatCurrency(effectiveDailyLimit)}/ngày</span>
                      {budget.today_spent > 0 && (
                        <span className={cn('ml-1 font-bold', isDailyOver ? 'text-rose-700' : '')}>
                          (Hôm nay: {formatCurrency(budget.today_spent)}
                          {isDailyOver ? ` · Lố ${formatCurrency(budget.today_spent - effectiveDailyLimit)}` : ''})
                        </span>
                      )}
                    </div>
                  )}
                  {budget.frequency_limit > 0 && budget.frequency_period && (
                    <div className="flex items-center gap-1.5 rounded-lg bg-purple-500/10 px-2.5 py-1 text-[11px] font-medium text-purple-600">
                      <Clock className="h-3 w-3" />
                      <span>
                        {budget.frequency_limit} lần{getFreqLabel(budget.frequency_period)}
                      </span>
                      <span className="ml-1">
                        ({budget.frequency_period === 'week'
                          ? budget.week_count
                          : budget.frequency_period === 'month'
                            ? budget.month_count
                            : budget.today_count}{' '}
                        đã chi)
                      </span>
                    </div>
                  )}
                </div>
              )}

              {budget.alerts && budget.alerts.length > 0 && (
                <div className="mt-3 space-y-2">
                  {budget.alerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'flex items-start gap-2.5 rounded-xl px-3.5 py-3',
                        alert.severity === 'danger'
                          ? 'border border-rose-400 bg-rose-600 text-white shadow-sm'
                          : 'border border-amber-300 bg-amber-50 text-amber-800',
                      )}
                    >
                      {alert.severity === 'danger' ? (
                        <Siren className="mt-0.5 size-4 shrink-0 animate-bounce text-white" />
                      ) : (
                        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold">{alert.title}</p>
                        <p className={cn('mt-0.5 text-[11px] leading-4', alert.severity === 'danger' ? 'font-medium text-rose-50' : 'opacity-90')}>
                          {alert.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
