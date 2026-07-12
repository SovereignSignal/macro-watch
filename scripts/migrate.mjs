#!/usr/bin/env node
import 'dotenv/config';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is required for migrations');
  process.exit(1);
}

const pool = new Pool({ connectionString, connectionTimeoutMillis: 10_000 });
try {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('Database migrations complete');
} finally {
  await pool.end();
}
