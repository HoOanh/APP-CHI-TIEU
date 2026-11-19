'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { onTransactionsChanged } from '@/lib/transaction-events';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { MonthPicker } from '@/components/MonthPicker';
import { useToast } from '@/hooks/useToast';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
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
  Wallet,
  Siren,
  FileJson2,
  Sparkles,
} from 'lucide-react';
import { BudgetDesktopTable } from '@/components/budgets/BudgetDesktopTable';
import { BudgetMobileGrid } from '@/components/budgets/BudgetMobileGrid';
import { BudgetFormDialog } from '@/components/budgets/BudgetFormDialog';
import {
  BudgetDeleteAlert,
  BudgetImportDialog,
  PaydaySplitDialog,
} from '@/components/budgets/BudgetSecondaryDialogs';
import {
  budgetFormSchema,
  getDaysInMonth,
  type BudgetCategory as Category,
  type BudgetFormValues,
  type BudgetItem as Budget,
} from '@/components/budgets/types';

export default function BudgetsPage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [importJson, setImportJson] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [isSplitOpen, setIsSplitOpen] = useState(false);
  const [splitIncome, setSplitIncome] = useState('15.000.000');
  const [splitAllocations, setSplitAllocations] = useState<Record<string, string>>({});
  const [isSplitting, setIsSplitting] = useState(false);
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
    rollover_enabled: false,
    rollover_mode: 'positive_only',
    },
  });
  const watchedForm = useWatch({ control: budgetForm.control });
  const formData: BudgetFormValues = {
    category_id: watchedForm.category_id ?? '',
    budget_amount: watchedForm.budget_amount ?? '',
    budget_basis: watchedForm.budget_basis ?? 'monthly',
    daily_amount: watchedForm.daily_amount ?? '',
    budget_days: watchedForm.budget_days ?? String(getDaysInMonth(getCurrentMonth())),
    warning_percent: watchedForm.warning_percent ?? '80',
    daily_limit: watchedForm.daily_limit ?? '',
    frequency_limit: watchedForm.frequency_limit ?? '',
    frequency_period: watchedForm.frequency_period ?? '',
    rollover_enabled: Boolean(watchedForm.rollover_enabled),
    rollover_mode: watchedForm.rollover_mode === 'all' ? 'all' : 'positive_only',
  };
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
      rollover_enabled: false,
      rollover_mode: 'positive_only',
    });
    setEditingBudget(null);
    setIsAdvancedOpen(false);
  };

  const fetchBudgets = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const { signal } = controller;
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await fetch(`/api/budgets?month=${month}`, { signal });
      if (!res.ok) throw new Error('Failed to load budgets');
      const data: Budget[] = await res.json();
      if (!signal.aborted) setBudgets(data);
    } catch {
      if (!signal.aborted) setLoadError(true);
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [month]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;

    fetch(`/api/budgets?month=${month}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load budgets');
        return res.json() as Promise<Budget[]>;
      })
      .then((data) => {
        if (active) {
          setBudgets(data);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (active && !controller.signal.aborted) setLoadError(true);
      })
      .finally(() => {
        if (active && !controller.signal.aborted) setIsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [month]);

  useEffect(() => onTransactionsChanged(() => void fetchBudgets()), [fetchBudgets]);

  useEffect(() => {
    let active = true;
    fetch('/api/categories')
      .then(async (res) => (res.ok ? (await res.json() as Category[]) : null))
      .then((data) => {
        if (active && data) setCategories(data);
      })
      .catch((error) => console.error('Error fetching categories:', error));
    return () => { active = false; };
  }, []);

  const { totalBudget, totalSpent, overallPercentage, remaining } =
    useMemo(() => {
      const totals = budgets.reduce(
        (result, budget) => ({
          totalBudget: result.totalBudget + Math.max(0, budget.effective_budget ?? (budget.budget_amount + (budget.rollover_amount ?? 0))),
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
      rollover_enabled: Number(budget.rollover_enabled) === 1,
      rollover_mode: budget.rollover_mode === 'all' ? 'all' : 'positive_only',
    });
    setIsAdvancedOpen(Boolean(budget.daily_limit || budget.frequency_limit || budget.rollover_enabled));
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
          rollover_enabled: values.rollover_enabled,
          rollover_mode: values.rollover_mode,
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

  const handlePaydaySplit = async (event: React.FormEvent) => {
    event.preventDefault();
    const totalIncomeAmount = parseMoneyInput(splitIncome);
    const allocations = Object.entries(splitAllocations)
      .map(([category_id, pct]) => ({ category_id: Number(category_id), percent: Number(pct) || 0 }))
      .filter((item) => item.percent > 0);
    if (totalIncomeAmount <= 0 || allocations.length === 0) {
      showToast('Nhập thu nhập và phân bổ ít nhất 1 danh mục > 0%', 'error');
      return;
    }
    setIsSplitting(true);
    try {
      const response = await fetch('/api/budgets/payday-split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ totalIncomeAmount, month, mode: 'add', allocations }),
      });
      const data = await response.json() as { error?: string; applied?: unknown[] };
      if (!response.ok) throw new Error(data.error || 'Chia hũ thất bại');
      showToast(`Đã phân bổ thu nhập vào ${data.applied?.length ?? allocations.length} hũ`, 'success');
      setIsSplitOpen(false);
      fetchBudgets();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Lỗi chia hũ', 'error');
    } finally {
      setIsSplitting(false);
    }
  };

  return (
    <div className="pb-nav mx-auto flex min-h-screen w-full max-w-7xl flex-col bg-background text-foreground">
      <div className="p-4 flex items-center justify-between border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10 md:static md:border-0 md:px-8 md:pb-0 md:pt-7">
        <h1 className="text-xl font-bold md:text-2xl">Ngân sách</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <div className="flex-1 space-y-6 p-4 md:p-8">
        {/* Overall summary */}
        {!isLoading && !loadError && budgets.length > 0 && <Card className="rounded-2xl border-slate-200 bg-card">
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
        </Card>}

        {/* Budget jars header */}
        <div className="flex flex-wrap justify-between items-center gap-2">
          <h2 className="text-lg font-bold">Hũ chi tiêu</h2>
          <div className="flex flex-wrap justify-end gap-2">
            <Button
              size="sm"
              onClick={openCreateDialog}
              className={cn("h-8 rounded-xl text-xs font-semibold", !isLoading && !loadError && budgets.length === 0 && "md:hidden")}
            >
              <Plus className="mr-1 size-3.5" />
              Thêm hũ
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsSplitOpen(true)}
              className="rounded-xl h-8 text-xs font-medium border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
            >
              <Sparkles className="w-3 h-3 mr-1.5" />
              Chia hũ lương
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsImportOpen(true)}
              className="rounded-xl h-8 text-xs font-medium border-border"
            >
              <FileJson2 className="w-3 h-3 mr-1.5" />
              Nhập JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="rounded-xl h-8 text-xs font-medium border-border"
            >
              <Copy className="w-3 h-3 mr-1.5" />
              Sao chép tháng trước
            </Button>
          </div>
        </div>

        {/* Budget jars list */}
        {isLoading ? (
          <div className="flex justify-center p-8 text-muted-foreground">
            Đang tải...
          </div>
        ) : loadError ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-white p-5">
            <p className="text-sm text-rose-800">Không tải được ngân sách tháng này.</p>
            <Button type="button" variant="outline" onClick={() => void fetchBudgets()}>Thử lại</Button>
          </div>
        ) : budgets.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center md:flex md:items-center md:justify-between md:gap-4 md:text-left">
            <p className="mb-4 text-sm text-slate-600 md:mb-0">
              Chưa có hũ chi tiêu cho tháng đã chọn
            </p>
            <Button onClick={openCreateDialog} className="rounded-xl">
              Tạo ngân sách đầu tiên
            </Button>
          </div>
        ) : <>
          {budgets.some((budget) => budget.alerts?.some((alert) => alert.severity === 'danger') || budget.spent_amount >= budget.budget_amount) ? (
            <section
              role="alert"
              className="overspend-card-pulse rounded-2xl border-2 border-rose-500 bg-rose-600 p-4 text-white shadow-[0_18px_42px_-14px_rgba(225,29,72,0.75)]"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white">
                  <Siren className="size-5 animate-bounce" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold uppercase tracking-wide text-white">
                    Cảnh báo khẩn: Hũ chi tiêu đang bị lố định mức!
                  </p>
                  <div className="mt-1.5 space-y-1">
                    {budgets
                      .filter((budget) => budget.alerts?.some((alert) => alert.severity === 'danger') || budget.spent_amount >= budget.budget_amount)
                      .map((budget) => {
                        const dangerAlert = budget.alerts?.find((alert) => alert.severity === 'danger');
                        return (
                          <p key={budget.id} className="break-words text-xs font-medium leading-5 text-rose-50">
                            • <strong className="font-bold text-white">{budget.category_name}:</strong>{' '}
                            {dangerAlert ? dangerAlert.message : `Đã chi ${formatCurrency(budget.spent_amount)} / ${formatCurrency(budget.budget_amount)}`}
                          </p>
                        );
                      })}
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          <BudgetMobileGrid budgets={budgets} onEdit={handleEdit} onDelete={setPendingDeleteId} />
          <BudgetDesktopTable budgets={budgets} onEdit={handleEdit} onDelete={setPendingDeleteId} />
        </>}
      </div>

      <BudgetFormDialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
        editingBudget={editingBudget}
        categories={categories}
        month={month}
        formData={formData}
        setFormData={setFormData}
        errors={budgetForm.formState.errors}
        isSubmitting={budgetForm.formState.isSubmitting}
        isAdvancedOpen={isAdvancedOpen}
        onAdvancedOpenChange={setIsAdvancedOpen}
        calculatedBudgetTotal={calculatedBudgetTotal}
        onSubmit={(event) => {
          void budgetForm.handleSubmit(handleSubmit)(event);
        }}
      />

      <BudgetDeleteAlert
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        onConfirm={() => pendingDeleteId && handleDelete(pendingDeleteId)}
      />

      <BudgetImportDialog
        open={isImportOpen}
        onOpenChange={setIsImportOpen}
        importJson={importJson}
        onImportJsonChange={setImportJson}
        isImporting={isImporting}
        onSubmit={handleImport}
      />

      <PaydaySplitDialog
        open={isSplitOpen}
        onOpenChange={setIsSplitOpen}
        month={month}
        categories={categories}
        splitIncome={splitIncome}
        onSplitIncomeChange={setSplitIncome}
        splitAllocations={splitAllocations}
        onAllocationChange={(categoryId, value) => setSplitAllocations((prev) => ({ ...prev, [categoryId]: value }))}
        isSplitting={isSplitting}
        onSubmit={handlePaydaySplit}
      />
    </div>
  );
}
