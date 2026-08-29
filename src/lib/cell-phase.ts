/**
 * Satellite cell weather from sovs-macro's convective-front classifier.
 * The publisher already stamps cell_phase + phase_age_days on theme-state
 * cards; this module is the site's display vocabulary only.
 */

export const CELL_PHASES = [
  'compression',
  'ignition',
  'crystallization',
  'mature',
  'bifurcation',
  'crack',
  'downdraft',
] as const;

export type CellPhase = (typeof CELL_PHASES)[number];

/** Mutable tuple for zod enums (readonly `as const` is not assignable). */
export const CELL_PHASE_ENUM = CELL_PHASES as unknown as [CellPhase, ...CellPhase[]];

export const CELL_PHASE_LABELS: Record<CellPhase, string> = {
  compression: 'Compression',
  ignition: 'Ignition',
  crystallization: 'Crystallization',
  mature: 'Mature',
  bifurcation: 'Bifurcation',
  crack: 'Crack',
  downdraft: 'Downdraft',
};

const PHASES = new Set<string>(CELL_PHASES);

export function parseCellPhase(value: unknown): CellPhase | null {
  return typeof value === 'string' && PHASES.has(value) ? (value as CellPhase) : null;
}

export function cellPhaseLabel(phase: CellPhase | null): string | null {
  return phase ? CELL_PHASE_LABELS[phase] : null;
}

/** Compact age for chips: today / 1d / 12d. */
export function phaseAgeLabel(days: unknown): string | null {
  if (typeof days !== 'number' || !Number.isFinite(days) || days < 0) return null;
  const n = Math.round(days);
  if (n === 0) return 'today';
  if (n === 1) return '1d';
  return `${n}d`;
}
