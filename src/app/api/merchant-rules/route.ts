import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { normalizeMerchantKeyword } from '@/lib/fast-path-parser';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';

const createRuleSchema = z.object({
  keyword: z.string().trim().min(1, 'Nhập từ khóa').max(120),
  category_id: z.coerce.number().int().positive(),
  type: z.enum(['expense', 'income']).optional().default('expense'),
  account_id: z.coerce.number().int().positive().nullable().optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
  const res = await db.execute({
    sql: `SELECT mr.id, mr.keyword, mr.category_id, mr.type, mr.account_id, mr.hit_count, mr.updated_at,
                 c.name AS category_name, c.color AS category_color,
                 a.name AS account_name
          FROM merchant_rules mr
          JOIN categories c ON c.id = mr.category_id
          LEFT JOIN accounts a ON a.id = mr.account_id
          WHERE mr.ledger_id = ? OR mr.user_id = ?
          ORDER BY mr.hit_count DESC, mr.id DESC`,
    args: [ledgerId, user.id],
  });

  return NextResponse.json(
    res.rows.map((row) => ({
      id: Number(row.id),
      keyword: String(row.keyword),
      category_id: Number(row.category_id),
      category_name: String(row.category_name),
      category_color: String(row.category_color || '#64748b'),
      type: row.type === 'income' ? 'income' : 'expense',
      account_id: row.account_id !== null && row.account_id !== undefined ? Number(row.account_id) : null,
      account_name: row.account_name ? String(row.account_name) : null,
      hit_count: Number(row.hit_count) || 1,
    })),
  );
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const rawBody: unknown = await request.json().catch(() => null);
  const parsed = createRuleSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || 'Quy tắc phân loại không hợp lệ.' },
      { status: 400 },
    );
  }

  const keyword = normalizeMerchantKeyword(parsed.data.keyword);
  if (!keyword) {
    return NextResponse.json({ error: 'Từ khóa không hợp lệ.' }, { status: 400 });
  }

  const db = await getDb();
  const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);

  const catCheck = await db.execute({
    sql: 'SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
    args: [parsed.data.category_id, user.id],
  });
  if (!catCheck.rows[0]) {
    return NextResponse.json({ error: 'Danh mục không tồn tại.' }, { status: 404 });
  }

  await db.execute({
    sql: `INSERT INTO merchant_rules (ledger_id, user_id, keyword, category_id, type, account_id, hit_count, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, datetime('now'))
          ON CONFLICT(ledger_id, keyword, type) DO UPDATE SET
            category_id = excluded.category_id,
            account_id = excluded.account_id,
            hit_count = merchant_rules.hit_count + 1,
            updated_at = datetime('now')`,
    args: [
      ledgerId,
      user.id,
      keyword,
      parsed.data.category_id,
      parsed.data.type,
      parsed.data.account_id ?? null,
    ],
  });

  return NextResponse.json({ ok: true, keyword }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: 'ID quy tắc không hợp lệ.' }, { status: 400 });
  }

  const db = await getDb();
  const del = await db.execute({
    sql: 'DELETE FROM merchant_rules WHERE id = ? AND user_id = ?',
    args: [Number(id), user.id],
  });
  if (!del.rowsAffected) {
    return NextResponse.json({ error: 'Không tìm thấy quy tắc.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
