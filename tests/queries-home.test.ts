import { expect, it } from 'vitest';
import { panelSnapshots, themeState } from '@/db/schema';
import { panelCoverage, panelRows } from '@/lib/panel-contract';
import { upsertThemeState } from '@/lib/ingest/themes';
import { getLatestBrief } from '@/lib/queries/briefs';
import { evidenceFreshness, getThemeMapCards } from '@/lib/queries/map';
import { getLatestPanel, getLatestVerifiedPanel } from '@/lib/queries/panels';
import { safeQuery } from '@/lib/safe';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

it('safeQuery returns the fallback when the query throws', async () => {
  const result = await safeQuery(async () => {
    throw new Error('connection refused');
  }, 'fallback');
  expect(result).toBe('fallback');
});

it('panelRows extracts rows defensively from unknown payloads', () => {
  expect(panelRows(null)).toEqual([]);
  expect(panelRows({ nope: true })).toEqual([]);
  expect(panelRows({ rows: [{ label: 'ES', value: '6,412.50', change: '+0.4%' }, { junk: 1 }, { label: 'N', value: 42 }] })).toEqual([
    { label: 'ES', value: '6,412.50', change: '+0.4%', note: null },
    { label: 'N', value: '42', change: null, note: null },
  ]);
});

it('panelCoverage exposes only atomically verified source counts', () => {
  const valid = {
    source_count: 28,
    selected_count: 2,
    source_schema_version: 2,
    source_sha256: 'a'.repeat(64),
    rows: [
      { label: 'Fed', value: 'Yes 42%' },
      { label: 'Iran', value: 'No 74%' },
    ],
  };
  expect(panelCoverage(valid)).toBe('2 selected from 28 verified schema-v2 AMS signals');
  expect(panelCoverage({ ...valid, source_schema_version: 1 })).toBeNull();
  expect(panelCoverage({ ...valid, source_sha256: 'not-a-hash' })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 8 })).toBeNull();
  expect(panelCoverage({ ...valid, source_count: 1 })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 2, rows: [valid.rows[0], valid.rows[0]] })).toBeNull();
  expect(panelCoverage({ ...valid, source_count: Number.MAX_SAFE_INTEGER + 1 })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 0, rows: undefined })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 0, rows: 'not-an-array' })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 0, rows: [{ junk: true }] })).toBeNull();
  expect(panelCoverage({ ...valid, selected_count: 1, rows: [valid.rows[0], { junk: true }] })).toBeNull();
});

it('getLatestBrief returns the newest brief by date', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const brief = await getLatestBrief(db);
  expect(brief?.date).toBe('2026-07-11');
  expect(brief?.kind).toBe('weekend');
});

it('getLatestPanel returns the newest snapshot of a kind', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const panel = await getLatestPanel(db, 'dashboard');
  expect(panel).not.toBeNull();
  expect(panelRows(panel?.payload)[0]).toEqual({ label: 'ES', value: '6,412.50', change: '+0.4%', note: null });
});

it('getLatestVerifiedPanel paginates past twenty newer legacy odds rows', async () => {
  const db = await createTestDb();
  const validPayload = {
    source_count: 28,
    selected_count: 2,
    source_schema_version: 2,
    source_sha256: 'b'.repeat(64),
    rows: [
      { label: 'Iran invasion', value: 'No 72%', change: '+$35K net (24h)' },
      { label: 'Taiwan conflict', value: 'No 96%', change: '-$359 net (24h)' },
    ],
  };
  await db.insert(panelSnapshots).values([
    {
      kind: 'odds_lens',
      takenAt: new Date('2026-07-21T16:20:12Z'),
      payload: validPayload,
    },
    ...Array.from({ length: 20 }, (_, index) => ({
      kind: 'odds_lens' as const,
      takenAt: new Date(Date.UTC(2026, 6, 21, 20, index, 0)),
      payload: { rows: [{ label: `Legacy row ${index}`, value: 0.725 }] },
    })),
  ]);

  const panel = await getLatestVerifiedPanel(db, 'odds_lens');
  expect(panel?.takenAt.toISOString()).toBe('2026-07-21T16:20:12.000Z');
  expect(panel?.view.coverage).toBe('2 selected from 28 verified schema-v2 AMS signals');
  expect(panel?.view.rows.map((row) => row.change)).toEqual(['+$35K net (24h)', '-$359 net (24h)']);
});

