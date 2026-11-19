import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getBudgetAlert } from '@/lib/budget-alert';
import { getCurrentUser } from '@/lib/current-user';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { getTagsForExpenses, syncExpenseTags } from '@/lib/tags';

interface RouteContext { params: Promise<{ id: string }> }

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const payload = await request.json() as {
      amount?: unknown;
      description?: unknown;
      note?: unknown;
      category_id?: unknown;
      account_id?: unknown;
      to_account_id?: unknown;
      expense_date?: unknown;
      type?: unknown;
      reimburse_status?: unknown;
      tags?: unknown;
    };
    const reimburseStatus = payload.reimburse_status === 'pending' || payload.reimburse_status === 'settled' || payload.reimburse_status === 'none'
      ? payload.reimburse_status
      : undefined;
    const tagList = Array.isArray(payload.tags)
      ? payload.tags.filter((item): item is string => typeof item === 'string')
      : undefined;
    const amount = Number(payload.amount);
    const description = typeof payload.description === 'string' ? payload.description.trim() : '';
    const type = payload.type === 'income' || payload.type === 'transfer' ? payload.type : 'expense';
    const isTransfer = type === 'transfer';
    const categoryId = payload.category_id === null || payload.category_id === undefined || payload.category_id === ''
      ? null
      : Number(payload.category_id);
    const expenseDate = payload.expense_date;

    if (
      !Number.isFinite(amount)
      || amount <= 0
      || !description
      || description.length > 160
      || !isValidDate(expenseDate)
      || !['income', 'expense', 'transfer'].includes(String(payload.type))
      || (!isTransfer && (!categoryId || !Number.isInteger(categoryId) || categoryId <= 0))
    ) {
      return NextResponse.json({ error: 'Thông tin giao dịch chưa hợp lệ.' }, { status: 400 });
    }

    const db = await getDb();
    const { ledgerId, defaultAccountId } = await ensureUserLedgerAndAccount(db, user.id);

    const existingResult = await db.execute({
      sql: 'SELECT ledger_id, user_id, amount, category_id, account_id, to_account_id, expense_date, type FROM expenses WHERE id = ?',
      args: [id],
    });
    const previous = existingResult.rows[0];
    if (!previous) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const targetLedgerId = previous.ledger_id ? Number(previous.ledger_id) : ledgerId;
    if (!previous.ledger_id && Number(previous.user_id) !== user.id) {
      return NextResponse.json({ error: 'Bạn không có quyền truy cập giao dịch này.' }, { status: 403 });
    }
    await assertLedgerAccess(db, user.id, targetLedgerId, 'editor');

    const resolvedAccountId = payload.account_id
      ? Number(payload.account_id)
      : Number(previous.account_id || defaultAccountId);
    const resolvedToAccountId = isTransfer
      ? Number(payload.to_account_id || previous.to_account_id || 0)
      : null;

    if (!Number.isInteger(resolvedAccountId) || resolvedAccountId <= 0) {
      return NextResponse.json({ error: 'Ví nguồn không hợp lệ.' }, { status: 400 });
    }
    if (isTransfer) {
      if (!resolvedToAccountId || resolvedToAccountId === resolvedAccountId) {
        return NextResponse.json({ error: 'Chọn ví đích khác ví nguồn.' }, { status: 400 });
      }
      const accCheck = await db.execute({
        sql: 'SELECT id FROM accounts WHERE ledger_id = ? AND id IN (?, ?)',
        args: [ledgerId, resolvedAccountId, resolvedToAccountId],
      });
      if (accCheck.rows.length < 2) {
        return NextResponse.json({ error: 'Ví nguồn hoặc ví đích không hợp lệ.' }, { status: 400 });
      }
    } else {
      const category = await db.execute({
        sql: 'SELECT id FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
        args: [categoryId!, user.id],
      });
      if (!category.rows[0]) {
        return NextResponse.json({ error: 'Danh mục không hợp lệ.' }, { status: 400 });
      }
    }

    await db.execute({
      sql: `
        UPDATE expenses
        SET amount = ?, description = ?, note = ?, category_id = ?, account_id = ?, to_account_id = ?, expense_date = ?, type = ?,
            reimburse_status = COALESCE(?, reimburse_status)
        WHERE id = ?
      `,
      args: [
        amount,
        description,
        typeof payload.note === 'string' ? payload.note.trim() : '',
        isTransfer ? null : categoryId,
        resolvedAccountId,
        resolvedToAccountId,
        expenseDate,
        type,
        isTransfer ? 'none' : (reimburseStatus ?? null),
        id,
      ]
    });

    const syncedTags = tagList !== undefined
      ? await syncExpenseTags(db, targetLedgerId, Number(id), tagList)
      : (await getTagsForExpenses(db, [Number(id)])).get(Number(id)) ?? [];

    const updated = await db.execute({
      sql: `
        SELECT e.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
               a1.name AS account_name, a2.name AS to_account_name,
               cu.name AS created_by_name, cu.avatar AS created_by_avatar
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        LEFT JOIN accounts a1 ON e.account_id = a1.id
        LEFT JOIN accounts a2 ON e.to_account_id = a2.id
        LEFT JOIN users cu ON cu.id = COALESCE(e.created_by_user_id, e.user_id)
        WHERE e.id = ?
      `,
      args: [id]
    });

    if (!updated.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const sameBucketMonth =
      previous.type === 'expense'
      && categoryId !== null
      && Number(previous.category_id) === categoryId
      && String(previous.expense_date).slice(0, 7) === expenseDate.slice(0, 7);
    const addedDelta = sameBucketMonth
      ? Math.max(0, amount - (Number(previous.amount) || 0))
      : amount;

    const budgetAlert = type === 'expense' && categoryId !== null && addedDelta > 0
      ? await getBudgetAlert({
          db,
          userId: user.id,
          categoryId,
          expenseDate,
          addedAmount: addedDelta,
        })
      : null;

    return NextResponse.json({
      ...updated.rows[0],
      tags: syncedTags,
      budgetAlert,
    });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to update expense' }, { status: 500 });
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const rawBody: unknown = await request.json().catch(() => null);
    if (!rawBody || typeof rawBody !== 'object') {
      return NextResponse.json({ error: 'Dữ liệu không hợp lệ.' }, { status: 400 });
    }
    const body = rawBody as { reimburse_status?: unknown; tags?: unknown };
    const nextStatus = body.reimburse_status === 'none' || body.reimburse_status === 'pending' || body.reimburse_status === 'settled'
      ? body.reimburse_status
      : undefined;
    const nextTags = Array.isArray(body.tags)
      ? body.tags.filter((item): item is string => typeof item === 'string')
      : undefined;

    if (nextStatus === undefined && nextTags === undefined) {
      return NextResponse.json({ error: 'Không có trường hợp lệ để cập nhật.' }, { status: 400 });
    }

    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);
    const existing = await db.execute({
      sql: 'SELECT id, ledger_id, user_id, type FROM expenses WHERE id = ? LIMIT 1',
      args: [id],
    });
    const row = existing.rows[0];
    if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const targetLedgerId = row.ledger_id ? Number(row.ledger_id) : ledgerId;
    if (!row.ledger_id && Number(row.user_id) !== user.id) {
      return NextResponse.json({ error: 'Bạn không có quyền sửa giao dịch này.' }, { status: 403 });
    }
    await assertLedgerAccess(db, user.id, targetLedgerId, 'editor');

    if (nextStatus !== undefined && row.type !== 'transfer') {
      await db.execute({
        sql: 'UPDATE expenses SET reimburse_status = ? WHERE id = ?',
        args: [nextStatus, id],
      });
    }

    const syncedTags = nextTags !== undefined
      ? await syncExpenseTags(db, targetLedgerId, Number(id), nextTags)
      : (await getTagsForExpenses(db, [Number(id)])).get(Number(id)) ?? [];

    const refreshed = await db.execute({
      sql: 'SELECT id, reimburse_status FROM expenses WHERE id = ? LIMIT 1',
      args: [id],
    });

    return NextResponse.json({
      id: Number(refreshed.rows[0]?.id || id),
      reimburse_status: String(refreshed.rows[0]?.reimburse_status || 'none'),
      tags: syncedTags,
    });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to patch expense' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await context.params;
    const db = await getDb();
    const { ledgerId } = await ensureUserLedgerAndAccount(db, user.id);

    const existing = await db.execute({
      sql: 'SELECT ledger_id, user_id FROM expenses WHERE id = ? LIMIT 1',
      args: [id],
    });
    const row = existing.rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const targetLedgerId = row.ledger_id ? Number(row.ledger_id) : ledgerId;
    if (!row.ledger_id && Number(row.user_id) !== user.id) {
      return NextResponse.json({ error: 'Bạn không có quyền xóa giao dịch này.' }, { status: 403 });
    }
    await assertLedgerAccess(db, user.id, targetLedgerId, 'editor');

    const deleted = await db.execute({
      sql: 'DELETE FROM expenses WHERE id = ?',
      args: [id]
    });

    if (Number(deleted.rowsAffected) === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
