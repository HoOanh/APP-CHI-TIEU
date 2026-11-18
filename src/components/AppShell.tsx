'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
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
  Landmark,
  ChartNoAxesCombined,
} from 'lucide-react';
import { BottomNav } from '@/components/BottomNav';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/useToast';
import { syncOfflineTransactions } from '@/lib/offline-queue';
import { cn, formatCurrency, getCurrentMonth } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { LinkPending } from '@/components/LinkPending';

const TransactionChat = dynamic(() => import('@/components/TransactionChat').then((module) => module.TransactionChat), {
  loading: () => <p role="status" className="p-6 text-sm text-muted-foreground">Đang mở Ghi nhanh…</p>,
});

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
  { href: '/budgets', icon: WalletCards, label: 'Ngân sách' },
  { href: '/debts', icon: Landmark, label: 'Công nợ' },
  { href: '/stats', icon: ChartNoAxesCombined, label: 'Thống kê' },
  { href: '/settings', icon: Settings, label: 'Cài đặt' },
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
  const quickButtonRef = useRef<HTMLButtonElement>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickBusy, setQuickBusy] = useState(false);
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

  useEffect(() => {
    if (!user || isPublicRoute) return;

    const syncPendingTransactions = async () => {
      const result = await syncOfflineTransactions().catch(() => ({ synced: 0, failed: 0 }));
      if (result.synced > 0) {
        showToast(
          `Đã đồng bộ ${result.synced} giao dịch offline`,
          'success',
          result.failed > 0 ? `${result.failed} giao dịch còn chờ thử lại.` : undefined,
        );
      }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void syncPendingTransactions();
    };

    void syncPendingTransactions();
    window.addEventListener('online', syncPendingTransactions);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', syncPendingTransactions);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isPublicRoute, showToast, user]);

  useEffect(() => {
    if (isPublicRoute || isChatRoute) return;
    const openQuickCapture = (event: KeyboardEvent) => {
      if (!window.matchMedia('(min-width: 768px)').matches || event.defaultPrevented || event.repeat || event.isComposing
        || event.key.toLowerCase() !== 'n' || event.ctrlKey || event.metaKey || event.altKey
        || !(event.target instanceof HTMLElement)
        || event.target.closest('input, textarea, select, [contenteditable], [role="dialog"]')) return;
      event.preventDefault();
      setQuickOpen(true);
    };
    window.addEventListener('keydown', openQuickCapture);
    return () => window.removeEventListener('keydown', openQuickCapture);
  }, [isChatRoute, isPublicRoute]);

  if (isPublicRoute) {
    return <main className="min-h-dvh">{children}</main>;
  }

  return (
    <div className="min-h-dvh bg-background">
      <aside aria-label="Thanh bên" className="fixed inset-y-0 left-0 z-40 hidden w-18 flex-col border-r border-slate-200/80 bg-white md:flex lg:w-55">
        <Link href="/" aria-label="ARC Irobot, về tổng quan" className="flex h-20 shrink-0 items-center justify-center px-3 lg:justify-start lg:px-5">
          <Image src="/arc-irobot.png" sizes="(min-width: 1024px) 96px, 56px" alt="ARC Irobot" width={96} height={64} className="h-auto w-14 object-contain lg:w-24" />
          <span className="hidden pl-3 text-[11px] font-medium text-slate-500 lg:block">Sổ chi tiêu</span>
        </Link>

        <div className="px-2 lg:px-3">
          <button
            type="button"
            ref={quickButtonRef}
            onClick={() => setQuickOpen(true)}
            aria-label="Ghi giao dịch nhanh"
            className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 lg:justify-start"
          >
            <CirclePlus className="size-4 shrink-0" />
            <span className="hidden flex-1 text-left lg:inline">Ghi nhanh</span>
            <kbd className="hidden rounded border border-white/30 px-1.5 py-0.5 text-[10px] lg:inline">N</kbd>
          </button>
        </div>

        <nav aria-label="Điều hướng chính" className="mt-5 flex-1 space-y-1 px-2 lg:px-3">
          {desktopNavigation.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== '/' && pathname.startsWith(href + '/'))
              || (href === '/budgets' && pathname === '/planning');
            return (
              <Link key={href} href={href} aria-label={label} aria-current={active ? 'page' : undefined}
                className={cn('relative flex h-10 items-center justify-center gap-2.5 rounded-xl px-2.5 text-sm transition-colors lg:justify-start',
                  active ? 'bg-emerald-50 font-semibold text-emerald-800' : 'font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900')}>
                <Icon className="size-[17px] shrink-0" aria-hidden />
                <span className="hidden lg:inline">{label}</span>
                <span className="absolute right-1.5 lg:static"><LinkPending /></span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-slate-200/80 p-2 lg:p-3"><ProfileMenu user={user} /></div>
      </aside>

      <div className="min-w-0 md:pl-18 lg:pl-55">
        <main className={cn('app-content mx-auto min-h-dvh w-full', !isChatRoute && 'max-w-[1440px]')}>{children}</main>
      </div>
      <BottomNav user={user} />
      <Dialog open={quickOpen} onOpenChange={(open) => { if (open || !quickBusy) setQuickOpen(open); }}>
        <DialogContent showCloseButton={!quickBusy} onCloseAutoFocus={(event) => {
          event.preventDefault();
          quickButtonRef.current?.focus();
        }} className="block w-[min(620px,calc(100vw-2rem))] overflow-hidden p-0">
          <DialogTitle className="sr-only">Ghi nhanh</DialogTitle>
          <DialogDescription className="sr-only">Ghi giao dịch ngay trên màn hình hiện tại.</DialogDescription>
          {quickOpen && <TransactionChat embedded onBusyChange={setQuickBusy} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProfileMenu({
  user,
}: {
  user: AppShellUser | null;
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
            'mx-auto gap-2 p-1.5 lg:w-full',
          )}
        >
        <Avatar>
          {user?.image ? (
            <AvatarImage src={user.image} alt={displayName} />
          ) : null}
          <AvatarFallback className="bg-emerald-50 font-semibold text-primary">
            {getInitials(displayName) || 'U'}
          </AvatarFallback>
        </Avatar>
        <span className="hidden min-w-0 flex-1 text-left lg:block">
          <span className="block truncate text-sm font-semibold text-slate-800">
            {displayName}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {user?.email || 'Chưa đăng nhập'}
          </span>
        </span>
          <ChevronDown className="hidden size-4 text-muted-foreground lg:block" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-64 rounded-2xl p-2">
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
