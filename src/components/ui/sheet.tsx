"use client"

import * as React from "react"
import * as DialogPrimitive from "radix-ui/dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetClose = DialogPrimitive.Close
const SheetPortal = DialogPrimitive.Portal

function SheetOverlay({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>) {
  return <DialogPrimitive.Overlay data-slot="sheet-overlay" className={cn("fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px]", className)} {...props} />
}

function SheetContent({ className, children, side = "right", showCloseButton = true, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { side?: "top" | "right" | "bottom" | "left"; showCloseButton?: boolean }) {
  return <SheetPortal><SheetOverlay /><DialogPrimitive.Content data-slot="sheet-content" data-side={side} className={cn("fixed z-50 flex max-h-dvh flex-col gap-4 overflow-y-auto border-slate-200 bg-white shadow-2xl outline-none data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:rounded-t-2xl data-[side=bottom]:border-t data-[side=bottom]:p-5 data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:w-[min(24rem,90vw)] data-[side=left]:border-r data-[side=left]:p-5 data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:w-[min(24rem,90vw)] data-[side=right]:border-l data-[side=right]:p-5 data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:rounded-b-2xl data-[side=top]:border-b data-[side=top]:p-5", className)} {...props}>{children}{showCloseButton ? <DialogPrimitive.Close aria-label="Đóng" className="absolute right-3 top-3 inline-flex size-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><X className="size-4" /></DialogPrimitive.Close> : null}</DialogPrimitive.Content></SheetPortal>
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="sheet-header" className={cn("flex flex-col gap-1.5", className)} {...props} /> }
function SheetFooter({ className, ...props }: React.ComponentProps<"div">) { return <div data-slot="sheet-footer" className={cn("mt-auto flex flex-col gap-2 border-t border-slate-100 pt-4", className)} {...props} /> }
function SheetTitle({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>) { return <DialogPrimitive.Title data-slot="sheet-title" className={cn("text-base font-semibold text-slate-900", className)} {...props} /> }
function SheetDescription({ className, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>) { return <DialogPrimitive.Description data-slot="sheet-description" className={cn("text-sm text-slate-500", className)} {...props} /> }

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetFooter, SheetTitle, SheetDescription, SheetPortal }
