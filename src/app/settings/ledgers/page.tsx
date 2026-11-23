'use client';

import { LedgersManager } from '@/components/LedgersManager';
import { SettingsShell } from '@/components/settings/SettingsShell';

export default function SettingsLedgersPage() {
  return (
    <SettingsShell
      title="Sổ chung & Thành viên"
      description="Tạo sổ cá nhân, gia đình hoặc công ty và phân quyền thành viên cùng ghi chép."
    >
      <LedgersManager />
    </SettingsShell>
  );
}
