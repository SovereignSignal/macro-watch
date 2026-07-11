import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;

let db: Db | null = null;
let pool: Pool | null = null;

/** Test seam: tests/helpers/db.ts swaps in a PGlite-backed instance. */
export function setDb(override: Db): void {
  db = override;
}

export function getDb(): Db {
  if (!db) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      connectionTimeoutMillis: 5_000,
    });
    db = drizzle(pool, { schema });
  }
  return db;
}

/** For one-shot scripts (seed): lets the process exit cleanly. */
export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = null;
  db = null;
}
