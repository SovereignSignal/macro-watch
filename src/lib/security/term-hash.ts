/**
 * Hashed term lists for publisher and source guards.
 *
 * Default guarded names ship as (length, rolling hash, confirm hash) triples so
 * the source tree does not name them. Matching keeps plain substring semantics:
 * a rolling hash scans every window of each guarded length and a second,
 * independent hash confirms a candidate. Terms are ASCII and compared on
 * ASCII-lowercased text, which keeps string offsets stable for redaction.
 */
export type HashedTerm = { len: number; rk: number; fh: number; word?: boolean };

const BASE = 257;

export function asciiLower(value: string): string {
  return value.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

function rkHash(s: string, start = 0, len = s.length): number {
  let h = 0;
  for (let i = start; i < start + len; i += 1) h = (Math.imul(h, BASE) + s.charCodeAt(i)) >>> 0;
  return h;
}

function fnvHash(s: string, start = 0, len = s.length): number {
  let h = 0x811c9dc5;
  for (let i = start; i < start + len; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function hashTerm(term: string, word = false): HashedTerm {
  const t = asciiLower(term);
  const out: HashedTerm = { len: t.length, rk: rkHash(t), fh: fnvHash(t) };
  if (word) out.word = true;
  return out;
}

export function equalsHashed(value: string, term: HashedTerm): boolean {
  const v = asciiLower(value);
  return v.length === term.len && rkHash(v) === term.rk && fnvHash(v) === term.fh;
}

const WORD = /[A-Za-z0-9_]/;

function boundaryOk(s: string, start: number, end: number): boolean {
  return (start === 0 || !WORD.test(s[start - 1])) && (end >= s.length || !WORD.test(s[end]));
}

/** Start offsets of non-overlapping occurrences of `term` in lowercased `s`, left to right. */
export function findHashed(s: string, term: HashedTerm, firstOnly = false): number[] {
  const L = term.len;
  const hits: number[] = [];
  if (L === 0 || s.length < L) return hits;
  let pow = 1;
  for (let i = 1; i < L; i += 1) pow = Math.imul(pow, BASE) >>> 0;
  let h = rkHash(s, 0, L);
  let i = 0;
  while (true) {
    if (h === term.rk && fnvHash(s, i, L) === term.fh && (!term.word || boundaryOk(s, i, i + L))) {
      hits.push(i);
      if (firstOnly) return hits;
      // Non-overlapping, like a global regex: restart the window after this hit.
      i += L;
      if (i + L > s.length) return hits;
      h = rkHash(s, i, L);
      continue;
    }
    if (i + L >= s.length) return hits;
    h = (Math.imul((h - Math.imul(s.charCodeAt(i), pow)) >>> 0, BASE) + s.charCodeAt(i + L)) >>> 0;
    i += 1;
  }
}
