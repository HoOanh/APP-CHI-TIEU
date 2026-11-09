import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';
import { getVietnamToday } from '@/lib/utils';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const month = request.nextUrl.searchParams.get('month');
    if (!month) return NextResponse.json({ error: 'Month is required' }, { status: 400 });

    const db = await getDb();

    const today = getVietnamToday();
    const todayDate = new Date(today);
    const dayOfWeek = todayDate.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const result = await db.execute({
      sql: `SELECT b.*, c.name AS category_name, c.icon AS category_icon,
              c.color AS category_color,
              COALESCE(SUM(CASE
                WHEN e.type = 'expense' AND strftime('%Y-%m', e.expense_date) = b.month
                THEN e.amount ELSE 0 END), 0) AS spent_amount,
              COALESCE(SUM(CASE
                WHEN e.type = 'expense' AND e.expense_date = ?
                THEN e.amount ELSE 0 END), 0) AS today_spent,
              COUNT(CASE
                WHEN e.type = 'expense' AND e.expense_date = ? THEN 1 END
              ) AS today_count,
              COUNT(CASE
                WHEN e.type = 'expense' AND e.expense_date >= ? AND e.expense_date <= ?
                THEN 1 END
              ) AS week_count,
              COUNT(CASE
                WHEN e.type = 'expense' AND strftime('%Y-%m', e.expense_date) = b.month
                THEN 1 END
              ) AS month_count
            FROM budget_jars b
            LEFT JOIN categories c ON c.id = b.category_id
            LEFT JOIN expenses e ON e.user_id = b.user_id
              AND e.category_id = b.category_id
            WHERE b.user_id = ? AND b.month = ?
            GROUP BY b.id, c.name, c.icon, c.color
            ORDER BY c.name`,
      args: [
        today,
        today,
        weekStartStr,
        weekEndStr,
        user.id,
        month,
      ],
    });

    const enriched = result.rows.map((budget) => {
      const dailyLimit = Number(budget.daily_limit) || 0;
      const freqLimit = Number(budget.frequency_limit) || 0;
      const freqPeriod = (budget.frequency_period as string) || '';
      const todaySpent = Number(budget.today_spent) || 0;
      const todayCount = Number(budget.today_count) || 0;
      const weekCount = Number(budget.week_count) || 0;
      const monthCount = Number(budget.month_count) || 0;

      // Build alerts
      const alerts: { type: string; title: string; message: string; severity: 'warning' | 'danger' }[] = [];
      const budgetAmount = Number(budget.budget_amount) || 0;
      const spentAmount = Number(budget.spent_amount) || 0;
      const warningPercent = Number(budget.warning_percent) || 80;
      const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
      const isCurrentMonth = String(budget.month) === today.slice(0, 7);
      const daysLeft = isCurrentMonth
        ? Math.max(1, new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0).getDate() - todayDate.getDate() + 1)
        : 0;

      if (percentage >= 100) {
        alerts.push({
          type: 'monthly_budget',
          title: 'Đã vượt ngân sách tháng',
          message: `Vượt ${formatNum(spentAmount - budgetAmount)}. Tạm dừng chi ở hũ này hoặc tăng ngân sách.`,
          severity: 'danger',
        });
      } else if (percentage >= warningPercent) {
        const remaining = budgetAmount - spentAmount;
        alerts.push({
          type: 'monthly_budget',
          title: `Đã dùng ${Math.round(percentage)}% ngân sách`,
          message: daysLeft
            ? `Còn ${formatNum(remaining)} · nên chi tối đa ${formatNum(remaining / daysLeft)}/ngày trong ${daysLeft} ngày tới.`
            : `Còn ${formatNum(remaining)} trước khi chạm trần ngân sách.`,
          severity: 'warning',
        });
      }

      if (dailyLimit > 0 && todaySpent >= dailyLimit) {
        alerts.push({
          type: 'daily_limit',
          title: 'Đã vượt giới hạn hôm nay',
          message: `Vượt ${formatNum(todaySpent - dailyLimit)}. Hãy chuyển khoản chi tiếp theo sang ngày mai nếu có thể.`,
          severity: 'danger',
        });
      } else if (dailyLimit > 0 && todaySpent >= dailyLimit * 0.8) {
        alerts.push({
          type: 'daily_limit',
          title: 'Sắp chạm giới hạn hôm nay',
          message: `Còn ${formatNum(dailyLimit - todaySpent)} trong giới hạn ${formatNum(dailyLimit)}/ngày.`,
          severity: 'warning',
        });
      }

      if (freqLimit > 0 && freqPeriod) {
        const currentCount = freqPeriod === 'day' ? todayCount : freqPeriod === 'week' ? weekCount : monthCount;
        const periodLabel = freqPeriod === 'day' ? 'hôm nay' : freqPeriod === 'week' ? 'tuần này' : 'tháng này';

        if (currentCount >= freqLimit) {
          alerts.push({
            type: 'frequency',
            title: 'Đã dùng hết lượt chi',
            message: `${currentCount}/${freqLimit} lần ${periodLabel}. Hãy cân nhắc dời giao dịch tiếp theo.`,
            severity: 'danger',
          });
        } else if (currentCount >= freqLimit - 1) {
          alerts.push({
            type: 'frequency',
            title: 'Còn một lượt chi',
            message: `Đã dùng ${currentCount}/${freqLimit} lần ${periodLabel}.`,
            severity: 'warning',
          });
        }
      }

      return {
        ...budget,
        today_spent: todaySpent,
        today_count: todayCount,
        week_count: weekCount,
        month_count: monthCount,
        alerts,
      };
    });

    return NextResponse.json(enriched);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch budgets' }, { status: 500 });
  }
}

