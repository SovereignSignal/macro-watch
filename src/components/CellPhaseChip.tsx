import {
  cellPhaseLabel,
  parseCellPhase,
  phaseAgeLabel,
} from '@/lib/cell-phase';

/** Compact weather chip for theme cards, strip, and dossiers. */
export function CellPhaseChip({
  phase,
  ageDays,
}: {
  phase: string | null | undefined;
  ageDays?: number | null;
}) {
  const parsed = parseCellPhase(phase);
  const label = cellPhaseLabel(parsed);
  if (!label || !parsed) return null;
  const age = phaseAgeLabel(ageDays);
  return (
    <span className={`badge badge-phase badge-phase-${parsed}`}>
      {label}
      {age ? ` · ${age}` : ''}
    </span>
  );
}
