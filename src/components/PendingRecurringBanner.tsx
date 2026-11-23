'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, Check, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { notifyTransactionsChanged } from '@/lib/transaction-events';
import { formatCurrency, formatDate, formatMoneyInput, parseMoneyInput } from '@/lib/utils';

interface PendingOccurrence {
  id: number;
  rule_id: number;
  due_date: string;
  title: string;
  amount: number;
  type: string;
  account_name: string | null;
}

export function PendingRecurringBanner({ onResolved }: { onResolved?: () => void }) {
  const { showToast } = useToast();
  const [items, setItems] = useState<PendingOccurrence[]>([]);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/recurring/pending')
      .then(async (res) => (res.ok ? (await res.json()) as PendingOccurrence[] : []))
      .then((rows) => {
        if (!active) return;
        setItems(rows);
        const map: Record<number, string> = {};
        for (const r of rows) map[r.id] = formatMoneyInput(r.amount);
        setAmounts(map);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  if (items.length === 0) return null;

  async function handleConfirm(item: PendingOccurrence) {
    const editedAmount = parseMoneyInput(amounts[item.id] ?? '') || item.amount;
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/recurring/occurrences/${item.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: editedAmount }),
      });
      if (!response.ok) throw new Error('Không thể xác nhận khoản định kỳ');
      setItems((curr) => curr.filter((x) => x.id !== item.id));
      showToast(`Đã ghi nhận "${item.title}" (${formatCurrency(editedAmount)})`, 'success');
      notifyTransactionsChanged();
      onResolved?.();
    } catch {
      showToast('Không thể xác nhận nhắc hẹn lúc này', 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSkip(item: PendingOccurrence) {
    setBusyId(item.id);
    try {
      const response = await fetch(`/api/recurring/occurrences/${item.id}/skip`, { method: 'POST' });
      if (!response.ok) throw new Error('Không thể bỏ qua');
      setItems((curr) => curr.filter((x) => x.id !== item.id));
      showToast(`Đã bỏ qua kỳ này cho "${item.title}"`, 'success');
    } catch {
      showToast('Không thể bỏ qua nhắc hẹn', 'error');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      aria-label="Khoản định kỳ chờ xác nhận"
      className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-xs"
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-amber-900">
          <BellRing className="size-4 text-amber-600" />
          Nhắc hẹn đến hạn ({items.length}) · Chờ bạn duyệt
        </p>
        <Link href="/settings/automation#nhac-dinh-ky" className="text-xs font-medium text-amber-800 hover:underline">
          Quản lý lịch →
        </Link>
      </div>
      <div className="space-y-2.5">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col gap-2.5 rounded-xl border border-amber-200/80 bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500">
                <Clock className="size-3.5 text-amber-600" />
                Đến hạn {formatDate(item.due_date)}
                {item.account_name ? ` · ${item.account_name}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={`Số tiền thực tế cho ${item.title}`}
                inputMode="numeric"
                value={amounts[item.id] ?? ''}
                onChange={(e) => setAmounts((prev) => ({ ...prev, [item.id]: formatMoneyInput(e.target.value) }))}
                className="h-9 w-32 rounded-lg text-right text-sm font-semibold tabular-nums"
              />
              <Button
                type="button"
                size="sm"
                disabled={busyId === item.id}
                onClick={() => void handleConfirm(item)}
                className="h-9 rounded-lg bg-[#00bc7c] px-3 text-xs font-semibold hover:bg-[#00a970]"
              >
                <Check className="size-3.5" /> Xác nhận
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busyId === item.id}
                onClick={() => void handleSkip(item)}
                className="h-9 rounded-lg px-2.5 text-xs text-slate-600"
              >
                <X className="size-3.5" /> Bỏ qua
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
