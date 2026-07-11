import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // next/font is a build-time compiler transform; stub its shape in tests.
      'next/font/google': path.resolve(__dirname, 'tests', 'helpers', 'next-font-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
