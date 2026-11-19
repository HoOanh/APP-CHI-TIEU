import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string; paymentId: string }>;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id, paymentId } = await context.params;
    const deleteExpense = request.nextUrl.searchParams.get('delete_expense') !== '0';
    const db = await getDb();

    const paymentRes = await db.execute({
      sql: 'SELECT id, expense_id FROM debt_payments WHERE id = ? AND debt_id = ? AND user_id = ? LIMIT 1',
      args: [paymentId, id, user.id],
    });
    const row = paymentRes.rows[0];
    if (!row) {
      return NextResponse.json({ error: 'Không tìm thấy lịch sử thanh toán.' }, { status: 404 });
    }

    const linkedExpenseId = row.expense_id !== null && row.expense_id !== undefined ? Number(row.expense_id) : null;
    const tx = await db.transaction('write');
    try {
      await tx.execute({
        sql: 'DELETE FROM debt_payments WHERE id = ? AND debt_id = ? AND user_id = ?',
        args: [paymentId, id, user.id],
      });

      if (deleteExpense && linkedExpenseId) {
        await tx.execute({
          sql: 'DELETE FROM expenses WHERE id = ? AND user_id = ?',
          args: [linkedExpenseId, user.id],
        });
      }

      const debtRes = await tx.execute({
        sql: 'SELECT total_amount FROM debts WHERE id = ? AND user_id = ?',
        args: [id, user.id],
      });
      const paidRes = await tx.execute({
        sql: 'SELECT COALESCE(SUM(amount), 0) AS sum FROM debt_payments WHERE debt_id = ? AND user_id = ?',
        args: [id, user.id],
      });
      const totalAmount = Number(debtRes.rows[0]?.total_amount || 0);
      const totalPaid = Number(paidRes.rows[0]?.sum || 0);
      const status = totalPaid >= totalAmount ? 'completed' : 'active';

      await tx.execute({
        sql: 'UPDATE debts SET status = ? WHERE id = ? AND user_id = ?',
        args: [status, id, user.id],
      });

      await tx.commit();
      return NextResponse.json({ ok: true, status, totalPaid });
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } catch (error) {
    console.error('[DELETE /api/debts/[id]/payments/[paymentId]]', error);
    return NextResponse.json({ error: 'Không thể xóa thanh toán.' }, { status: 500 });
  }
}
