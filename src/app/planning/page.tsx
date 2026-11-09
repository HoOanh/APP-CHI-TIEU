'use client';

import BudgetsPage from '@/app/budgets/page';
import DebtsPage from '@/app/debts/page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PlanningPage() {
  return (
    <Tabs defaultValue="budgets" className="w-full">
      <div className="sticky top-0 z-20 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl md:top-16 md:px-8">
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
