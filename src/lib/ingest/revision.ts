import { z } from 'zod';

/**
 * Producer-assigned artifact revision (microseconds since the Unix epoch at the
 * time the content was produced). Missing revision means 0 (legacy payload).
 * Values stay below 2^53, so they are stored as bigint with mode 'number'.
 */
export const revisionSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
  .optional();

/** Counts returned by revision-aware upserts. */
export type UpsertCounts = { upserted: number; stale: number };
