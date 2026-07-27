import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { publicHttpsUrl, publicText, publicValue } from '@/lib/public-copy';

describe('public copy contract', () => {
  it('normalizes literal and encoded em dashes', () => {
    expect(publicText('Rates \u2014 hold')).toBe('Rates, hold');
    expect(publicText('Rates&mdash;hold')).toBe('Rates, hold');
    expect(publicText('Rates&#8212;hold')).toBe('Rates, hold');
    expect(publicText('Rates&#x2014;hold')).toBe('Rates, hold');
  });

  it('normalizes nested public payloads', () => {
    expect(publicValue({ title: 'Oil \u2014 easing', rows: ['Fed&mdash;hold'] })).toEqual({
      title: 'Oil, easing',
      rows: ['Fed, hold'],
    });
  });

  it('allows public HTTPS sources and rejects private or unsafe links', () => {
    expect(publicHttpsUrl('https://www.bls.gov/cpi/')).toBe('https://www.bls.gov/cpi/');
    for (const value of [
      'http://example.com/source',
      'https://localhost/source',
      'https://127.0.0.1/source',
      'https://169.254.169.254/source',
      'https://10.0.0.1/source',
      'https://team.notion.so/private',
      'https://user:pass@example.com/source',
    ]) {
      expect(publicHttpsUrl(value)).toBeNull();
    }
  });

  it('keeps literal em dashes out of runtime source', () => {
    const roots = ['src/app', 'src/components', 'src/lib'];
    const files = roots.flatMap((root) =>
      fs
        .readdirSync(root, { recursive: true, encoding: 'utf8' })
        .filter((file) => /\.(?:ts|tsx|css)$/.test(file))
        .map((file) => path.join(root, file)),
    );
    const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes('\u2014'));

    expect(offenders).toEqual([]);
  });

  it('keeps the deployment smoke disclaimer aligned with the rendered footer', () => {
    const disclaimer = 'Research only. No buy or sell recommendations.';
    expect(fs.readFileSync('src/app/layout.tsx', 'utf8')).toContain(disclaimer);
    expect(fs.readFileSync('scripts/smoke.mjs', 'utf8')).toContain(disclaimer);
  });
});
