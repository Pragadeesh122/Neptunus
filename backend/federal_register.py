import httpx

from schemas import RuleDetail

BASE = "https://www.federalregister.gov/api/v1"

# FR documents front-load the preamble (SUMMARY, DATES, SUPPLEMENTARY
# INFORMATION), so a head-truncation keeps the most useful content while
# fitting the model's context window.
MAX_RULE_CHARS = 60_000

FIELDS = [
    "title",
    "abstract",
    "raw_text_url",
    "html_url",
    "publication_date",
    "comment_url",
    "agencies",
]


async def get_rule_detail(client: httpx.AsyncClient, fr_doc_num: str) -> RuleDetail:
    res = await client.get(
        f"{BASE}/documents/{fr_doc_num}.json",
        params=[("fields[]", f) for f in FIELDS],
    )
    if res.status_code != 200:
        raise RuntimeError(f"Federal Register {res.status_code}: {res.text}")
    doc = res.json()

    text = ""
    if doc.get("raw_text_url"):
        text_res = await client.get(doc["raw_text_url"])
        if text_res.status_code == 200:
            text = text_res.text[:MAX_RULE_CHARS]
    if not text:
        text = doc.get("abstract") or ""
    if not text:
        raise RuntimeError(f"No text available for FR document {fr_doc_num}")

    return RuleDetail(
        title=doc["title"],
        abstract=doc.get("abstract"),
        commentUrl=doc.get("comment_url"),
        htmlUrl=doc["html_url"],
        publicationDate=doc["publication_date"],
        agencies=[a["name"] for a in doc.get("agencies", []) if a.get("name")],
        text=text,
    )
