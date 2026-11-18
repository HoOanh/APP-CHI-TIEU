import type { Client } from '@libsql/client';

export interface BudgetAlert {
  title: string;
  message: string;
  severity: 'warning' | 'danger';
}

export async function getBudgetAlert({
  db,
  userId,
  categoryId,
  expenseDate,
  addedAmount,
}: {
  db: Client;
  userId: number;
  categoryId: string | number;
  expenseDate: string;
  addedAmount: number;
}): Promise<BudgetAlert | null> {
  const month = expenseDate.slice(0, 7);
  const result = await db.execute({
    sql: `SELECT b.budget_amount, b.warning_percent, c.name AS category_name,
                 COALESCE(SUM(e.amount), 0) AS spent_amount
          FROM budget_jars b
          LEFT JOIN categories c ON c.id = b.category_id
          LEFT JOIN expenses e ON e.user_id = b.user_id
            AND e.category_id = b.category_id
            AND e.type = 'expense'
            AND strftime('%Y-%m', e.expense_date) = b.month
          WHERE b.user_id = ? AND b.category_id = ? AND b.month = ?
          GROUP BY b.id, b.budget_amount, b.warning_percent, c.name`,
    args: [userId, categoryId, month],
  });
  const budget = result.rows[0];
  if (!budget) return null;

  const limit = Number(budget.budget_amount) || 0;
  const spent = Number(budget.spent_amount) || 0;
  const spentBeforeThisTransaction = Math.max(0, spent - addedAmount);
  const warningPercent = Number(budget.warning_percent) || 80;
  if (limit <= 0) return null;

  const categoryName = String(budget.category_name || 'danh mục này');
  if (spent >= limit && spentBeforeThisTransaction < limit) {
    return {
      title: `Chi hố vãi — ${categoryName} đã thủng ngân sách`,
      message: `Đã chi ${formatAmount(spent)}/${formatAmount(limit)}, thủng ${formatAmount(spent - limit)}. Khoản này đã chốt rồi; các khoản sau bớt vung tay lại.`,
      severity: 'danger',
    };
  }

  if (
    spent >= limit * warningPercent / 100
    && spentBeforeThisTransaction < limit * warningPercent / 100
  ) {
    return {
      title: `${categoryName} sắp chạm trần`,
      message: `Đã dùng ${Math.round((spent / limit) * 100)}% ngân sách, còn ${formatAmount(limit - spent)}. Chi kỹ tay từ giờ nhé.`,
      severity: 'warning',
    };
  }

  return null;
}

function formatAmount(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))} đ`;
}
