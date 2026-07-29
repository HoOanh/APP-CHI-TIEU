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

    // Get budgets with total monthly spent
    const query = `
      SELECT b.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
      COALESCE((SELECT SUM(amount) FROM expenses e WHERE e.user_id = b.user_id AND e.category_id = b.category_id AND e.type = 'expense' AND strftime('%Y-%m', e.expense_date) = b.month), 0) as spent_amount
      FROM budget_jars b
      LEFT JOIN categories c ON b.category_id = c.id
      WHERE b.user_id = ? AND b.month = ?
    `;
    const result = await db.execute({ sql: query, args: [user.id, month] });

    // For each budget, calculate daily/weekly/monthly frequency alerts
    const today = new Date().toISOString().split('T')[0];
    const todayDate = new Date(today);

    // Current week boundaries (Mon-Sun)
    const dayOfWeek = todayDate.getDay(); // 0=Sun
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStart = new Date(todayDate);
    weekStart.setDate(todayDate.getDate() + mondayOffset);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartStr = weekStart.toISOString().split('T')[0];
    const weekEndStr = weekEnd.toISOString().split('T')[0];

    const enriched = await Promise.all(result.rows.map(async (budget) => {
      const categoryId = budget.category_id;
      const dailyLimit = Number(budget.daily_limit) || 0;
      const freqLimit = Number(budget.frequency_limit) || 0;
      const freqPeriod = (budget.frequency_period as string) || '';

      let todaySpent = 0;
      let todayCount = 0;
      let weekCount = 0;
      let monthCount = 0;

      // Get today's spending for this category
      if (dailyLimit > 0 || freqPeriod === 'day') {
        const dayResult = await db.execute({
          sql: `SELECT COALESCE(SUM(amount), 0) as total, COUNT(*) as cnt 
                FROM expenses WHERE user_id = ? AND category_id = ? AND type = 'expense' AND expense_date = ?`,
          args: [user.id, categoryId, today],
        });
        todaySpent = Number(dayResult.rows[0]?.total) || 0;
        todayCount = Number(dayResult.rows[0]?.cnt) || 0;
      }

      // Get this week's count
      if (freqPeriod === 'week') {
        const weekResult = await db.execute({
          sql: `SELECT COUNT(*) as cnt FROM expenses 
                WHERE user_id = ? AND category_id = ? AND type = 'expense' AND expense_date >= ? AND expense_date <= ?`,
          args: [user.id, categoryId, weekStartStr, weekEndStr],
        });
        weekCount = Number(weekResult.rows[0]?.cnt) || 0;
      }

      // Get this month's count
      if (freqPeriod === 'month') {
        const monthResult = await db.execute({
          sql: `SELECT COUNT(*) as cnt FROM expenses 
                WHERE user_id = ? AND category_id = ? AND type = 'expense' AND strftime('%Y-%m', expense_date) = ?`,
          args: [user.id, categoryId, month],
        });
        monthCount = Number(monthResult.rows[0]?.cnt) || 0;
      }

      // Build alerts
      const alerts: { type: string; message: string; severity: 'warning' | 'danger' }[] = [];

      // Daily limit alert
      if (dailyLimit > 0 && todaySpent >= dailyLimit) {
        alerts.push({
          type: 'daily_limit',
          message: `Đã chi ${formatNum(todaySpent)}/${formatNum(dailyLimit)} hôm nay`,
          severity: todaySpent >= dailyLimit ? 'danger' : 'warning',
        });
      } else if (dailyLimit > 0 && todaySpent >= dailyLimit * 0.8) {
        alerts.push({
          type: 'daily_limit',
          message: `Đã chi ${formatNum(todaySpent)}/${formatNum(dailyLimit)} hôm nay`,
          severity: 'warning',
        });
      }

      // Frequency alert
      if (freqLimit > 0 && freqPeriod) {
        const currentCount = freqPeriod === 'day' ? todayCount : freqPeriod === 'week' ? weekCount : monthCount;
        const periodLabel = freqPeriod === 'day' ? 'hôm nay' : freqPeriod === 'week' ? 'tuần này' : 'tháng này';

        if (currentCount >= freqLimit) {
          alerts.push({
            type: 'frequency',
            message: `Đã chi ${currentCount}/${freqLimit} lần ${periodLabel}`,
            severity: 'danger',
          });
        } else if (currentCount >= freqLimit - 1) {
          alerts.push({
            type: 'frequency',
            message: `Đã chi ${currentCount}/${freqLimit} lần ${periodLabel}`,
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
    }));

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
