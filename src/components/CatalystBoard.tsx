import { formatDate } from '@/lib/format';
import {
  catalystFields,
  resolutionFields,
  type ForwardEventRow,
} from '@/lib/queries/catalysts';
import { EmptyState } from './EmptyState';

function Upcoming({ rows }: { rows: ForwardEventRow[] }) {
  if (rows.length === 0) return <EmptyState>No upcoming catalysts on the board.</EmptyState>;
  return (
    <>
      {rows.map((r) => {
        const f = catalystFields(r.payload);
        return (
          <div key={r.eventId} className="catalyst">
            <p className="date">{formatDate(r.eventDate)}</p>
            <h3>{f.event || r.eventId}</h3>
            <div className="vs">
              <div>
                <h4>Expected</h4>
                <p>{f.expectation || '—'}</p>
              </div>
              <div>
                <h4>What would surprise</h4>
                <p>{f.surprise || '—'}</p>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

function Resolved({ rows }: { rows: ForwardEventRow[] }) {
  if (rows.length === 0) return <EmptyState>Nothing resolved yet.</EmptyState>;
  return (
    <>
      {rows.map((r) => {
        const f = catalystFields(r.payload);
        const res = resolutionFields(r.resolution);
        return (
          <div key={r.eventId} className="catalyst">
            <p className="date">
              {formatDate(r.eventDate)}
              {res.resolvedAt ? ` · resolved ${formatDate(res.resolvedAt)}` : ''}
            </p>
            <h3>{f.event || r.eventId}</h3>
            <div className="vs">
              <div>
                <h4>Expectation</h4>
                <p>{f.expectation || '—'}</p>
              </div>
              <div>
                <h4>Outcome</h4>
                <p>
                  {res.outcome || '—'}
                  {res.note ? <span className="panel-note"> — {res.note}</span> : null}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export function CatalystBoard(props: { upcoming: ForwardEventRow[]; resolved: ForwardEventRow[] }) {
  return (
    <>
      <section>
        <h2>Upcoming</h2>
        <Upcoming rows={props.upcoming} />
      </section>
      <section>
        <h2>Resolved</h2>
        <Resolved rows={props.resolved} />
      </section>
    </>
  );
}
