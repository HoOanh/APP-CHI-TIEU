import { findChatTransactionDate } from './chat-transaction-text.ts';

function normalizeChatNumber(digits: string, hasScaleUnit: boolean): number {
  const grouped = /^\d{1,3}(?:\.\d{3})+$|^\d{1,3}(?:,\d{3})+$/.test(digits);
  if (grouped) {
    return Number(digits.replace(/[.,]/g, ''));
  }
  if (hasScaleUnit && /^\d+[.,]\d{1,2}$/.test(digits)) {
    return Number(digits.replace(',', '.'));
  }
  if (/^\d+$/.test(digits)) {
    return Number(digits);
  }
  return NaN;
}

export interface SmartSplitResult {
  totalAmount: number;
  peopleCount: number;
  myShare: number;
  receivableAmount: number;
  expenseDescription: string;
  debtName: string;
  creditor: string;
  expenseDate: string;
}

const SPLIT_COUNT_PATTERN = /(?<![\p{L}\p{N}])(?:chia(?:\s+đều)?(?:\s+cho)?|share(?:\s+đều)?(?:\s+cho)?|split(?:\s+for)?)\s*(đôi|\d{1,2})(?:\s*(?:người|mem|bạn|phần|đứa))?(?![\p{L}\p{N}])/iu;

const PAYER_HINT_PATTERN = /(?<![\p{L}\p{N}])(?:mình\s+trả|tôi\s+trả|tui\s+trả|em\s+trả|anh\s+trả|mình\s+ứng|tôi\s+ứng|trả\s+trước|ứng\s+trước|chia\s+(?:đều\s+)?(?:cho\s+)?(?:đôi|\d{1,2})|share\s+(?:đôi|\d{1,2})|split\s+\d{1,2})(?![\p{L}\p{N}])/iu;

const AMOUNT_TOKEN_RE = /(?<![\p{L}\p{N}])(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(triệu|tr|m|củ|nghìn|ngàn|k|đồng|đ|vnd)?(?![\p{L}\p{N}])/giu;

function parseLargestAmountToken(
  text: string,
  excludeSpan?: { start: number; end: number },
): { amount: number; raw: string } | null {
  let best: { amount: number; raw: string } | null = null;
  for (const match of text.matchAll(AMOUNT_TOKEN_RE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (excludeSpan && start >= excludeSpan.start && end <= excludeSpan.end) {
      continue;
    }
    const rawNum = match[1] || '';
    const unit = (match[2] || '').toLocaleLowerCase('vi');
    const isScaled = unit === 'triệu' || unit === 'tr' || unit === 'm' || unit === 'củ' || unit === 'k' || unit === 'nghìn' || unit === 'ngàn';
    if (!unit && Number(rawNum) < 1000) {
      continue;
    }
    let val = normalizeChatNumber(rawNum, isScaled);
    if (!Number.isFinite(val) || val <= 0) continue;
    if (unit === 'triệu' || unit === 'tr' || unit === 'm' || unit === 'củ') {
      val *= 1_000_000;
    } else if (unit === 'k' || unit === 'nghìn' || unit === 'ngàn') {
      val *= 1_000;
    }
    val = Math.round(val);
    if (!best || val > best.amount) {
      best = { amount: val, raw: match[0] };
    }
  }
  return best;
}

export function parseSmartSplitMessage(message: string, today: string): SmartSplitResult | null {
  const trimmed = message.trim();
  if (!trimmed) return null;

  const dateMatch = findChatTransactionDate(trimmed, today);
  const textWithoutDate = dateMatch
    ? (trimmed.slice(0, dateMatch.start) + ' ' + trimmed.slice(dateMatch.start + dateMatch.length)).replace(/\s+/g, ' ').trim()
    : trimmed;

  const splitMatch = textWithoutDate.match(SPLIT_COUNT_PATTERN);
  if (!splitMatch) return null;

  const countToken = (splitMatch[1] || '').toLocaleLowerCase('vi');
  const peopleCount = countToken === 'đôi' ? 2 : Number(countToken);
  if (!Number.isInteger(peopleCount) || peopleCount < 2 || peopleCount > 50) {
    return null;
  }

  // Must either specify payer ("mình trả" / "ứng trước" / explicit split) or avoid unrelated question phrasing
  if (/[?]$/.test(textWithoutDate) || /^(?:tổng|tháng này|tuần này|hôm nay|bao nhiêu)/iu.test(textWithoutDate)) {
    return null;
  }

  const splitStart = splitMatch.index ?? 0;
  const splitEnd = splitStart + splitMatch[0].length;
  const amountToken = parseLargestAmountToken(textWithoutDate, { start: splitStart, end: splitEnd });
  if (!amountToken || amountToken.amount < 1000) {
    return null;
  }

  // Optional creditor extraction: e.g. "với Hùng" or "cho Minh, Lan"
  const withMatch = textWithoutDate.match(/(?<![\p{L}\p{N}])(?:với|cùng|nhóm)\s+([\p{L}\s]{2,32}?)(?:,|\s+(?:mình|tôi|tui|em)\s+trả|$)/iu);
  const creditor = withMatch?.[1]?.trim() || `Nhóm ${peopleCount} người`;

  let desc = textWithoutDate
    .replace(SPLIT_COUNT_PATTERN, ' ')
    .replace(PAYER_HINT_PATTERN, ' ')
    .replace(amountToken.raw, ' ')
    .replace(/[,;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!desc) {
    desc = 'Chi tiêu chung chia nhóm';
  } else {
    desc = desc.charAt(0).toLocaleUpperCase('vi') + desc.slice(1);
  }

  const totalAmount = amountToken.amount;
  const myShare = Math.round(totalAmount / peopleCount);
  const receivableAmount = Math.max(0, totalAmount - myShare);

  if (myShare <= 0 || receivableAmount <= 0) {
    return null;
  }

  return {
    totalAmount,
    peopleCount,
    myShare,
    receivableAmount,
    expenseDescription: desc.slice(0, 120),
    debtName: `Chia ${desc} (${peopleCount} người)`.slice(0, 120),
    creditor: creditor.slice(0, 80),
    expenseDate: dateMatch?.date ?? today,
  };
}
