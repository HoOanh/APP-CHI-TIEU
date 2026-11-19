import type { Client } from '@libsql/client';

export type LedgerRole = 'owner' | 'editor' | 'viewer';
export type LedgerKind = 'personal' | 'family' | 'business';

const ROLE_RANK: Record<LedgerRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export class LedgerAccessError extends Error {
  status: number;

  constructor(message: string, status = 403) {
    super(message);
    this.status = status;
  }
}

export interface LedgerAccessGrant {
  ledgerId: number;
  role: LedgerRole;
  ledgerName: string;
  ledgerKind: LedgerKind;
  ownerId: number;
}

export async function assertLedgerAccess(
  db: Client,
  userId: number,
  ledgerId: number,
  minRole: LedgerRole = 'viewer',
): Promise<LedgerAccessGrant> {
  if (!Number.isInteger(ledgerId) || ledgerId <= 0) {
    throw new LedgerAccessError('Sổ tài chính không hợp lệ.', 400);
  }

  const res = await db.execute({
    sql: `SELECT l.id, l.owner_id, l.name, l.kind, lm.role AS member_role
          FROM ledgers l
          LEFT JOIN ledger_members lm ON lm.ledger_id = l.id AND lm.user_id = ?
          WHERE l.id = ?
          LIMIT 1`,
    args: [userId, ledgerId],
  });
  const row = res.rows[0];
  if (!row) {
    throw new LedgerAccessError('Không tìm thấy sổ tài chính.', 404);
  }

  const ownerId = Number(row.owner_id);
  const rawRole = row.member_role ? String(row.member_role) : ownerId === userId ? 'owner' : '';
  if (rawRole !== 'owner' && rawRole !== 'editor' && rawRole !== 'viewer') {
    throw new LedgerAccessError('Bạn không phải thành viên của sổ tài chính này.', 403);
  }

  if (ROLE_RANK[rawRole] < ROLE_RANK[minRole]) {
    throw new LedgerAccessError(
      minRole === 'owner'
        ? 'Chỉ Chủ sổ mới được thực hiện thao tác này.'
        : 'Vai trò Chỉ xem không được phép chỉnh sửa dữ liệu.',
      403,
    );
  }

  const kind: LedgerKind = row.kind === 'family' || row.kind === 'business' ? row.kind : 'personal';
  return {
    ledgerId: Number(row.id),
    role: rawRole,
    ledgerName: String(row.name || 'Ví cá nhân'),
    ledgerKind: kind,
    ownerId,
  };
}

export type CrossPushSender = (
  userId: number,
  payload: { title: string; body: string; url: string; tag: string },
) => Promise<{ sent: number }>;

export async function notifyOtherLedgerMembers(
  db: Client,
  sendPush: CrossPushSender,
  input: {
    ledgerId: number;
    actorUserId: number;
    actorName: string;
    title: string;
    body: string;
    url?: string;
    tag?: string;
  },
): Promise<number> {
  const membersRes = await db.execute({
    sql: `SELECT user_id
          FROM ledger_members
          WHERE ledger_id = ? AND user_id <> ?`,
    args: [input.ledgerId, input.actorUserId],
  });
  if (membersRes.rows.length === 0) return 0;

  let notified = 0;
  await Promise.allSettled(
    membersRes.rows.map(async (row) => {
      const targetUserId = Number(row.user_id);
      if (!targetUserId) return;
      const res = await sendPush(targetUserId, {
        title: input.title,
        body: `${input.actorName}: ${input.body}`,
        url: input.url ?? '/expenses',
        tag: input.tag ?? `ledger-${input.ledgerId}-${Date.now()}`,
      });
      if (res.sent > 0) notified += 1;
    }),
  );
  return notified;
}
