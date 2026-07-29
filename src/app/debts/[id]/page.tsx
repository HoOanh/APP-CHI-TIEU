"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, MessageSquare, Plus, Info, Clock, PiggyBank, History, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/useToast";
import { formatCurrency, formatDate, getPercentage, cn } from "@/lib/utils";

type Debt = {
  id: string;
  name: string;
  creditor: string;
  total_amount: number;
  paid_amount: number;
  due_date: string;
  start_date: string;
  status: "active" | "completed";
  interest_rate: number;
};

type Payment = {
  id: string;
  amount: number;
  date: string;
  note: string;
};

type DebtJar = {
  id: string;
  month: string; // YYYY-MM
  target_amount: number;
  saved_amount: number;
};

export default function DebtDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [debt, setDebt] = useState<Debt | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [jars, setJars] = useState<DebtJar[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { showToast } = useToast();

  // Modals state
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [isJarOpen, setIsJarOpen] = useState(false);
  
  const [newPayment, setNewPayment] = useState({ amount: "", note: "" });
  const [newJar, setNewJar] = useState({ target_amount: "", month: new Date().toISOString().slice(0, 7) });

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      // Mock API calls for now, replace with real ones
      const [debtRes, paymentsRes, jarsRes] = await Promise.all([
        fetch(`/api/debts/${id}`),
        fetch(`/api/debts/${id}/payments`),
        fetch(`/api/debts/jars?debt_id=${id}`)
      ]);
      
      if (debtRes.ok) setDebt(await debtRes.json());
      if (paymentsRes.ok) setPayments(await paymentsRes.json());
      if (jarsRes.ok) setJars(await jarsRes.json());
    } catch (error) {
      console.error("Fetch error", error);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // Load the route-scoped debt after the dynamic id is available.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/debts/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: Number(newPayment.amount), note: newPayment.note }),
      });
      if (res.ok) {
        showToast("Đã ghi nhận thanh toán");
        setIsPaymentOpen(false);
        setNewPayment({ amount: "", note: "" });
        fetchData();
      }
    } catch {
      showToast("Lỗi khi thêm thanh toán", "error");
    }
  };

  const handleAddJar = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/debts/jars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ debt_id: id, ...newJar, target_amount: Number(newJar.target_amount) }),
      });
      if (res.ok) {
        showToast("Đã cập nhật hũ tiết kiệm trả nợ");
        setIsJarOpen(false);
        setNewJar({ ...newJar, target_amount: "" });
        fetchData();
      }
    } catch {
      showToast("Lỗi cập nhật hũ", "error");
    }
  };

  if (isLoading) {
    return <div className="min-h-screen bg-background flex items-center justify-center">Đang tải...</div>;
  }

  if (!debt) {
    return <div className="min-h-screen bg-background p-4">Không tìm thấy khoản nợ</div>;
  }

  const progress = getPercentage(debt.paid_amount, debt.total_amount);
  const remaining = debt.total_amount - debt.paid_amount;
  
  // Circular Progress SVG logic
  const radius = 45;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="pb-nav min-h-screen bg-background max-w-lg mx-auto p-4 space-y-6">
      <header className="flex items-center gap-3 pt-2">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full h-10 w-10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold truncate">{debt.name}</h1>
          <p className="text-sm text-muted-foreground">{debt.creditor}</p>
        </div>
      </header>

      {/* Main Progress Overview */}
      <Card className="rounded-2xl border-border bg-white shadow-sm overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-emerald-500/10 to-transparent pointer-events-none" />
        <CardContent className="p-6">
          <div className="flex justify-center mb-6">
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Background circle */}
              <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r={radius} stroke="currentColor" strokeWidth="6" fill="transparent" className="text-muted/20" />
                {/* Progress circle */}
                <circle 
                  cx="50" cy="50" r={radius} 
                  stroke="#00BC7C" strokeWidth="6" fill="transparent" 
                  strokeDasharray={circumference} 
                  strokeDashoffset={strokeDashoffset} 
                  strokeLinecap="round" 
                  className="transition-all duration-1000 ease-in-out" 
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold tabular-nums text-[#344554]">{progress}%</span>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-2 text-center divide-x divide-border">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Đã trả</p>
              <p className="font-semibold text-emerald-500 text-sm tabular-nums">{formatCurrency(debt.paid_amount)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Còn lại</p>
              <p className="font-semibold text-foreground text-sm tabular-nums">{formatCurrency(remaining)}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Tổng nợ</p>
              <p className="font-semibold text-muted-foreground text-sm tabular-nums">{formatCurrency(debt.total_amount)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
          <DialogTrigger render={
            <Button className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> Trả nợ
            </Button>
          } />
          <DialogContent className="rounded-2xl max-w-sm">
            <DialogHeader>
              <DialogTitle>Ghi nhận trả nợ</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAddPayment} className="space-y-4 mt-2">
              <div className="space-y-2">
                <Label>Số tiền</Label>
                <Input type="number" required className="rounded-xl" value={newPayment.amount} onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Ghi chú</Label>
                <Input className="rounded-xl" value={newPayment.note} onChange={(e) => setNewPayment({ ...newPayment, note: e.target.value })} />
              </div>
              <Button type="submit" className="w-full rounded-xl">Lưu</Button>
            </form>
          </DialogContent>
        </Dialog>

        <Link href="/debt-chat" className={cn(buttonVariants({ variant: "outline" }), "w-full h-12 rounded-xl border-emerald-500/30 text-emerald-500 hover:bg-emerald-500/10 shadow-sm flex items-center gap-2")}>
          <MessageSquare className="h-4 w-4" /> Trả bằng AI
        </Link>
      </div>

      {/* Info Grid */}
      <Card className="rounded-2xl border-border bg-white shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Info className="h-4 w-4 text-primary" /> Thông tin chi tiết
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          <div className="grid grid-cols-2 gap-y-4 gap-x-4">
            <div>
              <p className="text-xs text-muted-foreground">Lãi suất</p>
              <p className="font-medium text-sm">{debt.interest_rate}% / năm</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Ước tính lãi (tháng)</p>
              <p className="font-medium text-sm tabular-nums">{formatCurrency((remaining * (debt.interest_rate/100)) / 12)}</p>
            </div>
            <Separator className="col-span-2" />
            <div>
              <p className="text-xs text-muted-foreground">Ngày bắt đầu</p>
              <p className="font-medium text-sm">{formatDate(debt.start_date || new Date().toISOString())}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Hạn trả</p>
              <p className="font-medium text-sm">{formatDate(debt.due_date)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Jars Section */}
      <Card className="rounded-2xl border-border bg-white shadow-sm">
        <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-rose-500" /> Hũ tiết kiệm trả nợ
          </CardTitle>
          <Dialog open={isJarOpen} onOpenChange={setIsJarOpen}>
            <DialogTrigger render={
              <Button variant="ghost" size="sm" className="h-8 rounded-lg text-xs">Cập nhật</Button>
            } />
            <DialogContent className="rounded-2xl max-w-sm">
              <DialogHeader><DialogTitle>Cập nhật hũ tháng {newJar.month}</DialogTitle></DialogHeader>
              <form onSubmit={handleAddJar} className="space-y-4 mt-2">
                <div className="space-y-2">
                  <Label>Tháng</Label>
                  <Input type="month" required className="rounded-xl" value={newJar.month} onChange={(e) => setNewJar({ ...newJar, month: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Mục tiêu để dành</Label>
                  <Input type="number" required className="rounded-xl" value={newJar.target_amount} onChange={(e) => setNewJar({ ...newJar, target_amount: e.target.value })} />
                </div>
                <Button type="submit" className="w-full rounded-xl">Lưu</Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {jars.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">Chưa có kế hoạch tiết kiệm</p>
          ) : (
            <div className="space-y-4">
              {jars.map(jar => {
                const jarProg = getPercentage(jar.saved_amount, jar.target_amount);
                return (
                  <div key={jar.id} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-medium">Tháng {jar.month}</span>
                      <span className="text-muted-foreground tabular-nums">{formatCurrency(jar.saved_amount)} / {formatCurrency(jar.target_amount)}</span>
                    </div>
                    <Progress value={jarProg} className="h-1.5" indicatorColor="bg-rose-500" />
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card className="rounded-2xl border-border bg-white shadow-sm">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <History className="h-4 w-4 text-primary" /> Lịch sử trả nợ
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {payments.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">Chưa có lịch sử giao dịch</p>
          ) : (
            <ScrollArea className="h-[250px]">
              <div className="divide-y divide-border">
                {payments.map(p => (
                  <div key={p.id} className="p-4 flex items-center justify-between hover:bg-accent/30 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                        <FileText className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{p.note || "Trả nợ"}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" /> {formatDate(p.date)}
                        </p>
                      </div>
                    </div>
                    <div className="text-emerald-500 font-semibold tabular-nums text-sm">
                      +{formatCurrency(p.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
