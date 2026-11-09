"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, ChevronRight, Calculator, CalendarDays } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/useToast";
import { formatCurrency, getPercentage, cn, getVietnamToday } from "@/lib/utils";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { DatePicker } from '@/components/ui/date-picker';

const debtSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên khoản nợ').max(120),
  creditor: z.string().trim().min(1, 'Nhập chủ nợ hoặc ngân hàng').max(120),
  total_amount: z.string().refine((value) => Number(value.replace(/\D/g, '')) > 0, 'Số tiền phải lớn hơn 0'),
  start_date: z.string().min(1, 'Chọn ngày bắt đầu'),
  due_date: z.string().min(1, 'Chọn hạn trả'),
  interest_rate: z.string(),
  note: z.string().max(500, 'Ghi chú tối đa 500 ký tự'),
}).refine((value) => value.due_date >= value.start_date, { path: ['due_date'], message: 'Hạn trả phải sau ngày bắt đầu' });
type DebtFormValues = z.infer<typeof debtSchema>;

type Debt = {
  id: string;
  name: string;
  creditor: string;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  status: "active" | "completed";
  interest_rate?: number;
};

export default function DebtsPage() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  // Add Debt Form State
  const [isAddOpen, setIsAddOpen] = useState(false);
  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm<DebtFormValues>({
    resolver: zodResolver(debtSchema),
    defaultValues: { name: '', creditor: '', total_amount: '', start_date: getVietnamToday(), due_date: '', interest_rate: '', note: '' },
  });
  const debtForm = watch();

  const fetchDebts = async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/debts");
      if (res.ok) {
        const data = await res.json();
        setDebts(data);
      }
    } catch (error) {
      console.error("Failed to fetch debts", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Initial remote data synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchDebts();
  }, []);

  const handleAddDebt = async (values: DebtFormValues) => {
    try {
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          total_amount: Number(values.total_amount.replace(/\D/g, '')),
          interest_rate: values.interest_rate ? Number(values.interest_rate) : 0,
        }),
      });

      if (res.ok) {
        showToast("Đã thêm công nợ mới");
        setIsAddOpen(false);
        reset({ name: '', creditor: '', total_amount: '', start_date: getVietnamToday(), due_date: '', interest_rate: '', note: '' });
        fetchDebts();
      } else {
        const result = await res.json() as { error?: string };
        showToast(result.error || "Không thể thêm công nợ", "error");
      }
    } catch {
      showToast("Lỗi khi thêm công nợ", "error");
    }
  };

  const activeDebts = debts.filter((d) => d.status === "active");
  const completedDebts = debts.filter((d) => d.status === "completed");

  const totalDebt = activeDebts.reduce((sum, d) => sum + d.total_amount, 0);
  const totalPaid = activeDebts.reduce((sum, d) => sum + d.paid_amount, 0);
  const remainingDebt = totalDebt - totalPaid;

  const calculateDaysRemaining = (dueDate: string) => {
    const due = new Date(dueDate);
    const now = new Date();
    const diffTime = due.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  return (
    <div className="pb-nav mx-auto min-h-screen w-full max-w-7xl space-y-6 bg-background p-4 md:p-8">
      <header className="flex justify-between items-center pt-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Công nợ</h1>
          <p className="text-muted-foreground text-sm">Quản lý khoản vay và cho vay</p>
        </div>
        <Button type="button" onClick={() => setIsAddOpen(true)} className="hidden h-10 rounded-xl md:inline-flex">
          <Plus className="size-4" /> Thêm khoản nợ
        </Button>
      </header>

      <section className="grid max-w-5xl grid-cols-2 overflow-hidden rounded-2xl border border-border bg-white shadow-sm sm:grid-cols-3 sm:divide-x sm:divide-border">
        <DebtMetric label="Tổng nợ gốc" value={totalDebt} icon={<Calculator className="size-4" />} />
        <DebtMetric label="Đã thanh toán" value={totalPaid} tone="positive" />
        <DebtMetric label="Còn phải trả" value={remainingDebt} className="col-span-2 sm:col-span-1" />
      </section>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-xl mb-4">
          <TabsTrigger value="active" className="rounded-lg">Đang trả ({activeDebts.length})</TabsTrigger>
          <TabsTrigger value="completed" className="rounded-lg">Đã xong ({completedDebts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="grid gap-4 outline-none">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Đang tải...</div>
          ) : activeDebts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-white rounded-2xl border border-border shadow-sm xl:col-span-2">
              Không có công nợ nào đang trả.
            </div>
          ) : <>
            <div className="grid gap-4 xl:hidden">{activeDebts.map((debt) => {
              const progress = getPercentage(debt.paid_amount, debt.total_amount);
              const daysRemaining = calculateDaysRemaining(debt.due_date);
              
              return (
                <Link href={`/debts/${debt.id}`} key={debt.id} className="block">
                  <Card className="rounded-2xl border-border bg-white hover:bg-slate-50/80 transition-colors shadow-sm cursor-pointer group">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-semibold text-base group-hover:text-primary transition-colors">{debt.name}</h3>
                          <p className="text-xs text-muted-foreground">{debt.creditor}</p>
                        </div>
                        <Badge variant="outline" className={cn(
                          "rounded-full text-[10px] font-medium border-0",
                          daysRemaining < 30 ? "bg-rose-500/10 text-rose-500" : "bg-primary/10 text-primary"
                        )}>
                          <CalendarDays className="w-3 h-3 mr-1 inline" />
                          Còn {daysRemaining} ngày
                        </Badge>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-emerald-500 font-medium tabular-nums">{formatCurrency(debt.paid_amount)}</span>
                          <span className="text-[#344554] font-medium tabular-nums">{formatCurrency(debt.total_amount)}</span>
                        </div>
                        <Progress value={progress} className="h-2 rounded-full" indicatorColor="bg-emerald-500" />
                        <div className="flex justify-between items-center mt-1">
                           <span className="text-xs text-muted-foreground">{progress}%</span>
                           <div className="text-xs text-muted-foreground flex items-center">
                              Chi tiết <ChevronRight className="w-3 h-3 ml-0.5" />
                           </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}</div>
            <DebtTable debts={activeDebts} active />
          </>}
        </TabsContent>

        <TabsContent value="completed" className="grid gap-4 outline-none">
          {completedDebts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-white rounded-2xl border border-border shadow-sm xl:col-span-2">
              Chưa có khoản nợ nào hoàn thành.
            </div>
          ) : <>
            <div className="grid gap-4 xl:hidden">{completedDebts.map((debt) => (
              <Link href={`/debts/${debt.id}`} key={debt.id} className="block">
                <Card className="rounded-2xl border-border bg-white hover:bg-slate-50/80 transition-colors shadow-sm cursor-pointer opacity-70 group">
                  <CardContent className="p-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="font-medium text-sm group-hover:text-primary">{debt.name}</h3>
                        <p className="text-xs text-muted-foreground">{debt.creditor}</p>
                      </div>
                      <div className="text-right">
                        <div className="text-[#344554] font-medium text-sm">{formatCurrency(debt.total_amount)}</div>
                        <Badge variant="secondary" className="rounded-full text-[10px] bg-emerald-500/20 text-emerald-500 mt-1 hover:bg-emerald-500/30">
                          Hoàn thành
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}</div>
            <DebtTable debts={completedDebts} active={false} />
          </>}
        </TabsContent>
      </Tabs>

      {/* FAB Add Debt */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogTrigger asChild>
          <Button
            aria-label="Thêm khoản nợ"
            className="fixed bottom-[84px] right-6 h-14 w-14 rounded-full p-0 shadow-lg md:hidden"
            size="icon"
          >
            <Plus className="h-6 w-6" />
          </Button>
        </DialogTrigger>
        <DialogContent className="rounded-2xl max-w-md mx-auto sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Thêm khoản nợ mới</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(handleAddDebt)} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tên khoản nợ</Label>
              <Input id="name" className="rounded-xl" placeholder="VD: Mua xe, Trả góp nhà..." aria-invalid={Boolean(errors.name)} {...register('name')} />
              {errors.name ? <FieldError message={errors.name.message} /> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditor">Chủ nợ / Ngân hàng</Label>
              <Input id="creditor" className="rounded-xl" placeholder="VD: Vietcombank, Anh Tâm..." aria-invalid={Boolean(errors.creditor)} {...register('creditor')} />
              {errors.creditor ? <FieldError message={errors.creditor.message} /> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_amount">Tổng số tiền</Label>
              <Input id="total_amount" type="text" inputMode="numeric" className="rounded-xl" placeholder="100.000" aria-invalid={Boolean(errors.total_amount)} value={debtForm.total_amount} onChange={(event) => setValue('total_amount', event.target.value.replace(/\D/g, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.'), { shouldValidate: true })} />
              {errors.total_amount ? <FieldError message={errors.total_amount.message} /> : null}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <DatePicker id="start_date" label="Ngày bắt đầu" value={debtForm.start_date} onChange={(value) => setValue('start_date', value, { shouldValidate: true })} invalid={Boolean(errors.start_date)} />
                {errors.start_date ? <FieldError message={errors.start_date.message} /> : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="interest_rate">Lãi suất (%)</Label>
                <Input id="interest_rate" type="number" min="0" step="0.1" className="rounded-xl" placeholder="0" {...register('interest_rate')} />
              </div>
              <div className="space-y-2">
                <DatePicker id="due_date" label="Hạn trả" value={debtForm.due_date} min={debtForm.start_date} onChange={(value) => setValue('due_date', value, { shouldValidate: true })} invalid={Boolean(errors.due_date)} />
                {errors.due_date ? <FieldError message={errors.due_date.message} /> : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="debt-note">Ghi chú</Label>
              <Input id="debt-note" className="rounded-xl" {...register('note')} />
            </div>
            <Button type="submit" disabled={isSubmitting} className="mt-4 w-full rounded-xl">
              Thêm công nợ
            </Button>
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
  return <div className={cn('min-w-0 px-4 py-4 sm:px-5', className)}><p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">{icon}{label}</p><p className={cn('mt-2 truncate text-xl font-semibold tracking-tight tabular-nums', tone === 'positive' ? 'text-emerald-600' : 'text-slate-900')}>{formatCurrency(value)}</p></div>;
}

function DebtTable({ debts: rows, active }: { debts: Debt[]; active: boolean }) {
  if (rows.length === 0) return null;
  return <section className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white xl:block"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-6 py-3 font-medium">Khoản nợ</th><th className="px-4 py-3 font-medium">Chủ nợ</th><th className="px-4 py-3 font-medium">Tiến độ</th><th className="px-4 py-3 font-medium">Hạn trả</th><th className="px-6 py-3 text-right font-medium">Còn lại</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((debt) => { const pct = getPercentage(debt.paid_amount, debt.total_amount); return <tr key={debt.id} className="hover:bg-slate-50/70"><td className="px-6 py-4"><Link href={`/debts/${debt.id}`} className="font-semibold text-slate-800 hover:text-sky-800">{debt.name}</Link></td><td className="px-4 py-4 text-slate-600">{debt.creditor}</td><td className="min-w-48 px-4 py-4"><div className="flex items-center gap-3"><Progress value={pct} className="h-2 flex-1" indicatorColor={active ? 'bg-emerald-500' : 'bg-slate-400'} /><span className="w-10 text-right text-xs tabular-nums text-slate-500">{pct}%</span></div><p className="mt-1 text-xs tabular-nums text-slate-400">{formatCurrency(debt.paid_amount)} / {formatCurrency(debt.total_amount)}</p></td><td className="whitespace-nowrap px-4 py-4 text-slate-600">{debt.due_date ? new Intl.DateTimeFormat('vi-VN').format(new Date(`${debt.due_date}T00:00:00`)) : '—'}</td><td className="whitespace-nowrap px-6 py-4 text-right font-semibold tabular-nums text-slate-800">{formatCurrency(Math.max(0, debt.total_amount - debt.paid_amount))}</td></tr>; })}</tbody></table></div></section>;
}
