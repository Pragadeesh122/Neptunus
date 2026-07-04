"use client";

import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Buildings,
  CalendarBlank,
  Timer,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { regulations } from "@/lib/api";
import type { RuleFull } from "@/lib/types";

export default function RuleDrawer({
  documentNumber,
  onClose,
}: {
  documentNumber: string | null;
  onClose: () => void;
}) {
  const [rule, setRule] = useState<RuleFull | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentNumber) return;
    setRule(null);
    setError(null);
    setLoading(true);
    regulations
      .get(documentNumber)
      .then(setRule)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load the rule")
      )
      .finally(() => setLoading(false));
  }, [documentNumber]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (documentNumber) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [documentNumber, onClose]);

  if (!documentNumber) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <aside className="animate-slide-in relative flex h-full w-full max-w-2xl flex-col border-l border-line bg-background shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {rule?.type || "Proposed Rule"} · {documentNumber}
            </p>
            <h2 className="mt-1 truncate text-lg font-semibold leading-snug">
              {rule?.title ?? "Loading…"}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-line text-muted transition hover:border-foreground hover:text-foreground"
          >
            <X size={16} weight="bold" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {loading && (
            <div className="space-y-3">
              <div className="skeleton h-4 w-3/4" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-5/6" />
              <div className="skeleton h-40 w-full" />
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
            >
              <WarningCircle size={18} weight="bold" className="mt-0.5 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {rule && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                {rule.agencies.map((a) => (
                  <span
                    key={a}
                    className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text"
                  >
                    <Buildings size={12} weight="bold" />
                    {a}
                  </span>
                ))}
                {rule.commentable ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                    <Timer size={12} weight="bold" />
                    {rule.commentsCloseOn
                      ? `Comment by ${rule.commentsCloseOn}`
                      : "Open for comment"}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-line/60 px-2.5 py-0.5 text-xs font-medium text-muted">
                    Not open for comment
                  </span>
                )}
                <span className="inline-flex items-center gap-1 rounded-full bg-line/60 px-2.5 py-0.5 text-xs font-medium text-muted">
                  <CalendarBlank size={12} weight="bold" />
                  {rule.publicationDate}
                </span>
              </div>

              {rule.abstract && (
                <div className="mt-5 rounded-2xl border border-line bg-surface p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                    Abstract
                  </p>
                  <p className="mt-2 text-sm leading-relaxed">{rule.abstract}</p>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
                {rule.docketIds.length > 0 && (
                  <span>Docket: {rule.docketIds.join(", ")}</span>
                )}
                {rule.cfrReferences.length > 0 && (
                  <span>CFR: {rule.cfrReferences.join(", ")}</span>
                )}
                {rule.topics.length > 0 && (
                  <span>Topics: {rule.topics.join(", ")}</span>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={rule.htmlUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
                >
                  Federal Register page
                  <ArrowUpRight size={14} weight="bold" />
                </a>
                {rule.commentable && rule.commentUrl && (
                  <a
                    href={rule.commentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm font-medium text-accent-text hover:underline"
                  >
                    Comment on Regulations.gov
                    <ArrowUpRight size={14} weight="bold" />
                  </a>
                )}
              </div>

              <hr className="my-6 border-line" />

              <div className="space-y-6">
                {rule.sections.map((s, i) => {
                  const label = s.subsection
                    ? `${s.section} — ${s.subsection}`
                    : s.section;
                  return (
                    <section key={i}>
                      {label && (
                        <h3 className="mb-2 text-sm font-semibold tracking-tight">
                          {label}
                          {s.page && (
                            <span className="ml-2 text-xs font-normal text-muted">
                              (p. {s.page})
                            </span>
                          )}
                        </h3>
                      )}
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-foreground/90">
                        {s.text}
                      </p>
                    </section>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
