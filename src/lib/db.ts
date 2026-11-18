import { createClient } from '@libsql/client';
import { initializeDatabase } from './schema';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./data/chi-tieu.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

let initialization: Promise<void> | undefined;

export async function getDb() {
  initialization ??= initializeDatabase(db).catch((error: unknown) => {
    initialization = undefined;
    throw error;
  });
  await initialization;
  return db;
}

export { db };
