import 'server-only';

import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { decryptSecret } from '@/lib/secrets';
import { getDb } from '@/lib/db';

export type AiProtocol = 'gemini' | 'openai_compatible';

export interface AiProviderView {
  id: number;
  label: string;
  protocol: AiProtocol;
  base_url: string;
  secret_hint: string;
  enabled: boolean;
  default_model_id: string;
  models: Array<{
    id: number;
    model_id: string;
    label: string;
    enabled: boolean;
    position: number;
  }>;
}

export interface AiInputImage {
  base64Data: string;
  mimeType: string;
}

export function normalizeProviderUrl(value: string, protocol: AiProtocol) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Địa chỉ provider không hợp lệ.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Provider phải dùng HTTPS, không kèm thông tin đăng nhập hoặc query.');
  }
  const host = url.hostname.toLowerCase();
  if (
    host === 'localhost' || host.endsWith('.localhost') || host.startsWith('[') ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) || /^169\.254\./.test(host) || host === '0.0.0.0'
  ) {
    throw new Error('Provider phải có địa chỉ HTTPS công khai.');
  }
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (protocol === 'gemini' && !url.pathname.endsWith('/v1beta')) {
    url.pathname = `${url.pathname}/v1beta`;
  }
  return url.toString().replace(/\/$/, '');
}

export function getProviderPresets() {
  return [
    { label: 'Google Gemini', protocol: 'gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta' },
    { label: 'OpenAI', protocol: 'openai_compatible', base_url: 'https://api.openai.com/v1' },
    { label: 'OpenRouter', protocol: 'openai_compatible', base_url: 'https://openrouter.ai/api/v1' },
    { label: 'CKEY', protocol: 'openai_compatible', base_url: 'https://api.xah.io/v1' },
    { label: 'DeepSeek', protocol: 'openai_compatible', base_url: 'https://api.deepseek.com/v1' },
    { label: 'Groq', protocol: 'openai_compatible', base_url: 'https://api.groq.com/openai/v1' },
    { label: 'Mistral', protocol: 'openai_compatible', base_url: 'https://api.mistral.ai/v1' },
    { label: 'xAI', protocol: 'openai_compatible', base_url: 'https://api.x.ai/v1' },
  ] satisfies Array<{ label: string; protocol: AiProtocol; base_url: string }>;
}

export async function getUserProviders(userId: number): Promise<AiProviderView[]> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT p.id, p.label, p.protocol, p.base_url, p.secret_hint,
                 p.enabled, p.default_model_id, m.id AS model_row_id,
                 m.model_id, m.label AS model_label, m.enabled AS model_enabled,
                 m.position
          FROM ai_providers p
          LEFT JOIN ai_models m ON m.provider_id = p.id AND m.user_id = p.user_id
          WHERE p.user_id = ?
          ORDER BY p.created_at, m.position, m.model_id`,
    args: [userId],
  });
  const providers = new Map<number, AiProviderView>();
  for (const row of result.rows) {
    const id = Number(row.id);
    let provider = providers.get(id);
    if (!provider) {
      provider = {
        id,
        label: String(row.label),
        protocol: row.protocol === 'gemini' ? 'gemini' : 'openai_compatible',
        base_url: String(row.base_url),
        secret_hint: String(row.secret_hint),
        enabled: Number(row.enabled) === 1,
        default_model_id: String(row.default_model_id || ''),
        models: [],
      };
      providers.set(id, provider);
    }
    if (row.model_row_id !== null && row.model_row_id !== undefined) {
      provider.models.push({
        id: Number(row.model_row_id),
        model_id: String(row.model_id),
        label: String(row.model_label || ''),
        enabled: Number(row.model_enabled) === 1,
        position: Number(row.position) || 0,
      });
    }
  }
  return [...providers.values()];
}

export async function getProviderSecret(userId: number, providerId: number) {
  const db = await getDb();
  const result = await db.execute({
    sql: 'SELECT secret_encrypted FROM ai_providers WHERE id = ? AND user_id = ?',
    args: [providerId, userId],
  });
  const encrypted = result.rows[0]?.secret_encrypted;
  if (typeof encrypted !== 'string') return null;
  return decryptSecret(encrypted);
}

export async function getActiveAiModel(userId: number) {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT p.id AS provider_id, p.protocol, p.base_url, p.secret_encrypted,
                 p.default_model_id, m.model_id
          FROM ai_providers p
          JOIN ai_models m ON m.provider_id = p.id AND m.user_id = p.user_id
          WHERE p.user_id = ? AND p.enabled = 1 AND m.enabled = 1
            AND m.model_id = p.default_model_id
          ORDER BY p.updated_at DESC LIMIT 1`,
    args: [userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    providerId: Number(row.provider_id),
    protocol: row.protocol === 'gemini' ? 'gemini' as const : 'openai_compatible' as const,
    baseUrl: String(row.base_url),
    apiKey: decryptSecret(String(row.secret_encrypted)),
    modelId: String(row.model_id),
  };
}

