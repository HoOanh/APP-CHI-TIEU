import type { Client } from '@libsql/client';

export interface ExpenseTagItem {
  id: number;
  name: string;
  color: string;
}

export const TAG_COLOR_PALETTE = [
  '#0ea5e9',
  '#8b5cf6',
  '#f59e0b',
  '#10b981',
  '#ec4899',
  '#6366f1',
  '#ef4444',
  '#14b8a6',
];

export function pickTagColor(tagName: string): string {
  let hash = 0;
  for (let i = 0; i < tagName.length; i += 1) {
    hash = (hash * 31 + tagName.charCodeAt(i)) >>> 0;
  }
  return TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length];
}

export function normalizeTagName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/^#+/, '')
    .normalize('NFC')
    .toLocaleLowerCase('vi')
    .replace(/[\s/]+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return cleaned.slice(0, 32);
}

const HASHTAG_RE = /(?:^|\s)#([\p{L}\p{N}_-]{1,32})/gu;

export function extractHashtagsFromText(text: string): {
  tags: string[];
  cleanedText: string;
  hasReimburseHint: boolean;
} {
  const tags: string[] = [];
  const seen = new Set<string>();
  const matches = text.matchAll(HASHTAG_RE);
  for (const match of matches) {
    const normalized = normalizeTagName(match[1] || '');
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      tags.push(normalized);
    }
  }

  const cleanedText = text
    .replace(/(?:^|\s)#[\p{L}\p{N}_-]{1,32}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const lower = text.normalize('NFC').toLocaleLowerCase('vi');
  const hasReimburseHint =
    seen.has('hoan-ung')
    || seen.has('reimburse')
    || /(?<![\p{L}\p{N}])(?:chờ hoàn ứng|hoàn ứng|ứng trước)(?![\p{L}\p{N}])/iu.test(lower);

  return { tags, cleanedText, hasReimburseHint };
}

export async function syncExpenseTags(
  db: Client,
  ledgerId: number,
  expenseId: number,
  rawTags: string[],
): Promise<ExpenseTagItem[]> {
  const normalizedNames = Array.from(
    new Set(rawTags.map((t) => normalizeTagName(t)).filter(Boolean)),
  ).slice(0, 10);

  await db.execute({
    sql: 'DELETE FROM expense_tags WHERE expense_id = ?',
    args: [expenseId],
  });

  if (normalizedNames.length === 0) {
    return [];
  }

  await db.batch(
    normalizedNames.map((name) => ({
      sql: `INSERT OR IGNORE INTO tags (ledger_id, name, color) VALUES (?, ?, ?)`,
      args: [ledgerId, name, pickTagColor(name)],
    })),
    'write',
  );

  const placeholders = normalizedNames.map(() => '?').join(', ');
  const tagRows = await db.execute({
    sql: `SELECT id, name, color FROM tags WHERE ledger_id = ? AND name IN (${placeholders}) ORDER BY name ASC`,
    args: [ledgerId, ...normalizedNames],
  });

  const tags: ExpenseTagItem[] = tagRows.rows.map((row) => ({
    id: Number(row.id),
    name: String(row.name),
    color: String(row.color || '#64748b'),
  }));

  if (tags.length > 0) {
    await db.batch(
      tags.map((tag) => ({
        sql: 'INSERT OR IGNORE INTO expense_tags (expense_id, tag_id) VALUES (?, ?)',
        args: [expenseId, tag.id],
      })),
      'write',
    );
  }

  return tags;
}

export async function getTagsForExpenses(
  db: Client,
  expenseIds: number[],
): Promise<Map<number, ExpenseTagItem[]>> {
  const map = new Map<number, ExpenseTagItem[]>();
  const validIds = Array.from(new Set(expenseIds.filter((id) => Number.isInteger(id) && id > 0)));
  if (validIds.length === 0) return map;

  const placeholders = validIds.map(() => '?').join(', ');
  const res = await db.execute({
    sql: `SELECT et.expense_id, t.id, t.name, t.color
          FROM expense_tags et
          JOIN tags t ON t.id = et.tag_id
          WHERE et.expense_id IN (${placeholders})
          ORDER BY t.name ASC`,
    args: validIds,
  });

  for (const row of res.rows) {
    const expenseId = Number(row.expense_id);
    const list = map.get(expenseId) ?? [];
    list.push({
      id: Number(row.id),
      name: String(row.name),
      color: String(row.color || '#64748b'),
    });
    map.set(expenseId, list);
  }
  return map;
}
