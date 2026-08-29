import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { isMappedThemeClaim, UNMAPPED_THEME_SLUG } from '@/lib/claim-display';
import { claimsBodySchema, upsertClaims } from '@/lib/ingest/claims';
import { seedAll } from '@/lib/seed';
import { createTestDb } from './helpers/db';

const { default: AccountabilityPage } = await import('@/app/accountability/page');

function page(sp: Record<string, string> = {}) {
  return AccountabilityPage({ searchParams: Promise.resolve(sp) });
}

const UNMAPPED_PREDICATE = 'Will the Lakers win the 2027 NBA Finals?';

it('treats only standing-theme claims as mapped', () => {
  expect(isMappedThemeClaim({ themes: ['rate-path-repricing'] })).toBe(true);
  expect(isMappedThemeClaim({ themes: [UNMAPPED_THEME_SLUG] })).toBe(false);
  expect(isMappedThemeClaim({ themes: [UNMAPPED_THEME_SLUG, 'dollar-downtrend'] })).toBe(true);
  expect(isMappedThemeClaim({ themes: [] })).toBe(false);
});

it('hides unmapped wallet noise from the default book and ledger', async () => {
  const db = await createTestDb();
  await seedAll(db);
  await upsertClaims(
    db,
    claimsBodySchema.parse({
      claim_id: 'cl-unmapped-sports',
      kind: 'smart_money',
      themes: [UNMAPPED_THEME_SLUG],
      predicate: UNMAPPED_PREDICATE,
      opened_at: '2026-07-10',
      expires_at: '2026-08-01',
      status: 'pending',
    }),
  );

  const def = renderToStaticMarkup(await page());
  const defaultLedger = def.slice(def.indexOf('Public ledger'));
  expect(defaultLedger).not.toContain(UNMAPPED_PREDICATE);
  expect(defaultLedger).toContain('2y UST closes above 4.40%');
  expect(def).toContain('standing themes');
  expect(def).toContain('1 unmapped wallet market stays in the scoreboards');
  expect(def).not.toContain(UNMAPPED_PREDICATE);
  // Scoreboards and headline counts stay on the full ledger.
  expect(def).toContain('2 decisions recorded.');
  expect(def).toContain('>6<'); // all entries: 5 seed + 1 unmapped

  const all = renderToStaticMarkup(await page({ relevance: 'all' }));
  const allLedger = all.slice(all.indexOf('Public ledger'));
  expect(allLedger).toContain(UNMAPPED_PREDICATE);
  expect(all).toContain('2 decisions recorded.');

  const theme = renderToStaticMarkup(await page({ theme: UNMAPPED_THEME_SLUG }));
  const themeLedger = theme.slice(theme.indexOf('Public ledger'));
  expect(themeLedger).toContain(UNMAPPED_PREDICATE);
  expect(themeLedger).not.toContain('2y UST closes above 4.40%');
});
