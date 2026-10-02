import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ThemeTimeline } from '@/components/ThemeTimeline';

it('renders trigger states in plain English and never the raw not_met token', () => {
  const html = renderToStaticMarkup(
    <ThemeTimeline
      events={[
        {
          eventId: 'e1',
          date: '2026-09-01',
          direction: 'hold',
          evidence: 'Still waiting on the print.',
          triggerState: 'not_met',
          nextCheck: null,
          source: 'daily',
        },
        {
          eventId: 'e2',
          date: '2026-09-02',
          direction: 'raise',
          evidence: 'The condition fired.',
          triggerState: 'met',
          nextCheck: null,
          source: 'daily',
        },
        {
          eventId: 'e3',
          date: '2026-09-03',
          direction: 'hold',
          evidence: 'Only part of the set.',
          triggerState: 'partial_hit',
          nextCheck: null,
          source: 'weekly',
        },
      ]}
    />,
  );
  expect(html).toContain('Not yet triggered');
  expect(html).toContain('triggers: Triggered');
  expect(html).toContain('Partial hit');
  expect(html).not.toContain('not_met');
  expect(html).not.toContain('partial_hit');
});
