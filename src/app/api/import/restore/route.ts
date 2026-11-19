import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { UNCLASSIFIED_EXPENSE } from '@/lib/schema';

const restoreSchema = z.object({
  mode: z.enum(['merge', 'replace']).optional().default('merge'),
  backup: z.object({
    categories: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    accounts: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    expenses: z.array(z.record(z.string(), z.unknown())).optional().default([]),
    budgets: z.array(z.record(z.string(), z.unknown())).optional().default([]),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = restoreSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'File backup JSON không đúng định dạng.' }, { status: 400 });
    }

    const db = await getDb();
    const ctx = await ensureUserLedgerAndAccount(db, user.id);
    const { mode, backup } = parsed.data;

    const tx = await db.transaction('write');
    try {
      if (mode === 'replace') {
        await tx.execute({ sql: 'DELETE FROM budget_jars WHERE user_id = ?', args: [user.id] });
        await tx.execute({ sql: 'DELETE FROM expenses WHERE user_id = ?', args: [user.id] });
      }

      // Map categories by lowercase name (keeping existing, inserting missing user categories)
      const existingCatsRes = await tx.execute({
        sql: 'SELECT id, name FROM categories WHERE user_id IS NULL OR user_id = ?',
        args: [user.id],
      });
      const catNameToId = new Map<string, number>();
      for (const row of existingCatsRes.rows) {
        catNameToId.set(String(row.name).normalize('NFC').toLocaleLowerCase('vi').trim(), Number(row.id));
      }
      const oldCatIdToNewId = new Map<number, number>();
      let restoredCategories = 0;

      for (const rawCat of backup.categories) {
        const name = typeof rawCat.name === 'string' ? rawCat.name.trim() : '';
        if (!name) continue;
        const lower = name.normalize('NFC').toLocaleLowerCase('vi');
        let resolvedId = catNameToId.get(lower);
        if (!resolvedId) {
          const ins = await tx.execute({
            sql: `INSERT INTO categories (user_id, ledger_id, name, icon, color, kind, budget_group)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
              user.id,
              ctx.ledgerId,
              name.slice(0, 60),
              typeof rawCat.icon === 'string' ? rawCat.icon : 'tag',
              typeof rawCat.color === 'string' ? rawCat.color : '#64748b',
              rawCat.kind === 'income' ? 'income' : 'expense',
              rawCat.budget_group === 'needs' || rawCat.budget_group === 'savings' ? rawCat.budget_group : 'wants',
            ],
          });
          resolvedId = Number(ins.lastInsertRowid);
          catNameToId.set(lower, resolvedId);
          restoredCategories += 1;
        }
        if (rawCat.id !== undefined && rawCat.id !== null) {
          oldCatIdToNewId.set(Number(rawCat.id), resolvedId);
        }
      }

      // Map accounts
      const existingAccRes = await tx.execute({
        sql: 'SELECT id, name FROM accounts WHERE ledger_id = ?',
        args: [ctx.ledgerId],
      });
      const accNameToId = new Map<string, number>();
      for (const row of existingAccRes.rows) {
        accNameToId.set(String(row.name).normalize('NFC').toLocaleLowerCase('vi').trim(), Number(row.id));
      }
      const oldAccIdToNewId = new Map<number, number>();
      let restoredAccounts = 0;
      for (const rawAcc of backup.accounts) {
        const name = typeof rawAcc.name === 'string' ? rawAcc.name.trim() : '';
        if (!name) continue;
        const lower = name.normalize('NFC').toLocaleLowerCase('vi');
        let resolvedId = accNameToId.get(lower);
        if (!resolvedId) {
          const ins = await tx.execute({
            sql: `INSERT INTO accounts (ledger_id, user_id, name, type, initial_balance, is_default)
                  VALUES (?, ?, ?, ?, ?, 0)`,
            args: [
              ctx.ledgerId,
              user.id,
              name.slice(0, 60),
              ['cash', 'bank', 'ewallet', 'credit_card', 'savings'].includes(String(rawAcc.type)) ? String(rawAcc.type) : 'cash',
              Number(rawAcc.initial_balance) || 0,
            ],
          });
          resolvedId = Number(ins.lastInsertRowid);
          accNameToId.set(lower, resolvedId);
          restoredAccounts += 1;
        }
        if (rawAcc.id !== undefined && rawAcc.id !== null) {
          oldAccIdToNewId.set(Number(rawAcc.id), resolvedId);
        }
      }

      const fallbackCatId = catNameToId.get(UNCLASSIFIED_EXPENSE.toLocaleLowerCase('vi')) ?? catNameToId.values().next().value ?? null;

      // Dedupe set for merge mode
      const existingExpKeys = new Set<string>();
      if (mode === 'merge') {
        const expRes = await tx.execute({
          sql: 'SELECT expense_date, amount, description FROM expenses WHERE user_id = ?',
          args: [user.id],
        });
        for (const r of expRes.rows) {
          existingExpKeys.add(`${String(r.expense_date)}|${Math.round(Number(r.amount))}|${String(r.description).toLocaleLowerCase('vi').trim()}`);
        }
      }

      let restoredExpenses = 0;
      for (const rawExp of backup.expenses) {
        const amount = Number(rawExp.amount);
        const date = typeof rawExp.expense_date === 'string' ? rawExp.expense_date : '';
        const description = typeof rawExp.description === 'string' ? rawExp.description.trim() : '';
        const txType = rawExp.type === 'income' || rawExp.type === 'transfer' ? rawExp.type : 'expense';
        if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !description) continue;

        const key = `${date}|${Math.round(amount)}|${description.toLocaleLowerCase('vi')}`;
        if (mode === 'merge' && existingExpKeys.has(key)) continue;
        existingExpKeys.add(key);

        const mappedCatId = txType === 'transfer'
          ? null
          : (oldCatIdToNewId.get(Number(rawExp.category_id)) ?? fallbackCatId);
        const mappedAccId = oldAccIdToNewId.get(Number(rawExp.account_id)) ?? ctx.defaultAccountId;
        const mappedToAccId = txType === 'transfer'
          ? (oldAccIdToNewId.get(Number(rawExp.to_account_id)) ?? null)
          : null;

        await tx.execute({
          sql: `INSERT INTO expenses
                  (user_id, ledger_id, account_id, to_account_id, created_by_user_id, source, amount, description, note, category_id, expense_date, type)
                VALUES (?, ?, ?, ?, ?, 'import', ?, ?, ?, ?, ?, ?)`,
          args: [
            user.id,
            ctx.ledgerId,
            mappedAccId,
            mappedToAccId,
            user.id,
            amount,
            description.slice(0, 160),
            typeof rawExp.note === 'string' ? rawExp.note.slice(0, 500) : '',
            mappedCatId,
            date,
            txType,
          ],
        });
        restoredExpenses += 1;
      }

      let restoredBudgets = 0;
      for (const rawB of backup.budgets) {
        const month = typeof rawB.month === 'string' ? rawB.month : '';
        const budgetAmount = Number(rawB.budget_amount);
        const mappedCatId = oldCatIdToNewId.get(Number(rawB.category_id));
        if (!/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(budgetAmount) || budgetAmount <= 0 || !mappedCatId) continue;

        await tx.execute({
          sql: `INSERT INTO budget_jars (user_id, ledger_id, category_id, month, budget_amount, rollover_enabled, rollover_mode, rollover_amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, category_id, month) DO NOTHING`,
          args: [
            user.id,
            ctx.ledgerId,
            mappedCatId,
            month,
            budgetAmount,
            Number(rawB.rollover_enabled) === 1 ? 1 : 0,
            rawB.rollover_mode === 'all' ? 'all' : 'positive_only',
            Number(rawB.rollover_amount) || 0,
          ],
        });
        restoredBudgets += 1;
      }

      await tx.commit();
      return NextResponse.json({
        ok: true,
        imported: {
          categories: restoredCategories,
          accounts: restoredAccounts,
          expenses: restoredExpenses,
          budgets: restoredBudgets,
        },
      });
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } catch (error) {
    console.error('[POST /api/import/restore]', error);
    return NextResponse.json({ error: 'Không thể khôi phục dữ liệu backup.' }, { status: 500 });
  }
}
