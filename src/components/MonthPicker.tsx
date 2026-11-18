'use client';

import * as React from 'react';
import * as PopoverPrimitive from 'radix-ui/popover';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn, getCurrentMonth } from '@/lib/utils';

interface MonthPickerProps {
  month: string;
  onChange: (month: string) => void;
  className?: string;
}

const MONTHS = [
  { value: 1, shortLabel: 'Thg 1', fullLabel: 'Tháng 1' },
  { value: 2, shortLabel: 'Thg 2', fullLabel: 'Tháng 2' },
  { value: 3, shortLabel: 'Thg 3', fullLabel: 'Tháng 3' },
  { value: 4, shortLabel: 'Thg 4', fullLabel: 'Tháng 4' },
  { value: 5, shortLabel: 'Thg 5', fullLabel: 'Tháng 5' },
  { value: 6, shortLabel: 'Thg 6', fullLabel: 'Tháng 6' },
  { value: 7, shortLabel: 'Thg 7', fullLabel: 'Tháng 7' },
  { value: 8, shortLabel: 'Thg 8', fullLabel: 'Tháng 8' },
  { value: 9, shortLabel: 'Thg 9', fullLabel: 'Tháng 9' },
  { value: 10, shortLabel: 'Thg 10', fullLabel: 'Tháng 10' },
  { value: 11, shortLabel: 'Thg 11', fullLabel: 'Tháng 11' },
  { value: 12, shortLabel: 'Thg 12', fullLabel: 'Tháng 12' },
];

function parseMonthYear(value: string) {
  const [rawYear, rawMonth] = value.split('-').map(Number);
  const now = new Date();
  const year = Number.isFinite(rawYear) && rawYear > 1900 ? rawYear : now.getFullYear();
  const month = Number.isFinite(rawMonth) && rawMonth >= 1 && rawMonth <= 12 ? rawMonth : now.getMonth() + 1;
  return { year, month };
}

function formatMonthValue(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function MonthPicker({ month, onChange, className }: MonthPickerProps) {
  const { year: selectedYear, month: selectedMonth } = parseMonthYear(month);
  const [open, setOpen] = React.useState(false);
  const [viewYear, setViewYear] = React.useState(selectedYear);
  const currentMonthStr = getCurrentMonth();

  const label = `Tháng ${selectedMonth}/${selectedYear}`;

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setViewYear(selectedYear);
        setOpen(nextOpen);
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Chọn tháng, đang chọn ${label}`}
          className={cn(
            'inline-flex h-9 shrink-0 items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 text-sm font-semibold tabular-nums text-foreground shadow-xs outline-none transition hover:border-slate-300 hover:bg-slate-50/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
            className,
          )}
        >
          <CalendarDays aria-hidden className="size-4 shrink-0 text-[#00a970]" />
          <span>{label}</span>
          <ChevronDown
            aria-hidden
            className={cn('size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')}
          />
        </button>
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="z-[90] w-[min(18.5rem,calc(100vw-1.5rem))] rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_16px_48px_-18px_rgba(15,23,42,.35)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="Năm trước"
              onClick={() => setViewYear((y) => y - 1)}
              className="inline-flex size-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums text-slate-900">
              Năm {viewYear}
            </span>
            <button
              type="button"
              aria-label="Năm sau"
              onClick={() => setViewYear((y) => y + 1)}
              className="inline-flex size-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MONTHS.map((item) => {
              const itemValue = formatMonthValue(viewYear, item.value);
              const isSelected = viewYear === selectedYear && item.value === selectedMonth;
              const isCurrent = itemValue === currentMonthStr;

              return (
                <button
                  key={item.value}
                  type="button"
                  aria-label={`${item.fullLabel} năm ${viewYear}`}
                  aria-pressed={isSelected}
                  onClick={() => {
                    onChange(itemValue);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex h-9 items-center justify-center rounded-xl text-xs font-medium tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected
                      ? 'bg-[#00bc7c] font-semibold text-white shadow-xs'
                      : isCurrent
                        ? 'border border-emerald-200 bg-emerald-50/70 font-semibold text-emerald-800 hover:bg-emerald-100/70'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  {item.shortLabel}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
            <span className="text-[11px] text-slate-400">Đang chọn: {label}</span>
            <button
              type="button"
              onClick={() => {
                onChange(currentMonthStr);
                setOpen(false);
              }}
              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-50"
            >
              Tháng này
            </button>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
