"use client"

import * as React from "react"
import * as ProgressPrimitive from "radix-ui/progress"

import { cn } from "@/lib/utils"

function Progress({
  className,
  children,
  value,
  indicatorColor,
  ...props
}: React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & { indicatorColor?: string }) {
  const percentage = Math.min(100, Math.max(0, Number(value) || 0))
  return (
    <ProgressPrimitive.Root
      value={value}
      data-slot="progress"
      className={cn("flex flex-wrap gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          className={cn("h-full w-full bg-primary transition-transform", indicatorColor)}
          style={{ transform: `translateX(-${100 - percentage}%)` }}
        />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )
}

function ProgressTrack({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div data-slot="progress-track" className={cn("relative flex h-1 w-full items-center overflow-hidden rounded-full bg-muted", className)} {...props} />
}

function ProgressIndicator({ className, ...props }: React.ComponentPropsWithoutRef<"div">) {
  return <div data-slot="progress-indicator" className={cn("h-full bg-primary transition-all", className)} {...props} />
}

function ProgressLabel({ className, ...props }: React.ComponentPropsWithoutRef<"span">) {
  return <span data-slot="progress-label" className={cn("text-sm font-medium", className)} {...props} />
}

function ProgressValue({ className, ...props }: React.ComponentPropsWithoutRef<"span">) {
  return <span data-slot="progress-value" className={cn("ml-auto text-sm text-muted-foreground tabular-nums", className)} {...props} />
}

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}
