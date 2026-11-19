import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@libsql/client';
import {
  assertLedgerAccess,
  LedgerAccessError,
  notifyOtherLedgerMembers,
} from '../src/lib/ledger-access.ts';
import { initializeDatabase } from '../src/lib/schema.ts';

test('assertLedgerAccess enforces owner/editor/viewer RBAC and member isolation', async () => {
  const db = createClient({ url: ':memory:' });
  await initializeDatabase(db);

  await db.batch([
    {
      sql: "INSERT INTO users (id, email, name) VALUES (1, 'owner@test.local', 'Chủ hộ'), (2, 'editor@test.local', 'Vợ/Chồng'), (3, 'viewer@test.local', 'Thành viên xem'), (4, 'outsider@test.local', 'Người ngoài')",
      args: [],
    },
    {
      sql: "INSERT INTO ledgers (id, owner_id, name, kind, currency) VALUES (10, 1, 'Sổ Gia Đình', 'family', 'VND')",
      args: [],
    },
    {
      sql: "INSERT INTO ledger_members (ledger_id, user_id, role) VALUES (10, 1, 'owner'), (10, 2, 'editor'), (10, 3, 'viewer')",
      args: [],
    },
  ], 'write');

  // Owner passes all levels
  const ownerGrant = await assertLedgerAccess(db, 1, 10, 'owner');
  assert.equal(ownerGrant.role, 'owner');
  assert.equal(ownerGrant.ledgerName, 'Sổ Gia Đình');
  assert.equal(ownerGrant.ledgerKind, 'family');

  // Editor passes viewer & editor, rejected on owner
  const editorGrant = await assertLedgerAccess(db, 2, 10, 'editor');
  assert.equal(editorGrant.role, 'editor');
  await assert.rejects(
    () => assertLedgerAccess(db, 2, 10, 'owner'),
    (err: unknown) => err instanceof LedgerAccessError && err.status === 403,
  );

  // Viewer passes viewer, rejected on editor & owner
  const viewerGrant = await assertLedgerAccess(db, 3, 10, 'viewer');
  assert.equal(viewerGrant.role, 'viewer');
  await assert.rejects(
    () => assertLedgerAccess(db, 3, 10, 'editor'),
    (err: unknown) => err instanceof LedgerAccessError && err.status === 403,
  );

  // Outsider rejected on viewer
  await assert.rejects(
    () => assertLedgerAccess(db, 4, 10, 'viewer'),
    (err: unknown) => err instanceof LedgerAccessError && err.status === 403,
  );

  // Invalid / missing ledger
  await assert.rejects(
    () => assertLedgerAccess(db, 1, 0, 'viewer'),
    (err: unknown) => err instanceof LedgerAccessError && err.status === 400,
  );
  await assert.rejects(
    () => assertLedgerAccess(db, 1, 9999, 'viewer'),
    (err: unknown) => err instanceof LedgerAccessError && err.status === 404,
  );

  db.close();
});

test('notifyOtherLedgerMembers fans out push notifications excluding actor and stores invite token hash', async () => {
  const db = createClient({ url: ':memory:' });
  await initializeDatabase(db);

  await db.batch([
    {
      sql: "INSERT INTO users (id, email, name) VALUES (1, 'a@test.local', 'An'), (2, 'b@test.local', 'Bình'), (3, 'c@test.local', 'Chi')",
      args: [],
    },
    {
      sql: "INSERT INTO ledgers (id, owner_id, name, kind, currency) VALUES (20, 1, 'Quỹ Chung', 'family', 'VND')",
      args: [],
    },
    {
      sql: "INSERT INTO ledger_members (ledger_id, user_id, role) VALUES (20, 1, 'owner'), (20, 2, 'editor'), (20, 3, 'viewer')",
      args: [],
    },
  ], 'write');

  const deliveries: Array<{ userId: number; title: string; body: string }> = [];
  const notifiedCount = await notifyOtherLedgerMembers(
    db,
    async (userId, payload) => {
      deliveries.push({ userId, title: payload.title, body: payload.body });
      if (userId === 3) throw new Error('Simulated push failure');
      return { sent: 1 };
    },
    {
      ledgerId: 20,
      actorUserId: 2,
      actorName: 'Bình',
      title: 'Sổ "Quỹ Chung" vừa có giao dịch mới',
      body: 'Đi chợ (-150.000đ)',
      url: '/expenses',
    },
  );

  assert.equal(notifiedCount, 1);
  assert.deepEqual(
    deliveries.map((d) => d.userId).sort((a, b) => a - b),
    [1, 3],
  );
  assert.ok(deliveries[0].body.startsWith('Bình: Đi chợ'));

  // Verify ledger_invite token hashing works cleanly with auth_tokens
  const rawToken = 'sample-invite-token-value-12345';
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await db.execute({
    sql: `INSERT INTO auth_tokens (user_id, email, purpose, token_hash, metadata_json, expires_at)
          VALUES (1, 'link-invite', 'ledger_invite', ?, ?, '2099-01-01T00:00:00.000Z')`,
    args: [tokenHash, JSON.stringify({ ledgerId: 20, ledgerName: 'Quỹ Chung', role: 'viewer' })],
  });
  const stored = await db.execute({
    sql: "SELECT metadata_json FROM auth_tokens WHERE token_hash = ? AND purpose = 'ledger_invite'",
    args: [tokenHash],
  });
  assert.equal(JSON.parse(String(stored.rows[0].metadata_json)).ledgerId, 20);

  db.close();
});
