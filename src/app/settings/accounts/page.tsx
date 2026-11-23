'use client';

import { AccountsManager } from '@/components/AccountsManager';
import { SettingsShell } from '@/components/settings/SettingsShell';

export default function SettingsAccountsPage() {
  return (
    <SettingsShell
      title="Ví & Tài khoản"
      description="Quản lý ví tiền mặt, tài khoản ngân hàng, thẻ tín dụng và số dư ban đầu."
    >
      <AccountsManager />
    </SettingsShell>
  );
}
