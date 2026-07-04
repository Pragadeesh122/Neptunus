# Field names are camelCase on purpose: they are the wire format the
# Next.js frontend already uses.
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, model_validator

# ── Occupation options ────────────────────────────────────────────────────────
OCCUPATIONS = [
    "Agriculture / Farming",
    "Construction",
    "Education",
    "Energy / Mining",
    "Environmental / Conservation",
    "Financial Services",
    "Food & Beverage",
    "Healthcare / Medical",
    "Legal / Law",
    "Manufacturing",
    "Real Estate",
    "Retail / Small Business",
    "Technology",
    "Telecommunications",
    "Transportation / Trucking",
    "Other",
]

EMPLOYMENT_TYPES = [
    "Employee",
    "Employer",
    "Self-Employed",
    "Small Business Owner",
]

OccupationLiteral = Literal[
    "Agriculture / Farming",
    "Construction",
    "Education",
    "Energy / Mining",
    "Environmental / Conservation",
    "Financial Services",
    "Food & Beverage",
    "Healthcare / Medical",
    "Legal / Law",
    "Manufacturing",
    "Real Estate",
    "Retail / Small Business",
    "Technology",
    "Telecommunications",
    "Transportation / Trucking",
    "Other",
]

EmploymentTypeLiteral = Literal[
    "Employee",
    "Employer",
    "Self-Employed",
    "Small Business Owner",
]


# ── Auth schemas ──────────────────────────────────────────────────────────────
class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    firstName: str = Field(max_length=100)
    lastName: str = Field(max_length=100)
    city: str = Field(max_length=100)
    state: str = Field(min_length=2, max_length=2, pattern=r"^[A-Z]{2}$")
    zipCode: str = Field(max_length=10, pattern=r"^\d{5}(-\d{4})?$")
    occupation: OccupationLiteral
    employmentType: EmploymentTypeLiteral
    customInfo: dict[str, Any] = {}


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: str
    email: str
    firstName: str | None
    lastName: str | None
    city: str | None
    state: str | None
    zipCode: str | None
    occupation: str | None
    employmentType: str | None
    customInfo: dict[str, Any]
    createdAt: str


class Rule(BaseModel):
    documentId: str
    title: str
    agencyId: str
    docketId: str | None
    frDocNum: str
    postedDate: str
    commentEndDate: str | None


class RuleDetail(BaseModel):
    title: str
    abstract: str | None
    commentUrl: str | None
    htmlUrl: str
    publicationDate: str
    agencies: list[str]
    text: str


class Answer(BaseModel):
    question: str
    answer: str


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=24000)


class ChatRequest(BaseModel):
    # Full conversation so far, oldest first. Empty on the first turn: the
    # agent opens the conversation with a personalized greeting.
    messages: list[ChatMessage] = []


class SummarizeRequest(BaseModel):
    frDocNum: str


class DraftRequest(BaseModel):
    frDocNum: str
    docketId: str = ""
    situation: str = ""
    answers: list[Answer] = []


# Validation limits mirror the Regulations.gov commenting API:
# https://open.gsa.gov/api/regulationsgov/ (Post Comment API Validation)
class SubmitRequest(BaseModel):
    documentId: str
    comment: str = Field(min_length=1, max_length=5000)
    submitterType: Literal["ANONYMOUS", "INDIVIDUAL"] = "ANONYMOUS"
    firstName: str | None = Field(default=None, max_length=25)
    lastName: str | None = Field(default=None, max_length=25)
    email: str | None = Field(default=None, max_length=100)
    sendEmailReceipt: bool = False

    @model_validator(mode="after")
    def check_conditionals(self):
        if self.submitterType == "INDIVIDUAL" and not (
            self.firstName and self.lastName
        ):
            raise ValueError(
                "First and last name are required to submit as an individual"
            )
        if self.sendEmailReceipt and not self.email:
            raise ValueError("An email address is required to receive a receipt")
        return self