it('getLatestVerifiedPanel returns null when recent odds rows are all unverified', async () => {
  const db = await createTestDb();
  await db.insert(panelSnapshots).values({
    kind: 'odds_lens',
    takenAt: new Date('2026-07-21T20:56:00Z'),
    payload: { rows: [{ label: 'Legacy row', value: 0.725 }] },
  });
  expect(await getLatestVerifiedPanel(db, 'odds_lens')).toBeNull();
});

it('getThemeMapCards merges the latest atomic lifecycle into public cards', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const { takenAt, cards } = await getThemeMapCards(db, '2026-07-15');
  expect(takenAt?.toISOString()).toBe('2026-07-11T12:10:00.000Z');
  expect(cards.map((c) => c.slug)).toEqual(['rate-path-repricing', 'dollar-downtrend', 'china-reflation']);
  const rate = cards[0];
  expect(rate.status).toBe('active');
  expect(rate.conviction).toBe('high');
  expect(rate.description).toContain('expected path of policy rates');
  expect(rate.read).toContain('underpricing');
  expect(rate.evidence).toContain('Payrolls beat');
  expect(rate.evidenceLifecycle).toEqual({
    version: 1,
    basis_novelty: 'updated',
    balance: 'supporting',
    confidence_change: 'raised',
    last_basis_change_date: '2026-07-08',
    repeat_count: 0,
  });
  expect(rate.lastSeen).toBe('2026-07-08');
  expect(rate.lastChanged).toBe('2026-07-08');
  expect(rate.nextCheck).toBe('2026-07-15 CPI');
  expect(rate.attentionStatus).toBe('live');
  expect(rate.evidenceAgeDays).toBe(7);
  expect(rate.triggers).toEqual([
    { name: '2y auction demand', state: 'live' },
    { name: 'July CPI', state: 'pending' },
  ]);
  const dollar = cards[1];
  expect(dollar.raiseConditions).toEqual(['ECB holds while the Fed blinks']);
  expect(dollar.evidenceLifecycle).toMatchObject({
    basis_novelty: 'repeated',
    balance: 'challenging',
    confidence_change: 'lowered',
    repeat_count: 2,
  });
  expect(dollar.attentionStatus).toBe('stale');
  expect(dollar.evidenceAgeDays).toBe(15);
  expect(cards[2]).toMatchObject({
    status: 'retired',
    attentionStatus: 'archived',
    evidenceAgeDays: null,
  });
  expect(cards[2].evidenceLifecycle).toMatchObject({
    balance: 'mixed',
    confidence_change: 'invalidated',
  });
});

it.each([
  ['2026-07-08', 'live', 7],
  ['2026-07-09', 'stale', 8],
  ['2026-07-22', 'stale', 21],
  ['2026-07-23', 'retire_review', 22],
] as const)('derives the evidence freshness boundary at %s', (asOf, attentionStatus, evidenceAgeDays) => {
  expect(evidenceFreshness('2026-07-01', asOf)).toEqual({ attentionStatus, evidenceAgeDays });
});

it('uses UTC civil days across leap day and year boundaries', () => {
  expect(evidenceFreshness('2024-02-29', '2024-03-01')).toEqual({
    attentionStatus: 'live',
    evidenceAgeDays: 1,
  });
  expect(evidenceFreshness('2025-12-31', '2026-01-01')).toEqual({
    attentionStatus: 'live',
    evidenceAgeDays: 1,
  });
});

