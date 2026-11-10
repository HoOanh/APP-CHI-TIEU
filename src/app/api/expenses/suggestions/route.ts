import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const db = await getDb();
    const result = await db.execute({
      sql: `SELECT e.description, e.amount, e.category_id, e.type,
                   c.name AS category_name, c.color AS category_color,
                   COUNT(*) AS repeat_count, MAX(e.expense_date) AS last_used
            FROM expenses e
            LEFT JOIN categories c ON c.id = e.category_id
            WHERE e.user_id = ?
              AND e.expense_date >= date('now', '-90 days')
            GROUP BY lower(e.description), e.amount, e.category_id, e.type,
                     e.description, c.name, c.color
            ORDER BY repeat_count DESC, last_used DESC
            LIMIT 4`,
      args: [user.id],
    });

    const suggestions = result.rows.map((row) => {
      const amount = Math.round(Number(row.amount) || 0);
      const description = String(row.description || '').trim();
      const categoryName = String(row.category_name || '').trim();
      const amountText = new Intl.NumberFormat('vi-VN').format(amount);
      return {
        label: description,
        amount,
        amountText,
        categoryName,
        categoryColor: String(row.category_color || '#64748b'),
        type: row.type === 'income' ? 'income' : 'expense',
        prompt: `${description} ${amountText}đ`,
      };
    });

    return NextResponse.json(suggestions, {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (error) {
    console.error('[expense-suggestions]', error);
    return NextResponse.json({ error: 'Không thể tải gợi ý giao dịch.' }, { status: 500 });
  }
}