function formatNum(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n);
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: unknown = await request.json();
    if (!isRecord(body)) return NextResponse.json({ error: 'Dữ liệu ngân sách không hợp lệ.' }, { status: 400 });
    const categoryId = Number(body.category_id);
    const month = typeof body.month === 'string' ? body.month : '';
    const budgetBasis = body.budget_basis === 'daily' ? 'daily' : 'monthly';
    const budgetDays = Number(body.budget_days);
    const dailyAmount = Number(body.daily_amount);
    const monthlyAmount = Number(body.budget_amount);
    const monthDays = getDaysInMonth(month);
    const budgetAmount = budgetBasis === 'daily' ? dailyAmount * budgetDays : monthlyAmount;
    const warningPercent = Math.min(100, Math.max(1, Number(body.warning_percent) || 80));
    const dailyLimit = Math.max(0, Number(body.daily_limit) || 0);
    const frequencyLimit = Math.max(0, Number(body.frequency_limit) || 0);
    const frequencyPeriod = typeof body.frequency_period === 'string' ? body.frequency_period : '';
    if (!Number.isInteger(categoryId) || categoryId <= 0 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !Number.isFinite(budgetAmount) || budgetAmount <= 0 || (budgetBasis === 'daily' && (!Number.isFinite(dailyAmount) || dailyAmount <= 0 || !Number.isInteger(budgetDays) || budgetDays < 1 || budgetDays > monthDays))) {
      return NextResponse.json({ error: 'Kiểm tra danh mục, tháng, số tiền và số ngày ngân sách.' }, { status: 400 });
    }
    const db = await getDb();
    const category = await db.execute({
      sql: "SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?) AND name <> 'Thu nhập'",
      args: [categoryId, user.id],
    });
    if (!category.rows[0]) return NextResponse.json({ error: 'Danh mục chi tiêu không hợp lệ.' }, { status: 400 });
    
    const existingResult = await db.execute({
      sql: 'SELECT id FROM budget_jars WHERE user_id = ? AND category_id = ? AND month = ?',
      args: [user.id, categoryId, month],
    });
    
    if (existingResult.rows.length > 0) {
      const existingId = existingResult.rows[0].id;
      await db.execute({ 
        sql: 'UPDATE budget_jars SET budget_amount = ?, budget_basis = ?, daily_amount = ?, budget_days = ?, warning_percent = ?, daily_limit = ?, frequency_limit = ?, frequency_period = ? WHERE id = ? AND user_id = ?',
        args: [budgetAmount, budgetBasis, budgetBasis === 'daily' ? dailyAmount : 0, budgetBasis === 'daily' ? budgetDays : 0, warningPercent, dailyLimit, frequencyLimit, frequencyPeriod, existingId, user.id]
      });
      return NextResponse.json({ id: existingId, category_id: categoryId, month, budget_amount: budgetAmount, budget_basis: budgetBasis, daily_amount: budgetBasis === 'daily' ? dailyAmount : 0, budget_days: budgetBasis === 'daily' ? budgetDays : 0, warning_percent: warningPercent, daily_limit: dailyLimit, frequency_limit: frequencyLimit, frequency_period: frequencyPeriod });
    } else {
      const info = await db.execute({ 
        sql: 'INSERT INTO budget_jars (user_id, category_id, month, budget_amount, budget_basis, daily_amount, budget_days, warning_percent, daily_limit, frequency_limit, frequency_period) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        args: [user.id, categoryId, month, budgetAmount, budgetBasis, budgetBasis === 'daily' ? dailyAmount : 0, budgetBasis === 'daily' ? budgetDays : 0, warningPercent, dailyLimit, frequencyLimit, frequencyPeriod]
      });
      return NextResponse.json({ id: Number(info.lastInsertRowid), category_id: categoryId, month, budget_amount: budgetAmount, budget_basis: budgetBasis, daily_amount: budgetBasis === 'daily' ? dailyAmount : 0, budget_days: budgetBasis === 'daily' ? budgetDays : 0, warning_percent: warningPercent, daily_limit: dailyLimit, frequency_limit: frequencyLimit, frequency_period: frequencyPeriod }, { status: 201 });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save budget' }, { status: 500 });
  }
}

function getDaysInMonth(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  if (!match) return 0;
  return new Date(Number(match[1]), Number(match[2]), 0).getDate();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
