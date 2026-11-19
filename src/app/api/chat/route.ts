import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import {
  cleanTransactionDescription,
  findChatTransactionDate,
  parseSimpleChatTransaction,
} from '@/lib/chat-transaction-text';
import { UNCLASSIFIED_EXPENSE } from '@/lib/schema';
import { getBudgetAlert } from '@/lib/budget-alert';
import { findChatTransactions, saveChatTransactions } from '@/lib/expense-chat';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import {
  analyzeTransactions,
  correctPendingTransactions,
  parseDebtPayment,
  parseTransactionsText,
  type ParsedTransaction,
  type PendingTransactionForCorrection,
} from '@/lib/gemini';
import { getCurrentUser } from '@/lib/current-user';
import { getVietnamToday } from '@/lib/utils';

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
    const messageInput = formData.get('message');
    const message = typeof messageInput === 'string' ? messageInput.trim() : '';
    const type = formData.get('type') || 'expense';
    const requestId = formData.get('client_request_id');

    const db = await getDb();

    if (type === 'expense') {
      if (requestId !== null && (typeof requestId !== 'string' || !/^[a-z0-9_-]{8,80}$/i.test(requestId))) {
        return NextResponse.json({ error: 'Mã yêu cầu không hợp lệ.' }, { status: 400 });
      }
      if (requestId) {
        const saved = await findChatTransactions(db, user.id, requestId);
        if (saved) return NextResponse.json({ saved: true, transactions: saved });
        if (!message.trim() && !images.length) {
          return NextResponse.json({ error: 'Hãy nhập giao dịch hoặc gửi ảnh biên lai.' }, { status: 400 });
        }
        if (!images.length && /^(?:sửa|đổi|chỉnh(?: sửa)?|cập nhật|xo[áảa])\s+(?:lại\s+)?(?:giao dịch|khoản (?:chi|thu|vừa)|số tiền|danh mục|ngày giao dịch)(?=\s|$)/iu.test(message.trim())) {
          return NextResponse.json({ error: 'Dùng nút Sửa trên giao dịch đã lưu để cập nhật.' }, { status: 422 });
        }
      }

      // Older clients still submit parsed transactions separately.
      const correctionContext = requestId ? [] : parseCorrectionContext(formData.get('correction_context'));
      const [categoriesResult, budgetCategoriesResult, historyResult] = await db.batch([
        {
          sql: 'SELECT id, name, color FROM categories WHERE user_id IS NULL OR user_id = ?',
          args: [user.id],
        },
        {
          sql: `SELECT DISTINCT c.id, c.name, c.color
                FROM budget_jars b
                JOIN categories c ON c.id = b.category_id
                WHERE b.user_id = ? AND (c.user_id IS NULL OR c.user_id = b.user_id)
                ORDER BY c.name COLLATE NOCASE ASC`,
          args: [user.id],
        },
        {
          sql: `SELECT e.description, e.note, e.type, c.name AS category_name
                FROM expenses e
                LEFT JOIN categories c ON c.id = e.category_id
                WHERE e.user_id = ?
                ORDER BY e.expense_date DESC, e.created_at DESC
                LIMIT 50`,
          args: [user.id],
        },
      ], 'read');
      const categories = categoriesResult.rows.map((row) => ({
        id: String(row.id),
        name: String(row.name),
        color: String(row.color),
      }));
      const budgetCategories = budgetCategoriesResult.rows.map((row) => String(row.name));
      const expenseCategories = categories.filter((category) => category.name !== 'Thu nhập');
      const unclassifiedExpense = expenseCategories.find((category) => category.name === UNCLASSIFIED_EXPENSE);
      const defaultIncome = categories.find((category) => category.name === 'Thu nhập');
      const seenHistoryKeys = new Set<string>();
      const historyLines: string[] = [];
      for (const row of historyResult.rows) {
        const typeStr = String(row.type);
        const descStr = String(row.description).trim();
        const key = `${typeStr}:${descStr.toLocaleLowerCase('vi')}`;
        if (!descStr || seenHistoryKeys.has(key)) continue;
        seenHistoryKeys.add(key);
        historyLines.push(
          `- [${typeStr}] ${descStr} | note: ${String(row.note || '')} => ${String(row.category_name || 'Khác')}`,
        );
        if (historyLines.length >= 25) break;
      }
      const historyContext = historyLines.join('\n');
      const categoryPolicy = {
        expenseCategories: expenseCategories.map((category) => category.name),
        preferredExpenseCategories: budgetCategories,
        unclassifiedExpense: UNCLASSIFIED_EXPENSE,
        incomeCategories: categories.map((category) => category.name),
      };

      const isCorrection = !images.length && correctionContext.length > 0;
      const today = getVietnamToday();
      const isNewText = !images.length && !isCorrection;
      const dateMention = isNewText ? findChatTransactionDate(message, today) : undefined;
      if (dateMention?.date === null) {
        return NextResponse.json({ error: 'Ngày giao dịch không hợp lệ. Kiểm tra lại ngày/tháng.' }, { status: 422 });
      }
      const simpleInput = isNewText ? parseSimpleChatTransaction(message, today) : null;
      // Safe fallback for common brief meal entries when the model returns no usable transaction.
      const mealFallback: ParsedTransaction[] = simpleInput
        && /^(?:ăn sáng|ăn trưa|ăn tối|cà phê|mua cà phê|uống cà phê)(?=\s|$)/iu.test(simpleInput.description)
        && !/\b(?:bao nhiêu|có nên|hay|khoảng|tầm)\b/iu.test(simpleInput.description)
        ? [{ ...simpleInput, category: 'Ăn uống', type: 'expense', merchant: '' }]
        : [];
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
          ).catch((error: unknown) => {
            if (!mealFallback.length) throw error;
            console.warn('[chat] AI text parsing failed, using explicit meal fields');
            return mealFallback;
          });

      const parsed = parsedTransactions.length ? parsedTransactions : mealFallback;
      if (!parsed.length) {
        return NextResponse.json(
          { error: 'Không thể xác định giao dịch. Vui lòng thử lại.' },
          { status: 400 },
        );
      }

      if (isCorrection && parsed.length !== correctionContext.length) {
        return NextResponse.json(
          { error: 'Không thể áp dụng chỉnh sửa cho các giao dịch chờ lưu.' },
          { status: 422 },
        );
      }

      const invalidTransactions: string[] = [];
      const transactions = parsed.flatMap((transaction) => {
        const explicit = parsed.length === 1 ? simpleInput : null;
        const amount = explicit?.amount ?? transaction.amount;
        const description = cleanTransactionDescription(
          explicit?.description ?? transaction.description, amount, today,
        ) || (parsed.length === 1 ? cleanTransactionDescription(message, amount, today) : '')
          || (transaction.type === 'income' ? 'Thu nhập' : 'Chi tiêu');
        const normalizedCategory = transaction.category
          .trim()
          .toLocaleLowerCase('vi');
        const allowedCategories = transaction.type === 'expense'
          ? expenseCategories
          : categories;
        const selectedCategory =
          allowedCategories.find(
            (row) =>
              row.name.trim().toLocaleLowerCase('vi') ===
              normalizedCategory,
          ) ?? (transaction.type === 'expense' ? unclassifiedExpense : defaultIncome);

        if (!selectedCategory || !Number.isSafeInteger(amount) || amount <= 0) {
          invalidTransactions.push(transaction.description || transaction.category || 'Giao dịch chưa xác định');
          return [];
        }

        const merchant = cleanTransactionDescription(transaction.merchant, amount, today);
        const supplementalNote = cleanTransactionDescription(
          (transaction.note ?? '').replace(/^nội dung:\s*/iu, ''), amount, today,
        );
        const note = [
          merchant && merchant.toLocaleLowerCase('vi') !== description.toLocaleLowerCase('vi')
            ? `Đối tác: ${merchant}`
            : '',
          supplementalNote.toLocaleLowerCase('vi') !== description.toLocaleLowerCase('vi') ? supplementalNote : '',
        ].filter(Boolean).join(' · ');

        return [{
          amount,
          description: description.slice(0, 160),
          note: note.slice(0, 500),
          category_id: selectedCategory.id,
          category_name: selectedCategory.name,
          category_color: selectedCategory.color,
          expense_date: explicit?.date ?? transaction.date,
          merchant: transaction.merchant,
          type: transaction.type,
          category_source: transaction.type === 'income' ? 'income_category'
            : budgetCategories.includes(selectedCategory.name) ? 'budget_jar' : 'expense_category',
        }];
      });

      if (invalidTransactions.length || !transactions.length) {
        return NextResponse.json(
          { error: `Không thể xác định số tiền hoặc danh mục hợp lệ cho: ${invalidTransactions.join(', ')}.` },
          { status: 422 },
        );
      }

      if (!requestId) return NextResponse.json({ transactions, correction: isCorrection });

      const { ledgerId, defaultAccountId } = await ensureUserLedgerAndAccount(db, user.id);
      const saved = await saveChatTransactions(db, user.id, requestId, transactions, {
        ledgerId,
        accountId: defaultAccountId,
      });
      const expenseGroups = new Map<string, { categoryId: string; expenseDate: string; addedAmount: number }>();
      if (saved.inserted) {
        for (const transaction of transactions) {
          if (transaction.type !== 'expense') continue;
          const key = `${transaction.category_id}:${transaction.expense_date.slice(0, 7)}`;
          const group = expenseGroups.get(key);
          if (group) group.addedAmount += transaction.amount;
          else expenseGroups.set(key, {
            categoryId: transaction.category_id,
            expenseDate: transaction.expense_date,
            addedAmount: transaction.amount,
          });
        }
      }
      const alerts = await Promise.allSettled([...expenseGroups.values()].map((group) =>
        getBudgetAlert({ db, userId: user.id, ...group }),
      ));
      const budgetAlerts = alerts.flatMap((alert) => alert.status === 'fulfilled' && alert.value ? [alert.value] : []);
      return NextResponse.json({ saved: true, transactions: saved.transactions, budgetAlerts }, { status: saved.inserted ? 201 : 200 });
      
    } else if (type === 'debt') {
      const debtsResult = await db.execute({
        sql: 'SELECT id, name FROM debts WHERE user_id = ?',
        args: [user.id],
      });
      const debts = debtsResult.rows;
      const debtNames = debts.map(d => d.name as string);

      const parsed = await parseDebtPayment(message, debtNames, user.id);
      if (!parsed.debt_name || !Number.isFinite(parsed.amount) || parsed.amount <= 0) {
        return NextResponse.json({ error: 'Không nhận diện được khoản nợ hoặc số tiền trả. Vui lòng nhập rõ khoản nợ và số tiền.' }, { status: 422 });
      }
      
      const matchedDebt = debts.find(d => {
         const name = d.name as string;
         return name.toLowerCase().includes(parsed.debt_name.toLowerCase());
      });
      const debt_id = matchedDebt?.id;

      if (!debt_id) {
        return NextResponse.json({ error: 'Debt not found' }, { status: 404 });
      }

      const today = getVietnamToday();
      
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
    return NextResponse.json({ error: 'Không thể xử lý giao dịch. Vui lòng thử lại.' }, { status: 500 });
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
