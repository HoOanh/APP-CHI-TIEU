"use client"

import * as React from "react"
import * as DropdownMenuPrimitive from "radix-ui/dropdown-menu"
import { Check, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const DropdownMenu = DropdownMenuPrimitive.Root
const DropdownMenuPortal = DropdownMenuPrimitive.Portal
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger
const DropdownMenuGroup = DropdownMenuPrimitive.Group
const DropdownMenuSub = DropdownMenuPrimitive.Sub
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup

function DropdownMenuContent({ className, align = "start", side = "bottom", sideOffset = 5, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>) {
  return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.Content data-slot="dropdown-menu-content" align={align} side={side} sideOffset={sideOffset} className={cn("z-[80] min-w-44 overflow-hidden rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-[0_12px_40px_-12px_rgba(15,23,42,.25)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95", className)} {...props} /></DropdownMenuPrimitive.Portal>
}

function DropdownMenuLabel({ className, inset, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }) {
  return <DropdownMenuPrimitive.Label data-slot="dropdown-menu-label" data-inset={inset} className={cn("px-2 py-1.5 text-xs font-semibold text-slate-500 data-[inset=true]:pl-8", className)} {...props} />
}

function DropdownMenuItem({ className, inset, variant = "default", ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean; variant?: "default" | "destructive" }) {
  return <DropdownMenuPrimitive.Item data-slot="dropdown-menu-item" data-inset={inset} data-variant={variant} className={cn("flex min-h-9 cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-none focus:bg-emerald-50 focus:text-emerald-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[variant=destructive]:text-red-700 data-[variant=destructive]:focus:bg-red-50", className)} {...props} />
}

function DropdownMenuSubTrigger({ className, inset, children, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }) {
  return <DropdownMenuPrimitive.SubTrigger data-slot="dropdown-menu-sub-trigger" data-inset={inset} className={cn("flex min-h-9 cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-none focus:bg-emerald-50 data-[state=open]:bg-emerald-50 data-[inset=true]:pl-8", className)} {...props}>{children}<ChevronRight className="ml-auto size-4" /></DropdownMenuPrimitive.SubTrigger>
}

function DropdownMenuSubContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>) {
  return <DropdownMenuPrimitive.Portal><DropdownMenuPrimitive.SubContent data-slot="dropdown-menu-sub-content" className={cn("z-[80] min-w-40 rounded-xl border border-slate-200 bg-white p-1.5 text-slate-800 shadow-xl outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0", className)} {...props} /></DropdownMenuPrimitive.Portal>
}

function DropdownMenuCheckboxItem({ className, children, checked, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>) {
  return <DropdownMenuPrimitive.CheckboxItem data-slot="dropdown-menu-checkbox-item" checked={checked} className={cn("relative flex min-h-9 cursor-default items-center gap-2 rounded-lg py-1 pl-8 pr-2 text-sm outline-none focus:bg-emerald-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-40", className)} {...props}><span className="absolute left-2 inline-flex size-4 items-center justify-center"><DropdownMenuPrimitive.ItemIndicator><Check className="size-4" /></DropdownMenuPrimitive.ItemIndicator></span>{children}</DropdownMenuPrimitive.CheckboxItem>
}

function DropdownMenuRadioItem({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>) {
  return <DropdownMenuPrimitive.RadioItem data-slot="dropdown-menu-radio-item" className={cn("relative flex min-h-9 cursor-default items-center gap-2 rounded-lg py-1 pl-8 pr-2 text-sm outline-none focus:bg-emerald-50 data-[disabled]:pointer-events-none data-[disabled]:opacity-40", className)} {...props}><span className="absolute left-2 inline-flex size-4 items-center justify-center"><DropdownMenuPrimitive.ItemIndicator><Check className="size-4" /></DropdownMenuPrimitive.ItemIndicator></span>{children}</DropdownMenuPrimitive.RadioItem>
}

function DropdownMenuSeparator({ className, ...props }: React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>) {
  return <DropdownMenuPrimitive.Separator data-slot="dropdown-menu-separator" className={cn("-mx-1 my-1 h-px bg-slate-100", className)} {...props} />
}

function DropdownMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return <span data-slot="dropdown-menu-shortcut" className={cn("ml-auto text-xs text-slate-400", className)} {...props} />
}

export { DropdownMenu, DropdownMenuPortal, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuItem, DropdownMenuCheckboxItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent }
