'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  BarChart3,
  Bot,
  ChevronDown,
  HandCoins,
  Home,
  LogOut,
  PiggyBank,
  Receipt,
  Settings,
  Wallet,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface AppShellUser {
  name: string;
  email: string;
  image: string;
  isDevelopmentUser: boolean;
}

interface AppShellProps {
  children: React.ReactNode;
  user: AppShellUser | null;
}

const desktopNavigation = [
  { href: '/', icon: Home, label: 'Tổng quan' },
  { href: '/expenses', icon: Receipt, label: 'Giao dịch' },
  { href: '/budgets', icon: PiggyBank, label: 'Ngân sách' },
  { href: '/stats', icon: BarChart3, label: 'Phân tích' },
  { href: '/debts', icon: HandCoins, label: 'Công nợ' },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(-2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

export function AppShell({ children, user }: AppShellProps) {
  const pathname = usePathname();
  const isPublicRoute = pathname.startsWith('/login');
  const isChatRoute = pathname === '/chat' || pathname === '/debt-chat';

  if (isPublicRoute) {
    return <main className="min-h-dvh">{children}</main>;
  }

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-border/80 bg-white md:flex md:flex-col">
        <Link href="/" className="flex h-20 items-center gap-3 px-6">
          <span className="flex size-11 items-center justify-center rounded-2xl bg-primary text-white shadow-lg shadow-emerald-200/70">
            <Wallet className="size-5" />
          </span>
          <span>
            <span className="block text-base font-bold tracking-tight text-spendee-dark">
              Chi Tiêu
            </span>
            <span className="block text-xs text-muted-foreground">
              Money Manager
            </span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 px-3 py-4">
          {desktopNavigation.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-emerald-50 text-primary'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <Icon className="size-[18px]" strokeWidth={isActive ? 2.4 : 1.8} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-3">
          <Link
            href="/chat"
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-[#00a86f]"
          >
            <Bot className="size-5" />
            Ghi giao dịch bằng AI
          </Link>
        </div>

        <div className="border-t border-border/80 p-3">
          <ProfileMenu user={user} />
        </div>
      </aside>

      <div className="md:pl-64">
        {!isChatRoute && (
          <header className="sticky top-0 z-30 hidden h-16 items-center justify-between border-b border-border/70 bg-background/90 px-6 backdrop-blur-xl md:flex xl:px-10">
            <div>
              <p className="text-sm font-semibold text-spendee-dark">
                Tài chính của bạn
              </p>
              <p className="text-xs text-muted-foreground">
                Theo dõi, phân tích và tối ưu mỗi ngày
              </p>
            </div>
            <ProfileMenu user={user} compact />
          </header>
        )}

        <main
          className={cn(
            'app-content mx-auto min-h-dvh w-full max-w-[1400px]',
            !isChatRoute && 'md:min-h-[calc(100dvh-4rem)]',
          )}
        >
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

function ProfileMenu({
  user,
  compact = false,
}: {
  user: AppShellUser | null;
  compact?: boolean;
}) {
  const displayName = user?.name || 'Người dùng';

  return (
    <details className="group relative">
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center rounded-xl outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary/30',
          compact ? 'gap-2 p-1.5' : 'w-full gap-3 p-2',
        )}
      >
        <Avatar size={compact ? 'default' : 'lg'}>
          {user?.image ? (
            <AvatarImage src={user.image} alt={displayName} />
          ) : null}
          <AvatarFallback className="bg-emerald-50 font-semibold text-primary">
            {getInitials(displayName) || 'U'}
          </AvatarFallback>
        </Avatar>
        <span className={cn('min-w-0', compact ? 'hidden lg:block' : 'flex-1')}>
          <span className="block truncate text-sm font-semibold text-slate-800">
            {displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {user?.email || 'Chưa đăng nhập'}
          </span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground transition group-open:rotate-180" />
      </summary>

      <div
        className={cn(
          'absolute z-50 w-64 overflow-hidden rounded-2xl border border-border bg-white p-2 shadow-xl',
          compact ? 'right-0 top-[calc(100%+8px)]' : 'bottom-[calc(100%+8px)] left-0',
        )}
      >
        {user?.isDevelopmentUser && (
          <p className="mx-2 mb-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700">
            Chế độ local development
          </p>
        )}
        <Link
          href="/settings"
          className="flex h-10 items-center gap-2 rounded-xl px-3 text-sm hover:bg-slate-50"
        >
          <Settings className="size-4 text-muted-foreground" />
          Hồ sơ & cài đặt
        </Link>
        {!user?.isDevelopmentUser && (
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex h-10 w-full items-center gap-2 rounded-xl px-3 text-sm text-destructive hover:bg-rose-50"
          >
            <LogOut className="size-4" />
            Đăng xuất
          </button>
        )}
      </div>
    </details>
  );
}
