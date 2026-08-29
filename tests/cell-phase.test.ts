import { expect, it } from 'vitest';
import { cellPhaseLabel, parseCellPhase, phaseAgeLabel } from '@/lib/cell-phase';

it('accepts only the convective-front vocabulary', () => {
  expect(parseCellPhase('ignition')).toBe('ignition');
  expect(parseCellPhase('downdraft')).toBe('downdraft');
  expect(parseCellPhase('the front')).toBeNull();
  expect(parseCellPhase('')).toBeNull();
  expect(parseCellPhase(null)).toBeNull();
});

it('labels phases for the chip', () => {
  expect(cellPhaseLabel('crystallization')).toBe('Crystallization');
  expect(cellPhaseLabel(null)).toBeNull();
});

it('formats phase age compactly', () => {
  expect(phaseAgeLabel(0)).toBe('today');
  expect(phaseAgeLabel(1)).toBe('1d');
  expect(phaseAgeLabel(6.2)).toBe('6d');
  expect(phaseAgeLabel(-1)).toBeNull();
  expect(phaseAgeLabel('6')).toBeNull();
});
