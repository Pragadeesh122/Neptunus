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
