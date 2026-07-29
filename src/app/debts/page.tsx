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
import { formatCurrency, getPercentage, cn } from "@/lib/utils";

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
  const [newDebt, setNewDebt] = useState({
    name: "",
    creditor: "",
    total_amount: "",
    due_date: "",
    interest_rate: "",
  });

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

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...newDebt,
          total_amount: Number(newDebt.total_amount),
          interest_rate: newDebt.interest_rate ? Number(newDebt.interest_rate) : 0,
        }),
      });

      if (res.ok) {
        showToast("Đã thêm công nợ mới");
        setIsAddOpen(false);
        setNewDebt({ name: "", creditor: "", total_amount: "", due_date: "", interest_rate: "" });
        fetchDebts();
      } else {
        showToast("Không thể thêm công nợ", "error");
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
    <div className="pb-nav min-h-screen bg-background max-w-lg mx-auto p-4 space-y-6">
      <header className="flex justify-between items-center pt-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Công nợ</h1>
          <p className="text-muted-foreground text-sm">Quản lý khoản vay và cho vay</p>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="rounded-2xl border-border bg-white shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center h-full">
            <div className="text-muted-foreground text-xs font-medium mb-1 flex items-center gap-1">
              <Calculator className="h-3 w-3" /> Tổng nợ gốc
            </div>
            <div className="text-xl font-bold tracking-tight tabular-nums text-[#344554]">
              {formatCurrency(totalDebt)}
            </div>
          </CardContent>
        </Card>
        <Card className="rounded-2xl border-border bg-white shadow-sm">
          <CardContent className="p-4 flex flex-col justify-center h-full">
            <div className="text-muted-foreground text-xs font-medium mb-1 flex items-center gap-1">
              Đã trả
            </div>
            <div className="text-xl font-bold tracking-tight tabular-nums text-emerald-500">
              {formatCurrency(totalPaid)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Còn lại: {formatCurrency(remainingDebt)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-xl mb-4">
          <TabsTrigger value="active" className="rounded-lg">Đang trả ({activeDebts.length})</TabsTrigger>
          <TabsTrigger value="completed" className="rounded-lg">Đã xong ({completedDebts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-4 outline-none">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Đang tải...</div>
          ) : activeDebts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-white rounded-2xl border border-border shadow-sm">
              Không có công nợ nào đang trả.
            </div>
          ) : (
            activeDebts.map((debt) => {
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
            })
          )}
        </TabsContent>

        <TabsContent value="completed" className="space-y-4 outline-none">
          {completedDebts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground bg-white rounded-2xl border border-border shadow-sm">
              Chưa có khoản nợ nào hoàn thành.
            </div>
          ) : (
            completedDebts.map((debt) => (
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
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* FAB Add Debt */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogTrigger render={
          <Button
            className="fixed bottom-[84px] right-6 h-14 w-14 rounded-full shadow-lg p-0 md:bottom-8 md:right-8"
            size="icon"
          >
            <Plus className="h-6 w-6" />
          </Button>
        } />
        <DialogContent className="rounded-2xl max-w-md mx-auto sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Thêm khoản nợ mới</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddDebt} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="name">Tên khoản nợ</Label>
              <Input
                id="name"
                required
                className="rounded-xl"
                placeholder="VD: Mua xe, Trả góp nhà..."
                value={newDebt.name}
                onChange={(e) => setNewDebt({ ...newDebt, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="creditor">Chủ nợ / Ngân hàng</Label>
              <Input
                id="creditor"
                required
                className="rounded-xl"
                placeholder="VD: Vietcombank, Anh Tâm..."
                value={newDebt.creditor}
                onChange={(e) => setNewDebt({ ...newDebt, creditor: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="total_amount">Tổng số tiền</Label>
              <Input
                id="total_amount"
                type="number"
                required
                className="rounded-xl"
                placeholder="0"
                value={newDebt.total_amount}
                onChange={(e) => setNewDebt({ ...newDebt, total_amount: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="interest_rate">Lãi suất (%)</Label>
                <Input
                  id="interest_rate"
                  type="number"
                  step="0.1"
                  className="rounded-xl"
                  placeholder="0"
                  value={newDebt.interest_rate}
                  onChange={(e) => setNewDebt({ ...newDebt, interest_rate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">Hạn trả</Label>
                <Input
                  id="due_date"
                  type="date"
                  required
                  className="rounded-xl"
                  value={newDebt.due_date}
                  onChange={(e) => setNewDebt({ ...newDebt, due_date: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" className="w-full rounded-xl mt-4">
              Thêm công nợ
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
