import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { getCurrentMonth } from '@/lib/utils';

const paydaySplitSchema = z.object({
  totalIncomeAmount: z.coerce.number().finite().positive('Thu nhập phải lớn hơn 0'),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  mode: z.enum(['add', 'replace']).optional().default('add'),
  allocations: z
    .array(
      z.object({
        category_id: z.coerce.number().int().positive(),
        percent: z.coerce.number().finite().min(0).max(100),
      }),
    )
    .min(1, 'Chọn ít nhất 1 hũ chi tiêu để phân bổ'),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = paydaySplitSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Dữ liệu chia hũ chưa hợp lệ.' },
        { status: 400 },
      );
    }

    const totalPercent = parsed.data.allocations.reduce((sum, item) => sum + item.percent, 0);
    if (totalPercent > 100.01) {
      return NextResponse.json({ error: 'Tổng phần trăm phân bổ không được vượt quá 100%.' }, { status: 400 });
    }

    const activeAllocations = parsed.data.allocations.filter((item) => item.percent > 0);
    if (!activeAllocations.length) {
      return NextResponse.json({ error: 'Hãy nhập phần trăm (> 0%) cho ít nhất 1 danh mục.' }, { status: 400 });
    }

    const targetMonth = parsed.data.month ?? getCurrentMonth();
    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
    await assertLedgerAccess(db, user.id, ledgerId, 'editor');

    const tx = await db.transaction('write');
    try {
      const applied: Array<{ category_id: number; amount: number }> = [];
      for (const alloc of activeAllocations) {
        const catCheck = await tx.execute({
          sql: "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?) AND kind <> 'income'",
          args: [alloc.category_id, user.id],
        });
        if (!catCheck.rows[0]) continue;

        const amountToAllocate = Math.round((parsed.data.totalIncomeAmount * alloc.percent) / 100);
        if (amountToAllocate <= 0) continue;

        await tx.execute({
          sql: `INSERT INTO budget_jars (user_id, ledger_id, category_id, month, budget_amount, budget_basis)
                VALUES (?, ?, ?, ?, ?, 'monthly')
                ON CONFLICT(user_id, category_id, month) DO UPDATE SET
                  ledger_id = excluded.ledger_id,
                  budget_amount = ${parsed.data.mode === 'replace' ? 'excluded.budget_amount' : 'budget_jars.budget_amount + excluded.budget_amount'}`,
          args: [user.id, ledgerId, alloc.category_id, targetMonth, amountToAllocate],
        });
        applied.push({ category_id: alloc.category_id, amount: amountToAllocate });
      }
      await tx.commit();
      return NextResponse.json({ ok: true, month: targetMonth, applied }, { status: 201 });
    } catch (error) {
      await tx.rollback().catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/budgets/payday-split]', error);
    return NextResponse.json({ error: 'Không thể chia hũ thu nhập.' }, { status: 500 });
  }
}
