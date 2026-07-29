'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MonthPickerProps {
  month: string;
  onChange: (month: string) => void;
}

export function MonthPicker({ month, onChange }: MonthPickerProps) {
  const [year, m] = month.split('-').map(Number);

  const prev = () => {
    const d = new Date(year, m - 2, 1);
    onChange(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
  };

  const next = () => {
    const d = new Date(year, m, 1);
    onChange(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
  };

  const label = `Tháng ${m}/${year}`;

  return (
    <div className="flex items-center justify-between bg-card border border-border rounded-xl px-1 py-1">
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={prev}>
        <ChevronLeft className="w-4 h-4" />
      </Button>
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={next}>
        <ChevronRight className="w-4 h-4" />
      </Button>
    </div>
  );
}
