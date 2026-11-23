'use client';

import dynamic from 'next/dynamic';
import { SettingsShell } from '@/components/settings/SettingsShell';

const AiProvidersSettings = dynamic(
  () => import('@/components/AiProvidersSettings').then((module) => module.AiProvidersSettings),
  { loading: () => <div className="h-44 animate-pulse rounded-2xl bg-slate-200/70" /> },
);

export default function SettingsAiPage() {
  return (
    <SettingsShell
      title="Trợ lý AI"
      description="Kết nối khóa AI riêng và chọn mô hình đọc hóa đơn ưu tiên."
    >
      <AiProvidersSettings />
    </SettingsShell>
  );
}
