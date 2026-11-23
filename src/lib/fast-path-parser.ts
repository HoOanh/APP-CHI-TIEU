import { parseSimpleChatTransaction } from './chat-transaction-text.ts';

export interface FastPathCategory {
  id: string;
  name: string;
  color: string;
  kind?: string;
}

export interface FastPathAccount {
  id: number;
  name: string;
  isDefault?: boolean;
}

export interface FastPathMerchantRule {
  id: number;
  keyword: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  type: 'income' | 'expense';
  accountId: number | null;
}

export interface FastPathHistoryRow {
  description: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  type: 'income' | 'expense';
  accountId: number | null;
}

export interface FastPathTransactionMatch {
  amount: number;
  description: string;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  date: string;
  type: 'income' | 'expense';
  accountId: number | null;
  matchSource: 'merchant_rule' | 'history' | 'builtin_keyword';
}

export interface FastPathTransferMatch {
  amount: number;
  description: string;
  date: string;
  fromAccountId: number;
  fromAccountName: string;
  toAccountId: number;
  toAccountName: string;
}

export function resolveExplicitImageContextCategory<T extends { id: string; name: string }>(
  message: string,
  expenseCategories: T[],
  unclassifiedName = 'Chưa phân loại',
): T | null {
  const normalizedMessage = message.normalize('NFC').toLocaleLowerCase('vi').trim();
  if (!normalizedMessage) return null;
  if (/(?:tách riêng|riêng từng|giao dịch\s*\d|ảnh\s*\d|khoản\s*\d|mỗi ảnh)/iu.test(normalizedMessage)) {
    return null;
  }

  const matched = expenseCategories.filter((cat) => {
    const name = cat.name.normalize('NFC').toLocaleLowerCase('vi').trim();
    if (!name || name === unclassifiedName.toLocaleLowerCase('vi')) return false;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'iu');
    return pattern.test(normalizedMessage);
  });

  return matched.length === 1 ? matched[0] : null;
}

