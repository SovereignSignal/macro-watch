export const metadata = { title: 'About' };

export default function AboutPage() {
  return (
    <main className="container">
      <h1>About macro.watch</h1>
      <p>
        macro.watch is the public surface of SovsClaw, a Sovereign Signal system: an automated
        macro intelligence pipeline that reads the tape, the news flow, and the prediction
        markets, composes a daily brief, and grades its own calls in public.
      </p>
      <h2>How it works</h2>
      <p>
        <strong>Pipeline.</strong> Every weekday at 14:00 UTC — and Saturdays at 12:00 UTC for the
        weekend review — the pipeline composes a brief from its source ledgers: market data,
        curated feeds, and prediction-market odds. AI does the composition; nothing is
        hand-written.
      </p>
      <p>
        <strong>Validation.</strong> Before anything publishes, deterministic checks validate the
        brief — structure, data anchors, and the claims it makes. A brief that fails validation
        does not ship. This site only receives a brief after its send is verified.
      </p>
      <p>
        <strong>Self-grading.</strong> The system keeps a ledger of falsifiable claims with expiry
        dates and data anchors. When a claim resolves it is graded, and the result is published on
        the <a href="/accountability">accountability page</a> — hits, misses, and all. The{' '}
        <a href="/map">living theme map</a> keeps the longer arcs honest: every raise, lower, and
        retire is on the record with its evidence, linked to the brief that made the call.
      </p>
      <h2>Who is behind it</h2>
      <p>
        SovsClaw is built and operated by Sovereign Signal. The system is AI-composed and
        deterministically validated; a human owns the infrastructure, not the daily output.
      </p>
      <h2>Disclaimer</h2>
      <p>
        Not investment advice. macro.watch is an automated research surface. Nothing here is a
        recommendation to buy or sell any security or asset. The system is sometimes wrong — the
        accountability page exists precisely so you can see how often.
      </p>
      <p>
        <a href="/feed.xml">Subscribe via RSS</a>
      </p>
    </main>
  );
}
