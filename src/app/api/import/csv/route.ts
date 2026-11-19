import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { normalizeMerchantKeyword } from '@/lib/fast-path-parser';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { UNCLASSIFIED_EXPENSE } from '@/lib/schema';

const csvImportRowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.coerce.number().finite().positive(),
  description: z.string().trim().min(1).max(160),
  note: z.string().max(500).optional().default(''),
  type: z.enum(['expense', 'income']).optional().default('expense'),
  category_name: z.string().max(80).optional(),
});

const csvImportSchema = z.object({
  accountId: z.coerce.number().int().positive().nullable().optional(),
  skipDuplicates: z.boolean().optional().default(true),
  rows: z.array(csvImportRowSchema).min(1, 'Chưa có dòng dữ liệu hợp lệ').max(500, 'Tối đa 500 dòng mỗi lần import'),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = csvImportSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dữ liệu import CSV không hợp lệ.' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const ctx = await ensureUserLedgerAndAccount(db, user.id);
    const accountId = parsed.data.accountId ?? ctx.defaultAccountId;

    const [catRes, ruleRes, existingRes] = await db.batch([
      {
        sql: 'SELECT id, name, kind FROM categories WHERE user_id IS NULL OR user_id = ?',
        args: [user.id],
      },
      {
        sql: 'SELECT keyword, category_id, type FROM merchant_rules WHERE ledger_id = ? OR user_id = ?',
        args: [ctx.ledgerId, user.id],
      },
      {
        sql: `SELECT expense_date, amount, description
              FROM expenses
              WHERE (ledger_id = ? OR (ledger_id IS NULL AND user_id = ?))
                AND type IN ('expense', 'income')`,
        args: [ctx.ledgerId, user.id],
      },
    ], 'read');

    const categories = catRes.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      lowerName: String(r.name).normalize('NFC').toLocaleLowerCase('vi'),
      kind: String(r.kind || 'expense'),
    }));
    const fallbackExpenseCat = categories.find((c) => c.name === UNCLASSIFIED_EXPENSE) ?? categories.find((c) => c.kind !== 'income');
    const fallbackIncomeCat = categories.find((c) => c.name === 'Thu nhập') ?? categories.find((c) => c.kind === 'income');

    const rules = ruleRes.rows.map((r) => ({
      keyword: String(r.keyword).normalize('NFC').toLocaleLowerCase('vi'),
      categoryId: Number(r.category_id),
      type: r.type === 'income' ? 'income' : 'expense',
    }));

    const existingKeys = new Set(
      existingRes.rows.map((r) =>
        `${String(r.expense_date)}|${Math.round(Number(r.amount))}|${String(r.description).normalize('NFC').toLocaleLowerCase('vi').trim()}`,
      ),
    );

    let importedCount = 0;
    let skippedDuplicates = 0;

    const tx = await db.transaction('write');
    try {
      for (const row of parsed.data.rows) {
        const key = `${row.date}|${Math.round(row.amount)}|${row.description.normalize('NFC').toLocaleLowerCase('vi').trim()}`;
        if (parsed.data.skipDuplicates && existingKeys.has(key)) {
          skippedDuplicates += 1;
          continue;
        }
        existingKeys.add(key);

        let categoryId: number | null = null;
        if (row.category_name) {
          const matchedName = row.category_name.normalize('NFC').toLocaleLowerCase('vi').trim();
          categoryId = categories.find((c) => c.lowerName === matchedName)?.id ?? null;
        }
        if (!categoryId) {
          const normalizedDesc = normalizeMerchantKeyword(row.description);
          const matchedRule = rules.find((r) =>
            r.type === row.type && (r.keyword === normalizedDesc || normalizedDesc.includes(r.keyword)),
          );
          if (matchedRule) categoryId = matchedRule.categoryId;
        }
        if (!categoryId) {
          categoryId = row.type === 'income' ? (fallbackIncomeCat?.id ?? null) : (fallbackExpenseCat?.id ?? null);
        }

        await tx.execute({
          sql: `INSERT INTO expenses
                  (user_id, ledger_id, account_id, created_by_user_id, source, amount, description, note, category_id, expense_date, type)
                VALUES (?, ?, ?, ?, 'import', ?, ?, ?, ?, ?, ?)`,
          args: [
            user.id,
            ctx.ledgerId,
            accountId,
            user.id,
            Math.round(row.amount),
            row.description.slice(0, 160),
            row.note.slice(0, 500),
            categoryId,
            row.date,
            row.type,
          ],
        });
        importedCount += 1;
      }

      await tx.commit();
      return NextResponse.json({ ok: true, importedCount, skippedDuplicates }, { status: 201 });
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } catch (error) {
    console.error('[POST /api/import/csv]', error);
    return NextResponse.json({ error: 'Không thể import file CSV.' }, { status: 500 });
  }
}
