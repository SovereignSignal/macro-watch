import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const headers = { 'cache-control': 'no-store, max-age=0' };

export async function GET(): Promise<Response> {
  try {
    await getDb().execute(sql`select 1`);
    return Response.json(
      { ok: true, ready: true, service: 'macro-watch', database: 'reachable' },
      { status: 200, headers },
    );
  } catch (error) {
    console.error('[macro.watch] readiness failed:', error);
    return Response.json(
      { ok: false, ready: false, service: 'macro-watch', database: 'unreachable' },
      { status: 503, headers },
    );
  }
}
