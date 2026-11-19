'use client';

import { useState } from 'react';
import useSWR from 'swr';
import {
  BookOpenCheck,
  Check,
  Copy,
  Link2,
  Plus,
  Trash2,
  UserPlus,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import type { LedgerOption } from '@/components/LedgerSwitcher';

interface LedgersResponse {
  activeLedgerId: number;
  ledgers: LedgerOption[];
}

interface LedgerMember {
  user_id: number;
  role: 'owner' | 'editor' | 'viewer';
  joined_at: string;
  name: string;
  email: string;
  avatar: string;
}

interface LedgerDetailResponse {
  id: number;
  name: string;
  kind: 'personal' | 'family' | 'business';
  role: 'owner' | 'editor' | 'viewer';
  members: LedgerMember[];
}

const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Không thể tải dữ liệu sổ.');
  return res.json() as Promise<T>;
};

const KIND_LABELS: Record<LedgerOption['kind'], string> = {
  personal: 'Cá nhân',
  family: 'Gia đình / Cặp đôi',
  business: 'Kinh doanh',
};

const ROLE_LABELS: Record<LedgerMember['role'], string> = {
  owner: 'Chủ sổ',
  editor: 'Biên tập',
  viewer: 'Chỉ xem',
};

export function LedgersManager() {
  const { showToast } = useToast();
  const { data: listData, mutate: mutateList } = useSWR<LedgersResponse>('/api/ledgers', fetcher);
  const [selectedDetailId, setSelectedDetailId] = useState<number | null>(null);

  const ledgers = listData?.ledgers ?? [];
  const inspectedLedgerId = selectedDetailId ?? listData?.activeLedgerId ?? null;

  const { data: detailData, mutate: mutateDetail } = useSWR<LedgerDetailResponse>(
    inspectedLedgerId ? `/api/ledgers/${inspectedLedgerId}` : null,
    fetcher,
  );

  const [newLedgerName, setNewLedgerName] = useState('');
  const [newLedgerKind, setNewLedgerKind] = useState<'family' | 'business' | 'personal'>('family');
  const [isCreating, setIsCreating] = useState(false);
  const [isSwitchingId, setIsSwitchingId] = useState<number | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [isInviting, setIsInviting] = useState(false);
  const [generatedInviteUrl, setGeneratedInviteUrl] = useState('');
  const [copiedInvite, setCopiedInvite] = useState(false);

  async function handleCreateLedger(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = newLedgerName.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    try {
      const res = await fetch('/api/ledgers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, kind: newLedgerKind, switchTo: true }),
      });
      const payload = await res.json().catch(() => ({})) as { id?: number; error?: string };
      if (!res.ok) throw new Error(payload.error || 'Không thể tạo sổ mới.');
      setNewLedgerName('');
      showToast(`Đã tạo "${trimmed}"`, 'success');
      window.location.reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tạo sổ mới.', 'error');
      setIsCreating(false);
    }
  }

  async function handleSwitchLedger(ledgerId: number) {
    if (isSwitchingId !== null) return;
    setIsSwitchingId(ledgerId);
    try {
      const res = await fetch(`/api/ledgers/${ledgerId}/switch`, { method: 'POST' });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(payload.error || 'Không thể chuyển sổ.');
      window.location.reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể chuyển sổ.', 'error');
      setIsSwitchingId(null);
    }
  }

  async function handleCreateInvite(event: React.FormEvent) {
    event.preventDefault();
    if (!inspectedLedgerId || isInviting) return;
    setIsInviting(true);
    setCopiedInvite(false);
    try {
      const res = await fetch(`/api/ledgers/${inspectedLedgerId}/invites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: inviteRole,
        }),
      });
      const payload = await res.json().catch(() => ({})) as {
        inviteUrl?: string;
        emailDelivered?: boolean;
        error?: string;
      };
      if (!res.ok || !payload.inviteUrl) {
        throw new Error(payload.error || 'Không thể tạo liên kết mời.');
      }
      setGeneratedInviteUrl(payload.inviteUrl);
      setInviteEmail('');
      showToast(
        payload.emailDelivered ? 'Đã gửi email & tạo link mời' : 'Đã tạo link mời tham gia sổ',
        'success',
      );
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể tạo lời mời.', 'error');
    } finally {
      setIsInviting(false);
    }
  }

  async function handleCopyInvite() {
    if (!generatedInviteUrl) return;
    try {
      await navigator.clipboard.writeText(generatedInviteUrl);
      setCopiedInvite(true);
      showToast('Đã sao chép link mời', 'success');
    } catch {
      showToast('Hãy bôi đen và sao chép link bên dưới.', 'error');
    }
  }

  async function handleUpdateMemberRole(memberUserId: number, role: 'editor' | 'viewer') {
    if (!inspectedLedgerId) return;
    try {
      const res = await fetch(`/api/ledgers/${inspectedLedgerId}/members/${memberUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(payload.error || 'Không thể đổi quyền.');
      await mutateDetail();
      await mutateList();
      showToast('Đã cập nhật quyền thành viên', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể đổi quyền.', 'error');
    }
  }

  async function handleRemoveMember(memberUserId: number) {
    if (!inspectedLedgerId) return;
    try {
      const res = await fetch(`/api/ledgers/${inspectedLedgerId}/members/${memberUserId}`, {
        method: 'DELETE',
      });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) throw new Error(payload.error || 'Không thể xóa thành viên.');
      await mutateDetail();
      await mutateList();
      showToast('Đã cập nhật danh sách thành viên', 'success');
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể xóa thành viên.', 'error');
    }
  }

  return (
    <Card id="so-chung" className="scroll-mt-6 rounded-2xl border-slate-200 bg-white">
      <CardHeader className="p-5 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Users className="size-4 text-[#00a970]" /> Sổ tài chính & Thành viên gia đình
        </CardTitle>
        <CardDescription className="text-xs">
          Tách riêng sổ cá nhân, sổ chung gia đình hoặc kinh doanh. Mời thành viên với quyền Biên tập hoặc Chỉ xem.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5 p-5 pt-2">
        <div className="space-y-2">
          {ledgers.map((ledger) => {
            const isSelected = ledger.id === inspectedLedgerId;
            return (
              <div
                key={ledger.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3 transition ${
                  ledger.is_active
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-slate-200 bg-slate-50/40'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDetailId(ledger.id);
                    setGeneratedInviteUrl('');
                  }}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <BookOpenCheck className="size-4 shrink-0 text-[#00a970]" />
                    <span className="truncate text-sm font-semibold text-slate-800">{ledger.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {KIND_LABELS[ledger.kind]}
                    </span>
                    <span className="rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      {ROLE_LABELS[ledger.role]}
                    </span>
                    {ledger.is_active ? (
                      <span className="rounded-full bg-[#00bc7c] px-2 py-0.5 text-[10px] font-semibold text-white">
                        Đang mở
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {ledger.member_count} thành viên {isSelected ? '· Đang xem chi tiết bên dưới' : '· Bấm để quản lý thành viên'}
                  </p>
                </button>
                {!ledger.is_active ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={isSwitchingId === ledger.id}
                    onClick={() => void handleSwitchLedger(ledger.id)}
                    className="h-8 rounded-lg text-xs"
                  >
                    {isSwitchingId === ledger.id ? 'Đang chuyển…' : 'Chuyển sang'}
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>

        <form onSubmit={handleCreateLedger} className="grid gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-3.5 sm:grid-cols-[1fr_170px_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="new-ledger-name" className="text-xs font-medium text-slate-700">
              Tạo sổ mới
            </Label>
            <Input
              id="new-ledger-name"
              placeholder="Ví dụ: Sổ Gia Đình, Quỹ Cửa Hàng…"
              value={newLedgerName}
              onChange={(event) => setNewLedgerName(event.target.value)}
              className="h-9 rounded-xl bg-white text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-ledger-kind" className="text-xs font-medium text-slate-700">
              Loại sổ
            </Label>
            <Select
              value={newLedgerKind}
              onValueChange={(value) => {
                if (value === 'family' || value === 'business' || value === 'personal') {
                  setNewLedgerKind(value);
                }
              }}
            >
              <SelectTrigger id="new-ledger-kind" className="h-9 rounded-xl bg-white text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="family">Gia đình / Cặp đôi</SelectItem>
                <SelectItem value="business">Kinh doanh</SelectItem>
                <SelectItem value="personal">Cá nhân</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            disabled={isCreating || !newLedgerName.trim()}
            className="h-9 rounded-xl bg-[#00bc7c] text-xs font-semibold text-white hover:bg-[#00a970]"
          >
            <Plus className="mr-1 size-3.5" />
            {isCreating ? 'Đang tạo…' : 'Tạo sổ mới'}
          </Button>
        </form>

        {detailData ? (
          <div className="space-y-4 rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Thành viên trong “{detailData.name}”
                </h3>
                <p className="text-xs text-slate-500">
                  {detailData.role === 'owner'
                    ? 'Bạn là chủ sổ: có thể mời thành viên và phân quyền.'
                    : `Vai trò hiện tại của bạn: ${ROLE_LABELS[detailData.role]}.`}
                </p>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {detailData.members.map((member) => (
                <div key={member.user_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{member.name}</p>
                    <p className="truncate text-xs text-slate-500">{member.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {detailData.role === 'owner' && member.role !== 'owner' ? (
                      <>
                        <Select
                          value={member.role}
                          onValueChange={(value) => {
                            if (value === 'editor' || value === 'viewer') {
                              void handleUpdateMemberRole(member.user_id, value);
                            }
                          }}
                        >
                          <SelectTrigger
                            aria-label={`Quyền của ${member.name}`}
                            className="h-8 w-28 rounded-lg text-xs"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="editor">Biên tập</SelectItem>
                            <SelectItem value="viewer">Chỉ xem</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => void handleRemoveMember(member.user_id)}
                          aria-label={`Xóa ${member.name} khỏi sổ`}
                          className="text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </>
                    ) : (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                        {ROLE_LABELS[member.role]}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {detailData.role === 'owner' ? (
              <form onSubmit={handleCreateInvite} className="space-y-3 border-t border-slate-100 pt-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <UserPlus className="size-3.5 text-[#00a970]" /> Mời thành viên vào “{detailData.name}”
                </p>
                <div className="grid gap-2.5 sm:grid-cols-[1fr_140px_auto]">
                  <Input
                    type="email"
                    placeholder="Email người nhận (hoặc để trống để lấy link)"
                    value={inviteEmail}
                    onChange={(event) => setInviteEmail(event.target.value)}
                    className="h-9 rounded-xl text-sm"
                  />
                  <Select
                    value={inviteRole}
                    onValueChange={(value) => {
                      if (value === 'editor' || value === 'viewer') setInviteRole(value);
                    }}
                  >
                    <SelectTrigger aria-label="Quyền lời mời" className="h-9 rounded-xl text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Biên tập (Ghi/Sửa)</SelectItem>
                      <SelectItem value="viewer">Chỉ xem</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="submit"
                    disabled={isInviting}
                    className="h-9 rounded-xl bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800"
                  >
                    <Link2 className="mr-1.5 size-3.5" />
                    {isInviting ? 'Đang tạo…' : 'Tạo link mời'}
                  </Button>
                </div>

                {generatedInviteUrl ? (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5">
                    <Input
                      readOnly
                      aria-label="Liên kết mời tham gia sổ"
                      value={generatedInviteUrl}
                      className="h-8 border-0 bg-transparent text-xs text-slate-700 shadow-none focus-visible:ring-0"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleCopyInvite()}
                      className="h-8 shrink-0 rounded-lg bg-white text-xs"
                    >
                      {copiedInvite ? <Check className="mr-1 size-3.5 text-emerald-600" /> : <Copy className="mr-1 size-3.5" />}
                      {copiedInvite ? 'Đã chép' : 'Sao chép'}
                    </Button>
                  </div>
                ) : null}
              </form>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
