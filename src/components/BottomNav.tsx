'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Plus, ReceiptText, UserRound, WalletCards } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', icon: Home, label: 'Tổng quan' },
  { href: '/expenses', icon: ReceiptText, label: 'Giao dịch' },
  { href: '/planning', icon: WalletCards, label: 'Kế hoạch' },
  { href: '/settings', icon: UserRound, label: 'Tài khoản' },
];

interface BottomNavUser {
  name: string;
  email: string;
  image: string;
  isDevelopmentUser: boolean;
}

export function BottomNav({ user }: { user: BottomNavUser | null }) {
  const pathname = usePathname();
  if (pathname === '/chat' || pathname === '/debt-chat') return null;

  const leftItems = navItems.slice(0, 2);
  const rightItems = navItems.slice(2);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white/95 pb-safe backdrop-blur-xl md:hidden">
      <div className="mx-auto grid h-[68px] max-w-lg grid-cols-5 items-end px-1">
        {leftItems.map((item) => (
          <NavItem key={item.href} item={item} pathname={pathname} />
        ))}
        <Link
          href="/chat"
          aria-label="Ghi giao dịch nhanh"
          className="group relative flex h-full items-end justify-center pb-2"
        >
          <span className="absolute -top-7 flex size-[54px] items-center justify-center rounded-full border-[5px] border-[#f7f9fb] bg-[#00bc7c] text-white shadow-[0_12px_24px_-10px_rgba(0,188,124,0.85)] transition-transform group-active:scale-95">
            <Plus className="size-6" strokeWidth={2.5} />
          </span>
          <span className="text-[10px] font-semibold text-[#00a970]">Ghi nhanh</span>
        </Link>
        {rightItems.map((item) => (
          item.href === '/settings' ? <AccountNavItem key={item.href} item={item} pathname={pathname} user={user} /> : <NavItem key={item.href} item={item} pathname={pathname} />
        ))}
      </div>
    </nav>
  );
}

function AccountNavItem({ item, pathname, user }: { item: (typeof navItems)[number]; pathname: string; user: BottomNavUser | null }) {
  const isPlanningRoute = pathname.startsWith('/planning') || pathname.startsWith('/budgets') || pathname.startsWith('/debts');
  const isActive = item.href === '/planning' ? isPlanningRoute : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const displayName = user?.name || 'Người dùng';
  return <Link href={item.href} className={cn('flex h-full min-w-0 flex-col items-center justify-center gap-1 pb-1.5 transition-colors', isActive ? 'text-[#00bc7c]' : 'text-slate-400')}>
    <Avatar size="sm" className="size-6">
      {user?.image ? <AvatarImage src={user.image} alt={displayName} /> : null}
      <AvatarFallback className="bg-emerald-50 text-[8px] font-semibold text-[#00a970]">{displayName.split(' ').filter(Boolean).slice(-1)[0]?.[0]?.toUpperCase() || <UserRound className="size-3" />}</AvatarFallback>
    </Avatar>
    <span className="max-w-full truncate text-[9px] font-medium">{item.label}</span>
  </Link>;
}

function NavItem({
  item,
  pathname,
}: {
  item: (typeof navItems)[number];
  pathname: string;
}) {
  const isPlanningRoute = pathname.startsWith('/planning') || pathname.startsWith('/budgets') || pathname.startsWith('/debts');
  const isActive = item.href === '/planning' ? isPlanningRoute : pathname === item.href || pathname.startsWith(`${item.href}/`);
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className={cn(
        'flex h-full min-w-0 flex-col items-center justify-center gap-1 pb-1.5 text-slate-400 transition-colors',
        isActive && 'text-[#00bc7c]',
      )}
    >
      <Icon className="size-[19px]" strokeWidth={isActive ? 2.3 : 1.7} />
      <span className="max-w-full truncate text-[9px] font-medium">{item.label}</span>
    </Link>
  );
}
