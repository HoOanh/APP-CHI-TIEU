'use client';

import { useEffect, useState } from 'react';
import { ProfileModulesSettings } from '@/components/ProfileModulesSettings';
import { SettingsShell } from '@/components/settings/SettingsShell';
import type { EnabledModules, PersonaId } from '@/lib/modules';

interface ProfileModulesResponse {
  primaryPersona?: PersonaId;
  modules?: EnabledModules;
}

export default function SettingsModulesPage() {
  const [profile, setProfile] = useState<ProfileModulesResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/profile', { signal: controller.signal })
      .then(async (res) => (res.ok ? (await res.json() as ProfileModulesResponse) : null))
      .then((data) => {
        if (data && !controller.signal.aborted) setProfile(data);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  return (
    <SettingsShell
      title="Tùy chỉnh tính năng"
      description="Bật hoặc ẩn bớt các mục hiển thị cho gọn theo nhu cầu của bạn."
    >
      {profile?.primaryPersona && profile?.modules ? (
        <ProfileModulesSettings
          initialPersona={profile.primaryPersona}
          initialModules={profile.modules}
          onModulesUpdated={(nextModules) => setProfile((curr) => (curr ? { ...curr, modules: nextModules } : curr))}
        />
      ) : (
        <div className="h-44 animate-pulse rounded-2xl bg-slate-200/70" />
      )}
    </SettingsShell>
  );
}
