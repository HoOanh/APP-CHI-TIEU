import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const month = request.nextUrl.searchParams.get('month');
    if (!month) return NextResponse.json({ error: 'Month is required' }, { status: 400 });

    const db = await getDb();

    const today = new Date().toISOString().split('T')[0];
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

    const { category_id, month, budget_amount, warning_percent, daily_limit, frequency_limit, frequency_period } = await request.json();
    const db = await getDb();
    
    const existingResult = await db.execute({
      sql: 'SELECT id FROM budget_jars WHERE user_id = ? AND category_id = ? AND month = ?',
      args: [user.id, category_id, month],
    });
    
    if (existingResult.rows.length > 0) {
      const existingId = existingResult.rows[0].id;
      await db.execute({ 
        sql: 'UPDATE budget_jars SET budget_amount = ?, warning_percent = ?, daily_limit = ?, frequency_limit = ?, frequency_period = ? WHERE id = ? AND user_id = ?', 
        args: [budget_amount, warning_percent, daily_limit || 0, frequency_limit || 0, frequency_period || '', existingId, user.id] 
      });
      return NextResponse.json({ id: existingId, category_id, month, budget_amount, warning_percent, daily_limit, frequency_limit, frequency_period });
    } else {
      const info = await db.execute({ 
        sql: 'INSERT INTO budget_jars (user_id, category_id, month, budget_amount, warning_percent, daily_limit, frequency_limit, frequency_period) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', 
        args: [user.id, category_id, month, budget_amount, warning_percent, daily_limit || 0, frequency_limit || 0, frequency_period || ''] 
      });
      return NextResponse.json({ id: Number(info.lastInsertRowid), category_id, month, budget_amount, warning_percent, daily_limit, frequency_limit, frequency_period }, { status: 201 });
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to save budget' }, { status: 500 });
  }
}
