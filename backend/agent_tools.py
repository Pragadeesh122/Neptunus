"""Composite agent tools: draft_public_comment and build_legal_lineage.

These stitch together the retrieval skills (regulations + laws) and the LLM to
produce higher-level outputs.
"""

from __future__ import annotations

import json

import httpx

from law_search import all_laws, search_laws
from llm import complete
from prompts import draft_messages
from regulation_search import get_rule_full, rule_ref, search_regulations
from schemas import Answer, RuleDetail


def _parse_args(arguments: str | dict) -> dict:
    if isinstance(arguments, str):
        try:
            return json.loads(arguments or "{}")
        except json.JSONDecodeError:
            return {}
    return arguments or {}


# ── draft_public_comment ──────────────────────────────────────────────────────
DRAFT_COMMENT_TOOL = {
    "type": "function",
    "function": {
        "name": "draft_public_comment",
        "description": (
            "Draft a substantive public comment on a specific proposed rule on the "
            "user's behalf. IMPORTANT: before calling this, have a short "
            "conversation with the user to gather (1) their specific issue or "
            "concern, (2) whether they support or oppose the rule, and (3) 2-3 "
            "concrete details about how it affects them (ask follow-up questions "
            "first). Only call once you have enough substance. Returns a polished, "
            "citation-backed comment the user can review and submit."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "document_number": {
                    "type": "string",
                    "description": "Federal Register document number of the rule to comment on.",
                },
                "situation": {
                    "type": "string",
                    "description": "The user's issue/position and how the rule affects them, in their words.",
                },
                "stance": {
                    "type": "string",
                    "description": "support, oppose, or mixed.",
                },
                "answers": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Concrete details gathered from the follow-up questions.",
                },
            },
            "required": ["document_number", "situation"],
        },
    },
}


async def run_draft_comment(client: httpx.AsyncClient, arguments: str | dict) -> dict:
    args = _parse_args(arguments)
    document_number = (args.get("document_number") or "").strip()
    situation = (args.get("situation") or "").strip()
    if not document_number:
        return {"content": "No document_number provided.", "rule": None}

    rule = get_rule_full(document_number)
    if rule is None:
        return {"content": f"No rule found for document number {document_number}.", "rule": None}

    stance = (args.get("stance") or "").strip()
    if stance:
        situation = f"Position: {stance}.\n{situation}"

    answers = [
        Answer(question="Additional detail from the commenter", answer=str(a))
        for a in (args.get("answers") or [])
        if str(a).strip()
    ]

    detail = RuleDetail(
        title=rule["title"],
        abstract=rule.get("abstract") or None,
        commentUrl=rule.get("commentUrl") or None,
        htmlUrl=rule.get("htmlUrl") or "",
        publicationDate=rule.get("publicationDate") or "",
        agencies=rule.get("agencies") or [],
        text=rule.get("fullText") or "",
    )
    docket_id = rule["docketIds"][0] if rule.get("docketIds") else ""

    messages = draft_messages(detail, docket_id, situation, answers)
    comment = await complete(client, messages, temperature=0.6)

    ref = rule_ref(_meta_from_full(rule))
    content = (
        f"Drafted public comment for '{rule['title']}' (Document {document_number}), "
        f"{len(comment)} characters"
        + (f", comment portal: {rule['commentUrl']}" if rule.get("commentUrl") else "")
        + ".\n\nPresent this draft to the user for review (they must submit it "
        "themselves). Draft follows:\n\n"
        + comment
    )
    return {"content": content, "rule": ref, "comment": comment}


def _meta_from_full(rule: dict) -> dict:
    """Reverse the camelCase rule dict back to the metadata keys rule_ref expects."""
    return {
        "document_number": rule.get("documentNumber", ""),
        "title": rule.get("title", ""),
        "type": rule.get("type", ""),
        "abstract": rule.get("abstract", ""),
        "publication_date": rule.get("publicationDate", ""),
        "effective_on": rule.get("effectiveOn", ""),
        "agencies": "; ".join(rule.get("agencies", [])),
        "cfr_references": "; ".join(rule.get("cfrReferences", [])),
        "docket_ids": "; ".join(rule.get("docketIds", [])),
        "topics": "; ".join(rule.get("topics", [])),
        "commentable": rule.get("commentable", False),
        "comments_close_on": rule.get("commentsCloseOn", ""),
        "comment_url": rule.get("commentUrl", ""),
        "html_url": rule.get("htmlUrl", ""),
    }


# ── build_legal_lineage ───────────────────────────────────────────────────────
LEGAL_LINEAGE_TOOL = {
    "type": "function",
    "function": {
        "name": "build_legal_lineage",
        "description": (
            "Build a structured chronological timeline that links a proposed rule "
            "to its authorizing statute(s) and any conflicting prior laws, plus the "
            "rule's key dates (publication, comment deadline, effective date). Use "
            "when the user wants the history / 'legal lineage' of a rule or to "
            "understand which law authorizes it. Provide either document_number or "
            "a topic query."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "document_number": {
                    "type": "string",
                    "description": "Federal Register document number of the rule (preferred).",
                },
                "query": {
                    "type": "string",
                    "description": "Topic to find the rule by, if no document number is known.",
                },
            },
        },
    },
}


