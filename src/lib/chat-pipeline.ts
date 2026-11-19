import type { Client } from '@libsql/client';
import { getBudgetAlert } from './budget-alert';
import {
  cleanTransactionDescription,
  findChatTransactionDate,
  parseSimpleChatTransaction,
} from './chat-transaction-text';
import { recordDebtPaymentWithSync } from './debt-payments-sync';
import { findChatTransactions, saveChatTransactions } from './expense-chat';
import {
  normalizeMerchantKeyword,
  parseFastPathTransaction,
  parseFastPathTransfer,
  type FastPathAccount,
  type FastPathMerchantRule,
} from './fast-path-parser';
import { answerFinancialQuestion, isFinancialQuestion, type FinancialQaMetric } from './financial-qa';
import {
  AiRateLimitError,
  analyzeTransactions,
  correctPendingTransactions,
  parseDebtPayment,
  parseTransactionsText,
  type ParsedTransaction,
  type PendingTransactionForCorrection,
} from './gemini';
import { assertLedgerAccess, LedgerAccessError, notifyOtherLedgerMembers } from './ledger-access';
import { ensureUserLedgerAndAccount } from './ledger-context';
import { UNCLASSIFIED_EXPENSE } from './schema';
import { formatCurrency, getVietnamToday } from './utils';
import { sendPushToUser } from './web-push';

export const MAX_CHAT_IMAGES = 6;
export const MAX_CHAT_IMAGE_BYTES = 5 * 1024 * 1024;

export interface ChatImagePayload {
  base64Data: string;
  mimeType: string;
  size: number;
}

export interface ChatPipelineInput {
  db: Client;
  userId: number;
  userName?: string;
  message: string;
  images: ChatImagePayload[];
  mode?: 'auto' | 'expense' | 'debt';
  accountId?: number | null;
  requestId?: string | null;
  correctionContext?: PendingTransactionForCorrection[];
  source?: 'chat' | 'voice' | 'shortcut';
}

export interface ChatPipelineOutput {
  status: number;
  body: {
    saved?: boolean;
    intent?: 'expense' | 'income' | 'transfer' | 'debt' | 'question';
    fast_path?: boolean;
    message?: string;
    answer?: string;
    qaMetrics?: FinancialQaMetric[];
    transactions?: unknown[];
    budgetAlerts?: unknown[];
    receiptData?: {
      debt_id: number;
      debt_name: string;
      creditor: string;
      direction: 'payable' | 'receivable';
      amount: number;
      paid_amount: number;
      remaining: number;
      status: 'active' | 'completed';
      account_name: string | null;
    };
    correction?: boolean;
    error?: string;
  };
  headers?: Record<string, string>;
}

const DEBT_INTENT_PATTERN = /(?<![\p{L}\p{N}])(?:trả nợ|thu nợ|góp nợ|thanh toán nợ|đóng tiền nợ|trả góp)(?![\p{L}\p{N}])/iu;

