import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { FieldMap } from '@/components/FieldMap';
import {
  buildFieldLayout,
  fieldLabel,
  type FieldThemeInput,
  formatPressure,
  pressureReading,
  pressureScore,
  windowStart,
  xForPressure,
} from '@/lib/field-map';

const ASOF = '2026-07-11';

function theme(slug: string, over: Partial<FieldThemeInput> = {}): FieldThemeInput {
  return {
    slug,
    name: slug,
    status: 'active',
    conviction: 'medium',
    lastEventAt: null,
    events: [],
    ...over,
  };
}

const ev = (direction: string, date = '2026-07-08') => ({ direction, date });

// --- pressure scoring -----------------------------------------------------

it('pressureScore weighs every direction per spec', () => {
  expect(pressureScore([ev('raise')])).toBe(1);
  expect(pressureScore([ev('lower')])).toBe(-1);
  expect(pressureScore([ev('candidate')])).toBe(0.5);
  expect(pressureScore([ev('invalidate')])).toBe(-0.5);
  expect(pressureScore([ev('hold')])).toBe(0);
  expect(pressureScore([ev('retire')])).toBe(-1);
  expect(pressureScore([ev('unknown-direction')])).toBe(0);
  expect(pressureScore([ev('raise'), ev('raise'), ev('candidate'), ev('lower')])).toBe(1.5);
});

it('pressureScore clamps to [-3, +3]', () => {
  expect(pressureScore(Array(5).fill(ev('raise')))).toBe(3);
  expect(pressureScore(Array(5).fill(ev('retire')))).toBe(-3);
});

// --- the 30-day window ------------------------------------------------------

it('windowStart spans exactly 30 days ending asOf', () => {
  expect(windowStart('2026-07-11')).toBe('2026-06-12');
  expect(windowStart('2026-03-05')).toBe('2026-02-04'); // month boundary
});

it('buildFieldLayout only counts events inside the window', () => {
  const layout = buildFieldLayout(
    [
      theme('a', { events: [ev('raise', '2026-06-12'), ev('raise', '2026-06-11')] }),
      theme('b'),
    ],
    ASOF,
  );
  const a = layout.nodes.find((n) => n.slug === 'a');
  expect(a?.eventCount).toBe(1); // 06-11 fell out of the window
  expect(a?.pressure).toBe(1);
});

// --- band placement ----------------------------------------------------------

it('places themes in their conviction band; unrated reads low', () => {
  const layout = buildFieldLayout(
    [
      theme('hi', { conviction: 'high' }),
      theme('mid', { conviction: 'medium' }),
      theme('lo', { conviction: 'low' }),
      theme('unrated', { conviction: null }),
    ],
    ASOF,
  );
  const [high, medium, low] = layout.bands;
  const within = (slug: string, band: { top: number; height: number }) => {
    const n = layout.nodes.find((x) => x.slug === slug);
    expect(n).toBeDefined();
    expect(n!.y).toBeGreaterThan(band.top);
    expect(n!.y).toBeLessThan(band.top + band.height);
  };
  within('hi', high);
  within('mid', medium);
  within('lo', low);
  within('unrated', low);
  const unrated = layout.nodes.find((n) => n.slug === 'unrated');
  expect(unrated?.lit).toBe(0);
});

it('labels conviction bands in title case so the axis reads as words', () => {
  const layout = buildFieldLayout([theme('a'), theme('b')], ASOF);
  expect(layout.bands.map((b) => b.label)).toEqual(['High', 'Medium', 'Low']);
});

it('keeps unoccupied bands labeled but thin', () => {
  const layout = buildFieldLayout(
    [theme('a', { conviction: 'high' }), theme('b', { conviction: 'high' })],
    ASOF,
  );
  expect(layout.bands[0].height).toBeGreaterThanOrEqual(96);
  expect(layout.bands[1].height).toBe(48); // medium: empty
  expect(layout.bands[2].height).toBe(48); // low: empty
});

it('maps pressure onto x: -3 left edge, 0 the zero rule, +3 right edge', () => {
  const layout = buildFieldLayout(
    [
      theme('easing', { events: Array(4).fill(ev('lower')) }),
      theme('flat', { events: [] }),
      theme('building', { events: Array(4).fill(ev('raise')) }),
    ],
    ASOF,
  );
  const x = (slug: string) => layout.nodes.find((n) => n.slug === slug)!.x;
  expect(x('easing')).toBe(layout.xMin);
  expect(x('flat')).toBe(layout.zeroX);
  expect(x('building')).toBe(layout.xMax);
  expect(xForPressure(0)).toBe(layout.zeroX);
});

// --- the retired shelf --------------------------------------------------------

it('pins retired themes to the shelf below the bands, not the field', () => {
  const layout = buildFieldLayout(
    [theme('a'), theme('b'), theme('dead', { status: 'retired', conviction: 'low' })],
    ASOF,
  );
  const dead = layout.nodes.find((n) => n.slug === 'dead');
  const lowBottom = layout.bands[2].top + layout.bands[2].height;
  expect(dead?.shelf).toBe(true);
  expect(dead!.y).toBeGreaterThan(lowBottom);
  expect(layout.shelf).not.toBeNull();
  expect(layout.plottable).toBe(2); // retired never counts as plottable
});

