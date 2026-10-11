export type Provider = "openai" | "anthropic" | "google" | "openrouter";
export type Settings = { chatModel: string | null; systemPrompt: string | null; credentials: { provider: Provider; last4: string; status: "ok" | "invalid" }[] };
export const MODEL_OPTIONS = [
  "workers-ai:@cf/qwen/qwen3.8-27b", "workers-ai:@cf/qwen/qwen3-30b-a3b-fp8",
  "openai:gpt-4.1-mini", "openai:gpt-4.1", "anthropic:claude-sonnet-4-5", "anthropic:claude-haiku-4-5",
  "google:gemini-2.5-flash", "google:gemini-2.5-pro", "openrouter:openai/gpt-4.1-mini", "openrouter:anthropic/claude-sonnet-4.5",
];
export function availableModels(settings?: Settings) {
  const models = MODEL_OPTIONS.filter((model) => model.startsWith("workers-ai:") || settings?.credentials.some((row) => row.status === "ok" && model.startsWith(`${row.provider}:`)));
  if (settings?.chatModel && !models.includes(settings.chatModel) && settings.credentials.some((row) => row.status === "ok" && settings.chatModel?.startsWith(`${row.provider}:`))) models.push(settings.chatModel);
  return models;
}
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
