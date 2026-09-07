import { expect, it } from 'vitest';
import { isPlaceholderResearch, publicResearchText } from '@/lib/research-public';
import { upsertResearch } from '@/lib/ingest/research';
import { getResearchByDate, listResearch } from '@/lib/queries/research';
import { searchAll } from '@/lib/queries/search';
import { createTestDb } from './helpers/db';
import { researchMemos } from '@/db/schema';

it('detects dummy claim/finding rows and example.com-only citations', () => {
  expect(
    isPlaceholderResearch({
      topic: 'Claim',
      finding: 'Finding',
      changed: 'Changed',
      watch: 'Watch trigger',
      citations: [{ url: 'https://example.com/a' }],
    }),
  ).toBe(true);
  expect(
    isPlaceholderResearch({
      topic: 'EM Market Debt Crisis',
      finding: 'The weakest assumption is not that EM markets reopened.',
      citations: [{ url: 'https://www.imf.org/x' }],
    }),
  ).toBe(false);
});

it('strips leftover footnote markers from research copy', () => {
  expect(publicResearchText('No broad bank event. [18][23] Next: CMBS.')).toBe(
    'No broad bank event. Next: CMBS.',
  );
});

it('hides placeholder memos from listings, search, and permalinks', async () => {
  const db = await createTestDb();
  // Seed a legacy bad row directly; the ingest boundary now rejects this.
  await db.insert(researchMemos).values({
    date: '2026-08-28',
    topic: 'Claim',
    finding: 'Finding',
    changed: 'Changed',
    decision: 'Hold',
    watch: 'Watch trigger',
    citations: [{ url: 'https://example.com/x' }],
    generatedAt: new Date('2026-08-28T07:00:00Z'),
  });
  await upsertResearch(db, {
    date: '2026-08-29',
    topic: 'EM Market Debt Crisis',
    finding: 'Reopening is real but liquidity-sensitive.',
    changed: 'July flows turned positive after two outflow months.',
    decision: 'Selective consider, not a broad allocation.',
    watch: 'Three consecutive positive debt-flow reports.',
    citations: [{ url: 'https://www.imf.org/cofer', title: 'IMF' }],
    generated_at: '2026-08-29T07:00:00Z',
  });

  const listed = await listResearch(db);
  expect(listed.map((row) => row.date)).toEqual(['2026-08-29']);
  expect(await getResearchByDate(db, '2026-08-28')).toBeNull();
  expect((await getResearchByDate(db, '2026-08-29'))?.topic).toContain('EM Market');

  const hits = await searchAll(db, 'reopening');
  expect(hits.some((hit) => hit.type === 'research' && hit.href === '/research/2026-08-29')).toBe(true);
  expect(hits.some((hit) => hit.href === '/research/2026-08-28')).toBe(false);
});
