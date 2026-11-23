'use client';

import { useEffect, useState } from 'react';
import { CalendarClock, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, formatDate, formatMoneyInput, getVietnamToday, parseMoneyInput } from '@/lib/utils';

interface RecurringRule {
  id: number;
  title: string;
  amount: number;
  type: 'expense' | 'income' | 'debt_payment';
  category_id: number | null;
  category_name: string | null;
  account_id: number | null;
  account_name: string | null;
  cadence: 'weekly' | 'monthly' | 'yearly';
  next_due_date: string;
  enabled: boolean;
}

interface AccountOption {
  id: number;
  name: string;
  is_default: boolean;
}

interface CategoryOption {
  id: string;
  name: string;
  kind?: string;
}

const CADENCE_LABELS: Record<string, string> = {
  weekly: 'Hàng tuần',
  monthly: 'Hàng tháng',
  yearly: 'Hàng năm',
};

export function RecurringRulesManager() {
  const { showToast } = useToast();
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [cadence, setCadence] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [nextDueDate, setNextDueDate] = useState(getVietnamToday());
  const [accountId, setAccountId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);

  const reloadRules = async () => {
    const res = await fetch('/api/recurring');
    if (res.ok) setRules((await res.json()) as RecurringRule[]);
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/recurring'), fetch('/api/accounts'), fetch('/api/categories')])
      .then(async ([rRes, aRes, cRes]) => {
        if (!active) return;
        if (rRes.ok) setRules((await rRes.json()) as RecurringRule[]);
        if (aRes.ok) {
          const accs = (await aRes.json()) as AccountOption[];
          setAccounts(accs);
          const def = accs.find((a) => a.is_default) ?? accs[0];
          if (def) setAccountId(String(def.id));
        }
        if (cRes.ok) {
          const cats = (await cRes.json()) as CategoryOption[];
          setCategories(cats.filter((c) => c.kind !== 'income' && c.name !== 'Thu nhập'));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    const numericAmount = parseMoneyInput(amount);
    if (!title.trim() || numericAmount <= 0) {
      showToast('Nhập tên hóa đơn và số tiền dự kiến', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const response = await fetch('/api/recurring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          amount: numericAmount,
          type: 'expense',
          cadence,
          next_due_date: nextDueDate,
          day_of_month: Math.min(28, Number(nextDueDate.slice(8, 10)) || 1),
          account_id: accountId ? Number(accountId) : null,
          category_id: categoryId ? Number(categoryId) : null,
        }),
      });
      if (!response.ok) throw new Error('Không tạo được lịch nhắc');
      showToast('Đã tạo lịch nhắc định kỳ (chỉ nhắc, không tự trừ tiền)', 'success');
      setTitle('');
      setAmount('');
      setIsAdding(false);
      await reloadRules();
    } catch {
      showToast('Không thể lưu lịch nhắc định kỳ', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleEnabled(rule: RecurringRule) {
    const res = await fetch(`/api/recurring/${rule.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (res.ok) {
      setRules((curr) => curr.map((r) => (r.id === rule.id ? { ...r, enabled: !rule.enabled } : r)));
    }
  }

  async function handleDelete(id: number) {
    const res = await fetch(`/api/recurring/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setRules((curr) => curr.filter((r) => r.id !== id));
      showToast('Đã xóa lịch nhắc', 'success');
    }
  }

  return (
    <Card id="nhac-dinh-ky" className="scroll-mt-6 rounded-2xl border-slate-200 bg-white">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="size-4 text-[#00a970]" />
            Lịch nhắc định kỳ
          </CardTitle>
          <CardDescription>
            Đến hạn chỉ gửi thông báo để bạn tự xác nhận, không tự động trừ ví.
          </CardDescription>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setIsAdding((v) => !v)} className="shrink-0 rounded-xl">
          <Plus className="size-4" /> Thêm lịch
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isAdding ? (
          <form onSubmit={handleCreate} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rec-title">Tên khoản chi / hóa đơn</Label>
                <Input id="rec-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="VD: Tiền nhà, Internet, Netflix" className="h-10 rounded-xl bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-amount">Số tiền dự kiến</Label>
                <Input id="rec-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(formatMoneyInput(e.target.value))} placeholder="500.000" className="h-10 rounded-xl bg-white tabular-nums" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-cadence">Chu kỳ</Label>
                <Select value={cadence} onValueChange={(v) => setCadence(v as 'weekly' | 'monthly' | 'yearly')}>
                  <SelectTrigger id="rec-cadence" className="h-10 rounded-xl bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Hàng tháng</SelectItem>
                    <SelectItem value="weekly">Hàng tuần</SelectItem>
                    <SelectItem value="yearly">Hàng năm</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rec-date">Ngày đến hạn tiếp theo</Label>
                <Input id="rec-date" type="date" value={nextDueDate} onChange={(e) => setNextDueDate(e.target.value)} className="h-10 rounded-xl bg-white" />
              </div>
              {categories.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="rec-category">Danh mục</Label>
                  <Select value={categoryId} onValueChange={setCategoryId}>
                    <SelectTrigger id="rec-category" className="h-10 rounded-xl bg-white">
                      <SelectValue placeholder="Chọn danh mục" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((cat) => (
                        <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              {accounts.length > 0 ? (
                <div className="space-y-1.5">
                  <Label htmlFor="rec-account">Ví gợi ý khi duyệt</Label>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger id="rec-account" className="h-10 rounded-xl bg-white">
                      <SelectValue placeholder="Ví mặc định" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setIsAdding(false)}>Hủy</Button>
              <Button type="submit" size="sm" disabled={isSaving} className="rounded-xl">
                {isSaving ? 'Đang lưu…' : 'Lưu lịch nhắc'}
              </Button>
            </div>
          </form>
        ) : null}

        {rules.length === 0 ? (
          <p className="text-xs text-slate-500">Chưa có lịch nhắc định kỳ nào. Hãy thêm tiền nhà, điện nước hoặc phí thuê bao.</p>
        ) : (
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {rules.map((rule) => (
              <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-slate-800">{rule.title}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {CADENCE_LABELS[rule.cadence] || rule.cadence}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatCurrency(rule.amount)} · Kỳ tới: {formatDate(rule.next_due_date)}
                    {rule.category_name ? ` · ${rule.category_name}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={rule.enabled} onCheckedChange={() => void toggleEnabled(rule)} aria-label={`Bật/tắt ${rule.title}`} />
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Xóa lịch ${rule.title}`}
                    onClick={() => void handleDelete(rule.id)}
                    className="text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
