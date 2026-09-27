import re

import pandas as pd
import pdfplumber
from pdfminer.pdftypes import resolve1

PDF_PATH = "../data/V2021-22_DKU_UG_Bulletin.pdf"
OUT_PATH = "../data/bulletin_passages.csv"

PAGE_HEIGHT = 792
FOOTER_TOP = 735  # the page number sits at top ~745
MIN_FONT_SIZE = 8.5  # footnotes (6.5-8pt) and superscript references are dropped
PARAGRAPH_GAP = 8
HEADING_WINDOW = 45

MIN_WORDS = 30
MAX_WORDS = 250

TABLE_HEADER = re.compile(r"^(Course Code Course Name Course|Credit)$")


def normalize(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def read_outline(pdf):
    """Return bookmarks as dicts with level, title, page and top coordinate."""
    page_numbers = {p.page_obj.pageid: p.page_number for p in pdf.pages}
    entries = []

    for order, (level, title, dest, action, _) in enumerate(pdf.doc.get_outlines()):
        if dest is None and action is not None:
            dest = resolve1(action).get("D")
        dest = resolve1(dest)
        if isinstance(dest, (bytes, str)):
            dest = resolve1(pdf.doc.get_dest(dest))
        if isinstance(dest, dict):
            dest = dest["D"]

        entries.append(
            {
                "order": order,
                "level": level,
                "title": re.sub(r"\s+", " ", title).strip(),
                "page": page_numbers[dest[0].objid],
                "top": PAGE_HEIGHT - float(dest[3]),
            }
        )

    return entries


def with_paths(entries):
    """Attach the chapter / section / subsection / heading path to each bookmark."""
    stack = {}
    for e in entries:
        stack[e["level"]] = e["title"]
        for deeper in [lvl for lvl in stack if lvl > e["level"]]:
            del stack[deeper]

        e["chapter"] = stack.get(1, "")
        # Parts 11 and 12 have no sub-bookmarks, so the Part itself is the section
        e["section"] = stack.get(2, re.sub(r"^Part \d+: ", "", e["chapter"]))
        e["subsection"] = stack.get(3, "")
        e["heading"] = e["title"] if e["level"] > 3 else ""

    return entries


def read_lines(pdf):
    """Yield body text lines in reading order, with footers and footnotes removed."""
    for page in pdf.pages:
        body = page.filter(
            lambda obj: obj["object_type"] != "char" or obj["size"] >= MIN_FONT_SIZE
        )
        for line in body.extract_text_lines(return_chars=True):
            text = line["text"].strip()
            if not text or line["top"] > FOOTER_TOP:
                continue
            yield {
                "page": page.page_number,
                "top": line["top"],
                "bottom": line["bottom"],
                "text": text,
            }


def assign_lines(lines, entries):
    """Attach each line to the bookmark it falls under, dropping heading lines."""
    by_position = sorted(entries, key=lambda e: (e["page"], e["top"], e["order"]))
    current = None
    index = 0

    for line in lines:
        # advance to the last bookmark whose target is at or above this line
        while index < len(by_position) and (
            by_position[index]["page"],
            by_position[index]["top"] - 6,
        ) <= (line["page"], line["top"]):
            current = by_position[index]
            index += 1

        # front matter and table of contents
        if current is None:
            continue

        # a heading line is text of a nearby bookmark title on the same page
        recent = [
            e
            for e in by_position[max(0, index - 4) : index]
            if e["page"] == line["page"]
            and 0 <= line["top"] - e["top"] < HEADING_WINDOW
        ]
        if any(normalize(line["text"]) in normalize(e["title"]) for e in recent):
            line["is_heading"] = True
        else:
            line["is_heading"] = False

        line["node"] = current
        yield line


def build_paragraphs(lines):
    """Group lines into paragraphs using vertical gaps, headings and page breaks."""
    paragraphs = []
    current = None
    previous = None

    for line in lines:
        if line["is_heading"] or TABLE_HEADER.match(line["text"]):
            current = None
            previous = line
            continue

        same_node = previous is not None and previous.get("node") is line["node"]
        new_paragraph = (
            current is None
            or not same_node
            or (
                line["page"] == previous["page"]
                and line["top"] - previous["bottom"] > PARAGRAPH_GAP
            )
            # a paragraph continues onto the next page only mid-sentence
            or (
                line["page"] != previous["page"]
                and current["text"].rstrip()[-1:] in ".!?:"
            )
        )

        if new_paragraph:
            current = {"node": line["node"], "page": line["page"], "text": line["text"]}
            paragraphs.append(current)
        elif current["text"].endswith("-"):
            current["text"] += line["text"]
        else:
            current["text"] += " " + line["text"]

        previous = line

    return paragraphs


def split_long(text):
    """Split an over-long paragraph at sentence boundaries into ~MAX_WORDS chunks."""
    sentences = re.split(r"(?<=[.!?])\s+(?=[A-Z(])", text)
    chunks, chunk = [], []
    for sentence in sentences:
        if chunk and len(" ".join(chunk + [sentence]).split()) > MAX_WORDS:
            chunks.append(" ".join(chunk))
            chunk = []
        chunk.append(sentence)
    if chunk:
        chunks.append(" ".join(chunk))
    return chunks


def build_passages(paragraphs):
    """Merge short fragments (list items, table rows) inside the same heading."""
    passages = []
    buffer = None

    def flush():
        nonlocal buffer
        if buffer is not None:
            passages.append(buffer)
        buffer = None

    for para in paragraphs:
        if buffer is not None and buffer["node"] is not para["node"]:
            last = passages[-1] if passages else None
            if (
                len(buffer["text"].split()) < MIN_WORDS
                and last is not None
                and last["node"] is buffer["node"]
                and len((last["text"] + buffer["text"]).split()) <= MAX_WORDS
            ):
                last["text"] += " " + buffer["text"]
                buffer = None
            flush()

        for chunk in split_long(para["text"]):
            if buffer is None:
                buffer = {"node": para["node"], "page": para["page"], "text": chunk}
            elif (
                len(buffer["text"].split()) < MIN_WORDS
                and len((buffer["text"] + " " + chunk).split()) <= MAX_WORDS
            ):
                buffer["text"] += " " + chunk
            else:
                flush()
                buffer = {"node": para["node"], "page": para["page"], "text": chunk}

    flush()
    return passages


with pdfplumber.open(PDF_PATH) as pdf:
    entries = with_paths(read_outline(pdf))
    print(f"{len(pdf.pages)} pages, {len(entries)} bookmarks")
    lines = list(assign_lines(read_lines(pdf), entries))

print(f"{len(lines)} body lines, {sum(l['is_heading'] for l in lines)} heading lines")

paragraphs = build_paragraphs(lines)
print(f"{len(paragraphs)} paragraphs")

passages = build_passages(paragraphs)

df = pd.DataFrame(
    [
        {
            "passage_id": f"p{i + 1:04d}",
            "chapter": p["node"]["chapter"],
            "section": p["node"]["section"],
            "subsection": p["node"]["subsection"],
            "heading": p["node"]["heading"],
            "page": p["page"],
            "text": p["text"],
        }
        for i, p in enumerate(passages)
    ]
)

df.to_csv(OUT_PATH, index=False)
print(f"{len(df)} raw passages -> {OUT_PATH}")
