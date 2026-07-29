import { createClient } from '@libsql/client';
import { initializeDatabase } from './schema';

const db = createClient({
  url: process.env.TURSO_DATABASE_URL || 'file:./data/chi-tieu.db',
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Initialize on first import
let initialized = false;

export async function getDb() {
  if (!initialized) {
    await initializeDatabase(db);
    initialized = true;
  }
  return db;
}

export { db };
