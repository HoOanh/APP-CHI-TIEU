import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const [expenses, budgets, debts, debtJars, debtPayments, categories] =
      await Promise.all([
        db.execute({
          sql: 'SELECT * FROM expenses WHERE user_id = ? ORDER BY expense_date DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM budget_jars WHERE user_id = ? ORDER BY month DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM debts WHERE user_id = ? ORDER BY created_at DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM debt_jars WHERE user_id = ? ORDER BY month DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM debt_payments WHERE user_id = ? ORDER BY payment_date DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY name',
          args: [user.id],
        }),
      ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        name: user.name,
      },
      expenses: expenses.rows,
      budgets: budgets.rows,
      debts: debts.rows,
      debtJars: debtJars.rows,
      debtPayments: debtPayments.rows,
      categories: categories.rows,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="chi-tieu-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 },
    );
  }
}
