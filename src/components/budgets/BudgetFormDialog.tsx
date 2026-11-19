'use client';

import { CalendarDays, ChevronDown } from 'lucide-react';
import * as CollapsiblePrimitive from 'radix-ui/collapsible';
import type { FieldErrors } from 'react-hook-form';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn, formatCurrency, formatMoneyInput } from '@/lib/utils';
import { getDaysInMonth, type BudgetCategory, type BudgetFormValues, type BudgetItem } from './types';

export function BudgetFormDialog({
  open,
  onOpenChange,
  editingBudget,
  categories,
  month,
  formData,
  setFormData,
  errors,
  isSubmitting,
  isAdvancedOpen,
  onAdvancedOpenChange,
  calculatedBudgetTotal,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingBudget: BudgetItem | null;
  categories: BudgetCategory[];
  month: string;
  formData: BudgetFormValues;
  setFormData: (updater: (prev: BudgetFormValues) => BudgetFormValues) => void;
  errors: FieldErrors<BudgetFormValues>;
  isSubmitting: boolean;
  isAdvancedOpen: boolean;
  onAdvancedOpenChange: (open: boolean) => void;
  calculatedBudgetTotal: number;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[430px] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[24px] p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[calc(100vw-2rem)]">
        <DialogHeader className="border-b border-border px-5 py-4 pr-14">
          <DialogTitle className="text-xl">
            {editingBudget ? 'Chỉnh sửa hũ' : 'Thêm hũ chi tiêu'}
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs">
            Đặt một mức chi rõ ràng, phần giới hạn chi tiết là tùy chọn.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
          <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground">Danh mục</Label>
              <Select
                value={formData.category_id}
                onValueChange={(value) => setFormData((prev) => ({ ...prev, category_id: value ?? '' }))}
                disabled={Boolean(editingBudget)}
              >
                <SelectTrigger className="h-12 w-full rounded-xl bg-muted/40 px-3.5 text-base">
                  <SelectValue placeholder="Chọn danh mục chi tiêu">
                    {(() => {
                      const selectedCategory = categories.find((category) => String(category.id) === formData.category_id);
                      return selectedCategory ? (
                        <span className="inline-flex min-w-0 items-center gap-2.5">
                          <CategoryIcon name={selectedCategory.name} color={selectedCategory.color} className="size-7 rounded-lg" iconClassName="size-3.5" />
                          <span className="truncate font-medium">{selectedCategory.name}</span>
                        </span>
                      ) : 'Chọn danh mục chi tiêu';
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent side="bottom" align="start" className="max-h-72 rounded-2xl p-1.5">
                  {categories
                    .filter((category) => category.name !== 'Thu nhập')
                    .map((category) => (
                      <SelectItem key={category.id} value={String(category.id)} className="min-h-11 rounded-xl px-2 py-2 text-sm font-medium">
                        <CategoryIcon name={category.name} color={category.color} className="size-8 rounded-xl" iconClassName="size-4" />
                        <span className="truncate pr-5">{category.name}</span>
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.category_id?.message ? <p role="alert" className="text-xs font-medium text-red-600">{errors.category_id.message}</p> : null}
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-semibold text-muted-foreground">Cách đặt ngân sách</Label>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, budget_basis: 'monthly' }))}
                  className={cn('min-h-10 rounded-lg text-sm font-semibold', formData.budget_basis === 'monthly' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground')}
                >
                  Tổng theo tháng
                </button>
                <button
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, budget_basis: 'daily' }))}
                  className={cn('min-h-10 rounded-lg text-sm font-semibold', formData.budget_basis === 'daily' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground')}
                >
                  Mức theo ngày
                </button>
              </div>
              {formData.budget_basis === 'monthly' ? (
                <div className="space-y-2">
                  <Label htmlFor="budget-monthly-amount" className="text-xs text-muted-foreground">Tổng ngân sách tháng</Label>
                  <Input
                    id="budget-monthly-amount"
                    inputMode="numeric"
                    aria-invalid={Boolean(errors.budget_amount)}
                    className="h-12 w-full rounded-xl bg-muted/40 text-base font-semibold tabular-nums"
                    placeholder="Ví dụ: 3.900.000"
                    value={formData.budget_amount}
                    onChange={(event) => setFormData((prev) => ({ ...prev, budget_amount: formatMoneyInput(event.target.value) }))}
                  />
                  {errors.budget_amount?.message ? <p role="alert" className="text-xs font-medium text-red-600">{errors.budget_amount.message}</p> : null}
                </div>
              ) : (
                <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="budget-daily-amount" className="text-xs text-muted-foreground">Ngân sách mỗi ngày</Label>
                    <Input
                      id="budget-daily-amount"
                      inputMode="numeric"
                      aria-invalid={Boolean(errors.daily_amount)}
                      className="h-12 w-full rounded-xl bg-muted/40 text-base font-semibold tabular-nums"
                      placeholder="100.000"
                      value={formData.daily_amount}
                      onChange={(event) => setFormData((prev) => ({ ...prev, daily_amount: formatMoneyInput(event.target.value) }))}
                    />
                    {errors.daily_amount?.message ? <p role="alert" className="text-xs font-medium text-red-600">{errors.daily_amount.message}</p> : null}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="budget-days" className="text-xs text-muted-foreground">Số ngày</Label>
                    <Input
                      id="budget-days"
                      type="number"
                      inputMode="numeric"
                      aria-invalid={Boolean(errors.budget_days)}
                      min="1"
                      max={getDaysInMonth(month)}
                      step="1"
                      className="h-12 rounded-xl bg-muted/40 text-base tabular-nums"
                      value={formData.budget_days}
                      onChange={(event) => setFormData((prev) => ({ ...prev, budget_days: event.target.value }))}
                    />
                    {errors.budget_days?.message ? <p role="alert" className="text-xs font-medium text-red-600">{errors.budget_days.message}</p> : null}
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2.5 text-sm">
                <span className="text-emerald-800">Tổng ngân sách tháng</span>
                <span className="font-semibold tabular-nums text-emerald-800">{formatCurrency(calculatedBudgetTotal)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2.5">
              <div>
                <p className="text-sm font-medium">Nhắc khi đã chi</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Gửi cảnh báo trước khi vượt hũ</p>
              </div>
              <div role="radiogroup" aria-label="Ngưỡng cảnh báo" className="grid grid-cols-3 rounded-xl bg-amber-50 p-1">
                {['60', '80', '90'].map((percent) => (
                  <button
                    key={percent}
                    type="button"
                    role="radio"
                    aria-checked={formData.warning_percent === percent}
                    onClick={() => setFormData((prev) => ({ ...prev, warning_percent: percent }))}
                    className={cn(
                      'h-8 min-w-10 rounded-lg px-2 text-xs font-semibold transition',
                      formData.warning_percent === percent ? 'bg-white text-amber-700 shadow-sm' : 'text-amber-700/65 hover:text-amber-700',
                    )}
                  >
                    {percent}%
                  </button>
                ))}
              </div>
            </div>

            <CollapsiblePrimitive.Root open={isAdvancedOpen} onOpenChange={onAdvancedOpenChange} className="group rounded-2xl border border-border bg-card">
              <CollapsiblePrimitive.Trigger className="flex w-full cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-medium marker:content-none">
                <span className="flex items-center gap-2">
                  <CalendarDays className="size-4 text-primary" />
                  Thêm giới hạn nâng cao
                </span>
                <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </CollapsiblePrimitive.Trigger>
              <CollapsiblePrimitive.Content className="space-y-4 border-t border-border px-3 pb-3 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Trần chi tiêu mỗi ngày (tùy chọn)</Label>
                  <Input
                    inputMode="numeric"
                    className="h-10 w-full rounded-xl bg-muted/40 tabular-nums"
                    placeholder="Ví dụ: 130.000đ"
                    value={formData.daily_limit}
                    onChange={(event) => setFormData((prev) => ({ ...prev, daily_limit: formatMoneyInput(event.target.value) }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Số lần giao dịch</Label>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min="0"
                      className="h-10 w-full rounded-xl bg-muted/40 tabular-nums"
                      placeholder="Ví dụ: 2"
                      value={formData.frequency_limit}
                      onChange={(event) => setFormData((prev) => ({ ...prev, frequency_limit: event.target.value }))}
                    />
                    <div className="flex h-10 overflow-hidden rounded-xl border border-input bg-muted/40 p-1">
                      {[
                        ['day', 'Ngày'],
                        ['week', 'Tuần'],
                        ['month', 'Tháng'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setFormData((prev) => ({ ...prev, frequency_period: value }))}
                          className={cn(
                            'h-full rounded-lg px-2.5 text-xs font-semibold',
                            formData.frequency_period === value
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-background hover:text-foreground',
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-2.5 border-t border-border pt-3">
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">Chuyển số dư sang tháng sau (Rollover)</p>
                      <p className="text-[11px] text-muted-foreground">Khi sao chép hũ sang tháng mới, tự cộng/trừ phần còn dư.</p>
                    </div>
                    <Switch
                      checked={formData.rollover_enabled}
                      onCheckedChange={(checked) => setFormData((prev) => ({ ...prev, rollover_enabled: checked }))}
                    />
                  </label>
                  {formData.rollover_enabled ? (
                    <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted/40 p-1 text-xs">
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, rollover_mode: 'positive_only' }))}
                        className={cn(
                          'rounded-lg py-1.5 font-medium transition',
                          formData.rollover_mode === 'positive_only' ? 'bg-white text-emerald-700 shadow-xs' : 'text-muted-foreground',
                        )}
                      >
                        Chỉ giữ phần dư (+)
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData((prev) => ({ ...prev, rollover_mode: 'all' }))}
                        className={cn(
                          'rounded-lg py-1.5 font-medium transition',
                          formData.rollover_mode === 'all' ? 'bg-white text-amber-700 shadow-xs' : 'text-muted-foreground',
                        )}
                      >
                        Gồm cả vượt lố (−/+)
                      </button>
                    </div>
                  ) : null}
                </div>
              </CollapsiblePrimitive.Content>
            </CollapsiblePrimitive.Root>
          </div>

          <div className="border-t border-border bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
            <Button type="submit" className="h-12 w-full rounded-xl font-semibold" disabled={isSubmitting}>
              {editingBudget ? 'Cập nhật' : 'Lưu ngân sách'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
