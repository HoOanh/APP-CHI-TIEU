import Image from 'next/image';
import { Skeleton } from '@/components/ui/skeleton';

export default function Loading() {
  return (
    <div
      className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-7xl flex-col px-4 py-6 md:px-8"
      role="status"
      aria-live="polite"
      aria-label="Đang tải ứng dụng"
    >
      <div className="my-auto flex flex-col items-center justify-center py-10 text-center">
        <div className="relative flex size-20 items-center justify-center rounded-3xl border border-emerald-100 bg-white shadow-[0_18px_40px_-20px_rgba(0,188,124,0.45)]">
          <span
            aria-hidden
            className="voice-ripple-ring absolute inset-0 rounded-3xl border border-[#00bc7c]/30"
          />
          <Image
            src="/arc-irobot.png"
            alt="ARC Irobot"
            width={56}
            height={44}
            priority
            className="h-auto w-12 object-contain"
          />
        </div>
        <p className="mt-4 text-sm font-semibold tracking-tight text-slate-800">
          ARC Irobot đang tải dữ liệu…
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Đang đồng bộ sổ thu chi và ngân sách của đại ca
        </p>
        <div className="mt-4 h-1.5 w-44 overflow-hidden rounded-full bg-emerald-100/80">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-[#00bc7c]" />
        </div>
      </div>

      <div className="mt-6 hidden space-y-4 opacity-55 sm:block">
        <Skeleton className="h-28 w-full rounded-3xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
