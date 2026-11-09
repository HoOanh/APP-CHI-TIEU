'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MonthPicker } from '@/components/MonthPicker';
import { CategoryIcon } from '@/components/CategoryIcon';
import { useToast } from '@/hooks/useToast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import * as CollapsiblePrimitive from 'radix-ui/collapsible';
import {
  formatCurrency,
  formatMoneyInput,
  getCurrentMonth,
  parseMoneyInput,
  getPercentage,
  cn,
} from '@/lib/utils';
import {
  Plus,
  Copy,
  Trash2,
  MoreVertical,
  Wallet,
  AlertTriangle,
  Clock,
  CalendarDays,
  Edit,
  FileJson2,
  Upload,
  ChevronDown,
} from 'lucide-react';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_system: number;
}

interface BudgetAlert {
  type: string;
  title: string;
  message: string;
  severity: 'warning' | 'danger';
}

interface Budget {
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
  alerts: BudgetAlert[];
}

const budgetFormSchema = z.object({
  category_id: z.string().min(1, 'Chọn danh mục'),
  budget_amount: z.string(),
  budget_basis: z.enum(['monthly', 'daily']),
  daily_amount: z.string(),
  budget_days: z.string(),
  warning_percent: z.string(),
  daily_limit: z.string(),
  frequency_limit: z.string(),
  frequency_period: z.string(),
}).superRefine((value, context) => {
  if (value.budget_basis === 'monthly' && parseMoneyInput(value.budget_amount) <= 0) context.addIssue({ code: 'custom', path: ['budget_amount'], message: 'Nhập ngân sách lớn hơn 0' });
  if (value.budget_basis === 'daily') {
    if (parseMoneyInput(value.daily_amount) <= 0) context.addIssue({ code: 'custom', path: ['daily_amount'], message: 'Nhập mức chi mỗi ngày lớn hơn 0' });
    const days = Number(value.budget_days);
    if (!Number.isInteger(days) || days < 1 || days > 31) context.addIssue({ code: 'custom', path: ['budget_days'], message: 'Số ngày phải từ 1 đến 31' });
  }
});
type BudgetFormValues = z.infer<typeof budgetFormSchema>;

