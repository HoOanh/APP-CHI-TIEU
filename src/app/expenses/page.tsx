'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { MonthPicker } from '@/components/MonthPicker';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ReceiptText, Trash2 } from 'lucide-react';
import { cn, formatCurrency, formatShortDate, getCurrentMonth } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { ManualTransactionDialog } from '@/components/ManualTransactionDialog';

interface Category { id: string; name: string; color: string; }
interface Expense { id: string; amount: number; description: string; note: string | null; date: string; category: Category; type: 'income' | 'expense'; }

export default function ExpensesPage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { showToast } = useToast();

  const fetchCategories = useCallback(async () => {
    const response = await fetch('/api/categories');
    if (response.ok) setCategories(await response.json());
  }, []);

  const fetchExpenses = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ month });
      if (activeCategoryId !== 'all') params.set('category_id', activeCategoryId);
      const response = await fetch(`/api/expenses?${params}`);
      if (!response.ok) throw new Error('Failed to load expenses');
      const data: { items: Record<string, unknown>[]; total: number; totalIncome: number; totalExpense: number } = await response.json();
      setExpenses((data.items ?? []).map((item) => ({
        id: String(item.id), amount: Number(item.amount) || 0, description: String(item.description || ''),
        note: item.note ? String(item.note) : null, date: String(item.expense_date || ''),
        type: item.type === 'income' ? 'income' : 'expense',
        category: { id: String(item.category_id || ''), name: String(item.category_name || 'Khác'), color: String(item.category_color || '#8493a3') },
      })));
      setTotalAmount(Number(data.total) || 0);
      setTotalIncome(Number(data.totalIncome) || 0);
      setTotalExpense(Number(data.totalExpense) || 0);
    } catch (error) {
      console.error(error);
      showToast('Không thể tải giao dịch', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [activeCategoryId, month, showToast]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCategories().catch(console.error);
  }, [fetchCategories]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchExpenses();
  }, [fetchExpenses]);

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      const response = await fetch(`/api/expenses/${pendingDeleteId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete expense');
      setPendingDeleteId(null);
      showToast('Đã xóa giao dịch', 'success');
      fetchExpenses();
    } catch (error) {
      console.error(error);
      showToast('Không thể xóa giao dịch', 'error');
    }
  };

  const { groups, dates } = useMemo(() => {
    const nextGroups = expenses.reduce<Record<string, { net: number; items: Expense[] }>>((result, expense) => {
      const date = expense.date.split('T')[0] || expense.date;
      const group = result[date] ?? { net: 0, items: [] };
      group.items.push(expense);
      group.net += expense.type === 'income' ? expense.amount : -expense.amount;
      result[date] = group;
      return result;
    }, {});

    return {
      groups: nextGroups,
      dates: Object.keys(nextGroups).sort((a, b) => b.localeCompare(a)),
    };
  }, [expenses]);

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl bg-[#f7f9fb] pb-nav">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-[#f7f9fb]/95 px-4 pb-3 pt-4 backdrop-blur-xl md:px-8 md:pb-5 md:pt-6">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#00a970]">Dòng tiền</p><h1 className="mt-0.5 text-lg font-semibold tracking-[-0.03em] text-slate-800">Chi tiêu & thu nhập</h1></div>
          <div className="flex flex-wrap items-center justify-end gap-2"><MonthPicker month={month} onChange={setMonth} /><ManualTransactionDialog compact onSaved={() => fetchExpenses()} /></div>
        </div>
        <section className="mt-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3.5 md:mt-5 md:grid md:grid-cols-[minmax(0,1fr)_minmax(20rem,0.85fr)] md:items-center md:gap-8 md:px-6 md:py-5">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400">Số dư ròng tháng này</p>
            <p className={cn('mt-1 text-[27px] font-semibold leading-none tracking-[-0.05em] tabular-nums', totalAmount >= 0 ? 'text-[#00a970]' : 'text-[#f15b64]')}>{totalAmount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(totalAmount))}</p>
          </div>
          <div className="mt-3 grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 pt-3 md:mt-0 md:border-t-0 md:pt-0">
            <SummaryItem label="Tổng thu" value={totalIncome} tone="income" />
            <SummaryItem label="Tổng chi" value={totalExpense} tone="expense" className="pl-4" />
          </div>
        </section>
        <div className="relative mt-3">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pr-7">
            <FilterChip active={activeCategoryId === 'all'} label="Tất cả" onClick={() => setActiveCategoryId('all')} />
            {categories.map((category) => <FilterChip key={category.id} active={activeCategoryId === category.id} label={category.name} color={category.color} onClick={() => setActiveCategoryId(category.id)} />)}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#f7f9fb] to-transparent" />
        </div>
      </header>

      <main className="space-y-5 px-4 py-5 md:px-8 md:py-7">
        {isLoading ? <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-200/70" />)}</div> : null}
        {!isLoading && dates.length === 0 ? <EmptyTransactions /> : null}
        {!isLoading && dates.length > 0 ? <>
          <div className="space-y-5 xl:hidden">{dates.map((date) => <TransactionGroup key={date} date={date} group={groups[date]} onDelete={setPendingDeleteId} onSaved={fetchExpenses} />)}</div>
          <section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white xl:block">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4"><div><h2 className="font-semibold text-slate-800">Giao dịch trong tháng</h2><p className="mt-0.5 text-xs text-slate-400">{expenses.length} giao dịch</p></div><p className="text-sm font-semibold tabular-nums text-slate-600">Ròng {formatCurrency(totalAmount)}</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3 font-medium">Ngày</th><th className="px-4 py-3 font-medium">Danh mục</th><th className="px-4 py-3 font-medium">Mô tả</th><th className="px-4 py-3 font-medium">Ghi chú</th><th className="px-6 py-3 text-right font-medium">Số tiền</th><th className="w-24 px-4 py-3 text-right font-medium">Thao tác</th></tr></thead><tbody className="divide-y divide-slate-100">{dates.flatMap((date) => groups[date].items.map((expense) => <tr key={expense.id} className="group hover:bg-slate-50/70"><td className="whitespace-nowrap px-6 py-3.5 text-slate-500">{formatShortDate(date)}</td><td className="px-4 py-3.5"><span className="inline-flex items-center gap-2"><CategoryIcon name={expense.category.name} color={expense.category.color} className="size-8 rounded-lg" iconClassName="size-3.5"/><span className="text-slate-700">{expense.category.name}</span></span></td><td className="max-w-[22rem] truncate px-4 py-3.5 font-medium text-slate-800">{expense.description}</td><td className="max-w-[18rem] truncate px-4 py-3.5 text-slate-400">{expense.note || '—'}</td><td className={cn('whitespace-nowrap px-6 py-3.5 text-right font-semibold tabular-nums', expense.type === 'income' ? 'text-[#00a970]' : 'text-[#f15b64]')}>{expense.type === 'income' ? '+' : '−'}{formatCurrency(expense.amount)}</td><td className="px-4 py-2"><div className="flex justify-end gap-1"><ManualTransactionDialog compact transaction={{ ...expense, category_id: expense.category.id, date: expense.date }} onSaved={fetchExpenses} /><Button type="button" variant="ghost" size="icon-sm" onClick={() => setPendingDeleteId(expense.id)} className="text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100" aria-label={`Xóa ${expense.description}`}><Trash2 className="size-4" /></Button></div></td></tr>))}</tbody></table></div>
          </section>
        </> : null}
      </main>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Xóa giao dịch?</AlertDialogTitle><AlertDialogDescription>Giao dịch sẽ bị xóa khỏi số dư và báo cáo ngân sách.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Hủy</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={handleDelete}>Xóa giao dịch</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SummaryItem({ label, value, tone, className }: { label: string; value: number; tone: 'income' | 'expense'; className?: string }) {
  return <div className={cn('min-w-0', className)}><p className="text-[11px] text-slate-400">{label}</p><p className={cn('mt-0.5 truncate text-sm font-semibold tabular-nums', tone === 'income' ? 'text-[#00a970]' : 'text-[#f15b64]')}>{tone === 'income' ? '+' : '−'}{formatCurrency(value)}</p></div>;
}

function FilterChip({ active, label, color, onClick }: { active: boolean; label: string; color?: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn('flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors', active ? 'border-[#00bc7c] bg-[#00bc7c] text-white' : 'border-slate-200 bg-white text-slate-600')}>
    {color ? <span className="size-1.5 rounded-full" style={{ backgroundColor: active ? 'white' : color }} /> : null}{label}
  </button>;
}

function TransactionGroup({ date, group, onDelete, onSaved }: { date: string; group: { net: number; items: Expense[] }; onDelete: (id: string) => void; onSaved: () => void }) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5"><p className="text-xs font-semibold text-slate-600">{formatShortDate(date)}</p><p className={cn('text-xs font-semibold tabular-nums', group.net >= 0 ? 'text-[#00a970]' : 'text-[#f15b64]')}>{group.net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(group.net))}</p></div>
    <div className="divide-y divide-slate-100">{group.items.map((expense) => <TransactionRow key={expense.id} expense={expense} onDelete={() => onDelete(expense.id)} onSaved={onSaved} />)}</div>
  </section>;
}

function TransactionRow({ expense, onDelete, onSaved }: { expense: Expense; onDelete: () => void; onSaved: () => void }) {
  return <div className="group flex min-w-0 items-center gap-3 px-3.5 py-3">
    <CategoryIcon name={expense.category.name} color={expense.category.color} className="size-9 rounded-xl" iconClassName="size-4" />
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700">{expense.description}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{expense.note || expense.category.name}</p></div>
    <p className={cn('shrink-0 whitespace-nowrap text-[13px] font-semibold tabular-nums', expense.type === 'income' ? 'text-[#00a970]' : 'text-[#f15b64]')}>{expense.type === 'income' ? '+' : '−'}{formatCurrency(expense.amount)}</p>
    <div className="ml-0.5 flex shrink-0 items-center gap-0.5"><ManualTransactionDialog compact transaction={{ ...expense, category_id: expense.category.id, date: expense.date }} onSaved={onSaved} /><Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} className="text-slate-300 hover:bg-rose-50 hover:text-[#f15b64]" aria-label={`Xóa ${expense.description}`}><Trash2 className="size-3.5" /></Button></div>
  </div>;
}

function EmptyTransactions() {
  return <div className="flex flex-col items-center py-20 text-center"><span className="flex size-14 items-center justify-center rounded-3xl bg-emerald-50 text-[#00bc7c]"><ReceiptText className="size-6" /></span><h2 className="mt-4 text-base font-semibold text-slate-700">Chưa có giao dịch</h2><p className="mt-1 max-w-56 text-sm leading-5 text-slate-400">Dùng nút Ghi nhanh ở giữa thanh điều hướng để thêm giao dịch.</p></div>;
}
