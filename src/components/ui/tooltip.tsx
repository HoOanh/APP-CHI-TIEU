"use client"

import * as React from "react"
import * as TooltipPrimitive from "radix-ui/tooltip"
import { cn } from "@/lib/utils"

function TooltipProvider(props: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={150} {...props} />
}

const Tooltip = TooltipPrimitive.Root
const TooltipTrigger = TooltipPrimitive.Trigger

function TooltipContent({ className, side = "top", sideOffset = 5, ...props }: React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>) {
  return <TooltipPrimitive.Portal><TooltipPrimitive.Content data-slot="tooltip-content" side={side} sideOffset={sideOffset} className={cn("z-[90] max-w-xs rounded-lg bg-slate-900 px-3 py-1.5 text-xs leading-5 text-white shadow-lg data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0", className)} {...props}><TooltipPrimitive.Arrow className="fill-slate-900" /></TooltipPrimitive.Content></TooltipPrimitive.Portal>
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }
