'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle2, KeyRound } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError('');

    if (!token) {
      setError('Liên kết đặt lại mật khẩu không hợp lệ.');
      return;
    }
    if (password.length < 10) {
      setError('Mật khẩu mới cần ít nhất 10 ký tự.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Xác nhận mật khẩu chưa khớp.');
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Không thể đặt lại mật khẩu.');
      }
      setDone(true);
      window.setTimeout(() => router.replace('/login'), 1800);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Không thể đặt lại mật khẩu.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f5f8f6] px-4 py-10">
      <Card className="w-full max-w-md rounded-2xl border-white/80 bg-white shadow-[0_24px_80px_-36px_rgba(15,45,32,0.32)]">
        <CardHeader className="gap-2">
          <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
            {done ? <CheckCircle2 className="size-5" /> : <KeyRound className="size-5" />}
          </div>
          <CardTitle className="text-xl font-semibold text-slate-900">
            {done ? 'Đặt lại mật khẩu thành công' : 'Tạo mật khẩu mới'}
          </CardTitle>
          <CardDescription>
            {done
              ? 'Đang chuyển về trang đăng nhập...'
              : 'Nhập mật khẩu mới có ít nhất 10 ký tự cho tài khoản ARC Irobot.'}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {done ? (
            <Link href="/login" className={buttonVariants({ className: 'h-11 w-full rounded-xl font-semibold' })}>
              Đăng nhập ngay
            </Link>
          ) : (
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="reset-password">Mật khẩu mới</Label>
                <Input
                  id="reset-password"
                  type="password"
                  autoComplete="new-password"
                  className="h-11 rounded-xl"
                  placeholder="Ít nhất 10 ký tự"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-password-confirm">Nhập lại mật khẩu</Label>
                <Input
                  id="reset-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  className="h-11 rounded-xl"
                  placeholder="Nhập lại mật khẩu mới"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </div>

              {error ? (
                <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}

              <Button type="submit" disabled={isSubmitting} className="h-11 w-full rounded-xl font-semibold">
                {isSubmitting ? 'Đang cập nhật…' : 'Cập nhật mật khẩu'}
              </Button>
              <Link href="/login" className="flex items-center justify-center gap-1.5 pt-1 text-xs font-medium text-slate-500 hover:text-slate-800">
                <ArrowLeft className="size-3.5" /> Quay lại đăng nhập
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
