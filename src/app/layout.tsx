import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Endorsement } from '@/components/Endorsement';
import { Mark } from '@/components/Mark';
import { MastheadUpdated } from '@/components/MastheadUpdated';
import { MemberLock } from '@/components/MemberLock';
import { SiteNav } from '@/components/SiteNav';
import { THEME_INIT_SCRIPT, ThemeToggle } from '@/components/ThemeToggle';
import { isMember } from '@/lib/member-session';
import { siteUrl } from '@/lib/site-url';
// Sovereign Signal house style: self-hosted brand fonts, then the shared
// tokens, then this site's sheet. No runtime font requests leave the site.
import '@/styles/brand/fonts/fonts.css';
import '@/styles/brand/tokens.css';
import './globals.css';

const siteOrigin = siteUrl();

export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin),
  title: { default: 'Sovs Macro', template: '%s · Sovs Macro' },
  description: 'Macro briefs, a theme map, and a catalysts calendar. The graded call record is for members.',
  openGraph: {
    type: 'website',
    siteName: 'Sovs Macro',
    title: 'Sovs Macro',
    description: 'Macro briefs, a theme map, and a catalysts calendar. The graded call record is for members.',
  },
};

// Both papers from the shared tokens. The toggle's script rewrites these to
// whichever paper is showing once a visitor pins a theme.
export const viewport: Viewport = {
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F3EFE6' },
    { media: '(prefers-color-scheme: dark)', color: '#141418' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const member = await isMember();
  return (
    // suppressHydrationWarning: the pre-paint script may set data-theme on
    // <html> before React hydrates, and that attribute is the point.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <header className="site-header">
          <div className="masthead">
            <Link href="/" className="site-name" aria-label="Sovs Macro home">
              <Mark className="site-mark" size={26} />
              <span className="site-wordmark">Sovs Macro</span>
            </Link>
            <SiteNav member={member} />
          </div>
          <div className="masthead-rule" aria-hidden="true" />
          <div className="masthead-sub">
            <Suspense fallback={null}>
              <MastheadUpdated />
            </Suspense>
            <Endorsement />
            <ThemeToggle />
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <p className="footer-byline">
            AI composed. Brief HTML is sanitized before publication; verified panels disclose source coverage.
          </p>
          <p>
            Research only. No buy or sell recommendations.
          </p>
          <p className="footer-links">
            <a href="/feed.xml">RSS</a> · <Link href="/about">About</Link> ·{' '}
            <Link href="/track-record">
              Track record
              {member ? null : <MemberLock />}
            </Link>{' '}
            ·{' '}
            <Link href="/accountability">
              Accountability
              {member ? null : <MemberLock />}
            </Link>
            {member ? (
              <>
                {' '}
                ·{' '}
                <button type="submit" form="member-signout" className="footer-signout">
                  Sign out
                </button>
              </>
            ) : null}
          </p>
          {member ? <form id="member-signout" method="post" action="/api/member/logout" /> : null}
        </footer>
      </body>
    </html>
  );
}
