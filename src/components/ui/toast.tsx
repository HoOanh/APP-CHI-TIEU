"use client"

import * as React from "react"
import * as ToastPrimitive from "radix-ui/toast"
import { CheckCircle2, Info, LoaderCircle, TriangleAlert, X, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"

type ToastType = "success" | "info" | "warning" | "error" | "loading"
interface ToastItem { id: string; title: string; description?: string; type: ToastType; }
const emptySnapshot: ToastItem[] = []
const subscribers = new Set<() => void>()
let items: ToastItem[] = []
let toastSequence = 0

function subscribe(listener: () => void) {
  subscribers.add(listener)
  return () => subscribers.delete(listener)
}

function publish(nextItems: ToastItem[]) {
  items = nextItems
  subscribers.forEach((listener) => listener())
}

const toast = {
  add(input: { title: string; description?: string; type?: ToastType }) {
    const id = `toast-${++toastSequence}`
    publish([...items, { id, title: input.title, description: input.description, type: input.type || "info" }])
    return id
  },
  remove(id: string) {
    publish(items.filter((item) => item.id !== id))
  },
}

function ToastIcon({ type }: { type: ToastType }) {
  const Icon = type === "success" ? CheckCircle2 : type === "warning" ? TriangleAlert : type === "error" ? XCircle : type === "loading" ? LoaderCircle : Info
  return <Icon aria-hidden className={cn("size-4 shrink-0", type === "success" && "text-green-700", type === "warning" && "text-amber-700", type === "error" && "text-red-700", type === "loading" && "animate-spin text-sky-700", type === "info" && "text-sky-700")} />
}

function Toaster() {
  const toasts = React.useSyncExternalStore(subscribe, () => items, () => emptySnapshot)
  return <ToastPrimitive.Provider swipeDirection="right" duration={4500}><ToastPrimitive.Viewport className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-h-[calc(100dvh-1.5rem)] w-auto max-w-md flex-col gap-2 outline-none sm:right-4 sm:left-auto sm:mx-0 sm:w-full">{toasts.map((item) => <ToastPrimitive.Root key={item.id} open onOpenChange={(open) => !open && toast.remove(item.id)} className="pointer-events-auto flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-slate-900 shadow-[0_12px_36px_-16px_rgba(15,23,42,.35)] data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"><ToastIcon type={item.type} /><div className="min-w-0 flex-1"><ToastPrimitive.Title className="text-sm font-semibold leading-5">{item.title}</ToastPrimitive.Title>{item.description ? <ToastPrimitive.Description className="mt-0.5 text-sm leading-5 text-slate-600">{item.description}</ToastPrimitive.Description> : null}</div><ToastPrimitive.Close aria-label="Đóng thông báo" className="-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"><X className="size-4" /></ToastPrimitive.Close></ToastPrimitive.Root>)}</ToastPrimitive.Viewport></ToastPrimitive.Provider>
}

export { Toaster, toast }
