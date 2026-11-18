'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const BudgetsPage = dynamic(() => import('@/app/budgets/page'), {
  loading: () => <div className="space-y-4 p-4"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-44 w-full rounded-2xl" /></div>,
});
const DebtsPage = dynamic(() => import('@/app/debts/page'), {
  loading: () => <div className="space-y-4 p-4"><Skeleton className="h-28 w-full rounded-2xl" /><Skeleton className="h-44 w-full rounded-2xl" /></div>,
});

export default function PlanningPage() {
  return (
    <Tabs defaultValue="budgets" className="w-full">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl md:hidden">
        <TabsList aria-label="Quản lý kế hoạch tài chính" className="grid h-11 w-full max-w-md grid-cols-2 rounded-xl bg-slate-200/70 p-1">
          <TabsTrigger value="budgets" className="rounded-lg text-sm">Ngân sách</TabsTrigger>
          <TabsTrigger value="debts" className="rounded-lg text-sm">Công nợ</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="budgets" className="mt-0 outline-none">
        <BudgetsPage />
      </TabsContent>
      <TabsContent value="debts" className="mt-0 outline-none">
        <DebtsPage />
      </TabsContent>
    </Tabs>
  );
}
