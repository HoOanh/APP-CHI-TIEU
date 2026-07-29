'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Receipt, MessageSquare, PiggyBank, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', icon: Home, label: 'Tổng quan' },
  { href: '/expenses', icon: Receipt, label: 'Chi tiêu' },
  { href: '/chat', icon: MessageSquare, label: 'AI Chat' },
  { href: '/budgets', icon: PiggyBank, label: 'Ngân sách' },
  { href: '/stats', icon: BarChart3, label: 'Thống kê' },
];

export function BottomNav() {
  const pathname = usePathname();

  // Hide on chat-like full-screen pages
  const hiddenPaths = ['/chat', '/debt-chat'];
  if (hiddenPaths.includes(pathname)) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white/95 backdrop-blur-xl pb-safe md:hidden">
      <div className="mx-auto max-w-lg flex items-center justify-around h-16">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 px-3 py-1.5 rounded-xl transition-all duration-200 min-w-[56px]',
                isActive
                  ? 'text-[#00BC7C]'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <div className={cn(
                'relative flex items-center justify-center',
                isActive && 'after:absolute after:-inset-1.5 after:bg-[#00BC7C]/10 after:rounded-xl after:-z-10'
              )}>
                <Icon className={cn('w-5 h-5 transition-transform', isActive && 'scale-110')} strokeWidth={isActive ? 2.5 : 1.5} />
              </div>
              <span className={cn('text-[10px] font-medium', isActive && 'font-semibold')}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
