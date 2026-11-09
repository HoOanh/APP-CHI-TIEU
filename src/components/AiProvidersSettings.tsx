'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, LoaderCircle, Plus, RefreshCw, Server, ShieldCheck, Trash2, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/useToast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AiProviderView, AiProtocol } from '@/lib/ai-provider';

interface ProviderPreset {
  label: string;
  protocol: AiProtocol;
  base_url: string;
}

interface ProviderResponse {
  providers: AiProviderView[];
  presets: ProviderPreset[];
  fallbackAvailable: boolean;
  fallbackSource: 'account' | 'server' | 'none';
}

interface DiscoveredModel {
  model_id: string;
  label: string;
}

interface ProviderEdit {
  label: string;
  base_url: string;
}

const providerFormSchema = z.object({
  label: z.string().trim().min(1, 'Nhập tên provider').max(80),
  protocol: z.enum(['gemini', 'openai_compatible']),
  base_url: z.url('Nhập URL hợp lệ'),
  api_key: z.string().trim().min(8, 'API key phải có ít nhất 8 ký tự'),
});
type ProviderFormValues = z.infer<typeof providerFormSchema>;

export function AiProvidersSettings() {
  const [providers, setProviders] = useState<AiProviderView[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [fallbackAvailable, setFallbackAvailable] = useState(false);
  const [fallbackSource, setFallbackSource] = useState<ProviderResponse['fallbackSource']>('none');
  const [presetIndex, setPresetIndex] = useState('0');
  const providerForm = useForm<ProviderFormValues>({ resolver: zodResolver(providerFormSchema), defaultValues: { label: 'Google Gemini', protocol: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta', api_key: '' } });
  const label = providerForm.watch('label');
  const protocol = providerForm.watch('protocol');
  const baseUrl = providerForm.watch('base_url');
  const apiKey = providerForm.watch('api_key');
  const [manualModel, setManualModel] = useState('');
  const [discovered, setDiscovered] = useState<Record<number, DiscoveredModel[]>>({});
  const [selected, setSelected] = useState<Record<number, string[]>>({});
  const [keyEdits, setKeyEdits] = useState<Record<number, string>>({});
  const [providerEdits, setProviderEdits] = useState<Record<number, ProviderEdit>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { showToast } = useToast();

  const loadProviders = useCallback(async () => {
    const response = await fetch('/api/ai/providers');
    if (!response.ok) throw new Error('Không thể tải cấu hình AI.');
    const data = await response.json() as ProviderResponse;
    setProviders(data.providers);
    setPresets(data.presets);
    setFallbackAvailable(data.fallbackAvailable);
    setFallbackSource(data.fallbackSource);
  }, []);

  useEffect(() => {
    loadProviders().catch(() => showToast('Không thể tải cấu hình AI', 'error'));
  }, [loadProviders, showToast]);

  const changePreset = (value: string) => {
    setPresetIndex(value);
    const preset = presets[Number(value)];
    if (!preset) return;
    providerForm.setValue('label', preset.label, { shouldValidate: true });
    providerForm.setValue('protocol', preset.protocol, { shouldValidate: true });
    providerForm.setValue('base_url', preset.base_url, { shouldValidate: true });
  };

  async function addProvider(values: ProviderFormValues) {
    setBusy('create');
    try {
      const response = await fetch('/api/ai/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: values.label, protocol: values.protocol, base_url: values.base_url, api_key: values.api_key }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể thêm provider.');
      providerForm.setValue('api_key', '', { shouldValidate: false });
      await loadProviders();
      showToast('Đã thêm provider. Tiếp theo hãy tải model và chọn model mặc định.', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể thêm provider.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function verifyProvider(provider: AiProviderView) {
    setBusy(`verify:${provider.id}`);
    try {
      const response = await fetch(`/api/ai/providers/${provider.id}/verify`, { method: 'POST' });
      const data = await response.json() as { error?: string };
      if (!response.ok || !data) throw new Error(data.error || 'Không thể kết nối provider.');
      showToast('Kết nối provider thành công', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể kết nối provider.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function discoverModels(provider: AiProviderView) {
    setBusy(`discover:${provider.id}`);
    try {
      const response = await fetch(`/api/ai/providers/${provider.id}/discover`, { method: 'POST' });
      const data = await response.json() as { models?: DiscoveredModel[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể tải model.');
      setDiscovered((current) => ({ ...current, [provider.id]: data.models ?? [] }));
      setSelected((current) => ({ ...current, [provider.id]: [] }));
      showToast(`Đã tìm thấy ${data.models?.length ?? 0} model`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tải model.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function saveModels(provider: AiProviderView, models: DiscoveredModel[]) {
    if (!models.length) return;
    setBusy(`models:${provider.id}`);
    try {
      const response = await fetch(`/api/ai/providers/${provider.id}/models`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ models }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể lưu model.');
      await loadProviders();
      setDiscovered((current) => ({ ...current, [provider.id]: [] }));
      showToast(`Đã thêm ${models.length} model`, 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể lưu model.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function setDefaultModel(provider: AiProviderView, modelId: string) {
    setBusy(`default:${provider.id}`);
    try {
      const response = await fetch(`/api/ai/providers/${provider.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_model_id: modelId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể chọn model.');
      await loadProviders();
      showToast('Đã chọn model mặc định', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể chọn model.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function activateProvider(provider: AiProviderView) {
    setBusy(`active:${provider.id}`);
    try {
      const response = await fetch(`/api/ai/providers/${provider.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể bật provider.');
      await loadProviders();
      showToast('Đã bật provider', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể bật provider.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function disableProvider(provider: AiProviderView) {
    const response = await fetch(`/api/ai/providers/${provider.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: false }),
    });
    if (!response.ok) {
      showToast('Không thể tắt provider', 'error');
      return;
    }
    await loadProviders();
    showToast('Đã tắt provider', 'success');
  }

  async function saveProviderDetails(provider: AiProviderView) {
    const edit = providerEdits[provider.id] || { label: provider.label, base_url: provider.base_url };
    setBusy(`details:${provider.id}`);
    try {
      const response = await fetch(`/api/ai/providers/${provider.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edit),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể cập nhật provider.');
      setProviderEdits((current) => { const next = { ...current }; delete next[provider.id]; return next; });
      await loadProviders();
      showToast('Đã cập nhật provider', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể cập nhật provider.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function toggleModel(provider: AiProviderView, model: AiProviderView['models'][number]) {
    const response = await fetch(`/api/ai/providers/${provider.id}/models/${model.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !model.enabled }),
    });
    if (!response.ok) {
      showToast('Không thể cập nhật model', 'error');
      return;
    }
    await loadProviders();
  }

  async function removeModel(provider: AiProviderView, model: AiProviderView['models'][number]) {
    const response = await fetch(`/api/ai/providers/${provider.id}/models/${model.id}`, { method: 'DELETE' });
    if (!response.ok) {
      showToast('Không thể xóa model', 'error');
      return;
    }
    await loadProviders();
    showToast('Đã xóa model', 'success');
  }

  async function saveKey(provider: AiProviderView) {
    const value = keyEdits[provider.id]?.trim();
    if (!value) return;
    setBusy(`key:${provider.id}`);
    try {
      const response = await fetch(`/api/ai/providers/${provider.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: value }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || 'Không thể lưu API key.');
      setKeyEdits((current) => ({ ...current, [provider.id]: '' }));
      await loadProviders();
      showToast('Đã cập nhật API key', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể lưu API key.', 'error');
    } finally {
      setBusy(null);
    }
  }

  async function removeProvider(provider: AiProviderView) {
    if (!window.confirm(`Xóa cấu hình ${provider.label} và các model đã lưu?`)) return;
    const response = await fetch(`/api/ai/providers/${provider.id}`, { method: 'DELETE' });
    if (!response.ok) {
      showToast('Không thể xóa provider', 'error');
      return;
    }
    await loadProviders();
    showToast('Đã xóa provider', 'success');
  }

  return (
    <section className="rounded-3xl border border-border bg-white shadow-sm">
      <div className="flex items-start gap-3 border-b border-border p-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-primary"><Server className="size-5" /></span>
        <div>
          <h2 className="text-base font-semibold">AI cá nhân</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">Provider, API key và model chỉ thuộc tài khoản của ĐẠI CA. Key được mã hóa; hệ thống chỉ hiển thị 4 ký tự cuối.</p>
          {fallbackAvailable ? <p className="mt-2 text-xs text-amber-700">Đang có cấu hình Gemini cũ từ {fallbackSource === 'account' ? 'tài khoản' : 'máy chủ'} làm dự phòng cho đến khi chọn model cá nhân.</p> : null}
        </div>
      </div>

      <div className="space-y-4 p-4 md:p-5">
        {providers.length ? providers.map((provider) => (
          <article key={provider.id} className="rounded-2xl border border-border bg-background/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-slate-800">{provider.label}</h3>
                  {provider.enabled ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Đang dùng</span> : null}
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">{provider.protocol === 'gemini' ? 'Gemini native' : 'OpenAI compatible'}</span>
                </div>
                <p className="mt-1 break-all text-xs text-muted-foreground">{provider.base_url} · key {provider.secret_hint}</p>
                <p className="mt-1 text-xs text-muted-foreground">Model mặc định: {provider.default_model_id || 'chưa chọn'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" disabled={busy === `verify:${provider.id}`} onClick={() => verifyProvider(provider)}>
                  {busy === `verify:${provider.id}` ? <LoaderCircle className="size-4 animate-spin" /> : <Wifi className="size-4" />} Kiểm tra
                </Button>
                {provider.enabled ? <Button type="button" variant="outline" size="sm" onClick={() => disableProvider(provider)}>Tắt</Button> : <Button type="button" size="sm" disabled={busy === `active:${provider.id}`} onClick={() => activateProvider(provider)}>Dùng provider này</Button>}
                <Button type="button" variant="outline" size="icon-sm" onClick={() => removeProvider(provider)} aria-label={`Xóa ${provider.label}`}><Trash2 className="size-4" /></Button>
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)_auto]">
              <Input value={(providerEdits[provider.id] || { label: provider.label, base_url: provider.base_url }).label} onChange={(event) => setProviderEdits((current) => ({ ...current, [provider.id]: { ...(current[provider.id] || { label: provider.label, base_url: provider.base_url }), label: event.target.value } }))} aria-label="Tên provider" className="h-10 rounded-xl" />
              <Input value={(providerEdits[provider.id] || { label: provider.label, base_url: provider.base_url }).base_url} onChange={(event) => setProviderEdits((current) => ({ ...current, [provider.id]: { ...(current[provider.id] || { label: provider.label, base_url: provider.base_url }), base_url: event.target.value } }))} aria-label="Base URL provider" className="h-10 rounded-xl" />
              <Button type="button" variant="outline" disabled={busy === `details:${provider.id}`} onClick={() => saveProviderDetails(provider)}>Lưu thông tin</Button>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <Input type="password" autoComplete="new-password" value={keyEdits[provider.id] || ''} onChange={(event) => setKeyEdits((current) => ({ ...current, [provider.id]: event.target.value }))} placeholder="Nhập key mới để thay thế" className="h-10 rounded-xl" />
              <Button type="button" variant="outline" disabled={!keyEdits[provider.id]?.trim() || busy === `key:${provider.id}`} onClick={() => saveKey(provider)}>Cập nhật key</Button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={busy === `discover:${provider.id}`} onClick={() => discoverModels(provider)}>
                {busy === `discover:${provider.id}` ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} Tải danh sách model
              </Button>
              <div className="flex min-w-0 flex-1 gap-2 sm:max-w-md">
                <Input value={manualModel} onChange={(event) => setManualModel(event.target.value)} placeholder="Hoặc nhập model ID" className="h-9 rounded-xl" />
                <Button type="button" size="sm" disabled={!manualModel.trim()} onClick={() => saveModels(provider, [{ model_id: manualModel.trim(), label: manualModel.trim() }])}><Plus className="size-4" /> Thêm</Button>
              </div>
            </div>

            {discovered[provider.id]?.length ? (
              <div className="mt-3 rounded-xl border border-border bg-white p-3">
                <p className="mb-2 text-xs font-semibold text-slate-600">Chọn model muốn quản lý</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {discovered[provider.id].map((model) => {
                    const picked = (selected[provider.id] || []).includes(model.model_id);
                    return <label key={model.model_id} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={picked} onChange={() => setSelected((current) => {
                        const old = current[provider.id] || [];
                        return { ...current, [provider.id]: picked ? old.filter((id) => id !== model.model_id) : [...old, model.model_id] };
                      })} />
                      <span className="min-w-0 flex-1 truncate">{model.label}</span>
                      <span className="max-w-44 truncate text-xs text-muted-foreground">{model.model_id}</span>
                    </label>;
                  })}
                </div>
                <Button type="button" size="sm" className="mt-3" disabled={!(selected[provider.id] || []).length || busy === `models:${provider.id}`} onClick={() => saveModels(provider, discovered[provider.id].filter((model) => (selected[provider.id] || []).includes(model.model_id)))}><Check className="size-4" /> Lưu model đã chọn</Button>
              </div>
            ) : null}

            {provider.models.length ? (
              <div className="mt-4 divide-y divide-slate-100 rounded-xl border border-border bg-white">
                {provider.models.map((model) => (
                  <div key={model.id} className="flex min-h-12 items-center gap-3 px-3 py-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <input type="checkbox" checked={model.enabled} onChange={() => toggleModel(provider, model)} />
                      <span className="truncate">{model.label || model.model_id}</span>
                      <span className="hidden truncate text-xs text-muted-foreground sm:inline">{model.model_id}</span>
                    </label>
                    {provider.default_model_id === model.model_id ? <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><ShieldCheck className="size-4" /> Mặc định</span> : <Button type="button" variant="ghost" size="sm" disabled={!model.enabled || busy === `default:${provider.id}`} onClick={() => setDefaultModel(provider, model.model_id)}>Dùng mặc định</Button>}
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeModel(provider, model)} aria-label={`Xóa model ${model.model_id}`}><Trash2 className="size-3.5" /></Button>
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-xs text-muted-foreground">Chưa có model. Tải danh sách hoặc thêm model ID để chọn.</p>}
          </article>
        )) : <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">Chưa có provider. Thêm provider và chọn model để bật AI cá nhân.</p>}

        <form onSubmit={providerForm.handleSubmit(addProvider)} noValidate className="rounded-2xl border border-border p-4">
          <div className="mb-4 flex items-center gap-2"><Plus className="size-4 text-primary" /><h3 className="text-sm font-semibold">Thêm provider</h3></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ai-preset">Preset</Label>
              <Select value={presetIndex} onValueChange={(value) => changePreset(value ?? 'custom')}>
                <SelectTrigger id="ai-preset" className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>{presets.map((preset, index) => <SelectItem key={`${preset.protocol}-${preset.base_url}`} value={String(index)}>{preset.label}</SelectItem>)}<SelectItem value="custom">Tùy chỉnh</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="ai-label">Tên hiển thị</Label><Input id="ai-label" value={label} aria-invalid={Boolean(providerForm.formState.errors.label)} onChange={(event) => providerForm.setValue('label', event.target.value, { shouldValidate: true })} className="h-10 rounded-xl" />{providerForm.formState.errors.label?.message ? <p role="alert" className="text-xs text-red-600">{providerForm.formState.errors.label.message}</p> : null}</div>
            <div className="space-y-1.5">
              <Label htmlFor="ai-protocol">Giao thức</Label>
              <Select value={protocol} onValueChange={(value) => { if (value === 'gemini' || value === 'openai_compatible') providerForm.setValue('protocol', value, { shouldValidate: true }); }}>
                <SelectTrigger id="ai-protocol" className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="gemini">Gemini native</SelectItem><SelectItem value="openai_compatible">OpenAI compatible</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="ai-base-url">Base URL</Label><Input id="ai-base-url" type="url" value={baseUrl} aria-invalid={Boolean(providerForm.formState.errors.base_url)} onChange={(event) => providerForm.setValue('base_url', event.target.value, { shouldValidate: true })} className="h-10 rounded-xl" />{providerForm.formState.errors.base_url?.message ? <p role="alert" className="text-xs text-red-600">{providerForm.formState.errors.base_url.message}</p> : null}</div>
            <div className="space-y-1.5 md:col-span-2"><Label htmlFor="ai-api-key">API key</Label><Input id="ai-api-key" type="password" autoComplete="new-password" value={apiKey} aria-invalid={Boolean(providerForm.formState.errors.api_key)} onChange={(event) => providerForm.setValue('api_key', event.target.value, { shouldValidate: true })} className="h-10 rounded-xl" placeholder="Key chỉ gửi đến server và lưu dưới dạng mã hóa" />{providerForm.formState.errors.api_key?.message ? <p role="alert" className="text-xs text-red-600">{providerForm.formState.errors.api_key.message}</p> : null}</div>
          </div>
          <div className="mt-4 flex justify-end"><Button type="submit" disabled={busy === 'create'}>{busy === 'create' ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Thêm provider</Button></div>
        </form>
      </div>
    </section>
  );
}
