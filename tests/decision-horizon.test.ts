import { expect, it } from 'vitest';
import { decisionHorizon } from '@/lib/decision-horizon';

it('ignores past expiries when naming the next decision', () => {
  const result = decisionHorizon(
    [
      { status: 'pending', expiresAt: '2026-08-01' },
      { status: 'pending', expiresAt: '2026-09-30' },
      { status: 'pending', expiresAt: null },
      { status: 'hit', expiresAt: '2026-07-01' },
    ],
    '2026-08-29',
  );
  expect(result).toEqual({ nextDecision: '2026-09-30', overdue: 1 });
});

it('reports overdue with no future dated claims', () => {
  expect(
    decisionHorizon([{ status: 'pending', expiresAt: '2026-08-01' }], '2026-08-29'),
  ).toEqual({ nextDecision: null, overdue: 1 });
});
