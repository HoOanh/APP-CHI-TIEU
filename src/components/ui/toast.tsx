"use client"

import * as React from "react"
import * as ToastPrimitive from "radix-ui/toast"
import { CheckCircle2, Info, LoaderCircle, Siren, TriangleAlert, X } from "lucide-react"
import { cn } from "@/lib/utils"

type ToastType = "success" | "info" | "warning" | "error" | "loading"
interface ToastItem {
  id: string
  title: string
  description?: string
  type: ToastType
  phase: "strobe" | "toast"
}

const emptySnapshot: ToastItem[] = []
const subscribers = new Set<() => void>()
let items: ToastItem[] = []
let toastSequence = 0
const strobeTimers = new Map<string, ReturnType<typeof setTimeout>>()

function subscribe(listener: () => void) {
  subscribers.add(listener)
  return () => subscribers.delete(listener)
}

function publish(nextItems: ToastItem[]) {
  items = nextItems
  subscribers.forEach((listener) => listener())
}

function isOverspendAlert(type: ToastType, title: string, description?: string) {
  if (type !== "error") return false
  const combined = `${title} ${description ?? ""}`
  return /lố|thủng|vượt|kịch trần|hạn mức|ngân sách/iu.test(combined)
}

const toast = {
  add(input: { title: string; description?: string; type?: ToastType }) {
    const id = `toast-${++toastSequence}`
    const type = input.type || "info"
    const shouldStrobe = isOverspendAlert(type, input.title, input.description)
    const phase: "strobe" | "toast" = shouldStrobe ? "strobe" : "toast"

    publish([
      ...items,
      {
        id,
        title: input.title,
        description: input.description,
        type,
        phase,
      },
    ])

    if (shouldStrobe && typeof window !== "undefined") {
      const timer = setTimeout(() => {
        strobeTimers.delete(id)
        publish(
          items.map((item) =>
            item.id === id ? { ...item, phase: "toast" } : item
          )
        )
      }, 1850)
      strobeTimers.set(id, timer)
    }

    return id
  },
  skipStrobe(id: string) {
    const timer = strobeTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      strobeTimers.delete(id)
    }
    publish(
      items.map((item) =>
        item.id === id ? { ...item, phase: "toast" } : item
      )
    )
  },
  remove(id: string) {
    const timer = strobeTimers.get(id)
    if (timer) {
      clearTimeout(timer)
      strobeTimers.delete(id)
    }
    publish(items.filter((item) => item.id !== id))
  },
}

function ToastIcon({ type }: { type: ToastType }) {
  if (type === "error") {
    return <Siren aria-hidden className="mt-0.5 size-5 shrink-0 animate-bounce text-white" />
  }
  const Icon = type === "success" ? CheckCircle2 : type === "warning" ? TriangleAlert : type === "loading" ? LoaderCircle : Info
  return <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", type === "success" && "text-green-700", type === "warning" && "text-amber-700", type === "loading" && "animate-spin text-sky-700", type === "info" && "text-sky-700")} />
}

const MATRIX_STREAKS = [
  { left: "6%", top: "8%", height: "96px", color: "from-rose-500 via-orange-400 to-transparent" },
  { left: "14%", top: "62%", height: "120px", color: "from-orange-500 via-rose-500 to-transparent" },
  { left: "23%", top: "14%", height: "84px", color: "from-cyan-400/80 via-emerald-400/40 to-transparent" },
  { left: "31%", top: "70%", height: "110px", color: "from-rose-600 via-amber-400 to-transparent" },
  { left: "44%", top: "6%", height: "90px", color: "from-rose-500 via-red-600 to-transparent" },
  { left: "57%", top: "74%", height: "130px", color: "from-rose-500 via-orange-400 to-transparent" },
  { left: "69%", top: "12%", height: "115px", color: "from-red-500 via-amber-300 to-transparent" },
  { left: "78%", top: "58%", height: "95px", color: "from-emerald-400/75 via-cyan-400/30 to-transparent" },
  { left: "86%", top: "18%", height: "140px", color: "from-rose-600 via-orange-500 to-transparent" },
  { left: "93%", top: "66%", height: "100px", color: "from-amber-400 via-rose-500 to-transparent" },
]

