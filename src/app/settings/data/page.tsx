'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSWRConfig } from 'swr';
import { Database, Download, Trash2 } from 'lucide-react';
import { ImportExportManager } from '@/components/ImportExportManager';
import { SettingsShell } from '@/components/settings/SettingsShell';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/useToast';
import { clearPwaCache } from '@/lib/pwa-cache';

export default function SettingsDataPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { mutate } = useSWRConfig();
  const [stats, setStats] = useState({ expenses: 0, debts: 0 });
  const [isClearingPwaCache, setIsClearingPwaCache] = useState(false);
  const [isResetDialogOpen, setIsResetDialogOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [dataRevision, setDataRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/settings/stats', { signal: controller.signal })
      .then(async (res) => (res.ok ? (await res.json() as { expenses: number; debts: number }) : null))
      .then((data) => {
        if (data && !controller.signal.aborted) setStats(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [dataRevision]);

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

  async function handleClearPwaCache() {
    setIsClearingPwaCache(true);
    try {
      const clearedCacheCount = await clearPwaCache();
      showToast(
        clearedCacheCount > 0
          ? 'Đã xóa bộ nhớ đệm của ARC Irobot'
          : 'Không có bộ nhớ đệm ứng dụng cần xóa',
        'success',
        'Giao dịch, dữ liệu tài khoản và phiên đăng nhập vẫn được giữ nguyên.',
      );
    } catch {
      showToast('Không thể xóa bộ nhớ đệm trên trình duyệt này', 'error');
    } finally {
      setIsClearingPwaCache(false);
    }
  }

  async function handleResetAccountData() {
    const confirmation = resetConfirmation.trim();
    if (isResetting || confirmation !== 'XÓA') return;
    setIsResetting(true);
    try {
      const response = await fetch('/api/settings/account-data', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation }),
      });
      if (!response.ok) throw new Error('Không thể xóa dữ liệu tài khoản.');
      setStats({ expenses: 0, debts: 0 });
      setDataRevision((v) => v + 1);
      void mutate(
        (key) => typeof key === 'string' && (key.startsWith('/api/dashboard?') || key.startsWith('/api/expenses/stats?')),
        undefined,
        { revalidate: false },
      );
      router.refresh();
      setResetConfirmation('');
      setIsResetDialogOpen(false);
      showToast('Đã xóa dữ liệu tài khoản', 'success');
    } catch {
      showToast('Không thể xóa dữ liệu tài khoản', 'error');
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <SettingsShell
      title="Dữ liệu & Sao lưu"
      description="Xuất tệp sao lưu, khôi phục dữ liệu hoặc làm mới ứng dụng trên máy."
    >
      <Card className="rounded-2xl border-slate-200 bg-white">
        <CardHeader className="p-5 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4 text-blue-500" /> Dữ liệu & lưu trữ
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 p-5 pt-3 sm:grid-cols-[1fr_1fr_2fr]">
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="text-2xl font-bold tabular-nums">{stats.expenses}</div>
            <div className="text-xs text-muted-foreground">Giao dịch</div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="text-2xl font-bold tabular-nums">{stats.debts}</div>
            <div className="text-xs text-muted-foreground">Khoản nợ</div>
          </div>
          <Button variant="outline" className="h-full min-h-14 rounded-2xl border-border" onClick={handleExport}>
            <Download className="size-4" /> Xuất toàn bộ dữ liệu JSON
          </Button>
          <ImportExportManager onRestored={() => setDataRevision((v) => v + 1)} />
          <div className="flex flex-col gap-3 border-t border-border pt-4 sm:col-span-full sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Làm sạch dữ liệu đã lưu trên tài khoản và tiếp tục dùng cùng tài khoản đăng nhập.
            </p>
            <AlertDialog
              open={isResetDialogOpen}
              onOpenChange={(open) => {
                if (isResetting) return;
                if (!open) setResetConfirmation('');
                setIsResetDialogOpen(open);
              }}
            >
              <AlertDialogTrigger asChild>
                <Button type="button" variant="destructive" className="min-h-11 rounded-2xl">
                  <Trash2 className="size-4" /> Xóa dữ liệu tài khoản
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Xóa dữ liệu tài khoản?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Giao dịch, ngân sách, khoản nợ, danh mục tự tạo, cấu hình AI và lịch nhắc sẽ bị xóa vĩnh viễn.
                    Phiên đăng nhập và danh mục mặc định được giữ lại. Bản nháp offline vẫn nằm trên thiết bị.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <form
                  className="grid gap-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleResetAccountData();
                  }}
                >
                  <div className="grid gap-2">
                    <label htmlFor="reset-account-confirmation" className="text-sm font-medium">
                      Nhập <strong>XÓA</strong> để xác nhận
                    </label>
                    <Input
                      id="reset-account-confirmation"
                      value={resetConfirmation}
                      onChange={(event) => setResetConfirmation(event.target.value)}
                      disabled={isResetting}
                      autoComplete="off"
                    />
                  </div>
                  <AlertDialogFooter>
                    <AlertDialogCancel type="button" disabled={isResetting}>Hủy</AlertDialogCancel>
                    <Button type="submit" variant="destructive" disabled={isResetting || resetConfirmation.trim() !== 'XÓA'}>
                      {isResetting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
                    </Button>
                  </AlertDialogFooter>
                </form>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-slate-200 bg-white">
        <CardHeader className="p-5 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Database className="size-4 text-emerald-600" /> Ứng dụng & bộ nhớ đệm
          </CardTitle>
          <CardDescription className="text-xs leading-relaxed">
            Trên iPhone, mở ARC Irobot bằng Safari, chọn Chia sẻ → Thêm vào Màn hình chính để dùng như ứng dụng.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 p-5 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">
            Xóa các tệp giao diện đã lưu nếu cần tải lại bản mới. Thao tác này không xóa giao dịch, dữ liệu tài khoản hay phiên đăng nhập.
          </p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 shrink-0 rounded-2xl border-border"
            disabled={isClearingPwaCache}
            onClick={() => void handleClearPwaCache()}
          >
            <Trash2 className="size-4" />
            {isClearingPwaCache ? 'Đang xóa...' : 'Xóa bộ nhớ đệm'}
          </Button>
        </CardContent>
      </Card>
    </SettingsShell>
  );
}
