export type Rule = {
  documentId: string;
  title: string;
  agencyId: string;
  docketId: string | null;
  frDocNum: string;
  postedDate: string;
  commentEndDate: string | null;
};

export type RuleDetail = {
  title: string;
  abstract: string | null;
  commentUrl: string | null;
  htmlUrl: string;
  publicationDate: string;
  agencies: string[];
  text: string;
};

export type RuleSummary = {
  plainSummary: string;
  whoItAffects: string[];
  keyChanges: string[];
  questions: string[];
};

export type Answer = {
  question: string;
  answer: string;
};

export type User = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  occupation: string | null;
  employmentType: string | null;
  customInfo: Record<string, unknown>;
  createdAt: string;
};

export type SignupPayload = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  city: string;
  state: string;
  zipCode: string;
  occupation: string;
  employmentType: string;
  customInfo: Record<string, string>;
};