def _congress_start_year(congress) -> int | None:
    try:
        return 1789 + 2 * (int(congress) - 1)
    except (TypeError, ValueError):
        return None


def _laws_related_to(rule_title: str) -> list[dict]:
    title = (rule_title or "").strip().lower()
    if not title:
        return []
    matched = []
    for law in all_laws():
        for rr in law.get("relatedRules", []):
            rr_l = rr.strip().lower()
            if not rr_l:
                continue
            if title in rr_l or rr_l in title:
                matched.append(law)
                break
    return matched


async def run_legal_lineage(client: httpx.AsyncClient, arguments: str | dict) -> dict:
    args = _parse_args(arguments)
    document_number = (args.get("document_number") or "").strip()
    query = (args.get("query") or "").strip()

    rule = None
    if document_number:
        rule = get_rule_full(document_number)
    if rule is None and query:
        res = await search_regulations(client, query, n_results=1)
        if res["rules"]:
            document_number = res["rules"][0]["documentNumber"]
            rule = get_rule_full(document_number)
    if rule is None:
        return {"content": "Could not resolve a rule. Provide a document_number or a clearer topic.", "rule": None}

    # Related laws: exact-ish match on related_rules, else semantic fallback.
    related = _laws_related_to(rule["title"])
    match_kind = "linked"
    if not related:
        topics = ", ".join(rule.get("topics", []))
        sem = await search_laws(client, f"{rule['title']} {topics}".strip(), n_results=6)
        related = sem["laws"]
        match_kind = "semantic"

    authorizing = [law for law in related if law.get("role") == "authorizing"]
    conflicting = [law for law in related if law.get("role") == "conflicting_prior_law"]
    other = [law for law in related if law.get("role") not in ("authorizing", "conflicting_prior_law")]

    timeline: list[dict] = []
    for law in related:
        yr = _congress_start_year(law.get("congress"))
        timeline.append(
            {
                "sortKey": f"{yr:04d}-01-01" if yr else "9999-01-01",
                "date": f"~{yr}" if yr else "date unknown",
                "kind": "statute",
                "role": law.get("role") or "related",
                "title": law.get("commonName") or law.get("officialTitle"),
                "publicLaw": law.get("publicLaw"),
                "note": law.get("conflictNote") or "",
                "url": law.get("legislationUrl") or "",
            }
        )

    if rule.get("publicationDate"):
        timeline.append(
            {
                "sortKey": rule["publicationDate"],
                "date": rule["publicationDate"],
                "kind": "proposed_rule",
                "title": rule["title"],
                "documentNumber": rule.get("documentNumber"),
                "agencies": rule.get("agencies", []),
                "url": rule.get("htmlUrl", ""),
            }
        )
    if rule.get("commentable") and rule.get("commentsCloseOn"):
        timeline.append(
            {
                "sortKey": rule["commentsCloseOn"],
                "date": rule["commentsCloseOn"],
                "kind": "comment_deadline",
                "title": f"Public comment closes for {rule['title']}",
                "url": rule.get("commentUrl", ""),
            }
        )
    if rule.get("effectiveOn"):
        timeline.append(
            {
                "sortKey": rule["effectiveOn"],
                "date": rule["effectiveOn"],
                "kind": "effective",
                "title": f"Effective date for {rule['title']}",
            }
        )

    timeline.sort(key=lambda e: e["sortKey"])

    rule_reference = rule_ref(_meta_from_full(rule))
    structured = {
        "rule": rule_reference,
        "matchKind": match_kind,
        "authorizingLaws": authorizing,
        "conflictingLaws": conflicting,
        "otherLaws": other,
        "timeline": timeline,
    }

    # Readable structured rendering for the agent.
    lines = [f"LEGAL LINEAGE for '{rule['title']}' (Document {rule.get('documentNumber')})"]
    if match_kind == "semantic":
        lines.append(
            "(No explicit rule-to-law link in the dataset; laws below are the "
            "closest semantic matches and may be indirectly related.)"
        )
    lines.append("\nChronological timeline (earliest first):")
    label = {
        "statute": "STATUTE",
        "proposed_rule": "PROPOSED RULE",
        "comment_deadline": "COMMENT DEADLINE",
        "effective": "EFFECTIVE DATE",
    }
    for e in timeline:
        tag = label.get(e["kind"], e["kind"].upper())
        extra = ""
        if e["kind"] == "statute":
            extra = f" — role: {e['role']}, Public Law {e['publicLaw']}"
            if e.get("note"):
                extra += f"; {e['note']}"
        lines.append(f"- [{e['date']}] {tag}: {e['title']}{extra}")

    content = "\n".join(lines) + "\n\nStructured data:\n" + json.dumps(structured, indent=2)
    return {"content": content, "rule": rule_reference, "structured": structured}
