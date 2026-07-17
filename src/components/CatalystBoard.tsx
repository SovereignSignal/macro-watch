import { formatDate } from '@/lib/format';
import {
  catalystFields,
  resolutionFields,
  type ForwardEventRow,
} from '@/lib/queries/catalysts';
import { EmptyState } from './EmptyState';

function Provenance({ title, url }: { title: string; url: string | null }) {
  if (!title && !url) return null;
  return (
    <p className="panel-note">
      Source:{' '}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          {title || url}
        </a>
      ) : (
        title
      )}
    </p>
  );
}

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
                <p>{f.expectation || 'Not recorded.'}</p>
              </div>
              <div>
                <h4>Surprise</h4>
                <p>{f.surprise || 'Not recorded.'}</p>
              </div>
            </div>
            <Provenance title={f.sourceTitle} url={f.sourceUrl} />
          </div>
        );
      })}
    </>
  );
}

function AwaitingResolution({ rows }: { rows: ForwardEventRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby="awaiting-resolution">
      <h2 id="awaiting-resolution">Awaiting resolution</h2>
      <p className="brief-meta">These event dates have passed. Their outcomes have not been recorded.</p>
      {rows.map((r) => {
        const f = catalystFields(r.payload);
        return (
          <div key={r.eventId} className="catalyst catalyst-overdue">
            <p className="date">
              {formatDate(r.eventDate)} <span className="badge badge-overdue">Update due</span>
            </p>
            <h3>{f.event || r.eventId}</h3>
            <div className="vs">
              <div>
                <h4>Expected</h4>
                <p>{f.expectation || 'Not recorded.'}</p>
              </div>
              <div>
                <h4>Surprise</h4>
                <p>{f.surprise || 'Not recorded.'}</p>
              </div>
            </div>
            <p className="panel-note catalyst-status">Outcome has not been recorded.</p>
            <Provenance title={f.sourceTitle} url={f.sourceUrl} />
          </div>
        );
      })}
    </section>
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
              {res.resolvedAt ? `, resolved ${formatDate(res.resolvedAt)}` : ''}
            </p>
            <h3>{f.event || r.eventId}</h3>
            <div className="vs">
              <div>
                <h4>Expectation</h4>
                <p>{f.expectation || 'Not recorded.'}</p>
              </div>
              <div>
                <h4>Outcome</h4>
                <p>
                  {res.outcome || 'Not recorded.'}
                  {res.note ? <span className="panel-note"> {res.note}</span> : null}
                </p>
              </div>
            </div>
            <Provenance title={f.sourceTitle} url={f.sourceUrl} />
          </div>
        );
      })}
    </>
  );
}

export function CatalystBoard(props: {
  upcoming: ForwardEventRow[];
  awaitingResolution: ForwardEventRow[];
  resolved: ForwardEventRow[];
}) {
  return (
    <>
      <section>
        <h2>Upcoming</h2>
        <Upcoming rows={props.upcoming} />
      </section>
      <AwaitingResolution rows={props.awaitingResolution} />
      <section>
        <h2>Resolved</h2>
        <Resolved rows={props.resolved} />
      </section>
    </>
  );
}
