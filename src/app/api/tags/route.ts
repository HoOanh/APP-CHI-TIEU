import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { normalizeTagName, pickTagColor } from '@/lib/tags';

const createTagSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên tag').max(36),
  color: z.string().regex(/^#[0-9a-f]{6}$/i).optional(),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
    await assertLedgerAccess(db, user.id, ledgerId, 'viewer');

    const res = await db.execute({
      sql: `SELECT t.id, t.name, t.color, COUNT(et.expense_id) AS usage_count
            FROM tags t
            LEFT JOIN expense_tags et ON et.tag_id = t.id
            WHERE t.ledger_id = ?
            GROUP BY t.id, t.name, t.color
            ORDER BY usage_count DESC, t.name ASC`,
      args: [ledgerId],
    });

    return NextResponse.json({
      tags: res.rows.map((row) => ({
        id: Number(row.id),
        name: String(row.name),
        color: String(row.color || '#64748b'),
        usage_count: Number(row.usage_count) || 0,
      })),
    });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Không thể tải danh sách tag.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = createTagSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Tên tag không hợp lệ.' }, { status: 400 });
    }

    const normalized = normalizeTagName(parsed.data.name);
    if (!normalized) {
      return NextResponse.json({ error: 'Tên tag không hợp lệ.' }, { status: 400 });
    }

    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
    await assertLedgerAccess(db, user.id, ledgerId, 'editor');

    const color = parsed.data.color || pickTagColor(normalized);
    await db.execute({
      sql: 'INSERT OR IGNORE INTO tags (ledger_id, name, color) VALUES (?, ?, ?)',
      args: [ledgerId, normalized, color],
    });

    const created = await db.execute({
      sql: 'SELECT id, name, color FROM tags WHERE ledger_id = ? AND name = ? LIMIT 1',
      args: [ledgerId, normalized],
    });

    return NextResponse.json(
      {
        id: Number(created.rows[0]?.id),
        name: String(created.rows[0]?.name || normalized),
        color: String(created.rows[0]?.color || color),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Không thể tạo tag.' }, { status: 500 });
  }
}
