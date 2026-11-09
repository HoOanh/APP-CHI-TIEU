"use client"

import * as React from "react"
import * as SelectPrimitive from "radix-ui/select"
import { Check, ChevronDown, ChevronUp } from "lucide-react"
import { cn } from "@/lib/utils"

const Select = SelectPrimitive.Root

function SelectGroup(props: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Group>) {
  return <SelectPrimitive.Group data-slot="select-group" {...props} />
}

function SelectValue(props: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({ className, size = "default", children, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger> & { size?: "sm" | "default" }) {
  return <SelectPrimitive.Trigger data-slot="select-trigger" data-size={size} className={cn("flex min-h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 shadow-sm outline-none transition focus-visible:border-emerald-700 focus-visible:ring-2 focus-visible:ring-emerald-700/20 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-slate-500", size === "sm" && "min-h-8 text-xs", className)} {...props}>{children}<SelectPrimitive.Icon asChild><ChevronDown aria-hidden className="size-4 shrink-0 text-slate-500" /></SelectPrimitive.Icon></SelectPrimitive.Trigger>
}

function SelectContent({ className, children, position = "popper", side = "bottom", sideOffset = 5, align = "start", ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & { side?: "top" | "bottom" | "left" | "right"; sideOffset?: number; align?: "start" | "center" | "end" }) {
  return <SelectPrimitive.Portal><SelectPrimitive.Content data-slot="select-content" position={position} side={side} sideOffset={sideOffset} align={align} className={cn("z-[80] max-h-[var(--radix-select-content-available-height)] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-[0_12px_40px_-12px_rgba(15,23,42,.25)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", className)} {...props}><SelectScrollUpButton /><SelectPrimitive.Viewport className="max-h-[var(--radix-select-content-available-height)] p-0.5">{children}</SelectPrimitive.Viewport><SelectScrollDownButton /></SelectPrimitive.Content></SelectPrimitive.Portal>
}

function SelectLabel({ className, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>) {
  return <SelectPrimitive.Label data-slot="select-label" className={cn("px-2 py-1.5 text-xs font-semibold text-slate-500", className)} {...props} />
}

function SelectItem({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item data-slot="select-item" className={cn("relative flex min-h-11 w-full cursor-default select-none items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none focus:bg-emerald-50 focus:text-emerald-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-40", className)} {...props}><SelectPrimitive.ItemText><span className="inline-flex min-w-0 items-center gap-2">{children}</span></SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator className="absolute right-2 inline-flex items-center justify-center"><Check className="size-4 text-emerald-700" /></SelectPrimitive.ItemIndicator></SelectPrimitive.Item>
}

function SelectSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>) {
  return <SelectPrimitive.Separator data-slot="select-separator" className={cn("my-1 h-px bg-slate-100", className)} {...props} />
}

function SelectScrollUpButton({ className, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>) {
  return <SelectPrimitive.ScrollUpButton data-slot="select-scroll-up" className={cn("flex cursor-default items-center justify-center py-1 text-slate-500", className)} {...props}><ChevronUp className="size-4" /></SelectPrimitive.ScrollUpButton>
}

function SelectScrollDownButton({ className, ...props }: React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>) {
  return <SelectPrimitive.ScrollDownButton data-slot="select-scroll-down" className={cn("flex cursor-default items-center justify-center py-1 text-slate-500", className)} {...props}><ChevronDown className="size-4" /></SelectPrimitive.ScrollDownButton>
}

export { Select, SelectGroup, SelectValue, SelectTrigger, SelectContent, SelectLabel, SelectItem, SelectSeparator, SelectScrollUpButton, SelectScrollDownButton }
