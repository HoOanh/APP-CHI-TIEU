'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  LayoutList,
  Plus,
  Save,
  Server,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/useToast';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: '',
    icon: '📦',
    color: '#40C3F9',
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const [categoryResponse, statsResponse, settingsResponse] =
          await Promise.all([
            fetch('/api/categories'),
            fetch('/api/settings/stats'),
            fetch('/api/settings'),
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
      } catch {
        showToast('Không thể tải cài đặt', 'error');
      } finally {
        setIsLoading(false);
      }
    }

    void loadSettings();
  }, [showToast]);

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
      setNewCategory({ name: '', icon: '📦', color: '#40C3F9' });
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
                Danh mục mặc định và danh mục riêng của bạn
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
              <div className="mx-5 mt-3 grid grid-cols-[48px_1fr_48px] gap-2 rounded-2xl bg-slate-50 p-3">
                <Input
                  value={newCategory.icon}
                  onChange={(event) =>
                    setNewCategory((current) => ({
                      ...current,
                      icon: event.target.value,
                    }))
                  }
                  aria-label="Biểu tượng"
                  className="h-10 rounded-xl px-2 text-center"
                />
                <Input
                  value={newCategory.name}
                  onChange={(event) =>
                    setNewCategory((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Tên danh mục"
                  className="h-10 rounded-xl"
                />
                <Button
                  size="icon"
                  onClick={addCategory}
                  disabled={!newCategory.name.trim()}
                  className="size-10 rounded-xl"
                >
                  <Plus className="size-4" />
                </Button>
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
                        <div
                          className="flex size-9 items-center justify-center rounded-full text-lg"
                          style={{ backgroundColor: `${category.color}18` }}
                        >
                          {category.icon}
                        </div>
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
