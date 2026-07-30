'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  LayoutList,
  Plus,
  ReceiptText,
  Save,
  Server,
  TrendingDown,
  Trash2,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MonthPicker } from '@/components/MonthPicker';
import { useToast } from '@/hooks/useToast';
import { formatCurrency, getCurrentMonth, getPercentage } from '@/lib/utils';
import { CategoryIcon } from '@/components/CategoryIcon';

const StatsCharts = dynamic(() => import('@/components/StatsCharts').then((module) => module.StatsCharts), { loading: () => <div className="h-[190px] animate-pulse rounded-2xl bg-slate-200/70" /> });

const CATEGORY_COLORS = ['#00B878', '#40C3F9', '#FFB020', '#F65B8D', '#8B5CF6', '#64748B'];

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  is_system: number;
}

interface SettingsResponse {
  gemini: {
    configured: boolean;
    source: 'account' | 'server' | 'none';
  };
}

interface ProfileResponse {
  name: string;
  email: string;
  image: string;
  isDevelopmentUser: boolean;
}

interface SpendingSummary {
  total: number;
  count: number;
  daily_average: number;
  by_category: Array<{ category_name: string; category_color: string; total: number }>;
  by_date: Array<{ date: string; total: number }>;
}
type StatsPeriod = 'daily' | 'monthly' | 'quarterly' | 'yearly';

function getInitials(name: string) {
  return name.split(' ').filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase();
}