it('distinguishes absent metadata, date errors, and archived themes', () => {
  expect(evidenceFreshness(null, '2026-07-15')).toEqual({
    attentionStatus: 'unassessed',
    evidenceAgeDays: null,
  });
  expect(evidenceFreshness('not-a-date', '2026-07-15')).toEqual({
    attentionStatus: 'date_error',
    evidenceAgeDays: null,
  });
  expect(evidenceFreshness('2026-07-16', '2026-07-15')).toEqual({
    attentionStatus: 'date_error',
    evidenceAgeDays: null,
  });
  expect(evidenceFreshness('2026-01-01', '2026-07-15', 'retired')).toEqual({
    attentionStatus: 'archived',
    evidenceAgeDays: null,
  });
  expect(() => evidenceFreshness('2026-07-01', '2026-02-30')).toThrow(/valid YYYY-MM-DD/);
});

it('uses snapshot status first, normalizes invalidated, and falls back to the table only for legacy cards', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await upsertThemeState(db, {
    taken_at: '2026-07-16T12:10:00Z',
    payload: {
      themes: [
        { slug: 'rate-path-repricing', name: 'Rate path', status: 'candidate' },
        { slug: 'dollar-downtrend', name: 'Dollar downtrend' },
        { slug: 'china-reflation', name: 'China reflation', status: 'active' },
        { slug: 'snapshot-only', name: 'Snapshot only', status: 'invalidated' },
        { slug: 'snapshot-default', name: 'Snapshot default' },
      ],
    },
  });
  const { cards } = await getThemeMapCards(db, '2026-07-16');
  expect(cards.find((card) => card.slug === 'rate-path-repricing')?.status).toBe('candidate');
  expect(cards.find((card) => card.slug === 'dollar-downtrend')?.status).toBe('active');
  expect(cards.find((card) => card.slug === 'china-reflation')?.status).toBe('active');
  expect(cards.find((card) => card.slug === 'snapshot-only')).toMatchObject({
    status: 'retired',
    attentionStatus: 'archived',
  });
  expect(cards.find((card) => card.slug === 'snapshot-default')?.status).toBe('active');
});

it('does not change lifecycle status when the summary basis is silent', async () => {
  const db = await createTestDb();
  await seedAll(db);
  const { cards } = await getThemeMapCards(db, '2026-08-01');
  expect(cards.find((card) => card.slug === 'rate-path-repricing')).toMatchObject({
    status: 'active',
    attentionStatus: 'retire_review',
  });
  expect(cards.find((card) => card.slug === 'china-reflation')).toMatchObject({
    status: 'retired',
    attentionStatus: 'archived',
  });
});

it('maps a legacy card without lifecycle metadata to unassessed', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await upsertThemeState(db, {
    taken_at: '2026-07-16T12:10:00Z',
    payload: { themes: [{ slug: 'rate-path-repricing', name: 'Rate-path repricing' }] },
  });
  const { cards } = await getThemeMapCards(db, '2026-07-16');
  expect(cards.find((card) => card.slug === 'rate-path-repricing')).toMatchObject({
    status: 'active',
    evidence: null,
    evidenceLifecycle: null,
    attentionStatus: 'unassessed',
    evidenceAgeDays: null,
  });
});

it('strips old stored internals and routes evidence and next check through public copy', async () => {
  const db = await createTestDb();
  await db.insert(themeState).values({
    takenAt: new Date('2026-07-16T12:10:00Z'),
    payload: {
      themes: [{
        slug: 'raw-card',
        name: 'Raw card',
        status: 'active',
        evidence: 'Public evidence — with normalized punctuation.',
        next_check: 'Tomorrow — CPI',
        source_urls: ['https://internal.example/source'],
        history: [{ secret: true }],
        hash: 'internal-hash',
        evidence_lifecycle: {
          version: 1,
          basis_novelty: 'updated',
          balance: 'supporting',
          confidence_change: 'raised',
          last_basis_change_date: '2026-07-16',
          repeat_count: 0,
        },
      }],
    },
  });
  const { cards } = await getThemeMapCards(db, '2026-07-16');
  expect(cards[0].evidence).toBe('Public evidence, with normalized punctuation.');
  expect(cards[0].nextCheck).toBe('Tomorrow, CPI');
  expect(JSON.stringify(cards)).not.toMatch(/source_urls|history|hash|internal\.example/);
});
