import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import * as ogModule from '@/app/opengraph-image';

// Mock next/og to avoid attempting real image generation in tests
vi.mock('next/og', () => ({
  ImageResponse: class MockImageResponse {
    constructor(element: unknown, options: unknown) {
      // No-op for tests
    }
  },
}));

describe('opengraph-image', () => {
  it('exports size as 1200x630', () => {
    expect(ogModule.size).toEqual({ width: 1200, height: 630 });
  });

  it('exports contentType as image/png', () => {
    expect(ogModule.contentType).toBe('image/png');
  });

  it('alt text matches opengraph-image.alt.txt', () => {
    const altPath = join(__dirname, '../src/app/opengraph-image.alt.txt');
    const altFromFile = readFileSync(altPath, 'utf-8').trim();
    expect(ogModule.alt).toBe(altFromFile);
  });

  it('opengraph-image.png no longer exists', () => {
    const pngPath = join(__dirname, '../src/app/opengraph-image.png');
    expect(existsSync(pngPath)).toBe(false);
  });

  it('cardElement tree contains expected text content', () => {
    const element = ogModule.cardElement();
    const allText = extractAllText(element);

    expect(allText).toContain('Sovs Macro');
    expect(allText).toContain('Daily macro brief and research');
    expect(allText).toContain('A SOVEREIGN SIGNAL PROJECT');
  });

  it('cardElement tree contains scorpion data URI', () => {
    const element = ogModule.cardElement();
    const serialized = JSON.stringify(element);

    expect(serialized).toMatch(/data:image\/png;base64,/);
  });

  it('cardElement tree does not contain compass or eye references', () => {
    const element = ogModule.cardElement();
    const serialized = JSON.stringify(element).toLowerCase();

    expect(serialized).not.toContain('compass');
    expect(serialized).not.toMatch(/\beye\b/);
  });
});

/**
 * Recursively extract all text content from a React element tree.
 */
function extractAllText(node: unknown): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(extractAllText).join('');
  }

  if (node && typeof node === 'object' && 'props' in node) {
    const props = (node as { props?: { children?: unknown } }).props;
    if (props?.children) {
      return extractAllText(props.children);
    }
  }

  return '';
}
