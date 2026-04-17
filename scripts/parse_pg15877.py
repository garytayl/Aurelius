#!/usr/bin/env python3
"""
Parse Project Gutenberg #15877 (George Long, 1862) into the same passage JSON shape as Casaubon.
Books I–XII; ends before INDEXES.
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

ROMAN_RE = re.compile(r"^[IVXLCDM]{1,7}$")
BOOK_HEADER = re.compile(r"(?m)^(?P<r>[IVXLCDM]{1,5})\.\s*$")
SECTION_SPLIT = re.compile(r"(?m)^(\d+)\.\s+")
REF_MARK = re.compile(r"\[[A-Z]\]")


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


def int_to_roman(n: int) -> str:
    if n <= 0:
        return ""
    val = [
        (1000, "M"),
        (900, "CM"),
        (500, "D"),
        (400, "CD"),
        (100, "C"),
        (90, "XC"),
        (50, "L"),
        (40, "XL"),
        (10, "X"),
        (9, "IX"),
        (5, "V"),
        (4, "IV"),
        (1, "I"),
    ]
    out: list[str] = []
    for arabic, rom in val:
        while n >= arabic:
            out.append(rom)
            n -= arabic
    return "".join(out)


def normalize_text(s: str) -> str:
    """Strip inline ref letters [A], collapse whitespace."""
    s = REF_MARK.sub("", s)
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def strip_editor_indents(s: str) -> str:
    """Long's PG text uses 4+ space indents for footnotes and cross-refs; body has none."""
    out: list[str] = []
    for line in s.split("\n"):
        if line.startswith("    "):
            continue
        out.append(line)
    return "\n".join(out)


def split_sections_long(book_body: str) -> list[tuple[int, str]]:
    book_body = strip_editor_indents(book_body.strip())
    parts = SECTION_SPLIT.split(book_body)
    sections: list[tuple[int, str]] = []
    if parts[0].strip():
        sections.append((1, normalize_text(parts[0])))
    i = 1
    while i + 1 < len(parts):
        n = int(parts[i])
        sections.append((n, normalize_text(parts[i + 1])))
        i += 2
    return sections


def extract_thoughts_block(pg_text: str) -> str:
    text = pg_text.replace("\r\n", "\n").replace("\r", "\n")
    start = text.find("\n\nI.\n\n")
    if start == -1:
        raise SystemExit("Could not find start marker \\\n\\\nI.\\\n\\\n")
    end = text.find("\n\nINDEXES.\n\n", start)
    if end == -1:
        end = text.find("\n\nINDEX OF TERMS.\n\n", start)
    if end == -1:
        raise SystemExit("Could not find end before indexes")
    return text[start + 2 : end].strip()


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input_txt", type=Path, help="Path to pg15877.txt")
    ap.add_argument("-o", "--output", type=Path, default=Path("public/meditations-long.json"))
    args = ap.parse_args()
    pg_text = args.input_txt.read_text(encoding="utf-8")
    chunk = extract_thoughts_block(pg_text)

    headers = list(BOOK_HEADER.finditer(chunk))
    if len(headers) != 12:
        raise SystemExit(f"Expected 12 book headers, found {len(headers)}")

    passages: list[dict] = []
    for i, m in enumerate(headers):
        roman_book = m.group("r")
        bnum = roman_to_int(roman_book)
        if bnum is None or bnum < 1 or bnum > 12:
            raise SystemExit(f"Bad book {roman_book!r}")
        body_start = m.end()
        body_end = headers[i + 1].start() if i + 1 < len(headers) else len(chunk)
        book_body = chunk[body_start:body_end]
        sections = split_sections_long(book_body)
        for sec_n, text in sections:
            if not text:
                continue
            passages.append(
                {
                    "id": f"{bnum}-{sec_n}",
                    "book": bnum,
                    "section": sec_n,
                    "roman": int_to_roman(sec_n),
                    "text": text,
                }
            )

    doc = {
        "source": "Project Gutenberg #15877",
        "translator": "George Long (1862), via Project Gutenberg edition",
        "language": "en",
        "passages": passages,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(doc, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {len(passages)} passages to {args.output}")


if __name__ == "__main__":
    main()
