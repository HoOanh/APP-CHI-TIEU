'use client';

import { Upload } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatMoneyInput } from '@/lib/utils';
import type { BudgetCategory } from './types';

export function BudgetDeleteAlert({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa ngân sách?</AlertDialogTitle>
          <AlertDialogDescription>
            Chỉ hũ ngân sách bị xóa; các giao dịch đã ghi vẫn được giữ lại.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Xóa ngân sách
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BudgetImportDialog({
  open,
  onOpenChange,
  importJson,
  onImportJsonChange,
  isImporting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importJson: string;
  onImportJsonChange: (value: string) => void;
  isImporting: boolean;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[min(680px,calc(100dvh-1rem))] w-[560px] max-w-[calc(100vw-1rem)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-[24px] p-0 sm:max-w-[calc(100vw-2rem)]">
        <DialogHeader className="border-b border-border px-5 py-4 pr-14">
          <DialogTitle>Import danh sách ngân sách</DialogTitle>
          <DialogDescription className="text-xs">
            Dán JSON array. Nếu không có month, app dùng tháng đang chọn.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 p-4">
          <Textarea
            value={importJson}
            onChange={(event) => onImportJsonChange(event.target.value)}
            className="field-sizing-fixed h-full min-h-0 resize-none overflow-y-auto rounded-xl bg-muted/30 p-3 font-mono text-xs leading-5"
            placeholder={`[\n  {\n    "category": "Ăn uống",\n    "budget_amount": 3900000,\n    "warning_percent": 80,\n    "daily_limit": 130000\n  }\n]`}
          />
        </div>
        <div className="border-t border-border bg-background px-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-3">
          <Button onClick={onSubmit} disabled={!importJson.trim() || isImporting} className="h-11 w-full rounded-xl">
            <Upload className="size-4" />
            {isImporting ? 'Đang import…' : 'Kiểm tra và import'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PaydaySplitDialog({
  open,
  onOpenChange,
  month,
  categories,
  splitIncome,
  onSplitIncomeChange,
  splitAllocations,
  onAllocationChange,
  isSplitting,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  month: string;
  categories: BudgetCategory[];
  splitIncome: string;
  onSplitIncomeChange: (value: string) => void;
  splitAllocations: Record<string, string>;
  onAllocationChange: (categoryId: string, value: string) => void;
  isSplitting: boolean;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-md overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle>Chia hũ từ thu nhập (Payday Split)</DialogTitle>
          <DialogDescription className="text-xs">
            Nhập số tiền thu nhập vừa nhận và chia tỷ lệ (%) vào các hũ ngân sách tháng {month}.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="payday-income">Số tiền thu nhập muốn chia (VND)</Label>
            <Input
              id="payday-income"
              inputMode="numeric"
              value={splitIncome}
              onChange={(event) => onSplitIncomeChange(formatMoneyInput(event.target.value))}
              className="h-10 rounded-xl tabular-nums"
            />
          </div>
          <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
            {categories
              .filter((cat) => cat.name !== 'Thu nhập')
              .map((cat) => (
                <div key={cat.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-xs">
                  <span className="font-medium text-slate-800">{cat.name}</span>
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      placeholder="0"
                      value={splitAllocations[cat.id] ?? ''}
                      onChange={(event) => onAllocationChange(cat.id, event.target.value)}
                      className="h-8 w-20 rounded-lg text-right tabular-nums"
                    />
                    <span className="text-slate-500">%</span>
                  </div>
                </div>
              ))}
          </div>
          <Button type="submit" disabled={isSplitting} className="h-11 w-full rounded-xl font-semibold">
            {isSplitting ? 'Đang phân bổ…' : 'Áp dụng vào hũ tháng này'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