export function normalizeMerchantKeyword(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/^(?:chi|mua|tiền|trả|thanh toán|nạp|đóng)\s+/u, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const BUILTIN_RULES: Array<{ pattern: RegExp; category: string; type: 'income' | 'expense' }> = [
  { pattern: /^(?:ăn sáng|ăn trưa|ăn tối|cà phê|uống cà phê|trà sữa|bún|phở|cơm|bánh mì|ăn vặt|tiền ăn|đồ ăn|bữa trưa|bữa tối|bữa sáng)(?![\p{L}\p{N}])/iu, category: 'Ăn uống', type: 'expense' },
  { pattern: /^(?:đổ xăng|xăng|gửi xe|rửa xe|thay nhớt|grab|be|xanh sm|taxi)(?![\p{L}\p{N}])/iu, category: 'Xe & xăng', type: 'expense' },
  { pattern: /^(?:nhà thuê|tiền nhà|tiền phòng|điện nước|internet|wifi)(?![\p{L}\p{N}])/iu, category: 'Nhà thuê', type: 'expense' },
  { pattern: /^(?:tập gym|cầu lông|bóng đá|bơi|thể thao|chạy bộ)(?![\p{L}\p{N}])/iu, category: 'Thể thao', type: 'expense' },
  { pattern: /^(?:nhậu|bia|lai rai)(?![\p{L}\p{N}])/iu, category: 'Nhậu', type: 'expense' },
  { pattern: /^(?:nhận lương|lương|thưởng|thu freelance|nhận thưởng|tiền thưởng)(?![\p{L}\p{N}])/iu, category: 'Thu nhập', type: 'income' },
];

const QUESTION_OR_SPECIAL_INTENT = /(?<![\p{L}\p{N}])(?:bao nhiêu|mấy|tổng|thống kê|ngân sách|còn nợ|trả nợ|thu nợ|cho vay|vay|chuyển\s+(?:sang|từ|qua|về)\s+ví|rút tiền)(?![\p{L}\p{N}])/iu;

export function parseFastPathTransaction(input: {
  message: string;
  today: string;
  categories: FastPathCategory[];
  budgetCategories: string[];
  merchantRules: FastPathMerchantRule[];
  historyRows: FastPathHistoryRow[];
  preferredAccountId?: number | null;
}): FastPathTransactionMatch | null {
  if (QUESTION_OR_SPECIAL_INTENT.test(input.message)) {
    return null;
  }

  const simple = parseSimpleChatTransaction(input.message, input.today);
  if (!simple) return null;

  const normalizedDesc = normalizeMerchantKeyword(simple.description);
  const fullNormalized = input.message.normalize('NFC').toLocaleLowerCase('vi').trim();

  // 1. Exact or token match on explicit user merchant_rules
  const rule = input.merchantRules.find((item) => {
    const key = item.keyword.normalize('NFC').toLocaleLowerCase('vi').trim();
    return key === normalizedDesc || key === fullNormalized || normalizedDesc.startsWith(`${key} `);
  });
  if (rule) {
    const cat = input.categories.find((c) => c.id === rule.categoryId);
    if (cat) {
      return {
        amount: simple.amount,
        description: simple.description,
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: cat.color,
        date: simple.date,
        type: rule.type,
        accountId: input.preferredAccountId ?? rule.accountId ?? null,
        matchSource: 'merchant_rule',
      };
    }
  }

  // 2. Unanimous recent user history for exact description (>= 2 consistent records, or 1 if matched name & category exists)
  const matchingHistory = input.historyRows.filter((row) =>
    normalizeMerchantKeyword(row.description) === normalizedDesc && row.categoryId,
  );
  if (matchingHistory.length >= 2) {
    const first = matchingHistory[0];
    const unanimous = matchingHistory.every((row) =>
      row.categoryId === first.categoryId && row.type === first.type,
    );
    if (unanimous) {
      return {
        amount: simple.amount,
        description: simple.description,
        categoryId: first.categoryId,
        categoryName: first.categoryName,
        categoryColor: first.categoryColor,
        date: simple.date,
        type: first.type,
        accountId: input.preferredAccountId ?? first.accountId ?? null,
        matchSource: 'history',
      };
    }
  }

  // 3. Built-in high-confidence Vietnamese daily patterns
  for (const builtin of BUILTIN_RULES) {
    if (!builtin.pattern.test(simple.description) && !builtin.pattern.test(normalizedDesc)) {
      continue;
    }
    const candidates = input.categories.filter((c) =>
      builtin.type === 'income'
        ? c.name === 'Thu nhập' || c.name === 'Lương' || c.kind === 'income'
        : c.name === builtin.category,
    );
    const chosen = builtin.type === 'income'
      ? (candidates.find((c) => /lương/i.test(simple.description) && c.name === 'Lương')
        ?? candidates.find((c) => c.name === 'Thu nhập')
        ?? candidates[0])
      : candidates[0];
    if (chosen) {
      return {
        amount: simple.amount,
        description: simple.description,
        categoryId: chosen.id,
        categoryName: chosen.name,
        categoryColor: chosen.color,
        date: simple.date,
        type: builtin.type,
        accountId: input.preferredAccountId ?? null,
        matchSource: 'builtin_keyword',
      };
    }
  }

  return null;
}

export function parseFastPathTransfer(input: {
  message: string;
  today: string;
  accounts: FastPathAccount[];
}): FastPathTransferMatch | null {
  if (input.accounts.length < 2) return null;
  const text = input.message.trim();
  const transferPattern = /^(?:chuyển(?:\s+khoản)?(?:\s+ví)?|rút(?:\s+tiền)?|nạp(?:\s+tiền)?)\s+([0-9]+(?:[.,][0-9]+)*\s*(?:triệu|nghìn|ngàn|tr|k|đồng|đ|vnd))\s+(?:từ\s+)(.+?)\s+(?:sang|vào|về|qua|đến)\s+(.+)$/iu;
  const match = text.match(transferPattern);
  if (!match) return null;

  const [, rawAmount, rawFrom, rawTo] = match;
  const amount = parseCompactMoney(rawAmount);
  if (!Number.isSafeInteger(amount) || amount <= 0) return null;

  const fromAcc = findBestMatchingAccount(rawFrom, input.accounts);
  const toAcc = findBestMatchingAccount(rawTo, input.accounts);
  if (!fromAcc || !toAcc || fromAcc.id === toAcc.id) return null;

  return {
    amount,
    description: `Chuyển từ ${fromAcc.name} sang ${toAcc.name}`,
    date: input.today,
    fromAccountId: fromAcc.id,
    fromAccountName: fromAcc.name,
    toAccountId: toAcc.id,
    toAccountName: toAcc.name,
  };
}

function findBestMatchingAccount(fragment: string, accounts: FastPathAccount[]): FastPathAccount | null {
  const normalized = fragment.normalize('NFC').toLocaleLowerCase('vi').replace(/^ví\s+/u, '').trim();
  return (
    accounts.find((acc) => acc.name.normalize('NFC').toLocaleLowerCase('vi') === fragment.normalize('NFC').toLocaleLowerCase('vi').trim())
    ?? accounts.find((acc) => acc.name.normalize('NFC').toLocaleLowerCase('vi').includes(normalized) && normalized.length >= 2)
    ?? null
  );
}

function parseCompactMoney(raw: string): number {
  const m = raw.trim().match(/^([0-9]+(?:[.,][0-9]+)*)\s*(triệu|nghìn|ngàn|tr|k|đồng|đ|vnd)$/iu);
  if (!m) return 0;
  const [, digits, unit] = m;
  const lowerUnit = unit.toLocaleLowerCase('vi');
  const multiplier = ['k', 'nghìn', 'ngàn'].includes(lowerUnit) ? 1_000 : ['tr', 'triệu'].includes(lowerUnit) ? 1_000_000 : 1;
  const grouped = /^\d{1,3}(?:\.\d{3})+$|^\d{1,3}(?:,\d{3})+$/.test(digits);
  const value = Number(grouped ? digits.replace(/[.,]/g, '') : digits.replace(',', '.'));
  return Number.isFinite(value) ? Math.round(value * multiplier) : 0;
}
