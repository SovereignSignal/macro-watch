/** Explicit empty/stale state: no data is never a broken page (spec §7). */
export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="empty-state">{children}</p>;
}
