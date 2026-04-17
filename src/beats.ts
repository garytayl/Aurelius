/**
 * Split a passage into short units for "digest" reading.
 * Casaubon often chains thoughts with semicolons; long clauses fall back to sentence splits.
 */
const MAX_CLAUSE = 280;

function flatText(raw: string): string {
  return raw.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeTerminal(s: string): string {
  const t = s.trim();
  if (!t) return t;
  if (/[.!?;:…]$/.test(t)) return t;
  return `${t}.`;
}

/** Split an oversized clause on sentence boundaries (period + space + capital). */
function splitLongClause(clause: string): string[] {
  const t = clause.trim();
  if (t.length <= MAX_CLAUSE) return [normalizeTerminal(t)];
  const parts = t.split(/\.\s+(?=[A-Z"'“(\u201c])/);
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    let piece = parts[i].trim();
    if (!piece) continue;
    if (i < parts.length - 1) piece += ".";
    const n = normalizeTerminal(piece);
    if (n) out.push(n);
  }
  return out.length ? out : [normalizeTerminal(t)];
}

/** Merge a fragment that is only a leading opener ("Of X,") with the next beat. */
function mergeWeakStarts(beats: string[]): string[] {
  if (beats.length <= 1) return beats;
  const out: string[] = [];
  let i = 0;
  while (i < beats.length) {
    let cur = beats[i];
    const next = beats[i + 1];
    if (next && cur.length < 36 && /^Of\s|^To\s|^From\s|^In\s/i.test(cur) && !/[.;]$/.test(cur)) {
      cur = `${cur} ${next}`;
      i += 2;
      out.push(normalizeTerminal(cur));
    } else {
      out.push(cur);
      i += 1;
    }
  }
  return out;
}

export function splitDigestBeats(raw: string): string[] {
  const flat = flatText(raw);
  if (!flat) return [];

  const clauses = flat.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  const expanded: string[] = [];
  for (const c of clauses) {
    if (c.length <= MAX_CLAUSE) {
      expanded.push(normalizeTerminal(c));
    } else {
      expanded.push(...splitLongClause(c));
    }
  }

  const merged = mergeWeakStarts(expanded);
  return merged.filter(Boolean);
}
