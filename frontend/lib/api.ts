export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.detail ?? `HTTP ${res.status}`);
  return body as T;
}

import type { RuleFull, RuleRef, SignupPayload, User } from "./types";

export const auth = {
  signup: (payload: SignupPayload) =>
    apiFetch<User>("/auth/signup", { method: "POST", body: JSON.stringify(payload) }),
  login: (email: string, password: string) =>
    apiFetch<User>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => apiFetch<{ message: string }>("/auth/logout", { method: "POST" }),
  me: () => apiFetch<User>("/auth/me"),
  occupations: () =>
    apiFetch<{ occupations: string[]; employmentTypes: string[] }>("/auth/occupations"),
};

export const regulations = {
  list: () => apiFetch<{ rules: RuleRef[] }>("/regulations"),
  get: (documentNumber: string) =>
    apiFetch<RuleFull>(`/regulations/${encodeURIComponent(documentNumber)}`),
};

// EventSource only supports GET, so we POST with fetch and parse the SSE
// frames off the response body ourselves. Credentials are included so
// authenticated streams (e.g. the chat agent) receive the session cookie.
export async function sseFetch(
  path: string,
  body: unknown,
  onEvent: (event: string, data: Record<string, unknown>) => void
): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Backend error (${res.status})`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      let event = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (data) onEvent(event, JSON.parse(data));
    }
  }
}
