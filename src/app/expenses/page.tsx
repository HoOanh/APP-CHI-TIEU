'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { MonthPicker } from '@/components/MonthPicker';
import { CategoryIcon } from '@/components/CategoryIcon';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRightLeft, Download, Hash, LoaderCircle, Plus, ReceiptText, Search, Trash2, Wallet } from 'lucide-react';
import { cn, formatCurrency, formatShortDate, getCurrentMonth } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { ManualTransactionDialog } from '@/components/ManualTransactionDialog';
import { Input } from '@/components/ui/input';
import { onTransactionsChanged } from '@/lib/transaction-events';

interface Category { id: string; name: string; icon?: string; color: string; }
interface AccountOption { id: number; name: string; }
interface TagItem { id: number; name: string; color: string; }
interface Expense {
  id: string;
  amount: number;
  description: string;
  note: string | null;
  date: string;
  category: Category;
  account_id: number | null;
  to_account_id: number | null;
  account_name: string | null;
  to_account_name: string | null;
  created_by_name: string | null;
  reimburse_status: 'none' | 'pending' | 'settled';
  tags: TagItem[];
  type: 'income' | 'expense' | 'transfer';
  in_budget_jar?: boolean;
}

interface LedgerBadgeInfo {
  id: number;
  name: string;
  kind: 'personal' | 'family' | 'business';
  role: 'owner' | 'editor' | 'viewer';
  isShared: boolean;
}

function mapExpenseRow(item: Record<string, unknown>): Expense {
  const rawTags = Array.isArray(item.tags) ? item.tags : [];
  const tags: TagItem[] = rawTags.flatMap((t) => {
    if (!t || typeof t !== 'object') return [];
    const rec = t as Record<string, unknown>;
    return [{
      id: Number(rec.id) || 0,
      name: String(rec.name || ''),
      color: String(rec.color || '#64748b'),
    }];
  });
  const reimburseRaw = item.reimburse_status;
  const reimburse_status: 'none' | 'pending' | 'settled' =
    reimburseRaw === 'pending' || reimburseRaw === 'settled' ? reimburseRaw : 'none';

  return {
    id: String(item.id),
    amount: Number(item.amount) || 0,
    description: String(item.description || ''),
    note: item.note ? String(item.note) : null,
    date: String(item.expense_date || ''),
    type: item.type === 'income' ? 'income' : item.type === 'transfer' ? 'transfer' : 'expense',
    account_id: item.account_id ? Number(item.account_id) : null,
    to_account_id: item.to_account_id ? Number(item.to_account_id) : null,
    account_name: item.account_name ? String(item.account_name) : null,
    to_account_name: item.to_account_name ? String(item.to_account_name) : null,
    created_by_name: item.created_by_name ? String(item.created_by_name) : null,
    reimburse_status,
    tags,
    in_budget_jar: item.in_budget_jar === undefined ? undefined : Number(item.in_budget_jar) === 1,
    category: {
      id: String(item.category_id || ''),
      name: String(item.category_name || 'Chưa phân loại'),
      icon: item.category_icon ? String(item.category_icon) : undefined,
      color: String(item.category_color || '#64748B'),
    },
  };
}