export async function processChatSubmission(input: ChatPipelineInput): Promise<ChatPipelineOutput> {
  const {
    db,
    userId,
    message,
    images,
    mode = 'auto',
    requestId = null,
    correctionContext = [],
    source = 'chat',
  } = input;

  if (images.length > MAX_CHAT_IMAGES) {
    return {
      status: 413,
      body: { error: `Tối đa ${MAX_CHAT_IMAGES} ảnh mỗi lần gửi.` },
    };
  }
  if (images.some((img) => img.size > MAX_CHAT_IMAGE_BYTES)) {
    return {
      status: 413,
      body: { error: 'Mỗi ảnh không được vượt quá 5MB.' },
    };
  }

  try {
    const ctx = await ensureUserLedgerAndAccount(db, userId);
    const grant = await assertLedgerAccess(db, userId, ctx.ledgerId, 'viewer');
    const getActorName = async () => {
      if (input.userName) return input.userName;
      const uRes = await db.execute({ sql: 'SELECT name FROM users WHERE id = ? LIMIT 1', args: [userId] });
      return String(uRes.rows[0]?.name || 'Thành viên');
    };

    if (requestId) {
      if (!/^[a-z0-9_-]{8,80}$/i.test(requestId)) {
        return { status: 400, body: { error: 'Mã yêu cầu không hợp lệ.' } };
      }
      const saved = await findChatTransactions(db, userId, requestId);
      if (saved) {
        return {
          status: 200,
          body: { saved: true, intent: 'expense', transactions: saved },
        };
      }
    }

    if (!message && !images.length) {
      return {
        status: 400,
        body: { error: 'Hãy nhập giao dịch, câu hỏi hoặc gửi ảnh biên lai.' },
      };
    }

    // Load active accounts in ledger for account assignment & transfer matching
    const accountsRes = await db.execute({
      sql: `SELECT id, name, is_default
            FROM accounts
            WHERE ledger_id = ? AND archived = 0
            ORDER BY is_default DESC, id ASC`,
      args: [ctx.ledgerId],
    });
    const accounts: FastPathAccount[] = accountsRes.rows.map((r) => ({
      id: Number(r.id),
      name: String(r.name),
      isDefault: Number(r.is_default) === 1,
    }));
    const selectedAccountId = input.accountId && accounts.some((a) => a.id === input.accountId)
      ? input.accountId
      : ctx.defaultAccountId;

    // 1. Check Debt branch (explicit mode='debt' or clear debt intent when active debts exist)
    const wantsDebt = mode === 'debt' || (mode === 'auto' && DEBT_INTENT_PATTERN.test(message));
    if (wantsDebt) {
      const debtCheck = mode === 'debt'
        ? { hasActive: true }
        : {
            hasActive: (await db.execute({
              sql: "SELECT 1 FROM debts WHERE (ledger_id = ? OR (ledger_id IS NULL AND user_id = ?)) AND status = 'active' LIMIT 1",
              args: [ctx.ledgerId, userId],
            })).rows.length > 0,
          };
      if (debtCheck.hasActive) {
        await assertLedgerAccess(db, userId, ctx.ledgerId, 'editor');
        const debtOut = await handleDebtIntent({
          db,
          userId,
          ledgerId: ctx.ledgerId,
          accountId: selectedAccountId,
          message,
          images,
          source,
        });
        if (debtOut.status === 201 && debtOut.body.receiptData) {
          void notifyOtherLedgerMembers(db, sendPushToUser, {
            ledgerId: ctx.ledgerId,
            actorUserId: userId,
            actorName: await getActorName(),
            title: `Sổ "${grant.ledgerName}" vừa cập nhật công nợ`,
            body: debtOut.body.message || debtOut.body.receiptData.debt_name,
            url: '/debts',
          }).catch(() => {});
        }
        return debtOut;
      }
    }

    const today = getVietnamToday();

    // 2. Check Financial Q&A branch (pure text question)
    if (!images.length && !correctionContext.length && isFinancialQuestion(message)) {
      const qa = await answerFinancialQuestion(db, userId, ctx.ledgerId, message);
      return {
        status: 200,
        body: {
          saved: false,
          intent: 'question',
          answer: qa.answer,
          qaMetrics: qa.metrics,
        },
      };
    }

    // 3. Enforce editor access before any write / AI expense parsing path
    await assertLedgerAccess(db, userId, ctx.ledgerId, 'editor');

    // 4. Reject ambiguous edit-old-transaction instructions via chat
    if (
      requestId
      && !images.length
      && /^(?:sửa|đổi|chỉnh(?: sửa)?|cập nhật|xo[áảa])\s+(?:lại\s+)?(?:giao dịch|khoản (?:chi|thu|vừa)|số tiền|danh mục|ngày giao dịch)(?=\s|$)/iu.test(message)
    ) {
      return {
        status: 422,
        body: { error: 'Dùng nút Sửa trên giao dịch đã lưu để cập nhật.' },
      };
    }

    // 4. Check Fast-Path Transfer ("chuyển 2tr từ Ngân hàng sang Ví chính")
    if (!images.length && !correctionContext.length) {
      const transfer = parseFastPathTransfer({ message, today, accounts });
      if (transfer) {
        const reqKey = requestId ? `chat:${requestId}:0` : null;
        const insertRes = await db.batch([
          {
            sql: `INSERT INTO expenses
                    (user_id, ledger_id, account_id, to_account_id, created_by_user_id, source, amount, description, note, category_id, expense_date, type, client_request_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', NULL, ?, 'transfer', ?)
                  ON CONFLICT(user_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING`,
            args: [
              userId,
              ctx.ledgerId,
              transfer.fromAccountId,
              transfer.toAccountId,
              userId,
              source,
              transfer.amount,
              transfer.description,
              transfer.date,
              reqKey,
            ],
          },
          ...(requestId ? [{
            sql: `INSERT INTO expense_chat_requests (user_id, request_id) VALUES (?, ?)
                  ON CONFLICT(user_id, request_id) DO NOTHING`,
            args: [userId, requestId],
          }] : []),
        ], 'write');
        const createdId = Number(insertRes[0].lastInsertRowid) || 0;
        if (Number(insertRes[0].rowsAffected) > 0) {
          void notifyOtherLedgerMembers(db, sendPushToUser, {
            ledgerId: ctx.ledgerId,
            actorUserId: userId,
            actorName: await getActorName(),
            title: `Sổ "${grant.ledgerName}" vừa chuyển ví`,
            body: `${transfer.description} (${formatCurrency(transfer.amount)})`,
            url: '/expenses',
          }).catch(() => {});
        }
        return {
          status: 201,
          body: {
            saved: true,
            intent: 'transfer',
            fast_path: true,
            transactions: [{
              id: createdId,
              amount: transfer.amount,
              description: transfer.description,
              note: '',
              category_id: null,
              category_name: 'Chuyển ví',
              account_id: transfer.fromAccountId,
              account_name: transfer.fromAccountName,
              to_account_id: transfer.toAccountId,
              to_account_name: transfer.toAccountName,
              expense_date: transfer.date,
              type: 'transfer',
            }],
            budgetAlerts: [],
          },
        };
      }
    }

    // 5. Load categories, budget jars, merchant_rules & recent history
    const [categoriesResult, budgetCategoriesResult, rulesResult, historyResult] = await db.batch([
      {
        sql: 'SELECT id, name, color, kind FROM categories WHERE user_id IS NULL OR user_id = ?',
        args: [userId],
      },
      {
        sql: `SELECT DISTINCT c.id, c.name, c.color
              FROM budget_jars b
              JOIN categories c ON c.id = b.category_id
              WHERE b.user_id = ? AND (c.user_id IS NULL OR c.user_id = b.user_id)
              ORDER BY c.name COLLATE NOCASE ASC`,
        args: [userId],
      },
      {
        sql: `SELECT mr.id, mr.keyword, mr.category_id, mr.type, mr.account_id,
                     c.name AS category_name, c.color AS category_color
              FROM merchant_rules mr
              JOIN categories c ON c.id = mr.category_id
              WHERE mr.ledger_id = ? OR (mr.user_id = ?)
              ORDER BY mr.hit_count DESC, mr.id DESC`,
        args: [ctx.ledgerId, userId],
      },
      {
        sql: `SELECT e.description, e.note, e.type, e.category_id, e.account_id,
                     c.name AS category_name, c.color AS category_color
              FROM expenses e
              LEFT JOIN categories c ON c.id = e.category_id
              WHERE e.user_id = ? AND e.type IN ('income', 'expense')
              ORDER BY e.expense_date DESC, e.created_at DESC
              LIMIT 50`,
        args: [userId],
      },
    ], 'read');

    const categories = categoriesResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      color: String(row.color),
      kind: String(row.kind || 'expense'),
    }));
    const budgetCategories = budgetCategoriesResult.rows.map((row) => String(row.name));
    const merchantRules: FastPathMerchantRule[] = rulesResult.rows.map((row) => ({
      id: Number(row.id),
      keyword: String(row.keyword),
      categoryId: String(row.category_id),
      categoryName: String(row.category_name),
      categoryColor: String(row.category_color || '#64748b'),
      type: row.type === 'income' ? 'income' : 'expense',
      accountId: row.account_id !== null && row.account_id !== undefined ? Number(row.account_id) : null,
    }));
    const expenseCategories = categories.filter((c) => c.kind !== 'income' && c.name !== 'Thu nhập');
    const unclassifiedExpense = expenseCategories.find((c) => c.name === UNCLASSIFIED_EXPENSE);
    const defaultIncome = categories.find((c) => c.name === 'Thu nhập') ?? categories.find((c) => c.kind === 'income');

    const isCorrection = !images.length && correctionContext.length > 0;
    const isNewText = !images.length && !isCorrection;
    const dateMention = isNewText ? findChatTransactionDate(message, today) : undefined;
    if (dateMention?.date === null) {
      return { status: 422, body: { error: 'Ngày giao dịch không hợp lệ. Kiểm tra lại ngày/tháng.' } };
    }

    // 6. FAST-PATH 0ms check (skip LLM completely when 100% confident!)
    if (isNewText && requestId) {
      const fastHistory = historyResult.rows.flatMap((row) => {
        if (!row.category_id || !row.category_name) return [];
        return [{
          description: String(row.description),
          categoryId: String(row.category_id),
          categoryName: String(row.category_name),
          categoryColor: String(row.category_color || '#64748b'),
          type: (row.type === 'income' ? 'income' : 'expense') as 'income' | 'expense',
          accountId: row.account_id !== null && row.account_id !== undefined ? Number(row.account_id) : null,
        }];
      });

      const fastMatch = parseFastPathTransaction({
        message,
        today,
        categories,
        budgetCategories,
        merchantRules,
        historyRows: fastHistory,
        preferredAccountId: input.accountId ?? null,
      });

      if (fastMatch) {
        const finalAccountId = fastMatch.accountId ?? selectedAccountId;
        const saved = await saveChatTransactions(
          db,
          userId,
          requestId,
          [{
            amount: fastMatch.amount,
            description: fastMatch.description.slice(0, 160),
            note: '',
            category_id: fastMatch.categoryId,
            expense_date: fastMatch.date,
            type: fastMatch.type,
            account_id: finalAccountId,
          }],
          { ledgerId: ctx.ledgerId, accountId: finalAccountId, source },
        );

        const budgetAlerts = saved.inserted && fastMatch.type === 'expense'
          ? await evaluateBudgetAlerts(db, userId, ctx.ledgerId, [{
              categoryId: fastMatch.categoryId,
              expenseDate: fastMatch.date,
              addedAmount: fastMatch.amount,
            }])
          : [];

        if (saved.inserted) {
          const sign = fastMatch.type === 'income' ? '+' : '−';
          void notifyOtherLedgerMembers(db, sendPushToUser, {
            ledgerId: ctx.ledgerId,
            actorUserId: userId,
            actorName: await getActorName(),
            title: `Sổ "${grant.ledgerName}" vừa có giao dịch mới`,
            body: `${fastMatch.description} (${sign}${formatCurrency(fastMatch.amount)})`,
            url: '/expenses',
          }).catch(() => {});
        }

        return {
          status: saved.inserted ? 201 : 200,
          body: {
            saved: true,
            intent: fastMatch.type,
            fast_path: true,
            transactions: saved.transactions,
            budgetAlerts,
          },
        };
      }
    }

    // 7. Full AI parsing path
    const seenHistoryKeys = new Set<string>();
    const historyLines: string[] = [];
    for (const row of historyResult.rows) {
      const typeStr = String(row.type);
      const descStr = String(row.description).trim();
      const key = `${typeStr}:${normalizeMerchantKeyword(descStr)}`;
      if (!descStr || seenHistoryKeys.has(key)) continue;
      seenHistoryKeys.add(key);
      historyLines.push(`- [${typeStr}] ${descStr} | note: ${String(row.note || '')} => ${String(row.category_name || 'Khác')}`);
      if (historyLines.length >= 25) break;
    }
    const historyContext = historyLines.join('\n');
    const categoryPolicy = {
      expenseCategories: expenseCategories.map((c) => c.name),
      preferredExpenseCategories: budgetCategories,
      unclassifiedExpense: UNCLASSIFIED_EXPENSE,
      incomeCategories: categories.map((c) => c.name),
    };

    const simpleInput = isNewText ? parseSimpleChatTransaction(message, today) : null;
    const mealFallback: ParsedTransaction[] = simpleInput
      && /^(?:ăn sáng|ăn trưa|ăn tối|cà phê|mua cà phê|uống cà phê)(?=\s|$)/iu.test(simpleInput.description)
      && !/\b(?:bao nhiêu|có nên|hay|khoảng|tầm)\b/iu.test(simpleInput.description)
      ? [{ ...simpleInput, category: 'Ăn uống', type: 'expense', merchant: '' }]
      : [];

    const parsedTransactions = isCorrection
      ? await correctPendingTransactions(message, correctionContext, categoryPolicy, historyContext, userId)
      : images.length
        ? await analyzeTransactions(
            images.map((img) => ({ base64Data: img.base64Data, mimeType: img.mimeType })),
            message,
            categoryPolicy,
            historyContext,
            userId,
          )
        : await parseTransactionsText(message, categoryPolicy, historyContext, userId).catch((err: unknown) => {
            if (err instanceof AiRateLimitError || !mealFallback.length) throw err;
            console.warn('[chat] AI text parsing failed, using explicit meal fields');
            return mealFallback;
          });

    const parsed = parsedTransactions.length ? parsedTransactions : mealFallback;
    if (!parsed.length) {
      return { status: 400, body: { error: 'Không thể xác định giao dịch. Vui lòng thử lại.' } };
    }
    if (isCorrection && parsed.length !== correctionContext.length) {
      return { status: 422, body: { error: 'Không thể áp dụng chỉnh sửa cho các giao dịch chờ lưu.' } };
    }

    const invalidTransactions: string[] = [];
    const transactions = parsed.flatMap((transaction) => {
      const explicit = parsed.length === 1 ? simpleInput : null;
      const amount = explicit?.amount ?? transaction.amount;
      const description = cleanTransactionDescription(explicit?.description ?? transaction.description, amount, today)
        || (parsed.length === 1 ? cleanTransactionDescription(message, amount, today) : '')
        || (transaction.type === 'income' ? 'Thu nhập' : 'Chi tiêu');
      const normalizedCategory = transaction.category.trim().toLocaleLowerCase('vi');
      const allowedCategories = transaction.type === 'expense' ? expenseCategories : categories;
      const selectedCategory =
        allowedCategories.find((row) => row.name.trim().toLocaleLowerCase('vi') === normalizedCategory)
        ?? (transaction.type === 'expense' ? unclassifiedExpense : defaultIncome);

      if (!selectedCategory || !Number.isSafeInteger(amount) || amount <= 0) {
        invalidTransactions.push(transaction.description || transaction.category || 'Giao dịch chưa xác định');
        return [];
      }

      const merchant = cleanTransactionDescription(transaction.merchant, amount, today);
      const supplementalNote = cleanTransactionDescription((transaction.note ?? '').replace(/^nội dung:\s*/iu, ''), amount, today);
      const note = [
        merchant && merchant.toLocaleLowerCase('vi') !== description.toLocaleLowerCase('vi') ? `Đối tác: ${merchant}` : '',
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
        account_id: selectedAccountId,
        category_source: transaction.type === 'income'
          ? 'income_category'
          : budgetCategories.includes(selectedCategory.name)
            ? 'budget_jar'
            : 'expense_category',
      }];
    });

    if (invalidTransactions.length || !transactions.length) {
      return {
        status: 422,
        body: { error: `Không thể xác định số tiền hoặc danh mục hợp lệ cho: ${invalidTransactions.join(', ')}.` },
      };
    }

    if (!requestId) {
      return { status: 200, body: { transactions, correction: isCorrection } };
    }

    const saved = await saveChatTransactions(db, userId, requestId, transactions, {
      ledgerId: ctx.ledgerId,
      accountId: selectedAccountId,
      source,
    });

    const budgetAlerts = saved.inserted
      ? await evaluateBudgetAlerts(
          db,
          userId,
          ctx.ledgerId,
          transactions
            .filter((t) => t.type === 'expense')
            .map((t) => ({ categoryId: t.category_id, expenseDate: t.expense_date, addedAmount: t.amount })),
        )
      : [];

    if (saved.inserted && transactions.length > 0) {
      const first = transactions[0];
      const sign = first.type === 'income' ? '+' : '−';
      const extra = transactions.length > 1 ? ` (+${transactions.length - 1} khoản khác)` : '';
      void notifyOtherLedgerMembers(db, sendPushToUser, {
        ledgerId: ctx.ledgerId,
        actorUserId: userId,
        actorName: await getActorName(),
        title: `Sổ "${grant.ledgerName}" vừa có giao dịch mới`,
        body: `${first.description} (${sign}${formatCurrency(first.amount)})${extra}`,
        url: '/expenses',
      }).catch(() => {});
    }

    return {
      status: saved.inserted ? 201 : 200,
      body: {
        saved: true,
        intent: transactions[0]?.type === 'income' ? 'income' : 'expense',
        fast_path: false,
        transactions: saved.transactions,
        budgetAlerts,
      },
    };
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return {
        status: error.status,
        body: { error: error.message },
      };
    }
    if (error instanceof AiRateLimitError) {
      return {
        status: 429,
        body: { error: error.message },
        headers: { 'Retry-After': String(error.retryAfterSeconds) },
      };
    }
    throw error;
  }
}

