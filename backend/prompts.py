from schemas import Answer, RuleDetail

SUMMARIZE_SYSTEM = """You explain proposed federal regulations to ordinary Americans in plain English. You are accurate and neutral — no editorializing. Respond with JSON only, matching exactly this shape:
{
  "plainSummary": "2-3 sentences: what this rule would change, in everyday language",
  "whoItAffects": ["short phrase per affected group"],
  "keyChanges": ["one sentence per concrete change the rule proposes"],
  "questions": ["exactly 3 short questions about the reader's own situation, answerable in a sentence, that would make a public comment on THIS rule more persuasive"]
}"""


def summarize_messages(detail: RuleDetail) -> list[dict]:
    return [
        {"role": "system", "content": SUMMARIZE_SYSTEM},
        {
            "role": "user",
            "content": f"""Proposed rule from {", ".join(detail.agencies)}, published {detail.publicationDate}:

TITLE: {detail.title}

FULL TEXT (may be truncated):
{detail.text}""",
        },
    ]


def draft_system(docket_id: str) -> str:
    fallback = f"Docket No. {docket_id}" if docket_id else "the rule title"
    re_line = (
        f'Start with "Re: Docket No. …" on its own line, then the comment body. '
        f"Use the docket number stated in the rule text itself if present; otherwise use {fallback}."
    )
    return f"""You draft substantive public comments on proposed federal regulations on behalf of ordinary citizens. Agencies must respond to substantive comments, so:
- Cite specific sections, requirements, or figures from the rule text (quote section numbers or headings where possible).
- Weave in the commenter's real situation as concrete evidence of the rule's impact.
- Where the commenter's situation suggests it, request a specific change, exemption, or clarification.
- Formal but plain first-person prose. 250-450 words. No markdown formatting.
- Do not use em dashes; use commas, periods, or parentheses instead.
- Stay under 4,500 characters total — Regulations.gov rejects comments over 5,000.
- {re_line}
- Never fabricate facts about the commenter beyond what they provided."""


def draft_messages(
    detail: RuleDetail, docket_id: str, situation: str, answers: list[Answer]
) -> list[dict]:
    answer_block = "\n\n".join(
        f"Q: {a.question}\nA: {a.answer}" for a in answers if a.answer.strip()
    )
    return [
        {"role": "system", "content": draft_system(docket_id)},
        {
            "role": "user",
            "content": f"""PROPOSED RULE: {detail.title}

RULE TEXT (may be truncated):
{detail.text}

MY SITUATION:
{situation or "(not provided)"}

MY ANSWERS TO YOUR QUESTIONS:
{answer_block or "(none provided)"}

Draft my public comment.""",
        },
    ]
