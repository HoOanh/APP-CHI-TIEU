import type { Client } from '@libsql/client';
import { ensureUserLedgerAndAccount } from './ledger-context';
import { UNCLASSIFIED_EXPENSE } from './schema';
import { getVietnamToday } from './utils';

export interface RecordDebtPaymentInput {
  db: Client;
  userId: number;
  debtId: string | number;
  amount: number;
  paymentDate?: string;
  note?: string;
  accountId?: number | null;
  syncToExpense?: boolean;
  source?: 'web' | 'chat' | 'voice' | 'shortcut';
}

export interface RecordDebtPaymentResult {
  paymentId: number;
  expenseId: number | null;
  debtId: number;
  debtName: string;
  creditor: string;
  direction: 'payable' | 'receivable';
  amount: number;
  totalAmount: number;
  totalPaid: number;
  remaining: number;
  status: 'active' | 'completed';
  accountName: string | null;
}

export async function recordDebtPaymentWithSync(
  input: RecordDebtPaymentInput,
): Promise<RecordDebtPaymentResult | null> {
  const { db, userId, debtId, amount } = input;
  const ctx = await ensureUserLedgerAndAccount(db, userId);

  const ownedDebtRes = await db.execute({
    sql: `SELECT d.id, d.ledger_id, d.account_id, d.direction, d.name, d.creditor, d.total_amount
          FROM debts d
          WHERE d.id = ? AND d.user_id = ?`,
    args: [debtId, userId],
  });
  const debtRow = ownedDebtRes.rows[0];
  if (!debtRow) return null;

  const direction = debtRow.direction === 'receivable' ? 'receivable' : 'payable';
  const ledgerId = Number(debtRow.ledger_id) || ctx.ledgerId;
  const targetAccountId = input.accountId
    ?? (debtRow.account_id !== null && debtRow.account_id !== undefined ? Number(debtRow.account_id) : null)
    ?? ctx.defaultAccountId;
  const paymentDate = input.paymentDate || getVietnamToday();
  const note = (input.note || '').trim();
  const syncToExpense = input.syncToExpense !== false;

  let accountName: string | null = null;
  if (targetAccountId) {
    const accRes = await db.execute({
      sql: 'SELECT id, name FROM accounts WHERE id = ? AND ledger_id = ? AND archived = 0 LIMIT 1',
      args: [targetAccountId, ledgerId],
    });
    if (accRes.rows[0]) {
      accountName = String(accRes.rows[0].name);
    }
  }

  let syncCategoryId: number | null = null;
  if (syncToExpense) {
    const desiredNames = direction === 'payable'
      ? ['Đào góp', UNCLASSIFIED_EXPENSE]
      : ['Thu nhập', 'Lương'];
    const catRes = await db.execute({
      sql: `SELECT id, name FROM categories
            WHERE (user_id IS NULL OR user_id = ?)
              AND kind = ?
            ORDER BY CASE WHEN user_id = ? THEN 0 ELSE 1 END, id ASC`,
      args: [userId, direction === 'payable' ? 'expense' : 'income', userId],
    });
    const matched = catRes.rows.find((row) => desiredNames.includes(String(row.name))) ?? catRes.rows[0];
    syncCategoryId = matched ? Number(matched.id) : null;
  }

  const tx = await db.transaction('write');
  try {
    let expenseId: number | null = null;
    if (syncToExpense && syncCategoryId !== null) {
      const prefix = direction === 'payable' ? 'Trả nợ' : 'Thu nợ';
      const expRes = await tx.execute({
        sql: `INSERT INTO expenses
                (user_id, ledger_id, account_id, created_by_user_id, source, amount, description, note, category_id, expense_date, type)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          userId,
          ledgerId,
          accountName ? targetAccountId : ctx.defaultAccountId,
          userId,
          input.source ?? 'web',
          amount,
          `${prefix}: ${String(debtRow.name)}`.slice(0, 160),
          note.slice(0, 500),
          syncCategoryId,
          paymentDate,
          direction === 'payable' ? 'expense' : 'income',
        ],
      });
      expenseId = Number(expRes.lastInsertRowid);
    }

    const paymentRes = await tx.execute({
      sql: `INSERT INTO debt_payments
              (user_id, ledger_id, account_id, expense_id, debt_id, amount, payment_date, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        ledgerId,
        accountName ? targetAccountId : ctx.defaultAccountId,
        expenseId,
        debtId,
        amount,
        paymentDate,
        note,
      ],
    });

    const paidRes = await tx.execute({
      sql: 'SELECT COALESCE(SUM(amount), 0) AS sum FROM debt_payments WHERE debt_id = ? AND user_id = ?',
      args: [debtId, userId],
    });
    const totalAmount = Number(debtRow.total_amount) || 0;
    const totalPaid = Number(paidRes.rows[0]?.sum) || 0;
    const nextStatus: 'active' | 'completed' = totalPaid >= totalAmount ? 'completed' : 'active';

    await tx.execute({
      sql: 'UPDATE debts SET status = ? WHERE id = ? AND user_id = ?',
      args: [nextStatus, debtId, userId],
    });

    await tx.commit();

    return {
      paymentId: Number(paymentRes.lastInsertRowid),
      expenseId,
      debtId: Number(debtRow.id),
      debtName: String(debtRow.name),
      creditor: String(debtRow.creditor),
      direction,
      amount,
      totalAmount,
      totalPaid,
      remaining: Math.max(0, totalAmount - totalPaid),
      status: nextStatus,
      accountName,
    };
  } catch (error) {
    await tx.rollback().catch(() => {});
    throw error;
  }
}
