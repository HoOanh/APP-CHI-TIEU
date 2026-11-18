const datePattern = /(?<![\p{L}\p{N}])(?:(?:ngày|mùng|mồng)\s+)?(?:(\d{4})-(\d{1,2})-(\d{1,2})|(\d{1,2})[/\-](\d{1,2})(?:[/\-](\d{4}|\d{2}))?|(\d{1,2})\s+tháng\s+(\d{1,2})(?:\s+năm\s+(\d{4}))?|(hôm nay|hôm qua|hôm trước|hôm kia|ngày mai))(?![\p{L}\p{N}/-])/giu;
const moneyPattern = /(?<![\p{L}\p{N}.,/])([0-9]+(?:[.,][0-9]+)*)(?:\s*)(triệu|nghìn|ngàn|vnd|tr|k|đồng|đ|₫)(?![\p{L}\p{N}/])/giu;
const wholeAmountPattern = /(?<![\p{L}\p{N}.,/])(?:\d{1,3}(?:\.\d{3})+|\d{1,3}(?:,\d{3})+|\d{4,})(?![\p{L}\p{N}/]|[.,]\d)/gu;
const spokenAmountPattern = /(?<![\p{L}])(?:(?:một|hai|ba|bốn|năm|sáu|bảy|tám|chín|mười|mươi|trăm|linh|lẻ|mốt|tư|lăm)\s+){1,7}(?:nghìn|ngàn|triệu)(?![\p{L}])/giu;

type Mention = { start: number; length: number };

function extractDates(value: string, today: string) {
  return [...value.matchAll(datePattern)].map((match) => {
    const [, isoYear, isoMonth, isoDay, day, month, year, naturalDay, naturalMonth, naturalYear, relative] = match;
    let date: string | null;
    if (relative) {
      const offset = { 'hôm qua': -1, 'hôm trước': -1, 'hôm kia': -2, 'ngày mai': 1 }[relative.toLocaleLowerCase('vi')] ?? 0;
      const calendarDate = new Date(`${today}T00:00:00Z`);
      calendarDate.setUTCDate(calendarDate.getUTCDate() + offset);
      date = calendarDate.toISOString().slice(0, 10);
    } else {
      const yearText = isoYear || year || naturalYear || today.slice(0, 4);
      const monthText = isoMonth || month || naturalMonth;
      const dayText = isoDay || day || naturalDay;
      const candidate = `${yearText.length === 2 ? '20' + yearText : yearText}-${monthText.padStart(2, '0')}-${dayText.padStart(2, '0')}`;
      const calendarDate = new Date(`${candidate}T00:00:00Z`);
      date = Number.isFinite(calendarDate.getTime()) && calendarDate.toISOString().slice(0, 10) === candidate ? candidate : null;
    }
    return { start: match.index, length: match[0].length, date };
  });
}

function extractMoney(value: string) {
  return [...value.matchAll(moneyPattern)].map((match) => {
    const [, digits, unit] = match;
    const normalizedUnit = unit.toLocaleLowerCase('vi');
    const multiplier = ['k', 'nghìn', 'ngàn'].includes(normalizedUnit) ? 1_000 : ['tr', 'triệu'].includes(normalizedUnit) ? 1_000_000 : 1;
    const grouped = /^\d{1,3}(?:\.\d{3})+$|^\d{1,3}(?:,\d{3})+$/.test(digits);
    const decimal = multiplier > 1 && /^\d+[.,]\d{1,2}$/.test(digits);
    const valid = /^\d+$/.test(digits) || decimal || (grouped && multiplier === 1);
    const amount = valid ? Number(grouped ? digits.replace(/[.,]/g, '') : digits.replace(',', '.')) * multiplier : 0;
    return { start: match.index, length: match[0].length, amount };
  });
}

function withoutMentions(value: string, mentions: Mention[]) {
  return [...mentions].sort((a, b) => b.start - a.start).reduce(
    (text, { start, length }) => text.slice(0, start) + ' ' + text.slice(start + length),
    value,
  );
}

function tidyDescription(value: string) {
  return value.replace(/\s+/g, ' ').replace(/^[\s,.:;–—-]+|[\s,.:;–—-]+$/g, '');
}

export function cleanTransactionDescription(value: string, amount: number, today: string) {
  const withoutDates = withoutMentions(value, extractDates(value, today));
  const money = extractMoney(withoutDates).filter((item) => item.amount === amount);
  if (money.length) return tidyDescription(withoutMentions(withoutDates, money));

  const bareMoney = [...withoutDates.matchAll(wholeAmountPattern)]
    .filter((match) => Number(match[0].replace(/[.,]/g, '')) === amount)
    .map((match) => ({ start: match.index, length: match[0].length }));
  return tidyDescription(withoutMentions(withoutDates, bareMoney).replace(spokenAmountPattern, ' '));
}

export function findChatTransactionDate(value: string, today: string) {
  const dates = extractDates(value, today);
  return dates.length === 1 ? dates[0] : undefined;
}

export function parseSimpleChatTransaction(value: string, today: string) {
  if (/[?;\n]/u.test(value) || /(?:^|[^\p{L}])(?:và|hoặc|chưa|đừng|không|dự định|sẽ|ghi chú|trả nợ|sửa|xóa)(?!\p{L})/iu.test(value)) return null;
  const dates = extractDates(value, today);
  if (dates.length > 1 || dates.some(({ date }) => !date)) return null;
  const withoutDates = withoutMentions(value, dates);
  const matches = extractMoney(withoutDates);
  if (matches.length !== 1) return null;
  const money = matches[0];
  const before = withoutDates.slice(0, money.start).trim();
  const after = withoutDates.slice(money.start + money.length).trim();
  if (/[-−]$/.test(before) || (before && /[\p{L}\p{N}]/u.test(after))) return null;

  const description = tidyDescription(withoutMentions(withoutDates, matches));
  if (!description || !Number.isSafeInteger(money.amount) || money.amount <= 0) return null;
  return { amount: money.amount, description, date: dates[0]?.date ?? today };
}
