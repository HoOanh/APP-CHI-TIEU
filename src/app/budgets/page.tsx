'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MonthPicker } from '@/components/MonthPicker';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, getCurrentMonth, getPercentage, cn } from '@/lib/utils';
import { Plus, Copy, Trash2, MoreVertical, Wallet, AlertTriangle, Clock, CalendarDays, Edit } from 'lucide-react';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: string;
}

interface BudgetAlert {
  type: string;
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
    setFormData({ category_id: '', budget_amount: '', warning_percent: '80', daily_limit: '', frequency_limit: '', frequency_period: '' });
    setEditingBudget(null);
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

  const totalBudget = budgets.reduce((acc, curr) => acc + curr.budget_amount, 0);
  const totalSpent = budgets.reduce((acc, curr) => acc + curr.spent_amount, 0);
  const overallPercentage = getPercentage(totalSpent, totalBudget);
  const remaining = totalBudget - totalSpent;

  const handleEdit = (budget: Budget) => {
    setEditingBudget(budget);
    setFormData({
      category_id: budget.category_id,
      budget_amount: String(budget.budget_amount),
      warning_percent: String(budget.warning_percent),
      daily_limit: budget.daily_limit ? String(budget.daily_limit) : '',
      frequency_limit: budget.frequency_limit ? String(budget.frequency_limit) : '',
      frequency_period: budget.frequency_period || '',
    });
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
        showToast(editingBudget ? 'Cập nhật thành công' : 'Thêm ngân sách thành công', 'success');
        setIsDialogOpen(false);
        resetForm();
        fetchBudgets();
      }
    } catch (error) {
      console.error('Error saving budget:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa ngân sách này?')) return;
    try {
      const res = await fetch(`/api/budgets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('Đã xóa ngân sách', 'success');
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

  const getFreqLabel = (period: string): string => {
    switch (period) {
      case 'day': return '/ngày';
      case 'week': return '/tuần';
      case 'month': return '/tháng';
      default: return '';
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
                <p className="text-3xl font-bold tabular-nums text-foreground">{formatCurrency(totalSpent)}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  trên tổng {formatCurrency(totalBudget)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-muted-foreground">Còn lại</p>
                <p className={cn("text-lg font-semibold tabular-nums", remaining < 0 ? "text-rose-500" : "text-emerald-500")}>
                  {formatCurrency(remaining)}
                </p>
              </div>
            </div>
            
            <Progress 
              value={overallPercentage} 
              className="h-3 rounded-full bg-secondary"
              indicatorColor={cn(
                "rounded-full transition-all duration-500",
                overallPercentage >= 100 ? "bg-rose-500" : overallPercentage >= 80 ? "bg-amber-500" : "bg-emerald-500"
              )}
            />
            <div className="flex justify-between mt-2 text-xs text-muted-foreground font-medium">
              <span>0%</span>
              <span>{Math.round(overallPercentage)}%</span>
            </div>
          </CardContent>
        </Card>

        {/* Budget jars header */}
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">Hũ chi tiêu</h2>
          <Button variant="outline" size="sm" onClick={handleCopy} className="rounded-xl h-8 text-xs font-medium border-border">
            <Copy className="w-3 h-3 mr-1.5" />
            Sao chép tháng trước
          </Button>
        </div>

        {/* Budget jars list */}
        {isLoading ? (
          <div className="flex justify-center p-8 text-muted-foreground">Đang tải...</div>
        ) : budgets.length === 0 ? (
          <div className="text-center p-8 border border-dashed border-border rounded-2xl bg-card/50">
            <p className="text-muted-foreground mb-4">Chưa có ngân sách nào trong tháng này</p>
            <Button onClick={() => { resetForm(); setIsDialogOpen(true); }} className="rounded-xl">Tạo ngân sách đầu tiên</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {budgets.map((budget) => {
              const pct = getPercentage(budget.spent_amount, budget.budget_amount);
              const isWarning = pct >= budget.warning_percent && pct < 100;
              const isOver = pct >= 100;
              const hasLimits = budget.daily_limit > 0 || budget.frequency_limit > 0;
              
              return (
                <Card key={budget.id} className="rounded-2xl border-border bg-card overflow-hidden shadow-sm">
                  <CardContent className="p-4">
                    {/* Header row */}
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
                          style={{ backgroundColor: `${budget.category_color}20` }}
                        >
                          {budget.category_icon}
                        </div>
                        <div>
                          <p className="font-medium">{budget.category_name}</p>
                          <p className="text-xs text-muted-foreground tabular-nums">
                            {formatCurrency(budget.spent_amount)} / {formatCurrency(budget.budget_amount)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className={cn(
                          "rounded-lg font-semibold tabular-nums",
                          isOver ? "bg-rose-500/10 text-rose-500" : 
                          isWarning ? "bg-amber-500/10 text-amber-500" : 
                          "bg-emerald-500/10 text-emerald-500"
                        )}>
                          {Math.round(pct)}%
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger render={
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full -mr-2">
                              <MoreVertical className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          } />
                          <DropdownMenuContent align="end" className="rounded-xl">
                            <DropdownMenuItem onClick={() => handleEdit(budget)} className="rounded-lg cursor-pointer">
                              <Edit className="w-4 h-4 mr-2" /> Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleDelete(budget.id)} className="text-rose-500 rounded-lg focus:text-rose-500 focus:bg-rose-500/10 cursor-pointer">
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
                        "rounded-full transition-all duration-500",
                        isOver ? "bg-rose-500" : isWarning ? "bg-amber-500" : "bg-emerald-500"
                      )}
                    />

                    {/* Limit badges */}
                    {hasLimits && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {budget.daily_limit > 0 && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-blue-500/10 text-blue-600 text-[11px] font-medium">
                            <CalendarDays className="w-3 h-3" />
                            <span>{formatCurrency(budget.daily_limit)}/ngày</span>
                            {budget.today_spent > 0 && (
                              <span className={cn("ml-1", budget.today_spent >= budget.daily_limit ? "text-rose-500" : "")}>
                                ({formatCurrency(budget.today_spent)} đã chi)
                              </span>
                            )}
                          </div>
                        )}
                        {budget.frequency_limit > 0 && budget.frequency_period && (
                          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-purple-500/10 text-purple-600 text-[11px] font-medium">
                            <Clock className="w-3 h-3" />
                            <span>{budget.frequency_limit} lần{getFreqLabel(budget.frequency_period)}</span>
                            <span className="ml-1">
                              ({budget.frequency_period === 'week' ? budget.week_count : 
                                budget.frequency_period === 'month' ? budget.month_count : 
                                budget.today_count} đã chi)
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Alert badges */}
                    {budget.alerts && budget.alerts.length > 0 && (
                      <div className="space-y-1.5 mt-3">
                        {budget.alerts.map((alert, idx) => (
                          <div key={idx} className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium",
                            alert.severity === 'danger' ? "bg-rose-500/10 text-rose-600" : "bg-amber-500/10 text-amber-600"
                          )}>
                            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                            {alert.message}
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
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
        <DialogTrigger render={
          <Button 
            className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-lg shadow-primary/25 z-50 p-0"
            size="icon"
          >
            <Plus className="w-6 h-6" />
          </Button>
        } />
        <DialogContent className="rounded-2xl max-w-[90vw] w-[400px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBudget ? 'Chỉnh sửa ngân sách' : 'Thêm hũ chi tiêu'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-4">
            {/* Category */}
            <div className="space-y-2">
              <Label>Danh mục</Label>
              <Select 
                value={formData.category_id} 
                onValueChange={(val) => setFormData(prev => ({ ...prev, category_id: val ?? '' }))}
                disabled={!!editingBudget}
              >
                <SelectTrigger className="rounded-xl h-12">
                  <SelectValue placeholder="Chọn danh mục" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="rounded-lg">
                      <div className="flex items-center gap-2">
                        <span>{c.icon}</span> {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Monthly budget */}
            <div className="space-y-2">
              <Label>Ngân sách tháng (đ)</Label>
              <Input 
                type="number" 
                required
                className="rounded-xl h-12 tabular-nums"
                placeholder="Ví dụ: 3900000"
                value={formData.budget_amount}
                onChange={(e) => setFormData(prev => ({ ...prev, budget_amount: e.target.value }))}
              />
            </div>
            
            {/* Warning percent */}
            <div className="space-y-2">
              <Label>Cảnh báo khi vượt quá (%)</Label>
              <Input 
                type="number" 
                min="1" max="100"
                required
                className="rounded-xl h-12 tabular-nums"
                value={formData.warning_percent}
                onChange={(e) => setFormData(prev => ({ ...prev, warning_percent: e.target.value }))}
              />
            </div>

            {/* Divider */}
            <div className="border-t border-border pt-4">
              <p className="text-sm font-semibold text-foreground mb-1">Giới hạn nâng cao</p>
              <p className="text-xs text-muted-foreground mb-3">Thiết lập giới hạn chi tiêu theo ngày hoặc tần suất</p>
            </div>

            {/* Daily limit */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-blue-500" />
                Giới hạn chi/ngày (đ)
              </Label>
              <Input 
                type="number" 
                className="rounded-xl h-12 tabular-nums"
                placeholder="VD: 130000 (130k/ngày cho Ăn)"
                value={formData.daily_limit}
                onChange={(e) => setFormData(prev => ({ ...prev, daily_limit: e.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">Cảnh báo khi chi vượt giới hạn mỗi ngày. VD: Ăn 130k/ngày × 30 ngày = 3.9tr/tháng</p>
            </div>

            {/* Frequency limit */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-500" />
                Giới hạn số lần
              </Label>
              <div className="flex gap-2">
                <Input 
                  type="number"
                  min="0"
                  className="rounded-xl h-12 tabular-nums flex-1"
                  placeholder="VD: 2"
                  value={formData.frequency_limit}
                  onChange={(e) => setFormData(prev => ({ ...prev, frequency_limit: e.target.value }))}
                />
                <Select 
                  value={formData.frequency_period} 
                  onValueChange={(val) => setFormData(prev => ({ ...prev, frequency_period: val ?? '' }))}
                >
                  <SelectTrigger className="rounded-xl h-12 w-[140px]">
                    <SelectValue placeholder="Chu kỳ" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    <SelectItem value="day" className="rounded-lg">/ ngày</SelectItem>
                    <SelectItem value="week" className="rounded-lg">/ tuần</SelectItem>
                    <SelectItem value="month" className="rounded-lg">/ tháng</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-[11px] text-muted-foreground">VD: Thể thao 2/tuần, Nhậu 2/tháng</p>
            </div>
            
            <Button type="submit" className="w-full h-12 rounded-xl mt-2 font-semibold" disabled={!formData.category_id || !formData.budget_amount}>
              {editingBudget ? 'Cập nhật' : 'Lưu ngân sách'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
