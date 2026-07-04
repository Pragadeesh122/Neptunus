"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  EnvelopeSimple,
  LockSimple,
  MapPin,
  Plus,
  Trash,
  User,
  WarningCircle,
} from "@phosphor-icons/react";
import { auth } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const US_STATES = [
  ["AL","Alabama"],["AK","Alaska"],["AZ","Arizona"],["AR","Arkansas"],["CA","California"],
  ["CO","Colorado"],["CT","Connecticut"],["DE","Delaware"],["FL","Florida"],["GA","Georgia"],
  ["HI","Hawaii"],["ID","Idaho"],["IL","Illinois"],["IN","Indiana"],["IA","Iowa"],
  ["KS","Kansas"],["KY","Kentucky"],["LA","Louisiana"],["ME","Maine"],["MD","Maryland"],
  ["MA","Massachusetts"],["MI","Michigan"],["MN","Minnesota"],["MS","Mississippi"],["MO","Missouri"],
  ["MT","Montana"],["NE","Nebraska"],["NV","Nevada"],["NH","New Hampshire"],["NJ","New Jersey"],
  ["NM","New Mexico"],["NY","New York"],["NC","North Carolina"],["ND","North Dakota"],["OH","Ohio"],
  ["OK","Oklahoma"],["OR","Oregon"],["PA","Pennsylvania"],["RI","Rhode Island"],["SC","South Carolina"],
  ["SD","South Dakota"],["TN","Tennessee"],["TX","Texas"],["UT","Utah"],["VT","Vermont"],
  ["VA","Virginia"],["WA","Washington"],["WV","West Virginia"],["WI","Wisconsin"],["WY","Wyoming"],
  ["DC","District of Columbia"],
] as const;

type Step = 1 | 2 | 3;

type FormData = {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  city: string;
  state: string;
  zipCode: string;
  occupation: string;
  employmentType: string;
  customInfo: { key: string; value: string }[];
};

const EMPTY: FormData = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
  city: "",
  state: "",
  zipCode: "",
  occupation: "",
  employmentType: "",
  customInfo: [],
};

