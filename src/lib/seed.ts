import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Db } from '../db/client';
import { briefSchema, upsertBrief } from './ingest/briefs';
import { claimsBodySchema, forwardEventsBodySchema, upsertClaims, upsertForwardEvents } from './ingest/claims';
import { panelSchema, upsertPanel } from './ingest/panels';
import { themeEventsBodySchema, themeStateSchema, upsertThemeEvents, upsertThemeState } from './ingest/themes';

const FIXTURES = path.join(process.cwd(), 'tests', 'fixtures');

function load(name: string): unknown {
  return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
}

/**
 * Loads every fixture through the same validated upsert paths as the ingest
 * API. Idempotent: safe to run repeatedly against the same database.
 */
export async function seedAll(db: Db): Promise<Record<string, number>> {
  const counts: Record<string, number> = { briefs: 0, themeEvents: 0, themeState: 0, panels: 0, claims: 0, forwardEvents: 0 };
  for (const b of load('briefs.json') as unknown[]) {
    counts.briefs += await upsertBrief(db, briefSchema.parse(b));
  }
  counts.themeEvents = await upsertThemeEvents(db, themeEventsBodySchema.parse(load('theme-events.json')));
  counts.themeState = await upsertThemeState(db, themeStateSchema.parse(load('theme-state.json')));
  for (const p of load('panels.json') as unknown[]) {
    counts.panels += await upsertPanel(db, panelSchema.parse(p));
  }
  counts.claims = await upsertClaims(db, claimsBodySchema.parse(load('claims.json')));
  counts.forwardEvents = await upsertForwardEvents(db, forwardEventsBodySchema.parse(load('forward-events.json')));
  return counts;
}
