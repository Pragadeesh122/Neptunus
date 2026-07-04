import asyncio
import json

import httpx

from ingestion.loader import RuleRecord, load_rules, fetch_text, _is_pdf


def _write_kb(tmp_path):
    kb = {
        "total_rules": 3,
        "personas": {
            "persona_a": {"rules": [
                {"document_number": "AAA", "title": "Rule A", "type": "Proposed Rule",
                 "abstract": "abs a", "publication_date": "2026-07-01",
                 "agency_names": ["Agency One"], "topics": ["t1", "t2"],
                 "comment_url": "http://c/a", "html_url": "http://h/a",
                 "raw_text_url": "http://r/a"},
                {"document_number": "SHARED", "title": "Rule S", "type": "Proposed Rule",
                 "abstract": "abs s", "publication_date": "2026-07-02",
                 "agency_names": ["Agency One"], "topics": ["t3"],
                 "comment_url": None, "html_url": "http://h/s", "raw_text_url": "http://r/s"},
            ]},
            "persona_b": {"rules": [
                {"document_number": "SHARED", "title": "Rule S", "type": "Proposed Rule",
                 "abstract": "abs s", "publication_date": "2026-07-02",
                 "agency_names": ["Agency One"], "topics": ["t3"],
                 "comment_url": None, "html_url": "http://h/s", "raw_text_url": "http://r/s"},
            ]},
        },
    }
    path = tmp_path / "kb.json"
    path.write_text(json.dumps(kb))
    return path


def test_load_rules_dedupes_and_merges_personas(tmp_path):
    records = load_rules(_write_kb(tmp_path))
    by_num = {r.document_number: r for r in records}
    assert set(by_num) == {"AAA", "SHARED"}
    assert by_num["AAA"].personas == ["persona_a"]
    assert sorted(by_num["SHARED"].personas) == ["persona_a", "persona_b"]
    assert by_num["SHARED"].comment_url is None
    assert by_num["AAA"].topics == ["t1", "t2"]


def test_is_pdf_detects_magic_bytes_and_content_type():
    assert _is_pdf("application/pdf", b"anything")
    assert _is_pdf("text/plain", b"%PDF-1.7 ...")
    assert not _is_pdf("text/plain", b"plain words")


def test_fetch_text_returns_plain_text():
    record = RuleRecord("AAA", "Rule A", ["Agency"], [], ["p"], "http://h",
                        "http://r/a", "2026-07-01", None, "abs")

    def handler(request):
        return httpx.Response(200, text="full rule body", headers={"content-type": "text/plain"})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_text(client, record)

    assert asyncio.run(go()) == "full rule body"


def test_fetch_text_falls_back_to_abstract_when_empty():
    record = RuleRecord("AAA", "Rule A", ["Agency"], [], ["p"], "http://h",
                        "http://r/a", "2026-07-01", None, "the abstract")

    def handler(request):
        return httpx.Response(200, text="   ", headers={"content-type": "text/plain"})

    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            return await fetch_text(client, record)

    assert asyncio.run(go()) == "the abstract"
