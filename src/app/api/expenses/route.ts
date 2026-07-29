import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

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
    const finalDate = expense_date || date || new Date().toISOString().split('T')[0];
    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !description ||
      !category_id ||
      !['income', 'expense'].includes(type)
    ) {
      return NextResponse.json(
        { error: 'Invalid transaction data' },
        { status: 400 },
      );
    }
    
    const db = await getDb();
    const info = await db.execute({
      sql: `
        INSERT INTO expenses (user_id, amount, description, note, category_id, expense_date, type) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [user.id, numericAmount, description, note || '', category_id, finalDate, type]
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
    
    return NextResponse.json(newExpense.rows[0], { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
