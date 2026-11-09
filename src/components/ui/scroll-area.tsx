"use client"

import * as React from "react"
import * as ScrollAreaPrimitive from "radix-ui/scroll-area"
import { cn } from "@/lib/utils"

function ScrollArea({ className, children, ...props }: React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root>) {
  return <ScrollAreaPrimitive.Root data-slot="scroll-area" className={cn("relative overflow-hidden", className)} {...props}><ScrollAreaPrimitive.Viewport data-slot="scroll-area-viewport" className="size-full rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring">{children}</ScrollAreaPrimitive.Viewport><ScrollBar /><ScrollAreaPrimitive.Corner /></ScrollAreaPrimitive.Root>
}

function ScrollBar({ className, orientation = "vertical", ...props }: React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Scrollbar>) {
  return <ScrollAreaPrimitive.Scrollbar data-slot="scroll-area-scrollbar" orientation={orientation} className={cn("flex touch-none select-none p-0.5 transition-colors data-[orientation=vertical]:h-full data-[orientation=vertical]:w-2 data-[orientation=horizontal]:h-2 data-[orientation=horizontal]:flex-col", className)} {...props}><ScrollAreaPrimitive.Thumb data-slot="scroll-area-thumb" className="relative flex-1 rounded-full bg-slate-300" /></ScrollAreaPrimitive.Scrollbar>
}

export { ScrollArea, ScrollBar }
