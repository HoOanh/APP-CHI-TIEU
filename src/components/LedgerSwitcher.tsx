'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { BookOpenCheck, Users, Building2, UserRound, Lock } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/useToast';
import { cn } from '@/lib/utils';

export interface LedgerOption {
  id: number;
  owner_id: number;
  name: string;
  kind: 'personal' | 'family' | 'business';
  currency: string;
  role: 'owner' | 'editor' | 'viewer';
  member_count: number;
  is_active: boolean;
}

interface LedgersListResponse {
  activeLedgerId: number;
  ledgers: LedgerOption[];
}

const fetchLedgers = async (url: string): Promise<LedgersListResponse> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load ledgers');
  return res.json() as Promise<LedgersListResponse>;
};

const ROLE_LABELS: Record<LedgerOption['role'], string> = {
  owner: 'Chủ sổ',
  editor: 'Biên tập',
  viewer: 'Chỉ xem',
};

function LedgerIcon({ kind, className }: { kind: LedgerOption['kind']; className?: string }) {
  if (kind === 'family') return <Users className={className} />;
  if (kind === 'business') return <Building2 className={className} />;
  return <UserRound className={className} />;
}

export function LedgerSwitcher({
  compact = false,
  forceShow = false,
  className,
}: {
  compact?: boolean;
  forceShow?: boolean;
  className?: string;
}) {
  const { showToast } = useToast();
  const [isSwitching, setIsSwitching] = useState(false);
  const { data } = useSWR<LedgersListResponse>('/api/ledgers', fetchLedgers, {
    dedupingInterval: 10_000,
    revalidateOnFocus: true,
  });

  const ledgers = data?.ledgers ?? [];
  const activeLedger = ledgers.find((l) => l.id === data?.activeLedgerId) ?? ledgers[0];

  if (!data || (!forceShow && ledgers.length <= 1 && activeLedger?.kind === 'personal')) {
    return null;
  }

  async function handleSwitch(nextIdRaw: string) {
    const nextId = Number(nextIdRaw);
    if (!Number.isInteger(nextId) || nextId <= 0 || nextId === data?.activeLedgerId || isSwitching) {
      return;
    }

    setIsSwitching(true);
    try {
      const res = await fetch(`/api/ledgers/${nextId}/switch`, { method: 'POST' });
      const payload = await res.json().catch(() => ({})) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error || 'Không thể chuyển sổ.');
      }
      window.location.reload();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không thể chuyển sổ.', 'error');
      setIsSwitching(false);
    }
  }

  if (!activeLedger) return null;

  return (
    <div className={cn('min-w-0', className)}>
      <Select
        value={String(activeLedger.id)}
        onValueChange={(value) => void handleSwitch(value)}
        disabled={isSwitching}
      >
        <SelectTrigger
          aria-label="Chọn sổ tài chính"
          className={cn(
            'w-full rounded-xl border-slate-200 bg-slate-50/80 text-left text-xs font-medium text-slate-700 hover:bg-slate-100',
            compact ? 'h-9 px-2.5' : 'h-10 px-3',
          )}
        >
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <BookOpenCheck className="size-3.5 shrink-0 text-[#00a970]" />
            <SelectValue placeholder="Chọn sổ">{activeLedger.name}</SelectValue>
            {activeLedger.role === 'viewer' ? (
              <Lock className="size-3 shrink-0 text-amber-600" aria-label="Chỉ xem" />
            ) : null}
          </span>
        </SelectTrigger>
        <SelectContent align="start" className="min-w-56 rounded-xl">
          {ledgers.map((ledger) => (
            <SelectItem key={ledger.id} value={String(ledger.id)} className="rounded-lg py-2">
              <div className="flex items-center gap-2">
                <LedgerIcon kind={ledger.kind} className="size-3.5 shrink-0 text-slate-500" />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-slate-800">{ledger.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {ROLE_LABELS[ledger.role]}
                    {ledger.member_count > 1 ? ` · ${ledger.member_count} thành viên` : ''}
                  </p>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
