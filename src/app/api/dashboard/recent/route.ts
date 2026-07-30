import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const db = await getDb();
    const result = await db.execute({
      sql: `SELECT e.id, e.amount, e.description, e.expense_date AS date, e.type,
                    c.name AS category_name, c.color AS category_color
            FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
            WHERE e.user_id = ? ORDER BY e.expense_date DESC, e.created_at DESC LIMIT 5`,
      args: [user.id],
    });
    return NextResponse.json(result.rows, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    console.error('[dashboard-recent]', error);
    return NextResponse.json({ error: 'Failed to fetch recent transactions' }, { status: 500 });
  }
}
