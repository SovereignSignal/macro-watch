import { expect, it } from 'vitest';
import {
  GROUP_MIN_SAMPLE,
  OVERALL_MIN_SAMPLE,
  battingAverage,
  groupBoards,
  qualityClass,
  scoreClaims,
} from '@/lib/scoring';

// Pipeline vocabulary throughout: pending|hit|miss|partial|expired|
// judgment-required|void (controller override — not the site-plan draft's
// open/resolved_correct/resolved_incorrect/invalidated).

it('zero resolved means hitRate null (not enough to grade)', () => {
  const board = scoreClaims([{ status: 'pending' }, { status: 'expired' }]);
  expect(board).toEqual({
    pending: 1,
    hits: 0,
    misses: 0,
    resolved: 0,
    partial: 0,
    expired: 1,
    judgmentRequired: 0,
    void: 0,
    hitRate: null,
  });
});

it('computes hit rate over hits+misses only — every other status is tallied but never enters the denominator', () => {
  const board = scoreClaims([
    { status: 'hit' },
    { status: 'hit' },
    { status: 'miss' },
    { status: 'pending' },
    { status: 'void' },
    { status: 'partial' },
    { status: 'expired' },
    { status: 'judgment-required' },
  ]);
  expect(board.resolved).toBe(3); // hits + misses only
  expect(board.hits).toBe(2);
  expect(board.misses).toBe(1);
  expect(board.hitRate).toBeCloseTo(2 / 3);
  expect(board.pending).toBe(1);
  expect(board.void).toBe(1);
  expect(board.partial).toBe(1);
  expect(board.expired).toBe(1);
  expect(board.judgmentRequired).toBe(1);
});

it('partial and judgment-required claims never move the average, no matter how many pile up', () => {
  const baseline = scoreClaims([{ status: 'hit' }, { status: 'hit' }, { status: 'miss' }]);
  const withNoise = scoreClaims([
    { status: 'hit' },
    { status: 'hit' },
    { status: 'miss' },
    { status: 'partial' },
    { status: 'partial' },
    { status: 'partial' },
    { status: 'judgment-required' },
    { status: 'judgment-required' },
    { status: 'void' },
    { status: 'expired' },
    { status: 'pending' },
  ]);
  expect(withNoise.hitRate).toBe(baseline.hitRate);
  expect(withNoise.resolved).toBe(baseline.resolved);
  expect(withNoise.partial).toBe(3);
  expect(withNoise.judgmentRequired).toBe(2);
  expect(withNoise.void).toBe(1);
  expect(withNoise.expired).toBe(1);
  expect(withNoise.pending).toBe(1);
});

it('groupBoards fans a claim out to every key it carries', () => {
  const rows = [
    { status: 'hit', themes: ['a', 'b'] },
    { status: 'pending', themes: ['a'] },
  ];
  const boards = groupBoards(rows, (r) => r.themes);
  expect([...boards.keys()].sort()).toEqual(['a', 'b']);
  expect(boards.get('a')?.resolved).toBe(1);
  expect(boards.get('a')?.pending).toBe(1);
  expect(boards.get('b')?.resolved).toBe(1);
});

it('qualityClass reads market_type with an unclassified fallback', () => {
  expect(qualityClass({ market_type: 'rates' })).toBe('rates');
  expect(qualityClass({})).toBe('unclassified');
  expect(qualityClass(null)).toBe('unclassified');
});

it('battingAverage suppresses the numeric average below the overall minimum sample (8 resolved)', () => {
  const sevenResolved = scoreClaims([
    ...Array(4).fill({ status: 'hit' }),
    ...Array(3).fill({ status: 'miss' }),
  ]);
  expect(sevenResolved.resolved).toBe(7);
  expect(battingAverage(sevenResolved, OVERALL_MIN_SAMPLE)).toBeNull();

  const eightResolved = scoreClaims([
    ...Array(5).fill({ status: 'hit' }),
    ...Array(3).fill({ status: 'miss' }),
  ]);
  expect(eightResolved.resolved).toBe(8);
  expect(battingAverage(eightResolved, OVERALL_MIN_SAMPLE)).toBeCloseTo(5 / 8);
});

it('battingAverage suppresses the numeric average below the per-theme/per-class minimum sample (4 resolved)', () => {
  const threeResolved = scoreClaims([{ status: 'hit' }, { status: 'hit' }, { status: 'miss' }]);
  expect(battingAverage(threeResolved, GROUP_MIN_SAMPLE)).toBeNull();

  const fourResolved = scoreClaims([
    { status: 'hit' },
    { status: 'hit' },
    { status: 'hit' },
    { status: 'miss' },
  ]);
  expect(battingAverage(fourResolved, GROUP_MIN_SAMPLE)).toBeCloseTo(3 / 4);
});

it('a resolved count exactly at the floor still shows a number; the floor is inclusive', () => {
  const exactly4 = scoreClaims([
    { status: 'hit' },
    { status: 'hit' },
    { status: 'miss' },
    { status: 'miss' },
  ]);
  expect(exactly4.resolved).toBe(4);
  expect(battingAverage(exactly4, GROUP_MIN_SAMPLE)).toBe(0.5);
});
