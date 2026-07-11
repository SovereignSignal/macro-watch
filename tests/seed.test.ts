import { expect, it } from 'vitest';
import { briefs, claims, themeEvents } from '@/db/schema';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

it('seeds every fixture kind and is idempotent', async () => {
  const db = await createTestDb();
  const counts = await seedAll(db);
  expect(counts).toEqual({
    briefs: 3,
    themeEvents: 8,
    themeState: 1,
    panels: 3,
    claims: 5,
    forwardEvents: 3,
  });
  const again = await seedAll(db);
  expect(again).toEqual(counts);
  expect(await db.select({ d: briefs.date }).from(briefs)).toHaveLength(3);
  expect(await db.select({ e: themeEvents.eventId }).from(themeEvents)).toHaveLength(8);
  expect(await db.select({ c: claims.claimId }).from(claims)).toHaveLength(5);
});
