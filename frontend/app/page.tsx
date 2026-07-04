"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ArrowUpRight,
  Bank,
  ChatCircleText,
  Clock,
  FileText,
  Gavel,
  MagnifyingGlass,
  Newspaper,
  PaperPlaneTilt,
  ShieldCheck,
  UsersThree,
} from "@phosphor-icons/react";
import { useAuth } from "@/context/AuthContext";

// ── Demo data (example rules; live rules appear after sign-in) ──────────────────

type Demo = {
  label: string;
  occupation: string;
  agency: string;
  agencyFull: string;
  title: string;
  gist: string;
  affects: string;
  deadline: string;
  docket: string;
};

const DEMOS: Demo[] = [
  {
    label: "Farming",
    occupation: "Agriculture / Farming",
    agency: "EPA",
    agencyFull: "Environmental Protection Agency",
    title: "Application Exclusion Zone Requirements for Agricultural Pesticides",
    gist: "Sets no-spray buffer zones around workers during pesticide application.",
    affects: "Farm operators, farmworkers, applicators",
    deadline: "Aug 21, 2026",
    docket: "EPA-HQ-OPP-2026-0148",
  },
  {
    label: "Trucking",
    occupation: "Transportation / Trucking",
    agency: "FMCSA",
    agencyFull: "Federal Motor Carrier Safety Administration",
    title: "Hours of Service; Electronic Logging Device Requirements",
    gist: "Changes how long you can drive and how each trip must be logged.",
    affects: "Owner-operators, fleet drivers, carriers",
    deadline: "Jul 30, 2026",
    docket: "FMCSA-2026-0072",
  },
  {
    label: "Construction",
    occupation: "Construction",
    agency: "OSHA",
    agencyFull: "Occupational Safety and Health Administration",
    title: "Occupational Exposure to Respirable Crystalline Silica",
    gist: "Lowers the permissible dust exposure limit on job sites.",
    affects: "Contractors, masons, site workers",
    deadline: "Sep 04, 2026",
    docket: "OSHA-2026-0009",
  },
  {
    label: "Healthcare",
    occupation: "Healthcare / Medical",
    agency: "CMS",
    agencyFull: "Centers for Medicare & Medicaid Services",
    title: "Medicare Coverage and Payment for Telehealth Services",
    gist: "Decides which telehealth visits Medicare will keep paying for.",
    affects: "Providers, rural clinics, patients",
    deadline: "Aug 08, 2026",
    docket: "CMS-2026-1784",
  },
  {
    label: "Food & Beverage",
    occupation: "Food & Beverage",
    agency: "FDA",
    agencyFull: "Food and Drug Administration",
    title: "Food Traceability Recordkeeping Requirements",
    gist: "Requires new records tracking food from farm to shelf.",
    affects: "Growers, distributors, grocers, kitchens",
    deadline: "Aug 29, 2026",
    docket: "FDA-2026-N-0553",
  },
  {
    label: "Small Business",
    occupation: "Retail / Small Business",
    agency: "FinCEN",
    agencyFull: "Financial Crimes Enforcement Network",
    title: "Beneficial Ownership Information Reporting Requirements",
    gist: "Requires small companies to report who owns them.",
    affects: "LLCs, sole proprietors, small shops",
    deadline: "Jul 24, 2026",
    docket: "FINCEN-2026-0003",
  },
];

const STEPS = [
  {
    icon: MagnifyingGlass,
    title: "We find the rules that touch your work",
    body: "Every proposed rule open for comment, matched to your occupation and state using the same NAICS industry codes agencies use in their own impact analyses. No wading through hundreds of unrelated notices.",
  },
  {
    icon: FileText,
    title: "We read them so you do not have to",
    body: "A federal rule can run hundreds of pages of legal text. Our AI reads the full Federal Register document and tells you who it affects, what would change, and exactly what the agency is asking the public.",
  },
  {
    icon: PaperPlaneTilt,
    title: "You file a comment that counts",
    body: "Answer a few questions about your situation. We draft a specific, substantive comment in your voice, you approve every word, and it goes straight to Regulations.gov. You get a tracking number back.",
  },
];

const PERSONAS = [
  "Farmers", "Truckers", "Nurses", "Small Business Owners", "Contractors",
  "Ranchers", "Restaurant Owners", "Electricians", "Teachers", "Pharmacists",
  "Home Builders", "Machinists",
];

