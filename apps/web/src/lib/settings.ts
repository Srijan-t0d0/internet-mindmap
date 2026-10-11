export type Provider = "openai" | "anthropic" | "google" | "openrouter";
export type Settings = { chatModel: string | null; systemPrompt: string | null; credentials: { provider: Provider; last4: string; status: "ok" | "invalid" }[] };
export async function settingsRequest(path = "", init?: RequestInit) {
  const res = await fetch(`/api/settings${path}`, { ...init, credentials: "include", headers: { "Content-Type": "application/json" } });
  if (!res.ok) {
    let message = "Settings request failed. Please try again.";
    try { const data = await res.json() as { error?: unknown }; if (typeof data.error === "string") message = data.error; } catch { /* safe generic error */ }
    throw new Error(message);
  }
  return res.json();
}
export const settingsQuery = { queryKey: ["settings"], queryFn: async (): Promise<Settings> => await settingsRequest() as Settings, staleTime: 30_000 };