function CyberWarningStrobeOverlay({
  item,
  onSkip,
}: {
  item: ToastItem
  onSkip: () => void
}) {
  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="Cảnh báo chi tiêu vượt hạn mức"
      onClick={onSkip}
      className="cyber-matrix-bg fixed inset-0 z-[130] flex cursor-pointer select-none flex-col items-center justify-center overflow-hidden px-4"
    >
      {/* Glowing vertical digital matrix streaks */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {MATRIX_STREAKS.map((streak, idx) => (
          <span
            key={idx}
            style={{ left: streak.left, top: streak.top, height: streak.height }}
            className={cn(
              "absolute w-[3px] rounded-full bg-gradient-to-b opacity-80 blur-[0.5px]",
              streak.color
            )}
          />
        ))}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,30,39,0.24)_0%,rgba(6,8,12,0.88)_72%)]" />
      </div>

      {/* Flashing LED Neon Warning Triangle */}
      <div className="cyber-warning-strobe relative z-10 flex flex-col items-center">
        <svg
          viewBox="0 0 420 370"
          className="h-auto w-[min(340px,84vw)] sm:w-[390px]"
          aria-hidden="true"
        >
          <defs>
            <pattern id="led-matrix-dots" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect x="1" y="1" width="4.5" height="4.5" rx="1" fill="#ff2a1f" fillOpacity="0.42" />
              <rect x="2" y="2" width="2.5" height="2.5" rx="0.5" fill="#ffb703" fillOpacity="0.35" />
            </pattern>
            <linearGradient id="neon-border-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#ff2a2a" />
              <stop offset="50%" stopColor="#ffea00" />
              <stop offset="100%" stopColor="#ff1e27" />
            </linearGradient>
            <linearGradient id="neon-text-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#fff3b0" />
              <stop offset="55%" stopColor="#ffb703" />
              <stop offset="100%" stopColor="#ff2a1f" />
            </linearGradient>
          </defs>

          {/* Outer Red Glow Halo */}
          <path
            d="M186 30 C197 11 223 11 234 30 L392 302 C403 321 389 345 368 345 L52 345 C31 345 17 321 28 302 Z"
            fill="rgba(255, 18, 34, 0.16)"
            stroke="#ff1e27"
            strokeWidth="14"
            strokeLinejoin="round"
            opacity="0.45"
          />

          {/* Main LED Matrix Triangle Fill */}
          <path
            d="M186 30 C197 11 223 11 234 30 L392 302 C403 321 389 345 368 345 L52 345 C31 345 17 321 28 302 Z"
            fill="url(#led-matrix-dots)"
            stroke="url(#neon-border-grad)"
            strokeWidth="8"
            strokeLinejoin="round"
          />

          {/* Inner Dashed LED Track */}
          <path
            d="M193 46 C201 32 219 32 227 46 L373 297 C381 311 371 329 355 329 L65 329 C49 329 39 311 47 297 Z"
            fill="none"
            stroke="#ff9e00"
            strokeWidth="2.5"
            strokeDasharray="6 4"
            strokeLinejoin="round"
            opacity="0.85"
          />

          {/* Exclamation Mark Bar */}
          <rect
            x="196"
            y="88"
            width="28"
            height="92"
            rx="12"
            fill="url(#neon-text-grad)"
            stroke="#ff1e27"
            strokeWidth="2"
          />
          {/* Exclamation Mark Dot */}
          <circle
            cx="210"
            cy="206"
            r="15"
            fill="url(#neon-text-grad)"
            stroke="#ff1e27"
            strokeWidth="2"
          />

          {/* WARNING Text inside Triangle */}
          <text
            x="210"
            y="298"
            textAnchor="middle"
            fill="url(#neon-text-grad)"
            stroke="#ff1e27"
            strokeWidth="1.5"
            fontFamily="var(--font-display), sans-serif"
            fontWeight="900"
            fontSize="50"
            letterSpacing="4"
          >
            WARNING
          </text>
        </svg>

        <p className="mt-3 rounded-full border border-rose-500/60 bg-rose-950/90 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-amber-300 shadow-[0_0_24px_rgba(255,30,39,0.7)]">
          {item.title.replace(/^🚨\s*/, "")}
        </p>
      </div>
    </div>
  )
}

function Toaster() {
  const toasts = React.useSyncExternalStore(subscribe, () => items, () => emptySnapshot)
  const activeStrobeToast = toasts.find((item) => item.phase === "strobe")
  const visibleToasts = toasts.filter((item) => item.phase === "toast")
  const hasDangerToast = visibleToasts.some((item) => item.type === "error")

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={6000}>
      {activeStrobeToast ? (
        <CyberWarningStrobeOverlay
          item={activeStrobeToast}
          onSkip={() => toast.skipStrobe(activeStrobeToast.id)}
        />
      ) : null}

      {hasDangerToast ? (
        <div
          aria-hidden="true"
          className="overspend-screen-flash pointer-events-none fixed inset-0 z-[95]"
        />
      ) : null}

      <ToastPrimitive.Viewport className="pointer-events-none fixed inset-x-3 top-4 z-[100] mx-auto flex max-h-[calc(100dvh-2rem)] w-auto max-w-md flex-col gap-2.5 outline-none sm:top-auto sm:right-4 sm:bottom-4 sm:left-auto sm:mx-0 sm:w-full">
        {visibleToasts.map((item) => {
          const isDanger = item.type === "error"
          const isWarning = item.type === "warning"

          return (
            <ToastPrimitive.Root
              key={item.id}
              open
              duration={isDanger ? 7500 : 4500}
              onOpenChange={(open) => !open && toast.remove(item.id)}
              className={cn(
                "pointer-events-auto flex items-start gap-3 rounded-2xl border p-4 shadow-[0_16px_42px_-14px_rgba(15,23,42,.38)] data-[state=open]:animate-in data-[state=open]:slide-in-from-top-2 sm:data-[state=open]:slide-in-from-bottom-2 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
                isDanger
                  ? "overspend-card-pulse border-2 border-rose-300 bg-rose-600 text-white shadow-[0_20px_50px_-12px_rgba(225,29,72,0.85)]"
                  : isWarning
                    ? "border-2 border-amber-300 bg-amber-50 text-amber-950"
                    : "border-slate-200 bg-white text-slate-900",
              )}
            >
              <ToastIcon type={item.type} />
              <div className="min-w-0 flex-1">
                <ToastPrimitive.Title className={cn("text-sm font-bold leading-5", isDanger && "text-white")}>
                  {item.title}
                </ToastPrimitive.Title>
                {item.description ? (
                  <ToastPrimitive.Description className={cn("mt-1 text-xs leading-5", isDanger ? "font-medium text-rose-50" : isWarning ? "text-amber-900" : "text-slate-600")}>
                    {item.description}
                  </ToastPrimitive.Description>
                ) : null}
              </div>
              <ToastPrimitive.Close
                aria-label="Đóng thông báo"
                className={cn(
                  "-mr-1 -mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition",
                  isDanger
                    ? "text-rose-100 hover:bg-rose-700 hover:text-white"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <X className="size-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          )
        })}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Provider>
  )
}

export { Toaster, toast }
