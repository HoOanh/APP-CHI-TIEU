'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Layers3 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/useToast';
import {
  MODULE_METADATA,
  PERSONA_PRESETS,
  resolveModulesForPersonas,
  type EnabledModules,
  type ModuleKey,
  type PersonaId,
} from '@/lib/modules';
import { cn } from '@/lib/utils';

export function ProfileModulesSettings({
  initialPersona,
  initialModules,
  onModulesUpdated,
}: {
  initialPersona: PersonaId;
  initialModules: EnabledModules;
  onModulesUpdated?: (modules: EnabledModules) => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [persona, setPersona] = useState<PersonaId>(initialPersona);
  const [modules, setModules] = useState<EnabledModules>(initialModules);
  const [isSaving, setIsSaving] = useState(false);

  async function saveProfile(nextPersona: PersonaId, nextModules: EnabledModules) {
    setIsSaving(true);
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryPersona: nextPersona,
          personas: [nextPersona],
          enabledModules: nextModules,
        }),
      });
      if (!response.ok) throw new Error('Không thể cập nhật cấu hình.');
      setPersona(nextPersona);
      setModules(nextModules);
      onModulesUpdated?.(nextModules);
      router.refresh();
      showToast('Đã cập nhật nhu cầu & tính năng', 'success');
    } catch {
      showToast('Không thể cập nhật cấu hình tính năng', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  function applyPreset(presetId: PersonaId) {
    const nextModules = resolveModulesForPersonas([presetId]);
    void saveProfile(presetId, nextModules);
  }

  function toggleModule(key: ModuleKey, checked: boolean) {
    const nextModules: EnabledModules = { ...modules, [key]: checked };
    void saveProfile(persona, nextModules);
  }

  return (
    <section id="nhu-cau" className="scroll-mt-6 rounded-2xl border border-slate-200 bg-white">
      <div className="flex items-start gap-3 border-b border-slate-100 p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-[#00a970]">
          <Layers3 className="size-5" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Tùy chỉnh tính năng</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Chọn nhanh theo nhu cầu hoặc bật/tắt từng tính năng. Dữ liệu đã lưu luôn được giữ lại.
          </p>
        </div>
      </div>

      <div className="space-y-5 p-5">
        <div>
          <p className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Cấu hình nhanh theo nhu cầu
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {PERSONA_PRESETS.map((preset) => {
              const active = persona === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  disabled={isSaving}
                  onClick={() => applyPreset(preset.id)}
                  className={cn(
                    'rounded-xl border px-3 py-2.5 text-left transition',
                    active
                      ? 'border-[#00bc7c] bg-emerald-50/70 text-emerald-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold">{preset.title}</span>
                    {preset.badge ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                        {preset.badge}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-slate-500">
                    {preset.subtitle}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {MODULE_METADATA.map((item) => (
            <div key={item.key} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-slate-800">{item.label}</p>
                  {item.phase === 'v2.1' ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                      Beta v2.1
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{item.description}</p>
              </div>
              <Switch
                aria-label={item.label}
                disabled={isSaving}
                checked={modules[item.key]}
                onCheckedChange={(checked) => toggleModule(item.key, checked)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