export default function BudgetsPage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const { showToast } = useToast();

  const budgetForm = useForm<BudgetFormValues>({
    resolver: zodResolver(budgetFormSchema),
    mode: 'onSubmit',
    defaultValues: {
    category_id: '',
    budget_amount: '',
    budget_basis: 'monthly' as 'monthly' | 'daily',
    daily_amount: '',
    budget_days: String(getDaysInMonth(getCurrentMonth())),
    warning_percent: '80',
    daily_limit: '',
    frequency_limit: '',
    frequency_period: '',
    },
  });
  const formData = budgetForm.watch();
  const setFormData = (updater: (previous: BudgetFormValues) => BudgetFormValues) => {
    const next = updater(budgetForm.getValues());
    for (const key of Object.keys(next) as (keyof BudgetFormValues)[]) budgetForm.setValue(key, next[key], { shouldValidate: true, shouldDirty: true });
  };

  const resetForm = () => {
    budgetForm.reset({
      category_id: '',
      budget_amount: '',
      budget_basis: 'monthly',
      daily_amount: '',
      budget_days: String(getDaysInMonth(month)),
      warning_percent: '80',
      daily_limit: '',
      frequency_limit: '',
      frequency_period: '',
    });
    setEditingBudget(null);
    setIsAdvancedOpen(false);
  };

  const fetchBudgets = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/budgets?month=${month}`);
      if (res.ok) {
        const data = await res.json();
        setBudgets(data);
      }
    } catch (error) {
      console.error('Error fetching budgets:', error);
    } finally {
      setIsLoading(false);
    }
  }, [month]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  }, []);

  useEffect(() => {
    // Data fetching is intentionally triggered by the selected month.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchBudgets();
    fetchCategories();
  }, [fetchBudgets, fetchCategories]);

  const { totalBudget, totalSpent, overallPercentage, remaining } =
    useMemo(() => {
      const totals = budgets.reduce(
        (result, budget) => ({
          totalBudget: result.totalBudget + budget.budget_amount,
          totalSpent: result.totalSpent + budget.spent_amount,
        }),
        { totalBudget: 0, totalSpent: 0 },
      );

      return {
        ...totals,
        overallPercentage: getPercentage(totals.totalSpent, totals.totalBudget),
        remaining: totals.totalBudget - totals.totalSpent,
      };
    }, [budgets]);
  const calculatedBudgetTotal = formData.budget_basis === 'daily'
    ? parseMoneyInput(formData.daily_amount) * Number(formData.budget_days || 0)
    : parseMoneyInput(formData.budget_amount);

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    budgetForm.reset({
      category_id: String(budget.category_id),
      budget_amount: formatMoneyInput(budget.budget_amount),
      budget_basis: budget.budget_basis || 'monthly',
      daily_amount: budget.daily_amount ? formatMoneyInput(budget.daily_amount) : '',
      budget_days: String(budget.budget_days || getDaysInMonth(budget.month || month)),
      warning_percent: String(budget.warning_percent),
      daily_limit: budget.daily_limit ? String(budget.daily_limit) : '',
      frequency_limit: budget.frequency_limit
        ? String(budget.frequency_limit)
        : '',
      frequency_period: budget.frequency_period || '',
    });
    setIsAdvancedOpen(Boolean(budget.daily_limit || budget.frequency_limit));
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const handleSubmit = async (values: BudgetFormValues) => {
    if (values.budget_basis === 'daily' && Number(values.budget_days) > getDaysInMonth(month)) {
      budgetForm.setError('budget_days', { message: `Tháng này chỉ có ${getDaysInMonth(month)} ngày` });
      return;
    }
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: values.category_id,
          month,
          budget_basis: values.budget_basis,
          budget_amount: values.budget_basis === 'daily'
            ? parseMoneyInput(values.daily_amount) * Number(values.budget_days)
            : parseMoneyInput(values.budget_amount),
          daily_amount: parseMoneyInput(values.daily_amount),
          budget_days: Number(values.budget_days),
          warning_percent: Number(values.warning_percent),
          daily_limit: parseMoneyInput(values.daily_limit),
          frequency_limit: Number(values.frequency_limit) || 0,
          frequency_period: values.frequency_period || '',
        }),
      });

      if (res.ok) {
        showToast(
          editingBudget ? 'Cập nhật thành công' : 'Thêm ngân sách thành công',
          'success',
        );
        setIsDialogOpen(false);
        resetForm();
        fetchBudgets();
      } else {
        const result = await res.json() as { error?: string };
        showToast(result.error || 'Không thể lưu ngân sách', 'error');
      }
    } catch (error) {
      console.error('Error saving budget:', error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Đã xóa ngân sách', 'success');
        setPendingDeleteId(null);
        fetchBudgets();
      }
    } catch (error) {
      console.error('Error deleting budget:', error);
    }
  };

  const handleCopy = async () => {
    const [yearStr, monthStr] = month.split('-');
    const prevMonthDate = new Date(Number(yearStr), Number(monthStr) - 2, 1);
    const prevMonth = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;

    try {
      const res = await fetch('/api/budgets/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from_month: prevMonth, to_month: month }),
      });

      if (res.ok) {
        showToast('Sao chép thành công', 'success');
        fetchBudgets();
      }
    } catch (error) {
      console.error('Error copying budgets:', error);
    }
  };

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const parsed: unknown = JSON.parse(importJson);
      const payload = Array.isArray(parsed)
        ? { month, budgets: parsed }
        : parsed;
      const response = await fetch('/api/budgets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(String(result.error || 'Không thể import'));
      }
      showToast(`Đã import ${result.imported} ngân sách`, 'success');
      setImportJson('');
      setIsImportOpen(false);
      fetchBudgets();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'JSON không hợp lệ',
        'error',
      );
    } finally {
      setIsImporting(false);
    }
  };

  const getFreqLabel = (period: string): string => {
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
  };

  return (
    <div className="pb-nav mx-auto flex min-h-screen w-full max-w-7xl flex-col bg-background text-foreground">
      <div className="p-4 flex items-center justify-between border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-xl font-bold">Ngân sách</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Overall summary */}
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Tổng ngân sách tháng
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-3xl font-bold tabular-nums text-foreground">
                  {formatCurrency(totalSpent)}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  trên tổng {formatCurrency(totalBudget)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-muted-foreground">
                  Còn lại
                </p>
                <p
                  className={cn(
                    'text-lg font-semibold tabular-nums',
                    remaining < 0 ? 'text-rose-500' : 'text-emerald-500',
                  )}
                >
                  {formatCurrency(remaining)}
                </p>
              </div>
            </div>

            <Progress
              value={overallPercentage}
              className="h-3 rounded-full bg-secondary"
              indicatorColor={cn(
                'rounded-full transition-all duration-500',
                overallPercentage >= 100
                  ? 'bg-rose-500'
                  : overallPercentage >= 80
                    ? 'bg-amber-500'
                    : 'bg-emerald-500',
              )}
            />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground font-medium">
              <span>0%</span>
              <span>{Math.round(overallPercentage)}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Budget jars header */}
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="text-lg font-bold">Hũ chi tiêu</h2>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              onClick={openCreateDialog}
              className="h-8 rounded-xl text-xs font-semibold"
            >
              <Plus className="mr-1 size-3.5" />
              Thêm hũ
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImportOpen(true)}
              className="rounded-xl h-8 text-xs font-medium border-border"
            >
              <FileJson2 className="w-3 h-3 mr-1.5" />
              Import JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="rounded-xl h-8 text-xs font-medium border-border"
            >
              <Copy className="w-3 h-3 mr-1.5" />
              Tháng trước
            </Button>
          </div>
        </div>

        {/* Budget jars list */}
        {isLoading ? (
          <div className="flex justify-center p-8 text-muted-foreground">
            Đang tải...
          </div>
        ) : budgets.length === 0 ? (
          <div className="text-center p-8 border border-dashed border-border rounded-2xl bg-card/50">
            <p className="text-muted-foreground mb-4">
              Chưa có ngân sách nào trong tháng này
            </p>
            <Button onClick={openCreateDialog} className="rounded-xl">
              Tạo ngân sách đầu tiên
            </Button>
          </div>
        ) : <>
          <div className="grid gap-4 lg:grid-cols-2 xl:hidden">
            {budgets.map((budget) => {
              const pct = getPercentage(
                budget.spent_amount,
                budget.budget_amount,
              );
              const isWarning = pct >= budget.warning_percent && pct < 100;
              const isOver = pct >= 100;
              const hasLimits =
                budget.daily_limit > 0 || budget.frequency_limit > 0;

              return (
                <Card
                  key={budget.id}
                  className="rounded-2xl border-border bg-card overflow-hidden shadow-sm"
                >
                  <CardContent className="p-4">
                    {/* Header row */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <CategoryIcon
                          name={budget.category_name}
                          color={budget.category_color}
                        />
                        <div>
                          <p className="font-medium">{budget.category_name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatCurrency(budget.spent_amount)} /{' '}
                            {formatCurrency(budget.budget_amount)}
                          </p>
                          {budget.budget_basis === 'daily' ? <p className="mt-1 text-[11px] text-blue-600">{formatCurrency(budget.daily_amount)} / ngày × {budget.budget_days} ngày</p> : null}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'rounded-lg font-semibold tabular-nums',
                            isOver
                              ? 'bg-rose-500/10 text-rose-500'
                              : isWarning
                                ? 'bg-amber-500/10 text-amber-500'
                                : 'bg-emerald-500/10 text-emerald-500',
                          )}
                        >
                          {Math.round(pct)}%
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full -mr-2"
                              >
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="rounded-xl"
                          >
                            <DropdownMenuItem
                              onClick={() => handleEdit(budget)}
                              className="rounded-lg cursor-pointer"
                            >
                              <Edit className="w-4 h-4 mr-2" /> Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setPendingDeleteId(budget.id)}
                              className="text-rose-500 rounded-lg focus:text-rose-500 focus:bg-rose-500/10 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 mr-2" /> Xóa ngân sách
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <Progress
                      value={pct}
                      className="h-2 rounded-full bg-secondary"
                      indicatorColor={cn(
                        'rounded-full transition-all duration-500',
                        isOver
                          ? 'bg-rose-500'
                          : isWarning
                            ? 'bg-amber-500'
                            : 'bg-emerald-500',
                      )}
                    />

                    {/* Limit badges */}
                    {hasLimits && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {budget.daily_limit > 0 && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 text-[11px] font-medium">
                            <CalendarDays className="w-3 h-3" />
                            <span>
                              {formatCurrency(budget.daily_limit)}/ngày
                            </span>
                            {budget.today_spent > 0 && (
                              <span
                                className={cn(
                                  'ml-1',
                                  budget.today_spent >= budget.daily_limit
                                    ? 'text-rose-500'
                                    : '',
                                )}
                              >
                                ({formatCurrency(budget.today_spent)} đã chi)
                              </span>
                            )}
                          </div>
                        )}
                        {budget.frequency_limit > 0 &&
                          budget.frequency_period && (
                            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 text-[11px] font-medium">
                              <Clock className="w-3 h-3" />
                              <span>
                                {budget.frequency_limit} lần
                                {getFreqLabel(budget.frequency_period)}
                              </span>
                              <span className="ml-1">
                                (
                                {budget.frequency_period === 'week'
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

                    {/* Alert badges */}
                    {budget.alerts && budget.alerts.length > 0 && (
                      <div className="space-y-1.5 mt-3">
                        {budget.alerts.map((alert, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              'flex items-start gap-2.5 px-3 py-2.5 rounded-xl',
                              alert.severity === 'danger'
                                ? 'bg-rose-500/10 text-rose-600'
                                : 'bg-amber-500/10 text-amber-600',
                            )}
                          >
                            <AlertTriangle className="mt-0.5 w-3.5 h-3.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold">
                                {alert.title}
                              </p>
                              <p className="mt-0.5 text-[11px] leading-4 opacity-85">
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
          <BudgetTable budgets={budgets} onEdit={handleEdit} onDelete={setPendingDeleteId} />
        </>}
      </div>

      {/* Add/Edit Dialog */}
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[430px] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-[24px] p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[calc(100vw-2rem)]">
          <DialogHeader className="border-b border-border px-5 py-4 pr-14">
            <DialogTitle className="text-xl">
              {editingBudget ? 'Chỉnh sửa hũ' : 'Thêm hũ chi tiêu'}
            </DialogTitle>
            <DialogDescription className="mt-1 text-xs">
              Đặt một mức chi rõ ràng, phần giới hạn chi tiết là tùy chọn.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={budgetForm.handleSubmit(handleSubmit)}
            noValidate
            className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]"
          >
            <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain px-5 py-5">
              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Danh mục
                </Label>
                <Select
                  value={formData.category_id}
                  onValueChange={(value) =>
                    setFormData((prev) => ({
                      ...prev,
                      category_id: value ?? '',
                    }))
                  }
                  disabled={Boolean(editingBudget)}
                >
                  <SelectTrigger className="h-12 w-full rounded-2xl bg-muted/40 px-4 text-base data-[size=default]:h-12">
                    <SelectValue placeholder="Chọn danh mục chi tiêu">
                      {(() => {
                        const selectedCategory = categories.find((category) => String(category.id) === formData.category_id);
                        return selectedCategory ? <><CategoryIcon name={selectedCategory.name} color={selectedCategory.color} className="size-7 rounded-lg" iconClassName="size-3.5" />{selectedCategory.name}</> : 'Chọn danh mục chi tiêu';
                      })()}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent
                    side="bottom"
                    align="start"
                    className="max-h-72 rounded-2xl p-1.5"
                  >
                    {categories
                      .filter((category) => category.name !== 'Thu nhập')
                      .map((category) => (
                        <SelectItem
                          key={category.id}
                          value={String(category.id)}
                          className="min-h-11 rounded-xl px-2 py-2 text-sm font-medium"
                        >
                          <CategoryIcon
                            name={category.name}
                            color={category.color}
                            className="size-8 rounded-xl"
                            iconClassName="size-4"
                          />
                          <span className="truncate pr-5">{category.name}</span>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {budgetForm.formState.errors.category_id?.message ? <p role="alert" className="text-xs font-medium text-red-600">{budgetForm.formState.errors.category_id.message}</p> : null}
              </div>

              <div className="space-y-3">
                <Label className="text-xs font-semibold text-muted-foreground">Cách đặt ngân sách</Label>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
                  <button type="button" onClick={() => setFormData((prev) => ({ ...prev, budget_basis: 'monthly' }))} className={cn('min-h-10 rounded-lg text-sm font-semibold', formData.budget_basis === 'monthly' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground')}>Tổng theo tháng</button>
                  <button type="button" onClick={() => setFormData((prev) => ({ ...prev, budget_basis: 'daily' }))} className={cn('min-h-10 rounded-lg text-sm font-semibold', formData.budget_basis === 'daily' ? 'bg-white text-foreground shadow-sm' : 'text-muted-foreground')}>Mức theo ngày</button>
                </div>
                {formData.budget_basis === 'monthly' ? (
                  <div className="space-y-2">
                    <Label htmlFor="budget-monthly-amount" className="text-xs text-muted-foreground">Tổng ngân sách tháng</Label>
                    <Input id="budget-monthly-amount" inputMode="numeric" aria-invalid={Boolean(budgetForm.formState.errors.budget_amount)} className="h-12 w-full rounded-xl bg-muted/40 text-base font-semibold tabular-nums" placeholder="Ví dụ: 3.900.000" value={formData.budget_amount} onChange={(event) => setFormData((prev) => ({ ...prev, budget_amount: formatMoneyInput(event.target.value) }))} />
                    {budgetForm.formState.errors.budget_amount?.message ? <p role="alert" className="text-xs font-medium text-red-600">{budgetForm.formState.errors.budget_amount.message}</p> : null}
                  </div>
                ) : (
                  <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="budget-daily-amount" className="text-xs text-muted-foreground">Ngân sách mỗi ngày</Label>
                      <Input id="budget-daily-amount" inputMode="numeric" aria-invalid={Boolean(budgetForm.formState.errors.daily_amount)} className="h-12 w-full rounded-xl bg-muted/40 text-base font-semibold tabular-nums" placeholder="100.000" value={formData.daily_amount} onChange={(event) => setFormData((prev) => ({ ...prev, daily_amount: formatMoneyInput(event.target.value) }))} />
                      {budgetForm.formState.errors.daily_amount?.message ? <p role="alert" className="text-xs font-medium text-red-600">{budgetForm.formState.errors.daily_amount.message}</p> : null}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="budget-days" className="text-xs text-muted-foreground">Số ngày</Label>
                      <Input id="budget-days" type="number" inputMode="numeric" aria-invalid={Boolean(budgetForm.formState.errors.budget_days)} min="1" max={getDaysInMonth(month)} step="1" className="h-12 rounded-xl bg-muted/40 text-base tabular-nums" value={formData.budget_days} onChange={(event) => setFormData((prev) => ({ ...prev, budget_days: event.target.value }))} />
                      {budgetForm.formState.errors.budget_days?.message ? <p role="alert" className="text-xs font-medium text-red-600">{budgetForm.formState.errors.budget_days.message}</p> : null}
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
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Gửi cảnh báo trước khi vượt hũ
                  </p>
                </div>
                <div
                  role="radiogroup"
                  aria-label="Ngưỡng cảnh báo"
                  className="grid grid-cols-3 rounded-xl bg-amber-50 p-1"
                >
                  {['60', '80', '90'].map((percent) => (
                    <button
                      key={percent}
                      type="button"
                      role="radio"
                      aria-checked={formData.warning_percent === percent}
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          warning_percent: percent,
                        }))
                      }
                      className={cn(
                        'h-8 min-w-10 rounded-lg px-2 text-xs font-semibold transition',
                        formData.warning_percent === percent
                          ? 'bg-white text-amber-700 shadow-sm'
                          : 'text-amber-700/65 hover:text-amber-700',
                      )}
                    >
                      {percent}%
                    </button>
                  ))}
                </div>
              </div>

              <CollapsiblePrimitive.Root open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen} className="group rounded-2xl border border-border bg-card">
                <CollapsiblePrimitive.Trigger className="flex w-full cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-medium marker:content-none">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" />
                    Thêm giới hạn nâng cao
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsiblePrimitive.Trigger>
                <CollapsiblePrimitive.Content className="space-y-4 border-t border-border px-3 pb-3 pt-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Trần chi tiêu mỗi ngày (tùy chọn)
                    </Label>
                    <Input
                      inputMode="numeric"
                      className="h-10 w-full rounded-xl bg-muted/40 tabular-nums"
                      placeholder="Ví dụ: 130.000đ"
                      value={formData.daily_limit}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          daily_limit: formatMoneyInput(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Số lần giao dịch
                    </Label>
                    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
                      <Input
                        type="number"
                        inputMode="numeric"
                        min="0"
                        className="h-10 w-full rounded-xl bg-muted/40 tabular-nums"
                        placeholder="Ví dụ: 2"
                        value={formData.frequency_limit}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            frequency_limit: e.target.value,
                          }))
                        }
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
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                frequency_period: value,
                              }))
                            }
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
                </CollapsiblePrimitive.Content>
              </CollapsiblePrimitive.Root>
            </div>

            <div className="border-t border-border bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
              <Button
                type="submit"
                className="h-12 w-full rounded-xl font-semibold"
                disabled={budgetForm.formState.isSubmitting}
              >
                {editingBudget ? 'Cập nhật' : 'Lưu ngân sách'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa ngân sách?</AlertDialogTitle>
            <AlertDialogDescription>
              Chỉ hũ ngân sách bị xóa; các giao dịch đã ghi vẫn được giữ lại.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => pendingDeleteId && handleDelete(pendingDeleteId)}
            >
              Xóa ngân sách
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
        <DialogContent className="grid h-[min(680px,calc(100dvh-1rem))] w-[560px] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[calc(100vw-2rem)]">
          <DialogHeader className="border-b border-border px-5 py-4 pr-14">
            <DialogTitle>Import danh sách ngân sách</DialogTitle>
            <DialogDescription className="text-xs">
              Dán JSON array. Nếu không có month, app dùng tháng đang chọn.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 p-4">
            <Textarea
              value={importJson}
              onChange={(event) => setImportJson(event.target.value)}
              className="field-sizing-fixed h-full min-h-0 resize-none overflow-y-auto rounded-xl bg-muted/30 p-3 font-mono text-xs leading-5"
              placeholder={`[
                              {
                                "category": "Ăn uống",
                                "budget_amount": 3900000,
                                "warning_percent": 80,
                                "daily_limit": 130000
                              }
                            ]`}
            />
          </div>
          <div className="border-t border-border bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
            <Button
              onClick={handleImport}
              disabled={!importJson.trim() || isImporting}
              className="h-11 w-full rounded-xl"
            >
              <Upload className="size-4" />
              {isImporting ? 'Đang import…' : 'Kiểm tra và import'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function getDaysInMonth(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]), 0).getDate() : 30;
}

function BudgetTable({ budgets, onEdit, onDelete }: { budgets: Budget[]; onEdit: (budget: Budget) => void; onDelete: (id: string) => void }) {
  return <section className="hidden overflow-hidden rounded-2xl border border-border bg-card xl:block"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-6 py-3 font-medium">Danh mục</th><th className="px-4 py-3 font-medium">Đã chi</th><th className="px-4 py-3 font-medium">Ngân sách</th><th className="px-4 py-3 font-medium">Tỷ lệ</th><th className="px-4 py-3 font-medium">Trạng thái</th><th className="w-28 px-4 py-3" /></tr></thead><tbody className="divide-y divide-border">{budgets.map((budget) => { const pct = getPercentage(budget.spent_amount, budget.budget_amount); const tone = pct >= 100 ? 'text-rose-600' : pct >= budget.warning_percent ? 'text-amber-600' : 'text-emerald-600'; return <tr key={budget.id} className="group hover:bg-muted/30"><td className="px-6 py-4"><span className="inline-flex items-center gap-3"><CategoryIcon name={budget.category_name} color={budget.category_color} className="size-9 rounded-xl"/><span><span className="block font-semibold text-foreground">{budget.category_name}</span>{budget.budget_basis === 'daily' ? <span className="mt-0.5 block text-xs text-muted-foreground">{formatCurrency(budget.daily_amount)}/ngày × {budget.budget_days} ngày</span> : null}</span></span></td><td className="whitespace-nowrap px-4 py-4 font-medium tabular-nums text-foreground">{formatCurrency(budget.spent_amount)}</td><td className="whitespace-nowrap px-4 py-4 tabular-nums text-muted-foreground">{formatCurrency(budget.budget_amount)}</td><td className="min-w-48 px-4 py-4"><div className="flex items-center gap-3"><Progress value={pct} className="h-2 flex-1" indicatorColor={tone.replace('text-', 'bg-')} /><span className={cn('w-10 text-right text-xs font-semibold tabular-nums', tone)}>{Math.round(pct)}%</span></div></td><td className={cn('px-4 py-4 text-xs font-semibold', tone)}>{pct >= 100 ? 'Đã vượt mức' : pct >= budget.warning_percent ? 'Sắp chạm hạn mức' : 'Trong kế hoạch'}</td><td className="px-4 py-3"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => onEdit(budget)}>Sửa</Button><Button variant="ghost" size="icon-sm" aria-label={`Xóa ngân sách ${budget.category_name}`} onClick={() => onDelete(budget.id)} className="text-muted-foreground hover:text-rose-600"><Trash2 className="size-4"/></Button></div></td></tr>; })}</tbody></table></div></section>;
}
