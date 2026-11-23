import { createClient } from '@libsql/client';
import { initializeDatabase, SCHEMA_VERSION } from './schema';

const dbUrl = process.env.TURSO_DATABASE_URL || 'file:./data/chi-tieu.db';

const db = createClient({
  url: dbUrl,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialization: Promise<void> | undefined;
let initializedVersion: string | undefined;

export async function getDb() {
  if (initializedVersion !== SCHEMA_VERSION) {
    initialization = undefined;
  }
  initialization ??= (async () => {
    if (dbUrl.startsWith('file:')) {
      await db.execute('PRAGMA journal_mode = WAL').catch(() => {});
    }
    await db.execute('PRAGMA foreign_keys = ON').catch(() => {});
    await initializeDatabase(db);
    initializedVersion = SCHEMA_VERSION;
  })().catch((error: unknown) => {
    initialization = undefined;
    initializedVersion = undefined;
    throw error;
  });
  await initialization;
  return db;
}

export { db };
