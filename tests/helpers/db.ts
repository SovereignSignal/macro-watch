import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from '@/db/schema';
import { setDb, type Db } from '@/db/client';

/**
 * Fresh in-memory Postgres (PGlite) with all migrations applied.
 * Installs itself as the app-wide db via setDb(), so route handlers and
 * pages under test transparently hit this instance.
 *
 * The PGlite drizzle instance is runtime-compatible with NodePgDatabase for
 * everything the app uses (query builder only — Global Constraint 3); the
 * cast keeps one Db type across prod and tests.
 */
export async function createTestDb(): Promise<Db> {
  const client = new PGlite();
  const pglite = drizzle(client, { schema });
  await migrate(pglite, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  const db = pglite as unknown as Db;
  setDb(db);
  return db;
}
