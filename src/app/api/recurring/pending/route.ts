import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { materializeDueOccurrences } from '@/lib/reminders-worker';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = await getDb();
  await materializeDueOccurrences(db, user.id);

  const res = await db.execute({
    sql: `SELECT o.id, o.rule_id, o.due_date, o.status,
                 r.title, r.amount, r.type, r.category_id, r.account_id, r.debt_id, r.cadence,
                 c.name AS category_name, c.color AS category_color,
                 a.name AS account_name
          FROM recurring_occurrences o
          JOIN recurring_rules r ON r.id = o.rule_id
          LEFT JOIN categories c ON c.id = r.category_id
          LEFT JOIN accounts a ON a.id = r.account_id
          WHERE o.user_id = ? AND o.status = 'pending' AND r.enabled = 1
          ORDER BY o.due_date ASC, o.id ASC`,
    args: [user.id],
  });

  return NextResponse.json(
    res.rows.map((row) => ({
      id: Number(row.id),
      rule_id: Number(row.rule_id),
      due_date: String(row.due_date),
      title: String(row.title),
      amount: Number(row.amount) || 0,
      type: String(row.type),
      category_id: row.category_id !== null && row.category_id !== undefined ? Number(row.category_id) : null,
      category_name: row.category_name ? String(row.category_name) : null,
      account_id: row.account_id !== null && row.account_id !== undefined ? Number(row.account_id) : null,
      account_name: row.account_name ? String(row.account_name) : null,
      debt_id: row.debt_id !== null && row.debt_id !== undefined ? Number(row.debt_id) : null,
      cadence: String(row.cadence),
    })),
  );
}