export default function SignupPage() {
  const { refresh } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(EMPTY);
  const [occupations, setOccupations] = useState<string[]>([]);
  const [employmentTypes, setEmploymentTypes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    auth.occupations().then(({ occupations: o, employmentTypes: e }) => {
      setOccupations(o);
      setEmploymentTypes(e);
    });
  }, []);

  function set<K extends keyof FormData>(key: K, value: FormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function addCustomField() {
    set("customInfo", [...form.customInfo, { key: "", value: "" }]);
  }

  function updateCustomField(idx: number, field: "key" | "value", val: string) {
    const next = form.customInfo.map((item, i) =>
      i === idx ? { ...item, [field]: val } : item
    );
    set("customInfo", next);
  }

  function removeCustomField(idx: number) {
    set("customInfo", form.customInfo.filter((_, i) => i !== idx));
  }

  async function handleSubmit() {
    setError(null);
    setLoading(true);
    try {
      const customInfo = Object.fromEntries(
        form.customInfo.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value])
      );
      await auth.signup({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        city: form.city,
        state: form.state,
        zipCode: form.zipCode,
        occupation: form.occupation,
        employmentType: form.employmentType,
        customInfo,
      });
      await refresh();
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Signup failed");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="mt-1 text-sm text-muted">Step {step} of 3</p>
        </div>

        {/* Step indicators */}
        <div className="mb-6 flex gap-1.5">
          {([1, 2, 3] as Step[]).map((s) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full transition-colors ${
                s <= step ? "bg-accent" : "bg-line"
              }`}
            />
          ))}
        </div>

        <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-[10px] border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
              <WarningCircle size={16} weight="fill" className="shrink-0" />
              {error}
            </div>
          )}

          {step === 1 && (
            <Step1 form={form} set={set} onNext={() => setStep(2)} />
          )}
          {step === 2 && (
            <Step2
              form={form}
              set={set}
              occupations={occupations}
              employmentTypes={employmentTypes}
              onBack={() => setStep(1)}
              onNext={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3
              form={form}
              onBack={() => setStep(2)}
              onAddField={addCustomField}
              onUpdateField={updateCustomField}
              onRemoveField={removeCustomField}
              onSubmit={handleSubmit}
              loading={loading}
            />
          )}
        </div>

        <p className="mt-6 text-center text-sm text-muted">
          Already have an account?{" "}
          <Link href="/auth/login" className="text-accent-text underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

// ── Step 1: credentials + name ────────────────────────────────────────────────
function Step1({
  form,
  set,
  onNext,
}: {
  form: FormData;
  set: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  onNext: () => void;
}) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SectionLabel icon={<User size={14} />}>Your name</SectionLabel>
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name">
          <input
            required
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            placeholder="Jane"
            className={inputCls}
          />
        </Field>
        <Field label="Last name">
          <input
            required
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            placeholder="Smith"
            className={inputCls}
          />
        </Field>
      </div>

      <SectionLabel icon={<EnvelopeSimple size={14} />}>Account credentials</SectionLabel>
      <Field label="Email address">
        <input
          type="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          placeholder="you@example.com"
          className={inputCls}
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={form.password}
          onChange={(e) => set("password", e.target.value)}
          placeholder="8+ characters"
          className={inputCls}
        />
      </Field>

      <NextButton />
    </form>
  );
}

// ── Step 2: address + occupation ──────────────────────────────────────────────
function Step2({
  form,
  set,
  occupations,
  employmentTypes,
  onBack,
  onNext,
}: {
  form: FormData;
  set: <K extends keyof FormData>(k: K, v: FormData[K]) => void;
  occupations: string[];
  employmentTypes: string[];
  onBack: () => void;
  onNext: () => void;
}) {
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onNext();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <SectionLabel icon={<MapPin size={14} />}>Your location</SectionLabel>
      <Field label="City">
        <input
          required
          value={form.city}
          onChange={(e) => set("city", e.target.value)}
          placeholder="Chicago"
          className={inputCls}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="State">
          <select
            required
            value={form.state}
            onChange={(e) => set("state", e.target.value)}
            className={inputCls}
          >
            <option value="">Select…</option>
            {US_STATES.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="ZIP code">
          <input
            required
            value={form.zipCode}
            onChange={(e) => set("zipCode", e.target.value)}
            placeholder="60601"
            pattern="^\d{5}(-\d{4})?$"
            className={inputCls}
          />
        </Field>
      </div>

      <SectionLabel icon={<User size={14} />}>Your occupation</SectionLabel>
      <Field label="Industry / occupation">
        <select
          required
          value={form.occupation}
          onChange={(e) => set("occupation", e.target.value)}
          className={inputCls}
        >
          <option value="">Select…</option>
          {occupations.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Employment type">
        <select
          required
          value={form.employmentType}
          onChange={(e) => set("employmentType", e.target.value)}
          className={inputCls}
        >
          <option value="">Select…</option>
          {employmentTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2 pt-1">
        <BackButton onClick={onBack} />
        <NextButton />
      </div>
    </form>
  );
}

// ── Step 3: custom info ───────────────────────────────────────────────────────
function Step3({
  form,
  onBack,
  onAddField,
  onUpdateField,
  onRemoveField,
  onSubmit,
  loading,
}: {
  form: FormData;
  onBack: () => void;
  onAddField: () => void;
  onUpdateField: (idx: number, field: "key" | "value", val: string) => void;
  onRemoveField: (idx: number) => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Custom personal info</p>
        <p className="mt-0.5 text-xs text-muted">
          Add any extra details you&apos;d like us to know — e.g. &ldquo;industry: commercial
          trucking&rdquo; or &ldquo;licenses: CDL&rdquo;. These help personalise your comment
          drafts.
        </p>
      </div>

      <div className="space-y-2">
        {form.customInfo.map((item, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              value={item.key}
              onChange={(e) => onUpdateField(idx, "key", e.target.value)}
              placeholder="Label"
              className={`${inputCls} flex-1`}
            />
            <input
              value={item.value}
              onChange={(e) => onUpdateField(idx, "value", e.target.value)}
              placeholder="Value"
              className={`${inputCls} flex-[2]`}
            />
            <button
              type="button"
              onClick={() => onRemoveField(idx)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-line text-muted transition hover:border-red-300 hover:text-red-500"
            >
              <Trash size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onAddField}
        className="flex items-center gap-1.5 text-sm text-accent-text hover:underline"
      >
        <Plus size={14} weight="bold" />
        Add a field
      </button>

      <div className="flex gap-2 pt-1">
        <BackButton onClick={onBack} />
        <button
          type="button"
          onClick={onSubmit}
          disabled={loading}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover disabled:opacity-50"
        >
          {loading ? "Creating account…" : "Create account"}
        </button>
      </div>
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────────────────
const inputCls =
  "w-full rounded-[10px] border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted">{label}</label>
      {children}
    </div>
  );
}

function SectionLabel({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
      {icon}
      {children}
    </p>
  );
}

function NextButton() {
  return (
    <button
      type="submit"
      className="flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent-hover"
    >
      Continue
      <ArrowRight size={15} weight="bold" />
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-center gap-1.5 rounded-[10px] border border-line px-4 py-2.5 text-sm font-medium text-muted transition hover:border-foreground hover:text-foreground"
    >
      <ArrowLeft size={15} weight="bold" />
      Back
    </button>
  );
}
