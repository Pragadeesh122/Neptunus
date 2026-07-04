"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Bank,
  BookOpen,
  ChatsCircle,
  MagnifyingGlass,
  PaperPlaneTilt,
  Scales,
  ShieldCheck,
  Sparkle,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";

const MOCK_RULES = [
  { agency: "EPA", title: "Clean Air Act — Revised Emission Standards for Heavy-Duty Vehicles", days: 18 },
  { agency: "USDA", title: "National Organic Program — Livestock Handling Requirements", days: 6 },
  { agency: "DOL", title: "Overtime Rule — Salary Threshold for Exempt Employees", days: 31 },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    icon: <MagnifyingGlass size={22} weight="bold" />,
    title: "Find rules that affect you",
    body: "Browse current proposed rules filtered to your occupation and state. We surface what's actually relevant to your life — not a firehose of legalese.",
  },
  {
    step: "02",
    icon: <BookOpen size={22} weight="bold" />,
    title: "Understand them in plain English",
    body: "Our AI reads the full Federal Register text and gives you a concise summary: who it affects, what changes, and what the agency is asking.",
  },
  {
    step: "03",
    icon: <PaperPlaneTilt size={22} weight="bold" />,
    title: "Draft and submit your comment",
    body: "Answer a few questions about your situation. We draft a substantive, personalized comment — not a form letter — and submit it directly to Regulations.gov.",
  },
];

const FEATURES = [
  {
    icon: <Sparkle size={20} weight="fill" className="text-accent-text" />,
    title: "Personalized to you",
    body: "Your occupation, employment type, and location map to NAICS industry codes, surfacing only the rules that are genuinely relevant.",
  },
  {
    icon: <Scales size={20} weight="fill" className="text-accent-text" />,
    title: "Legally meaningful",
    body: "Under 5 U.S.C. § 553, agencies must address every substantive comment. One specific, well-reasoned comment outweighs thousands of form letters.",
  },
  {
    icon: <ShieldCheck size={20} weight="fill" className="text-accent-text" />,
    title: "Official API submission",
    body: "Comments go straight to Regulations.gov via their official API. You get a tracking number. The agency sees it. It counts.",
  },
  {
    icon: <ChatsCircle size={20} weight="fill" className="text-accent-text" />,
    title: "Your words, not ours",
    body: "The AI drafts based on your answers. You review and edit before anything is sent. Your comment reflects your real situation.",
  },
];

