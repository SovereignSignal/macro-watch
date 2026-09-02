import { and, count, desc, eq, sql, type SQL } from 'drizzle-orm';
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

/** Public ledger page size. */
export const LEDGER_PAGE_SIZE = 25;

export type ClaimsPage = {
  rows: ClaimRecord[];
  /** Rows matching the filters across every page. */
  total: number;
  /** 1-based, clamped into range. */
  page: number;
  pageSize: number;
};

function whereFilters(f: ClaimFilters): SQL | undefined {
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
  return conds.length > 0 ? and(...conds) : undefined;
}

// Newest first. claim_id breaks same-day ties so a row never shifts between
// pages across requests.
const LEDGER_ORDER = [desc(claims.openedAt), desc(claims.claimId)];

export async function getClaims(db: Db, f: ClaimFilters = {}): Promise<ClaimRecord[]> {
  return db
    .select()
    .from(claims)
    .where(whereFilters(f))
    .orderBy(...LEDGER_ORDER);
}

/**
 * One page of the public ledger plus the filtered total. A page past the end
 * clamps to the last page rather than rendering an empty table.
 */
export async function getClaimsPage(
  db: Db,
  f: ClaimFilters,
  page: number,
  pageSize = LEDGER_PAGE_SIZE,
): Promise<ClaimsPage> {
  const where = whereFilters(f);
  const [{ total }] = await db.select({ total: count() }).from(claims).where(where);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const rows =
    total === 0
      ? []
      : await db
          .select()
          .from(claims)
          .where(where)
          .orderBy(...LEDGER_ORDER)
          .limit(pageSize)
          .offset((current - 1) * pageSize);
  return { rows, total, page: current, pageSize };
}

export async function getThemeNames(db: Db): Promise<Record<string, string>> {
  const rows = await db.select({ slug: themes.slug, name: themes.name }).from(themes);
  return Object.fromEntries(rows.map((row) => [row.slug, displayThemeName(row.slug, publicText(row.name))]));
}
