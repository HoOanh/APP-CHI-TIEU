import 'server-only';

import { getDb } from '@/lib/db';
import { generateTextWithConfiguredAi } from '@/lib/gemini';
import { getVietnamToday } from '@/lib/utils';

export interface WeeklyInsight {
  id: number;
  period_start: string;
  period_end: string;
  content: string;
  created_at: string;
}

function shiftDate(date: string, dayDelta: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + dayDelta);
  return value.toISOString().slice(0, 10);
}

export async function generateWeeklyInsight(userId: number): Promise<WeeklyInsight> {
  const periodEnd = getVietnamToday();
  const periodStart = shiftDate(periodEnd, -6);
  const previousEnd = shiftDate(periodStart, -1);
  const previousStart = shiftDate(previousEnd, -6);
  const db = await getDb();

  const currentResult = await db.execute({
    sql: `SELECT e.type, c.name AS category_name, SUM(e.amount) AS total, COUNT(*) AS count
          FROM expenses e LEFT JOIN categories c ON c.id = e.category_id
          WHERE e.user_id = ? AND e.expense_date BETWEEN ? AND ?
          GROUP BY e.type, c.name ORDER BY total DESC`,
    args: [userId, periodStart, periodEnd],
  });
  const previousResult = await db.execute({
    sql: `SELECT type, SUM(amount) AS total, COUNT(*) AS count
          FROM expenses WHERE user_id = ? AND expense_date BETWEEN ? AND ?
          GROUP BY type`,
    args: [userId, previousStart, previousEnd],
  });

  const current = currentResult.rows.map((row) => ({
    type: String(row.type),
    category: String(row.category_name || 'Chưa phân loại'),
    total: Math.round(Number(row.total) || 0),
    count: Number(row.count) || 0,
  }));
  const previous = previousResult.rows.map((row) => ({
    type: String(row.type),
    total: Math.round(Number(row.total) || 0),
    count: Number(row.count) || 0,
  }));

  const prompt = [
    'Bạn là trợ lý phân tích tài chính cá nhân, trả lời bằng tiếng Việt tự nhiên, ngắn gọn và không phán xét.',
    `Phân tích giao dịch từ ${periodStart} đến ${periodEnd} và so sánh với 7 ngày trước đó (${previousStart} đến ${previousEnd}).`,
    'Dữ liệu tuần hiện tại (type, danh mục, tổng tiền VND, số giao dịch):',
    JSON.stringify(current),
    'Dữ liệu tuần trước (type, tổng tiền VND, số giao dịch):',
    JSON.stringify(previous),
    'Trả về 3 ý ngắn: xu hướng chi/thu, danh mục đáng chú ý, một gợi ý hành động cụ thể. Không bịa dữ liệu và không đưa lời khuyên đầu tư.',
  ].join('\n');

  const content = await generateTextWithConfiguredAi(userId, prompt);
  const normalizedContent = content.trim();
  if (!normalizedContent) throw new Error('AI chưa trả về nội dung phân tích.');

  const result = await db.execute({
    sql: `INSERT INTO ai_insights (user_id, period, period_start, period_end, content)
          VALUES (?, 'week', ?, ?, ?)
          ON CONFLICT(user_id, period, period_start) DO UPDATE SET
            period_end = excluded.period_end,
            content = excluded.content,
            created_at = datetime('now')`,
    args: [userId, periodStart, periodEnd, normalizedContent],
  });
  const insightId = Number(result.lastInsertRowid);
  const saved = await db.execute({
    sql: `SELECT id, period_start, period_end, content, created_at FROM ai_insights
          WHERE user_id = ? AND period = 'week' AND period_start = ?`,
    args: [userId, periodStart],
  });
  const row = saved.rows[0];
  if (!row) throw new Error('Không thể lưu bản phân tích tuần.');
  return {
    id: Number(row.id) || insightId,
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    content: String(row.content),
    created_at: String(row.created_at),
  };
}

export async function getLatestWeeklyInsight(userId: number): Promise<WeeklyInsight | null> {
  const db = await getDb();
  const result = await db.execute({
    sql: `SELECT id, period_start, period_end, content, created_at FROM ai_insights
          WHERE user_id = ? AND period = 'week'
          ORDER BY period_end DESC, created_at DESC LIMIT 1`,
    args: [userId],
  });
  const row = result.rows[0];
  if (!row) return null;
  return {
    id: Number(row.id),
    period_start: String(row.period_start),
    period_end: String(row.period_end),
    content: String(row.content),
    created_at: String(row.created_at),
  };
}