export async function callConfiguredAi(
  userId: number,
  prompt: string,
  images: AiInputImage[] = [],
): Promise<string | null> {
  const config = await getActiveAiModel(userId);
  if (!config) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    await assertPublicProviderHost(config.baseUrl);
    if (config.protocol === 'gemini') {
      const parts: Array<Record<string, unknown>> = [{ text: prompt }, ...images.map((image) => ({
        inlineData: { mimeType: image.mimeType, data: image.base64Data },
      }))];
      const response = await fetch(
        `${config.baseUrl}/models/${encodeURIComponent(config.modelId)}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
          body: JSON.stringify({ contents: [{ role: 'user', parts }] }),
          redirect: 'error',
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error(`Provider trả về lỗi HTTP ${response.status}.`);
      const payload: unknown = await response.json();
      if (!isRecord(payload)) throw new Error('Provider trả dữ liệu không hợp lệ.');
      const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
      const first = candidates[0];
      if (!isRecord(first) || !isRecord(first.content) || !Array.isArray(first.content.parts)) {
        throw new Error('Provider không trả nội dung văn bản.');
      }
      return first.content.parts.flatMap((part) =>
        isRecord(part) && typeof part.text === 'string' ? [part.text] : [],
      ).join('\n');
    }

    const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
    for (const image of images) {
      content.push({
        type: 'image_url',
        image_url: { url: `data:${image.mimeType};base64,${image.base64Data}` },
      });
    }
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId,
        messages: [{ role: 'user', content: images.length ? content : prompt }],
        temperature: 0.1,
      }),
      redirect: 'error',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Provider trả về lỗi HTTP ${response.status}.`);
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !Array.isArray(payload.choices)) {
      throw new Error('Provider trả dữ liệu không hợp lệ.');
    }
    const first = payload.choices[0];
    if (!isRecord(first) || !isRecord(first.message)) {
      throw new Error('Provider không trả nội dung văn bản.');
    }
    const contentValue = first.message.content;
    if (typeof contentValue === 'string') return contentValue;
    if (Array.isArray(contentValue)) {
      return contentValue.flatMap((part) =>
        isRecord(part) && typeof part.text === 'string' ? [part.text] : [],
      ).join('\n');
    }
    throw new Error('Provider không trả nội dung văn bản.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function verifyProvider(protocol: AiProtocol, baseUrl: string, apiKey: string) {
  const url = normalizeProviderUrl(baseUrl, protocol);
  await assertPublicProviderHost(url);
  const response = protocol === 'gemini'
    ? await fetch(`${url}/models?pageSize=100`, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(15_000), redirect: 'error' })
    : await fetch(`${url}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000), redirect: 'error' });
  if (!response.ok) throw new Error(`Không kết nối được provider (HTTP ${response.status}).`);
  return response;
}

async function assertPublicProviderHost(value: string) {
  const host = new URL(value).hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new Error('Provider phải phân giải đến địa chỉ IP công khai.');
  }
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase();
  if (isIP(normalized) === 4) {
    const parts = normalized.split('.').map(Number);
    const [first, second] = parts;
    return first === 0 || first === 10 || first === 127 || first >= 224 ||
      (first === 100 && second >= 64 && second <= 127) ||
      (first === 169 && second === 254) ||
      (first === 172 && second >= 16 && second <= 31) ||
      (first === 192 && second === 168) ||
      (first === 192 && second === 0) ||
      (first === 192 && second === 2) ||
      (first === 198 && (second === 18 || second === 19 || second === 51)) ||
      (first === 203 && second === 0);
  }
  if (isIP(normalized) === 6) {
    return normalized === '::' || normalized === '::1' || normalized.startsWith('fc') ||
      normalized.startsWith('fd') || normalized.startsWith('fe80:') ||
      normalized.startsWith('ff') || normalized.startsWith('::ffff:');
  }
  return true;
}

export async function discoverProviderModels(protocol: AiProtocol, baseUrl: string, apiKey: string) {
  const response = await verifyProvider(protocol, baseUrl, apiKey);
  const payload: unknown = await response.json();
  if (!isRecord(payload)) return [];
  const entries = protocol === 'gemini'
    ? Array.isArray(payload.models) ? payload.models : []
    : Array.isArray(payload.data) ? payload.data : [];
  return entries.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const modelId = String(protocol === 'gemini' ? entry.name || '' : entry.id || '')
      .replace(/^models\//, '');
    if (!modelId || (protocol === 'gemini' && Array.isArray(entry.supportedGenerationMethods) && !entry.supportedGenerationMethods.includes('generateContent'))) return [];
    return [{ model_id: modelId, label: String(entry.displayName || entry.name || modelId) }];
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
