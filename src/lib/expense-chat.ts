import type { Client } from '@libsql/client';

export interface ChatTransaction {
  amount: number;
  description: string;
  note: string;
  category_id: string;
  expense_date: string;
  type: 'income' | 'expense';
  account_id?: number | null;
}

function selectChatTransactions(userId: number, requestId: string) {
  return {
    sql: `SELECT e.id, e.amount, e.description, e.note, e.category_id, e.account_id, e.expense_date, e.type,
                 c.name AS category_name, a.name AS account_name
          FROM expense_chat_requests r
          LEFT JOIN expenses e ON e.user_id = r.user_id
            AND e.client_request_id >= ? AND e.client_request_id < ?
          LEFT JOIN categories c ON c.id = e.category_id
          LEFT JOIN accounts a ON a.id = e.account_id
          WHERE r.user_id = ? AND r.request_id = ?
          ORDER BY e.id`,
    args: [`chat:${requestId}:`, `chat:${requestId};`, userId, requestId],
  };
}

export async function findChatTransactions(db: Client, userId: number, requestId: string) {
  const result = await db.execute(selectChatTransactions(userId, requestId));
  return result.rows.length ? result.rows.filter((row) => row.id !== null) : null;
}

export async function saveChatTransactions(
  db: Client,
  userId: number,
  requestId: string,
  transactions: ChatTransaction[],
  context?: { ledgerId?: number; accountId?: number },
) {
  const payload = transactions.map((tx) => ({
    ...tx,
    ledger_id: context?.ledgerId ?? null,
    account_id: tx.account_id ?? context?.accountId ?? null,
    created_by_user_id: userId,
  }));

  const [insert, , saved] = await db.batch([
    {
      sql: `INSERT INTO expenses
              (user_id, ledger_id, account_id, created_by_user_id, source, amount, description, note, category_id, expense_date, type, client_request_id)
            SELECT ?, json_extract(value, '$.ledger_id'), json_extract(value, '$.account_id'),
                   json_extract(value, '$.created_by_user_id'), 'chat',
                   json_extract(value, '$.amount'), json_extract(value, '$.description'),
                   json_extract(value, '$.note'), json_extract(value, '$.category_id'),
                   json_extract(value, '$.expense_date'), json_extract(value, '$.type'),
                   ? || key
            FROM json_each(?)
            WHERE NOT EXISTS (
              SELECT 1 FROM expense_chat_requests WHERE user_id = ? AND request_id = ?
            )`,
      args: [userId, `chat:${requestId}:`, JSON.stringify(payload), userId, requestId],
    },
    {
      // Keep the request recorded even if the user later deletes all its transactions.
      sql: `INSERT INTO expense_chat_requests (user_id, request_id) VALUES (?, ?)
            ON CONFLICT (user_id, request_id) DO NOTHING`,
      args: [userId, requestId],
    },
    selectChatTransactions(userId, requestId),
  ], 'write');

  return {
    inserted: insert.rowsAffected > 0,
    transactions: saved.rows.filter((row) => row.id !== null),
  };
}
