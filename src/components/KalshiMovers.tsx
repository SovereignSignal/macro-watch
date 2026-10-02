import {
  formatChangePp,
  formatProb,
  formatVolume,
  formatWatchAsOf,
  formatWindow,
  type KalshiMovers as KalshiMoversView,
} from '@/lib/public-watch';
import { EmptyState } from './EmptyState';

function oddsCell(now: number | null, prev: number | null): string {
  const before = prev == null ? null : formatProb(prev);
  const after = now == null ? null : formatProb(now);
  if (before && after) return `${before} → ${after}`;
  return after ?? before ?? '';
}

function changeClass(pp: number | null): string {
  if (pp == null || pp === 0) return 'num';
  return pp > 0 ? 'num change-up' : 'num change-down';
}

export function KalshiMovers({ movers }: { movers: KalshiMoversView | null }) {
  const windowLabel = movers?.windowHours == null ? null : formatWindow(movers.windowHours);
  const asOf = movers ? formatWatchAsOf(movers.asOf) : null;
  const showHour = movers?.items.some((item) => item.change1hPp != null) ?? false;
  return (
    <section className="panel" aria-label="Biggest odds moves">
      <div className="panel-head">
        <h2>Biggest odds moves</h2>
        {movers?.stale ? <span className="chip chip-unverified">Stale</span> : null}
      </div>
      {movers ? (
        <p className="panel-summary">
          Kalshi
          {windowLabel ? ` · ${windowLabel}` : ''}
          {asOf ? ` · as of ${asOf}` : ''}
        </p>
      ) : null}
      {movers?.stale ? (
        <p className="stale-notice">Stale. These moves are older than the refresh window.</p>
      ) : null}
      {!movers || movers.items.length === 0 ? (
        <EmptyState>{movers ? 'No markets moved in this window.' : 'No odds moves yet.'}</EmptyState>
      ) : (
        <div className="panel-table-scroll">
          <table className="panel-table panel-table--stack">
            <caption className="sr-only">Largest Kalshi probability moves</caption>
            <thead>
              <tr>
                <th scope="col">Market</th>
                <th scope="col">Odds</th>
                <th scope="col">Change</th>
                {showHour ? <th scope="col">1 hour</th> : null}
                <th scope="col">Volume</th>
                <th scope="col">Category</th>
              </tr>
            </thead>
            <tbody>
              {movers.items.map((item) => {
                const change = item.changePp == null ? null : formatChangePp(item.changePp);
                const hour = item.change1hPp == null ? null : formatChangePp(item.change1hPp);
                const volume = item.volume24h == null ? null : formatVolume(item.volume24h);
                return (
                  <tr key={`${item.ticker ?? ''}:${item.title}`}>
                    <th scope="row">
                      {item.url ? (
                        <a href={item.url} rel="noopener noreferrer">{item.title}</a>
                      ) : item.title}
                      {item.ticker ? <span className="panel-note"> {item.ticker}</span> : null}
                    </th>
                    <td className="num" data-label="Odds">{oddsCell(item.probNow, item.probPrev)}</td>
                    <td className={changeClass(item.changePp)} data-label="Change">{change ?? ''}</td>
                    {showHour ? (
                      <td className={changeClass(item.change1hPp)} data-label="1 hour">{hour ?? ''}</td>
                    ) : null}
                    <td className="num" data-label="Volume">{volume ?? ''}</td>
                    <td data-label="Category">{item.category ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
