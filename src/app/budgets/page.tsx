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
import {
  formatCurrency,
  getCurrentMonth,
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
  alerts: BudgetAlert[];
}

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

  const [formData, setFormData] = useState({
    category_id: '',
    budget_amount: '',
    warning_percent: '80',
    daily_limit: '',
    frequency_limit: '',
    frequency_period: '',
  });

  const resetForm = () => {
    setFormData({
      category_id: '',
      budget_amount: '',
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

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setFormData({
      category_id: budget.category_id,
      budget_amount: String(budget.budget_amount),
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/budgets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category_id: formData.category_id,
          month,
          budget_amount: Number(formData.budget_amount),
          warning_percent: Number(formData.warning_percent),
          daily_limit: Number(formData.daily_limit) || 0,
          frequency_limit: Number(formData.frequency_limit) || 0,
          frequency_period: formData.frequency_period || '',
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
    <div className="pb-nav max-w-lg mx-auto min-h-screen bg-background text-foreground flex flex-col">
      <div className="p-4 flex items-center justify-between border-b border-border sticky top-0 bg-background/80 backdrop-blur-md z-10">
        <h1 className="text-xl font-bold">Ngân sách</h1>
        <MonthPicker month={month} onChange={setMonth} />
      </div>

      <div className="p-4 space-y-6 flex-1">
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
          <div className="flex gap-2">
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
        ) : (
          <div className="space-y-4">
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
                          <DropdownMenuTrigger
                            render={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full -mr-2"
                              >
                                <MoreVertical className="h-4 w-4 text-muted-foreground" />
                              </Button>
                            }
                          />
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
        )}
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
            onSubmit={handleSubmit}
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
                    <SelectValue placeholder="Chọn danh mục chi tiêu" />
                  </SelectTrigger>
                  <SelectContent
                    side="bottom"
                    align="start"
                    alignItemWithTrigger={false}
                    className="max-h-72 rounded-2xl p-1.5"
                  >
                    {categories
                      .filter((category) => category.name !== 'Thu nhập')
                      .map((category) => (
                        <SelectItem
                          key={category.id}
                          value={category.id}
                          className="min-h-12 rounded-xl px-2 py-2 text-sm font-medium"
                        >
                          <CategoryIcon
                            name={category.name}
                            color={category.color}
                            className="size-8 rounded-xl"
                            iconClassName="size-4"
                          />
                          {category.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold text-muted-foreground">
                  Mức chi trong tháng
                </Label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
                    đ
                  </span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    required
                    className="h-12 w-full rounded-xl bg-muted/40 pl-8 text-base font-semibold tabular-nums"
                    placeholder="Ví dụ: 3.900.000"
                    value={formData.budget_amount}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        budget_amount: e.target.value,
                      }))
                    }
                  />
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

              <details
                className="group rounded-2xl border border-border bg-card"
                open={isAdvancedOpen}
                onToggle={(event) =>
                  setIsAdvancedOpen(event.currentTarget.open)
                }
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 text-sm font-medium marker:content-none">
                  <span className="flex items-center gap-2">
                    <CalendarDays className="size-4 text-primary" />
                    Thêm giới hạn nâng cao
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-4 border-t border-border px-3 pb-3 pt-4">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">
                      Tối đa mỗi ngày
                    </Label>
                    <Input
                      type="number"
                      inputMode="numeric"
                      className="h-10 w-full rounded-xl bg-muted/40 tabular-nums"
                      placeholder="Ví dụ: 130.000đ"
                      value={formData.daily_limit}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          daily_limit: e.target.value,
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
                </div>
              </details>
            </div>

            <div className="border-t border-border bg-background px-5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
              <Button
                type="submit"
                className="h-12 w-full rounded-xl font-semibold"
                disabled={!formData.category_id || !formData.budget_amount}
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
