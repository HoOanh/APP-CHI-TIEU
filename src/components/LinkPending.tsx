'use client';

import { useLinkStatus } from 'next/link';
import { LoaderCircle } from 'lucide-react';

export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" className="ml-auto flex shrink-0 items-center text-emerald-700">
      <LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
      <span className="sr-only">Đang chuyển trang</span>
    </span>
  ) : null;
}
