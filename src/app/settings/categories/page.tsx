'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, PenLine, Plus, Trash2 } from 'lucide-react';
import {
  CATEGORY_COLOR_OPTIONS,
  CATEGORY_ICON_OPTIONS,
  CategoryIcon,
} from '@/components/CategoryIcon';
import { SettingsShell } from '@/components/settings/SettingsShell';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
  kind?: 'expense' | 'income' | 'both';
  is_system: number;
}

type CategoryFilter = 'all' | 'expense' | 'income';

export default function SettingsCategoriesPage() {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    icon: string;
    color: string;
    kind: 'expense' | 'income';
  }>({
    name: '',
    icon: 'utensils',
    color: CATEGORY_COLOR_OPTIONS[0],
    kind: 'expense',
  });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/categories', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed');
        setCategories(await res.json() as Category[]);
      })
      .catch(() => {
        if (!controller.signal.aborted) showToast('Không thể tải danh mục', 'error');
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });
    return () => controller.abort();
  }, [showToast]);

  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      if (filter === 'all') return true;
      const isIncome = cat.kind === 'income' || cat.name === 'Thu nhập';
      return filter === 'income' ? isIncome : !isIncome;
    });
  }, [categories, filter]);

  function openCreate() {
    setEditingCategory(null);
    setForm({
      name: '',
      icon: filter === 'income' ? 'banknote' : 'utensils',
      color: CATEGORY_COLOR_OPTIONS[0],
      kind: filter === 'income' ? 'income' : 'expense',
    });
    setIsDialogOpen(true);
  }

  function openEdit(category: Category) {
    setEditingCategory(category);
    const isIncome = category.kind === 'income' || category.name === 'Thu nhập';
    setForm({
      name: category.name,
      icon: category.icon || (isIncome ? 'banknote' : 'tag'),
      color: category.color || CATEGORY_COLOR_OPTIONS[0],
      kind: isIncome ? 'income' : 'expense',
    });
    setIsDialogOpen(true);
  }

  async function handleSave(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName || isSaving) return;
    setIsSaving(true);
    try {
      const response = await fetch(
        editingCategory ? `/api/categories/${editingCategory.id}` : '/api/categories',
        {
          method: editingCategory ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: trimmedName,
            icon: form.icon,
            color: form.color,
            kind: form.kind,
          }),
        },
      );
      const data = await response.json().catch(() => ({})) as Category & { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể lưu danh mục');

      setCategories((current) => {
        const next = editingCategory
          ? current.map((item) => (String(item.id) === String(editingCategory.id) ? data : item))
          : [...current, data];
        return [...next].sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      });
      setIsDialogOpen(false);
      showToast(editingCategory ? 'Đã cập nhật danh mục' : 'Đã thêm danh mục', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Tên danh mục đã tồn tại hoặc không hợp lệ', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCategory(category: Category) {
    if (category.is_system) return;
    try {
      const response = await fetch(`/api/categories/${category.id}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Delete failed');
      setCategories((current) => current.filter((item) => item.id !== category.id));
      showToast('Đã xóa danh mục', 'success');
    } catch {
      showToast('Không thể xóa danh mục đang có giao dịch', 'error');
    }
  }

  return (
    <SettingsShell
      title="Danh mục thu chi"
      description="Quản lý tên, biểu tượng và màu sắc cho từng danh mục."
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as CategoryFilter)}>
          <TabsList className="rounded-xl bg-slate-200/70 p-1">
            <TabsTrigger value="all" className="rounded-lg text-xs">Tất cả ({categories.length})</TabsTrigger>
            <TabsTrigger value="expense" className="rounded-lg text-xs">Khoản chi</TabsTrigger>
            <TabsTrigger value="income" className="rounded-lg text-xs">Khoản thu</TabsTrigger>
          </TabsList>
        </Tabs>

        <Button type="button" onClick={openCreate} className="h-9 rounded-xl bg-[#00bc7c] text-xs font-semibold text-white hover:bg-[#00a970]">
          <Plus className="size-4" /> Thêm danh mục
        </Button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white">
        {isLoading ? (
          <div className="py-12 text-center text-sm text-slate-400">Đang tải danh mục…</div>
        ) : filteredCategories.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">Chưa có danh mục phù hợp.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredCategories.map((category) => {
              const isIncome = category.kind === 'income' || category.name === 'Thu nhập';
              return (
                <div key={category.id} className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-slate-50/70 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <CategoryIcon
                      name={category.name}
                      icon={category.icon}
                      color={category.color}
                      className="size-10 rounded-xl"
                      iconClassName="size-[18px]"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">{category.name}</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">
                        {isIncome ? 'Khoản thu' : 'Khoản chi'}
                        {Boolean(category.is_system) ? ' · Mặc định' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Sửa danh mục ${category.name}`}
                      onClick={() => openEdit(category)}
                      className="size-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    >
                      <PenLine className="size-4" />
                    </Button>
                    {!category.is_system ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Xóa danh mục ${category.name}`}
                        onClick={() => void deleteCategory(category)}
                        className="size-8 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="grid max-h-[calc(100dvh-1rem)] w-[min(480px,calc(100vw-1rem))] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden rounded-2xl p-0">
          <DialogHeader className="border-b border-slate-100 px-5 py-4 pr-12">
            <DialogTitle>{editingCategory ? 'Chỉnh sửa danh mục' : 'Thêm danh mục mới'}</DialogTitle>
            <DialogDescription className="text-xs">
              Chọn tên, biểu tượng và màu hiển thị riêng cho danh mục.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSave} className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto]">
            <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-5">
              {/* Live preview */}
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-slate-50/70 p-3.5">
                <CategoryIcon
                  name={form.name || 'Danh mục'}
                  icon={form.icon}
                  color={form.color}
                  className="size-11 rounded-xl"
                  iconClassName="size-5"
                />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {form.name.trim() || 'Tên danh mục'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {form.kind === 'income' ? 'Khoản thu' : 'Khoản chi'}
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1.5">
                  <Label htmlFor="cat-name" className="text-xs text-slate-500">Tên danh mục</Label>
                  <Input
                    id="cat-name"
                    value={form.name}
                    maxLength={60}
                    onChange={(e) => setForm((curr) => ({ ...curr, name: e.target.value }))}
                    placeholder="Ví dụ: Cà phê, Du lịch…"
                    className="h-10 rounded-xl"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-500">Loại</Label>
                  <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1">
                    <button
                      type="button"
                      onClick={() => setForm((curr) => ({ ...curr, kind: 'expense' }))}
                      className={cn(
                        'h-8 rounded-lg px-3 text-xs font-semibold transition',
                        form.kind === 'expense' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500',
                      )}
                    >
                      Chi
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm((curr) => ({ ...curr, kind: 'income' }))}
                      className={cn(
                        'h-8 rounded-lg px-3 text-xs font-semibold transition',
                        form.kind === 'income' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-500',
                      )}
                    >
                      Thu
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Màu sắc</Label>
                <div className="grid grid-cols-6 gap-2.5 sm:grid-cols-12">
                  {CATEGORY_COLOR_OPTIONS.map((color) => {
                    const active = form.color.toLowerCase() === color.toLowerCase();
                    return (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Chọn màu ${color}`}
                        onClick={() => setForm((curr) => ({ ...curr, color }))}
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full transition',
                          active && 'ring-2 ring-slate-900 ring-offset-2',
                        )}
                        style={{ backgroundColor: color }}
                      >
                        {active ? <Check className="size-3.5 text-white" strokeWidth={2.5} /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-500">Biểu tượng</Label>
                <div className="grid grid-cols-6 gap-2 sm:grid-cols-7">
                  {CATEGORY_ICON_OPTIONS.map((item) => {
                    const Icon = item.icon;
                    const active = form.icon === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        title={item.label}
                        aria-label={item.label}
                        onClick={() => setForm((curr) => ({ ...curr, icon: item.key }))}
                        className={cn(
                          'flex h-10 items-center justify-center rounded-xl border transition',
                          active
                            ? 'border-[#00bc7c] bg-emerald-50/70 text-[#00a970] ring-1 ring-[#00bc7c]/30'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
                        )}
                      >
                        <Icon className="size-4" strokeWidth={1.9} />
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-2 border-t border-slate-100 bg-white px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom,0px))]">
              <Button type="button" variant="outline" className="h-10 flex-1 rounded-xl" onClick={() => setIsDialogOpen(false)}>
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={isSaving || !form.name.trim()}
                className="h-10 flex-1 rounded-xl bg-[#00bc7c] font-semibold text-white hover:bg-[#00a970]"
              >
                {isSaving ? 'Đang lưu…' : editingCategory ? 'Cập nhật' : 'Lưu danh mục'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </SettingsShell>
  );
}
