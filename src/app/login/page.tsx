'use client';

import { signIn } from 'next-auth/react';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  ChartNoAxesCombined,
  WalletCards,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  return (
    <main className="relative isolate min-h-dvh overflow-x-hidden bg-[#fbfcfc] text-[#344554]">
      <div className="absolute -right-64 -top-64 -z-10 hidden size-[56rem] rounded-full bg-[#00bc7c] lg:block" />
      <div className="absolute -right-52 -top-44 -z-10 hidden size-[46rem] rounded-full border border-white/45 lg:block" />
      <div className="mx-auto grid min-h-dvh max-w-[1280px] items-center gap-0 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12 lg:px-12 lg:py-10 xl:px-16">
        <section className="relative z-10 w-full bg-[#00bc7c] px-6 pb-24 pt-10 text-white lg:max-w-xl lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-0 lg:text-[#344554]">
          <div className="absolute -right-28 -top-48 size-[30rem] rounded-full border border-white/30 lg:hidden" />
          <div className="relative mb-14 flex items-center gap-2.5 lg:mb-24">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-white/15 text-white ring-1 ring-white/20 lg:bg-[#00bc7c] lg:shadow-[0_12px_26px_-10px_rgba(0,188,124,0.75)]">
              <WalletCards className="size-5" strokeWidth={2.2} />
            </span>
            <span className="text-xl font-semibold tracking-[-0.04em]">Chi Tiêu</span>
          </div>

          <p className="relative mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/65 lg:mb-5 lg:text-xs lg:text-[#00a972]">
            Personal money manager
          </p>
          <h1 className="relative max-w-[10ch] text-[clamp(2.7rem,12vw,3.4rem)] font-semibold leading-[0.98] tracking-[-0.065em] text-white lg:text-[clamp(3rem,6vw,5.75rem)] lg:text-[#344554]">
            Tiền của bạn,{' '}
            <span className="text-white lg:text-[#00bc7c]">vào khuôn.</span>
          </h1>
          <p className="relative mt-6 max-w-md text-[15px] leading-6 text-white/80 lg:mt-7 lg:text-lg lg:leading-7 lg:text-slate-500">
            Theo dõi ví, chi tiêu và ngân sách với một trải nghiệm gọn gàng,
            rõ ràng mỗi ngày.
          </p>

          <div className="relative mt-8 grid gap-3 text-sm font-medium text-white lg:mt-10 lg:flex lg:flex-wrap lg:gap-x-7 lg:gap-y-3 lg:text-slate-600">
            <span className="flex items-center gap-2"><BadgeCheck className="size-4 text-white lg:text-[#00bc7c]" /> Số dư ví theo thời gian thực</span>
            <span className="flex items-center gap-2"><BadgeCheck className="size-4 text-white lg:text-[#00bc7c]" /> Ghi giao dịch bằng AI</span>
          </div>
        </section>

        <section className="relative z-10 -mt-10 w-full px-5 pb-10 lg:mx-0 lg:mt-0 lg:max-w-[420px] lg:justify-self-end lg:px-0 lg:pb-0">
          <div className="mx-auto max-w-[420px] rounded-[28px] border border-white/80 bg-white p-5 shadow-[0_30px_70px_-35px_rgba(19,49,41,0.45)] md:p-8">
            <div className="mb-7 flex items-start justify-between md:mb-9">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Cash wallet</p>
                <p className="mt-2 text-3xl font-semibold tracking-[-0.045em] tabular-nums">7.602.375đ</p>
              </div>
              <span className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-[#00bc7c]">
                <ChartNoAxesCombined className="size-5" />
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 border-y border-slate-100 py-5">
              <WalletMetric icon={ArrowDownRight} label="Tổng thu" value="+23.535.000đ" tone="income" />
              <WalletMetric icon={ArrowUpRight} label="Tổng chi" value="−15.932.625đ" tone="expense" />
            </div>

            <div className="mt-7">
              <p className="mb-3 text-sm font-medium text-slate-600">Đăng nhập để tiếp tục</p>
              <Button
                size="lg"
                onClick={() => signIn('google', { callbackUrl: '/' })}
                className="h-12 w-full rounded-xl bg-[#00bc7c] text-sm font-semibold shadow-[0_12px_24px_-12px_rgba(0,188,124,0.8)] hover:bg-[#00a970]"
              >
                <GoogleMark />
                Tiếp tục với Google
              </Button>
              <p className="mt-4 text-center text-xs leading-5 text-slate-400">
                Dữ liệu của bạn được tách riêng theo từng tài khoản.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function WalletMetric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof ArrowDownRight;
  label: string;
  value: string;
  tone: 'income' | 'expense';
}) {
  const isIncome = tone === 'income';
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-xs text-slate-400">
        <Icon className={isIncome ? 'size-3.5 text-[#00bc7c]' : 'size-3.5 text-[#f15b64]'} />
        {label}
      </p>
      <p className={isIncome ? 'mt-1 truncate text-sm font-semibold tabular-nums text-[#00bc7c]' : 'mt-1 truncate text-sm font-semibold tabular-nums text-[#f15b64]'}>
        {value}
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="currentColor" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor" opacity=".78" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor" opacity=".58" />
    </svg>
  );
}
