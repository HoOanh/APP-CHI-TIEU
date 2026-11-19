'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  CreditCard,
  Landmark,
  LoaderCircle,
  PiggyBank,
  Plus,
  Smartphone,
  Star,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { cn, formatCurrency, formatMoneyInput, parseMoneyInput } from '@/lib/utils';

export interface AccountItem {
  id: number;
  name: string;
  type: 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'savings';
  initial_balance: number;
  credit_limit: number;
  statement_day: number;
  due_day: number;
  is_default: boolean;
  archived: boolean;
  balance: number;
}

const ACCOUNT_TYPE_LABELS: Record<AccountItem['type'], string> = {
  cash: 'Tiền mặt',
  bank: 'Ngân hàng',
  ewallet: 'Ví điện tử',
  credit_card: 'Thẻ tín dụng',
  savings: 'Quỹ tiết kiệm',
};

function AccountTypeIcon({ type }: { type: AccountItem['type'] }) {
  if (type === 'bank') return <Landmark className="size-4 text-sky-600" />;
  if (type === 'ewallet') return <Smartphone className="size-4 text-pink-600" />;
  if (type === 'credit_card') return <CreditCard className="size-4 text-amber-600" />;
  if (type === 'savings') return <PiggyBank className="size-4 text-emerald-600" />;
  return <Wallet className="size-4 text-emerald-700" />;
}

export function AccountsManager({ onChanged }: { onChanged?: () => void }) {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<AccountItem['type']>('bank');
  const [initialBalance, setInitialBalance] = useState('');

  const loadAccounts = useCallback(async () => {
    const response = await fetch('/api/accounts');
    if (!response.ok) throw new Error('Không thể tải danh sách ví.');
    setAccounts(await response.json() as AccountItem[]);
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/accounts')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed');
        return res.json() as Promise<AccountItem[]>;
      })
      .then((data) => {
        if (active) setAccounts(data);
      })
      .catch(() => {
        if (active) showToast('Không thể tải danh sách ví', 'error');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [showToast]);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setIsSaving(true);
    try {
      const response = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          initial_balance: parseMoneyInput(initialBalance),
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể tạo ví mới.');
      setName('');
      setInitialBalance('');
      setIsAdding(false);
      await loadAccounts();
      onChanged?.();
      showToast('Đã thêm ví mới', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tạo ví mới', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function setDefaultAccount(account: AccountItem) {
    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });
      if (!response.ok) throw new Error('Không thể đổi ví mặc định.');
      await loadAccounts();
      onChanged?.();
      showToast(`Đã đặt "${account.name}" làm ví mặc định`, 'success');
    } catch {
      showToast('Không thể cập nhật ví mặc định', 'error');
    }
  }

  async function archiveAccount(account: AccountItem) {
    try {
      const response = await fetch(`/api/accounts/${account.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: true }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể lưu trữ ví.');
      await loadAccounts();
      onChanged?.();
      showToast(`Đã ẩn ví "${account.name}"`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể ẩn ví', 'error');
    }
  }

  return (
    <section id="vi-tien" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#00a970]">
            <Wallet className="size-5" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Ví & Nguồn tiền</h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Theo dõi riêng Tiền mặt, Ngân hàng, Ví điện tử, Thẻ tín dụng và Quỹ tiết kiệm.
            </p>
          </div>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setIsAdding((v) => !v)} className="rounded-xl">
          <Plus className="size-4" /> Thêm ví
        </Button>
      </div>

      <div className="space-y-4 p-5">
        {isAdding ? (
          <form onSubmit={handleCreate} className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="new-account-name">Tên ví</Label>
              <Input
                id="new-account-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="VD: Techcombank, MoMo..."
                className="h-10 rounded-xl bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-account-type">Loại ví</Label>
              <Select value={type} onValueChange={(value) => setType(value as AccountItem['type'])}>
                <SelectTrigger id="new-account-type" className="h-10 rounded-xl bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ACCOUNT_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new-account-balance">Số dư ban đầu</Label>
              <Input
                id="new-account-balance"
                inputMode="numeric"
                value={initialBalance}
                onChange={(event) => setInitialBalance(formatMoneyInput(event.target.value))}
                placeholder="0"
                className="h-10 rounded-xl bg-white tabular-nums"
              />
            </div>
            <div className="flex justify-end gap-2 sm:col-span-3">
              <Button type="button" variant="ghost" onClick={() => setIsAdding(false)} className="h-9 rounded-xl">
                Hủy
              </Button>
              <Button type="submit" disabled={isSaving || !name.trim()} className="h-9 rounded-xl">
                {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : null}
                Lưu ví
              </Button>
            </div>
          </form>
        ) : null}

        {isLoading ? (
          <p className="py-4 text-center text-xs text-muted-foreground">Đang tải danh sách ví...</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {accounts.map((account) => (
              <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100">
                    <AccountTypeIcon type={account.type} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-800">{account.name}</p>
                      {account.is_default ? (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                          Mặc định
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-500">{ACCOUNT_TYPE_LABELS[account.type]}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className={cn('text-sm font-semibold tabular-nums', account.balance >= 0 ? 'text-slate-800' : 'text-rose-600')}>
                    {formatCurrency(account.balance)}
                  </p>
                  {!account.is_default ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Đặt làm ví mặc định"
                      aria-label={`Đặt ${account.name} làm ví mặc định`}
                      onClick={() => void setDefaultAccount(account)}
                    >
                      <Star className="size-3.5 text-slate-400 hover:text-amber-500" />
                    </Button>
                  ) : null}
                  {accounts.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      title="Ẩn ví"
                      aria-label={`Ẩn ví ${account.name}`}
                      onClick={() => void archiveAccount(account)}
                    >
                      <Archive className="size-3.5 text-slate-400 hover:text-rose-600" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