it('omits the shelf when nothing is retired', () => {
  const layout = buildFieldLayout([theme('a'), theme('b')], ASOF);
  expect(layout.shelf).toBeNull();
});

// --- determinism & collisions ---------------------------------------------------

it('is deterministic and independent of input order', () => {
  const themes = [
    theme('alpha', { conviction: 'high', events: [ev('raise')] }),
    theme('beta', { conviction: 'high', events: [ev('raise')] }),
    theme('gamma', { conviction: 'medium' }),
    theme('delta', { status: 'retired' }),
  ];
  const a = buildFieldLayout(themes, ASOF);
  const b = buildFieldLayout([...themes].reverse(), ASOF);
  expect(a).toEqual(buildFieldLayout(themes, ASOF));
  expect(b).toEqual(a);
});

it('nudges same-band same-pressure themes apart so labels never collide', () => {
  const pile = Array.from({ length: 7 }, (_, i) =>
    theme(`pile-${i}`, { conviction: 'medium', events: [ev('raise')] }),
  );
  const layout = buildFieldLayout(pile, ASOF);
  const band = layout.bands[1];
  const ys = layout.nodes.map((n) => n.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) {
    expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(22);
  }
  // The band grows to hold the stack instead of letting it spill.
  for (const n of layout.nodes) {
    expect(n.y).toBeGreaterThan(band.top);
    expect(n.y).toBeLessThan(band.top + band.height);
  }
});

// --- labels -----------------------------------------------------------------------

it('shortens field labels: candidate prefix drops, long names truncate', () => {
  expect(fieldLabel('New theme candidate — Japan repatriation')).toBe('Japan repatriation');
  expect(fieldLabel('Fed / inflation / rates')).toBe('Fed / inflation / rates');
  const long = fieldLabel('Narrative rotation / defense-space industrials');
  expect(long.length).toBeLessThanOrEqual(28);
  expect(long.endsWith('…')).toBe(true);
});

it('flips labels to the left when a node sits near the right edge', () => {
  const layout = buildFieldLayout(
    [
      theme('hot-theme-with-a-long-name', {
        name: 'A fairly long theme name',
        events: Array(4).fill(ev('raise')),
      }),
      theme('b'),
    ],
    ASOF,
  );
  const hot = layout.nodes.find((n) => n.slug === 'hot-theme-with-a-long-name');
  expect(hot?.labelAnchor).toBe('end');
  expect(hot!.labelX).toBeLessThan(hot!.x);
});

it('formatPressure signs the net move', () => {
  expect(formatPressure(2)).toBe('+2');
  expect(formatPressure(-1.5)).toBe('-1.5');
  expect(formatPressure(0)).toBe('0');
});

it('pressureReading names the x-axis in plain language', () => {
  expect(pressureReading(2)).toBe('raised');
  expect(pressureReading(-0.5)).toBe('lowered');
  expect(pressureReading(0)).toBe('no net move');
});

// --- the component ------------------------------------------------------------------

it('FieldMap renders nodes as dossier links with tooltips', () => {
  const markup = renderToStaticMarkup(
    <FieldMap
      themes={[
        theme('rate-path', {
          name: 'Rate path',
          conviction: 'high',
          events: [ev('raise'), ev('raise')],
          lastEventAt: '2026-07-08',
        }),
        theme('candidate-x', { status: 'candidate', conviction: 'low' }),
        theme('gone', { status: 'retired' }),
      ]}
      asOf={ASOF}
    />,
  );
  expect(markup).toContain('href="/map/rate-path"');
  expect(markup).toContain('Rate path: active, conviction high, 2 events in 30d, net +2, last event 2026-07-08');
  expect(markup).toContain('fn-cand'); // hollow candidate diamonds
  expect(markup).toContain('Retired');
  expect(markup).toContain('Lowered');
  expect(markup).toContain('No net move');
  expect(markup).toContain('Raised');
  expect(markup).toContain('Conviction. High at the top, low at the bottom.');
  expect(markup).toContain('field-lanes');
  expect(markup).not.toContain('pressured');
  expect(markup).not.toContain('easing · pressure');
});

it('FieldMap lane list keeps the full theme name', () => {
  const markup = renderToStaticMarkup(
    <FieldMap
      themes={[
        theme('long', {
          name: 'Narrative rotation / defense-space industrials',
          conviction: 'high',
        }),
        theme('other', { name: 'Other theme', conviction: 'medium' }),
      ]}
      asOf={ASOF}
    />,
  );
  expect(markup).toContain('Narrative rotation / defense-space industrials');
  expect(markup).toContain('High conviction');
  expect(markup).toContain('field-meter');
});

it('FieldMap shows a designed empty state under two plottable themes', () => {
  const markup = renderToStaticMarkup(<FieldMap themes={[theme('solo')]} asOf={ASOF} />);
  expect(markup).toContain('empty-state');
  expect(markup).not.toContain('<svg');
});

it('FieldMap renders nothing with no themes (the grid owns that empty state)', () => {
  expect(renderToStaticMarkup(<FieldMap themes={[]} asOf={ASOF} />)).toBe('');
});
