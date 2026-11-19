'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calculator,
  CalendarDays,
  ChevronRight,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import type { DebtSimulationOutput, PayoffStrategy } from '@/lib/debt-simulator';
import { cn, formatCurrency, formatMoneyInput, getPercentage, getVietnamToday, parseMoneyInput } from '@/lib/utils';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

const debtSchema = z
  .object({
    direction: z.enum(['payable', 'receivable']),
    name: z.string().trim().min(1, 'Nhập tên khoản công nợ').max(120),
    creditor: z.string().trim().min(1, 'Nhập đối tác hoặc ngân hàng').max(120),
    total_amount: z.string().refine((value) => Number(value.replace(/\D/g, '')) > 0, 'Số tiền phải lớn hơn 0'),
    start_date: z.string().min(1, 'Chọn ngày bắt đầu'),
    due_date: z.string().min(1, 'Chọn hạn thanh toán'),
    interest_rate: z.string(),
    account_id: z.string(),
    note: z.string().max(500, 'Ghi chú tối đa 500 ký tự'),
  })
  .refine((value) => value.due_date >= value.start_date, {
    path: ['due_date'],
    message: 'Hạn thanh toán phải sau ngày bắt đầu',
  });
type DebtFormValues = z.infer<typeof debtSchema>;

interface AccountOption {
  id: number;
  name: string;
  is_default: boolean;
}

interface Debt {
  id: string;
  direction?: 'payable' | 'receivable';
  name: string;
  creditor: string;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  status: 'active' | 'completed';
  interest_rate?: number;
  account_name?: string | null;
}

