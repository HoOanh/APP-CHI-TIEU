import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';

interface BudgetImportItem {
  category?: string;
  category_id?: string | number;
  month?: string;
  budget_amount?: number;
  budget_basis?: 'monthly' | 'daily';
  daily_amount?: number;
  budget_days?: number;
  warning_percent?: number;
  daily_limit?: number;
  frequency_limit?: number;
  frequency_period?: 'day' | 'week' | 'month' | '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();
    const rawItems = Array.isArray(body)
      ? body
      : isRecord(body) && Array.isArray(body.budgets)
        ? body.budgets
        : null;
    const defaultMonth =
      isRecord(body) && typeof body.month === 'string' ? body.month : undefined;

    if (!rawItems || rawItems.length === 0 || rawItems.length > 200) {
      return NextResponse.json(
        { error: 'JSON phải chứa từ 1 đến 200 ngân sách.' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const categoriesResult = await db.execute({
      sql: `SELECT id, name FROM categories
            WHERE user_id IS NULL OR user_id = ?`,
      args: [user.id],
    });
    const categories = categoriesResult.rows;
    const errors: string[] = [];
    const validItems: Array<Required<Pick<BudgetImportItem, 'category_id' | 'month' | 'budget_amount'>> & BudgetImportItem> = [];

    rawItems.forEach((rawItem, index) => {
      if (!isRecord(rawItem)) {
        errors.push(`Dòng ${index + 1}: dữ liệu không hợp lệ.`);
        return;
      }
      const item = rawItem as BudgetImportItem;
      const month = item.month || defaultMonth || '';
      const basis = item.budget_basis === 'daily' ? 'daily' : 'monthly';
      const dailyAmount = Number(item.daily_amount);
      const days = Number(item.budget_days);
      const amount = basis === 'daily' ? dailyAmount * days : Number(item.budget_amount);
      const category = categories.find((row) => {
        if (item.category_id !== undefined) {
          return String(row.id) === String(item.category_id);
        }
        return (
          String(row.name).trim().toLocaleLowerCase('vi') ===
          String(item.category || '').trim().toLocaleLowerCase('vi')
        );
      });

      if (!category) {
        errors.push(`Dòng ${index + 1}: không tìm thấy danh mục.`);
      } else if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        errors.push(`Dòng ${index + 1}: month phải có dạng YYYY-MM.`);
      } else if (!Number.isFinite(amount) || amount <= 0 || (basis === 'daily' && (!Number.isInteger(days) || days < 1 || days > getDaysInMonth(month)))) {
        errors.push(`Dòng ${index + 1}: budget_amount phải lớn hơn 0.`);
      } else {
        validItems.push({
          ...item,
          category_id: String(category.id),
          month,
          budget_amount: amount,
          budget_basis: basis,
          daily_amount: basis === 'daily' ? dailyAmount : 0,
          budget_days: basis === 'daily' ? days : 0,
        });
      }
    });

    if (errors.length) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 });
    }

    await db.batch(
      validItems.map((item) => ({
        sql: `INSERT INTO budget_jars (
                user_id, category_id, month, budget_amount, budget_basis, daily_amount, budget_days, warning_percent,
                daily_limit, frequency_limit, frequency_period
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, category_id, month) DO UPDATE SET
                budget_amount = excluded.budget_amount,
                budget_basis = excluded.budget_basis,
                daily_amount = excluded.daily_amount,
                budget_days = excluded.budget_days,
                warning_percent = excluded.warning_percent,
                daily_limit = excluded.daily_limit,
                frequency_limit = excluded.frequency_limit,
                frequency_period = excluded.frequency_period`,
        args: [
          user.id,
          item.category_id,
          item.month,
          item.budget_amount,
          item.budget_basis || 'monthly',
          item.daily_amount || 0,
          item.budget_days || 0,
          Math.min(100, Math.max(1, Number(item.warning_percent) || 80)),
          Math.max(0, Number(item.daily_limit) || 0),
          Math.max(0, Number(item.frequency_limit) || 0),
          item.frequency_period || '',
        ],
      })),
      'write',
    );

    return NextResponse.json({ imported: validItems.length });
  } catch (error) {
    console.error('[budget-import]', error);
    return NextResponse.json(
      { error: 'JSON không hợp lệ hoặc không thể import.' },
      { status: 400 },
    );
  }
}

function getDaysInMonth(month: string) {
  const match = month.match(/^(\d{4})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]), 0).getDate() : 0;
}