export default function SettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [gemini, setGemini] = useState<SettingsResponse['gemini']>({
    configured: false,
    source: 'none',
  });
  const [categories, setCategories] = useState<Category[]>([]);
  const [stats, setStats] = useState({ expenses: 0, debts: 0 });
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [spendingSummary, setSpendingSummary] = useState<SpendingSummary | null>(null);
  const [period, setPeriod] = useState<StatsPeriod>('daily');
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: '',
    icon: 'category',
    color: '#40C3F9',
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const [categoryResponse, statsResponse, settingsResponse, profileResponse, summaryResponse] =
          await Promise.all([
            fetch('/api/categories'),
            fetch('/api/settings/stats'),
            fetch('/api/settings'),
            fetch('/api/profile'),
            fetch(`/api/expenses/stats?period=${period}&month=${month}&year=${year}`),
          ]);

        if (categoryResponse.ok) {
          setCategories(await categoryResponse.json());
        }
        if (statsResponse.ok) {
          setStats(await statsResponse.json());
        }
        if (settingsResponse.ok) {
          const data = (await settingsResponse.json()) as SettingsResponse;
          setGemini(data.gemini);
        }
        if (profileResponse?.ok) setProfile(await profileResponse.json() as ProfileResponse);
        if (summaryResponse?.ok) setSpendingSummary(await summaryResponse.json() as SpendingSummary);
      } catch {
        showToast('Không thể tải cài đặt', 'error');
      } finally {
        setIsLoading(false);
      }
    }

    void loadSettings();
  }, [showToast, period, month, year]);

  async function saveApiKey() {
    if (apiKey.trim().length < 10) {
      showToast('API key không hợp lệ', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'gemini_api_key', value: apiKey }),
      });
      if (!response.ok) throw new Error('Save failed');

      setApiKey('');
      setGemini({ configured: true, source: 'account' });
      showToast('Đã mã hóa và lưu API key', 'success');
    } catch {
      showToast('Không thể lưu API key', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function addCategory() {
    if (!newCategory.name.trim()) return;

    try {
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newCategory),
      });
      if (!response.ok) throw new Error('Create failed');

      const category = (await response.json()) as Category;
      setCategories((current) =>
        [...current, category].sort((a, b) =>
          a.name.localeCompare(b.name, 'vi'),
        ),
      );
      setNewCategory({ name: '', icon: 'category', color: '#40C3F9' });
      setIsAddingCategory(false);
      showToast('Đã thêm danh mục', 'success');
    } catch {
      showToast('Tên danh mục đã tồn tại hoặc dữ liệu không hợp lệ', 'error');
    }
  }

  async function deleteCategory(category: Category) {
    if (category.is_system) return;

    try {
      const response = await fetch(`/api/categories/${category.id}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error);
      }
      setCategories((current) =>
        current.filter((item) => item.id !== category.id),
      );
      showToast('Đã xóa danh mục', 'success');
    } catch {
      showToast('Không thể xóa danh mục đang có giao dịch', 'error');
    }
  }

  async function handleExport() {
    try {
      const response = await fetch('/api/export');
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `chi-tieu-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      showToast('Đã xuất dữ liệu', 'success');
    } catch {
      showToast('Không thể xuất dữ liệu', 'error');
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl space-y-6 bg-background p-4 pb-nav md:p-8">
      <header className="flex items-center gap-3 pt-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.back()}
          className="size-10 rounded-full md:hidden"
        >
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-xl font-bold md:text-2xl">Hồ sơ & cài đặt</h1>
          <p className="hidden text-sm text-muted-foreground md:block">
            Quản lý AI, danh mục và dữ liệu tài khoản
          </p>
        </div>
      </header>

      <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
        <div className="flex items-center gap-3 p-5">
          <Avatar size="lg" className="size-14">
            {profile?.image ? <AvatarImage src={profile.image} alt={profile.name} /> : null}
            <AvatarFallback className="bg-emerald-50 text-base font-semibold text-primary">
              {getInitials(profile?.name || 'Người dùng') || <UserRound className="size-5" />}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-800">{profile?.name || 'Đang tải tài khoản...'}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">{profile?.email || '—'}</p>
          </div>
          {!profile?.isDevelopmentUser && (
            <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:bg-rose-50 hover:text-destructive" onClick={() => signOut({ callbackUrl: '/login' })}>
              Đăng xuất
            </Button>
          )}
        </div>
        <div id="thong-ke" className="grid grid-cols-3 divide-x border-t border-slate-100 bg-slate-50/70">
          <ProfileMetric label="Chi tháng này" value={spendingSummary ? formatCurrency(spendingSummary.total) : '—'} tone="rose" />
          <ProfileMetric label="Giao dịch" value={spendingSummary ? String(spendingSummary.count) : '—'} tone="slate" />
          <ProfileMetric label="TB mỗi ngày" value={spendingSummary ? formatCurrency(spendingSummary.daily_average) : '—'} tone="emerald" />
        </div>
      </section>

      <section className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[#00a970]">Phân tích</p><h2 className="mt-0.5 text-lg font-semibold tracking-[-0.03em] text-slate-800">Thống kê chi tiêu</h2></div>
          {period === 'daily' ? <MonthPicker month={month} onChange={setMonth} /> : <div className="flex h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"><button type="button" className="px-2" onClick={() => setYear(String(Number(year) - 1))}>‹</button><span className="min-w-12 text-center">{period === 'yearly' ? '5 năm' : year}</span><button type="button" className="px-2" onClick={() => setYear(String(Number(year) + 1))}>›</button></div>}
        </div>
        <Tabs value={period} onValueChange={(value) => setPeriod(value as StatsPeriod)}><TabsList className="grid w-full grid-cols-4 rounded-xl bg-slate-200/60 p-1"><TabsTrigger value="daily" className="rounded-lg text-xs">Tháng</TabsTrigger><TabsTrigger value="monthly" className="rounded-lg text-xs">Năm</TabsTrigger><TabsTrigger value="quarterly" className="rounded-lg text-xs">Quý</TabsTrigger><TabsTrigger value="yearly" className="rounded-lg text-xs">5 năm</TabsTrigger></TabsList></Tabs>
        <section className="overflow-hidden rounded-[22px] bg-[#344554] p-5 text-white shadow-[0_18px_36px_-25px_rgba(39,55,73,0.8)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Tổng chi tiêu</p>
          <p className="mt-2 text-[31px] font-semibold leading-none tracking-[-0.055em] tabular-nums">{formatCurrency(spendingSummary?.total || 0)}</p>
          <div className="mt-4 flex items-center justify-between border-t border-white/15 pt-3 text-xs"><span className="flex items-center gap-1.5 text-white/65"><TrendingDown className="size-3.5 text-rose-300" />{period === 'daily' ? month : period === 'monthly' ? year : period === 'quarterly' ? `Quý theo năm ${year}` : '5 năm gần đây'}</span><span className="font-medium text-white/80">{spendingSummary?.count || 0} giao dịch</span></div>
        </section>
        <section className="grid grid-cols-2 divide-x divide-slate-200 rounded-2xl border border-slate-200 bg-white py-3"><ProfileStat icon={ReceiptText} label="Trung bình" value={formatCurrency(spendingSummary?.daily_average || 0)} suffix={period === 'daily' ? '/ ngày' : '/ kỳ'} /><ProfileStat icon={WalletCards} label="Danh mục nhiều nhất" value={spendingSummary?.by_category[0]?.category_name || 'Chưa có'} suffix={spendingSummary?.by_category[0] ? formatCurrency(spendingSummary.by_category[0].total) : ''} /></section>
        {spendingSummary && spendingSummary.total > 0 ? <>
          <StatsCharts byDate={spendingSummary.by_date} period={period} total={spendingSummary.total} />
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-4 py-3"><h2 className="text-[15px] font-semibold text-slate-800">Cơ cấu chi tiêu</h2><p className="mt-0.5 text-xs text-slate-400">Danh mục theo tỷ trọng trong kỳ đã chọn</p></div><div className="divide-y divide-slate-100">{spendingSummary.by_category.map((item) => <ProfileCategoryRow key={item.category_name} item={item} total={spendingSummary.total} />)}</div></section>
        </> : <p className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-400">Chưa có khoản chi trong tháng này.</p>}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="rounded-3xl border-border bg-white shadow-sm">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Server className="size-4 text-primary" /> Kết nối AI
            </CardTitle>
            <CardDescription className="text-xs">
              API key được mã hóa trước khi lưu và không bao giờ trả lại client.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 p-5 pt-3">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">
                Google Gemini API Key
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(event) => setApiKey(event.target.value)}
                    placeholder={
                      gemini.configured ? 'Nhập key mới để thay thế' : 'AIzaSy...'
                    }
                    className="h-11 rounded-xl bg-background pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1 size-9 text-muted-foreground"
                    onClick={() => setShowKey((current) => !current)}
                  >
                    {showKey ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </Button>
                </div>
                <Button
                  onClick={saveApiKey}
                  disabled={isSaving || apiKey.trim().length < 10}
                  className="size-11 rounded-xl bg-primary p-0 text-white hover:bg-[#00a86f]"
                >
                  <Save className="size-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <CheckCircle2
                className={
                  gemini.configured
                    ? 'size-4 text-primary'
                    : 'size-4 text-muted-foreground'
                }
              />
              <span
                className={
                  gemini.configured
                    ? 'font-medium text-emerald-700'
                    : 'text-muted-foreground'
                }
              >
                {gemini.configured
                  ? `Sẵn sàng · ${
                      gemini.source === 'account'
                        ? 'key của tài khoản'
                        : 'key máy chủ'
                    }`
                  : 'Chưa cấu hình'}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border bg-white shadow-sm">
          <CardHeader className="flex flex-row items-center justify-between p-5 pb-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                <LayoutList className="size-4 text-rose-500" /> Danh mục
              </CardTitle>
              <CardDescription className="mt-1 text-xs">
                Một danh sách dùng chung cho giao dịch và hũ chi tiêu
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsAddingCategory((current) => !current)}
              className="size-10 rounded-full bg-primary/10 text-primary"
            >
              {isAddingCategory ? (
                <X className="size-4" />
              ) : (
                <Plus className="size-4" />
              )}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isAddingCategory && (
              <div className="mx-5 mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex gap-2">
                  <CategoryIcon name={newCategory.name || 'Danh mục'} color={newCategory.color} className="size-10 rounded-xl" iconClassName="size-4" />
                  <Input
                    value={newCategory.name}
                    onChange={(event) => setNewCategory((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Tên danh mục"
                    className="h-10 rounded-xl"
                  />
                  <Button size="icon" onClick={addCategory} disabled={!newCategory.name.trim()} className="size-10 shrink-0 rounded-xl">
                    <Plus className="size-4" />
                  </Button>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="text-[11px] font-medium text-muted-foreground">Màu hiển thị</span>
                  <div className="flex gap-2">
                    {CATEGORY_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Chọn màu ${color}`}
                        onClick={() => setNewCategory((current) => ({ ...current, color }))}
                        className={`size-5 rounded-full ring-offset-2 transition ${newCategory.color === color ? 'ring-2 ring-slate-500' : ''}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
            <ScrollArea className="h-[260px]">
              <div className="divide-y divide-border px-5">
                {isLoading ? (
                  <div className="py-8 text-center text-xs text-muted-foreground">
                    Đang tải...
                  </div>
                ) : (
                  categories.map((category) => (
                    <div
                      key={category.id}
                      className="group flex min-h-14 items-center justify-between py-2"
                    >
                      <div className="flex items-center gap-3">
                        <CategoryIcon name={category.name} color={category.color} className="size-9 rounded-xl" iconClassName="size-4" />
                        <div>
                          <span className="block text-sm font-medium">
                            {category.name}
                          </span>
                          {Boolean(category.is_system) && (
                            <span className="block text-[10px] text-muted-foreground">
                              Mặc định
                            </span>
                          )}
                        </div>
                      </div>
                      {!category.is_system && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteCategory(category)}
                          className="size-9 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card className="rounded-3xl border-border bg-white shadow-sm lg:col-span-2">
          <CardHeader className="p-5 pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Database className="size-4 text-blue-500" /> Dữ liệu & lưu trữ
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 p-5 pt-3 sm:grid-cols-[1fr_1fr_2fr]">
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-2xl font-bold tabular-nums">
                {stats.expenses}
              </div>
              <div className="text-xs text-muted-foreground">Giao dịch</div>
            </div>
            <div className="rounded-2xl border border-border bg-background p-4">
              <div className="text-2xl font-bold tabular-nums">
                {stats.debts}
              </div>
              <div className="text-xs text-muted-foreground">Khoản nợ</div>
            </div>
            <Button
              variant="outline"
              className="h-full min-h-14 rounded-2xl border-border"
              onClick={handleExport}
            >
              <Download className="size-4" /> Xuất toàn bộ dữ liệu JSON
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProfileMetric({ label, value, tone }: { label: string; value: string; tone: 'rose' | 'slate' | 'emerald' }) {
  const color = tone === 'rose' ? 'text-rose-500' : tone === 'emerald' ? 'text-emerald-600' : 'text-slate-700';
  return <div className="min-w-0 px-3 py-3 text-center"><p className="truncate text-[10px] text-muted-foreground">{label}</p><p className={`mt-1 truncate text-sm font-semibold tabular-nums ${color}`}>{value}</p></div>;
}

function ProfileStat({ icon: Icon, label, value, suffix }: { icon: typeof ReceiptText; label: string; value: string; suffix: string }) {
  return <div className="min-w-0 px-3.5"><p className="flex items-center gap-1.5 text-[11px] text-slate-400"><Icon className="size-3.5 text-[#00a970]" />{label}</p><p className="mt-1 truncate text-[15px] font-semibold text-slate-700">{value}</p><p className="mt-0.5 truncate text-[11px] text-slate-400">{suffix}</p></div>;
}

function ProfileCategoryRow({ item, total }: { item: SpendingSummary['by_category'][number]; total: number }) {
  const percentage = getPercentage(item.total, total);
  return <div className="px-4 py-3.5"><div className="flex items-center gap-3"><CategoryIcon name={item.category_name} color={item.category_color} className="size-9 rounded-xl" iconClassName="size-4" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-slate-700">{item.category_name}</p><p className="mt-0.5 text-[11px] text-slate-400">{Math.round(percentage)}%</p></div><p className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">{formatCurrency(item.total)}</p></div><div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#00bc7c]" style={{ width: `${percentage}%` }} /></div></div>;
}
