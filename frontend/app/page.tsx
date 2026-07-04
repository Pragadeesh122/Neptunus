"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Bank,
  Gavel,
  Newspaper,
  Scales,
  Sparkle,
  UsersThree,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";

// ── Data ───────────────────────────────────────────────────────────────────────

const PERSONAS = [
  "Farmers", "Truckers", "Healthcare Workers", "Small Business Owners",
  "Construction Contractors", "Environmental Advocates", "Teachers",
  "Restaurant Owners", "Manufacturers", "Ranchers",
];

const STEPS = [
  {
    n: "01",
    title: "Find rules that matter to you",
    body: "Browse proposed rules currently open for comment, filtered to your occupation and state. We surface what's actually relevant — not hundreds of pages of legal notices.",
    aside: "Powered by the official Federal Register API",
  },
  {
    n: "02",
    title: "Read them in plain English",
    body: "Our AI reads the full Federal Register text — sometimes hundreds of pages — and tells you who it affects, what changes, and what the agency is asking for.",
    aside: "No legal training needed",
  },
  {
    n: "03",
    title: "Draft and submit your comment",
    body: "Answer a few questions about your situation. We write a substantive, specific comment — not a form letter — and submit it directly to Regulations.gov via their official API.",
    aside: "You review and approve before anything is sent",
  },
];

