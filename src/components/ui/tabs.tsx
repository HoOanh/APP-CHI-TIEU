"use client"

import * as React from "react"
import * as TabsPrimitive from "radix-ui/tabs"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

function Tabs({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn("flex flex-col gap-3", className)} {...props} />
}

const tabsListVariants = cva("inline-flex w-fit items-center justify-center rounded-xl p-1 text-muted-foreground", {
  variants: { variant: { default: "bg-secondary", line: "rounded-none border-b border-border bg-transparent p-0" } },
  defaultVariants: { variant: "default" },
})

function TabsList({ className, variant = "default", ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & VariantProps<typeof tabsListVariants>) {
  return <TabsPrimitive.List data-slot="tabs-list" data-variant={variant} className={cn(tabsListVariants({ variant }), className)} {...props} />
}

function TabsTrigger({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return <TabsPrimitive.Trigger data-slot="tabs-trigger" className={cn("min-h-9 flex-1 rounded-lg px-3 text-sm font-medium text-slate-600 outline-none transition focus-visible:ring-2 focus-visible:ring-ring data-[state=active]:bg-white data-[state=active]:text-foreground data-[state=active]:shadow-sm disabled:pointer-events-none disabled:opacity-50", className)} {...props} />
}

function TabsContent({ className, ...props }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn("flex-1 outline-none focus-visible:ring-2 focus-visible:ring-ring", className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