interface SimulationApiResponse extends DebtSimulationOutput {
  comparison?: {
    alternateStrategy: PayoffStrategy;
    alternateMonths: number;
    alternateInterest: number;
    interestDelta: number;
  };
}

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [directionFilter, setDirectionFilter] = useState<'payable' | 'receivable'>('payable');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const { showToast } = useToast();

  // Simulator state
  const [isSimOpen, setIsSimOpen] = useState(false);
  const [simBudget, setSimBudget] = useState('5.000.000');
  const [simStrategy, setSimStrategy] = useState<PayoffStrategy>('avalanche');
  const [simResult, setSimResult] = useState<SimulationApiResponse | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const {
    register,
    handleSubmit,
    setValue,
    control,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DebtFormValues>({
    resolver: zodResolver(debtSchema),
    defaultValues: {
      direction: 'payable',
      name: '',
      creditor: '',
      total_amount: '',
      start_date: getVietnamToday(),
      due_date: '',
      interest_rate: '',
      account_id: '',
      note: '',
    },
  });
  const debtForm = useWatch({ control });

  const fetchDebts = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const res = await fetch('/api/debts');
      if (!res.ok) throw new Error('Failed to fetch debts');
      setDebts((await res.json()) as Debt[]);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/debts'), fetch('/api/accounts')])
      .then(async ([debtsRes, accountsRes]) => {
        if (!active) return;
        if (!debtsRes.ok) throw new Error('Failed to fetch debts');
        setDebts((await debtsRes.json()) as Debt[]);
        if (accountsRes.ok) {
          const accs = (await accountsRes.json()) as AccountOption[];
          setAccounts(accs);
          const def = accs.find((a) => a.is_default) ?? accs[0];
          if (def) setValue('account_id', String(def.id));
        }
        setLoadError(false);
      })
      .catch(() => {
        if (active) setLoadError(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [setValue]);

  const handleAddDebt = async (values: DebtFormValues) => {
    try {
      const res = await fetch('/api/debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          direction: values.direction,
          name: values.name,
          creditor: values.creditor,
          total_amount: Number(values.total_amount.replace(/\D/g, '')),
          interest_rate: values.interest_rate ? Number(values.interest_rate) : 0,
          start_date: values.start_date,
          due_date: values.due_date,
          account_id: values.account_id ? Number(values.account_id) : null,
          note: values.note,
        }),
      });

      if (res.ok) {
        showToast('Đã thêm công nợ mới');
        setIsAddOpen(false);
        setDirectionFilter(values.direction);
        reset({
          direction: values.direction,
          name: '',
          creditor: '',
          total_amount: '',
          start_date: getVietnamToday(),
          due_date: '',
          interest_rate: '',
          account_id: values.account_id,
          note: '',
        });
        await fetchDebts();
      } else {
        const result = (await res.json()) as { error?: string };
        showToast(result.error || 'Không thể thêm công nợ', 'error');
      }
    } catch {
      showToast('Lỗi khi thêm công nợ', 'error');
    }
  };

  async function runSimulation(targetStrategy: PayoffStrategy = simStrategy) {
    const budget = parseMoneyInput(simBudget);
    if (budget <= 0) {
      showToast('Nhập ngân sách trả nợ hàng tháng lớn hơn 0', 'error');
      return;
    }
    setIsSimulating(true);
    try {
      const response = await fetch('/api/debts/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyBudget: budget, strategy: targetStrategy }),
      });
      const data = (await response.json()) as SimulationApiResponse & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể chạy giả lập');
      setSimResult(data);
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Lỗi giả lập trả nợ', 'error');
    } finally {
      setIsSimulating(false);
    }
  }

  const scopedDebts = debts.filter((d) => (d.direction ?? 'payable') === directionFilter);
  const payableCount = debts.filter((d) => (d.direction ?? 'payable') === 'payable' && d.status === 'active').length;
  const receivableCount = debts.filter((d) => d.direction === 'receivable' && d.status === 'active').length;

  const activeDebts = scopedDebts
    .filter((d) => d.status === 'active')
    .sort((left, right) => (left.due_date || '9999').localeCompare(right.due_date || '9999'));
  const completedDebts = scopedDebts.filter((d) => d.status === 'completed');

  const totalDebt = activeDebts.reduce((sum, d) => sum + d.total_amount, 0);
  const totalPaid = activeDebts.reduce((sum, d) => sum + d.paid_amount, 0);
  const remainingDebt = totalDebt - totalPaid;

  const calculateDaysRemaining = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="pb-nav mx-auto min-h-screen w-full max-w-7xl space-y-6 bg-background p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Công nợ 2 chiều</h1>
          <p className="text-sm text-muted-foreground">Theo dõi khoản đi vay &amp; cho vay, đồng bộ trực tiếp vào số dư ví</p>
        </div>
        <div className="flex items-center gap-2">
          {payableCount > 0 ? (
            <Dialog open={isSimOpen} onOpenChange={setIsSimOpen}>
              <DialogTrigger asChild>
                <Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => void runSimulation(simStrategy)}>
                  <Sparkles className="size-4 text-emerald-600" /> Giả lập trả nợ
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-2xl">
                <DialogHeader>
                  <DialogTitle>Giả lập lộ trình trả nợ</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="sim-budget">Ngân sách trả mỗi tháng</Label>
                      <Input
                        id="sim-budget"
                        inputMode="numeric"
                        value={simBudget}
                        onChange={(e) => setSimBudget(formatMoneyInput(e.target.value))}
                        className="h-10 rounded-xl tabular-nums"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Chiến lược ưu tiên</Label>
                      <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 p-1">
                        <button
                          type="button"
                          onClick={() => {
                            setSimStrategy('avalanche');
                            void runSimulation('avalanche');
                          }}
                          className={cn('rounded-lg py-1.5 text-xs font-medium transition', simStrategy === 'avalanche' ? 'bg-emerald-600 text-white' : 'text-slate-600')}
                        >
                          Avalanche (Lãi cao)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSimStrategy('snowball');
                            void runSimulation('snowball');
                          }}
                          className={cn('rounded-lg py-1.5 text-xs font-medium transition', simStrategy === 'snowball' ? 'bg-emerald-600 text-white' : 'text-slate-600')}
                        >
                          Snowball (Dư nhỏ)
                        </button>
                      </div>
                    </div>
                  </div>
                  <Button type="button" onClick={() => void runSimulation(simStrategy)} disabled={isSimulating} className="w-full rounded-xl">
                    {isSimulating ? 'Đang tính…' : 'Tính lại lộ trình'}
                  </Button>

                  {simResult ? (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-sm">
                      {simResult.warning ? (
                        <p className="rounded-lg bg-rose-50 p-2.5 text-xs font-medium text-rose-700">{simResult.warning}</p>
                      ) : (
                        <>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs text-slate-500">Dự kiến sạch nợ</p>
                              <p className="text-base font-bold text-emerald-700">{simResult.debtFreeMonthLabel} ({simResult.monthsRequired} tháng)</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Tổng tiền lãi ước tính</p>
                              <p className="text-base font-bold tabular-nums text-slate-900">{formatCurrency(simResult.totalInterestPaid)}</p>
                            </div>
                          </div>
                          {simResult.comparison && simResult.comparison.interestDelta !== 0 ? (
                            <p className="text-xs text-slate-600">
                              {simResult.comparison.interestDelta > 0
                                ? `Chiến lược ${simStrategy === 'avalanche' ? 'Avalanche' : 'Snowball'} giúp bạn tiết kiệm ${formatCurrency(simResult.comparison.interestDelta)} tiền lãi so với chiến lược còn lại.`
                                : `Chiến lược còn lại tiết kiệm hơn ${formatCurrency(Math.abs(simResult.comparison.interestDelta))} tiền lãi.`}
                            </p>
                          ) : null}
                          {simResult.perDebtPayoff.length > 0 ? (
                            <div className="space-y-1.5 border-t border-slate-200 pt-2.5">
                              <p className="text-xs font-semibold text-slate-700">Thứ tự tất toán từng khoản</p>
                              {simResult.perDebtPayoff.map((item, idx) => (
                                <div key={item.id} className="flex items-center justify-between text-xs">
                                  <span className="text-slate-700">{idx + 1}. {item.name}</span>
                                  <span className="font-medium tabular-nums text-emerald-700">Tháng {item.payoffMonthLabel}</span>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              </DialogContent>
            </Dialog>
          ) : null}
          <Button type="button" onClick={() => setIsAddOpen(true)} className="hidden h-10 rounded-xl md:inline-flex">
            <Plus className="size-4" /> Thêm công nợ
          </Button>
        </div>
      </header>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1">
        <button
          type="button"
          onClick={() => setDirectionFilter('payable')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition',
            directionFilter === 'payable' ? 'bg-rose-50 text-rose-700' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          <ArrowUpRight className="size-4" /> Khoản phải trả ({payableCount})
        </button>
        <button
          type="button"
          onClick={() => setDirectionFilter('receivable')}
          className={cn(
            'flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition',
            directionFilter === 'receivable' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:text-slate-900',
          )}
        >
          <ArrowDownLeft className="size-4" /> Cho vay / Phải thu ({receivableCount})
        </button>
      </div>

      {!isLoading && !loadError && scopedDebts.length > 0 && (
        <section className="grid grid-cols-2 overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-3 sm:divide-x sm:divide-border">
          <DebtMetric
            label={directionFilter === 'payable' ? 'Tổng nợ gốc' : 'Tổng cho vay'}
            value={totalDebt}
            icon={<Calculator className="size-4" />}
          />
          <DebtMetric
            label={directionFilter === 'payable' ? 'Đã trả' : 'Đã thu hồi'}
            value={totalPaid}
            tone="positive"
          />
          <DebtMetric
            label={directionFilter === 'payable' ? 'Còn phải trả' : 'Còn phải thu'}
            value={remainingDebt}
            className="col-span-2 sm:col-span-1"
          />
        </section>
      )}

      {loadError ? (
        <div role="alert" className="flex items-center justify-between rounded-xl border border-rose-200 bg-white p-4">
          <p className="text-sm text-rose-800">Không tải được danh sách công nợ.</p>
          <Button variant="outline" onClick={() => void fetchDebts()}>Thử lại</Button>
        </div>
      ) : (
        <Tabs defaultValue="active" className="w-full">
          <TabsList className="mb-3 grid w-full grid-cols-2 rounded-xl md:max-w-xs">
            <TabsTrigger value="active" className="rounded-lg">Đang theo dõi ({activeDebts.length})</TabsTrigger>
            <TabsTrigger value="completed" className="rounded-lg">Đã xong ({completedDebts.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="grid gap-4 outline-none">
            {isLoading ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Đang tải...</div>
            ) : activeDebts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white py-12 text-center text-muted-foreground shadow-sm xl:col-span-2">
                {directionFilter === 'payable' ? 'Không có khoản phải trả nào.' : 'Không có khoản cho vay / phải thu nào.'}
              </div>
            ) : (
              <>
                <div className="grid min-w-0 gap-4 xl:hidden">
                  {activeDebts.map((debt) => {
                    const progress = getPercentage(debt.paid_amount, debt.total_amount);
                    const daysRemaining = calculateDaysRemaining(debt.due_date);

                    return (
                      <Link href={`/debts/${debt.id}`} key={debt.id} className="block min-w-0">
                        <Card className="group cursor-pointer rounded-2xl border-border bg-white shadow-sm transition-colors hover:bg-slate-50/80">
                          <CardContent className="p-4">
                            <div className="mb-3 flex min-w-0 items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <h3 className="truncate text-base font-semibold transition-colors group-hover:text-primary">{debt.name}</h3>
                                <p className="truncate text-xs text-muted-foreground">{debt.creditor}</p>
                              </div>
                              <Badge
                                variant="outline"
                                className={cn(
                                  'rounded-full border-0 text-[10px] font-medium',
                                  daysRemaining < 30 ? 'bg-rose-500/10 text-rose-500' : 'bg-primary/10 text-primary',
                                )}
                              >
                                <CalendarDays className="mr-1 inline h-3 w-3" />
                                Còn {daysRemaining} ngày
                              </Badge>
                            </div>

                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="font-medium tabular-nums text-emerald-500">{formatCurrency(debt.paid_amount)}</span>
                                <span className="font-medium tabular-nums text-[#344554]">{formatCurrency(debt.total_amount)}</span>
                              </div>
                              <Progress value={progress} className="h-2 rounded-full" indicatorColor="bg-emerald-500" />
                              <div className="mt-1 flex items-center justify-between">
                                <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
                                <div className="flex items-center text-xs text-muted-foreground">
                                  Chi tiết <ChevronRight className="ml-0.5 h-3 w-3" />
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
                <DebtTable debts={activeDebts} active direction={directionFilter} />
              </>
            )}
          </TabsContent>

          <TabsContent value="completed" className="grid gap-4 outline-none">
            {completedDebts.length === 0 ? (
              <div className="rounded-2xl border border-border bg-white py-12 text-center text-muted-foreground shadow-sm xl:col-span-2">
                Chưa có khoản nào hoàn thành.
              </div>
            ) : (
              <>
                <div className="grid gap-4 xl:hidden">
                  {completedDebts.map((debt) => (
                    <Link href={`/debts/${debt.id}`} key={debt.id} className="block">
                      <Card className="group cursor-pointer rounded-2xl border-border bg-white opacity-70 shadow-sm transition-colors hover:bg-slate-50/80">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <h3 className="text-sm font-medium group-hover:text-primary">{debt.name}</h3>
                              <p className="text-xs text-muted-foreground">{debt.creditor}</p>
                            </div>
                            <div className="text-right">
                              <div className="text-sm font-medium text-[#344554]">{formatCurrency(debt.total_amount)}</div>
                              <Badge variant="secondary" className="mt-1 rounded-full bg-emerald-500/20 text-[10px] text-emerald-500 hover:bg-emerald-500/30">
                                Hoàn thành
                              </Badge>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
                <DebtTable debts={completedDebts} active={false} direction={directionFilter} />
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            aria-label="Thêm công nợ"
            className="fixed bottom-[84px] right-6 h-14 w-14 rounded-full p-0 shadow-lg md:hidden"
            size="icon"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </DialogTrigger>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[min(480px,calc(100vw-1rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl p-0 sm:max-h-[calc(100dvh-2rem)] sm:max-w-[min(480px,calc(100vw-2rem))]">
          <DialogHeader className="border-b border-slate-200 px-5 py-4 pr-14">
            <DialogTitle>Thêm công nợ mới</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(handleAddDebt)} noValidate className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
            <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-5">
              <div className="space-y-2">
                <Label>Loại công nợ</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setValue('direction', 'payable', { shouldValidate: true })}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-xs font-semibold transition',
                      debtForm.direction === 'payable' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-slate-200 bg-white text-slate-600',
                    )}
                  >
                    Tôi đi vay (Phải trả)
                  </button>
                  <button
                    type="button"
                    onClick={() => setValue('direction', 'receivable', { shouldValidate: true })}
                    className={cn(
                      'rounded-xl border px-3 py-2.5 text-xs font-semibold transition',
                      debtForm.direction === 'receivable' ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600',
                    )}
                  >
                    Tôi cho vay (Phải thu)
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Tên khoản công nợ</Label>
                <Input id="name" placeholder="VD: Mua xe, Cho bạn mượn..." aria-invalid={Boolean(errors.name)} {...register('name')} />
                {errors.name ? <FieldError message={errors.name.message} /> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="creditor">{debtForm.direction === 'receivable' ? 'Người vay' : 'Chủ nợ / Ngân hàng'}</Label>
                <Input id="creditor" placeholder={debtForm.direction === 'receivable' ? 'VD: Anh Minh, Bạn An...' : 'VD: Vietcombank, Anh Tâm...'} aria-invalid={Boolean(errors.creditor)} {...register('creditor')} />
                {errors.creditor ? <FieldError message={errors.creditor.message} /> : null}
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="total_amount">Tổng số tiền</Label>
                  <Input
                    id="total_amount"
                    type="text"
                    inputMode="numeric"
                    className="tabular-nums"
                    placeholder="100.000"
                    aria-invalid={Boolean(errors.total_amount)}
                    value={debtForm.total_amount ?? ''}
                    onChange={(event) =>
                      setValue('total_amount', event.target.value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.'), {
                        shouldValidate: true,
                      })
                    }
                  />
                  {errors.total_amount ? <FieldError message={errors.total_amount.message} /> : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="interest_rate">Lãi suất (% / năm)</Label>
                  <Input id="interest_rate" type="number" min="0" step="0.1" className="tabular-nums" placeholder="0" {...register('interest_rate')} />
                </div>
              </div>
              {accounts.length > 0 ? (
                <div className="space-y-2">
                  <Label htmlFor="debt-account">Ví mặc định khi thanh toán/thu</Label>
                  <Select value={debtForm.account_id || ''} onValueChange={(v) => setValue('account_id', v)}>
                    <SelectTrigger id="debt-account" className="h-10 rounded-xl bg-white">
                      <SelectValue placeholder="Chọn ví" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((acc) => (
                        <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <DatePicker id="start_date" label="Ngày bắt đầu" value={debtForm.start_date ?? getVietnamToday()} onChange={(value) => setValue('start_date', value, { shouldValidate: true })} invalid={Boolean(errors.start_date)} />
                  {errors.start_date ? <FieldError message={errors.start_date.message} /> : null}
                </div>
                <div className="space-y-2">
                  <DatePicker id="due_date" label="Hạn thanh toán" value={debtForm.due_date ?? ''} min={debtForm.start_date ?? getVietnamToday()} onChange={(value) => setValue('due_date', value, { shouldValidate: true })} invalid={Boolean(errors.due_date)} />
                  {errors.due_date ? <FieldError message={errors.due_date.message} /> : null}
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="debt-note">Ghi chú</Label>
                <Input id="debt-note" placeholder="Thêm thông tin nếu cần" {...register('note')} />
              </div>
            </div>
            <div className="border-t border-slate-200 bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
              <Button type="submit" disabled={isSubmitting} className="h-11 w-full rounded-xl font-semibold">
                Thêm công nợ
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-xs font-medium text-red-600">{message}</p> : null;
}

function DebtMetric({ label, value, icon, tone = 'default', className }: { label: string; value: number; icon?: React.ReactNode; tone?: 'default' | 'positive'; className?: string }) {
  return (
    <div className={cn('min-w-0 px-4 py-4 sm:px-5', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</p>
      <p className={cn('mt-2 truncate text-xl font-semibold tracking-tight tabular-nums', tone === 'positive' ? 'text-emerald-600' : 'text-slate-900')}>{formatCurrency(value)}</p>
    </div>
  );
}

function DebtTable({ debts: rows, active, direction }: { debts: Debt[]; active: boolean; direction: 'payable' | 'receivable' }) {
  if (rows.length === 0) return null;
  return (
    <section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white xl:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-6 py-3 font-medium">Khoản công nợ</th>
              <th className="px-4 py-3 font-medium">{direction === 'receivable' ? 'Người vay' : 'Chủ nợ'}</th>
              <th className="px-4 py-3 font-medium">Tiến độ</th>
              <th className="px-4 py-3 font-medium">Hạn thanh toán</th>
              <th className="px-6 py-3 text-right font-medium">Còn lại</th>
              <th className="w-24 px-4 py-3"><span className="sr-only">Chi tiết</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((debt) => {
              const pct = Math.round(getPercentage(debt.paid_amount, debt.total_amount));
              const overdue = active && debt.due_date && debt.due_date < getVietnamToday();
              return (
                <tr key={debt.id} className="hover:bg-slate-50/70">
                  <td className="px-6 py-4">
                    <Link href={`/debts/${debt.id}`} className="font-semibold text-slate-800 hover:text-sky-800">{debt.name}</Link>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{debt.creditor}</td>
                  <td className="min-w-48 px-4 py-4">
                    <div className="flex items-center gap-3">
                      <Progress value={pct} className="h-2 flex-1" indicatorColor={active ? 'bg-emerald-500' : 'bg-slate-400'} />
                      <span className="w-10 text-right text-xs tabular-nums text-slate-500">{pct}%</span>
                    </div>
                    <p className="mt-1 text-xs tabular-nums text-slate-400">{formatCurrency(debt.paid_amount)} / {formatCurrency(debt.total_amount)}</p>
                  </td>
                  <td className={cn('whitespace-nowrap px-4 py-4', overdue ? 'text-rose-700' : 'text-slate-600')}>
                    {debt.due_date ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${debt.due_date}T00:00:00`)) : '—'}
                    {overdue && <span className="mt-1 block text-xs font-medium">Quá hạn</span>}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-right font-semibold tabular-nums text-slate-800">
                    {formatCurrency(Math.max(0, debt.total_amount - debt.paid_amount))}
                  </td>
                  <td className="px-4 py-4">
                    <Link href={`/debts/${debt.id}`} className="text-xs font-medium text-emerald-800 hover:underline" aria-label={`Chi tiết ${debt.name}`}>Chi tiết</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
