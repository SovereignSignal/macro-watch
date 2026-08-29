import { and, desc, eq, sql, type SQL } from 'drizzle-orm';
import type { Db } from '@/db/client';
import { claims, themes } from '@/db/schema';
import { publicText } from '@/lib/public-copy';
import { displayThemeName } from '@/lib/theme-display';

export type ClaimRecord = typeof claims.$inferSelect;

export type ClaimFilters = {
  kind?: string;
  status?: string;
  theme?: string;
  // Quality class = the claim's market_type (spec §3); 'unclassified' matches
  // claims with no market_type set, mirroring lib/scoring.ts's qualityClass().
  qualityClass?: string;
};

export async function getClaims(db: Db, f: ClaimFilters = {}): Promise<ClaimRecord[]> {
  const conds: SQL[] = [];
  if (f.kind) conds.push(eq(claims.kind, f.kind));
  if (f.status) conds.push(eq(claims.status, f.status));
  if (f.theme) conds.push(sql`${f.theme} = any(${claims.themes})`);
  if (f.qualityClass) {
    conds.push(
      f.qualityClass === 'unclassified'
        ? sql`coalesce(${claims.payload}->>'market_type', '') = ''`
        : sql`${claims.payload}->>'market_type' = ${f.qualityClass}`,
    );
  }
  return db
    .select()
    .from(claims)
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(claims.openedAt));
}

export async function getThemeNames(db: Db): Promise<Record<string, string>> {
  const rows = await db.select({ slug: themes.slug, name: themes.name }).from(themes);
  return Object.fromEntries(rows.map((row) => [row.slug, displayThemeName(row.slug, publicText(row.name))]));
}