// ── Page ────────────────────────────────────────────────────────────────────────

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
      <header className="sticky top-0 z-40 border-b border-line bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <Bank size={19} weight="duotone" className="text-accent-text" />
            <span className="text-sm font-semibold tracking-tight">Public Comment Copilot</span>
          </div>
          <nav className="flex items-center gap-1">
            <Link href="/auth/login" className="rounded-[10px] px-3 py-1.5 text-sm text-muted transition hover:text-foreground">
              Sign in
            </Link>
            <Link href="/auth/signup" className="ml-1 rounded-[10px] bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-accent-hover active:scale-[0.98]">
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>

        {/* ── Hero ── */}
        <section className="relative overflow-hidden border-b border-line">
          <div className="hero-grid pointer-events-none absolute inset-0 opacity-60" />
          <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 gap-12 px-5 pb-16 pt-16 lg:grid-cols-[1fr_380px] lg:items-center lg:gap-14 lg:pb-24 lg:pt-24">

            {/* Left */}
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs text-muted">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Live from the Federal Register
              </div>

              <h1 className="max-w-xl text-[2.4rem] font-semibold leading-[1.08] tracking-tight sm:text-5xl sm:leading-[1.05] lg:text-[3.1rem]">
                Federal rules shape your work.{" "}
                <span className="text-accent-text">Shape them back.</span>
              </h1>

              <p className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg">
                We surface the proposed rules that affect your trade, explain them plainly, and help you file an official public comment.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
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
            </div>

            {/* Right - interactive demo */}
            <HeroDemo />
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
          <Reveal className="mb-12 max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-[2rem] sm:leading-tight">
              From an unread legal notice to a comment on the record, in minutes.
            </h2>
          </Reveal>

          <div className="divide-y divide-line border-y border-line">
            {STEPS.map((step, i) => (
              <Reveal key={step.title} delay={i * 90}>
                <div className="grid grid-cols-1 gap-5 py-9 sm:grid-cols-[64px_1fr] sm:gap-8">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft">
                    <step.icon size={22} weight="duotone" className="text-accent-text" />
                  </div>
                  <div className="max-w-2xl">
                    <div className="flex items-baseline gap-3">
                      <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
                      <h3 className="text-lg font-semibold sm:text-xl">{step.title}</h3>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-muted sm:text-base sm:leading-relaxed">{step.body}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ── The legal weight ── */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
            <Reveal className="mx-auto max-w-3xl">
              <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-muted">5 U.S.C. § 553(c)</p>
              <blockquote className="border-l-4 border-accent pl-6 text-xl font-medium leading-relaxed text-foreground sm:text-2xl sm:leading-relaxed">
                &ldquo;The agency shall give interested persons an opportunity to participate in the rule making through submission of written data, views, or arguments.&rdquo;
              </blockquote>
              <p className="mt-6 max-w-xl pl-6 text-sm leading-relaxed text-muted sm:text-base sm:leading-relaxed">
                This is not a suggestion box. Under the Administrative Procedure Act, agencies must read and respond to substantive comments before a rule becomes law. One specific comment from someone who will actually live under the rule carries more weight than ten thousand identical form letters.
              </p>
            </Reveal>
          </div>
        </section>

        {/* ── Trust row ── */}
        <section className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            <TrustCell
              icon={<Newspaper size={20} weight="duotone" className="text-accent-text" />}
              title="Straight from the source"
              body="Rule text comes directly from the official Federal Register API. Nothing paraphrased, nothing second-hand."
            />
            <TrustCell
              icon={<ShieldCheck size={20} weight="duotone" className="text-accent-text" />}
              title="It enters the record"
              body="Comments are filed through the official Regulations.gov API. You get a tracking number and a place in the docket."
            />
            <TrustCell
              icon={<ChatCircleText size={20} weight="duotone" className="text-accent-text" />}
              title="In your own words"
              body="AI drafts from your specific answers. You review and approve every sentence before anything is submitted."
            />
          </div>
        </section>

        {/* ── Who it's for ── */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-center lg:gap-16">
              <Reveal>
                <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                  Built for the people rules are actually written about
                </h2>
                <p className="mt-4 text-sm leading-relaxed text-muted sm:text-base sm:leading-relaxed">
                  Not lobbyists, not law firms. The farmers, drivers, and shop owners who feel a rule the day it takes effect but rarely get a say in it.
                </p>
                <Link
                  href="/auth/signup"
                  className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text transition-all hover:gap-2.5"
                >
                  Start with your occupation
                  <ArrowRight size={14} weight="bold" />
                </Link>
              </Reveal>

              <Reveal delay={120} className="flex flex-wrap gap-2.5">
                {PERSONAS.map((p) => (
                  <span key={p} className="rounded-full border border-line bg-background px-4 py-2 text-sm text-muted">
                    {p}
                  </span>
                ))}
                <span className="rounded-full border border-dashed border-line px-4 py-2 text-sm text-muted opacity-60">
                  and more
                </span>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ── Final CTA ── */}
        <section className="border-t border-line">
          <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
            <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center lg:gap-16">
              <Reveal>
                <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-text">
                  <Gavel size={13} weight="bold" />
                  Your comment becomes part of the federal record
                </div>
                <h2 className="text-3xl font-semibold leading-[1.12] tracking-tight sm:text-[2.6rem] sm:leading-[1.1]">
                  The rules are being written right now. Say something.
                </h2>
              </Reveal>

              <Reveal delay={100} className="flex flex-col gap-4">
                <Link
                  href="/auth/signup"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-[10px] bg-accent px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-accent-hover active:scale-[0.99] sm:w-auto sm:self-start"
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
                  What is Regulations.gov?
                  <ArrowUpRight size={13} weight="bold" />
                </a>
                <p className="text-xs leading-relaxed text-muted">
                  Free for individuals. No credit card. Comments go directly to Regulations.gov, never through us.
                </p>
              </Reveal>
            </div>
          </div>
        </section>

      </main>

      {/* ── Footer ── */}
      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-5 py-8 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Bank size={15} weight="duotone" className="text-accent-text" />
            <span className="text-xs font-medium text-muted">Public Comment Copilot</span>
          </div>
          <p className="max-w-lg text-xs leading-relaxed text-muted">
            Under 5 U.S.C. § 553, federal agencies must consider substantive public comments before finalizing a rule. Not affiliated with any federal agency or with Regulations.gov.
          </p>
        </div>
      </footer>

    </div>
  );
}

// ── Hero demo ───────────────────────────────────────────────────────────────────

function HeroDemo() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setActive((a) => (a + 1) % DEMOS.length), 3400);
    return () => clearInterval(id);
  }, [paused]);

  const d = DEMOS[active];

  return (
    <div className="w-full">
      <p className="mb-3 text-xs font-medium text-muted">I work in&hellip;</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {DEMOS.map((demo, i) => (
          <button
            key={demo.label}
            onClick={() => { setActive(i); setPaused(true); }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              i === active
                ? "border-accent bg-accent text-white"
                : "border-line bg-surface text-muted hover:border-foreground hover:text-foreground"
            }`}
          >
            {demo.label}
          </button>
        ))}
      </div>

      {/* Federal Register notice card */}
      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
        <div className="flex h-1.5 w-full">
          <div className="flex-1 bg-red-700" />
          <div className="flex-1 bg-zinc-100" />
          <div className="flex-1 bg-accent" />
        </div>

        <div key={active} className="animate-fade-in p-5">
          <div className="mb-4 flex items-center justify-between border-b border-line pb-3">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Federal Register
            </p>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent-text">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-text" />
              Open for comment
            </span>
          </div>

          <p className="font-mono text-[10px] uppercase tracking-widest text-muted">{d.agency}</p>
          <p className="mt-0.5 text-[13px] font-medium leading-snug">{d.agencyFull}</p>

          <h3 className="mt-3 text-[15px] font-semibold leading-snug">{d.title}</h3>
          <p className="mt-2 text-xs leading-relaxed text-muted">{d.gist}</p>

          <div className="mt-4 space-y-2.5 border-t border-line pt-4">
            <div className="flex items-start gap-2">
              <UsersThree size={14} className="mt-0.5 shrink-0 text-muted" />
              <p className="text-xs text-foreground">{d.affects}</p>
            </div>
            <div className="flex items-center gap-2">
              <Clock size={14} className="shrink-0 text-muted" />
              <p className="text-xs text-foreground">
                Comments close <span className="font-medium">{d.deadline}</span>
              </p>
            </div>
          </div>

          <Link
            href="/auth/signup"
            className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-accent px-3 py-2 text-xs font-semibold text-white transition hover:bg-accent-hover"
          >
            Read it &amp; draft my comment
            <ArrowRight size={12} weight="bold" />
          </Link>
        </div>

        <div className="border-t border-line bg-background/60 px-5 py-2">
          <p className="font-mono text-[9px] text-muted">
            Example &middot; {d.docket} &middot; your real rules appear after sign-in
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Trust cell ──────────────────────────────────────────────────────────────────

function TrustCell({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="bg-surface p-6">
      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft">
        {icon}
      </div>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}

// ── Scroll reveal ───────────────────────────────────────────────────────────────

function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reveal on scroll. Under prefers-reduced-motion, globals.css collapses the
    // transition to ~0ms, so this becomes an instant show with no animation.
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] ${
        shown ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
