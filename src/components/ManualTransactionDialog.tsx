'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CirclePlus, LoaderCircle, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { CategoryIcon } from '@/components/CategoryIcon';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { formatMoneyInput, getVietnamToday, parseMoneyInput } from '@/lib/utils';

interface CategoryOption {
  id: string | number;
  name: string;
  color: string;
}

interface ManualTransactionDialogProps {
  onSaved?: () => void;
  compact?: boolean;
  transaction?: {
    id: string;
    amount: number;
    description: string;
    category_id: string | number;
    date: string;
    note: string | null;
    type: 'income' | 'expense';
  };
}

const transactionSchema = z.object({
  type: z.enum(['expense', 'income']),
  amount: z.string().refine((value) => parseMoneyInput(value) > 0, 'Nhập số tiền lớn hơn 0.'),
  description: z.string().trim().min(1, 'Nhập nội dung giao dịch.').max(160, 'Nội dung tối đa 160 ký tự.'),
  category_id: z.string().min(1, 'Chọn danh mục.'),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày giao dịch.'),
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự.'),
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="mt-1 text-xs font-medium text-red-700">{message}</p> : null;
}

export function ManualTransactionDialog({ onSaved, compact = false, transaction }: ManualTransactionDialogProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const { showToast } = useToast();
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: { type: 'expense', amount: '', description: '', category_id: '', expense_date: getVietnamToday(), note: '' },
  });
  const type = form.watch('type');
  const categoryId = form.watch('category_id');
  const availableCategories = categories.filter((category) => type === 'income' ? category.name === 'Thu nhập' : category.name !== 'Thu nhập');
  const activeCategoryId = availableCategories.some((category) => String(category.id) === categoryId) ? categoryId : String(availableCategories[0]?.id || '');

  useEffect(() => {
    if (!open) return;
    form.reset(transaction ? {
      type: transaction.type,
      amount: formatMoneyInput(transaction.amount),
      description: transaction.description,
      category_id: String(transaction.category_id),
      expense_date: transaction.date.split('T')[0] || getVietnamToday(),
      note: transaction.note || '',
    } : { type: 'expense', amount: '', description: '', category_id: '', expense_date: getVietnamToday(), note: '' });
    fetch('/api/categories')
      .then(async (response) => {
        if (!response.ok) throw new Error('Không thể tải danh mục.');
        const data = await response.json() as CategoryOption[];
        setCategories(data);
        const currentCategory = form.getValues('category_id');
        if (!data.some((category) => String(category.id) === currentCategory)) {
          const firstExpense = data.find((category) => category.name !== 'Thu nhập');
          form.setValue('category_id', firstExpense ? String(firstExpense.id) : '');
        }
      })
      .catch(() => showToast('Không thể tải danh mục', 'error'));
  }, [form, open, showToast, transaction]);

  useEffect(() => {
    if (!categories.length) return;
    if (!availableCategories.some((category) => String(category.id) === categoryId)) {
      form.setValue('category_id', String(availableCategories[0]?.id || ''), { shouldValidate: false });
    }
  }, [availableCategories, categories.length, categoryId, form]);

  function resetForm() {
    form.reset({ type: 'expense', amount: '', description: '', category_id: '', expense_date: getVietnamToday(), note: '' });
  }

  async function saveTransaction(values: TransactionFormValues) {
    const response = await fetch(transaction ? `/api/expenses/${transaction.id}` : '/api/expenses', {
      method: transaction ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount: parseMoneyInput(values.amount),
        description: values.description.trim(),
        category_id: activeCategoryId,
        expense_date: values.expense_date,
        note: values.note.trim(),
        type: values.type,
      }),
    });
    const result = await response.json() as { error?: string; budgetAlert?: { title: string; message: string; severity: 'warning' | 'danger' } };
    if (!response.ok) {
      showToast(result.error || 'Không thể lưu giao dịch.', 'error');
      return;
    }
    setOpen(false);
    resetForm();
    onSaved?.();
    showToast(result.budgetAlert?.title || (transaction ? 'Đã cập nhật giao dịch' : 'Đã lưu giao dịch'), result.budgetAlert?.severity === 'danger' ? 'error' : 'success', result.budgetAlert?.message);
  }

  return (
    <>
      <Button type="button" variant={transaction ? 'ghost' : compact ? 'outline' : 'default'} size={transaction ? 'icon-sm' : 'default'} aria-label={transaction ? `Sửa ${transaction.description}` : undefined} className={transaction ? 'size-8 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700' : 'rounded-lg'} onClick={() => setOpen(true)}>
        <PenLine className="size-4" />{transaction ? null : ' Nhập thủ công'}
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) resetForm(); }}>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[min(560px,calc(100vw-1rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(560px,calc(100vw-2rem))]">
          <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-14">
            <DialogTitle>{transaction ? 'Sửa giao dịch' : 'Thêm giao dịch thủ công'}</DialogTitle>
            <DialogDescription>{transaction ? 'Cập nhật nội dung, danh mục, ngày hoặc số tiền.' : 'Nhập giao dịch trực tiếp, không cần AI.'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(saveTransaction)} noValidate className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
            <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5">
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
                <button type="button" onClick={() => form.setValue('type', 'expense', { shouldValidate: true })} aria-pressed={type === 'expense'} className={`min-h-10 rounded-lg text-sm font-semibold transition ${type === 'expense' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500'}`}>Khoản chi</button>
                <button type="button" onClick={() => form.setValue('type', 'income', { shouldValidate: true })} aria-pressed={type === 'income'} className={`min-h-10 rounded-lg text-sm font-semibold transition ${type === 'income' ? 'bg-white text-green-800 shadow-sm' : 'text-slate-500'}`}>Khoản thu</button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="manual-amount">Số tiền (VND)</Label>
                  <Input id="manual-amount" inputMode="numeric" autoComplete="off" placeholder="100.000" aria-invalid={Boolean(form.formState.errors.amount)} {...form.register('amount', { onChange: (event) => form.setValue('amount', formatMoneyInput(event.target.value)) })} className="h-12 rounded-lg text-lg font-semibold tabular-nums" />
                  <FieldError message={form.formState.errors.amount?.message} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="manual-description">Nội dung</Label>
                  <Input id="manual-description" maxLength={160} placeholder="Ví dụ: Ăn sáng + cafe" aria-invalid={Boolean(form.formState.errors.description)} {...form.register('description')} className="h-11 rounded-lg" />
                  <FieldError message={form.formState.errors.description?.message} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-category">Danh mục</Label>
                  <Controller control={form.control} name="category_id" render={({ field }) => <Select value={activeCategoryId} onValueChange={field.onChange}>
                    <SelectTrigger id="manual-category" aria-label="Danh mục" aria-invalid={Boolean(form.formState.errors.category_id)} className="h-11 rounded-lg">
                      <SelectValue placeholder="Chọn danh mục">{availableCategories.find((category) => String(category.id) === activeCategoryId)?.name || 'Chọn danh mục'}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>{availableCategories.map((category) => <SelectItem key={category.id} value={String(category.id)}><span className="flex items-center gap-2"><CategoryIcon name={category.name} color={category.color} className="size-7 rounded-lg" iconClassName="size-3.5" />{category.name}</span></SelectItem>)}</SelectContent>
                  </Select>} />
                  <FieldError message={form.formState.errors.category_id?.message} />
                </div>
                <Controller control={form.control} name="expense_date" render={({ field, fieldState }) => <DatePicker id="manual-date" label="Ngày giao dịch" value={field.value} onChange={field.onChange} invalid={Boolean(fieldState.error)} />} />
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="manual-note">Ghi chú <span className="font-normal text-slate-500">(không bắt buộc)</span></Label>
                  <Textarea id="manual-note" rows={3} maxLength={500} placeholder="Thêm thông tin nếu cần" {...form.register('note')} className="min-h-20 resize-y rounded-lg" />
                  <FieldError message={form.formState.errors.note?.message} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              <Button type="button" variant="outline" className="h-11 flex-1 rounded-lg" onClick={() => setOpen(false)}>Hủy</Button>
              <Button type="submit" className="h-11 flex-1 rounded-lg" disabled={form.formState.isSubmitting || !availableCategories.length}>
                {form.formState.isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <CirclePlus className="size-4" />} {transaction ? 'Lưu thay đổi' : 'Lưu giao dịch'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
