import type { Client } from '@libsql/client';

export const UNCLASSIFIED_EXPENSE = 'Chưa phân loại';
const SCHEMA_VERSION = '2026-11-v2.0-s3';

export async function initializeDatabase(db: Client) {
  await db.execute('PRAGMA foreign_keys = ON').catch(() => {});

  try {
    const versionResult = await db.execute({
      sql: "SELECT value FROM settings WHERE key = 'schema_version' LIMIT 1",
      args: [],
    });
    if (versionResult.rows[0]?.value === SCHEMA_VERSION) {
      return;
    }
  } catch {
    // Table `settings` does not exist yet on a fresh DB — run full initialization.
  }

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      avatar TEXT DEFAULT '',
      password_hash TEXT,
      onboarded_at TEXT,
      email_verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ledgers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id INTEGER NOT NULL,
      name TEXT NOT NULL DEFAULT 'Ví cá nhân',
      kind TEXT NOT NULL DEFAULT 'personal',
      currency TEXT NOT NULL DEFAULT 'VND',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ledger_members (
      ledger_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      joined_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (ledger_id, user_id),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY,
      primary_persona TEXT NOT NULL DEFAULT 'speed_tracker',
      personas_json TEXT NOT NULL DEFAULT '["speed_tracker"]',
      enabled_modules_json TEXT NOT NULL DEFAULT '{}',
      active_ledger_id INTEGER,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      metadata_json TEXT DEFAULT '{}',
      expires_at TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'cash',
      initial_balance REAL NOT NULL DEFAULT 0,
      credit_limit REAL NOT NULL DEFAULT 0,
      statement_day INTEGER NOT NULL DEFAULT 0,
      due_day INTEGER NOT NULL DEFAULT 0,
      is_default INTEGER NOT NULL DEFAULT 0,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      ledger_id INTEGER,
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT '📦',
      color TEXT NOT NULL DEFAULT '#64748b',
      kind TEXT NOT NULL DEFAULT 'expense',
      budget_group TEXT NOT NULL DEFAULT 'wants',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ledger_id INTEGER,
      account_id INTEGER,
      to_account_id INTEGER,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      note TEXT DEFAULT '',
      category_id INTEGER,
      expense_date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      currency TEXT NOT NULL DEFAULT 'VND',
      created_by_user_id INTEGER,
      reimburse_status TEXT NOT NULL DEFAULT 'none',
      source TEXT NOT NULL DEFAULT 'web',
      client_request_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
      FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS expense_chat_requests (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      request_id TEXT NOT NULL,
      PRIMARY KEY (user_id, request_id)
    );

    CREATE TABLE IF NOT EXISTS budget_jars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ledger_id INTEGER,
      category_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      budget_amount REAL NOT NULL,
      warning_percent REAL NOT NULL DEFAULT 80,
      daily_limit REAL DEFAULT 0,
      budget_basis TEXT NOT NULL DEFAULT 'monthly',
      daily_amount REAL NOT NULL DEFAULT 0,
      budget_days INTEGER NOT NULL DEFAULT 0,
      frequency_limit INTEGER DEFAULT 0,
      frequency_period TEXT DEFAULT '',
      rollover_enabled INTEGER NOT NULL DEFAULT 0,
      rollover_mode TEXT NOT NULL DEFAULT 'positive_only',
      rollover_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      UNIQUE(user_id, category_id, month)
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ledger_id INTEGER,
      account_id INTEGER,
      direction TEXT NOT NULL DEFAULT 'payable',
      name TEXT NOT NULL,
      creditor TEXT NOT NULL DEFAULT '',
      total_amount REAL NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS debt_jars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ledger_id INTEGER,
      debt_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      planned_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE,
      UNIQUE(user_id, debt_id, month)
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ledger_id INTEGER,
      account_id INTEGER,
      expense_id INTEGER,
      debt_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
      FOREIGN KEY (expense_id) REFERENCES expenses(id) ON DELETE SET NULL,
      FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_providers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      label TEXT NOT NULL,
      protocol TEXT NOT NULL,
      base_url TEXT NOT NULL,
      secret_encrypted TEXT NOT NULL,
      secret_hint TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      default_model_id TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      provider_id INTEGER NOT NULL,
      model_id TEXT NOT NULL,
      label TEXT DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (provider_id) REFERENCES ai_providers(id) ON DELETE CASCADE,
      UNIQUE(provider_id, model_id)
    );

    CREATE TABLE IF NOT EXISTS pwa_push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ai_insights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      period TEXT NOT NULL,
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, period, period_start),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      occurrence_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      sent_at TEXT,
      last_error TEXT DEFAULT '',
      UNIQUE(user_id, kind, occurrence_key),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS merchant_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ledger_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      keyword TEXT NOT NULL,
      category_id INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      account_id INTEGER,
      hit_count INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
      UNIQUE(ledger_id, keyword, type)
    );

    CREATE TABLE IF NOT EXISTS shortcut_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ledger_id INTEGER NOT NULL,
      default_account_id INTEGER,
      name TEXT NOT NULL,
      key_prefix TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      last_used_at TEXT,
      revoked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE,
      FOREIGN KEY (default_account_id) REFERENCES accounts(id) ON DELETE SET NULL
    );
  `);

  await migrateLegacyTables(db);
  await migrateCategoriesV2(db);
  await addV2ColumnsIfMissing(db);

  await db.executeMultiple(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_global_name
      ON categories(lower(name)) WHERE user_id IS NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_user_name
      ON categories(user_id, lower(name)) WHERE user_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_ledgers_owner
      ON ledgers(owner_id);
    CREATE INDEX IF NOT EXISTS idx_accounts_ledger
      ON accounts(ledger_id, archived, is_default);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash
      ON auth_tokens(token_hash);
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_email_purpose
      ON auth_tokens(email, purpose, expires_at);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_date
      ON expenses(user_id, expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_ledger_date_id
      ON expenses(ledger_id, expense_date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_expenses_account_type
      ON expenses(account_id, type, expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_category_date
      ON expenses(user_id, category_id, expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_type_date
      ON expenses(user_id, type, expense_date);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_month
      ON budget_jars(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_budgets_ledger_month
      ON budget_jars(ledger_id, month);
    CREATE INDEX IF NOT EXISTS idx_debts_user_status
      ON debts(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_debts_ledger_direction
      ON debts(ledger_id, direction, status);
    CREATE INDEX IF NOT EXISTS idx_debt_payments_user_debt_date
      ON debt_payments(user_id, debt_id, payment_date);
    CREATE INDEX IF NOT EXISTS idx_ai_providers_user_enabled
      ON ai_providers(user_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_ai_models_user_provider
      ON ai_models(user_id, provider_id, enabled, position);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_user_client_request
      ON expenses(user_id, client_request_id) WHERE client_request_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_pwa_push_user
      ON pwa_push_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_insights_user_created
      ON ai_insights(user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status
      ON notification_deliveries(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_merchant_rules_ledger
      ON merchant_rules(ledger_id, type, keyword);
    CREATE INDEX IF NOT EXISTS idx_shortcut_hash
      ON shortcut_keys(key_hash);
    CREATE INDEX IF NOT EXISTS idx_shortcut_user
      ON shortcut_keys(user_id, revoked_at);
  `);

  // Insert default categories: [name, icon, color, kind, budget_group]
  const defaults: Array<[string, string, string, string, string]> = [
    ['Đào góp', 'circle-dollar-sign', '#8B5CF6', 'expense', 'savings'],
    ['Nhà thuê', 'house', '#F97316', 'expense', 'needs'],
    ['Ăn uống', 'utensils', '#FE5A61', 'expense', 'needs'],
    ['Xe & xăng', 'fuel', '#F59E0B', 'expense', 'needs'],
    ['Vợ', 'heart', '#EC4899', 'expense', 'needs'],
    ['Chuyển về nhà', 'send', '#38BDF8', 'expense', 'needs'],
    ['Thể thao', 'dumbbell', '#06B6D4', 'expense', 'wants'],
    ['Nhậu', 'beer', '#A855F7', 'expense', 'wants'],
    ['AI', 'bot', '#14B8A6', 'expense', 'wants'],
    ['Thu nhập', 'banknote', '#00BC7C', 'income', 'savings'],
    [UNCLASSIFIED_EXPENSE, 'tag', '#64748B', 'expense', 'wants'],
  ];

  await db.batch(
    defaults.map(([name, icon, color, kind, budgetGroup]) => ({
      sql: `INSERT OR IGNORE INTO categories (user_id, name, icon, color, kind, budget_group)
            VALUES (NULL, ?, ?, ?, ?, ?)`,
      args: [name, icon, color, kind, budgetGroup],
    })),
    'write',
  );

  // Ensure existing global 'Thu nhập' row always has kind = 'income'
  await db.execute({
    sql: `UPDATE categories SET kind = 'income' WHERE user_id IS NULL AND name = 'Thu nhập' AND kind <> 'income'`,
  });

  // Remove obsolete global defaults only when they are not referenced.
  await db.execute({
    sql: `DELETE FROM categories
          WHERE user_id IS NULL
            AND name IN ('Di chuyển', 'Mua sắm', 'Giải trí', 'Hóa đơn', 'Sức khỏe', 'Giáo dục', 'Tiết kiệm', 'Khác')
            AND NOT EXISTS (SELECT 1 FROM expenses WHERE expenses.category_id = categories.id)
            AND NOT EXISTS (SELECT 1 FROM budget_jars WHERE budget_jars.category_id = categories.id)`,
  });

  await backfillUsersToDefaultLedger(db);

  await db.execute({
    sql: `INSERT INTO settings (key, value) VALUES ('schema_version', ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [SCHEMA_VERSION],
  });
}

async function hasColumn(db: Client, table: string, column: string) {
  const result = await db.execute(`PRAGMA table_info(${table})`);
  return result.rows.some((row) => row.name === column);
}

async function addColumnIfMissing(
  db: Client,
  table: string,
  column: string,
  definition: string,
) {
  if (!(await hasColumn(db, table, column))) {
    await db.execute(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

async function addV2ColumnsIfMissing(db: Client) {
  await addColumnIfMissing(db, 'users', 'onboarded_at', 'TEXT');
  await addColumnIfMissing(db, 'users', 'email_verified_at', 'TEXT');

  await addColumnIfMissing(db, 'categories', 'ledger_id', 'INTEGER REFERENCES ledgers(id) ON DELETE CASCADE');
  await addColumnIfMissing(db, 'categories', 'kind', "TEXT NOT NULL DEFAULT 'expense'");
  await addColumnIfMissing(db, 'categories', 'budget_group', "TEXT NOT NULL DEFAULT 'wants'");

  await addColumnIfMissing(db, 'expenses', 'ledger_id', 'INTEGER REFERENCES ledgers(id) ON DELETE CASCADE');
  await addColumnIfMissing(db, 'expenses', 'account_id', 'INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
  await addColumnIfMissing(db, 'expenses', 'to_account_id', 'INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
  await addColumnIfMissing(db, 'expenses', 'currency', "TEXT NOT NULL DEFAULT 'VND'");
  await addColumnIfMissing(db, 'expenses', 'created_by_user_id', 'INTEGER');
  await addColumnIfMissing(db, 'expenses', 'reimburse_status', "TEXT NOT NULL DEFAULT 'none'");
  await addColumnIfMissing(db, 'expenses', 'source', "TEXT NOT NULL DEFAULT 'web'");
  await addColumnIfMissing(db, 'expenses', 'client_request_id', 'TEXT');

  await addColumnIfMissing(db, 'budget_jars', 'ledger_id', 'INTEGER REFERENCES ledgers(id) ON DELETE CASCADE');
  await addColumnIfMissing(db, 'budget_jars', 'budget_basis', "TEXT NOT NULL DEFAULT 'monthly'");
  await addColumnIfMissing(db, 'budget_jars', 'daily_amount', 'REAL NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'budget_jars', 'budget_days', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'budget_jars', 'rollover_enabled', 'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'budget_jars', 'rollover_mode', "TEXT NOT NULL DEFAULT 'positive_only'");
  await addColumnIfMissing(db, 'budget_jars', 'rollover_amount', 'REAL NOT NULL DEFAULT 0');

  await addColumnIfMissing(db, 'debts', 'ledger_id', 'INTEGER REFERENCES ledgers(id) ON DELETE CASCADE');
  await addColumnIfMissing(db, 'debts', 'account_id', 'INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
  await addColumnIfMissing(db, 'debts', 'direction', "TEXT NOT NULL DEFAULT 'payable'");

  await addColumnIfMissing(db, 'debt_jars', 'ledger_id', 'INTEGER REFERENCES ledgers(id) ON DELETE CASCADE');

  await addColumnIfMissing(db, 'debt_payments', 'ledger_id', 'INTEGER REFERENCES ledgers(id) ON DELETE CASCADE');
  await addColumnIfMissing(db, 'debt_payments', 'account_id', 'INTEGER REFERENCES accounts(id) ON DELETE SET NULL');
  await addColumnIfMissing(db, 'debt_payments', 'expense_id', 'INTEGER REFERENCES expenses(id) ON DELETE SET NULL');
}

async function migrateCategoriesV2(db: Client) {
  const ddlResult = await db.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'categories'",
  });
  const tableSql = String(ddlResult.rows[0]?.sql || '');
  // Rebuild only when legacy global UNIQUE constraint on `name` exists.
  if (!/name\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(tableSql)) {
    return;
  }

  await db.execute('PRAGMA foreign_keys = OFF').catch(() => {});
  await db.execute('PRAGMA legacy_alter_table = ON').catch(() => {});
  try {
    await db.executeMultiple(`
      DROP TABLE IF EXISTS categories_v2;
      CREATE TABLE categories_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        ledger_id INTEGER,
        name TEXT NOT NULL,
        icon TEXT NOT NULL DEFAULT '📦',
        color TEXT NOT NULL DEFAULT '#64748b',
        kind TEXT NOT NULL DEFAULT 'expense',
        budget_group TEXT NOT NULL DEFAULT 'wants',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (ledger_id) REFERENCES ledgers(id) ON DELETE CASCADE
      );
      INSERT INTO categories_v2 (id, user_id, name, icon, color, kind, created_at)
      SELECT id, user_id, name, icon, color,
        CASE WHEN name = 'Thu nhập' THEN 'income' ELSE 'expense' END,
        created_at
      FROM categories;
      DROP TABLE categories;
      ALTER TABLE categories_v2 RENAME TO categories;
    `);
  } finally {
    await db.execute('PRAGMA legacy_alter_table = OFF').catch(() => {});
    await db.execute('PRAGMA foreign_keys = ON').catch(() => {});
  }
}

async function backfillUsersToDefaultLedger(db: Client) {
  const usersWithoutLedger = await db.execute({
    sql: 'SELECT id FROM users WHERE id NOT IN (SELECT owner_id FROM ledgers)',
  });

  for (const row of usersWithoutLedger.rows) {
    const userId = Number(row.id);
    if (!Number.isInteger(userId) || userId <= 0) continue;

    const ledgerRes = await db.execute({
      sql: "INSERT INTO ledgers (owner_id, name, kind, currency) VALUES (?, 'Ví cá nhân', 'personal', 'VND')",
      args: [userId],
    });
    const ledgerId = Number(ledgerRes.lastInsertRowid);

    const accountRes = await db.execute({
      sql: "INSERT INTO accounts (ledger_id, user_id, name, type, initial_balance, is_default) VALUES (?, ?, 'Ví chính', 'cash', 0, 1)",
      args: [ledgerId, userId],
    });
    const accountId = Number(accountRes.lastInsertRowid);

    await db.batch(
      [
        {
          sql: `INSERT INTO ledger_members (ledger_id, user_id, role)
                VALUES (?, ?, 'owner') ON CONFLICT(ledger_id, user_id) DO NOTHING`,
          args: [ledgerId, userId],
        },
        {
          sql: `INSERT INTO user_profiles (user_id, primary_persona, personas_json, enabled_modules_json, active_ledger_id)
                VALUES (?, 'speed_tracker', '["speed_tracker"]', '{}', ?)
                ON CONFLICT(user_id) DO UPDATE SET active_ledger_id = COALESCE(user_profiles.active_ledger_id, excluded.active_ledger_id)`,
          args: [userId, ledgerId],
        },
        {
          sql: `UPDATE expenses
                SET ledger_id = COALESCE(ledger_id, ?),
                    account_id = COALESCE(account_id, ?),
                    created_by_user_id = COALESCE(created_by_user_id, ?)
                WHERE user_id = ?`,
          args: [ledgerId, accountId, userId, userId],
        },
        {
          sql: 'UPDATE budget_jars SET ledger_id = COALESCE(ledger_id, ?) WHERE user_id = ?',
          args: [ledgerId, userId],
        },
        {
          sql: `UPDATE debts
                SET ledger_id = COALESCE(ledger_id, ?),
                    account_id = COALESCE(account_id, ?)
                WHERE user_id = ?`,
          args: [ledgerId, accountId, userId],
        },
        {
          sql: 'UPDATE debt_jars SET ledger_id = COALESCE(ledger_id, ?) WHERE user_id = ?',
          args: [ledgerId, userId],
        },
        {
          sql: `UPDATE debt_payments
                SET ledger_id = COALESCE(ledger_id, ?),
                    account_id = COALESCE(account_id, ?)
                WHERE user_id = ?`,
          args: [ledgerId, accountId, userId],
        },
        {
          sql: 'UPDATE categories SET ledger_id = COALESCE(ledger_id, ?) WHERE user_id = ?',
          args: [ledgerId, userId],
        },
        {
          sql: `UPDATE users
                SET onboarded_at = COALESCE(onboarded_at, datetime('now'))
                WHERE id = ? AND (
                  EXISTS (SELECT 1 FROM expenses WHERE user_id = ?)
                  OR EXISTS (SELECT 1 FROM budget_jars WHERE user_id = ?)
                  OR EXISTS (SELECT 1 FROM debts WHERE user_id = ?)
                )`,
          args: [userId, userId, userId, userId],
        },
      ],
      'write',
    );
  }
}

async function migrateLegacyTables(db: Client) {
  await addColumnIfMissing(db, 'users', 'password_hash', 'TEXT');
  await addColumnIfMissing(db, 'categories', 'user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');
  await addColumnIfMissing(db, 'expenses', 'user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');
  await addColumnIfMissing(db, 'debts', 'user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');
  await addColumnIfMissing(db, 'debt_payments', 'user_id', 'INTEGER REFERENCES users(id) ON DELETE CASCADE');

  if (!(await hasColumn(db, 'budget_jars', 'user_id'))) {
    await db.executeMultiple(`
      ALTER TABLE budget_jars RENAME TO budget_jars_legacy;
      CREATE TABLE budget_jars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        category_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        budget_amount REAL NOT NULL,
        warning_percent REAL NOT NULL DEFAULT 80,
        daily_limit REAL DEFAULT 0,
        frequency_limit INTEGER DEFAULT 0,
        frequency_period TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id),
        UNIQUE(user_id, category_id, month)
      );
      INSERT INTO budget_jars (
        id, user_id, category_id, month, budget_amount, warning_percent,
        daily_limit, frequency_limit, frequency_period, created_at
      )
      SELECT
        id, NULL, category_id, month, budget_amount, warning_percent,
        COALESCE(daily_limit, 0), COALESCE(frequency_limit, 0),
        COALESCE(frequency_period, ''), created_at
      FROM budget_jars_legacy;
      DROP TABLE budget_jars_legacy;
    `);
  }

  if (!(await hasColumn(db, 'debt_jars', 'user_id'))) {
    await db.executeMultiple(`
      ALTER TABLE debt_jars RENAME TO debt_jars_legacy;
      CREATE TABLE debt_jars (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        debt_id INTEGER NOT NULL,
        month TEXT NOT NULL,
        planned_amount REAL NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE,
        UNIQUE(user_id, debt_id, month)
      );
      INSERT INTO debt_jars (
        id, user_id, debt_id, month, planned_amount, created_at
      )
      SELECT id, NULL, debt_id, month, planned_amount, created_at
      FROM debt_jars_legacy;
      DROP TABLE debt_jars_legacy;
    `);
  }
}
