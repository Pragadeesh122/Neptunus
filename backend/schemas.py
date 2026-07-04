# Field names are camelCase on purpose: they are the wire format the
# Next.js frontend already uses.
from typing import Literal

from pydantic import BaseModel, Field, model_validator


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
