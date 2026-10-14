import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Endorsement } from '@/components/Endorsement';
import { Mark } from '@/components/Mark';
import { MastheadUpdated } from '@/components/MastheadUpdated';
import { SiteNav } from '@/components/SiteNav';
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
  description: 'Macro briefs, live themes, catalysts, and a public record of what held up.',
  openGraph: {
    type: 'website',
    siteName: 'Sovs Macro',
    title: 'Sovs Macro',
    description: 'Macro briefs, live themes, catalysts, and a public record of what held up.',
  },
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="masthead">
            <Link href="/" className="site-name" aria-label="Sovs Macro home">
              <Mark className="site-mark" size={26} />
              <span className="site-wordmark">Sovs Macro</span>
            </Link>
            <SiteNav />
          </div>
          <div className="masthead-rule" aria-hidden="true" />
          <div className="masthead-sub">
            <Suspense fallback={null}>
              <MastheadUpdated />
            </Suspense>
            <Endorsement />
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <p className="footer-byline">
            <span className="footer-mark" aria-hidden="true">
              ◆
            </span>{' '}
            Sovs Macro is a Sovereign Signal project. AI composed. Brief HTML is sanitized before publication; verified panels disclose source coverage.
          </p>
          <p>
            Research only. No buy or sell recommendations.
          </p>
          <p className="footer-links">
            <a href="/feed.xml">RSS</a> · <Link href="/about">About</Link> ·{' '}
            <Link href="/track-record">Track record</Link> ·{' '}
            <Link href="/accountability">Accountability</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
