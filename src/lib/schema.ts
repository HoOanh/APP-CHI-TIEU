import type { Client } from '@libsql/client';

export async function initializeDatabase(db: Client) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      avatar TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL UNIQUE,
      icon TEXT NOT NULL DEFAULT '📦',
      color TEXT NOT NULL DEFAULT '#64748b',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      note TEXT DEFAULT '',
      category_id INTEGER NOT NULL,
      expense_date TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'expense',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS budget_jars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      UNIQUE(user_id, category_id, month)
    );

    CREATE TABLE IF NOT EXISTS debts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      creditor TEXT NOT NULL DEFAULT '',
      total_amount REAL NOT NULL,
      interest_rate REAL NOT NULL DEFAULT 0,
      start_date TEXT NOT NULL,
      due_date TEXT NOT NULL,
      note TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS debt_jars (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      debt_id INTEGER NOT NULL,
      month TEXT NOT NULL,
      planned_amount REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (debt_id) REFERENCES debts(id) ON DELETE CASCADE,
      UNIQUE(user_id, debt_id, month)
    );

    CREATE TABLE IF NOT EXISTS debt_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      debt_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
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
  `);

  await migrateLegacyTables(db);
  await addColumnIfMissing(db, 'budget_jars', 'budget_basis', "TEXT NOT NULL DEFAULT 'monthly'");
  await addColumnIfMissing(db, 'budget_jars', 'daily_amount', 'REAL NOT NULL DEFAULT 0');
  await addColumnIfMissing(db, 'budget_jars', 'budget_days', 'INTEGER NOT NULL DEFAULT 0');

  await db.executeMultiple(`
    CREATE INDEX IF NOT EXISTS idx_expenses_user_date
      ON expenses(user_id, expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_category_date
      ON expenses(user_id, category_id, expense_date);
    CREATE INDEX IF NOT EXISTS idx_expenses_user_type_date
      ON expenses(user_id, type, expense_date);
    CREATE INDEX IF NOT EXISTS idx_budgets_user_month
      ON budget_jars(user_id, month);
    CREATE INDEX IF NOT EXISTS idx_debts_user_status
      ON debts(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_debt_payments_user_debt_date
      ON debt_payments(user_id, debt_id, payment_date);
    CREATE INDEX IF NOT EXISTS idx_ai_providers_user_enabled
      ON ai_providers(user_id, enabled);
    CREATE INDEX IF NOT EXISTS idx_ai_models_user_provider
      ON ai_models(user_id, provider_id, enabled, position);
  `);

  // Insert default categories
  const defaults = [
    ['Đào góp', 'circle-dollar-sign', '#8B5CF6'],
    ['Nhà thuê', 'house', '#F97316'],
    ['Ăn uống', 'utensils', '#FE5A61'],
    ['Xe & xăng', 'fuel', '#F59E0B'],
    ['Vợ', 'heart', '#EC4899'],
    ['Chuyển về nhà', 'send', '#38BDF8'],
    ['Thể thao', 'dumbbell', '#06B6D4'],
    ['Nhậu', 'beer', '#A855F7'],
    ['AI', 'bot', '#14B8A6'],
    ['Thu nhập', 'banknote', '#00BC7C'],
  ];

  for (const [name, icon, color] of defaults) {
    await db.execute({
      sql: 'INSERT OR IGNORE INTO categories (user_id, name, icon, color) VALUES (NULL, ?, ?, ?)',
      args: [name, icon, color],
    });
  }

  // Remove obsolete global defaults only when they are not referenced. Historical
  // transactions and existing budget jars keep their original category intact.
  await db.execute({
    sql: `DELETE FROM categories
          WHERE user_id IS NULL
            AND name IN ('Di chuyển', 'Mua sắm', 'Giải trí', 'Hóa đơn', 'Sức khỏe', 'Giáo dục', 'Tiết kiệm', 'Khác')
            AND NOT EXISTS (SELECT 1 FROM expenses WHERE expenses.category_id = categories.id)
            AND NOT EXISTS (SELECT 1 FROM budget_jars WHERE budget_jars.category_id = categories.id)`,
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

async function migrateLegacyTables(db: Client) {
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