const STATS = [
  { value: "20,000+", label: "proposed rules per year" },
  { value: "90 days", label: "average comment window" },
  { value: "5 U.S.C. § 553", label: "your legal right to be heard" },
];

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/app");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col">
      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-line bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2.5">
            <Bank size={22} weight="duotone" className="text-accent-text" />
            <span className="font-semibold tracking-tight">Public Comment Copilot</span>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              href="/auth/login"
              className="px-3 py-1.5 text-sm text-muted transition-colors hover:text-foreground"
            >
              Sign in
            </Link>
            <Link
              href="/auth/signup"
              className="rounded-[10px] bg-accent px-4 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover"
            >
              Get started free
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex flex-col">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          {/* dot grid */}
          <div className="hero-grid absolute inset-0 opacity-40" />
          {/* radial fade over grid */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,var(--accent-soft),transparent)]" />

          <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-5 py-20 sm:py-28 lg:grid-cols-2 lg:items-center lg:gap-8">
            {/* Left: copy */}
            <div className="animate-fade-up">
              <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
                <Sparkle size={12} weight="fill" className="text-accent-text" />
                Powered by the official Federal Register API
              </span>
              <h1 className="text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                Your voice in{" "}
                <span className="text-accent-text">federal</span>{" "}
                rulemaking.
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-muted sm:text-lg">
                Agencies write rules that affect your job, your business, your community.
                We make it easy to understand them — and harder to ignore you.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover active:translate-y-px"
                >
                  Create free account
                  <ArrowRight size={16} weight="bold" />
                </Link>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-6 py-3 text-sm font-semibold transition hover:border-foreground active:translate-y-px"
                >
                  Sign in
                </Link>
              </div>
            </div>

            {/* Right: floating mock rule cards */}
            <div className="relative hidden lg:flex lg:flex-col lg:gap-3" aria-hidden>
              {MOCK_RULES.map((r, i) => (
                <div
                  key={r.title}
                  className={`rounded-2xl border border-line bg-surface p-4 shadow-sm ${
                    i === 0 ? "animate-float ml-8" : i === 1 ? "animate-float-b" : "animate-float-c ml-8"
                  }`}
                  style={{ opacity: 1 - i * 0.12 }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium leading-snug">{r.title}</p>
                    <ArrowUpRight size={14} weight="bold" className="mt-0.5 shrink-0 text-muted" />
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent-text">
                      {r.agency}
                    </span>
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.days <= 7 ? "bg-red-50 text-red-700" : "bg-line/60 text-muted"}`}>
                      {r.days}d left
                    </span>
                  </div>
                </div>
              ))}
              {/* glow */}
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-64 w-64 rounded-full bg-accent/10 blur-3xl" />
            </div>
          </div>
        </section>

        {/* ── Stats bar ── */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid w-full max-w-6xl grid-cols-1 divide-y divide-line px-5 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
            {STATS.map((s) => (
              <div key={s.label} className="flex flex-col items-center py-8 text-center">
                <span className="text-3xl font-semibold tracking-tight text-foreground">{s.value}</span>
                <span className="mt-1 text-sm text-muted">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:py-24">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-widest text-accent-text">How it works</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Three steps to make your voice heard
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((item, i) => (
              <div
                key={item.step}
                className="animate-fade-up rounded-2xl border border-line bg-surface p-6"
                style={{ animationDelay: `${i * 100}ms` }}
              >
                <div className="flex items-start justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[10px] bg-accent-soft text-accent-text">
                    {item.icon}
                  </div>
                  <span className="font-mono text-4xl font-bold text-line">{item.step}</span>
                </div>
                <h3 className="mt-4 font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Features ── */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:py-24">
            <div className="mb-12 text-center">
              <p className="text-xs font-semibold uppercase tracking-widest text-accent-text">Features</p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Built for real people, not lobbyists
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-muted">
                Big corporations have teams of lawyers writing comments. Now you have something better.
              </p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {FEATURES.map((f, i) => (
                <div
                  key={f.title}
                  className="animate-fade-up rounded-2xl border border-line p-5"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-soft">
                    {f.icon}
                  </div>
                  <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:py-28">
            <div className="relative overflow-hidden rounded-2xl bg-accent px-8 py-16 text-center sm:px-16">
              {/* subtle pattern */}
              <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: "radial-gradient(white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
              <div className="relative">
                <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Your representatives must listen.
                </h2>
                <p className="mx-auto mt-4 max-w-lg text-base text-blue-100">
                  Federal agencies are legally required to respond to substantive public comments. That&apos;s you.
                  Create a free account and make your first comment in minutes.
                </p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                  <Link
                    href="/auth/signup"
                    className="inline-flex items-center gap-2 rounded-[10px] bg-white px-8 py-3 text-sm font-semibold text-accent shadow-sm transition hover:bg-blue-50 active:translate-y-px"
                  >
                    Create free account
                    <ArrowRight size={16} weight="bold" />
                  </Link>
                  <a
                    href="https://www.regulations.gov"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-200 transition hover:text-white"
                  >
                    Learn about Regulations.gov
                    <ArrowUpRight size={14} weight="bold" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="mt-auto border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-5 py-8">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <Bank size={16} weight="duotone" className="text-accent-text" />
              <span className="text-sm font-medium">Public Comment Copilot</span>
            </div>
            <p className="max-w-md text-xs leading-relaxed text-muted">
              Under 5 U.S.C. § 553, federal agencies must consider substantive public comments before finalizing a proposed rule.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
