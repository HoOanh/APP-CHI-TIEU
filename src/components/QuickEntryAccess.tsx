'use client';

import { ArrowUpRight, Download, KeyRound, Monitor, PlusSquare, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { Button, buttonVariants } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const shareUrl = process.env.NEXT_PUBLIC_QUICK_ENTRY_SHORTCUT_URL;
const appleShortcutLink = shareUrl && /^https:\/\/www\.icloud\.com\/shortcuts\/[a-zA-Z0-9]+\/?$/.test(shareUrl)
  ? shareUrl
  : undefined;

export function QuickEntryAccess({ onChatPage = false, iconOnMobile = false }: { onChatPage?: boolean; iconOnMobile?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size={iconOnMobile ? 'icon' : 'sm'} aria-label="Thêm lối tắt Ghi nhanh" className={iconOnMobile ? 'size-9 gap-1.5 rounded-full border-slate-200 bg-white text-slate-700 shadow-2xs hover:bg-slate-50 sm:h-9 sm:w-auto sm:rounded-xl sm:px-3' : 'h-9 gap-1.5 rounded-xl border-slate-200 bg-white px-2.5 text-slate-700 shadow-2xs hover:bg-slate-50 sm:px-3'}>
          <PlusSquare className="size-4" aria-hidden />
          <span className={iconOnMobile ? 'hidden sm:inline' : undefined}>Lối tắt</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md gap-4 pr-5">
        <div className="pr-7">
          <DialogTitle>Thêm lối tắt Ghi nhanh</DialogTitle>
          <DialogDescription className="mt-1">Mở thẳng Chat để nhập khoản chi hoặc bấm mic.</DialogDescription>
        </div>
        {!onChatPage && (
          <a href="/chat" className={buttonVariants({ variant: 'outline', className: 'w-full justify-between' })}>
            Mở trang Ghi nhanh <ArrowUpRight className="size-4" aria-hidden />
          </a>
        )}
        <section className="rounded-xl border border-slate-200 p-3">
          <h3 className="flex items-center gap-2 font-semibold"><Smartphone className="size-4 text-emerald-700" aria-hidden /> iPhone</h3>
          <p className="mt-1.5 text-xs leading-5 text-slate-600">
            Mở trang Ghi nhanh trong Safari, chọn <strong>Chia sẻ → Thêm vào MH chính</strong>, bật <strong>Mở dưới dạng ứng dụng web</strong> nếu có rồi bấm <strong>Thêm</strong>.
          </p>
        </section>
        <section className="rounded-xl border border-slate-200 p-3">
          <h3 className="flex items-center gap-2 font-semibold"><Monitor className="size-4 text-emerald-700" aria-hidden /> Mac</h3>
          <p className="mt-1.5 text-xs leading-5 text-slate-600">Mở file tải về để vào Chat. Trong Safari cũng có thể chọn <strong>Tệp → Thêm vào Dock</strong> ngay trên trang Ghi nhanh.</p>
          <a href="/ghi-nhanh.webloc" download="Ghi-nhanh-ARC.webloc" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mt-3' })}>
            <Download className="size-4" aria-hidden /> Tải lối tắt cho Mac
          </a>
        </section>
        {appleShortcutLink && (
          <a href={appleShortcutLink} target="_blank" rel="noopener noreferrer" className={buttonVariants({ className: 'w-full' })}>
            Thêm vào Phím tắt Apple <ArrowUpRight className="size-4" aria-hidden />
          </a>
        )}
        <Link href="/settings/automation#shortcuts" className={buttonVariants({ variant: 'outline', className: 'w-full justify-between' })}>
          <span className="flex items-center gap-2"><KeyRound className="size-4 text-slate-600" aria-hidden /> Tạo mã kết nối Phím tắt iPhone</span>
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </DialogContent>
    </Dialog>
  );
}
