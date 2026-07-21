import type { PanelRowItem } from '@/lib/panel-contract';
import { EmptyState } from './EmptyState';
import { UpdatedAgo } from './UpdatedAgo';

function changeClass(change: string): string {
  if (change.startsWith('+')) return 'num change-up';
  if (change.startsWith('-')) return 'num change-down';
  return 'num';
}

export function PanelTable(props: { title: string; rows: PanelRowItem[]; takenAt: string | null; summary?: string | null }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <h2>{props.title}</h2>
        {props.takenAt ? <UpdatedAgo takenAt={props.takenAt} /> : null}
      </div>
      {props.summary ? <p className="panel-summary">{props.summary}</p> : null}
      {props.rows.length === 0 ? (
        <EmptyState>Waiting for data.</EmptyState>
      ) : (
        <div className="panel-table-scroll">
          <table className="panel-table">
            <tbody>
              {props.rows.map((r) => (
                <tr key={r.label}>
                  <td>
                    {r.label}
                    {r.note ? <span className="panel-note">, {r.note}</span> : null}
                  </td>
                  <td className="num">{r.value}</td>
                  <td className={r.change ? changeClass(r.change) : 'num'}>{r.change ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
