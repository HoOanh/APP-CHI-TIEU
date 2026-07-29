'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  Settings, 
  Wallet, 
  Activity, 
  MessageSquare,
  Banknote,
  BadgeAlert,
  TrendingDown,
  TrendingUp,
  Landmark
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  cn, 
  formatCurrency, 
  getCurrentMonth, 
  getPercentage, 
  getMonthLabel, 
  formatShortDate 
} from '@/lib/utils';

interface Stats {
  total: number;
  count: number;
  daily_average: number;
}

interface Budget {
  id: string;
  category_name: string;
  category_icon: string;
  category_color: string;
  budget_amount: number;
  spent_amount: number;
  warning_percent: number;
}

interface Expense {
  id: string;
  description: string;
  amount: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  date: string;
  type?: 'income' | 'expense';
}

export default function DashboardPage() {
  const [currentMonth] = useState(getCurrentMonth());
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [totalDebt, setTotalDebt] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    async function fetchData() {
      setIsLoading(true);
      try {
        const [statsRes, budgetsRes, expensesRes, debtsRes] = await Promise.all([
          fetch(`/api/expenses/stats?period=daily&month=${currentMonth}`).then(r => r.ok ? r.json() : null),
          fetch(`/api/budgets?month=${currentMonth}`).then(r => r.ok ? r.json() : []),
          fetch(`/api/expenses?month=${currentMonth}`).then(r => r.ok ? r.json() : null),
          fetch(`/api/debts`).then(r => r.ok ? r.json() : [])
        ]);

        if (statsRes) setStats(statsRes);
        if (budgetsRes) setBudgets(Array.isArray(budgetsRes) ? budgetsRes : []);
        if (expensesRes && Array.isArray(expensesRes.items)) {
          const allItems: Expense[] = expensesRes.items;
          setExpenses(allItems.slice(0, 5));

          let inc = 0;
          let exp = 0;
          allItems.forEach((item: Expense) => {
            const isInc = item.type === 'income' || (item.amount < 0 && item.type !== 'expense');
            if (isInc) {
              inc += Math.abs(item.amount);
            } else {
              exp += Math.abs(item.amount);
            }
          });

          setTotalIncome(inc);
          setTotalExpense(exp);
          setBalance(inc - exp);
        }
        
        if (Array.isArray(debtsRes)) {
          const remainingDebt = debtsRes.reduce((acc, curr) => acc + (curr.total_amount - (curr.paid_amount || 0)), 0);
          setTotalDebt(remainingDebt);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [currentMonth]);

  const warningBudgets = budgets.filter(b => {
    const percent = getPercentage(b.spent_amount, b.budget_amount);
    return percent >= (b.warning_percent || 80);
  });

  return (
    <div className="mx-auto min-h-screen max-w-7xl space-y-6 bg-background p-4 pb-nav text-foreground md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Xin chào 👋</h1>
          <p className="text-sm text-muted-foreground">{getMonthLabel(currentMonth)}</p>
        </div>
        <Link href="/settings" className="inline-flex items-center justify-center rounded-full h-9 w-9 hover:bg-accent transition-colors">
            <Settings className="w-5 h-5 text-muted-foreground" />
        </Link>
      </header>

      {/* Hero Card */}
      <Card className="border-border rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 border shadow-sm">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Số dư tháng này</p>
                {isLoading ? (
                  <Skeleton className="h-9 w-44 rounded mt-1" />
                ) : (
                  <h2 className={cn(
                    "text-3xl font-bold tabular-nums tracking-tight mt-1",
                    balance >= 0 ? "text-blue-600 dark:text-blue-400" : "text-rose-500"
                  )}>
                    {formatCurrency(balance)}
                  </h2>
                )}
              </div>
              <div className="w-10 h-10 rounded-2xl bg-white/80 dark:bg-slate-800 flex items-center justify-center text-blue-500 shadow-sm border border-emerald-100 dark:border-slate-700">
                <Wallet className="w-5 h-5" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-emerald-100/80 dark:border-slate-800">
              <div className="bg-white/60 dark:bg-slate-800/60 p-3 rounded-xl border border-emerald-100/50 dark:border-slate-700/50">
                <div className="flex items-center space-x-1.5 text-xs text-muted-foreground mb-1">
                  <TrendingUp className="w-3.5 h-3.5 text-[#00BC7C]" />
                  <span>Tổng thu</span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-6 w-24 rounded" />
                ) : (
                  <p className="text-base font-semibold tabular-nums text-[#00BC7C]">
                    +{formatCurrency(totalIncome)}
                  </p>
                )}
              </div>
              
              <div className="bg-white/60 dark:bg-slate-800/60 p-3 rounded-xl border border-emerald-100/50 dark:border-slate-700/50">
                <div className="flex items-center space-x-1.5 text-xs text-muted-foreground mb-1">
                  <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                  <span>Tổng chi</span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-6 w-24 rounded" />
                ) : (
                  <p className="text-base font-semibold tabular-nums text-rose-500">
                    -{formatCurrency(totalExpense)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <Activity className="w-4 h-4" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs text-muted-foreground truncate">TB chi/ngày</p>
              {isLoading ? <Skeleton className="h-5 w-20 rounded" /> : <p className="font-semibold tabular-nums truncate">{formatCurrency(stats?.daily_average || 0)}</p>}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardContent className="p-4 flex items-center space-x-3">
            <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
              <Landmark className="w-4 h-4" />
            </div>
            <div className="overflow-hidden">
              <p className="text-xs text-muted-foreground truncate">Tổng nợ</p>
              {isLoading ? <Skeleton className="h-5 w-20 rounded" /> : <p className="font-semibold tabular-nums truncate text-amber-600">{formatCurrency(totalDebt)}</p>}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Budget Alerts */}
      {!isLoading && warningBudgets.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center space-x-2">
            <BadgeAlert className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold">Cảnh báo ngân sách</h3>
          </div>
          <div className="space-y-3">
            {warningBudgets.map(budget => {
              const percent = getPercentage(budget.spent_amount, budget.budget_amount);
              let progressColor = "bg-emerald-500";
              if (percent >= 80) progressColor = "bg-rose-500";
              else if (percent >= 60) progressColor = "bg-amber-500";

              return (
                <Card key={budget.id || budget.category_name} className="rounded-2xl border-border bg-card shadow-sm">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <span className="text-xl">{budget.category_icon || '💰'}</span>
                        <span className="font-medium text-sm">{budget.category_name}</span>
                      </div>
                      <span className="text-xs font-semibold tabular-nums">
                        {percent}%
                      </span>
                    </div>
                    <Progress value={Math.min(percent, 100)} className="h-2" indicatorColor={progressColor} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Đã chi: <span className="text-foreground">{formatCurrency(budget.spent_amount)}</span></span>
                      <span>Ngân sách: {formatCurrency(budget.budget_amount)}</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>
      )}

      {/* Recent Expenses */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4 text-muted-foreground" />
            Giao dịch gần đây
          </h3>
          <Link href="/expenses" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Xem tất cả
          </Link>
        </div>
        
        <Card className="rounded-2xl border-border bg-card shadow-sm">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <Skeleton className="w-10 h-10 rounded-full" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </div>
                    <Skeleton className="h-4 w-20" />
                  </div>
                ))}
              </div>
            ) : expenses.length > 0 ? (
              <div className="divide-y divide-border">
                {expenses.map((expense) => {
                  const isIncome = expense.type === 'income' || (expense.amount < 0 && expense.type !== 'expense');
                  const absAmount = Math.abs(expense.amount);
                  return (
                    <div key={expense.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-center space-x-3">
                        <div 
                          className="w-10 h-10 rounded-full flex items-center justify-center text-lg shrink-0"
                          style={{ backgroundColor: expense.category_color ? `${expense.category_color}15` : '#f3f4f6' }}
                        >
                          {expense.category_icon || (isIncome ? '💰' : '🏷️')}
                        </div>
                        <div className="overflow-hidden">
                          <p className="font-medium text-sm truncate">{expense.description || expense.category_name}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{formatShortDate(expense.date)}</p>
                        </div>
                      </div>
                      <span className={cn(
                        "font-semibold tabular-nums shrink-0 ml-4",
                        isIncome ? "text-[#00BC7C]" : "text-rose-500"
                      )}>
                        {isIncome ? `+${formatCurrency(absAmount)}` : `-${formatCurrency(absAmount)}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Chưa có giao dịch nào trong tháng này.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Quick Actions */}
      <section className="grid grid-cols-2 gap-3 pt-2">
        <Link href="/chat" className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-2xl">
          <Card className="rounded-2xl border-border bg-card hover:bg-muted/50 transition-colors h-full shadow-sm">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2 h-full">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-sm">Ghi nhận chi tiêu</p>
                <p className="text-xs text-muted-foreground mt-1">Qua chat AI</p>
              </div>
            </CardContent>
          </Card>
        </Link>
        
        <Link href="/debt-chat" className="block focus:outline-none focus:ring-2 focus:ring-ring rounded-2xl">
          <Card className="rounded-2xl border-border bg-card hover:bg-muted/50 transition-colors h-full shadow-sm">
            <CardContent className="p-4 flex flex-col items-center justify-center text-center space-y-2 h-full">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <p className="font-medium text-sm">Trả nợ nhanh</p>
                <p className="text-xs text-muted-foreground mt-1">Quản lý khoản vay</p>
              </div>
            </CardContent>
          </Card>
        </Link>
      </section>
    </div>
  );
}
