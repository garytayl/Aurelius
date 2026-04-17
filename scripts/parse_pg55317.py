#!/usr/bin/env python3
"""
Parse Project Gutenberg #55317 (G. W. Chrystal, 1902; after Foulis 1742) into the same passage JSON shape.
Sections may start mid-line after a period (e.g. Book I: "1. ... anger. 2. In ...").
"""
from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

BOOK_HEADER = re.compile(r"(?m)^\s*BOOK\s+(?P<r>[IVXLCDM]{1,5})\.\s*$")
# After sentence end, whitespace, then "12. Word"
SECTION_AFTER_SENTENCE = re.compile(r"(?<=[.!?…])\s+(?=\d+\.\s+)")


def roman_to_int(s: str) -> int | None:
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
    return total if 0 < total <= 12 else None


def int_to_roman(n: int) -> str:
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
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    s = re.sub(r"[ \t]+\n", "\n", s)
    s = re.sub(r"\n+", " ", s)
    s = re.sub(r" +", " ", s)
    return s.strip()


def split_sections_chrystal(book_body: str) -> list[tuple[int, str]]:
    """Split book text into (section_num, text) using numbered section markers."""
    book_body = book_body.strip()
    if not book_body:
        return []
    # Collapse to one line for splitting (structure preserved by numbered breaks)
    flat = normalize_text(book_body)
    chunks = SECTION_AFTER_SENTENCE.split(flat)
    sections: list[tuple[int, str]] = []
    for ch in chunks:
        ch = ch.strip()
        if not ch:
            continue
        m = re.match(r"^(\d+)\.\s+(.*)$", ch, re.DOTALL)
        if not m:
            continue
        n, rest = int(m.group(1)), m.group(2).strip()
        sections.append((n, normalize_text(rest)))
    return sections


def extract_body(pg_text: str) -> str:
    text = pg_text.replace("\r\n", "\n").replace("\r", "\n")
    start = text.find("*** START OF THE PROJECT GUTENBERG EBOOK")
    if start == -1:
        start = text.find("BOOK I.")
    else:
        start = text.find("BOOK I.", start)
    if start == -1:
        raise SystemExit("Could not find BOOK I.")
    end = text.find("*** END OF THE PROJECT GUTENBERG EBOOK", start)
    if end == -1:
        end = len(text)
    return text[start:end]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("input_txt", type=Path, help="Path to pg55317.txt")
    ap.add_argument("-o", "--output", type=Path, default=Path("public/meditations-chrystal.json"))
    args = ap.parse_args()
    pg_text = args.input_txt.read_text(encoding="utf-8", errors="replace")
    chunk = extract_body(pg_text)

    headers = list(BOOK_HEADER.finditer(chunk))
    if len(headers) != 12:
        raise SystemExit(f"Expected 12 BOOK headers, found {len(headers)}")

    passages: list[dict] = []
    for i, m in enumerate(headers):
        roman_book = m.group("r")
        book_num = roman_to_int(roman_book)
        if book_num is None:
            raise SystemExit(f"Bad book roman: {roman_book}")
        start = m.end()
        end = headers[i + 1].start() if i + 1 < len(headers) else len(chunk)
        book_body = chunk[start:end]
        sections = split_sections_chrystal(book_body)
        for sec_num, text in sections:
            passages.append(
                {
                    "id": f"{book_num}-{sec_num}",
                    "book": book_num,
                    "section": sec_num,
                    "roman": int_to_roman(sec_num),
                    "text": text,
                }
            )

    out = {
        "source": "Project Gutenberg #55317",
        "translator": "George W. Chrystal (1902), rendering after the Foulis translation (1742)",
        "language": "en",
        "passages": passages,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(passages)} passages to {args.output}")


if __name__ == "__main__":
    main()
