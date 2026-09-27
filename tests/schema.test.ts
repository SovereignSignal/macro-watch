import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { briefs, panelSnapshots } from '@/db/schema';
import { createTestDb } from './helpers/db';

const BRIEF = {
  date: '2026-07-10',
  kind: 'daily',
  subject: 'Front-end repricing',
  ping: 'Two-year yields backed up into supply.',
  html: '<p>Powell surprised markets with a slower path.</p>',
  sentVerifiedAt: new Date('2026-07-10T14:05:00Z'),
};

it('applies migrations and round-trips a brief', async () => {
  const db = await createTestDb();
  await db.insert(briefs).values(BRIEF);
  const rows = await db.select({ date: briefs.date, kind: briefs.kind }).from(briefs);
  expect(rows).toEqual([{ date: '2026-07-10', kind: 'daily' }]);
});

it('keeps two brief kinds on one date after the composite key migration', async () => {
  const db = await createTestDb();
  await db.insert(briefs).values([
    BRIEF,
    { ...BRIEF, kind: 'week-ahead', subject: 'Week ahead', ping: 'The week ahead.' },
  ]);
  const rows = await db.select({ date: briefs.date, kind: briefs.kind }).from(briefs);
  expect(rows.map((row) => row.kind).sort()).toEqual(['daily', 'week-ahead']);
});

it('generates a searchable tsvector from subject + tag-stripped html', async () => {
  const db = await createTestDb();
  await db.insert(briefs).values(BRIEF);
  const hits = await db
    .select({ date: briefs.date })
    .from(briefs)
    .where(sql`${briefs.search} @@ websearch_to_tsquery('english', 'powell')`);
  expect(hits).toEqual([{ date: '2026-07-10' }]);
});

it('enforces one panel snapshot per kind + taken_at', async () => {
  const db = await createTestDb();
  const takenAt = new Date('2026-07-10T12:00:00Z');
  await db.insert(panelSnapshots).values({ kind: 'dashboard', takenAt, payload: { rows: [] } });
  // drizzle-orm wraps driver errors in a DrizzleQueryError ("Failed query: ...");
  // the underlying Postgres unique-violation message lives on `.cause`.
  await expect(
    db.insert(panelSnapshots).values({ kind: 'dashboard', takenAt, payload: { rows: [] } }),
  ).rejects.toMatchObject({
    cause: expect.objectContaining({ message: expect.stringMatching(/duplicate key/) }),
  });
});
