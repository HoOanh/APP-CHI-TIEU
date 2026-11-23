'use client';

import { RecurringRulesManager } from '@/components/RecurringRulesManager';
import { ShortcutsSettings } from '@/components/ShortcutsSettings';
import { SettingsShell } from '@/components/settings/SettingsShell';

export default function SettingsAutomationPage() {
  return (
    <SettingsShell
      title="Định kỳ & Phím tắt"
      description="Lịch nhắc hóa đơn định kỳ, phím tắt iPhone và quy tắc phân loại sẵn."
    >
      <RecurringRulesManager />
      <ShortcutsSettings />
    </SettingsShell>
  );
}
