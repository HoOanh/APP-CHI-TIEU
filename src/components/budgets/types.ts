import { z } from 'zod';
import { parseMoneyInput } from '@/lib/utils';

export interface BudgetCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_system: number;
}

export interface BudgetAlert {
  type: string;
  title: string;
  message: string;
  severity: 'warning' | 'danger';
}

export interface BudgetItem {
  id: string;
  month: string;
  category_id: string;
  category_name: string;
  category_icon: string;
  category_color: string;
  budget_amount: number;
  spent_amount: number;
  warning_percent: number;
  daily_limit: number;
  frequency_limit: number;
  frequency_period: string;
  today_spent: number;
  today_count: number;
  week_count: number;
  month_count: number;
  budget_basis: 'monthly' | 'daily';
  daily_amount: number;
  budget_days: number;
  rollover_enabled?: number;
  rollover_mode?: 'positive_only' | 'all';
  rollover_amount?: number;
  effective_budget?: number;
  alerts: BudgetAlert[];
}

export const budgetFormSchema = z
  .object({
    category_id: z.string().min(1, 'Chọn danh mục'),
    budget_amount: z.string(),
    budget_basis: z.enum(['monthly', 'daily']),
    daily_amount: z.string(),
    budget_days: z.string(),
    warning_percent: z.string(),
    daily_limit: z.string(),
    frequency_limit: z.string(),
    frequency_period: z.string(),
    rollover_enabled: z.boolean(),
    rollover_mode: z.enum(['positive_only', 'all']),
  })
  .superRefine((value, context) => {
    if (value.budget_basis === 'monthly' && parseMoneyInput(value.budget_amount) <= 0) {
      context.addIssue({ code: 'custom', path: ['budget_amount'], message: 'Nhập ngân sách lớn hơn 0' });
    }
    if (value.budget_basis === 'daily') {
      if (parseMoneyInput(value.daily_amount) <= 0) {
        context.addIssue({ code: 'custom', path: ['daily_amount'], message: 'Nhập mức chi mỗi ngày lớn hơn 0' });
      }
      const days = Number(value.budget_days);
      if (!Number.isInteger(days) || days < 1 || days > 31) {
        context.addIssue({ code: 'custom', path: ['budget_days'], message: 'Số ngày phải từ 1 đến 31' });
      }
    }
  });

export type BudgetFormValues = z.infer<typeof budgetFormSchema>;

export function getDaysInMonth(month: string): number {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]), 0).getDate() : 30;
}

export function getFreqLabel(period: string): string {
  switch (period) {
    case 'day':
      return '/ngày';
    case 'week':
      return '/tuần';
    case 'month':
      return '/tháng';
    default:
      return '';
  }
}
