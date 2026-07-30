import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  analyzeTransactions,
  correctPendingTransactions,
  parseDebtPayment,
  parseTransactionsText,
  type PendingTransactionForCorrection,
} from '@/lib/gemini';
import { getCurrentUser } from '@/lib/current-user';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const images = formData
      .getAll('images')
      .concat(formData.getAll('image'))
      .filter((item): item is File => item instanceof File && item.size > 0);
    const message = (formData.get('message') as string) || '';
    const type = (formData.get('type') as string) || 'expense';
    const correctionContext = parseCorrectionContext(formData.get('correction_context'));

    const db = await getDb();

    if (type === 'expense') {
      const categoriesResult = await db.execute({
        sql: 'SELECT id, name, color FROM categories WHERE user_id IS NULL OR user_id = ?',
        args: [user.id],
      });
      const budgetCategoriesResult = await db.execute({
        sql: `SELECT DISTINCT c.id, c.name, c.color
              FROM budget_jars b
              JOIN categories c ON c.id = b.category_id
              WHERE b.user_id = ?
              ORDER BY c.name COLLATE NOCASE ASC`,
        args: [user.id],
      });
      const categories = categoriesResult.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        color: String(row.color),
      }));
      const budgetCategories = budgetCategoriesResult.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        color: String(row.color),
      }));
      const historyResult = await db.execute({
        sql: `SELECT e.description, e.note, e.type, c.name AS category_name
              FROM expenses e
              LEFT JOIN categories c ON c.id = e.category_id
              WHERE e.user_id = ?
              ORDER BY e.expense_date DESC, e.created_at DESC
              LIMIT 120`,
        args: [user.id],
      });
      const historyContext = historyResult.rows
        .map(
          (row) =>
            `- [${String(row.type)}] ${String(row.description)} | note: ${String(row.note || '')} => ${String(row.category_name || 'Khác')}`,
        )
        .join('\n');
      const categoryPolicy = {
        expenseCategories: budgetCategories.map((category) => category.name),
        incomeCategories: categories.map((category) => category.name),
      };

      const isCorrection = !images.length && correctionContext.length > 0;
      const parsedTransactions = isCorrection
        ? await correctPendingTransactions(
            message,
            correctionContext,
            categoryPolicy,
            historyContext,
            user.id,
          )
        : images.length
        ? await analyzeTransactions(
            await Promise.all(
              images.map(async (image) => ({
                base64Data: Buffer.from(await image.arrayBuffer()).toString(
                  'base64',
                ),
                mimeType: image.type,
              })),
            ),
            message,
            categoryPolicy,
            historyContext,
            user.id,
          )
        : await parseTransactionsText(
            message,
            categoryPolicy,
            historyContext,
            user.id,
          );

      if (!parsedTransactions.length) {
        return NextResponse.json(
          { error: 'Không thể xác định giao dịch. Vui lòng thử lại.' },
          { status: 400 },
        );
      }

      if (isCorrection && parsedTransactions.length !== correctionContext.length) {
        return NextResponse.json(
          { error: 'Không thể áp dụng chỉnh sửa cho các giao dịch chờ lưu.' },
          { status: 422 },
        );
      }

      const invalidTransactions: string[] = [];
      const transactions = parsedTransactions.flatMap((transaction) => {
        const normalizedCategory = transaction.category
          .trim()
          .toLocaleLowerCase('vi');
        const allowedCategories = transaction.type === 'expense'
          ? budgetCategories
          : categories;
        const selectedCategory =
          allowedCategories.find(
            (row) =>
              row.name.trim().toLocaleLowerCase('vi') ===
              normalizedCategory,
          );

        if (!selectedCategory) {
          invalidTransactions.push(transaction.description || transaction.category || 'Giao dịch chưa xác định');
          return [];
        }

        const note = [
          transaction.merchant ? `Đối tác: ${transaction.merchant}` : '',
          message ? `Nội dung: ${message}` : '',
          'Ghi bằng AI',
        ].filter(Boolean).join(' · ');

        return [{
          amount: transaction.amount,
          description:
            transaction.description ||
            message ||
            (transaction.type === 'income' ? 'Thu nhập' : 'Chi tiêu'),
          note,
          category_id: selectedCategory.id,
          category_name: selectedCategory.name,
          category_color: selectedCategory.color,
          expense_date: transaction.date,
          merchant: transaction.merchant,
          type: transaction.type,
          category_source: transaction.type === 'expense' ? 'budget_jar' : 'income_category',
        }];
      });

      if (invalidTransactions.length || !transactions.length) {
        const missingBudgetHint = !budgetCategories.length
          ? ' Bạn chưa có hũ chi tiêu để ghi khoản chi.'
          : '';
        return NextResponse.json(
          { error: `Không thể khớp danh mục hợp lệ cho: ${invalidTransactions.join(', ')}.${missingBudgetHint}` },
          { status: 422 },
        );
      }

      return NextResponse.json({ transactions, correction: isCorrection });
      
    } else if (type === 'debt') {
      const debtsResult = await db.execute({
        sql: 'SELECT id, name FROM debts WHERE user_id = ?',
        args: [user.id],
      });
      const debts = debtsResult.rows;
      const debtNames = debts.map(d => d.name as string);

      const parsed = await parseDebtPayment(message, debtNames, user.id);
      
      const matchedDebt = debts.find(d => {
         const name = d.name as string;
         return name.toLowerCase().includes(parsed.debt_name.toLowerCase());
      });
      const debt_id = matchedDebt?.id;

      if (!debt_id) {
        return NextResponse.json({ error: 'Debt not found' }, { status: 404 });
      }

      const today = new Date().toISOString().split('T')[0];
      
      await db.execute({
        sql: 'INSERT INTO debt_payments (user_id, debt_id, amount, payment_date, note) VALUES (?, ?, ?, ?, ?)',
        args: [user.id, debt_id, parsed.amount, today, 'Created via AI chat']
      });
        
      const debtInfoResult = await db.execute({
        sql: 'SELECT total_amount FROM debts WHERE id = ? AND user_id = ?',
        args: [debt_id, user.id]
      });
      const debtInfo = debtInfoResult.rows[0];
      
      const totalPaidResult = await db.execute({
        sql: 'SELECT SUM(amount) as sum FROM debt_payments WHERE debt_id = ? AND user_id = ?',
        args: [debt_id, user.id]
      });
      const totalPaid = totalPaidResult.rows[0];
      
      if (Number(totalPaid.sum) >= Number(debtInfo.total_amount)) {
        await db.execute({
          sql: "UPDATE debts SET status = 'completed' WHERE id = ? AND user_id = ?",
          args: [debt_id, user.id]
        });
      }

      return NextResponse.json({ success: true, amount: parsed.amount, debt_id }, { status: 201 });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to process chat' }, { status: 500 });
  }
}

function parseCorrectionContext(value: FormDataEntryValue | null): PendingTransactionForCorrection[] {
  if (typeof value !== 'string') return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((item): PendingTransactionForCorrection[] => {
      if (!item || typeof item !== 'object') return [];
      const transaction = item as Record<string, unknown>;
      const amount = Number(transaction.amount);
      const type = transaction.type === 'income' ? 'income' : 'expense';
      const description = typeof transaction.description === 'string' ? transaction.description : '';
      const category = typeof transaction.category === 'string' ? transaction.category : '';
      const date = typeof transaction.date === 'string' ? transaction.date : '';

      if (!Number.isFinite(amount) || amount <= 0 || !description || !category || !date) return [];
      return [{
        amount,
        description,
        category,
        merchant: typeof transaction.merchant === 'string' ? transaction.merchant : '',
        date,
        type,
      }];
    });
  } catch {
    return [];
  }
}
