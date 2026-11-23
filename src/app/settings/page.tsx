'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import {
  ArrowLeft,
  Bell,
  ChartNoAxesCombined,
  ChevronRight,
  Database,
  KeyRound,
  LayoutList,
  LogOut,
  Repeat,
  SlidersHorizontal,
  UserRound,
  Users,
  Wallet,
  WandSparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';

interface ProfileResponse {
  name: string;
  email: string;
  image: string;
  isDevelopmentUser: boolean;
  hasPassword?: boolean;
}

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

const SETTING_GROUPS = [
  {
    title: 'Tài chính & Sổ sách',
    items: [
      {
        href: '/settings/ledgers',
        icon: Users,
        title: 'Sổ chung & Thành viên',
        description: 'Sổ cá nhân, gia đình và quyền truy cập',
      },
      {
        href: '/settings/accounts',
        icon: Wallet,
        title: 'Ví & Tài khoản',
        description: 'Ví tiền mặt, ngân hàng và số dư ban đầu',
      },
      {
        href: '/settings/categories',
        icon: LayoutList,
        title: 'Danh mục thu chi',
        description: 'Tên, biểu tượng và màu cho từng danh mục',
      },
    ],
  },
  {
    title: 'Tự động hóa & Nhắc nhở',
    items: [
      {
        href: '/settings/automation',
        icon: Repeat,
        title: 'Định kỳ & Phím tắt',
        description: 'Lịch nhắc hóa đơn và phím tắt ghi nhanh',
      },
      {
        href: '/settings/reminders',
        icon: Bell,
        title: 'Nhắc nhở & Thông báo',
        description: 'Giờ nhắc ghi chép mỗi ngày trên thiết bị',
      },
    ],
  },
  {
    title: 'Trợ lý & Trải nghiệm',
    items: [
      {
        href: '/settings/ai',
        icon: WandSparkles,
        title: 'Trợ lý AI',
        description: 'Kết nối và chọn mô hình AI đọc hóa đơn',
      },
      {
        href: '/settings/modules',
        icon: SlidersHorizontal,
        title: 'Tùy chỉnh tính năng',
        description: 'Bật hoặc ẩn các mục theo thói quen sử dụng',
      },
    ],
  },
  {
    title: 'Dữ liệu & Bảo mật',
    items: [
      {
        href: '/settings/data',
        icon: Database,
        title: 'Dữ liệu & Sao lưu',
        description: 'Xuất, khôi phục và làm mới dữ liệu',
      },
    ],
  },
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/profile', { signal: controller.signal })
      .then(async (res) => (res.ok ? (await res.json() as ProfileResponse) : null))
      .then((data) => {
        if (data && !controller.signal.aborted) setProfile(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  async function handleUpdatePassword(event: React.FormEvent) {
    event.preventDefault();
    if (newPassword.length < 10) {
      showToast('Mật khẩu mới cần ít nhất 10 ký tự', 'error');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showToast('Xác nhận mật khẩu chưa khớp', 'error');
      return;
    }
    setIsUpdatingPassword(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...(profile?.hasPassword ? { currentPassword } : {}),
          newPassword,
        }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string; hasPassword?: boolean };
      if (!response.ok) {
        throw new Error(data.error || 'Không thể cập nhật mật khẩu.');
      }
      setProfile((current) => current ? { ...current, hasPassword: Boolean(data.hasPassword ?? true) } : current);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setIsPasswordDialogOpen(false);
      showToast(profile?.hasPassword ? 'Đã đổi mật khẩu' : 'Đã tạo mật khẩu đăng nhập', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể cập nhật mật khẩu', 'error');
    } finally {
      setIsUpdatingPassword(false);
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-4xl space-y-6 bg-background p-4 pb-nav md:px-8 md:py-7">
      <header className="flex items-center gap-3 pt-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="size-10 rounded-full md:hidden"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 md:text-2xl">Hồ sơ &amp; Cài đặt</h1>
          <p className="mt-0.5 text-xs text-slate-500 md:text-sm">
            Tài khoản, sổ chi tiêu và các tùy chỉnh cá nhân
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        <div className="flex flex-wrap items-center gap-3.5 p-5">
          <Avatar size="lg" className="size-14 ring-1 ring-slate-200/80">
            {profile?.image ? <AvatarImage src={profile.image} alt={profile.name} /> : null}
            <AvatarFallback className="bg-emerald-50 text-base font-semibold text-[#00a970]">
              {getInitials(profile?.name || 'Người dùng') || <UserRound className="size-5" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-900">{profile?.name || 'Đang tải tài khoản…'}</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">{profile?.email || '—'}</p>
          </div>
          {!profile?.isDevelopmentUser ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="outline" size="sm" className="rounded-xl border-slate-200 text-slate-700" onClick={() => setIsPasswordDialogOpen(true)}>
                <KeyRound className="size-3.5" />
                <span>{profile?.hasPassword ? 'Đổi mật khẩu' : 'Tạo mật khẩu'}</span>
              </Button>
              <Button variant="outline" size="sm" className="rounded-xl border-slate-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => signOut({ callbackUrl: '/login' })}>
                <LogOut className="size-3.5" />
                <span className="hidden sm:inline">Đăng xuất</span>
              </Button>
            </div>
          ) : null}
        </div>
        <Link
          href="/stats"
          className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-emerald-50/60 hover:text-[#00a970]"
        >
          <span className="flex items-center gap-2.5">
            <ChartNoAxesCombined className="size-4 text-[#00a970]" strokeWidth={1.8} />
            Xem báo cáo chi tiêu &amp; tiết kiệm
          </span>
          <ChevronRight className="size-4 text-slate-400" />
        </Link>
      </section>

      <div className="space-y-5">
        {SETTING_GROUPS.map((group) => (
          <section key={group.title} className="space-y-2">
            <h2 className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </h2>
            <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="group flex items-center gap-3.5 px-4 py-3.5 transition hover:bg-slate-50/80 sm:px-5"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/70 bg-slate-50 text-slate-600 transition group-hover:border-emerald-200 group-hover:bg-emerald-50/70 group-hover:text-[#00a970]">
                      <Icon className="size-[18px]" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{item.title}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{item.description}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>{profile?.hasPassword ? 'Đổi mật khẩu' : 'Tạo mật khẩu đăng nhập'}</DialogTitle>
            <DialogDescription>
              {profile?.hasPassword
                ? 'Nhập mật khẩu hiện tại và mật khẩu mới (tối thiểu 10 ký tự).'
                : 'Tạo mật khẩu để đăng nhập bằng Email ngoài Google.'}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleUpdatePassword}>
            {profile?.hasPassword ? (
              <div className="space-y-2">
                <Label htmlFor="settings-current-password">Mật khẩu hiện tại</Label>
                <Input
                  id="settings-current-password"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={(event) => setCurrentPassword(event.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="settings-new-password">Mật khẩu mới</Label>
              <Input
                id="settings-new-password"
                type="password"
                autoComplete="new-password"
                placeholder="Ít nhất 10 ký tự"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-confirm-password">Nhập lại mật khẩu mới</Label>
              <Input
                id="settings-confirm-password"
                type="password"
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(event) => setConfirmNewPassword(event.target.value)}
              />
            </div>
            <Button type="submit" disabled={isUpdatingPassword} className="h-11 w-full rounded-xl font-semibold">
              {isUpdatingPassword ? 'Đang lưu…' : 'Lưu mật khẩu'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
