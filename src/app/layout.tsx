import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'macro.watch',
  description: 'AI-composed macro intelligence — deterministically validated, self-graded.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
