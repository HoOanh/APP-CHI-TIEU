import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { analyzeExpenseImage, parseExpenseText, parseDebtPayment } from '@/lib/gemini';
import { getCurrentUser } from '@/lib/current-user';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const image = formData.get('image') as File | null;
    const message = (formData.get('message') as string) || '';
    const type = (formData.get('type') as string) || 'expense';

    const db = await getDb();

    if (type === 'expense') {
      let transactionType: 'income' | 'expense' = 'expense';
      let amount = 0;
      let description = '';
      let category = '';
      let merchant = '';
      let expenseDate = new Date().toISOString().split('T')[0];

      if (image) {
        const bytes = await image.arrayBuffer();
        const base64 = Buffer.from(bytes).toString('base64');
        const parsed = await analyzeExpenseImage(base64, image.type, message, user.id);
        amount = parsed.amount;
        description = parsed.description;
        category = parsed.category;
        merchant = parsed.merchant;
        expenseDate = parsed.date;
        transactionType = parsed.type;
      } else {
        const parsed = await parseExpenseText(message, user.id);
        amount = parsed.amount;
        description = parsed.description;
        category = parsed.category;
        transactionType = parsed.type;
      }

      if (amount <= 0) {
        return NextResponse.json({ error: 'Không thể xác định số tiền. Vui lòng thử lại.' }, { status: 400 });
      }

      const categoriesResult = await db.execute({
        sql: 'SELECT id, name FROM categories WHERE user_id IS NULL OR user_id = ?',
        args: [user.id],
      });
      const categories = categoriesResult.rows;
      
      let category_id = categories[0]?.id as number | string | null | undefined; 
      
      for (const c of categories) {
        const cName = c.name as string;
        if (category && cName.toLowerCase().includes(category.toLowerCase())) {
          category_id = c.id as number | string;
          break;
        }
      }

      description = description || message || (transactionType === 'income' ? 'Thu nhập' : 'Chi tiêu');

      const selectedCategory = categories.find((item) => item.id === category_id);

      return NextResponse.json({
        amount,
        description,
        note: merchant ? `${merchant} - via AI` : 'Created via AI chat',
        category_id,
        category_name: selectedCategory?.name ?? '',
        expense_date: expenseDate,
        merchant,
        type: transactionType,
      });
      
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
