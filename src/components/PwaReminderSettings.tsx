'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, CalendarClock, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/useToast';

interface ReminderSettings {
  dailyEnabled: boolean;
  dailyTime: string;
  weeklyEnabled: boolean;
  weeklyDay: number;
  weeklyTime: string;
}

interface PushSettings {
  configured: boolean;
  publicKey: string | null;
  subscribed: boolean;
}

const DEFAULT_REMINDERS: ReminderSettings = {
  dailyEnabled: false,
  dailyTime: '21:00',
  weeklyEnabled: false,
  weeklyDay: 1,
  weeklyTime: '09:00',
};

const WEEKDAYS = [
  { value: 1, label: 'Thứ Hai' },
  { value: 2, label: 'Thứ Ba' },
  { value: 3, label: 'Thứ Tư' },
  { value: 4, label: 'Thứ Năm' },
  { value: 5, label: 'Thứ Sáu' },
  { value: 6, label: 'Thứ Bảy' },
  { value: 7, label: 'Chủ Nhật' },
];

function decodeVapidKey(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`;
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function PwaReminderSettings() {
  const { showToast } = useToast();
  const [reminders, setReminders] = useState(DEFAULT_REMINDERS);
  const [push, setPush] = useState<PushSettings>({ configured: false, publicKey: null, subscribed: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingPush, setIsTogglingPush] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetch('/api/pwa/reminders'), fetch('/api/pwa/push')])
      .then(async ([remindersResponse, pushResponse]) => {
        if (!remindersResponse.ok || !pushResponse.ok) throw new Error('Không thể tải cài đặt nhắc nhở.');
        const [reminderData, serverPushData] = await Promise.all([
          remindersResponse.json() as Promise<ReminderSettings>,
          pushResponse.json() as Promise<PushSettings>,
        ]);
        let hasDeviceSubscription = false;
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.getRegistration('/');
          hasDeviceSubscription = Boolean(await registration?.pushManager.getSubscription());
        }
        if (active) {
          setReminders(reminderData);
          setPush({ ...serverPushData, subscribed: hasDeviceSubscription });
        }
      })
      .catch(() => {
        if (active) showToast('Không thể tải cài đặt nhắc nhở', 'error');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, [showToast]);

  async function saveReminders(next: ReminderSettings) {
    setIsSaving(true);
    try {
      const response = await fetch('/api/pwa/reminders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error('Lưu lịch nhắc thất bại.');
      setReminders(next);
      showToast('Đã lưu lịch nhắc', 'success');
    } catch {
      showToast('Không thể lưu lịch nhắc', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function togglePush() {
    setIsTogglingPush(true);
    try {
      if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Trình duyệt này chưa hỗ trợ thông báo PWA.');
      }

      const registration = await navigator.serviceWorker.getRegistration('/');
      if (!registration) throw new Error('Hãy mở ứng dụng đã cài đặt rồi thử lại.');
      const currentSubscription = await registration.pushManager.getSubscription();
      if (push.subscribed || currentSubscription) {
        const endpoint = currentSubscription?.endpoint;
        if (endpoint) {
          const response = await fetch('/api/pwa/push', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint }),
          });
          if (!response.ok) throw new Error('Không thể xóa đăng ký thông báo trên máy chủ.');
          await currentSubscription?.unsubscribe();
        }
        setPush((current) => ({ ...current, subscribed: false }));
        showToast('Đã tắt thông báo trên thiết bị này', 'success');
        return;
      }

      if (!push.configured || !push.publicKey) throw new Error('Máy chủ chưa cấu hình Web Push.');
      if (Notification.permission === 'denied') {
        throw new Error('Thông báo bị chặn trong cài đặt trình duyệt. Hãy cho phép rồi thử lại.');
      }
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Chưa được cấp quyền gửi thông báo.');

      const subscription = currentSubscription || await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(push.publicKey),
      });
      const response = await fetch('/api/pwa/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) {
        await subscription.unsubscribe();
        const errorData = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(errorData?.error || 'Không thể đăng ký thiết bị nhận thông báo.');
      }
      setPush((current) => ({ ...current, subscribed: true }));
      showToast('Đã bật thông báo trên thiết bị này', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể bật thông báo', 'error');
    } finally {
      setIsTogglingPush(false);
    }
  }

  const update = (key: keyof ReminderSettings, value: boolean | number | string) => {
    setReminders((current) => ({ ...current, [key]: value }));
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><Bell className="size-5" /></span>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Nhắc nhở & phân tích AI</h2>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-slate-500">Lịch được tính theo giờ Việt Nam. Nội dung notification không hiển thị số tiền trên màn hình khóa.</p>
          </div>
        </div>
        <Button type="button" variant={push.subscribed ? 'outline' : 'default'} className="min-h-10 shrink-0 rounded-xl" onClick={() => void togglePush()} disabled={isLoading || isTogglingPush}>
          {isTogglingPush ? <LoaderCircle className="size-4 animate-spin" /> : push.subscribed ? <BellOff className="size-4" /> : <Bell className="size-4" />}
          {isTogglingPush ? 'Đang cập nhật...' : push.subscribed ? 'Tắt thông báo thiết bị' : 'Bật thông báo thiết bị'}
        </Button>
      </div>

      {!push.configured && <p className="mx-5 mt-4 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">Web Push chưa được cấu hình trên máy chủ. Cần thêm các biến VAPID theo tài liệu triển khai để bật thông báo.</p>}

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <Switch checked={reminders.dailyEnabled} onCheckedChange={(checked) => update('dailyEnabled', checked)} disabled={isLoading} aria-label="Bật nhắc ghi chú hằng ngày" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-800">Nhắc ghi chú hằng ngày</span><span className="mt-0.5 block text-xs text-slate-500">Gợi ý ghi lại các khoản đã chi trong ngày</span></span>
            <Input aria-label="Giờ nhắc hằng ngày" type="time" value={reminders.dailyTime} onChange={(event) => update('dailyTime', event.target.value)} className="h-9 w-[106px] rounded-lg px-2 text-sm" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <Switch checked={reminders.weeklyEnabled} onCheckedChange={(checked) => update('weeklyEnabled', checked)} disabled={isLoading} aria-label="Bật phân tích tài chính hằng tuần" />
            <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-slate-800">Phân tích tài chính hằng tuần</span><span className="mt-0.5 block text-xs text-slate-500">AI tổng kết xu hướng và gửi notification</span></span>
            <CalendarClock className="size-5 text-emerald-600" />
          </div>
          <div className="mt-3 flex gap-2 pl-7">
            <Select value={String(reminders.weeklyDay)} onValueChange={(value) => update('weeklyDay', Number(value))}>
              <SelectTrigger aria-label="Ngày phân tích hằng tuần" className="h-9 min-w-0 flex-1 rounded-lg"><SelectValue /></SelectTrigger>
              <SelectContent>{WEEKDAYS.map((day) => <SelectItem key={day.value} value={String(day.value)}>{day.label}</SelectItem>)}</SelectContent>
            </Select>
            <Input aria-label="Giờ phân tích hằng tuần" type="time" value={reminders.weeklyTime} onChange={(event) => update('weeklyTime', event.target.value)} className="h-9 w-[106px] rounded-lg px-2 text-sm" />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">Thông báo chỉ gửi khi đã bật trên thiết bị này. Hãy thêm PWA vào Màn hình chính trên iPhone trước khi đăng ký.</p>
        <Button type="button" variant="outline" className="min-h-10 shrink-0 rounded-xl" disabled={isLoading || isSaving} onClick={() => void saveReminders(reminders)}>
          {isSaving && <LoaderCircle className="size-4 animate-spin" />}{isSaving ? 'Đang lưu...' : 'Lưu lịch nhắc'}
        </Button>
      </div>
    </section>
  );
}