async function handleDebtIntent(input: {
  db: Client;
  userId: number;
  ledgerId: number;
  accountId: number;
  message: string;
  images: ChatImagePayload[];
  source: 'chat' | 'voice' | 'shortcut';
}): Promise<ChatPipelineOutput> {
  const { db, userId, ledgerId, accountId, message, images, source } = input;
  const debtsRes = await db.execute({
    sql: `SELECT id, name, creditor, direction
          FROM debts
          WHERE (ledger_id = ? OR (ledger_id IS NULL AND user_id = ?))
            AND status = 'active'
          ORDER BY created_at DESC`,
    args: [ledgerId, userId],
  });
  const debts = debtsRes.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    creditor: String(r.creditor),
    direction: r.direction === 'receivable' ? 'receivable' : 'payable',
  }));
  if (!debts.length) {
    return {
      status: 404,
      body: { error: 'Bạn chưa có khoản công nợ nào đang theo dõi. Hãy tạo khoản nợ trong mục Công nợ trước.' },
    };
  }

  const parsed = await parseDebtPayment(
    message,
    debts.map((d) => `${d.name} (${d.creditor})`),
    userId,
    images.map((img) => ({ base64Data: img.base64Data, mimeType: img.mimeType })),
  );
  if (!parsed.debt_name || !Number.isFinite(parsed.amount) || parsed.amount <= 0) {
    return {
      status: 422,
      body: { error: 'Không nhận diện được khoản nợ hoặc số tiền thanh toán. Vui lòng nhập rõ tên khoản nợ và số tiền.' },
    };
  }

  const needle = parsed.debt_name.normalize('NFC').toLocaleLowerCase('vi');
  const matched =
    debts.find((d) => d.name.normalize('NFC').toLocaleLowerCase('vi') === needle)
    ?? debts.find((d) => d.name.normalize('NFC').toLocaleLowerCase('vi').includes(needle) || needle.includes(d.name.normalize('NFC').toLocaleLowerCase('vi')))
    ?? debts.find((d) => d.creditor.normalize('NFC').toLocaleLowerCase('vi').includes(needle));

  if (!matched) {
    return {
      status: 404,
      body: { error: `Không tìm thấy khoản công nợ khớp với "${parsed.debt_name}".` },
    };
  }

  const result = await recordDebtPaymentWithSync({
    db,
    userId,
    debtId: matched.id,
    amount: Math.round(parsed.amount),
    paymentDate: parsed.payment_date || getVietnamToday(),
    note: parsed.note || `Ghi qua ${source === 'shortcut' ? 'Shortcuts' : 'AI Chat'}`,
    accountId,
    syncToExpense: true,
    source,
  });

  if (!result) {
    return { status: 404, body: { error: 'Không tìm thấy khoản công nợ.' } };
  }

  const verb = result.direction === 'receivable' ? 'Đã ghi nhận thu nợ' : 'Đã ghi nhận trả nợ';
  return {
    status: 201,
    body: {
      saved: true,
      intent: 'debt',
      message: `${verb} ${formatCurrency(result.amount)} cho "${result.debtName}" (còn lại ${formatCurrency(result.remaining)}).`,
      receiptData: {
        debt_id: result.debtId,
        debt_name: result.debtName,
        creditor: result.creditor,
        direction: result.direction,
        amount: result.amount,
        paid_amount: result.totalPaid,
        remaining: result.remaining,
        status: result.status,
        account_name: result.accountName,
      },
    },
  };
}

async function evaluateBudgetAlerts(
  db: Client,
  userId: number,
  ledgerId: number,
  items: Array<{ categoryId: string; expenseDate: string; addedAmount: number }>,
) {
  const expenseGroups = new Map<string, { categoryId: string; expenseDate: string; addedAmount: number }>();
  for (const item of items) {
    const key = `${item.categoryId}:${item.expenseDate.slice(0, 7)}`;
    const group = expenseGroups.get(key);
    if (group) group.addedAmount += item.addedAmount;
    else expenseGroups.set(key, { ...item });
  }
  const alerts = await Promise.allSettled(
    [...expenseGroups.values()].map((group) => getBudgetAlert({ db, userId, ledgerId, ...group })),
  );
  return alerts.flatMap((alert) => alert.status === 'fulfilled' && alert.value ? [alert.value] : []);
}
