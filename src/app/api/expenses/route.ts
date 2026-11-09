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

    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get('month');
    const category_id = searchParams.get('category_id');
    const search = searchParams.get('search');

    let query = `
      SELECT e.id, e.amount, e.description, e.note, e.category_id, e.expense_date, e.type, e.created_at, c.name as category_name, c.icon as category_icon, c.color as category_color 
      FROM expenses e 
      LEFT JOIN categories c ON e.category_id = c.id 
      WHERE e.user_id = ?
    `;
    const params: (string | number)[] = [user.id];

    if (month) {
      query += ` AND strftime('%Y-%m', e.expense_date) = ?`;
      params.push(month);
    }
    if (category_id) {
      query += ` AND e.category_id = ?`;
      params.push(category_id);
    }
    if (search) {
      query += ` AND (e.description LIKE ? OR e.note LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY e.expense_date DESC, e.created_at DESC`;

    const db = await getDb();
    const result = await db.execute({
      sql: query,
      args: params
    });
    
    const expenses = result.rows;
    // Calculate total income, expense, and net total
    const totalIncome = expenses.reduce((sum, exp) => sum + (exp.type === 'income' ? Number(exp.amount || 0) : 0), 0);
    const totalExpense = expenses.reduce((sum, exp) => sum + (exp.type === 'expense' ? Number(exp.amount || 0) : 0), 0);
    const total = totalIncome - totalExpense;

    return NextResponse.json({ items: expenses, total, totalIncome, totalExpense });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { amount, description, note, category_id, expense_date, date, type = 'expense' } = await request.json();
    const finalDate = expense_date || date || getVietnamToday();
    const numericAmount = Number(amount);
    const normalizedDescription = typeof description === 'string' ? description.trim() : '';
    const normalizedCategoryId = Number(category_id);
    const normalizedType = type === 'income' ? 'income' : 'expense';

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !normalizedDescription ||
      !Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0 ||
      !['income', 'expense'].includes(type) ||
      !isValidDate(finalDate)
    ) {
      return NextResponse.json(
        { error: 'Invalid transaction data' },
        { status: 400 },
      );
    }
    
    const db = await getDb();
    const categoryResult = await db.execute({
      sql: 'SELECT id, name FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
      args: [normalizedCategoryId, user.id],
    });
    const category = categoryResult.rows[0];
    if (!category) {
      return NextResponse.json({ error: 'Danh mục không hợp lệ.' }, { status: 400 });
    }
    const info = await db.execute({
      sql: `
        INSERT INTO expenses (user_id, amount, description, note, category_id, expense_date, type) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [user.id, numericAmount, normalizedDescription, typeof note === 'string' ? note.trim() : '', normalizedCategoryId, finalDate, normalizedType]
    });
    
    const newExpense = await db.execute({
      sql: `
        SELECT e.id, e.amount, e.description, e.note, e.category_id, e.expense_date, e.type, e.created_at, c.name as category_name, c.icon as category_icon, c.color as category_color 
        FROM expenses e 
        LEFT JOIN categories c ON e.category_id = c.id 
        WHERE e.id = ? AND e.user_id = ?
      `,
      args: [info.lastInsertRowid!, user.id]
    });

    const budgetAlert = normalizedType === 'expense'
      ? await getBudgetAlert({
        db,
        userId: user.id,
        categoryId: normalizedCategoryId,
        expenseDate: finalDate,
        addedAmount: numericAmount,
      })
      : null;
    
    return NextResponse.json({
      ...newExpense.rows[0],
      budgetAlert,
    }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

type Database = Awaited<ReturnType<typeof getDb>>;

interface BudgetAlert {
  title: string;
  message: string;
  severity: 'warning' | 'danger';
}

async function getBudgetAlert({
  db,
  userId,
  categoryId,
  expenseDate,
  addedAmount,
}: {
  db: Database;
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
