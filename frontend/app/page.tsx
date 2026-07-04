"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bank,
  FileText,
  MagnifyingGlass,
  PaperPlaneTilt,
  SignIn,
  SignOut,
  Sparkle,
  Timer,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { sseFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { ChatMessage, RuleRef } from "@/lib/types";
import RuleDrawer from "@/components/RuleDrawer";
import Markdown from "@/components/Markdown";

type UiMessage = ChatMessage & { sources?: RuleRef[] };

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}

function SourceCard({
  rule,
  onOpen,
}: {
  rule: RuleRef;
  onOpen: (documentNumber: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(rule.documentNumber)}
      className="group flex w-full flex-col rounded-xl border border-line bg-surface p-3 text-left transition-all duration-150 hover:border-accent hover:shadow-sm active:translate-y-px"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-medium leading-snug">
          {rule.title}
        </span>
        <FileText
          size={15}
          weight="bold"
          className="mt-0.5 shrink-0 text-muted transition-colors group-hover:text-accent-text"
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="truncate rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-text">
          {rule.agencies[rule.agencies.length - 1] ?? "Federal rule"}
        </span>
        {rule.commentable && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
            <Timer size={11} weight="bold" />
            {rule.commentsCloseOn ? `by ${rule.commentsCloseOn}` : "open"}
          </span>
        )}
        <span className="text-[11px] text-muted">{rule.documentNumber}</span>
      </div>
    </button>
  );
}

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDoc, setOpenDoc] = useState<string | null>(null);

  const openedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const streamAssistant = useCallback(async (outgoing: UiMessage[]) => {
    setStreaming(true);
    setError(null);
    setToolStatus(null);
    setMessages([...outgoing, { role: "assistant", content: "" }]);

    const wire: ChatMessage[] = outgoing.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const updateAssistant = (fn: (m: UiMessage) => UiMessage) =>
      setMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant") next[next.length - 1] = fn(last);
        return next;
      });

    try {
      await sseFetch("/chat", { messages: wire }, (event, d) => {
        if (event === "delta") {
          setToolStatus(null);
          updateAssistant((m) => ({ ...m, content: m.content + (d.text as string) }));
        } else if (event === "tool") {
          const q = d.query as string;
          setToolStatus(q ? `Searching regulations for “${q}”…` : "Searching regulations…");
        } else if (event === "sources") {
          const rules = d.rules as RuleRef[];
          updateAssistant((m) => {
            const byId = new Map<string, RuleRef>();
            for (const r of m.sources ?? []) byId.set(r.documentNumber, r);
            for (const r of rules) byId.set(r.documentNumber, r);
            return { ...m, sources: [...byId.values()] };
          });
        } else if (event === "error") {
          setError(d.error as string);
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStreaming(false);
      setToolStatus(null);
    }
  }, []);

  // Open the session with a personalized regulation report once the user is known.
  useEffect(() => {
    if (authLoading || !user || openedRef.current) return;
    openedRef.current = true;
    streamAssistant([]);
  }, [authLoading, user, streamAssistant]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, toolStatus]);

  function send() {
    const text = input.trim();
    if (!text || streaming) return;
    setInput("");
    streamAssistant([...messages, { role: "user", content: text }]);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <>
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Bank size={22} weight="duotone" className="text-accent-text" />
            <span className="font-semibold tracking-tight">Neptunus</span>
          </Link>
          <div className="flex items-center gap-3">
            {!authLoading &&
              (user ? (
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
              ))}
          </div>
        </div>
      </header>

      {!authLoading && !user ? (
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft">
            <Sparkle size={24} weight="duotone" className="text-accent-text" />
          </div>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight sm:text-3xl">
            Your personal regulatory assistant
          </h1>
          <p className="mt-3 max-w-md text-muted">
            Sign in and Neptunus will pull the latest federal rules that could
            affect you, tailored to your occupation and location, and answer
            your questions about them.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              href="/auth/signup"
              className="rounded-[10px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-hover"
            >
              Get started
            </Link>
            <Link
              href="/auth/login"
              className="rounded-[10px] border border-line bg-surface px-5 py-2.5 text-sm font-semibold transition hover:border-accent"
            >
              Sign in
            </Link>
          </div>
        </main>
      ) : (
        <main className="mx-auto flex w-full max-w-3xl min-h-0 flex-1 flex-col px-5">
          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-8">
            {authLoading && (
              <p className="text-center text-sm text-muted">Loading…</p>
            )}

            {messages.map((m, i) => {
              const isUser = m.role === "user";
              const isLast = i === messages.length - 1;
              const showTyping =
                !isUser && m.content === "" && (streaming || isLast);
              return (
                <div
                  key={i}
                  className="animate-fade-up space-y-3"
                  style={{ animationDelay: `${Math.min(i, 4) * 40}ms` }}
                >
                  <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed sm:max-w-[80%] ${
                        isUser
                          ? "whitespace-pre-wrap bg-accent text-white"
                          : "border border-line bg-surface text-foreground"
                      }`}
                    >
                      {isUser ? (
                        m.content
                      ) : m.content ? (
                        <Markdown content={m.content} />
                      ) : showTyping ? (
                        toolStatus ? (
                          <span className="inline-flex items-center gap-2 text-sm text-muted">
                            <MagnifyingGlass
                              size={15}
                              weight="bold"
                              className="animate-pulse text-accent-text"
                            />
                            {toolStatus}
                          </span>
                        ) : (
                          <TypingDots />
                        )
                      ) : null}
                    </div>
                  </div>

                  {!isUser && m.sources && m.sources.length > 0 && (
                    <div>
                      <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted">
                        Relevant rules · click to read
                      </p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {m.sources.map((r) => (
                          <SourceCard
                            key={r.documentNumber}
                            rule={r}
                            onOpen={setOpenDoc}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {!isUser &&
                    isLast &&
                    streaming &&
                    m.content !== "" &&
                    toolStatus && (
                      <p className="inline-flex items-center gap-2 px-1 text-xs text-muted">
                        <MagnifyingGlass
                          size={13}
                          weight="bold"
                          className="animate-pulse text-accent-text"
                        />
                        {toolStatus}
                      </p>
                    )}
                </div>
              );
            })}

            {error && (
              <div
                role="alert"
                className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
              >
                <WarningCircle size={18} weight="bold" className="mt-0.5 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>

          <div className="sticky bottom-0 bg-background pb-6 pt-2">
            <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 transition-colors focus-within:border-accent">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                rows={1}
                placeholder="Ask about rules, laws, or regulations that affect you…"
                aria-label="Message"
                className="max-h-40 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed outline-none placeholder:text-muted/70"
              />
              <button
                onClick={send}
                disabled={streaming || input.trim().length === 0}
                aria-label="Send message"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-accent text-white transition-all duration-150 hover:bg-accent-hover active:translate-y-px disabled:opacity-40"
              >
                <PaperPlaneTilt size={18} weight="fill" />
              </button>
            </div>
            <p className="mt-2 px-1 text-center text-xs text-muted">
              Neptunus searches current Federal Register proposed rules. It can
              be wrong and does not give legal advice, verify anything important.{" "}
              <a
                href="https://www.regulations.gov"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 underline underline-offset-2"
              >
                Regulations.gov
                <ArrowUpRight size={11} weight="bold" />
              </a>
            </p>
          </div>
        </main>
      )}

      <RuleDrawer documentNumber={openDoc} onClose={() => setOpenDoc(null)} />
    </>
  );
}
