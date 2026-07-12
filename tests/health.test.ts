import { describe, expect, it } from 'vitest';
import { GET, dynamic } from '@/app/api/health/route';

describe('health route', () => {
  it('is dynamic and returns a stable service identity', async () => {
    expect(dynamic).toBe('force-dynamic');
    const response = GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'macro-watch' });
  });
});
