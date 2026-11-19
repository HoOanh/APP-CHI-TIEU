'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Check,
  CreditCard,
  Landmark,
  PiggyBank,
  Smartphone,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/useToast';
import { PERSONA_PRESETS, type PersonaId } from '@/lib/modules';
import { cn, formatMoneyInput, parseMoneyInput } from '@/lib/utils';

type AccountType = 'cash' | 'bank' | 'ewallet' | 'credit_card' | 'savings';

interface AdditionalAccountDraft {
  key: string;
  name: string;
  type: AccountType;
  selected: boolean;
  initialBalance: string;
}

const DEFAULT_EXTRA_ACCOUNTS: AdditionalAccountDraft[] = [
  { key: 'bank', name: 'Tài khoản ngân hàng', type: 'bank', selected: false, initialBalance: '' },
  { key: 'ewallet', name: 'Ví điện tử (MoMo/ZaloPay)', type: 'ewallet', selected: false, initialBalance: '' },
  { key: 'savings', name: 'Quỹ tiết kiệm', type: 'savings', selected: false, initialBalance: '' },
  { key: 'credit_card', name: 'Thẻ tín dụng', type: 'credit_card', selected: false, initialBalance: '' },
];

export default function OnboardingPage() {
  const { showToast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedPersonas, setSelectedPersonas] = useState<PersonaId[]>(['speed_tracker']);
  const [mainAccountName, setMainAccountName] = useState('Ví chính');
  const [mainBalance, setMainBalance] = useState('');
  const [extraAccounts, setExtraAccounts] = useState<AdditionalAccountDraft[]>(DEFAULT_EXTRA_ACCOUNTS);
  const [seedIncomeCategories, setSeedIncomeCategories] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const togglePersona = (id: PersonaId) => {
    setSelectedPersonas((current) => {
      if (current.includes(id)) {
        return current.length > 1 ? current.filter((item) => item !== id) : current;
      }
      return [...current, id];
    });
  };

  const goToStep2 = () => {
    const suggestedTypes = new Set<AccountType>();
    for (const id of selectedPersonas) {
      const preset = PERSONA_PRESETS.find((item) => item.id === id);
      preset?.suggestedAccounts.forEach((acc) => suggestedTypes.add(acc.type));
    }
    setExtraAccounts((current) =>
      current.map((acc) => ({
        ...acc,
        selected: suggestedTypes.has(acc.type),
      })),
    );
    setStep(2);
  };

  async function handleSkip() {
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skip: true }),
      });
      if (!response.ok) throw new Error('Không thể lưu cấu hình.');
      window.location.assign('/');
    } catch {
      showToast('Không thể hoàn tất bước khởi tạo', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleFinish(event: React.FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const response = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryPersona: selectedPersonas[0] ?? 'speed_tracker',
          personas: selectedPersonas,
          mainAccountName: mainAccountName.trim() || 'Ví chính',
          initialBalance: parseMoneyInput(mainBalance),
          additionalAccounts: extraAccounts
            .filter((acc) => acc.selected)
            .map((acc) => ({
              name: acc.name,
              type: acc.type,
              initial_balance: parseMoneyInput(acc.initialBalance),
            })),
          seedIncomeCategories,
        }),
      });
      const data = await response.json().catch(() => ({})) as { redirectTo?: string; error?: string };
      if (!response.ok) {
        throw new Error(data.error || 'Không thể hoàn tất khởi tạo.');
      }
      showToast('Đã thiết lập không gian tài chính cho bạn', 'success');
      window.location.assign(data.redirectTo || '/');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể hoàn tất khởi tạo', 'error');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh bg-[#f5f8f6] px-4 py-8 sm:px-6 md:py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
              <Sparkles className="size-3.5" /> Bước {step} / 2
            </p>
            <h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              {step === 1 ? 'Bạn muốn dùng ARC Irobot theo cách nào?' : 'Thiết lập nhanh ví tiền của bạn'}
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              {step === 1
                ? 'Chọn một hoặc nhiều nhu cầu. Bạn luôn có thể bật/tắt thêm tính năng trong Cài đặt bất cứ lúc nào.'
                : 'Đặt số dư ban đầu để ví phản ánh đúng tiền hiện có, hoặc để trống nếu muốn ghi từ 0đ.'}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            disabled={isSubmitting}
            onClick={() => void handleSkip()}
            className="shrink-0 text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Bỏ qua
          </Button>
        </header>

        {step === 1 ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2">
              {PERSONA_PRESETS.map((preset) => {
                const active = selectedPersonas.includes(preset.id);
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => togglePersona(preset.id)}
                    aria-pressed={active}
                    className={cn(
                      'flex items-start gap-3 rounded-2xl border p-4 text-left transition-all',
                      active
                        ? 'border-[#00bc7c] bg-emerald-50/70 shadow-sm ring-2 ring-[#00bc7c]/15'
                        : 'border-slate-200 bg-white hover:border-slate-300',
                    )}
                  >
                    <span
                      className={cn(
                        'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-xs',
                        active
                          ? 'border-[#00bc7c] bg-[#00bc7c] text-white'
                          : 'border-slate-300 bg-white text-transparent',
                      )}
                    >
                      <Check className="size-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-900">{preset.title}</p>
                        {preset.badge ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {preset.badge}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{preset.subtitle}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end">
              <Button type="button" size="lg" onClick={goToStep2} className="h-11 rounded-xl px-6 font-semibold">
                Tiếp tục <ArrowRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleFinish} className="space-y-5">
            <Card className="rounded-2xl border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="text-base">Ví mặc định</CardTitle>
                <CardDescription>Mọi khoản thu chi nhanh sẽ mặc định đi qua ví này.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="onboard-main-name">Tên ví chính</Label>
                  <Input
                    id="onboard-main-name"
                    value={mainAccountName}
                    onChange={(event) => setMainAccountName(event.target.value)}
                    placeholder="Ví chính"
                    className="h-11 rounded-xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="onboard-main-balance">Số dư hiện tại (VND)</Label>
                  <Input
                    id="onboard-main-balance"
                    inputMode="numeric"
                    value={mainBalance}
                    onChange={(event) => setMainBalance(formatMoneyInput(event.target.value))}
                    placeholder="0"
                    className="h-11 rounded-xl tabular-nums"
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-slate-200 bg-white">
              <CardHeader>
                <CardTitle className="text-base">Ví phụ gợi ý (tùy chọn)</CardTitle>
                <CardDescription>Chọn thêm ví nếu bạn muốn tách tiền mặt, ngân hàng hoặc quỹ tiết kiệm.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {extraAccounts.map((acc) => {
                  const Icon = acc.type === 'bank'
                    ? Landmark
                    : acc.type === 'ewallet'
                      ? Smartphone
                      : acc.type === 'savings'
                        ? PiggyBank
                        : acc.type === 'credit_card'
                          ? CreditCard
                          : Wallet;
                  return (
                    <div
                      key={acc.key}
                      className={cn(
                        'flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center',
                        acc.selected ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200',
                      )}
                    >
                      <label className="flex flex-1 cursor-pointer items-center gap-3">
                        <Switch
                          checked={acc.selected}
                          onCheckedChange={(checked) =>
                            setExtraAccounts((current) =>
                              current.map((item) => item.key === acc.key ? { ...item, selected: checked } : item),
                            )
                          }
                        />
                        <Icon className="size-4 shrink-0 text-emerald-700" />
                        <span className="text-sm font-medium text-slate-800">{acc.name}</span>
                      </label>
                      {acc.selected ? (
                        <Input
                          inputMode="numeric"
                          placeholder="Số dư (0đ)"
                          value={acc.initialBalance}
                          onChange={(event) =>
                            setExtraAccounts((current) =>
                              current.map((item) =>
                                item.key === acc.key
                                  ? { ...item, initialBalance: formatMoneyInput(event.target.value) }
                                  : item,
                              ),
                            )
                          }
                          className="h-9 rounded-lg tabular-nums sm:w-44"
                        />
                      ) : null}
                    </div>
                  );
                })}

                <label className="flex cursor-pointer items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-3">
                  <div>
                    <p className="text-sm font-medium text-slate-800">Thêm danh mục thu nhập (Lương, Thưởng)</p>
                    <p className="text-xs text-slate-500">Giúp phân loại chi tiết các nguồn thu khi nhập tay hoặc chat.</p>
                  </div>
                  <Switch checked={seedIncomeCategories} onCheckedChange={setSeedIncomeCategories} />
                </label>
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(1)} className="h-11 rounded-xl px-5">
                Quay lại
              </Button>
              <Button type="submit" disabled={isSubmitting} className="h-11 rounded-xl px-6 font-semibold">
                {isSubmitting ? 'Đang thiết lập…' : 'Hoàn tất & Bắt đầu'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}
