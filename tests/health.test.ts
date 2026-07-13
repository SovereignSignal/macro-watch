import { describe, expect, it, vi } from 'vitest';
import type { Db } from '@/db/client';
import { setDb } from '@/db/client';
import { GET, dynamic, revalidate } from '@/app/api/health/route';
import { createTestDb } from './helpers/db';

describe('health route', () => {
  it('is a no-store readiness probe when the database is reachable', async () => {
    await createTestDb();
    expect(dynamic).toBe('force-dynamic');
    expect(revalidate).toBe(0);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(await response.json()).toEqual({
      ok: true,
      ready: true,
      service: 'macro-watch',
      database: 'reachable',
    });
  });

  it('returns 503 when the database is unreachable', async () => {
    setDb({ execute: vi.fn().mockRejectedValue(new Error('database down')) } as unknown as Db);
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      ok: false,
      ready: false,
      service: 'macro-watch',
      database: 'unreachable',
    });
  });
});
