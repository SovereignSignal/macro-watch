import { expect, it } from 'vitest';
import { briefKindBadge, briefPath, pickBriefForKind } from '@/lib/brief-kind';

it('labels Sunday week-ahead notes separately from Saturday reviews', () => {
  expect(briefKindBadge('weekend', 'Week Ahead, Sunday, August 23, 2026')?.label).toBe('Week ahead');
  expect(briefKindBadge('weekend', 'Weekend Review, Saturday, August 29, 2026')?.label).toBe(
    'Weekend review',
  );
  expect(briefKindBadge('daily', 'Macro Brief, Friday, August 28, 2026')?.label).toBe('Daily');
  expect(briefKindBadge('week-ahead', 'Macro note')?.label).toBe('Week ahead');
});

it('builds kind permalinks and prefers an exact stored kind', () => {
  expect(briefPath('2026-09-17', 'daily', 'Macro Brief')).toBe('/briefs/2026-09-17/daily');
  expect(briefPath('2026-08-23', 'weekend', 'Week Ahead, Sunday, August 23, 2026')).toBe(
    '/briefs/2026-08-23/week-ahead',
  );
  const rows = [
    { kind: 'weekend', subject: 'Week Ahead, Sunday' },
    { kind: 'week-ahead', subject: 'Week ahead note' },
  ];
  expect(pickBriefForKind(rows, 'week-ahead')?.kind).toBe('week-ahead');
  expect(pickBriefForKind(rows, 'weekend')?.kind).toBe('weekend');
  expect(pickBriefForKind(rows, 'daily')).toBeNull();
});
