import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getBudgetAlert } from '@/lib/budget-alert';
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
      const [year, value] = month.split('-').map(Number);
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
      const end = value === 12 ? `${String(year + 1).padStart(4, '0')}-01` : `${month.slice(0, 4)}-${String(value + 1).padStart(2, '0')}`;
      query += ' AND e.expense_date >= ? AND e.expense_date < ?';
      params.push(`${month}-01`, `${end}-01`);
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

    const { amount, description, note, category_id, expense_date, date, type = 'expense', client_request_id } = await request.json();
    const finalDate = expense_date || date || getVietnamToday();
    const numericAmount = Number(amount);
    const normalizedDescription = typeof description === 'string' ? description.trim() : '';
    const normalizedCategoryId = Number(category_id);
    const normalizedType = type === 'income' ? 'income' : 'expense';
    const clientRequestId = typeof client_request_id === 'string'
      && /^[A-Za-z0-9_-]{8,120}$/.test(client_request_id)
      ? client_request_id
      : null;

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
    const insertResult = await db.execute({
      sql: `
        INSERT INTO expenses
          (user_id, amount, description, note, category_id, expense_date, type, client_request_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
      `,
      args: [user.id, numericAmount, normalizedDescription, typeof note === 'string' ? note.trim() : '', normalizedCategoryId, finalDate, normalizedType, clientRequestId]
    });

    const wasInserted = Number(insertResult.rowsAffected) > 0;
    
    const newExpense = await db.execute({
      sql: `
        SELECT e.id, e.amount, e.description, e.note, e.category_id, e.expense_date, e.type, e.created_at, c.name as category_name, c.icon as category_icon, c.color as category_color 
        FROM expenses e 
        LEFT JOIN categories c ON e.category_id = c.id 
        WHERE e.user_id = ? AND ${clientRequestId ? 'e.client_request_id = ?' : 'e.id = ?'}
      `,
      args: clientRequestId
        ? [user.id, clientRequestId]
        : [user.id, insertResult.lastInsertRowid!]
    });

    if (!newExpense.rows[0]) {
      return NextResponse.json({ error: 'Không thể xác nhận giao dịch đã lưu.' }, { status: 500 });
    }

    const budgetAlert = wasInserted && normalizedType === 'expense'
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
    }, { status: wasInserted ? 201 : 200 });
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
