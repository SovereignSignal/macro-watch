import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // Build-only modules are replaced with inert Node test stubs.
      'next/font/google': path.resolve(__dirname, 'tests', 'helpers', 'next-font-stub.ts'),
      'server-only': path.resolve(__dirname, 'tests', 'helpers', 'server-only-stub.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});
