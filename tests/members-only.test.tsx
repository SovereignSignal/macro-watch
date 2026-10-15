import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/member-session', () => ({ isMember: async () => false }));

// A logged-out visitor must never reach the database.
vi.mock('@/db/client', () => ({
  getDb: () => {
    throw new Error('getDb must not be touched for logged-out visitors');
  },
}));

const { default: TrackRecordPage } = await import('@/app/track-record/page');
const { default: AccountabilityPage } = await import('@/app/accountability/page');
const { MembersOnly } = await import('@/components/MembersOnly');

let savedPassword: string | undefined;

beforeEach(() => {
  savedPassword = process.env.SITE_MEMBER_PASSWORD;
  process.env.SITE_MEMBER_PASSWORD = 'test-password';
});

afterEach(() => {
  if (savedPassword === undefined) delete process.env.SITE_MEMBER_PASSWORD;
  else process.env.SITE_MEMBER_PASSWORD = savedPassword;
});

const sp = (params: Record<string, string> = {}) => Promise.resolve(params);

async function renderTrackRecord(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await TrackRecordPage({ searchParams: sp(params) }));
}

async function renderAccountability(params: Record<string, string> = {}) {
  return renderToStaticMarkup(await AccountabilityPage({ searchParams: sp(params) }));
}

function expectGate(html: string, next: string) {
  expect(html).toContain('Members only');
  expect(html).toContain('action="/api/member/login"');
  expect(html).toContain('method="post"');
  expect(html).toContain('type="password"');
  expect(html).toContain('name="password"');
  expect(html).toContain('type="hidden"');
  expect(html).toContain(`name="next" value="${next}"`);
}

describe('/track-record logged out', () => {
  it('shows the gate and none of the track record', async () => {
    const html = await renderTrackRecord();
    expectGate(html, '/track-record');
    const lower = html.toLowerCase();
    expect(lower).not.toContain('hit rate');
    expect(lower).not.toContain('brier');
    expect(html).not.toContain('accountability ledger');
    expect(html).not.toContain("didn");
    expect(html).not.toContain('role="alert"');
  });

  it('shows the error line when signin=failed', async () => {
    const html = await renderTrackRecord({ signin: 'failed' });
    expectGate(html, '/track-record');
    expect(html).toContain('role="alert"');
    expect(html).toContain('That password didn');
  });

  it('works without a searchParams prop', async () => {
    const html = renderToStaticMarkup(await TrackRecordPage());
    expectGate(html, '/track-record');
  });
});

describe('/accountability logged out', () => {
  it('shows the gate and none of the ledger', async () => {
    const html = await renderAccountability();
    expectGate(html, '/accountability');
    const lower = html.toLowerCase();
    expect(html).not.toContain('Smart-money markets');
    expect(html).not.toContain('Call ledger');
    expect(html).not.toContain('Claim history');
    expect(lower).not.toContain('hit rate');
    expect(html).not.toContain('role="alert"');
  });

  it('shows the error line when signin=failed', async () => {
    const html = await renderAccountability({ signin: 'failed' });
    expectGate(html, '/accountability');
    expect(html).toContain('role="alert"');
    expect(html).toContain('That password didn');
  });

  it('ignores other signin values', async () => {
    const html = await renderAccountability({ signin: 'ok' });
    expect(html).not.toContain('role="alert"');
  });
});

describe('MembersOnly', () => {
  it('renders the form with the given next path', () => {
    const html = renderToStaticMarkup(<MembersOnly next="/somewhere?x=1" />);
    expectGate(html, '/somewhere?x=1');
    expect(html).toContain('Sign in');
    expect(html).not.toContain('role="alert"');
  });

  it('renders the error line', () => {
    const html = renderToStaticMarkup(<MembersOnly next="/" error />);
    expect(html).toContain('role="alert"');
  });

  it('shows no form when sign-in is unavailable', () => {
    const html = renderToStaticMarkup(<MembersOnly next="/" available={false} />);
    expect(html).toContain('Members only');
    expect(html).toContain('Member sign-in is not available right now.');
    expect(html).not.toContain('<form');
    expect(html).not.toContain('type="password"');
  });

  it('defaults availability to whether a password is configured', () => {
    delete process.env.SITE_MEMBER_PASSWORD;
    const html = renderToStaticMarkup(<MembersOnly next="/" />);
    expect(html).not.toContain('<form');
    expect(html).toContain('not available');
  });
});
