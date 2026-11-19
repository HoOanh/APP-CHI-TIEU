import { createHash, randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { getDb } from '@/lib/db';
import { assertLedgerAccess, LedgerAccessError } from '@/lib/ledger-access';
import { sendMail } from '@/lib/mailer';

const inviteSchema = z.object({
  email: z.string().trim().email('Email không hợp lệ').optional().or(z.literal('')),
  role: z.enum(['editor', 'viewer']).optional().default('editor'),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { id } = await context.params;
    const ledgerId = Number(id);
    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = inviteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Thông tin lời mời không hợp lệ.' },
        { status: 400 },
      );
    }

    const db = await getDb();
    const grant = await assertLedgerAccess(db, user.id, ledgerId, 'owner');

    const rawToken = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const targetEmail = (parsed.data.email || '').trim().toLowerCase();

    await db.execute({
      sql: `INSERT INTO auth_tokens (user_id, email, purpose, token_hash, metadata_json, expires_at)
            VALUES (?, ?, 'ledger_invite', ?, ?, ?)`,
      args: [
        user.id,
        targetEmail || 'link-invite',
        tokenHash,
        JSON.stringify({
          ledgerId: grant.ledgerId,
          ledgerName: grant.ledgerName,
          role: parsed.data.role,
          inviterName: user.name,
        }),
        expiresAt,
      ],
    });

    const origin = process.env.NEXTAUTH_URL || process.env.AUTH_URL || request.nextUrl.origin;
    const inviteUrl = `${origin.replace(/\/$/, '')}/ledgers/invite?token=${rawToken}`;
    let emailDelivered = false;

    if (targetEmail) {
      const roleLabel = parsed.data.role === 'editor' ? 'Chỉnh sửa & ghi giao dịch' : 'Chỉ xem';
      try {
        await sendMail({
          to: targetEmail,
          subject: `${user.name} mời bạn tham gia sổ "${grant.ledgerName}" trên ARC Irobot`,
          text: `${user.name} mời bạn tham gia sổ "${grant.ledgerName}" (vai trò: ${roleLabel}). Mở liên kết để tham gia: ${inviteUrl}`,
          html: `<p><strong>${user.name}</strong> mời bạn tham gia sổ tài chính <strong>${grant.ledgerName}</strong> với quyền <em>${roleLabel}</em>.</p><p><a href="${inviteUrl}">Bấm vào đây để chấp nhận lời mời</a></p>`,
        });
        emailDelivered = true;
      } catch (err) {
        console.warn('[ledger-invite-mail]', err);
      }
    }

    return NextResponse.json(
      {
        ok: true,
        inviteUrl,
        token: rawToken,
        expiresAt,
        emailDelivered,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof LedgerAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[POST /api/ledgers/[id]/invites]', error);
    return NextResponse.json({ error: 'Không thể tạo lời mời.' }, { status: 500 });
  }
}
