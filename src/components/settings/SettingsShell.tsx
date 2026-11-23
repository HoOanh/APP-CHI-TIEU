'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Bell,
  Database,
  LayoutList,
  Repeat,
  SlidersHorizontal,
  Users,
  Wallet,
  WandSparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export const SETTINGS_ROUTES = [
  { href: '/settings', label: 'Hồ sơ', icon: ArrowLeft, exact: true },
  { href: '/settings/ledgers', label: 'Sổ chung', icon: Users },
  { href: '/settings/accounts', label: 'Ví tiền', icon: Wallet },
  { href: '/settings/categories', label: 'Danh mục', icon: LayoutList },
  { href: '/settings/automation', label: 'Định kỳ & Phím tắt', icon: Repeat },
  { href: '/settings/ai', label: 'Trợ lý AI', icon: WandSparkles },
  { href: '/settings/reminders', label: 'Nhắc nhở', icon: Bell },
  { href: '/settings/modules', label: 'Tính năng', icon: SlidersHorizontal },
  { href: '/settings/data', label: 'Dữ liệu & Sao lưu', icon: Database },
] as const;

export function SettingsShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto min-h-screen max-w-6xl space-y-5 bg-background p-4 pb-nav md:px-8 md:py-7">
      <header className="flex items-start gap-3 pt-1">
        <Link
          href="/settings"
          aria-label="Quay lại Cài đặt"
          className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#00a970]">
            <Link href="/settings" className="hover:underline">Cài đặt</Link>
            <span className="text-slate-300">/</span>
            <span className="truncate text-slate-500">{title}</span>
          </div>
          <h1 className="mt-0.5 text-xl font-bold tracking-tight text-slate-900 md:text-2xl">{title}</h1>
          <p className="mt-0.5 text-xs text-slate-500 md:text-sm">{description}</p>
        </div>
      </header>

      <div className="md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-7">
        <aside className="hidden md:block">
          <nav aria-label="Điều hướng cài đặt" className="sticky top-6 space-y-1 rounded-2xl border border-slate-200/90 bg-white p-2">
            {SETTINGS_ROUTES.filter((item) => !('exact' in item && item.exact)).map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition',
                    active
                      ? 'bg-emerald-50/90 font-semibold text-[#00a970]'
                      : 'font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  )}
                >
                  <Icon className="size-4 shrink-0" strokeWidth={1.8} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0 space-y-6">{children}</div>
      </div>
    </div>
  );
}
