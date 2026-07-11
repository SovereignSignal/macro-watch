import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'macro.watch', template: '%s · macro.watch' },
  description:
    'AI-composed macro intelligence — deterministically validated, self-graded, published daily. SovsClaw, a Sovereign Signal system.',
};

export const viewport: Viewport = {
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div>
            <Link href="/" className="site-name">
              macro.watch
            </Link>
            <p className="byline">SovsClaw — a Sovereign Signal system</p>
          </div>
          <nav className="site-nav" aria-label="Site">
            <Link href="/">Brief</Link>
            <Link href="/briefs">Archive</Link>
            <Link href="/map">Theme Map</Link>
            <Link href="/accountability">Accountability</Link>
            <Link href="/catalysts">Catalysts</Link>
            <Link href="/search">Search</Link>
            <Link href="/about">About</Link>
          </nav>
        </header>
        {children}
        <footer className="site-footer">
          <p>SovsClaw — a Sovereign Signal system. AI-composed, deterministically validated, self-graded.</p>
          <p>
            Not investment advice. Nothing here is a recommendation to buy or sell any security or
            asset.
          </p>
          <p>
            <a href="/feed.xml">RSS</a> · <Link href="/about">About</Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
