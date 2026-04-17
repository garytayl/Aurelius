#!/usr/bin/env python3
"""
Parse Project Gutenberg Meditations #2680 plain text into JSON.
Source: Meric Casaubon translation (via PG). Books I–XII only; skips intro, appendix, notes.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

BOOK_ORDER = [
    "FIRST",
    "SECOND",
    "THIRD",
    "FOURTH",
    "FIFTH",
    "SIXTH",
    "SEVENTH",
    "EIGHTH",
    "NINTH",
    "TENTH",
    "ELEVENTH",
    "TWELFTH",
]

ROMAN_RE = re.compile(r"^[IVXLCDM]{1,7}$")


def roman_to_int(s: str) -> int | None:
    if not ROMAN_RE.match(s):
        return None
    vals = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    prev = 0
    for c in reversed(s):
        v = vals.get(c, 0)
        if v < prev:
            total -= v
        else:
            total += v
            prev = v
    return total if 0 < total < 200 else None


def normalize_book_text(raw: str) -> str:
    """Fix PG line-wrap glues like 'desires. V. For' and missing periods 'XXIV Let'."""
    # Inline wrapped section: sentence ends, then "Roman. Next" on same line
    raw = re.sub(
        r"([a-z,\]])\. ([IVXLCDM]{1,7})\. (?=[A-Z])",
        lambda m: f"{m.group(1)}.\n{m.group(2)}. ",
        raw,
    )
    # Missing period after numeral at line start (e.g. "XXIII Consider", "XXIV Let")
    raw = re.sub(
        r"^([IVXLCDM]{2,7}) ([A-Z][a-z])",
        r"\1. \2",
        raw,
        flags=re.MULTILINE,
    )
    return raw


def split_sections(book_text: str) -> list[tuple[str, str]]:
    """Returns [(roman, body), ...]."""
    book_text = normalize_book_text(book_text.strip())
    # Section starts: newline + Roman + ". " (after normalize)
    starts = list(re.finditer(r"(?:^|\n)([IVXLCDM]{1,7})\.\s+", book_text))
    out: list[tuple[str, str]] = []
    for i, m in enumerate(starts):
        roman = m.group(1)
        start = m.end()
        end = starts[i + 1].start() if i + 1 < len(starts) else len(book_text)
        body = book_text[start:end].strip()
        out.append((roman, body))
    return out


def extract_bodies(pg_text: str) -> list[str]:
    """Return 12 book bodies (plain text), in order."""
    start = pg_text.index("THE FIRST BOOK")
    # TOC also contains "APPENDIX"; use the real section header.
    end = pg_text.index("\n\nAPPENDIX\n\nCORRESPONDENCE", start)
    chunk = pg_text[start:end]
    bodies: list[str] = []
    for i, name in enumerate(BOOK_ORDER):
        header = f"THE {name} BOOK"
        idx = chunk.index(header)
        if i + 1 < len(BOOK_ORDER):
            next_header = f"THE {BOOK_ORDER[i + 1]} BOOK"
            nidx = chunk.index(next_header, idx)
            body = chunk[idx + len(header) : nidx]
        else:
            body = chunk[idx + len(header) :]
        bodies.append(body)
    return bodies


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input_txt", type=Path, help="Path to pg2680.txt")
    ap.add_argument("-o", "--output", type=Path, default=Path("public/meditations.json"))
    args = ap.parse_args()
    pg_text = args.input_txt.read_text(encoding="utf-8")

    bodies = extract_bodies(pg_text)
    passages: list[dict] = []
    for book_num, body in enumerate(bodies, start=1):
        sections = split_sections(body)
        for roman, text in sections:
            n = roman_to_int(roman)
            if n is None:
                raise SystemExit(f"Book {book_num}: bad roman {roman!r}")
            passages.append(
                {
                    "id": f"{book_num}-{n}",
                    "book": book_num,
                    "section": n,
                    "roman": roman,
                    "text": text,
                }
            )

    doc = {
        "source": "Project Gutenberg #2680",
        "translator": "Meric Casaubon (1634), via Project Gutenberg edition",
        "language": "en",
        "passages": passages,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(passages)} passages to {args.output}")


if __name__ == "__main__":
    main()
