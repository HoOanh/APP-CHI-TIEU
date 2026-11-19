'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpenCheck, CheckCircle2, LoaderCircle, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type InviteState =
  | { status: 'loading' }
  | { status: 'success'; ledgerName: string; role: string }
  | { status: 'error'; message: string };

export default function AcceptLedgerInvitePage() {
  const [state, setState] = useState<InviteState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    const token = new URLSearchParams(window.location.search).get('token')?.trim() ?? '';
    if (!token) {
      Promise.resolve().then(() => {
        if (active) setState({ status: 'error', message: 'Thiếu mã lời mời tham gia sổ.' });
      });
      return () => { active = false; };
    }

    fetch('/api/ledgers/invites/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({})) as {
          ledgerName?: string;
          role?: string;
          error?: string;
        };
        if (res.status === 401) {
          const target = `${window.location.pathname}${window.location.search}`;
          window.location.assign(`/login?redirectTo=${encodeURIComponent(target)}`);
          return;
        }
        if (!res.ok) {
          throw new Error(data.error || 'Không thể chấp nhận lời mời.');
        }
        if (!active) return;
        setState({
          status: 'success',
          ledgerName: data.ledgerName || 'Sổ chung',
          role: data.role === 'viewer' ? 'Chỉ xem' : 'Biên tập',
        });
      })
      .catch((error: unknown) => {
        if (!active) return;
        setState({
          status: 'error',
          message: error instanceof Error ? error.message : 'Không thể chấp nhận lời mời.',
        });
      });

    return () => { active = false; };
  }, []);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f7f9fb] p-4">
      <Card className="w-full max-w-md rounded-2xl border-slate-200 bg-white shadow-sm">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-[#00a970]">
            <BookOpenCheck className="size-6" />
          </div>
          <CardTitle className="text-lg">Tham gia sổ tài chính chung</CardTitle>
          <CardDescription>ARC Irobot · Sổ chi tiêu đồng bộ</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          {state.status === 'loading' ? (
            <div className="flex flex-col items-center gap-3 py-6 text-slate-600">
              <LoaderCircle className="size-7 animate-spin text-[#00bc7c]" />
              <p className="text-sm">Đang xác nhận lời mời…</p>
            </div>
          ) : null}

          {state.status === 'success' ? (
            <div className="space-y-4 py-2">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="size-6" />
              </div>
              <div className="space-y-1">
                <p className="text-base font-semibold text-slate-800">
                  Bạn đã tham gia “{state.ledgerName}”
                </p>
                <p className="text-xs text-slate-500">
                  Quyền hạn: <strong className="text-slate-700">{state.role}</strong> · Hệ thống đã chuyển sang sổ này.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => window.location.assign('/')}
                className="h-10 w-full rounded-xl bg-[#00bc7c] font-semibold text-white hover:bg-[#00a970]"
              >
                Vào Tổng quan sổ ngay
              </Button>
            </div>
          ) : null}

          {state.status === 'error' ? (
            <div className="space-y-4 py-2">
              <div className="mx-auto flex size-11 items-center justify-center rounded-full bg-rose-100 text-rose-600">
                <AlertCircle className="size-6" />
              </div>
              <p className="text-sm text-rose-700">{state.message}</p>
              <Link
                href="/"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Quay về Tổng quan
              </Link>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
