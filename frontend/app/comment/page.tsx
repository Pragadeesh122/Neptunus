"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Bank,
  ChatCircleDots,
  Check,
  CheckCircle,
  Copy,
  ListChecks,
  PaperPlaneTilt,
  SignIn,
  SignOut,
  Timer,
  UserCircle,
  Users,
  WarningCircle,
} from "@phosphor-icons/react";
import { API_URL, sseFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { Rule, RuleSummary } from "@/lib/types";

type Step = "browse" | "summary" | "draft";

type SummaryResult = {
  summary: RuleSummary;
  detail: {
    title: string;
    abstract: string | null;
    commentUrl: string | null;
    htmlUrl: string;
    agencies: string[];
  };
};

const STEPS: { key: Step; label: string }[] = [
  { key: "browse", label: "Find a rule" },
  { key: "summary", label: "Understand it" },
  { key: "draft", label: "Draft your comment" },
];

function daysLeft(commentEndDate: string | null): number | null {
  if (!commentEndDate) return null;
  const ms = new Date(commentEndDate).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

function DeadlineBadge({ days }: { days: number | null }) {
  if (days === null) return null;
  const urgency =
    days <= 5
      ? "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/50"
      : days <= 14
        ? "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/50"
        : "text-muted bg-line/50";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${urgency}`}
    >
      <Timer size={13} weight="bold" />
      {days} {days === 1 ? "day" : "days"} left
    </span>
  );
}

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current);
  return (
    <nav aria-label="Progress" className="mb-10">
      <ol className="flex items-center gap-2 sm:gap-3">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx;
          const isCurrent = i === currentIdx;
          return (
            <li key={step.key} className="flex items-center gap-2 sm:gap-3">
              {i > 0 && <span className="h-px w-5 bg-line sm:w-10" />}
              <span
                aria-current={isCurrent ? "step" : undefined}
                className={`flex items-center gap-2 text-sm ${
                  isCurrent
                    ? "font-semibold text-foreground"
                    : "font-medium text-muted"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isDone
                      ? "bg-accent text-white"
                      : isCurrent
                        ? "border-2 border-accent text-accent-text"
                        : "border border-line"
                  }`}
                >
                  {isDone ? <Check size={13} weight="bold" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{step.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ErrorBanner({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="mb-6 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
    >
      <WarningCircle size={18} weight="bold" className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="mt-2 font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function RuleListSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          className="rounded-2xl border border-line bg-surface p-5"
        >
          <div className="skeleton h-4 w-4/5" />
          <div className="mt-3 flex gap-2">
            <div className="skeleton h-5 w-24" />
            <div className="skeleton h-5 w-28" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SummarySkeleton({ status }: { status: string | null }) {
  return (
    <div aria-hidden>
      {status && (
        <p className="mb-4 animate-pulse text-sm text-muted">{status}</p>
      )}
      <div className="rounded-2xl border border-line bg-surface p-6">
        <div className="skeleton h-4 w-full" />
        <div className="mt-2 skeleton h-4 w-11/12" />
        <div className="mt-2 skeleton h-4 w-3/5" />
        <div className="mt-8 grid gap-8 sm:grid-cols-2">
          <div>
            <div className="skeleton h-3 w-28" />
            <div className="mt-3 skeleton h-4 w-full" />
            <div className="mt-2 skeleton h-4 w-4/5" />
          </div>
          <div>
            <div className="skeleton h-3 w-28" />
            <div className="mt-3 skeleton h-4 w-full" />
            <div className="mt-2 skeleton h-4 w-4/5" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const [step, setStep] = useState<Step>("browse");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const [rules, setRules] = useState<Rule[]>([]);
  const [loadingRules, setLoadingRules] = useState(true);

  const [rule, setRule] = useState<Rule | null>(null);
  const [data, setData] = useState<SummaryResult | null>(null);
  const [summarizing, setSummarizing] = useState(false);

  const [situation, setSituation] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [comment, setComment] = useState("");
  const [copied, setCopied] = useState(false);

  const [submitterType, setSubmitterType] = useState<
    "ANONYMOUS" | "INDIVIDUAL"
  >("ANONYMOUS");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [certified, setCertified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<{
    trackingNumber: string | null;
    id: string | null;
  } | null>(null);

  const draftRef = useRef<HTMLTextAreaElement>(null);

  function resetSubmission() {
    setCertified(false);
    setSubmitError(null);
    setSubmitResult(null);
  }

  const loadRules = useCallback(() => {
    setLoadingRules(true);
    setError(null);
    fetch(`${API_URL}/rules`)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.detail ?? "Failed to load rules");
        setRules(json.rules);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoadingRules(false));
  }, []);

  useEffect(loadRules, [loadRules]);

  // Keep the newest streamed text in view while the draft writes itself.
  useEffect(() => {
    if (drafting && draftRef.current) {
      draftRef.current.scrollTop = draftRef.current.scrollHeight;
    }
  }, [comment, drafting]);

  async function pickRule(r: Rule) {
    setRule(r);
    setStep("summary");
    setError(null);
    setData(null);
    setSummarizing(true);
    setStatus("Contacting the Federal Register…");
    try {
      await sseFetch("/summarize", { frDocNum: r.frDocNum }, (event, d) => {
        if (event === "status") setStatus(d.message as string);
        if (event === "error") setError(d.error as string);
        if (event === "result") {
          const result = d as unknown as SummaryResult;
          setData(result);
          setAnswers(new Array(result.summary.questions.length).fill(""));
          setSituation("");
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSummarizing(false);
      setStatus(null);
    }
  }

  async function draftComment() {
    if (!rule || !data) return;
    setDrafting(true);
    setError(null);
    setComment("");
    resetSubmission();
    setStep("draft");
    setStatus("Reading the rule once more…");
    try {
      await sseFetch(
        "/draft",
        {
          frDocNum: rule.frDocNum,
          docketId: rule.docketId ?? "",
          situation,
          answers: data.summary.questions.map((q, i) => ({
            question: q,
            answer: answers[i] ?? "",
          })),
        },
        (event, d) => {
          if (event === "status") setStatus(d.message as string);
          if (event === "error") setError(d.error as string);
          if (event === "delta") {
            setStatus(null);
            setComment((c) => c + (d.text as string));
          }
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setDrafting(false);
      setStatus(null);
    }
  }

  function copyComment() {
    navigator.clipboard.writeText(comment).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function submitDirect() {
    if (!rule) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`${API_URL}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: rule.documentId,
          comment,
          submitterType,
          firstName: submitterType === "INDIVIDUAL" ? firstName : null,
          lastName: submitterType === "INDIVIDUAL" ? lastName : null,
          email: email || null,
          sendEmailReceipt: Boolean(email),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          typeof json.detail === "string"
            ? json.detail
            : "The submission was rejected. Check your entries and try again."
        );
      }
      setSubmitResult(json);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Something went wrong"
      );
    } finally {
      setSubmitting(false);
    }
  }

  const submitReady =
    certified &&
    comment.length > 0 &&
    comment.length <= 5000 &&
    (submitterType === "ANONYMOUS" ||
      (firstName.trim().length > 0 && lastName.trim().length > 0));

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Bank size={22} weight="duotone" className="text-accent-text" />
            <span className="font-semibold tracking-tight">
              Public Comment Copilot
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
            >
              <ChatCircleDots size={15} weight="bold" />
              Ask the agent
            </Link>
            <a
              href="https://www.regulations.gov"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden items-center gap-1 text-sm text-muted transition-colors hover:text-foreground sm:inline-flex"
            >
              Regulations.gov
              <ArrowUpRight size={14} weight="bold" />
            </a>
            {!authLoading && (
              user ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 text-sm text-muted">
                    <UserCircle size={16} />
                    {user.firstName ?? user.email}
                  </span>
                  <button
                    onClick={() => logout()}
                    className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
                  >
                    <SignOut size={15} weight="bold" />
                    Sign out
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Link
                    href="/auth/login"
                    className="flex items-center gap-1 text-sm text-muted transition-colors hover:text-foreground"
                  >
                    <SignIn size={15} weight="bold" />
                    Sign in
                  </Link>
                  <Link
                    href="/auth/signup"
                    className="rounded-[10px] bg-accent px-3 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover"
                  >
                    Sign up
                  </Link>
                </div>
              )
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <StepIndicator current={step} />

        {error && (
          <ErrorBanner
            message={error}
            onRetry={step === "browse" ? loadRules : undefined}
          />
        )}

        {step === "browse" && (
          <section>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Make your voice count in federal rulemaking.
            </h1>
            <p className="mt-3 max-w-xl text-muted">
              These proposed rules are open for public comment right now. Pick
              one that touches your life.
            </p>

            <div className="mt-8">
              {loadingRules ? (
                <RuleListSkeleton />
              ) : rules.length === 0 && !error ? (
                <div className="rounded-2xl border border-line bg-surface p-10 text-center">
                  <Bank size={28} className="mx-auto text-muted" />
                  <p className="mt-3 font-medium">
                    No rules are open for comment right now
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    New proposed rules are published most weekdays. Check back
                    soon.
                  </p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {rules.map((r, i) => {
                    const days = daysLeft(r.commentEndDate);
                    return (
                      <li
                        key={r.documentId}
                        className="animate-fade-up"
                        style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                      >
                        <button
                          onClick={() => pickRule(r)}
                          className="group w-full rounded-2xl border border-line bg-surface p-5 text-left transition-all duration-200 hover:border-accent hover:shadow-sm active:translate-y-px"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <span className="font-medium leading-snug">
                              {r.title}
                            </span>
                            <ArrowUpRight
                              size={16}
                              weight="bold"
                              className="mt-1 shrink-0 text-muted transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent-text"
                            />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text">
                              {r.agencyId}
                            </span>
                            <DeadlineBadge days={days} />
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        )}

        {step === "summary" && rule && (
          <section>
            <button
              onClick={() => setStep("browse")}
              className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft size={15} weight="bold" />
              All open rules
            </button>

            <h1 className="text-xl font-semibold leading-snug tracking-tight sm:text-2xl">
              {rule.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text">
                {rule.agencyId}
              </span>
              <DeadlineBadge days={daysLeft(rule.commentEndDate)} />
            </div>

            <div className="mt-8">
              {summarizing && <SummarySkeleton status={status} />}

              {data && (
                <div className="animate-fade-up">
                  <div className="rounded-2xl border border-line bg-surface p-6 sm:p-8">
                    <p className="text-base leading-relaxed sm:text-lg">
                      {data.summary.plainSummary}
                    </p>
                    <div className="mt-8 grid gap-8 sm:grid-cols-2">
                      <div>
                        <h2 className="flex items-center gap-2 text-sm font-semibold">
                          <Users
                            size={16}
                            weight="bold"
                            className="text-accent-text"
                          />
                          Who it affects
                        </h2>
                        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                          {data.summary.whoItAffects.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h2 className="flex items-center gap-2 text-sm font-semibold">
                          <ListChecks
                            size={16}
                            weight="bold"
                            className="text-accent-text"
                          />
                          Key changes
                        </h2>
                        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted">
                          {data.summary.keyChanges.map((k) => (
                            <li key={k}>{k}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                    <a
                      href={data.detail.htmlUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-8 inline-flex items-center gap-1 text-sm font-medium text-accent-text transition-colors hover:underline"
                    >
                      Read the full rule on the Federal Register
                      <ArrowUpRight size={14} weight="bold" />
                    </a>
                  </div>

                  <div className="mt-10">
                    <h2 className="text-lg font-semibold tracking-tight">
                      Make it about you
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Your answers turn a form letter into a substantive
                      comment.
                    </p>

                    <div className="mt-6 space-y-5">
                      <div>
                        <label
                          htmlFor="situation"
                          className="block text-sm font-medium"
                        >
                          Describe your situation
                        </label>
                        <textarea
                          id="situation"
                          value={situation}
                          onChange={(e) => setSituation(e.target.value)}
                          rows={3}
                          className="mt-2 w-full rounded-[10px] border border-line bg-surface p-3 text-sm leading-relaxed transition-colors placeholder:text-muted/60 focus:border-accent"
                          placeholder="I run a 12-employee landscaping business in Ohio…"
                        />
                        <p className="mt-1.5 text-xs text-muted">
                          A sentence or two is enough. Specifics make your
                          comment stronger.
                        </p>
                      </div>

                      {data.summary.questions.map((q, i) => (
                        <div key={q}>
                          <label
                            htmlFor={`q-${i}`}
                            className="block text-sm font-medium"
                          >
                            {q}
                          </label>
                          <input
                            id={`q-${i}`}
                            value={answers[i] ?? ""}
                            onChange={(e) => {
                              const next = [...answers];
                              next[i] = e.target.value;
                              setAnswers(next);
                            }}
                            className="mt-2 w-full rounded-[10px] border border-line bg-surface p-3 text-sm transition-colors focus:border-accent"
                          />
                        </div>
                      ))}

                      <button
                        onClick={draftComment}
                        disabled={drafting}
                        className="rounded-[10px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-accent-hover active:translate-y-px disabled:opacity-50"
                      >
                        Draft my comment
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {step === "draft" && rule && data && (
          <section>
            <button
              onClick={() => setStep("summary")}
              className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-foreground"
            >
              <ArrowLeft size={15} weight="bold" />
              Back to the summary
            </button>

            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
                Your draft comment
              </h1>
              {status && (
                <span className="animate-pulse text-sm text-muted">
                  {status}
                </span>
              )}
              {drafting && !status && (
                <span className="animate-pulse text-sm text-muted">
                  Writing…
                </span>
              )}
            </div>

            <div className="mt-5 rounded-2xl border border-line bg-surface transition-colors focus-within:border-accent">
              <textarea
                ref={draftRef}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={17}
                readOnly={drafting}
                aria-label="Draft comment text"
                className="w-full resize-y rounded-2xl bg-transparent p-5 text-[15px] leading-relaxed outline-none sm:p-6"
              />
            </div>
            <p
              className={`mt-2 text-xs ${
                comment.length > 5000
                  ? "font-semibold text-red-600 dark:text-red-400"
                  : "text-muted"
              }`}
            >
              {comment.length.toLocaleString()} / 5,000 characters
              (Regulations.gov limit)
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                onClick={copyComment}
                disabled={drafting || comment.length === 0}
                className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-accent-hover active:translate-y-px disabled:opacity-50"
              >
                {copied ? (
                  <Check size={15} weight="bold" />
                ) : (
                  <Copy size={15} weight="bold" />
                )}
                {copied ? "Copied" : "Copy comment"}
              </button>
              {data.detail.commentUrl && (
                <a
                  href={data.detail.commentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-5 py-2.5 text-sm font-semibold transition-all duration-150 hover:border-accent active:translate-y-px"
                >
                  Submit on Regulations.gov
                  <ArrowUpRight size={15} weight="bold" />
                </a>
              )}
            </div>

            <div className="mt-10 rounded-2xl border border-line bg-surface p-6 sm:p-8">
              <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                <PaperPlaneTilt
                  size={18}
                  weight="bold"
                  className="text-accent-text"
                />
                Submit directly from here
              </h2>
              <p className="mt-1 text-sm text-muted">
                Sends your comment through the official Regulations.gov
                commenting API.
              </p>

              {submitResult ? (
                <div className="mt-5 flex items-start gap-3 rounded-[10px] border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  <CheckCircle
                    size={18}
                    weight="bold"
                    className="mt-0.5 shrink-0"
                  />
                  <div>
                    <p className="font-semibold">Comment submitted</p>
                    <p className="mt-1">
                      {submitResult.trackingNumber
                        ? `Tracking number: ${submitResult.trackingNumber}. Save it.`
                        : "Submission accepted."}{" "}
                      The agency reviews API submissions before they appear
                      publicly on Regulations.gov.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <fieldset className="mt-5">
                    <legend className="text-sm font-medium">Submit as</legend>
                    <div className="mt-2 flex gap-4">
                      {(
                        [
                          ["ANONYMOUS", "Anonymous"],
                          ["INDIVIDUAL", "With my name"],
                        ] as const
                      ).map(([value, label]) => (
                        <label
                          key={value}
                          className="flex cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="radio"
                            name="submitterType"
                            checked={submitterType === value}
                            onChange={() => setSubmitterType(value)}
                            className="accent-[var(--accent)]"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  {submitterType === "INDIVIDUAL" && (
                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor="first-name"
                          className="block text-sm font-medium"
                        >
                          First name
                        </label>
                        <input
                          id="first-name"
                          value={firstName}
                          maxLength={25}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="mt-2 w-full rounded-[10px] border border-line bg-surface p-3 text-sm transition-colors focus:border-accent"
                        />
                      </div>
                      <div>
                        <label
                          htmlFor="last-name"
                          className="block text-sm font-medium"
                        >
                          Last name
                        </label>
                        <input
                          id="last-name"
                          value={lastName}
                          maxLength={25}
                          onChange={(e) => setLastName(e.target.value)}
                          className="mt-2 w-full rounded-[10px] border border-line bg-surface p-3 text-sm transition-colors focus:border-accent"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-4">
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium"
                    >
                      Email <span className="text-muted">(optional)</span>
                    </label>
                    <input
                      id="email"
                      type="email"
                      value={email}
                      maxLength={100}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-2 w-full rounded-[10px] border border-line bg-surface p-3 text-sm transition-colors focus:border-accent"
                    />
                    <p className="mt-1.5 text-xs text-muted">
                      If provided, Regulations.gov emails you a receipt.
                    </p>
                  </div>

                  <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm leading-relaxed">
                    <input
                      type="checkbox"
                      checked={certified}
                      onChange={(e) => setCertified(e.target.checked)}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    I reviewed this comment and it reflects my own views and
                    my real situation.
                  </label>

                  {submitError && (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-3 rounded-[10px] border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
                    >
                      <WarningCircle
                        size={18}
                        weight="bold"
                        className="mt-0.5 shrink-0"
                      />
                      <p>{submitError}</p>
                    </div>
                  )}

                  <button
                    onClick={submitDirect}
                    disabled={!submitReady || submitting}
                    className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:bg-accent-hover active:translate-y-px disabled:opacity-50"
                  >
                    <PaperPlaneTilt size={15} weight="bold" />
                    {submitting ? "Submitting…" : "Submit to Regulations.gov"}
                  </button>

                  <p className="mt-4 text-xs leading-relaxed text-muted">
                    By submitting you agree to the Regulations.gov{" "}
                    <a
                      href="https://www.regulations.gov/user-notice"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      user notice
                    </a>{" "}
                    and{" "}
                    <a
                      href="https://www.regulations.gov/privacy-notice"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline underline-offset-2"
                    >
                      privacy notice
                    </a>
                    .
                  </p>
                </>
              )}
            </div>

            <p className="mt-8 max-w-xl text-xs leading-relaxed text-muted">
              Review and edit before you submit. This comment is yours, not
              the AI&apos;s. Nothing is sent anywhere until you submit it
              yourself.
            </p>
          </section>
        )}
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto w-full max-w-4xl px-5 py-6">
          <p className="text-xs leading-relaxed text-muted">
            Under 5 U.S.C. § 553, federal agencies must consider substantive
            public comments before finalizing a proposed rule. A specific,
            personal comment carries more weight than a thousand form letters.
          </p>
        </div>
      </footer>
    </>
  );
}
