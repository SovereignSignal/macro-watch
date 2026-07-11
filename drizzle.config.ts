import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    // Only used by `drizzle-kit migrate`; `generate` never connects.
    url: process.env.DATABASE_URL ?? 'postgres://localhost:5432/macro_watch',
  },
});
