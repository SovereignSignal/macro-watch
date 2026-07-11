import 'dotenv/config';
import { closeDb, getDb } from '../src/db/client';
import { seedAll } from '../src/lib/seed';

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Point it at the Railway dev database (.env).');
    process.exit(1);
  }
  const counts = await seedAll(getDb());
  console.log('seeded:', counts);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
