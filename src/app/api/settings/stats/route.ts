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
    const [expenses, debts] = await Promise.all([
      db.execute({
        sql: 'SELECT COUNT(*) as count FROM expenses WHERE user_id = ?',
        args: [user.id],
      }),
      db.execute({
        sql: 'SELECT COUNT(*) as count FROM debts WHERE user_id = ?',
        args: [user.id],
      }),
    ]);

    return NextResponse.json({
      expenses: Number(expenses.rows[0]?.count || 0),
      debts: Number(debts.rows[0]?.count || 0),
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: 'Failed to fetch settings stats' },
      { status: 500 },
    );
  }
}
