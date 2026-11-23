import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getBudgetAlert } from '@/lib/budget-alert';
import { getCurrentUser } from '@/lib/current-user';
import { assertLedgerAccess, LedgerAccessError, notifyOtherLedgerMembers } from '@/lib/ledger-access';
import { ensureUserLedgerAndAccount } from '@/lib/ledger-context';
import { UNCLASSIFIED_EXPENSE } from '@/lib/schema';
import { getTagsForExpenses, normalizeTagName, syncExpenseTags } from '@/lib/tags';
import { formatCurrency, getVietnamToday } from '@/lib/utils';
import { sendPushToUser } from '@/lib/web-push';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const db = await getDb();
    const ctx = await ensureUserLedgerAndAccount(db, user.id);
    const requestedLedgerParam = request.nextUrl.searchParams.get('ledger_id');
    const ledgerId = requestedLedgerParam && /^\d+$/.test(requestedLedgerParam)
      ? Number(requestedLedgerParam)
      : ctx.ledgerId;
    const grant = await assertLedgerAccess(db, user.id, ledgerId, 'viewer');

    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get('month');
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const typeFilter = searchParams.get('type');
    const accountIdParam = searchParams.get('account_id');
    const categoryId = searchParams.get('category_id');
    const unplannedParam = searchParams.get('unplanned');
    const tagParam = searchParams.get('tag')?.trim();
    const reimburseParam = searchParams.get('reimburse_status')?.trim();
    const search = searchParams.get('search')?.trim();
    const cursor = searchParams.get('cursor');
    const limitRaw = Number(searchParams.get('limit') || 50);
    const limit = Number.isInteger(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 50;

    let whereSql = 'WHERE (e.ledger_id = ? OR (e.ledger_id IS NULL AND e.user_id = ?))';
    const whereArgs: Array<string | number> = [ledgerId, user.id];

    if (month && month !== 'all') {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return NextResponse.json({ error: 'Tháng không hợp lệ.' }, { status: 400 });
      }
      const [year, value] = month.split('-').map(Number);
      const end = value === 12
        ? `${String(year + 1).padStart(4, '0')}-01`
        : `${month.slice(0, 4)}-${String(value + 1).padStart(2, '0')}`;
      whereSql += ' AND e.expense_date >= ? AND e.expense_date < ?';
      whereArgs.push(`${month}-01`, `${end}-01`);
    } else {
      if (from && isValidDate(from)) {
        whereSql += ' AND e.expense_date >= ?';
        whereArgs.push(from);
      }
      if (to && isValidDate(to)) {
        whereSql += ' AND e.expense_date <= ?';
        whereArgs.push(to);
      }
    }

    if (typeFilter && ['expense', 'income', 'transfer'].includes(typeFilter)) {
      whereSql += ' AND e.type = ?';
      whereArgs.push(typeFilter);
    }

    if (accountIdParam && accountIdParam !== 'all') {
      const accountIdNum = Number(accountIdParam);
      if (Number.isInteger(accountIdNum) && accountIdNum > 0) {
        whereSql += ' AND (e.account_id = ? OR e.to_account_id = ?)';
        whereArgs.push(accountIdNum, accountIdNum);
      }
    }

    if (categoryId && categoryId !== 'all') {
      if (categoryId === 'unclassified') {
        whereSql += ' AND (e.category_id IS NULL OR c.name = ?)';
        whereArgs.push(UNCLASSIFIED_EXPENSE);
      } else {
        whereSql += ' AND e.category_id = ?';
        whereArgs.push(categoryId);
      }
    }

    if (unplannedParam === '1' || unplannedParam === 'true') {
      whereSql += ` AND e.type = 'expense' AND (e.category_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM budget_jars b
        WHERE (b.ledger_id = ? OR (b.ledger_id IS NULL AND b.user_id = ?))
          AND b.category_id = e.category_id
          AND b.month = strftime('%Y-%m', e.expense_date)
      ))`;
      whereArgs.push(ledgerId, user.id);
    }

    if (tagParam && tagParam !== 'all') {
      const normalizedTag = normalizeTagName(tagParam);
      if (normalizedTag) {
        whereSql += ` AND EXISTS (
          SELECT 1 FROM expense_tags et
          JOIN tags t ON t.id = et.tag_id
          WHERE et.expense_id = e.id AND t.ledger_id = ? AND t.name = ?
        )`;
        whereArgs.push(ledgerId, normalizedTag);
      }
    }

    if (reimburseParam && ['none', 'pending', 'settled'].includes(reimburseParam)) {
      whereSql += " AND COALESCE(e.reimburse_status, 'none') = ?";
      whereArgs.push(reimburseParam);
    }

    if (search) {
      whereSql += ' AND (e.description LIKE ? OR e.note LIKE ?)';
      whereArgs.push(`%${search}%`, `%${search}%`);
    }

    let cursorSql = '';
    const cursorArgs: Array<string | number> = [];
    if (cursor) {
      const sep = cursor.lastIndexOf(':');
      if (sep > 0) {
        const cursorDate = cursor.slice(0, sep);
        const cursorId = Number(cursor.slice(sep + 1));
        if (isValidDate(cursorDate) && Number.isInteger(cursorId) && cursorId > 0) {
          cursorSql = ' AND (e.expense_date < ? OR (e.expense_date = ? AND e.id < ?))';
          cursorArgs.push(cursorDate, cursorDate, cursorId);
        }
      }
    }

    const [summaryResult, itemsResult, memberCountResult] = await Promise.all([
      db.execute({
        sql: `SELECT
                COALESCE(SUM(CASE WHEN e.type = 'income' THEN e.amount ELSE 0 END), 0) AS total_income,
                COALESCE(SUM(CASE WHEN e.type = 'expense' THEN e.amount ELSE 0 END), 0) AS total_expense
              FROM expenses e
              ${whereSql}`,
        args: whereArgs,
      }),
      db.execute({
        sql: `SELECT e.id, e.amount, e.description, e.note, e.category_id, e.account_id, e.to_account_id,
                     e.expense_date, e.type, e.reimburse_status, e.created_at, e.created_by_user_id,
                     COALESCE(co.name, c.name, '${UNCLASSIFIED_EXPENSE}') AS category_name,
                     COALESCE(co.icon, c.icon, 'tag') AS category_icon,
                     COALESCE(co.color, c.color, '#64748B') AS category_color,
                     a1.name AS account_name, a2.name AS to_account_name,
                     cu.name AS created_by_name, cu.avatar AS created_by_avatar,
                     CASE WHEN e.type = 'expense' AND e.category_id IS NOT NULL AND EXISTS (
                       SELECT 1 FROM budget_jars b
                       WHERE (b.ledger_id = ? OR (b.ledger_id IS NULL AND b.user_id = ?))
                         AND b.category_id = e.category_id
                         AND b.month = strftime('%Y-%m', e.expense_date)
                     ) THEN 1 ELSE 0 END AS in_budget_jar
              FROM expenses e
              LEFT JOIN categories c ON e.category_id = c.id
              LEFT JOIN category_overrides co ON co.category_id = c.id AND co.user_id = ?
              LEFT JOIN accounts a1 ON e.account_id = a1.id
              LEFT JOIN accounts a2 ON e.to_account_id = a2.id
              LEFT JOIN users cu ON cu.id = COALESCE(e.created_by_user_id, e.user_id)
              ${whereSql}${cursorSql}
              ORDER BY e.expense_date DESC, e.id DESC
              LIMIT ?`,
        args: [ledgerId, user.id, user.id, ...whereArgs, ...cursorArgs, limit + 1],
      }),
      db.execute({
        sql: 'SELECT COUNT(*) AS cnt FROM ledger_members WHERE ledger_id = ?',
        args: [ledgerId],
      }),
    ]);

    const memberCount = Math.max(1, Number(memberCountResult.rows[0]?.cnt) || 1);
    const rows = itemsResult.rows;
    const hasMore = rows.length > limit;
    const rawItems = hasMore ? rows.slice(0, limit) : rows;
    const tagMap = await getTagsForExpenses(
      db,
      rawItems.map((item) => Number(item.id)),
    );
    const items = rawItems.map((row) => ({
      ...row,
      reimburse_status: String(row.reimburse_status || 'none'),
      tags: tagMap.get(Number(row.id)) ?? [],
    }));
    const last = rawItems[rawItems.length - 1];
    const nextCursor = hasMore && last
      ? `${String(last.expense_date)}:${Number(last.id)}`
      : null;

    const totalIncome = Number(summaryResult.rows[0]?.total_income) || 0;
    const totalExpense = Number(summaryResult.rows[0]?.total_expense) || 0;
    const total = totalIncome - totalExpense;

    return NextResponse.json({
      items,
      total,
      totalIncome,
      totalExpense,
      nextCursor,
      hasMore,
      ledger: {
        id: ledgerId,
        name: grant.ledgerName,
        kind: grant.ledgerKind,
        role: grant.role,
        isShared: grant.ledgerKind !== 'personal' || memberCount > 1,
      },
    });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json() as Record<string, unknown>;
    const {
      amount,
      description,
      note,
      category_id,
      account_id,
      to_account_id,
      expense_date,
      date,
      type = 'expense',
      reimburse_status,
      tags: rawTags,
      client_request_id,
    } = body;

    const normalizedReimburse = reimburse_status === 'pending' || reimburse_status === 'settled'
      ? reimburse_status
      : 'none';
    const tagList = Array.isArray(rawTags)
      ? rawTags.filter((item): item is string => typeof item === 'string')
      : [];

    const finalDate = expense_date || date || getVietnamToday();
    const numericAmount = Number(amount);
    const normalizedDescription = typeof description === 'string' ? description.trim() : '';
    const normalizedType = type === 'income' || type === 'transfer' ? type : 'expense';
    const isTransfer = normalizedType === 'transfer';
    const normalizedCategoryId =
      category_id === null || category_id === undefined || category_id === '' || category_id === 'unclassified'
        ? null
        : Number(category_id);
    const clientRequestId = typeof client_request_id === 'string'
      && /^[A-Za-z0-9_-]{8,120}$/.test(client_request_id)
      ? client_request_id
      : null;

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0 ||
      !normalizedDescription ||
      !['income', 'expense', 'transfer'].includes(String(type)) ||
      !isValidDate(finalDate) ||
      (!isTransfer && normalizedCategoryId !== null && (!Number.isInteger(normalizedCategoryId) || normalizedCategoryId <= 0))
    ) {
      return NextResponse.json(
        { error: 'Invalid transaction data' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const ctx = await ensureUserLedgerAndAccount(db, user.id);
    const requestedLedgerId = typeof body.ledger_id === 'number' && Number.isInteger(body.ledger_id) && body.ledger_id > 0
      ? body.ledger_id
      : ctx.ledgerId;
    const grant = await assertLedgerAccess(db, user.id, requestedLedgerId, 'editor');
    const ledgerId = grant.ledgerId;
    const defaultAccountId = ctx.defaultAccountId;

    const resolvedAccountId = account_id ? Number(account_id) : defaultAccountId;
    const resolvedToAccountId = isTransfer && to_account_id ? Number(to_account_id) : null;

    let finalCategoryId: number | null = isTransfer ? null : normalizedCategoryId;

    if (!Number.isInteger(resolvedAccountId) || resolvedAccountId <= 0) {
      return NextResponse.json({ error: 'Ví nguồn không hợp lệ.' }, { status: 400 });
    }
    if (isTransfer) {
      if (!resolvedToAccountId || !Number.isInteger(resolvedToAccountId) || resolvedToAccountId <= 0 || resolvedToAccountId === resolvedAccountId) {
        return NextResponse.json({ error: 'Chọn ví đích khác ví nguồn.' }, { status: 400 });
      }
      const accCheck = await db.execute({
        sql: 'SELECT id FROM accounts WHERE ledger_id = ? AND id IN (?, ?) AND archived = 0',
        args: [ledgerId, resolvedAccountId, resolvedToAccountId],
      });
      if (accCheck.rows.length < 2) {
        return NextResponse.json({ error: 'Ví nguồn hoặc ví đích không hợp lệ.' }, { status: 400 });
      }
    } else {
      const accCheck = await db.execute({
        sql: 'SELECT id FROM accounts WHERE ledger_id = ? AND id = ? AND archived = 0',
        args: [ledgerId, resolvedAccountId],
      });
      if (!accCheck.rows[0]) {
        return NextResponse.json({ error: 'Ví không hợp lệ.' }, { status: 400 });
      }

      if (finalCategoryId !== null) {
        const categoryResult = await db.execute({
          sql: 'SELECT id, name FROM categories WHERE id = ? AND (user_id IS NULL OR user_id = ?)',
          args: [finalCategoryId, user.id],
        });
        if (!categoryResult.rows[0]) {
          return NextResponse.json({ error: 'Danh mục không hợp lệ.' }, { status: 400 });
        }
      } else if (normalizedType === 'expense') {
        const fallbackCat = await db.execute({
          sql: 'SELECT id FROM categories WHERE lower(name) = lower(?) AND (user_id IS NULL OR user_id = ?) LIMIT 1',
          args: [UNCLASSIFIED_EXPENSE, user.id],
        });
        finalCategoryId = fallbackCat.rows[0] ? Number(fallbackCat.rows[0].id) : null;
      }
    }

    const insertResult = await db.execute({
      sql: `
        INSERT INTO expenses
          (user_id, ledger_id, account_id, to_account_id, amount, description, note, category_id, expense_date, type, reimburse_status, created_by_user_id, client_request_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, client_request_id) WHERE client_request_id IS NOT NULL DO NOTHING
      `,
      args: [
        user.id,
        ledgerId,
        resolvedAccountId,
        resolvedToAccountId,
        numericAmount,
        normalizedDescription,
        typeof note === 'string' ? note.trim() : '',
        finalCategoryId,
        finalDate,
        normalizedType,
        isTransfer ? 'none' : normalizedReimburse,
        user.id,
        clientRequestId,
      ]
    });

    const wasInserted = Number(insertResult.rowsAffected) > 0;

    const newExpense = await db.execute({
      sql: `
        SELECT e.id, e.amount, e.description, e.note, e.category_id, e.account_id, e.to_account_id,
               e.expense_date, e.type, e.reimburse_status, e.created_at, e.created_by_user_id,
               COALESCE(c.name, '${UNCLASSIFIED_EXPENSE}') AS category_name,
               COALESCE(c.icon, 'tag') AS category_icon,
               COALESCE(c.color, '#64748B') AS category_color,
               a1.name AS account_name, a2.name AS to_account_name,
               cu.name AS created_by_name, cu.avatar AS created_by_avatar
        FROM expenses e
        LEFT JOIN categories c ON e.category_id = c.id
        LEFT JOIN accounts a1 ON e.account_id = a1.id
        LEFT JOIN accounts a2 ON e.to_account_id = a2.id
        LEFT JOIN users cu ON cu.id = COALESCE(e.created_by_user_id, e.user_id)
        WHERE e.ledger_id = ? AND ${clientRequestId ? 'e.user_id = ? AND e.client_request_id = ?' : 'e.id = ?'}
      `,
      args: clientRequestId
        ? [ledgerId, user.id, clientRequestId]
        : [ledgerId, insertResult.lastInsertRowid!]
    });

    if (!newExpense.rows[0]) {
      return NextResponse.json({ error: 'Không thể xác nhận giao dịch đã lưu.' }, { status: 500 });
    }

    const createdRow = newExpense.rows[0];
    const savedTags = wasInserted && tagList.length > 0
      ? await syncExpenseTags(db, ledgerId, Number(createdRow.id), tagList)
      : (await getTagsForExpenses(db, [Number(createdRow.id)])).get(Number(createdRow.id)) ?? [];

    const budgetAlert = wasInserted && normalizedType === 'expense' && finalCategoryId
      ? await getBudgetAlert({
        db,
        userId: user.id,
        ledgerId,
        categoryId: finalCategoryId,
        expenseDate: finalDate,
        addedAmount: numericAmount,
      })
      : null;

    if (wasInserted) {
      const sign = normalizedType === 'income' ? '+' : normalizedType === 'expense' ? '−' : '';
      void notifyOtherLedgerMembers(db, sendPushToUser, {
        ledgerId,
        actorUserId: user.id,
        actorName: user.name,
        title: `Sổ "${grant.ledgerName}" vừa có giao dịch mới`,
        body: `${normalizedDescription} (${sign}${formatCurrency(numericAmount)})`,
        url: '/expenses',
      }).catch(() => {});
    }

    return NextResponse.json({
      ...createdRow,
      tags: savedTags,
      budgetAlert,
    }, { status: wasInserted ? 201 : 200 });
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
