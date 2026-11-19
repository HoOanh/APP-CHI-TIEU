import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';

function csvCell(value: unknown): string {
  const str = String(value ?? '');
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const format = request.nextUrl.searchParams.get('format') === 'csv' ? 'csv' : 'json';
    const month = request.nextUrl.searchParams.get('month');
    const type = request.nextUrl.searchParams.get('type');
    const accountId = request.nextUrl.searchParams.get('account_id');
    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
    const dateStamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const conditions = ['(e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?))'];
      const args: Array<string | number> = [ledgerId, user.id];

      if (month && /^\d{4}-\d{2}$/.test(month)) {
        conditions.push("strftime('%Y-%m', e.expense_date) = ?");
        args.push(month);
      }
      if (type && ['expense', 'income', 'transfer'].includes(type)) {
        conditions.push('e.type = ?');
        args.push(type);
      }
      if (accountId && /^\d+$/.test(accountId)) {
        conditions.push('(e.account_id = ? OR e.to_account_id = ?)');
        args.push(Number(accountId), Number(accountId));
      }

      const res = await db.execute({
        sql: `SELECT e.expense_date, e.type, e.amount, e.description, e.note, e.source,
                     c.name AS category_name,
                     a1.name AS account_name,
                     a2.name AS to_account_name
              FROM expenses e
              LEFT JOIN categories c ON c.id = e.category_id
              LEFT JOIN accounts a1 ON a1.id = e.account_id
              LEFT JOIN accounts a2 ON a2.id = e.to_account_id
              WHERE ${conditions.join(' AND ')}
              ORDER BY e.expense_date DESC, e.id DESC`,
        args,
      });

      const header = ['Ngày', 'Loại', 'Ví', 'Ví đích', 'Danh mục', 'Mô tả', 'Ghi chú', 'Số tiền', 'Nguồn'];
      const rows = res.rows.map((row) => {
        const typeLabel = row.type === 'income' ? 'Thu nhập' : row.type === 'transfer' ? 'Chuyển ví' : 'Chi tiêu';
        return [
          csvCell(row.expense_date),
          csvCell(typeLabel),
          csvCell(row.account_name || 'Ví chính'),
          csvCell(row.to_account_name || ''),
          csvCell(row.category_name || (row.type === 'transfer' ? 'Chuyển ví' : 'Khác')),
          csvCell(row.description),
          csvCell(row.note),
          csvCell(row.amount),
          csvCell(row.source || 'web'),
        ].join(',');
      });

      const csvBody = `\uFEFF${[header.join(','), ...rows].join('\r\n')}`;
      return new NextResponse(csvBody, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="chi-tieu-export-${dateStamp}.csv"`,
        },
      });
    }

    const [expenses, budgets, debts, debtJars, debtPayments, categories, accounts, merchantRules, recurringRules] =
      await Promise.all([
        db.execute({
          sql: 'SELECT * FROM expenses WHERE user_id = ? ORDER BY expense_date DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM budget_jars WHERE user_id = ? ORDER BY month DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM debts WHERE user_id = ? ORDER BY created_at DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM debt_jars WHERE user_id = ? ORDER BY month DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM debt_payments WHERE user_id = ? ORDER BY payment_date DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM categories WHERE user_id IS NULL OR user_id = ? ORDER BY name',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM accounts WHERE ledger_id = ? ORDER BY is_default DESC, id ASC',
          args: [ledgerId],
        }),
        db.execute({
          sql: 'SELECT * FROM merchant_rules WHERE user_id = ? ORDER BY hit_count DESC',
          args: [user.id],
        }),
        db.execute({
          sql: 'SELECT * FROM recurring_rules WHERE user_id = ? ORDER BY id ASC',
          args: [user.id],
        }),
      ]);

    const payload = {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      account: {
        email: user.email,
        name: user.name,
      },
      accounts: accounts.rows,
      expenses: expenses.rows,
      budgets: budgets.rows,
      debts: debts.rows,
      debtJars: debtJars.rows,
      debtPayments: debtPayments.rows,
      categories: categories.rows,
      merchantRules: merchantRules.rows,
      recurringRules: recurringRules.rows,
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="chi-tieu-export-${dateStamp}.json"`,
      },
    });
  } catch (error) {
    console.error('[GET /api/export]', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
