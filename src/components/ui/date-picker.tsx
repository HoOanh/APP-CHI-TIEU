"use client"

import * as React from "react"
import * as PopoverPrimitive from "radix-ui/popover"
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  id?: string
  value: string
  onChange: (value: string) => void
  label?: string
  placeholder?: string
  min?: string
  max?: string
  disabled?: boolean
  invalid?: boolean
  className?: string
}

function parseDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date()
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function DatePicker({ id, value, onChange, label, placeholder = "Chọn ngày", min, max, disabled, invalid, className }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [month, setMonth] = React.useState(() => {
    const selected = parseDate(value)
    return new Date(selected.getFullYear(), selected.getMonth(), 1)
  })
  const monthLabel = new Intl.DateTimeFormat("vi-VN", { month: "long", year: "numeric" }).format(month)
  const formattedValue = value
    ? new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short", year: "numeric" }).format(parseDate(value))
    : placeholder
  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, index) => new Date(month.getFullYear(), month.getMonth(), index - firstWeekday + 1))

  return (
    <div className="min-w-0">
      {label ? <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label> : null}
      <PopoverPrimitive.Root open={open} onOpenChange={(nextOpen) => {
        if (nextOpen) {
          const selected = parseDate(value)
          setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1))
        }
        setOpen(nextOpen)
      }}>
        <PopoverPrimitive.Trigger asChild>
          <button id={id} type="button" disabled={disabled} aria-label={label || "Chọn ngày"} aria-invalid={invalid || undefined} className={cn("flex h-11 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-left text-sm text-slate-800 shadow-sm outline-none transition hover:border-slate-400 focus-visible:border-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-red-600 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-red-600/15", className)}>
            <span className={cn(!value && "text-slate-500")}>{formattedValue}</span>
            <CalendarDays aria-hidden className="size-4 shrink-0 text-slate-500" />
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content side="bottom" align="start" sideOffset={6} collisionPadding={12} className="z-[90] w-[min(20rem,calc(100vw-1.5rem))] rounded-xl border border-slate-200 bg-white p-3 shadow-[0_16px_48px_-18px_rgba(15,23,42,.35)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
            <div className="mb-3 flex items-center justify-between">
              <button type="button" aria-label="Tháng trước" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))} className="inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronLeft className="size-4" /></button>
              <p className="text-sm font-semibold capitalize text-slate-900">{monthLabel}</p>
              <button type="button" aria-label="Tháng sau" onClick={() => setMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))} className="inline-flex size-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><ChevronRight className="size-4" /></button>
            </div>
            <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-slate-500">
              {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((weekday) => <span key={weekday} className="py-1.5">{weekday}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {days.map((day) => {
                const dayValue = isoDate(day)
                const outsideMonth = day.getMonth() !== month.getMonth()
                const selected = dayValue === value
                const tooEarly = min ? dayValue < min : false
                const tooLate = max ? dayValue > max : false
                return <button key={dayValue} type="button" disabled={tooEarly || tooLate} aria-label={new Intl.DateTimeFormat("vi-VN", { dateStyle: "full" }).format(day)} aria-pressed={selected} onClick={() => { onChange(dayValue); setOpen(false) }} className={cn("mx-auto inline-flex size-9 items-center justify-center rounded-lg text-sm tabular-nums transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-30", selected ? "bg-emerald-700 font-semibold text-white" : outsideMonth ? "text-slate-300 hover:bg-slate-50" : "text-slate-700 hover:bg-emerald-50 hover:text-emerald-900")}>
                  {day.getDate()}
                </button>
              })}
            </div>
            <div className="mt-3 flex justify-between border-t border-slate-100 pt-2">
              <button type="button" onClick={() => { onChange(isoDate(new Date())); setOpen(false) }} className="rounded-md px-2 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50">Hôm nay</button>
              {value ? <button type="button" onClick={() => { onChange(""); setOpen(false) }} className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">Xóa ngày</button> : null}
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </div>
  )
}
