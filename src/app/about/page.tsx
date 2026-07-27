import { pageMetadata } from '@/lib/metadata';

export const metadata = pageMetadata({
  title: 'About',
  description: 'How Sovs Macro publishes and checks macro research.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <main className="container">
      <h1>About Sovs Macro</h1>
      <p>
        Sovs Macro publishes a daily brief, theme map, catalyst board, and public accountability record.
      </p>
      <h2>How it works</h2>
      <p>
        <strong>Briefs.</strong> Weekday briefs publish at 14:00 UTC. The weekend review publishes
        Saturday at 12:00 UTC.
      </p>
      <p>
        <strong>Checks.</strong> Brief HTML is sanitized before publication. Optional source blocks may
        be omitted when unavailable. Verified panels disclose source coverage and freshness.
      </p>
      <p>
        <strong>Record.</strong> Eligible calls have a source, opening state, due date, and outcome
        rule. <a href="/accountability">Accountability</a> shows results. The{' '}
        <a href="/map">theme map</a> records changes and evidence.
      </p>
      <h2>Who is behind it</h2>
      <p>
        Sovs Macro is a Sovereign Signal project.
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
