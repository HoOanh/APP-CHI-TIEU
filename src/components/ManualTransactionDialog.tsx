'use client';

import { useEffect, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRightLeft, CirclePlus, LoaderCircle, PenLine } from 'lucide-react';
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
import { queueOfflineTransaction } from '@/lib/offline-queue';

interface CategoryOption {
  id: string | number;
  name: string;
  color: string;
  kind?: 'expense' | 'income' | 'both';
}

interface AccountOption {
  id: number;
  name: string;
  type: string;
  is_default: boolean;
}

interface TransactionSaveResult {
  id: string | number;
  amount: number;
  description: string;
  category_id: string | number | null;
  category_name: string | null;
  account_id?: number | null;
  to_account_id?: number | null;
  expense_date: string;
  note: string | null;
  type: 'income' | 'expense' | 'transfer';
  reimburse_status?: 'none' | 'pending' | 'settled';
  tags?: Array<{ id?: number; name: string; color?: string }>;
}

interface ManualTransactionDialogProps {
  onSaved?: (transaction?: TransactionSaveResult) => void;
  compact?: boolean;
  iconOnMobile?: boolean;
  transaction?: {
    id: string;
    amount: number;
    description: string;
    category_id: string | number | null;
    account_id?: number | null;
    to_account_id?: number | null;
    date: string;
    note: string | null;
    type: 'income' | 'expense' | 'transfer';
    reimburse_status?: 'none' | 'pending' | 'settled';
    tags?: Array<{ id?: number; name: string; color?: string }>;
  };
}

const transactionSchema = z.object({
  type: z.enum(['expense', 'income', 'transfer']),
  amount: z.string().refine((value) => parseMoneyInput(value) > 0, 'Nhập số tiền lớn hơn 0.'),
  description: z.string().trim().min(1, 'Nhập nội dung giao dịch.').max(160, 'Nội dung tối đa 160 ký tự.'),
  category_id: z.string(),
  account_id: z.string(),
  to_account_id: z.string(),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Chọn ngày giao dịch.'),
  reimburse_status: z.enum(['none', 'pending', 'settled']),
  tagsText: z.string().max(120, 'Tags tối đa 120 ký tự.'),
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự.'),
}).superRefine((values, context) => {
  if (values.type === 'transfer') {
    if (!values.account_id) {
      context.addIssue({ code: 'custom', path: ['account_id'], message: 'Chọn ví nguồn.' });
    }
    if (!values.to_account_id || values.to_account_id === values.account_id) {
      context.addIssue({ code: 'custom', path: ['to_account_id'], message: 'Chọn ví đích khác ví nguồn.' });
    }
  } else if (!values.category_id) {
    context.addIssue({ code: 'custom', path: ['category_id'], message: 'Chọn danh mục.' });
  }
});

type TransactionFormValues = z.infer<typeof transactionSchema>;

function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="mt-1 text-xs font-medium text-red-700">{message}</p> : null;
}

