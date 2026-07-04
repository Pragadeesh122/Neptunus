"""Load rule metadata from the persona knowledge-base JSON and fetch full text.

Rules are grouped by persona in the source JSON; this module flattens and
dedupes them by ``document_number`` (merging persona provenance), then fetches
each rule's full text from ``raw_text_url`` with a PDF-to-text fallback.
"""
import io
import json
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_JSON = REPO_ROOT / "data" / "persona_rules_knowledge_base.json"


@dataclass
class RuleRecord:
    document_number: str
    title: str
    agency_names: list
    topics: list
    personas: list
    html_url: str
    raw_text_url: str
    publication_date: str
    comment_url: object  # str | None
    abstract: object     # str | None


def load_rules(json_path=DEFAULT_JSON):
    data = json.loads(Path(json_path).read_text())
    by_num = {}
    for persona_key, persona in data.get("personas", {}).items():
        for rule in persona.get("rules", []):
            num = rule["document_number"]
            existing = by_num.get(num)
            if existing:
                if persona_key not in existing.personas:
                    existing.personas.append(persona_key)
                continue
            by_num[num] = RuleRecord(
                document_number=num,
                title=rule.get("title", ""),
                agency_names=list(rule.get("agency_names", [])),
                topics=list(rule.get("topics", [])),
                personas=[persona_key],
                html_url=rule.get("html_url", ""),
                raw_text_url=rule.get("raw_text_url", ""),
                publication_date=rule.get("publication_date", ""),
                comment_url=rule.get("comment_url"),
                abstract=rule.get("abstract"),
            )
    return list(by_num.values())


def _is_pdf(content_type, body):
    if "application/pdf" in (content_type or "").lower():
        return True
    return body[:5] == b"%PDF-"


def _pdf_to_text(body):
    from pypdf import PdfReader
    reader = PdfReader(io.BytesIO(body))
    return "\n".join((page.extract_text() or "") for page in reader.pages)


async def fetch_text(client, record):
    res = await client.get(record.raw_text_url, follow_redirects=True)
    res.raise_for_status()
    body = res.content
    content_type = res.headers.get("content-type", "")
    if _is_pdf(content_type, body):
        text = _pdf_to_text(body)
    else:
        text = res.text
    text = (text or "").strip()
    if not text:
        text = (record.abstract or "").strip()
    return text
