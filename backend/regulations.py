import httpx

from config import REGULATIONS_GOV_API_BASE as BASE
from config import REGULATIONS_GOV_API_KEY
from schemas import Rule, SubmitRequest


# API reference: https://open.gsa.gov/api/regulationsgov/
# (parameters and payloads verified against v4/openapi.yaml from that page)
class CommentSubmissionError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


async def list_open_proposed_rules(client: httpx.AsyncClient, limit: int = 20) -> list[Rule]:
    if not REGULATIONS_GOV_API_KEY:
        raise RuntimeError("REGULATIONS_GOV_API_KEY is not set")

    res = await client.get(
        f"{BASE}/documents",
        params={
            "filter[documentType]": "Proposed Rule",
            "filter[withinCommentPeriod]": "true",
            "page[size]": str(limit),
            "sort": "-postedDate",
        },
        headers={"X-Api-Key": REGULATIONS_GOV_API_KEY},
    )
    if res.status_code != 200:
        raise RuntimeError(f"Regulations.gov {res.status_code}: {res.text}")

    rules = []
    for doc in res.json()["data"]:
        attrs = doc["attributes"]
        # Full text comes from the Federal Register API, keyed by frDocNum —
        # documents without one can't be summarized, so drop them.
        if not attrs.get("frDocNum"):
            continue
        rules.append(
            Rule(
                documentId=doc["id"],
                title=attrs["title"],
                agencyId=attrs["agencyId"],
                docketId=attrs.get("docketId"),
                frDocNum=attrs["frDocNum"],
                postedDate=attrs["postedDate"],
                commentEndDate=attrs.get("commentEndDate"),
            )
        )
    return rules


async def submit_comment(client: httpx.AsyncClient, req: SubmitRequest) -> dict:
    if not REGULATIONS_GOV_API_KEY:
        raise CommentSubmissionError(500, "REGULATIONS_GOV_API_KEY is not set")

    attributes: dict = {
        "commentOnDocumentId": req.documentId,
        "comment": req.comment,
        "submissionType": "API",
        "submitterType": req.submitterType,
    }
    if req.submitterType == "INDIVIDUAL":
        attributes["firstName"] = req.firstName
        attributes["lastName"] = req.lastName
    if req.email:
        attributes["email"] = req.email
        attributes["sendEmailReceipt"] = req.sendEmailReceipt

    res = await client.post(
        f"{BASE}/comments",
        headers={
            "X-Api-Key": REGULATIONS_GOV_API_KEY,
            # The API returns 400s unless this exact content type is set.
            "Content-Type": "application/vnd.api+json",
        },
        json={"data": {"type": "comments", "attributes": attributes}},
    )

    if res.status_code == 403:
        raise CommentSubmissionError(
            403,
            "This API key is not activated for posting comments. "
            "Regulations.gov enables commenting per key after a help desk "
            "request with organization details. Use the manual submit link "
            "for now.",
        )
    if res.status_code >= 400:
        try:
            body = res.json()
            detail = body.get("errors", [{}])[0].get("detail") or body.get(
                "error", {}
            ).get("message", res.text)
        except ValueError:
            detail = res.text
        raise CommentSubmissionError(
            res.status_code, f"Regulations.gov rejected the submission: {detail}"
        )

    body = res.json()
    data = body.get("data", {})
    attrs = data.get("attributes", {})
    return {
        "id": data.get("id"),
        "trackingNumber": attrs.get("trackingNbr"),
        "receiveDate": attrs.get("receiveDate"),
    }
