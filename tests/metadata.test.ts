import type { Metadata } from 'next';
import { expect, it } from 'vitest';
import { metadata as aboutMetadata } from '@/app/about/page';
import { metadata as accountabilityMetadata } from '@/app/accountability/page';
import { metadata as briefsMetadata } from '@/app/briefs/page';
import { metadata as catalystsMetadata } from '@/app/catalysts/page';
import { metadata as layoutMetadata } from '@/app/layout';
import { metadata as mapMetadata } from '@/app/map/page';
import { metadata as homeMetadata } from '@/app/page';
import { metadata as searchMetadata } from '@/app/search/page';
import { metadata as trackRecordMetadata } from '@/app/track-record/page';

function canonical(metadata: Metadata): string | undefined {
  return metadata.alternates?.canonical?.toString();
}

function openGraphUrl(metadata: Metadata): string | undefined {
  return metadata.openGraph?.url?.toString();
}

it('keeps the root layout neutral so child routes do not inherit the homepage URL', () => {
  expect(canonical(layoutMetadata)).toBeUndefined();
  expect(openGraphUrl(layoutMetadata)).toBeUndefined();
});

it('brands root and route metadata as Sovs Macro', () => {
  expect((layoutMetadata.title as { default: string }).default).toBe('Sovs Macro');
  expect(layoutMetadata.openGraph?.siteName).toBe('Sovs Macro');
  expect(homeMetadata.title).toBe('Sovs Macro');
  expect(homeMetadata.openGraph?.siteName).toBe('Sovs Macro');
});

it.each([
  ['/', homeMetadata],
  ['/briefs', briefsMetadata],
  ['/map', mapMetadata],
  ['/track-record', trackRecordMetadata],
  ['/accountability', accountabilityMetadata],
  ['/catalysts', catalystsMetadata],
  ['/search', searchMetadata],
  ['/about', aboutMetadata],
])('publishes a route-specific canonical and Open Graph URL for %s', (path, metadata) => {
  expect(canonical(metadata)).toBe(path);
  expect(openGraphUrl(metadata)).toBe(path);
});