// ── Page ───────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/app");
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-accent" />
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col bg-background text-foreground">

      {/* ── Nav ── */}
      <header className="sticky top-0 z-40 border-b border-line bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <Bank size={18} weight="duotone" className="text-accent-text" />
            <span className="text-sm font-semibold tracking-tight">Public Comment Copilot</span>
          </div>
          <nav className="flex items-center gap-1">
            <Link href="/auth/login" className="rounded-[8px] px-3 py-1.5 text-sm text-muted transition hover:text-foreground">
              Sign in
            </Link>
            <Link href="/auth/signup" className="ml-1 rounded-[8px] bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>

        {/* ── Hero ── */}
        <section className="mx-auto w-full max-w-6xl px-5 pb-16 pt-16 sm:pb-20 sm:pt-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_auto] lg:gap-16 lg:items-start">

            {/* Left — editorial headline */}
            <div className="max-w-2xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Federal Register API · Live proposed rules
              </div>

              <h1 className="text-[2.75rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.5rem]">
                Federal rules affect<br />
                your life.{" "}
                <span className="text-accent-text">You have<br />
                the right to respond.</span>
              </h1>

              <p className="mt-5 max-w-lg text-base leading-relaxed text-muted sm:text-lg">
                Agencies write thousands of rules each year — about your industry, your land, your workplace, your costs.
                Most people never respond. We make it possible for anyone to engage, meaningfully.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center gap-2 rounded-[10px] bg-accent px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover active:scale-[0.99]"
                >
                  Create free account
                  <ArrowRight size={15} weight="bold" />
                </Link>
                <Link
                  href="/auth/login"
                  className="inline-flex items-center gap-2 rounded-[10px] border border-line bg-surface px-5 py-2.5 text-sm font-semibold text-muted transition hover:border-foreground hover:text-foreground"
                >
                  Sign in
                </Link>
              </div>

              {/* Trust footnote */}
              <p className="mt-5 flex items-center gap-1.5 text-xs text-muted">
                <Sparkle size={12} className="text-accent-text" />
                No credit card · Comments go directly to Regulations.gov · Free forever for individuals
              </p>
            </div>

            {/* Right — Federal Register notice card */}
            <div className="hidden lg:block lg:w-[340px] lg:shrink-0">
              <FederalRegisterCard />
            </div>
          </div>
        </section>

        {/* ── The Law ── */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-16">
            <div className="mx-auto max-w-3xl">
              <p className="mb-3 font-mono text-xs uppercase tracking-widest text-muted">5 U.S.C. § 553(c)</p>
              <blockquote className="border-l-4 border-accent pl-5 text-lg font-medium leading-relaxed text-foreground sm:text-xl sm:leading-relaxed">
                &ldquo;…the agency shall give interested persons an opportunity to participate in the rule making through submission of written data, views, or arguments…&rdquo;
              </blockquote>
              <p className="mt-4 max-w-xl pl-5 text-sm leading-relaxed text-muted">
                The Administrative Procedure Act requires federal agencies to read and respond to substantive comments. One specific, well-reasoned comment from someone directly affected carries more legal weight than ten thousand form letters.
              </p>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
          <div className="mb-10 flex items-baseline justify-between gap-4 border-b border-line pb-5">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
            <span className="font-mono text-xs text-muted">Three steps</span>
          </div>

          <div className="divide-y divide-line">
            {STEPS.map((step) => (
              <div key={step.n} className="grid grid-cols-1 gap-4 py-8 sm:grid-cols-[80px_1fr_220px] sm:gap-8 sm:items-start">
                <div className="font-mono text-4xl font-bold text-line leading-none">{step.n}</div>
                <div>
                  <h3 className="text-base font-semibold sm:text-lg">{step.title}</h3>
                  <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">{step.body}</p>
                </div>
                <div className="hidden sm:flex sm:items-start sm:pt-0.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-background px-3 py-1 text-xs text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-text shrink-0" />
                    {step.aside}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Who it's for ── */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-5 py-14 sm:py-16">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr_1.4fr] lg:items-center lg:gap-14">
              <div>
                <p className="mb-1 font-mono text-xs uppercase tracking-widest text-muted">Built for</p>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Real people with real stakes in the outcome
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-muted">
                  We match proposed rules to your occupation and location using the same NAICS industry codes agencies use in their regulatory impact analyses. You see what&apos;s relevant to you — nothing else.
                </p>
                <Link
                  href="/auth/signup"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text transition hover:gap-2.5"
                >
                  Start with your occupation
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </div>

              <div className="flex flex-wrap gap-2">
                {PERSONAS.map((p) => (
                  <span key={p} className="rounded-full border border-line bg-background px-3.5 py-1.5 text-sm text-muted">
                    {p}
                  </span>
                ))}
                <span className="rounded-full border border-dashed border-line px-3.5 py-1.5 text-sm text-muted opacity-60">
                  and more…
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── Trust grid ── */}
        <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
          <div className="grid gap-4 sm:grid-cols-3">
            <TrustCard
              icon={<Newspaper size={20} weight="duotone" className="text-accent-text" />}
              label="Official data only"
              body="Rule text comes directly from the Federal Register API. No paraphrasing, no summaries from third-party databases."
            />
            <TrustCard
              icon={<Scales size={20} weight="duotone" className="text-accent-text" />}
              label="Legally meaningful submissions"
              body="Comments are submitted through the official Regulations.gov commenting API. You get a tracking number. It enters the administrative record."
            />
            <TrustCard
              icon={<UsersThree size={20} weight="duotone" className="text-accent-text" />}
              label="Your comment, not ours"
              body="AI drafts based on your specific answers. You review and approve every word before submission. Your signature, your views."
            />
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center lg:gap-16">
              <div>
                <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-medium text-accent-text">
                  <Gavel size={13} weight="bold" />
                  Your comment becomes part of the federal record
                </div>
                <h2 className="text-3xl font-semibold leading-[1.15] tracking-tight sm:text-4xl">
                  Agencies are legally required to respond to yours.
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-muted">
                  A comment that explains real impact — from a real person who will be affected — is the most powerful input the public has in the rulemaking process. Use it.
                </p>
              </div>

              <div className="flex flex-col gap-4 lg:items-start">
                <Link
                  href="/auth/signup"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover active:scale-[0.99] lg:w-auto lg:justify-start"
                >
                  Create your free account
                  <ArrowRight size={15} weight="bold" />
                </Link>
                <a
                  href="https://www.regulations.gov"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted transition hover:text-foreground"
                >
                  Learn about Regulations.gov
                  <ArrowUpRight size={13} weight="bold" />
                </a>
                <p className="text-xs text-muted">
                  Free for individuals. No credit card required. Comments go directly to Regulations.gov — not to us.
                </p>
              </div>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="mt-auto border-t border-line">
        <div className="mx-auto w-full max-w-6xl px-5 py-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Bank size={15} weight="duotone" className="text-accent-text" />
              <span className="text-xs font-medium text-muted">Public Comment Copilot</span>
            </div>
            <p className="max-w-lg text-xs leading-relaxed text-muted">
              Under 5 U.S.C. § 553, federal agencies must consider substantive public comments before finalizing a proposed rule.
              This tool is not affiliated with any federal agency or with Regulations.gov.
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}

// ── Components ─────────────────────────────────────────────────────────────────

function FederalRegisterCard() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      {/* Color stripe — mimics the official FR cover */}
      <div className="flex h-1.5 w-full">
        <div className="flex-1 bg-red-600" />
        <div className="flex-1 bg-white" />
        <div className="flex-1 bg-blue-700" />
      </div>

      <div className="p-5">
        <div className="mb-4 border-b border-line pb-4">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-widest text-muted">
            Federal Register
          </p>
          <p className="font-mono text-[10px] text-muted">Vol. 90, No. 127 · Open for Comment</p>
        </div>

        <div className="space-y-3.5">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted">Agency</p>
            <p className="mt-0.5 text-sm font-medium">Dept. of Labor / OSHA</p>
          </div>
          <div>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted">Subject</p>
            <p className="mt-0.5 text-sm font-medium leading-snug">
              Heat Injury and Illness Prevention in Outdoor and Indoor Work Settings
            </p>
          </div>
          <div className="flex gap-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted">Posted</p>
              <p className="mt-0.5 font-mono text-xs">2025-07-01</p>
            </div>
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-muted">Comment Deadline</p>
              <p className="mt-0.5 font-mono text-xs text-red-600 dark:text-red-400">2025-08-14</p>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-text">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
              Open · 44 days left
            </span>
            <span className="font-mono text-[9px] text-muted">OSHA-2021-0009</span>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            This rule would require employers to develop heat prevention plans and provide water, rest breaks, and shade to workers exposed to high heat.
          </p>
        </div>

        <Link
          href="/auth/signup"
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-line bg-background px-3 py-2 text-xs font-medium text-foreground transition hover:border-accent hover:text-accent-text"
        >
          Read full rule & draft your comment
          <ArrowRight size={12} weight="bold" />
        </Link>
      </div>

      <div className="border-t border-line bg-background/60 px-5 py-2.5">
        <p className="font-mono text-[9px] text-muted">Example rule — real rules shown after sign-in</p>
      </div>
    </div>
  );
}

function TrustCard({ icon, label, body }: { icon: React.ReactNode; label: string; body: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-5">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-[10px] bg-accent-soft">
        {icon}
      </div>
      <p className="text-sm font-semibold">{label}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
