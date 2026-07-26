import type { Metadata } from 'next';

export function pageMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: `/${string}` | '/';
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      siteName: 'Sovs Macro',
      title,
      description,
      url: path,
    },
  };
}
