'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import {
  CirclePlus,
  ChevronDown,
  Home,
  LogOut,
  Receipt,
  Settings,
  WalletCards,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/useToast';
import { cn, formatCurrency, getCurrentMonth } from '@/lib/utils';

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

interface BudgetAlertResponse {
  id: string;
  budget_amount: number;
  category_name: string;
  spent_amount: number;
}

const desktopNavigation = [
  { href: '/', icon: Home, label: 'Tổng quan' },
  { href: '/expenses', icon: Receipt, label: 'Giao dịch' },
  { href: '/planning', icon: WalletCards, label: 'Kế hoạch' },
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
  const hasCheckedBudgetAlerts = useRef(false);
  const { showToast } = useToast();
  const isPublicRoute = pathname.startsWith('/login');
  const isChatRoute = pathname === '/chat' || pathname === '/debt-chat';

  useEffect(() => {
    if (!user || isPublicRoute || hasCheckedBudgetAlerts.current) return;
    hasCheckedBudgetAlerts.current = true;

    const notifyBudgetStatus = async () => {
      const response = await fetch(`/api/dashboard/budget-alerts?month=${getCurrentMonth()}`);
      if (!response.ok) return;
      const alerts: BudgetAlertResponse[] = await response.json();
      alerts
        .filter((alert) => Number(alert.spent_amount) >= Number(alert.budget_amount))
        .forEach((alert) => {
          const spent = Number(alert.spent_amount);
          const limit = Number(alert.budget_amount);
          showToast(
            `Chi hố vãi — ${alert.category_name} đã thủng ngân sách`,
            'error',
            `Đã chi ${formatCurrency(spent)}/${formatCurrency(limit)}, thủng ${formatCurrency(spent - limit)}. Khoản đã chi không cứu được; giờ bớt vung tay với các khoản sau.`,
          );
        });
    };

    void notifyBudgetStatus();
  }, [isPublicRoute, showToast, user]);

  if (isPublicRoute) {
    return <main className="min-h-dvh">{children}</main>;
  }

  return (
    <div className="min-h-dvh bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-20 border-r border-border/80 bg-white md:flex md:flex-col lg:w-64">
        <Link href="/" aria-label="ARC Irobot, về tổng quan" className="flex h-24 items-center justify-center gap-3 px-2 lg:justify-start lg:px-5">
          <img src="/arc-irobot.png" alt="ARC Irobot" className="h-auto w-16 shrink-0 object-contain lg:w-[110px]" />
          <span className="hidden lg:block">
            <span className="block text-[11px] text-muted-foreground">
              Quản lý chi tiêu
            </span>
          </span>
        </Link>

        <nav className="flex-1 space-y-1 px-2 py-4 lg:px-3">
          {desktopNavigation.map((item) => {
            const isPlanningRoute = pathname.startsWith('/planning') || pathname.startsWith('/budgets') || pathname.startsWith('/debts');
            const isActive = item.href === '/planning'
              ? isPlanningRoute
              : pathname === item.href || (item.href !== '/' && pathname.startsWith(`${item.href}/`));
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-label={item.label}
                className={cn(
                  'flex h-11 items-center justify-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors lg:justify-start',
                  isActive
                    ? 'bg-emerald-50 text-primary'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900',
                )}
              >
                <Icon className="size-[18px]" strokeWidth={isActive ? 2.4 : 1.8} />
                <span className="hidden lg:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-2 lg:p-3">
          <Link
            href="/chat"
            aria-label="Ghi giao dịch nhanh"
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-3 text-sm font-semibold text-white shadow-lg shadow-emerald-200 transition hover:bg-[#00a86f] lg:px-4"
          >
            <CirclePlus className="size-5" />
            <span className="hidden lg:inline">Ghi giao dịch nhanh</span>
          </Link>
        </div>

        <div className="border-t border-border/80 p-2 lg:p-3">
          <ProfileMenu user={user} compact />
        </div>
      </aside>

      <div className="md:pl-20 lg:pl-64">
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

      <BottomNav user={user} />
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Tài khoản ${displayName}`}
          className={cn(
            'flex items-center rounded-xl outline-none transition hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-primary/30',
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
          <ChevronDown className="size-4 text-muted-foreground transition group-data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={compact ? 'bottom' : 'top'} align={compact ? 'end' : 'start'} className="w-64 rounded-2xl p-2">
        {user?.isDevelopmentUser && (
          <p className="mx-2 mb-1 rounded-lg bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-700">
            Chế độ local development
          </p>
        )}
        <DropdownMenuItem asChild className="h-10 cursor-pointer rounded-xl px-3">
          <Link href="/settings" className="flex items-center gap-2 text-sm">
          <Settings className="size-4 text-muted-foreground" />
          Hồ sơ & cài đặt
          </Link>
        </DropdownMenuItem>
        {!user?.isDevelopmentUser && (
          <DropdownMenuItem variant="destructive" className="h-10 cursor-pointer rounded-xl px-3" onSelect={() => signOut({ callbackUrl: '/login' })}>
            <LogOut className="size-4" />
            Đăng xuất
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
