import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { simulateDebtPayoff } from '@/lib/debt-simulator';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { getCurrentMonth } from '@/lib/utils';

const simulateSchema = z.object({
  monthlyBudget: z.coerce.number().finite().positive('Ngân sách trả nợ hàng tháng phải lớn hơn 0'),
  strategy: z.enum(['avalanche', 'snowball']).optional().default('avalanche'),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = simulateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Thông tin giả lập không hợp lệ.' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);

    const res = await db.execute({
      sql: `SELECT d.id, d.name, d.total_amount, d.interest_rate,
                   d.total_amount - COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS remaining
            FROM debts d
            WHERE (d.ledger_id = ? OR (d.ledger_id IS NULL AND d.user_id = ?))
              AND d.direction = 'payable'
              AND d.status = 'active'`,
      args: [ledgerId, user.id],
    });

    const debts = res.rows
      .map((row) => ({
        id: String(row.id),
        name: String(row.name),
        remaining: Math.max(0, Number(row.remaining) || 0),
        interestRateAnnual: Number(row.interest_rate) || 0,
      }))
      .filter((d) => d.remaining > 0);

    const startMonth = getCurrentMonth();
    const primary = simulateDebtPayoff({
      debts,
      monthlyBudget: parsed.data.monthlyBudget,
      strategy: parsed.data.strategy,
      startMonth,
    });
    const alternateStrategy = parsed.data.strategy === 'avalanche' ? 'snowball' : 'avalanche';
    const alternate = simulateDebtPayoff({
      debts,
      monthlyBudget: parsed.data.monthlyBudget,
      strategy: alternateStrategy,
      startMonth,
    });

    return NextResponse.json({
      ...primary,
      comparison: {
        alternateStrategy,
        alternateMonths: alternate.monthsRequired,
        alternateInterest: alternate.totalInterestPaid,
        interestDelta: alternate.totalInterestPaid - primary.totalInterestPaid,
      },
    });
  } catch (error) {
    console.error('[POST /api/debts/simulate]', error);
    return NextResponse.json({ error: 'Không thể chạy giả lập trả nợ.' }, { status: 500 });
  }
}
