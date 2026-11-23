'use client';

import dynamic from 'next/dynamic';
import { SettingsShell } from '@/components/settings/SettingsShell';

const PwaReminderSettings = dynamic(
  () => import('@/components/PwaReminderSettings').then((module) => module.PwaReminderSettings),
  { loading: () => <div className="h-44 animate-pulse rounded-2xl bg-slate-200/70" /> },
);

export default function SettingsRemindersPage() {
  return (
    <SettingsShell
      title="Nhắc nhở & Thông báo"
      description="Chọn giờ nhắc ghi chép hằng ngày và nhận thông báo trên thiết bị."
    >
      <PwaReminderSettings />
    </SettingsShell>
  );
}
