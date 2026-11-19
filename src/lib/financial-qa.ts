import type { Client } from '@libsql/client';
import { formatCurrency, getCurrentMonth, getVietnamToday } from './utils.ts';

export interface FinancialQaMetric {
  label: string;
  value: string;
  tone?: 'income' | 'expense' | 'neutral';
}

export interface FinancialQaResult {
  answer: string;
  metrics: FinancialQaMetric[];
}

export function isFinancialQuestion(message: string): boolean {
  const text = message.trim();
  if (!text) return false;
  if (/[?？]$/.test(text)) return true;
  if (
    /(?<![\p{L}\p{N}])(?:bao nhiêu|hết mấy|tổng chi|tổng thu|số dư|còn bao|còn nợ|ngân sách|thống kê|chi tiêu tháng|tiêu hết|chi hết|nhiều nhất)(?![\p{L}\p{N}])/iu.test(text)
    && !/(?:^|\s)\d+(?:[.,]\d+)?\s*(?:k|nghìn|ngàn|tr|triệu|đ|vnd)(?![\p{L}\p{N}])/iu.test(text)
  ) {
    return true;
  }
  return false;
}

function resolveRequestedMonth(message: string): { month: string; label: string; isTodayOnly: boolean } {
  const today = getVietnamToday();
  const currentMonth = getCurrentMonth();
  const lower = message.normalize('NFC').toLocaleLowerCase('vi');

  if (/(?<![\p{L}\p{N}])hôm nay(?![\p{L}\p{N}])/u.test(lower)) {
    return { month: currentMonth, label: 'hôm nay', isTodayOnly: true };
  }
  if (/(?<![\p{L}\p{N}])tháng trước(?![\p{L}\p{N}])/u.test(lower)) {
    const [y, m] = currentMonth.split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 2, 1));
    const prevMonth = `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
    return { month: prevMonth, label: `tháng ${prevMonth.slice(5)}/${prevMonth.slice(0, 4)}`, isTodayOnly: false };
  }
  const explicitMonthMatch = lower.match(/(?<![\p{L}\p{N}])tháng\s+(\d{1,2})(?:[/\s-]+(\d{4}))?/u);
  if (explicitMonthMatch) {
    const m = Math.min(12, Math.max(1, Number(explicitMonthMatch[1])));
    const y = explicitMonthMatch[2] ? Number(explicitMonthMatch[2]) : Number(today.slice(0, 4));
    const monthStr = `${y}-${String(m).padStart(2, '0')}`;
    return { month: monthStr, label: `tháng ${m}/${y}`, isTodayOnly: false };
  }
  return { month: currentMonth, label: `tháng ${currentMonth.slice(5)}/${currentMonth.slice(0, 4)}`, isTodayOnly: false };
}

function getMonthBounds(month: string) {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1));
  return {
    start: `${month}-01`,
    end: `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-01`,
  };
}

export async function answerFinancialQuestion(
  db: Client,
  userId: number,
  ledgerId: number,
  question: string,
): Promise<FinancialQaResult> {
  const { month, label, isTodayOnly } = resolveRequestedMonth(question);
  const today = getVietnamToday();
  const { start, end } = isTodayOnly ? { start: today, end: `${today}z` } : getMonthBounds(month);
  const dateFilterSql = isTodayOnly ? 'e.expense_date = ?' : 'e.expense_date >= ? AND e.expense_date < ?';
  const dateArgs = isTodayOnly ? [today] : [start, end];

  const [totalsRes, byCatRes, accountsRes, debtsRes] = await db.batch([
    {
      sql: `SELECT
              COALESCE(SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE 0 END), 0) AS total_income,
              COALESCE(SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END), 0) AS total_expense,
              COUNT(CASE WHEN e.type IN ('income', 'expense') THEN 1 END) AS tx_count
            FROM expenses e
            WHERE (e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?))
              AND ${dateFilterSql}`,
      args: [ledgerId, userId, ...dateArgs],
    },
    {
      sql: `SELECT c.id, c.name, COALESCE(SUM(e.amount), 0) AS spent, COUNT(*) AS cnt
            FROM expenses e
            JOIN categories c ON c.id = e.category_id
            WHERE (e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?))
              AND e.type = 'expense'
              AND ${dateFilterSql}
            GROUP BY c.id, c.name
            ORDER BY spent DESC`,
      args: [ledgerId, userId, ...dateArgs],
    },
    {
      sql: `SELECT a.id, a.name,
                   (
                     a.initial_balance
                     + COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.account_id = a.id AND e.type = 'income'), 0)
                     - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.account_id = a.id AND e.type = 'expense'), 0)
                     + COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.to_account_id = a.id AND e.type = 'transfer'), 0)
                     - COALESCE((SELECT SUM(e.amount) FROM expenses e WHERE e.ledger_id = a.ledger_id AND e.account_id = a.id AND e.type = 'transfer'), 0)
                   ) AS balance
            FROM accounts a
            WHERE a.ledger_id = ? AND a.archived = 0
            ORDER BY a.is_default DESC, a.id ASC`,
      args: [ledgerId],
    },
    {
      sql: `SELECT d.direction, d.name,
                   d.total_amount - COALESCE((SELECT SUM(dp.amount) FROM debt_payments dp WHERE dp.debt_id = d.id), 0) AS remaining
            FROM debts d
            WHERE (d.ledger_id = ? OR (d.ledger_id IS NULL AND d.user_id = ?))
              AND d.status = 'active'`,
      args: [ledgerId, userId],
    },
  ], 'read');

  const totalIncome = Number(totalsRes.rows[0]?.total_income) || 0;
  const totalExpense = Number(totalsRes.rows[0]?.total_expense) || 0;
  const txCount = Number(totalsRes.rows[0]?.tx_count) || 0;

  const lowerQ = question.normalize('NFC').toLocaleLowerCase('vi');

  // 1. Check if asking specifically about a category
  const categoryRows = byCatRes.rows.map((row) => ({
    name: String(row.name),
    spent: Number(row.spent) || 0,
    cnt: Number(row.cnt) || 0,
  }));
  const mentionedCategory = categoryRows.find((cat) =>
    lowerQ.includes(cat.name.normalize('NFC').toLocaleLowerCase('vi')),
  );

  // Also check if user mentions a known default category name with 0 spent this period
  const fallbackCategoryNames = ['ăn uống', 'xe & xăng', 'nhà thuê', 'thể thao', 'nhậu', 'đào góp', 'vợ', 'chuyển về nhà'];
  const mentionedZeroCategory = !mentionedCategory
    ? fallbackCategoryNames.find((name) => lowerQ.includes(name))
    : null;

  if (mentionedCategory) {
    return {
      answer: `Trong ${label}, bạn đã chi **${formatCurrency(mentionedCategory.spent)}** cho mục **${mentionedCategory.name}** (${mentionedCategory.cnt} giao dịch). Tổng chi ${label} là ${formatCurrency(totalExpense)}.`,
      metrics: [
        { label: `${mentionedCategory.name} (${label})`, value: formatCurrency(mentionedCategory.spent), tone: 'expense' },
        { label: `Tổng chi ${label}`, value: formatCurrency(totalExpense), tone: 'neutral' },
      ],
    };
  }

  if (mentionedZeroCategory) {
    return {
      answer: `Trong ${label}, bạn chưa phát sinh khoản chi nào cho mục **${mentionedZeroCategory}**. Tổng chi toàn bộ ${label} là ${formatCurrency(totalExpense)}.`,
      metrics: [
        { label: `Tổng chi ${label}`, value: formatCurrency(totalExpense), tone: 'expense' },
        { label: `Tổng thu ${label}`, value: formatCurrency(totalIncome), tone: 'income' },
      ],
    };
  }

  // 2. Balance question
  if (/\b(?:số dư|còn bao nhiêu tiền|trong ví)\b/u.test(lowerQ)) {
    const accounts = accountsRes.rows.map((row) => ({
      name: String(row.name),
      balance: Number(row.balance) || 0,
    }));
    const totalBalance = accounts.reduce((sum, acc) => sum + acc.balance, 0);
    const details = accounts.map((acc) => `• ${acc.name}: ${formatCurrency(acc.balance)}`).join('\n');
    return {
      answer: `Tổng số dư hiện tại của bạn là **${formatCurrency(totalBalance)}**:\n${details}`,
      metrics: accounts.slice(0, 4).map((acc) => ({
        label: acc.name,
        value: formatCurrency(acc.balance),
        tone: acc.balance >= 0 ? 'income' : 'expense',
      })),
    };
  }

  // 3. Debt question
  if (/\b(?:nợ|cho vay|phải trả|phải thu)\b/u.test(lowerQ)) {
    const debts = debtsRes.rows.map((row) => ({
      direction: row.direction === 'receivable' ? 'receivable' : 'payable',
      name: String(row.name),
      remaining: Math.max(0, Number(row.remaining) || 0),
    }));
    const payableSum = debts.filter((d) => d.direction === 'payable').reduce((s, d) => s + d.remaining, 0);
    const receivableSum = debts.filter((d) => d.direction === 'receivable').reduce((s, d) => s + d.remaining, 0);
    return {
      answer: `Công nợ đang theo dõi: còn phải trả **${formatCurrency(payableSum)}**; đang cho vay / phải thu **${formatCurrency(receivableSum)}**.`,
      metrics: [
        { label: 'Còn phải trả', value: formatCurrency(payableSum), tone: 'expense' },
        { label: 'Đang cho vay / thu', value: formatCurrency(receivableSum), tone: 'income' },
      ],
    };
  }

  // 4. General summary (income, expense, top categories)
  const topLines = categoryRows.slice(0, 3).map((cat) => `${cat.name}: ${formatCurrency(cat.spent)}`).join(' · ');
  const net = totalIncome - totalExpense;
  return {
    answer: `Tổng kết ${label} (${txCount} giao dịch): Thu **${formatCurrency(totalIncome)}**, Chi **${formatCurrency(totalExpense)}**, Ròng **${net >= 0 ? '+' : '−'}${formatCurrency(Math.abs(net))}**.${topLines ? `\nTop chi tiêu: ${topLines}.` : ''}`,
    metrics: [
      { label: `Tổng thu (${label})`, value: `+${formatCurrency(totalIncome)}`, tone: 'income' },
      { label: `Tổng chi (${label})`, value: `−${formatCurrency(totalExpense)}`, tone: 'expense' },
      ...(categoryRows[0] ? [{ label: `Top: ${categoryRows[0].name}`, value: formatCurrency(categoryRows[0].spent), tone: 'neutral' as const }] : []),
    ],
  };
}