export function ManualTransactionDialog({ onSaved, compact = false, iconOnMobile = false, transaction }: ManualTransactionDialogProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const { showToast } = useToast();
  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(transactionSchema),
    defaultValues: {
      type: 'expense',
      amount: '',
      description: '',
      category_id: '',
      account_id: '',
      to_account_id: '',
      expense_date: getVietnamToday(),
      reimburse_status: 'none',
      tagsText: '',
      note: '',
    },
  });
  const type = useWatch({ control: form.control, name: 'type' });
  const categoryId = useWatch({ control: form.control, name: 'category_id' });
  const accountId = useWatch({ control: form.control, name: 'account_id' });
  const toAccountId = useWatch({ control: form.control, name: 'to_account_id' });
  const reimburseStatus = useWatch({ control: form.control, name: 'reimburse_status' });

  const availableCategories = categories.filter((category) => {
    const kind = category.kind ?? (category.name === 'Thu nhập' ? 'income' : 'expense');
    return type === 'income'
      ? (kind === 'income' || kind === 'both' || category.name === 'Thu nhập')
      : (kind === 'expense' || kind === 'both');
  });
  const activeCategoryId = availableCategories.some((category) => String(category.id) === categoryId)
    ? categoryId
    : String(availableCategories[0]?.id || '');

  const showTransferTab = accounts.length > 1 || transaction?.type === 'transfer';
  const showAccountPicker = accounts.length > 1 || type === 'transfer';

  useEffect(() => {
    if (!open) return;
    form.reset(transaction ? {
      type: transaction.type,
      amount: formatMoneyInput(transaction.amount),
      description: transaction.description,
      category_id: transaction.category_id ? String(transaction.category_id) : '',
      account_id: transaction.account_id ? String(transaction.account_id) : '',
      to_account_id: transaction.to_account_id ? String(transaction.to_account_id) : '',
      expense_date: transaction.date.split('T')[0] || getVietnamToday(),
      reimburse_status: transaction.reimburse_status ?? 'none',
      tagsText: (transaction.tags ?? []).map((t) => `#${t.name}`).join(' '),
      note: transaction.note || '',
    } : {
      type: 'expense',
      amount: '',
      description: '',
      category_id: '',
      account_id: '',
      to_account_id: '',
      expense_date: getVietnamToday(),
      reimburse_status: 'none',
      tagsText: '',
      note: '',
    });

    Promise.all([fetch('/api/categories'), fetch('/api/accounts')])
      .then(async ([catResponse, accResponse]) => {
        if (!catResponse.ok) throw new Error('Không thể tải danh mục.');
        const catData = await catResponse.json() as CategoryOption[];
        setCategories(catData);
        const currentCategory = form.getValues('category_id');
        if (!catData.some((category) => String(category.id) === currentCategory)) {
          const firstExpense = catData.find((category) => (category.kind ?? 'expense') !== 'income' && category.name !== 'Thu nhập');
          form.setValue('category_id', firstExpense ? String(firstExpense.id) : '');
        }

        if (accResponse.ok) {
          const accData = await accResponse.json() as AccountOption[];
          setAccounts(accData);
          const defaultAcc = accData.find((a) => a.is_default) ?? accData[0];
          const secondAcc = accData.find((a) => a.id !== defaultAcc?.id);
          if (!form.getValues('account_id') && defaultAcc) {
            form.setValue('account_id', String(defaultAcc.id));
          }
          if (!form.getValues('to_account_id') && secondAcc) {
            form.setValue('to_account_id', String(secondAcc.id));
          }
        }
      })
      .catch(() => showToast('Không thể tải danh mục hoặc ví', 'error'));
  }, [form, open, showToast, transaction]);

  useEffect(() => {
    if (!categories.length || type === 'transfer') return;
    if (!availableCategories.some((category) => String(category.id) === categoryId)) {
      form.setValue('category_id', String(availableCategories[0]?.id || ''), { shouldValidate: false });
    }
  }, [availableCategories, categories.length, categoryId, form, type]);

  function resetForm() {
    const defaultAcc = accounts.find((a) => a.is_default) ?? accounts[0];
    const secondAcc = accounts.find((a) => a.id !== defaultAcc?.id);
    form.reset({
      type: 'expense',
      amount: '',
      description: '',
      category_id: '',
      account_id: defaultAcc ? String(defaultAcc.id) : '',
      to_account_id: secondAcc ? String(secondAcc.id) : '',
      expense_date: getVietnamToday(),
      reimburse_status: 'none',
      tagsText: '',
      note: '',
    });
  }

  async function saveTransaction(values: TransactionFormValues) {
    const parsedTags = values.tagsText
      .split(/[\s,;]+/)
      .map((t) => t.replace(/^#+/, '').trim())
      .filter(Boolean);
    const transactionValues = {
      amount: parseMoneyInput(values.amount),
      description: values.description.trim(),
      category_id: values.type === 'transfer' ? null : activeCategoryId,
      account_id: values.account_id ? Number(values.account_id) : undefined,
      to_account_id: values.type === 'transfer' && values.to_account_id ? Number(values.to_account_id) : undefined,
      expense_date: values.expense_date,
      reimburse_status: values.type === 'transfer' ? 'none' : values.reimburse_status,
      tags: parsedTags,
      note: values.note.trim(),
      type: values.type,
    };

    if (!navigator.onLine) {
      if (transaction) {
        showToast('Chỉnh sửa giao dịch cần kết nối mạng.', 'error');
        return;
      }
      if (values.type === 'transfer') {
        showToast('Chuyển khoản nội bộ cần kết nối mạng.', 'warning');
        return;
      }
      try {
        await queueOfflineTransaction({
          amount: transactionValues.amount,
          description: transactionValues.description,
          category_id: activeCategoryId,
          expense_date: transactionValues.expense_date,
          note: transactionValues.note,
          type: values.type,
        });
        setOpen(false);
        resetForm();
        onSaved?.();
        showToast('Đã lưu giao dịch trên thiết bị', 'success', 'Giao dịch sẽ tự đồng bộ khi có mạng.');
      } catch {
        showToast('Không thể lưu giao dịch offline trên thiết bị này.', 'error');
      }
      return;
    }

    const clientRequestId = transaction ? undefined : crypto.randomUUID();
    let response: Response;
    try {
      response = await fetch(transaction ? `/api/expenses/${transaction.id}` : '/api/expenses', {
        method: transaction ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...transactionValues,
          ...(clientRequestId ? { client_request_id: clientRequestId } : {}),
        }),
      });
    } catch {
      if (!transaction && clientRequestId && values.type !== 'transfer') {
        await queueOfflineTransaction({
          amount: transactionValues.amount,
          description: transactionValues.description,
          category_id: activeCategoryId,
          expense_date: transactionValues.expense_date,
          note: transactionValues.note,
          type: values.type,
        }, clientRequestId);
        setOpen(false);
        resetForm();
        onSaved?.();
        showToast('Mất kết nối; đã lưu giao dịch trên thiết bị', 'success', 'Giao dịch sẽ tự đồng bộ khi có mạng.');
      } else {
        showToast('Mất kết nối; chưa thể lưu giao dịch.', 'error');
      }
      return;
    }
    const result = await response.json() as TransactionSaveResult & { error?: string; budgetAlert?: { title: string; message: string; severity: 'warning' | 'danger' } };
    if (!response.ok) {
      showToast(result.error || 'Không thể lưu giao dịch.', 'error');
      return;
    }
    setOpen(false);
    resetForm();
    onSaved?.(result);
    showToast(
      result.budgetAlert?.title || (transaction ? 'Đã cập nhật giao dịch' : 'Đã lưu giao dịch'),
      result.budgetAlert?.severity === 'danger'
        ? 'error'
        : result.budgetAlert?.severity === 'warning'
          ? 'warning'
          : 'success',
      result.budgetAlert?.message,
      { strobe: !transaction && result.budgetAlert?.severity === 'danger' },
    );
  }

  return (
    <>
      <Button type="button" variant={transaction ? 'ghost' : compact ? 'outline' : 'default'} size={transaction ? 'icon-sm' : 'default'} aria-label={transaction ? `Sửa ${transaction.description}` : 'Nhập thủ công'} className={transaction ? 'size-8 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700' : 'h-9 rounded-xl'} onClick={() => setOpen(true)}>
        <PenLine className="size-4" />{transaction ? null : <span className={iconOnMobile ? "hidden sm:inline" : undefined}>Nhập thủ công</span>}
      </Button>
      <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) resetForm(); }}>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[min(560px,calc(100vw-1rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(560px,calc(100vw-2rem))]">
          <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-14">
            <DialogTitle>{transaction ? 'Sửa giao dịch' : 'Thêm giao dịch thủ công'}</DialogTitle>
            <DialogDescription>{transaction ? 'Cập nhật nội dung, danh mục, ví, ngày hoặc số tiền.' : 'Nhập giao dịch trực tiếp, không cần AI.'}</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(saveTransaction)} noValidate className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
            <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5">
              <div className={`grid gap-1 rounded-xl bg-slate-100 p-1 ${showTransferTab ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <button type="button" onClick={() => form.setValue('type', 'expense', { shouldValidate: true })} aria-pressed={type === 'expense'} className={`min-h-10 rounded-lg text-sm font-semibold transition ${type === 'expense' ? 'bg-white text-red-700 shadow-sm' : 'text-slate-500'}`}>Khoản chi</button>
                <button type="button" onClick={() => form.setValue('type', 'income', { shouldValidate: true })} aria-pressed={type === 'income'} className={`min-h-10 rounded-lg text-sm font-semibold transition ${type === 'income' ? 'bg-white text-green-800 shadow-sm' : 'text-slate-500'}`}>Khoản thu</button>
                {showTransferTab ? (
                  <button
                    type="button"
                    onClick={() => {
                      form.setValue('type', 'transfer', { shouldValidate: true });
                      if (!form.getValues('description')) {
                        form.setValue('description', 'Chuyển khoản giữa ví');
                      }
                    }}
                    aria-pressed={type === 'transfer'}
                    className={`flex min-h-10 items-center justify-center gap-1 rounded-lg text-sm font-semibold transition ${type === 'transfer' ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-500'}`}
                  >
                    <ArrowRightLeft className="size-3.5" /> Chuyển ví
                  </button>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="manual-amount">Số tiền (VND)</Label>
                  <Input id="manual-amount" inputMode="numeric" autoComplete="off" placeholder="100.000" aria-invalid={Boolean(form.formState.errors.amount)} {...form.register('amount', { onChange: (event) => form.setValue('amount', formatMoneyInput(event.target.value)) })} className="h-12 text-lg font-semibold tabular-nums" />
                  <FieldError message={form.formState.errors.amount?.message} />
                </div>

                {showAccountPicker ? (
                  <div className={type === 'transfer' ? 'space-y-2' : 'space-y-2 sm:col-span-2'}>
                    <Label htmlFor="manual-account">{type === 'transfer' ? 'Từ ví' : type === 'income' ? 'Nhận vào ví' : 'Chi từ ví'}</Label>
                    <Controller
                      control={form.control}
                      name="account_id"
                      render={({ field }) => (
                        <Select value={accountId || String(accounts[0]?.id || '')} onValueChange={field.onChange}>
                          <SelectTrigger id="manual-account" aria-label="Ví nguồn">
                            <SelectValue placeholder="Chọn ví" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.map((acc) => (
                              <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError message={form.formState.errors.account_id?.message} />
                  </div>
                ) : null}

                {type === 'transfer' ? (
                  <div className="space-y-2">
                    <Label htmlFor="manual-to-account">Đến ví</Label>
                    <Controller
                      control={form.control}
                      name="to_account_id"
                      render={({ field }) => (
                        <Select value={toAccountId} onValueChange={field.onChange}>
                          <SelectTrigger id="manual-to-account" aria-label="Ví đích">
                            <SelectValue placeholder="Chọn ví đích" />
                          </SelectTrigger>
                          <SelectContent>
                            {accounts.filter((acc) => String(acc.id) !== accountId).map((acc) => (
                              <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <FieldError message={form.formState.errors.to_account_id?.message} />
                  </div>
                ) : null}

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="manual-description">Nội dung</Label>
                  <Input id="manual-description" maxLength={160} placeholder={type === 'transfer' ? 'Ví dụ: Rút ATM / Nạp MoMo' : 'Ví dụ: Ăn sáng + cafe'} aria-invalid={Boolean(form.formState.errors.description)} {...form.register('description')} />
                  <FieldError message={form.formState.errors.description?.message} />
                </div>

                {type !== 'transfer' ? (
                  <div className="space-y-2">
                    <Label htmlFor="manual-category">Danh mục</Label>
                    <Controller control={form.control} name="category_id" render={({ field }) => <Select value={activeCategoryId} onValueChange={field.onChange}>
                      <SelectTrigger id="manual-category" aria-label="Danh mục" aria-invalid={Boolean(form.formState.errors.category_id)}>
                        <SelectValue placeholder="Chọn danh mục">
                          {(() => {
                            const selectedCategory = availableCategories.find((category) => String(category.id) === activeCategoryId);
                            return selectedCategory ? (
                              <span className="inline-flex min-w-0 items-center gap-2">
                                <CategoryIcon name={selectedCategory.name} color={selectedCategory.color} className="size-6 rounded-md" iconClassName="size-3.5" />
                                <span className="truncate">{selectedCategory.name}</span>
                              </span>
                            ) : 'Chọn danh mục';
                          })()}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>{availableCategories.map((category) => <SelectItem key={category.id} value={String(category.id)}><span className="flex items-center gap-2"><CategoryIcon name={category.name} color={category.color} className="size-7 rounded-lg" iconClassName="size-3.5" />{category.name}</span></SelectItem>)}</SelectContent>
                    </Select>} />
                    <FieldError message={form.formState.errors.category_id?.message} />
                  </div>
                ) : null}

                <Controller control={form.control} name="expense_date" render={({ field, fieldState }) => <DatePicker id="manual-date" label="Ngày giao dịch" value={field.value} onChange={field.onChange} invalid={Boolean(fieldState.error)} />} />

                {type !== 'transfer' ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="manual-tags">#Tags <span className="font-normal text-slate-500">(cách nhau bởi dấu cách)</span></Label>
                      <Input id="manual-tags" maxLength={120} placeholder="Ví dụ: #du-an #khach-hang" {...form.register('tagsText')} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="manual-reimburse">Hoàn ứng</Label>
                      <Controller
                        control={form.control}
                        name="reimburse_status"
                        render={({ field }) => (
                          <Select value={reimburseStatus} onValueChange={field.onChange}>
                            <SelectTrigger id="manual-reimburse" aria-label="Trạng thái hoàn ứng">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Không hoàn ứng</SelectItem>
                              <SelectItem value="pending">Chờ hoàn ứng</SelectItem>
                              <SelectItem value="settled">Đã hoàn ứng</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </div>
                  </>
                ) : null}

                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="manual-note">Ghi chú <span className="font-normal text-slate-500">(không bắt buộc)</span></Label>
                  <Textarea id="manual-note" rows={3} maxLength={500} placeholder="Thêm thông tin nếu cần" {...form.register('note')} className="min-h-20 resize-y" />
                  <FieldError message={form.formState.errors.note?.message} />
                </div>
              </div>
            </div>
            <div className="flex gap-2 border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              <Button type="button" variant="outline" className="h-11 flex-1 rounded-xl" onClick={() => setOpen(false)}>Hủy</Button>
              <Button type="submit" className="h-11 flex-1 rounded-xl font-semibold" disabled={form.formState.isSubmitting || (type !== 'transfer' && !availableCategories.length)}>
                {form.formState.isSubmitting ? <LoaderCircle className="size-4 animate-spin" /> : <CirclePlus className="size-4" />} {transaction ? 'Lưu thay đổi' : 'Lưu giao dịch'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
