export type BriefKindBadge = { label: string; className: string };

/** Weekend kind covers Saturday reviews and Sunday week-ahead notes. */
export function briefKindBadge(kind: string, subject: string): BriefKindBadge | null {
  if (/week ahead/i.test(subject)) {
    return { label: 'Week ahead', className: 'badge badge-weekend' };
  }
  if (kind === 'weekend') {
    return { label: 'Weekend review', className: 'badge badge-weekend' };
  }
  return null;
}
