'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight,
  BadgeCheck,
  ChartNoAxesCombined,
  CircleDollarSign,
  ReceiptText,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const loginSchema = z.object({
  mode: z.enum(['login', 'register']),
  name: z.string().trim().max(80, 'Tên hiển thị tối đa 80 ký tự.'),
  email: z.string().trim().email('Email không hợp lệ.'),
  password: z.string().min(1, 'Nhập mật khẩu.'),
}).superRefine((values, context) => {
  if (values.mode !== 'register') return;
  if (!values.name) {
    context.addIssue({ code: 'custom', path: ['name'], message: 'Nhập tên hiển thị.' });
  }
  if (values.password.length < 10) {
    context.addIssue({ code: 'custom', path: ['password'], message: 'Mật khẩu cần ít nhất 10 ký tự.' });
  }
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const redirectTo = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('redirectTo') === '/chat'
    ? '/chat'
    : '/';
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotStatus, setForgotStatus] = useState<{ type: 'idle' | 'success' | 'error'; message?: string }>({ type: 'idle' });
  const [isSendingReset, setIsSendingReset] = useState(false);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { mode: 'login', name: '', email: '', password: '' },
  });
  const mode = useWatch({ control: form.control, name: 'mode' });
  const isRegistering = mode === 'register';

  useEffect(() => {
    let isActive = true;
    fetch('/api/auth/providers')
      .then(async (response) => response.ok
        ? await response.json() as Record<string, unknown>
        : {})
      .then((providers) => {
        if (isActive) setGoogleEnabled(Boolean(providers.google));
      })
      .catch(() => {
        if (isActive) setGoogleEnabled(false);
      });

    return () => { isActive = false; };
  }, []);

  async function handleCredentials(values: LoginFormValues) {
    form.clearErrors('root.server');
    try {
      if (isRegistering) {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: values.name, email: values.email, password: values.password }),
        });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error || 'Không thể tạo tài khoản.');
      }

      const result = await signIn('credentials', {
        email: values.email,
        password: values.password,
        redirect: false,
      });
      if (!result || result.error) throw new Error('Email hoặc mật khẩu không đúng.');

      router.replace(redirectTo);
      router.refresh();
    } catch (submissionError) {
      form.setError('root.server', {
        type: 'server',
        message: submissionError instanceof Error ? submissionError.message : 'Không thể đăng nhập.',
      });
    }
  }

  function changeMode(value: string) {
    if (value !== 'login' && value !== 'register') return;
    form.setValue('mode', value);
    form.clearErrors();
  }

  async function handleForgotPassword(event: React.FormEvent) {
    event.preventDefault();
    const normalized = forgotEmail.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(normalized)) {
      setForgotStatus({ type: 'error', message: 'Vui lòng nhập email hợp lệ.' });
      return;
    }
    setIsSendingReset(true);
    setForgotStatus({ type: 'idle' });
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalized }),
      });
      const data = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Không thể gửi email đặt lại mật khẩu.');
      }
      setForgotStatus({
        type: 'success',
        message: 'Nếu email tồn tại trong hệ thống, liên kết đặt lại mật khẩu đã được gửi.',
      });
    } catch (error) {
      setForgotStatus({
        type: 'error',
        message: error instanceof Error ? error.message : 'Không thể gửi email đặt lại mật khẩu.',
      });
    } finally {
      setIsSendingReset(false);
    }
  }

  return (
    <main className="relative isolate min-h-dvh overflow-hidden bg-[#f5f8f6] text-slate-900">
      <div aria-hidden="true" className="pointer-events-none absolute -right-40 -top-48 -z-10 size-[34rem] rounded-full bg-emerald-200/55 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-64 -left-40 -z-10 size-[34rem] rounded-full bg-lime-100/80 blur-3xl" />

      <div className="mx-auto grid min-h-dvh w-full max-w-6xl items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[1fr_0.82fr] lg:gap-16 lg:px-12 lg:py-12">
        <section className="mx-auto w-full max-w-xl lg:mx-0">
          <div className="flex items-center gap-3">
            <Image
              src="/arc-irobot.png"
              alt="ARC Irobot"
              width={112}
              height={76}
              priority
              className="h-14 w-[84px] object-contain object-left"
            />
            <div className="border-l border-slate-200 pl-3">
              <p className="text-sm font-semibold tracking-tight text-slate-800">ARC Irobot</p>
              <p className="mt-0.5 text-xs text-slate-500">Quản lý tài chính cá nhân</p>
            </div>
          </div>

          <div className="mt-10 sm:mt-14 lg:mt-20">
            <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-emerald-800 shadow-sm">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Rõ dòng tiền, nhẹ đầu mỗi ngày
            </p>
            <h1 className="mt-5 max-w-[12ch] text-4xl font-semibold leading-[1.05] tracking-[-0.055em] text-slate-900 sm:text-5xl lg:text-6xl">
              Tiền của mình,
              <span className="mt-1 block text-emerald-600">mình làm chủ.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-slate-600 sm:text-lg">
              Ghi lại thu chi nhanh, xem ngân sách và nắm tình hình tài chính trong một nơi.
            </p>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:mt-10">
            <Feature icon={ReceiptText} title="Ghi nhanh" description="Nhập tay hoặc nhờ AI" />
            <Feature icon={CircleDollarSign} title="Lập kế hoạch" description="Ngân sách và công nợ" />
            <Feature icon={ChartNoAxesCombined} title="Theo dõi" description="Thống kê theo kỳ" />
          </div>

          <p className="mt-8 hidden items-center gap-2 text-xs text-slate-500 sm:flex">
            <BadgeCheck className="size-4 text-emerald-600" />
            Dữ liệu được tách riêng theo từng tài khoản.
          </p>
        </section>

        <section className="mx-auto w-full max-w-md lg:mx-0 lg:justify-self-end">
          <Card className="rounded-2xl border-white/80 bg-white/95 py-0 shadow-[0_24px_80px_-36px_rgba(15,45,32,0.32)] backdrop-blur">
            <CardHeader className="gap-2 px-5 pt-6 sm:px-7 sm:pt-8">
              <div className="mb-1 flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <WalletCards className="size-5" />
              </div>
              <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900">
                {isRegistering ? 'Tạo tài khoản' : 'Chào mừng trở lại'}
              </CardTitle>
              <CardDescription className="leading-6">
                {isRegistering
                  ? 'Tạo tài khoản để bắt đầu quản lý tài chính cá nhân.'
                  : 'Đăng nhập để tiếp tục theo dõi thu chi.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="px-5 pb-6 sm:px-7 sm:pb-8">
              <Tabs
                value={isRegistering ? 'register' : 'login'}
                onValueChange={changeMode}
                className="gap-5"
              >
                <TabsList aria-label="Chọn đăng nhập hoặc đăng ký" className="grid h-11 w-full grid-cols-2">
                  <TabsTrigger value="login">Đăng nhập</TabsTrigger>
                  <TabsTrigger value="register">Đăng ký</TabsTrigger>
                </TabsList>

                <TabsContent value={isRegistering ? 'register' : 'login'}>
              <form className="space-y-4" noValidate onSubmit={form.handleSubmit(handleCredentials)}>
                    {isRegistering ? (
                      <div className="space-y-2">
                        <Label htmlFor="login-name">Tên hiển thị</Label>
                        <Input
                          id="login-name"
                          autoComplete="name"
                          className="h-11 rounded-xl px-3"
                          placeholder="Tên hiển thị"
                      aria-invalid={Boolean(form.formState.errors.name)}
                      {...form.register('name')}
                        />
                    <FieldError message={form.formState.errors.name?.message} />
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <Label htmlFor="login-email">Email</Label>
                      <Input
                        id="login-email"
                        autoComplete="email"
                        className="h-11 rounded-xl px-3"
                        placeholder="email@example.com"
                        type="email"
                    aria-invalid={Boolean(form.formState.errors.email)}
                    {...form.register('email')}
                      />
                  <FieldError message={form.formState.errors.email?.message} />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="login-password">Mật khẩu</Label>
                        {!isRegistering ? (
                          <button
                            type="button"
                            onClick={() => {
                              setForgotEmail(form.getValues('email') || '');
                              setForgotStatus({ type: 'idle' });
                              setForgotOpen(true);
                            }}
                            className="text-xs font-medium text-emerald-700 hover:underline"
                          >
                            Quên mật khẩu?
                          </button>
                        ) : null}
                      </div>
                      <Input
                        id="login-password"
                        autoComplete={isRegistering ? 'new-password' : 'current-password'}
                        className="h-11 rounded-xl px-3"
                        placeholder="Nhập mật khẩu"
                        type="password"
                    aria-invalid={Boolean(form.formState.errors.password)}
                    {...form.register('password')}
                      />
                      {isRegistering ? (
                        <p className="text-xs text-muted-foreground">Ít nhất 10 ký tự.</p>
                      ) : null}
                  <FieldError message={form.formState.errors.password?.message} />
                    </div>

                    {form.formState.errors.root?.server?.message ? (
                      <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                        {form.formState.errors.root.server.message}
                      </p>
                    ) : null}

                    <Button
                      type="submit"
                      size="lg"
                      disabled={form.formState.isSubmitting}
                      className="h-11 w-full rounded-xl text-sm font-semibold"
                    >
                      {form.formState.isSubmitting
                        ? 'Đang xử lý…'
                        : isRegistering ? 'Tạo tài khoản' : 'Đăng nhập'}
                      {!form.formState.isSubmitting ? <ArrowRight className="ml-1 size-4" /> : null}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>

              {googleEnabled ? (
                <>
                  <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    hoặc tiếp tục với
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => signIn('google', { redirectTo })}
                    className="h-11 w-full rounded-xl border-slate-200 text-sm font-semibold"
                  >
                    <GoogleMark />
                    Google
                  </Button>
                </>
              ) : null}

              <p className="mt-5 text-center text-xs leading-5 text-muted-foreground">
                Dữ liệu được tách riêng theo từng tài khoản.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Quên mật khẩu</DialogTitle>
            <DialogDescription>
              Nhập email tài khoản để nhận liên kết đặt lại mật khẩu (hiệu lực 30 phút).
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={handleForgotPassword}>
            <div className="space-y-2">
              <Label htmlFor="forgot-email">Email</Label>
              <Input
                id="forgot-email"
                type="email"
                placeholder="email@example.com"
                className="h-11 rounded-xl"
                value={forgotEmail}
                onChange={(event) => setForgotEmail(event.target.value)}
              />
            </div>
            {forgotStatus.message ? (
              <p
                role="alert"
                className={
                  forgotStatus.type === 'error'
                    ? 'rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive'
                    : 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800'
                }
              >
                {forgotStatus.message}
              </p>
            ) : null}
            <Button type="submit" disabled={isSendingReset} className="h-11 w-full rounded-xl font-semibold">
              {isSendingReset ? 'Đang gửi…' : 'Gửi liên kết đặt lại'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p role="alert" className="text-xs font-medium text-destructive">{message}</p> : null;
}

function Feature({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white bg-white/65 p-3 shadow-sm sm:block sm:p-4">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 sm:mt-3 sm:block">
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{description}</span>
      </span>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.77.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.02 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}
