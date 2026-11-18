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
    sql: `SELECT b.budget_amount, b.warning_percent, b.budget_basis, b.daily_amount, b.daily_limit,
                 c.name AS category_name,
                 COALESCE(SUM(e.amount), 0) AS spent_amount,
                 COALESCE(SUM(CASE WHEN e.expense_date = ? THEN e.amount ELSE 0 END), 0) AS day_spent
          FROM budget_jars b
          LEFT JOIN categories c ON c.id = b.category_id
          LEFT JOIN expenses e ON e.user_id = b.user_id
            AND e.category_id = b.category_id
            AND e.type = 'expense'
            AND strftime('%Y-%m', e.expense_date) = b.month
          WHERE b.user_id = ? AND b.category_id = ? AND b.month = ?
          GROUP BY b.id, b.budget_amount, b.warning_percent, b.budget_basis, b.daily_amount, b.daily_limit, c.name`,
    args: [expenseDate, userId, categoryId, month],
  });
  const budget = result.rows[0];
  if (!budget) return null;

  const limit = Number(budget.budget_amount) || 0;
  const spent = Number(budget.spent_amount) || 0;
  const daySpent = Number(budget.day_spent) || 0;
  const spentBeforeThisTransaction = Math.max(0, spent - addedAmount);
  const daySpentBefore = Math.max(0, daySpent - addedAmount);
  const warningPercent = Number(budget.warning_percent) || 80;
  const effectiveDailyLimit = Number(budget.daily_limit) > 0
    ? Number(budget.daily_limit)
    : budget.budget_basis === 'daily'
      ? Number(budget.daily_amount) || 0
      : 0;

  const categoryName = String(budget.category_name || 'danh mục này');

  // 1. Monthly budget overspent (danger)
  if (limit > 0 && spent > limit) {
    return {
      title: `🚨 THỦNG NGÂN SÁCH THÁNG — ${categoryName}`,
      message: `Đã chi ${formatAmount(spent)} / ${formatAmount(limit)} (lố ${formatAmount(spent - limit)}). Hũ ${categoryName} đã vượt trần tháng, dừng chi ngay đại ca!`,
      severity: 'danger',
    };
  }

  // 2. Daily limit / daily budget overspent (danger)
  if (effectiveDailyLimit > 0 && daySpent > effectiveDailyLimit) {
    return {
      title: `🚨 CHI LỐ HẠN MỨC NGÀY — ${categoryName}`,
      message: `Ngày ${formatShortIsoDate(expenseDate)} đã chi ${formatAmount(daySpent)} / ${formatAmount(effectiveDailyLimit)} (vượt lố ${formatAmount(daySpent - effectiveDailyLimit)}). Đã lố định mức ngày rồi đại ca ơi!`,
      severity: 'danger',
    };
  }

  // 3. Exact 100% monthly limit reached
  if (limit > 0 && spent >= limit && spentBeforeThisTransaction < limit) {
    return {
      title: `🚨 CHẠM KỊCH TRẦN THÁNG — ${categoryName}`,
      message: `Đã chi đủ 100% ngân sách tháng (${formatAmount(spent)}/${formatAmount(limit)}). Mọi khoản chi thêm sẽ bị lố ngân sách!`,
      severity: 'danger',
    };
  }

  // 4. Approaching monthly warning threshold
  if (
    limit > 0
    && spent >= (limit * warningPercent) / 100
    && spentBeforeThisTransaction < (limit * warningPercent) / 100
  ) {
    return {
      title: `⚠️ ${categoryName} sắp chạm trần tháng`,
      message: `Đã dùng ${Math.round((spent / limit) * 100)}% ngân sách tháng, chỉ còn ${formatAmount(limit - spent)}. Chi kỹ tay từ giờ nhé.`,
      severity: 'warning',
    };
  }

  // 5. Approaching or hitting exact daily limit
  if (
    effectiveDailyLimit > 0
    && daySpent >= effectiveDailyLimit * 0.85
    && daySpentBefore < effectiveDailyLimit * 0.85
  ) {
    const remainingDay = Math.max(0, effectiveDailyLimit - daySpent);
    return {
      title: remainingDay === 0
        ? `⚠️ Đã chạm kịch trần ngày — ${categoryName}`
        : `⚠️ Sắp chạm hạn mức ngày — ${categoryName}`,
      message: remainingDay === 0
        ? `Đã chi đúng ${formatAmount(daySpent)}/${formatAmount(effectiveDailyLimit)} trong ngày ${formatShortIsoDate(expenseDate)}. Chi thêm là lố hạn mức ngày!`
        : `Đã chi ${formatAmount(daySpent)}/${formatAmount(effectiveDailyLimit)} trong ngày, chỉ còn ${formatAmount(remainingDay)}.`,
      severity: 'warning',
    };
  }

  return null;
}

function formatAmount(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(Math.round(amount))}đ`;
}

function formatShortIsoDate(date: string): string {
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}` : date;
}
