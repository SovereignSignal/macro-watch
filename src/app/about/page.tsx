import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'About',
  description: 'What Sovs Macro publishes, how the record is scored, and which sources are used.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <main className="container">
      <h1>About Sovs Macro</h1>
      <p>
        Sovs Macro is the public site for a macro research pipeline. It publishes a daily brief,
        a weekend review, a week-ahead note, a theme map, research memos, a catalyst board, and
        an accountability ledger. Sovs Macro is a Sovereign Signal project.
      </p>

      <h2>Daily brief</h2>
      <p>
        Weekday briefs publish Monday to Friday at 14:00 UTC. Each brief states the day&rsquo;s macro
        read, what changed, and what would change the view. Brief HTML is sanitized before publication.
      </p>

      <h2>Weekend review</h2>
      <p>
        The Weekend Review publishes Saturday at 17:00 UTC. It looks back at the week on the theme
        map: which themes held, which moved, and which calls reached an outcome.
      </p>

      <h2>Week ahead</h2>
      <p>
        The Week Ahead publishes Sunday at 23:00 UTC. It names the scheduled events and the
        observations that would matter for the themes still on the map.
      </p>

      <h2>Theme map</h2>
      <p>
        The <a href="/map">theme map</a> is the standing set of macro themes. Each theme has a
        conviction level, a short read, the conditions that would raise or lower it, and a timeline
        of evidence. When a theme is renamed, the older name stays in the database and the map
        shows the current name, with the older evidence folded into that page.
      </p>

      <h2>Accountability and claims scoring</h2>
      <p>
        Eligible calls have a source, an opening state, a due date, and an outcome rule. The hit
        rate counts hits divided by hits plus misses. Pending calls are not in that denominator.
        Partial, expired, judgment-required, and void outcomes are listed and are not scored as
        hits or misses. Forecast accuracy includes only eligible calls recorded before their
        outcome. <a href="/accountability">Accountability</a> shows the record.
      </p>

      <h2>Catalysts</h2>
      <p>
        The <a href="/catalysts">catalyst board</a> lists dated events the map is watching, the
        outcome that was expected, and the resolution once the date has passed.
      </p>

      <h2>Research memos</h2>
      <p>
        Research memos publish weekday mornings after 07:00 UTC. A memo pressure-tests one
        standing assumption against public sources and states what the evidence changed, the call,
        and what to watch next.
      </p>

      <h2>Sources</h2>
      <p>
        The site links to public primary sources. Paywalled sources are never republished. Text
        and links from licensed news are rejected when a brief, memo, claim, or theme event is
        submitted, and stripped again when a stored page is rendered. Optional source blocks may
        be omitted when unavailable. Verified panels disclose source coverage and freshness.
      </p>

      <h2>Disclaimer</h2>
      <p>
        Automated research. No investment advice or buy or sell recommendations. See the{' '}
        <a href="/accountability">public record</a>.
      </p>
      <p>
        <a href="/feed.xml">Subscribe via RSS</a>
      </p>
    </main>
  );
}
