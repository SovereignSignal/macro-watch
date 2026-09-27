import type { ReactNode } from 'react';
import { formatMonth } from '@/lib/format';

type ArchiveItem = { key: string; date: string; node: ReactNode };

/** Groups an already-sorted (newest first) page of archive rows under month headings. */
export function ArchiveByMonth({ items }: { items: ArchiveItem[] }) {
  const groups: { month: string; label: string; items: ArchiveItem[] }[] = [];
  for (const item of items) {
    const month = item.date.slice(0, 7);
    const last = groups[groups.length - 1];
    if (!last || last.month !== month) {
      groups.push({ month, label: formatMonth(`${month}-01`), items: [] });
    }
    groups[groups.length - 1].items.push(item);
  }
  return (
    <div className="archive">
      {groups.map((group) => (
        <section key={group.month} aria-label={group.label}>
          <h2 className="archive-month">{group.label}</h2>
          <ul className="archive-list">
            {group.items.map((item) => (
              <li key={item.key}>{item.node}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
