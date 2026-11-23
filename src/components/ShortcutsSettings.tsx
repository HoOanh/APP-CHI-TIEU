'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Copy, ExternalLink, KeyRound, Plus, Sparkles, Trash2, Zap } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';

interface AccountOption {
  id: number;
  name: string;
  is_default: boolean;
}

interface ShortcutKeyItem {
  id: number;
  name: string;
  key_prefix: string;
  default_account_id: number | null;
  account_name: string | null;
  last_used_at: string | null;
  created_at: string;
}

interface MerchantRuleItem {
  id: number;
  keyword: string;
  category_name: string;
  category_color: string;
  type: 'expense' | 'income';
  hit_count: number;
}

const transactionPath = '/api/shortcuts/transactions';
const configuredInstallUrl = process.env.NEXT_PUBLIC_SHORTCUT_INSTALL_URL?.trim();
const shortcutInstallUrl = configuredInstallUrl && /^https:\/\/www\.icloud\.com\/shortcuts\/[a-z0-9]+\/?$/i.test(configuredInstallUrl)
  ? configuredInstallUrl
  : null;

const subscribeToLocation = () => () => {};
const getBrowserUrl = () => window.location.origin;
const getServerUrl = () => '';

export function ShortcutsSettings() {
  const { showToast } = useToast();
  const [keys, setKeys] = useState<ShortcutKeyItem[]>([]);
  const [rules, setRules] = useState<MerchantRuleItem[]>([]);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [keyName, setKeyName] = useState('iPhone Action Button');
  const [defaultAccountId, setDefaultAccountId] = useState<string>('default');
  const [createdKey, setCreatedKey] = useState<{ id: number; token: string } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const origin = useSyncExternalStore(subscribeToLocation, getBrowserUrl, getServerUrl);
  const isLoopback = /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)/i.test(origin);
  const endpointUrl = origin && !isLoopback ? `${origin}${transactionPath}` : '';

  const loadData = async () => {
    const [keysRes, rulesRes, accRes] = await Promise.all([
      fetch('/api/shortcuts/keys'),
      fetch('/api/merchant-rules'),
      fetch('/api/accounts'),
    ]);
    if (keysRes.ok) setKeys(await keysRes.json() as ShortcutKeyItem[]);
    if (rulesRes.ok) setRules(await rulesRes.json() as MerchantRuleItem[]);
    if (accRes.ok) setAccounts(await accRes.json() as AccountOption[]);
  };

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/shortcuts/keys'),
      fetch('/api/merchant-rules'),
      fetch('/api/accounts'),
    ]).then(async ([keysRes, rulesRes, accRes]) => {
      if (!active) return;
      if (keysRes.ok) setKeys(await keysRes.json() as ShortcutKeyItem[]);
      if (rulesRes.ok) setRules(await rulesRes.json() as MerchantRuleItem[]);
      if (accRes.ok) setAccounts(await accRes.json() as AccountOption[]);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  async function handleCreateKey(event: React.FormEvent) {
    event.preventDefault();
    if (!keyName.trim()) {
      showToast('Nhập tên phím tắt trước khi tạo.', 'error');
      return;
    }
    setIsCreating(true);
    try {
      const response = await fetch('/api/shortcuts/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: keyName.trim(),
          default_account_id: defaultAccountId !== 'default' ? Number(defaultAccountId) : null,
        }),
      });
      const data = await response.json().catch(() => ({})) as { id?: number; token?: string; error?: string };
      if (!response.ok || typeof data.id !== 'number' || !data.token) {
        throw new Error(data.error || 'Không tạo được API key');
      }
      setCreatedKey({ id: data.id, token: data.token });
      showToast('Đã tạo mã kết nối phím tắt', 'success');
      await loadData();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tạo mã kết nối', 'error');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleRevokeKey(id: number) {
    const response = await fetch(`/api/shortcuts/keys/${id}`, { method: 'DELETE' });
    if (response.ok) {
      showToast('Đã ngắt kết nối phím tắt', 'success');
      setKeys((current) => current.filter((item) => item.id !== id));
      setCreatedKey((current) => current?.id === id ? null : current);
    } else {
      showToast('Không thể ngắt kết nối', 'error');
    }
  }

  async function handleDeleteRule(id: number) {
    const response = await fetch(`/api/merchant-rules?id=${id}`, { method: 'DELETE' });
    if (response.ok) {
      setRules((current) => current.filter((item) => item.id !== id));
      showToast('Đã xóa quy tắc phân loại', 'success');
    }
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Đã sao chép vào bộ nhớ tạm', 'success');
    } catch {
      showToast('Hãy bôi đen giá trị và sao chép thủ công.', 'error');
    }
  }

  return (
    <div id="shortcuts" className="space-y-4">
      <Card className="rounded-2xl border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4 text-[#00a970]" />
            Ghi chi tiêu bằng Phím tắt iPhone
          </CardTitle>
          <CardDescription>
            Nói hoặc nhập “cà phê 35k” từ Siri hay nút Tác vụ để ghi vào ví đã chọn.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleCreateKey} className="grid gap-2.5 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="shortcut-key-name">Tên thiết bị / phím tắt</Label>
              <Input
                id="shortcut-key-name"
                value={keyName}
                onChange={(event) => setKeyName(event.target.value)}
                placeholder="VD: iPhone Action Button"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="shortcut-account">Ví mặc định</Label>
              <Select value={defaultAccountId} onValueChange={setDefaultAccountId}>
                <SelectTrigger id="shortcut-account" className="h-10 rounded-xl bg-white">
                  <SelectValue placeholder="Ví mặc định" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Theo ví mặc định</SelectItem>
                  {accounts.map((acc) => (
                    <SelectItem key={acc.id} value={String(acc.id)}>{acc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={isCreating} className="h-10 rounded-xl">
              <Plus className="size-4" /> Tạo mã kết nối
            </Button>
          </form>

          {createdKey ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 text-xs">
              <p className="font-semibold text-emerald-900">Hãy sao chép mã kết nối này ngay, mã chỉ hiện một lần.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 select-all break-all rounded-lg bg-white px-2.5 py-2 font-mono text-[11px] text-slate-800 border border-emerald-200">
                  {createdKey.token}
                </code>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyText(createdKey.token)}>
                  <Copy className="size-3.5" /> Sao chép
                </Button>
              </div>
            </div>
          ) : null}

          <section aria-labelledby="shortcut-setup-title" className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-sm">
            <h3 id="shortcut-setup-title" className="font-semibold text-slate-900">Cài trên iPhone</h3>
            <p className="text-xs leading-relaxed text-slate-600">Tạo mã ở trên rồi mở trang này bằng Safari trên iPhone để sao chép đường dẫn và cài Phím tắt.</p>
            {isLoopback ? (
              <p className="rounded-lg bg-white p-2.5 text-xs text-slate-600">
                Đang chạy ở máy cá nhân. Hãy mở từ tên miền chính thức trên iPhone để sao chép đường dẫn kết nối.
              </p>
            ) : endpointUrl ? (
              <div className="flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 select-all break-all text-xs">{endpointUrl}</code>
                <Button type="button" size="sm" variant="outline" onClick={() => void copyText(endpointUrl)}>
                  <Copy className="size-3.5" /> Sao chép đường dẫn
                </Button>
              </div>
            ) : null}
            {shortcutInstallUrl ? (
              <p className="text-xs text-slate-600">Mở mẫu iCloud, bấm <strong>Thêm phím tắt</strong> rồi dán đường dẫn và mã kết nối.</p>
            ) : null}
            <a
              href={shortcutInstallUrl ?? 'shortcuts://create-shortcut'}
              className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-900 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <ExternalLink className="size-3.5" aria-hidden />
              {shortcutInstallUrl ? 'Cài phím tắt trên iPhone' : 'Mở ứng dụng Phím tắt'}
            </a>
            <details className="space-y-2 text-xs text-slate-600">
              <summary className="cursor-pointer font-medium text-slate-800">Xem hướng dẫn cài thủ công</summary>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Đặt tên phím tắt <strong>Ghi chi tiêu</strong> và thêm hành động <strong>Đọc chính tả văn bản</strong> hoặc <strong>Hỏi đầu vào</strong>.</li>
                <li>Thêm hành động <strong>Lấy nội dung của URL</strong>, dán đường dẫn ở trên và chọn phương thức <code>POST</code>.</li>
                <li>Trong phần <strong>Tiêu đề (Headers)</strong>, thêm <code>Authorization</code> với giá trị <code>Bearer &lt;mã kết nối&gt;</code>.</li>
                <li>Trong phần <strong>Nội dung yêu cầu</strong>, chọn <strong>JSON</strong>, thêm trường văn bản <code>text</code> và gán giá trị là nội dung vừa nhập/nói.</li>
              </ol>
              <p>Gán vào nút Tác vụ: <strong>Cài đặt → Nút tác vụ → Phím tắt → Ghi chi tiêu</strong>.</p>
            </details>
          </section>

          {keys.length > 0 ? (
            <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
              {keys.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">{item.name}</p>
                    <p className="text-xs text-slate-500">
                      <code className="font-mono">{item.key_prefix}…</code>
                      {item.account_name ? ` · ${item.account_name}` : ''}
                      {item.last_used_at ? ` · Dùng gần nhất: ${item.last_used_at}` : ' · Chưa dùng'}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => void handleRevokeKey(item.id)}
                    className="shrink-0 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Ngắt kết nối ${item.name}`}
                  >
                    <Trash2 className="size-4" /> Xóa
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Chưa có mã kết nối phím tắt nào.</p>
          )}
        </CardContent>
      </Card>

      <Card id="fast-path-rules" className="rounded-2xl border-slate-200 bg-white">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="size-4 text-amber-500" />
            Quy tắc tự phân loại ({rules.length})
          </CardTitle>
          <CardDescription>
            Khi bạn bấm &quot;Luôn phân loại thế này&quot; trong Chat, lần sau từ khóa tương tự sẽ được ghi nhận ngay lập tức.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <p className="flex items-center gap-2 text-xs text-slate-500">
              <Sparkles className="size-3.5 text-slate-400" /> Chưa có quy tắc tùy chỉnh nào. Hãy chat giao dịch và bấm &quot;Luôn phân loại thế này&quot; để dạy hệ thống.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 py-1 pl-3 pr-2 text-xs"
                >
                  <span className="font-medium text-slate-800">{rule.keyword}</span>
                  <span>→</span>
                  <Badge variant="outline" className="border-slate-200 bg-white text-[11px]" style={{ color: rule.category_color }}>
                    {rule.category_name}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => void handleDeleteRule(rule.id)}
                    aria-label={`Xóa quy tắc ${rule.keyword}`}
                    className="rounded-full p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