export default function ExpensesPage() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [activeType, setActiveType] = useState<'all' | 'expense' | 'income' | 'transfer'>('all');
  const [activeAccountId, setActiveAccountId] = useState<string>(() => {
    if (typeof window === 'undefined') return 'all';
    const param = new URLSearchParams(window.location.search).get('account_id');
    return param && /^\d+$/.test(param) ? param : 'all';
  });
  const [search, setSearch] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [loadError, setLoadError] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setActiveSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [availableTags, setAvailableTags] = useState<TagItem[]>([]);
  const [activeTag, setActiveTag] = useState('all');
  const [activeReimburse, setActiveReimburse] = useState<'all' | 'pending' | 'settled'>('all');
  const [onlyUnplanned, setOnlyUnplanned] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('unplanned') === '1';
  });
  const [totalAmount, setTotalAmount] = useState(0);
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [ledgerInfo, setLedgerInfo] = useState<LedgerBadgeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const { showToast } = useToast();

  const buildFilterParams = useCallback((cursor?: string | null) => {
    const params = new URLSearchParams({ month, limit: '50' });
    if (activeCategoryId !== 'all') params.set('category_id', activeCategoryId);
    if (activeType !== 'all') params.set('type', activeType);
    if (activeAccountId !== 'all') params.set('account_id', activeAccountId);
    if (activeTag !== 'all') params.set('tag', activeTag);
    if (activeReimburse !== 'all') params.set('reimburse_status', activeReimburse);
    if (onlyUnplanned) params.set('unplanned', '1');
    if (activeSearch) params.set('search', activeSearch);
    if (cursor) params.set('cursor', cursor);
    return params;
  }, [activeAccountId, activeCategoryId, activeReimburse, activeSearch, activeTag, activeType, month, onlyUnplanned]);

  const refreshTags = useCallback(async () => {
    const res = await fetch('/api/tags').catch(() => null);
    if (res?.ok) {
      const json = await res.json() as { tags?: TagItem[] };
      setAvailableTags(json.tags ?? []);
    }
  }, []);

  const fetchExpenses = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    const { signal } = controller;
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(`/api/expenses?${buildFilterParams()}`, { signal });
      if (!response.ok) throw new Error('Failed to load expenses');
      const data: {
        items: Record<string, unknown>[];
        total: number;
        totalIncome: number;
        totalExpense: number;
        nextCursor?: string | null;
        ledger?: LedgerBadgeInfo;
      } = await response.json();
      if (signal.aborted) return;
      setExpenses((data.items ?? []).map(mapExpenseRow));
      setTotalAmount(Number(data.total) || 0);
      setTotalIncome(Number(data.totalIncome) || 0);
      setTotalExpense(Number(data.totalExpense) || 0);
      setNextCursor(data.nextCursor ?? null);
      if (data.ledger) setLedgerInfo(data.ledger);
    } catch {
      if (!signal.aborted) setLoadError(true);
    } finally {
      if (!signal.aborted) setIsLoading(false);
    }
  }, [buildFilterParams]);

  const loadMore = async () => {
    if (!nextCursor || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`/api/expenses?${buildFilterParams(nextCursor)}`);
      if (!response.ok) throw new Error('Failed to load more');
      const data: {
        items: Record<string, unknown>[];
        nextCursor?: string | null;
      } = await response.json();
      setExpenses((current) => [...current, ...(data.items ?? []).map(mapExpenseRow)]);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      showToast('Không thể tải thêm giao dịch', 'error');
    } finally {
      setIsLoadingMore(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/categories'), fetch('/api/accounts'), fetch('/api/tags')])
      .then(async ([catRes, accRes, tagRes]) => {
        if (!active) return;
        if (catRes.ok) setCategories(await catRes.json() as Category[]);
        if (accRes.ok) setAccounts(await accRes.json() as AccountOption[]);
        if (tagRes.ok) {
          const json = await tagRes.json() as { tags?: TagItem[] };
          setAvailableTags(json.tags ?? []);
        }
      })
      .catch(console.error);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;

    fetch(`/api/expenses?${buildFilterParams()}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load expenses');
        return response.json() as Promise<{
          items: Record<string, unknown>[];
          total: number;
          totalIncome: number;
          totalExpense: number;
          nextCursor?: string | null;
          ledger?: LedgerBadgeInfo;
        }>;
      })
      .then((data) => {
        if (!active || controller.signal.aborted) return;
        setExpenses((data.items ?? []).map(mapExpenseRow));
        setTotalAmount(Number(data.total) || 0);
        setTotalIncome(Number(data.totalIncome) || 0);
        setTotalExpense(Number(data.totalExpense) || 0);
        setNextCursor(data.nextCursor ?? null);
        if (data.ledger) setLedgerInfo(data.ledger);
        setLoadError(false);
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
  }, [buildFilterParams]);

  useEffect(() => onTransactionsChanged(() => void fetchExpenses()), [fetchExpenses]);

  const handleDelete = async () => {
    if (!pendingDeleteId) return;
    try {
      const response = await fetch(`/api/expenses/${pendingDeleteId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete expense');
      setPendingDeleteId(null);
      showToast('Đã xóa giao dịch', 'success');
      void fetchExpenses();
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
      if (expense.type === 'income') group.net += expense.amount;
      else if (expense.type === 'expense') group.net -= expense.amount;
      result[date] = group;
      return result;
    }, {});

    return {
      groups: nextGroups,
      dates: Object.keys(nextGroups).sort((a, b) => b.localeCompare(a)),
    };
  }, [expenses]);

  const isViewer = ledgerInfo?.role === 'viewer';
  const showCreatorBadge = Boolean(ledgerInfo?.isShared);

  const toggleReimburseStatus = async (expense: Expense) => {
    if (isViewer || expense.type === 'transfer') return;
    const nextStatus: 'pending' | 'settled' = expense.reimburse_status === 'pending' ? 'settled' : 'pending';
    try {
      const res = await fetch(`/api/expenses/${expense.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reimburse_status: nextStatus }),
      });
      if (!res.ok) throw new Error('Không thể cập nhật trạng thái hoàn ứng.');
      setExpenses((current) => current.map((item) => item.id === expense.id ? { ...item, reimburse_status: nextStatus } : item));
      showToast(nextStatus === 'settled' ? 'Đã đánh dấu hoàn ứng' : 'Đã chuyển sang chờ hoàn ứng', 'success');
    } catch {
      showToast('Không thể cập nhật hoàn ứng', 'error');
    }
  };

  return (
    <div className="mx-auto min-h-screen w-full max-w-7xl bg-[#f7f9fb] pb-nav">
      <header className="sticky top-0 z-20 border-b border-slate-200/90 bg-[#f7f9fb]/95 px-4 pb-3.5 pt-4 backdrop-blur-xl md:px-8 md:pb-5 md:pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#00a970]">
              <span className="size-1.5 rounded-full bg-[#00bc7c]" />
              Dòng tiền{ledgerInfo?.name ? ` · ${ledgerInfo.name}` : ''}
            </span>
            <h1 className="mt-0.5 truncate text-xl font-bold tracking-[-0.03em] text-slate-900 md:text-2xl">
              Chi tiêu &amp; thu nhập
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <MonthPicker month={month} onChange={setMonth} className="hidden md:inline-flex" />
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label="Xuất CSV"
              className="size-9 rounded-full border-slate-200 bg-white px-0 text-xs text-slate-600 shadow-2xs hover:bg-slate-50 sm:h-9 sm:w-auto sm:rounded-xl sm:px-3"
              onClick={() => window.open(`/api/export?format=csv&month=${month}`, '_blank')}
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Xuất CSV</span>
            </Button>
            {isViewer ? (
              <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800">
                Chỉ xem
              </span>
            ) : (
              <ManualTransactionDialog compact iconOnMobile onSaved={() => { void fetchExpenses(); void refreshTags(); }} />
            )}
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2 md:hidden">
          <MonthPicker month={month} onChange={setMonth} className="h-9 rounded-xl bg-white" />
          {!isViewer ? (
            <Link
              href="/chat"
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-[#00b878] px-3.5 text-xs font-semibold text-white shadow-xs transition hover:bg-[#00a36c]"
            >
              <Plus className="size-3.5" />
              Ghi nhanh
            </Link>
          ) : null}
        </div>

        <section className="mt-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3.5 md:mt-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(20rem,0.85fr)] md:items-center md:gap-8 md:px-6 md:py-5">
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400">Số dư ròng tháng này</p>
            <p className={cn('mt-1 text-[27px] font-semibold leading-none tracking-[-0.05em] tabular-nums', totalAmount >= 0 ? 'text-[#00a970]' : 'text-[#f15b64]')}>
              {totalAmount >= 0 ? '+' : '−'}{formatCurrency(Math.abs(totalAmount))}
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100 pt-3 md:mt-0 md:border-t-0 md:pt-0">
            <SummaryItem label="Tổng thu" value={totalIncome} tone="income" />
            <SummaryItem label="Tổng chi" value={totalExpense} tone="expense" className="pl-4" />
          </div>
        </section>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-slate-500" />
            <Input
              aria-label="Tìm giao dịch"
              placeholder="Tìm nội dung, ghi chú..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 w-full rounded-xl bg-white pl-9"
            />
          </div>
          {accounts.length > 1 || activeAccountId !== 'all' ? (
            <Select value={activeAccountId} onValueChange={setActiveAccountId}>
              <SelectTrigger aria-label="Lọc theo ví" className="h-9 rounded-xl bg-white sm:w-48">
                <Wallet className="mr-1.5 size-3.5 text-slate-500" />
                <SelectValue placeholder="Tất cả ví" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả ví</SelectItem>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
          {availableTags.length > 0 || activeTag !== 'all' ? (
            <Select value={activeTag} onValueChange={setActiveTag}>
              <SelectTrigger aria-label="Lọc theo tag" className="h-9 rounded-xl bg-white sm:w-44">
                <Hash className="mr-1.5 size-3.5 text-slate-500" />
                <SelectValue placeholder="Mọi #tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mọi #tag</SelectItem>
                {availableTags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.name}>#{tag.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>

        <div className="relative mt-2.5">
          <div className="no-scrollbar flex gap-2 overflow-x-auto pr-7">
            <FilterChip active={activeType === 'all'} label="Tất cả loại" onClick={() => setActiveType('all')} />
            <FilterChip active={activeType === 'expense'} label="Chi tiêu" onClick={() => setActiveType('expense')} />
            <FilterChip active={activeType === 'income'} label="Thu nhập" onClick={() => setActiveType('income')} />
            {accounts.length > 1 ? (
              <FilterChip active={activeType === 'transfer'} label="Chuyển ví" onClick={() => setActiveType('transfer')} />
            ) : null}
            <FilterChip
              active={activeReimburse === 'pending'}
              label="Chờ hoàn ứng"
              color="#f59e0b"
              onClick={() => setActiveReimburse((curr) => curr === 'pending' ? 'all' : 'pending')}
            />
            <FilterChip
              active={onlyUnplanned}
              label="Phát sinh ngoài hũ"
              color="#64748b"
              onClick={() => setOnlyUnplanned((curr) => !curr)}
            />
            <span className="my-1 w-px shrink-0 bg-slate-200" />
            <FilterChip active={activeCategoryId === 'all'} label="Mọi danh mục" onClick={() => setActiveCategoryId('all')} />
            {categories.map((category) => (
              <FilterChip key={category.id} active={activeCategoryId === category.id} label={category.name} color={category.color} onClick={() => setActiveCategoryId(category.id)} />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#f7f9fb] to-transparent" />
        </div>
      </header>

      <main className="space-y-5 px-4 py-5 md:px-8 md:py-7">
        {isLoading ? <div className="space-y-3">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-200/70" />)}</div> : null}
        {!isLoading && loadError ? <div role="alert" className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-white p-4"><p className="text-sm text-rose-800">Không tải được danh sách giao dịch.</p><Button variant="outline" onClick={() => void fetchExpenses()}>Thử lại</Button></div> : null}
        {!isLoading && !loadError && dates.length === 0 ? (activeSearch || activeType !== 'all' || activeAccountId !== 'all' || activeTag !== 'all' || activeReimburse !== 'all' || onlyUnplanned ? <p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">Không tìm thấy giao dịch phù hợp bộ lọc.</p> : <EmptyTransactions />) : null}
        {!isLoading && !loadError && dates.length > 0 ? <>
          <div className="space-y-5 xl:hidden">{dates.map((date) => <TransactionGroup key={date} date={date} group={groups[date]} isViewer={isViewer} showCreatorBadge={showCreatorBadge} onDelete={setPendingDeleteId} onToggleReimburse={(exp) => void toggleReimburseStatus(exp)} onSaved={() => { void fetchExpenses(); void refreshTags(); }} />)}</div>
          <section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white xl:block">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h2 className="font-semibold text-slate-800">Giao dịch trong tháng</h2>
                <p className="mt-0.5 text-xs text-slate-400">Đang hiển thị {expenses.length} giao dịch</p>
              </div>
              <p className="text-sm font-semibold tabular-nums text-slate-600">Ròng {formatCurrency(totalAmount)}</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[790px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-6 py-3 font-medium">Ngày</th>
                    <th className="px-4 py-3 font-medium">Danh mục / Ví</th>
                    <th className="px-4 py-3 font-medium">Mô tả</th>
                    <th className="px-4 py-3 font-medium">Ghi chú</th>
                    <th className="px-6 py-3 text-right font-medium">Số tiền</th>
                    {!isViewer ? <th className="w-24 px-4 py-3 text-right font-medium">Thao tác</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dates.flatMap((date) => groups[date].items.map((expense) => {
                    const isTransfer = expense.type === 'transfer';
                    return (
                      <tr key={expense.id} className="group hover:bg-slate-50/70">
                        <td className="whitespace-nowrap px-6 py-3.5 text-slate-500">{formatShortDate(date)}</td>
                        <td className="px-4 py-3.5">
                          {isTransfer ? (
                            <span className="inline-flex items-center gap-2 text-sky-700">
                              <span className="flex size-8 items-center justify-center rounded-lg bg-sky-50">
                                <ArrowRightLeft className="size-3.5" />
                              </span>
                              <span className="text-xs font-medium">{expense.account_name || 'Ví'} → {expense.to_account_name || 'Ví'}</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-2">
                              <CategoryIcon name={expense.category.name} icon={expense.category.icon} color={expense.category.color} className="size-8 rounded-lg" iconClassName="size-3.5" />
                              <div>
                                <span className="block text-slate-700">{expense.category.name}</span>
                                {expense.account_name ? <span className="block text-[11px] text-slate-400">{expense.account_name}</span> : null}
                              </div>
                            </span>
                          )}
                        </td>
                        <td className="max-w-[22rem] px-4 py-3.5">
                          <span className="block truncate font-medium text-slate-800">{expense.description}</span>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            {expense.type === 'expense' && expense.in_budget_jar === false ? (
                              <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                Phát sinh ngoài hũ
                              </span>
                            ) : null}
                            {showCreatorBadge && expense.created_by_name ? (
                              <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                Bởi {expense.created_by_name}
                              </span>
                            ) : null}
                            {expense.tags.map((tag) => (
                              <span key={tag.id || tag.name} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                                <span className="size-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                                #{tag.name}
                              </span>
                            ))}
                            {expense.reimburse_status !== 'none' ? (
                              <button
                                type="button"
                                disabled={isViewer}
                                onClick={() => void toggleReimburseStatus(expense)}
                                title={isViewer ? undefined : 'Bấm để đổi trạng thái hoàn ứng'}
                                className={cn(
                                  'inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold transition',
                                  expense.reimburse_status === 'pending'
                                    ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                    : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
                                )}
                              >
                                {expense.reimburse_status === 'pending' ? 'Chờ hoàn ứng' : 'Đã hoàn ứng'}
                              </button>
                            ) : null}
                          </div>
                        </td>
                        <td className="max-w-[18rem] truncate px-4 py-3.5 text-slate-400">{expense.note || '—'}</td>
                        <td className={cn('whitespace-nowrap px-6 py-3.5 text-right font-semibold tabular-nums', isTransfer ? 'text-sky-700' : expense.type === 'income' ? 'text-[#00a970]' : 'text-[#f15b64]')}>
                          {isTransfer ? '' : expense.type === 'income' ? '+' : '−'}{formatCurrency(expense.amount)}
                        </td>
                        {!isViewer ? (
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-1">
                              <ManualTransactionDialog
                                compact
                                transaction={{
                                  ...expense,
                                  category_id: expense.category.id || null,
                                  date: expense.date,
                                }}
                                onSaved={() => { void fetchExpenses(); void refreshTags(); }}
                              />
                              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setPendingDeleteId(expense.id)} className="text-slate-300 opacity-0 group-hover:opacity-100 hover:bg-rose-50 hover:text-rose-600 focus-visible:opacity-100" aria-label={`Xóa ${expense.description}`}>
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          </section>

          {nextCursor ? (
            <div className="flex justify-center pt-2">
              <Button type="button" variant="outline" disabled={isLoadingMore} onClick={() => void loadMore()} className="h-10 rounded-xl px-6">
                {isLoadingMore ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Tải thêm giao dịch
              </Button>
            </div>
          ) : null}
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

function TransactionGroup({
  date,
  group,
  isViewer,
  showCreatorBadge,
  onDelete,
  onToggleReimburse,
  onSaved,
}: {
  date: string;
  group: { net: number; items: Expense[] };
  isViewer: boolean;
  showCreatorBadge: boolean;
  onDelete: (id: string) => void;
  onToggleReimburse: (expense: Expense) => void;
  onSaved: () => void;
}) {
  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
    <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5"><p className="text-xs font-semibold text-slate-600">{formatShortDate(date)}</p><p className={cn('text-xs font-semibold tabular-nums', group.net >= 0 ? 'text-[#00a970]' : 'text-[#f15b64]')}>{group.net >= 0 ? '+' : '−'}{formatCurrency(Math.abs(group.net))}</p></div>
    <div className="divide-y divide-slate-100">{group.items.map((expense) => <TransactionRow key={expense.id} expense={expense} isViewer={isViewer} showCreatorBadge={showCreatorBadge} onDelete={() => onDelete(expense.id)} onToggleReimburse={() => onToggleReimburse(expense)} onSaved={onSaved} />)}</div>
  </section>;
}

function TransactionRow({
  expense,
  isViewer,
  showCreatorBadge,
  onDelete,
  onToggleReimburse,
  onSaved,
}: {
  expense: Expense;
  isViewer: boolean;
  showCreatorBadge: boolean;
  onDelete: () => void;
  onToggleReimburse: () => void;
  onSaved: () => void;
}) {
  const isTransfer = expense.type === 'transfer';
  return <div className="group flex min-w-0 items-center gap-3 px-3.5 py-3">
    {isTransfer ? (
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-sky-50 text-sky-600">
        <ArrowRightLeft className="size-4" />
      </span>
    ) : (
      <CategoryIcon name={expense.category.name} icon={expense.category.icon} color={expense.category.color} className="size-9 rounded-xl" iconClassName="size-4" />
    )}
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium text-slate-700">{expense.description}</p>
      <p className="mt-0.5 truncate text-[11px] text-slate-400">
        {isTransfer
          ? `${expense.account_name || 'Ví'} → ${expense.to_account_name || 'Ví'}`
          : expense.note || [expense.category.name, expense.account_name].filter(Boolean).join(' · ')}
        {showCreatorBadge && expense.created_by_name ? ` · Bởi ${expense.created_by_name}` : ''}
      </p>
      {expense.tags.length > 0 || expense.reimburse_status !== 'none' || (expense.type === 'expense' && expense.in_budget_jar === false) ? (
        <div className="mt-1 flex flex-wrap items-center gap-1">
          {expense.type === 'expense' && expense.in_budget_jar === false ? (
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              Ngoài hũ
            </span>
          ) : null}
          {expense.tags.map((tag) => (
            <span key={tag.id || tag.name} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
              #{tag.name}
            </span>
          ))}
          {expense.reimburse_status !== 'none' ? (
            <button
              type="button"
              disabled={isViewer}
              onClick={onToggleReimburse}
              className={cn(
                'rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                expense.reimburse_status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800',
              )}
            >
              {expense.reimburse_status === 'pending' ? 'Chờ hoàn ứng' : 'Đã hoàn ứng'}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
    <p className={cn('shrink-0 whitespace-nowrap text-[13px] font-semibold tabular-nums', isTransfer ? 'text-sky-700' : expense.type === 'income' ? 'text-[#00a970]' : 'text-[#f15b64]')}>
      {isTransfer ? '' : expense.type === 'income' ? '+' : '−'}{formatCurrency(expense.amount)}
    </p>
    {!isViewer ? (
      <div className="ml-0.5 flex shrink-0 items-center gap-0.5">
        <ManualTransactionDialog compact transaction={{ ...expense, category_id: expense.category.id || null, date: expense.date }} onSaved={onSaved} />
        <Button type="button" variant="ghost" size="icon-sm" onClick={onDelete} className="text-slate-300 hover:bg-rose-50 hover:text-[#f15b64]" aria-label={`Xóa ${expense.description}`}><Trash2 className="size-3.5" /></Button>
      </div>
    ) : null}
  </div>;
}

function EmptyTransactions() {
  return <div className="flex flex-col items-center py-20 text-center"><span className="flex size-14 items-center justify-center rounded-3xl bg-emerald-50 text-[#00bc7c]"><ReceiptText className="size-6" /></span><h2 className="mt-4 text-base font-semibold text-slate-700">Chưa có giao dịch</h2><p className="mt-1 max-w-56 text-sm leading-5 text-slate-400">Dùng nút Ghi nhanh ở giữa thanh điều hướng để thêm giao dịch.</p></div>;
}
