import { finiteSpark, type PanelRowItem } from '@/lib/panel-contract';
import type { HorizonChangeColumn } from '@/lib/panel-present';
import { EmptyState } from './EmptyState';
import { Sparkline } from './Sparkline';
import { UpdatedAgo } from './UpdatedAgo';

function changeClass(change: string): string {
  if (change.startsWith('+')) return 'num change-up';
  if (change.startsWith('-')) return 'num change-down';
  return 'num';
}

export function PanelTable(props: {
  title: string;
  rows: PanelRowItem[];
  takenAt: string | null;
  summary?: string | null;
  columns?: [string, string, string];
  horizonColumns?: readonly HorizonChangeColumn[];
}) {
  const columns = props.columns ?? ['Market', 'Value', 'Change'];
  const horizonColumns = props.horizonColumns ?? [];
  const showTrend = props.rows.some((row) => finiteSpark(row.spark));
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
            <caption className="sr-only">{props.title}</caption>
            <thead>
              <tr>
                {columns.map((column) => <th key={column} scope="col">{column}</th>)}
                {horizonColumns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}
                {showTrend ? <th scope="col">Trend</th> : null}
              </tr>
            </thead>
            <tbody>
              {props.rows.map((row) => {
                const spark = finiteSpark(row.spark);
                return (
                <tr key={row.label}>
                  <th scope="row">
                    {row.label}
                    {row.note ? <span className="panel-note"> {row.note}</span> : null}
                  </th>
                  <td className="num">
                    {row.value}
                    {row.freshness ? (
                      row.freshnessAt ? (
                        <time className="quote-freshness" dateTime={row.freshnessAt}>{row.freshness}</time>
                      ) : (
                        <span className="quote-freshness">{row.freshness}</span>
                      )
                    ) : null}
                  </td>
                  <td className={row.change ? changeClass(row.change) : 'num'}>{row.change ?? ''}</td>
                  {horizonColumns.map((column) => {
                    const value = row[column.key] ?? '';
                    return (
                      <td key={column.key} className={value ? changeClass(value) : 'num'}>{value}</td>
                    );
                  })}
                  {showTrend ? (
                    <td className="spark-cell">
                      {spark ? (
                        <Sparkline
                          levels={spark}
                          scale="linear"
                          width={72}
                          height={18}
                          label={`${row.label} trend`}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
