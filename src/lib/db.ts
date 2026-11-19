import { createClient } from '@libsql/client';
import { initializeDatabase } from './schema';

const dbUrl = process.env.TURSO_DATABASE_URL || 'file:./data/chi-tieu.db';

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialization: Promise<void> | undefined;

export async function getDb() {
  initialization ??= (async () => {
    if (dbUrl.startsWith('file:')) {
      await db.execute('PRAGMA journal_mode = WAL').catch(() => {});
    }
    await db.execute('PRAGMA foreign_keys = ON').catch(() => {});
    await initializeDatabase(db);
  })().catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  await initialization;
  return db;
}

export { db };
