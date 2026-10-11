import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { APICallError, RetryError, type LanguageModel } from "ai";
import { and, eq } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../../bindings";
import { getDb } from "../../db/client";
import { userSettings, userProviderCredentials, type ChatProvider } from "../../db/schema";
import { decryptProviderKey } from "../../lib/crypto";
import { createChatModel } from "./chat-model";
import { DEFAULT_MODELS, getModels } from "./models";

export const WORKERS_CHAT_MODELS = [DEFAULT_MODELS.synthesis, DEFAULT_MODELS.auxiliary];
export const CHAT_PROVIDERS = ["openai", "anthropic", "google", "openrouter"] as const;
export function parseChatModel(model: unknown): { provider: "workers-ai" | ChatProvider; id: string } {
  if (typeof model !== "string" || model.length > 200 || !/^[a-z-]+:[\w@./-]+$/.test(model))
    throw new HTTPException(400, { message: "Invalid model ID (use provider:model)" });
  const [provider, ...parts] = model.split(":");
  const id = parts.join(":");
  if (provider === "workers-ai" && WORKERS_CHAT_MODELS.includes(id as typeof DEFAULT_MODELS.synthesis)) return { provider, id };
  if (CHAT_PROVIDERS.includes(provider as ChatProvider)) return { provider: provider as ChatProvider, id };
  throw new HTTPException(400, { message: "Model is not allowed" });
}
export async function validateChatModel(env: Env, userId: string, model: unknown) {
  const parsed = parseChatModel(model);
  if (parsed.provider !== "workers-ai") {
    const rows = userId === "agent" ? [] : await getDb(env).select({ id: userProviderCredentials.id }).from(userProviderCredentials)
      .where(and(eq(userProviderCredentials.userId, userId), eq(userProviderCredentials.provider, parsed.provider), eq(userProviderCredentials.status, "ok")));
    if (!rows.length) throw new HTTPException(400, { message: "Connect a valid provider key before selecting this model" });
  }
  return parsed;
}
export async function getChatModel(env: Env, userId: string, requested?: string): Promise<{ model: LanguageModel; modelId: string; systemPrompt: string | null }> {
  const [settings] = userId === "agent" ? [] : await getDb(env).select().from(userSettings).where(eq(userSettings.userId, userId));
  const chosen = requested ?? settings?.chatModel;
  const modelId = chosen ?? `workers-ai:${getModels(env).synthesis}`;
  // The deployment's Workers override is trusted; user-controlled selections aren't.
  const parsed = chosen ? await validateChatModel(env, userId, chosen) : { provider: "workers-ai" as const, id: getModels(env).synthesis };
  let model: LanguageModel;
  if (parsed.provider === "workers-ai") model = createChatModel(env.AI, parsed.id);
  else {
    const [credential] = await getDb(env).select().from(userProviderCredentials).where(and(
      eq(userProviderCredentials.userId, userId), eq(userProviderCredentials.provider, parsed.provider), eq(userProviderCredentials.status, "ok")));
    if (!credential) throw new Error("Provider key is unavailable");
    const apiKey = await decryptProviderKey(env, userId, parsed.provider, credential);
    // Explicit key only, no gateway or fallback to application credentials.
    switch (parsed.provider) {
      case "openai": model = createOpenAI({ apiKey })(parsed.id); break;
      case "anthropic": model = createAnthropic({ apiKey })(parsed.id); break;
      case "google": model = createGoogleGenerativeAI({ apiKey })(parsed.id); break;
      case "openrouter": model = createOpenRouter({ apiKey })(parsed.id); break;
    }
  }
  return { model, modelId, systemPrompt: settings?.systemPrompt ?? null };
}
export function chatProviderError(error: unknown, modelId: string) {
  const provider = modelId.split(":")[0];
  if (RetryError.isInstance(error)) error = error.lastError;
  if (provider === "workers-ai" || !APICallError.isInstance(error)) return null;
  if (error.statusCode === 401 || error.statusCode === 403) return { invalid: true, message: `Your ${provider} key was rejected. Update it in Settings.` };
  if (error.statusCode === 429) return { invalid: false, message: `Rate limited / out of credit at ${provider}. Please try again later.` };
  return null;
}
export async function invalidateChatCredential(env: Env, userId: string, modelId: string) {
  await getDb(env).update(userProviderCredentials).set({ status: "invalid", updatedAt: new Date() }).where(and(
    eq(userProviderCredentials.userId, userId), eq(userProviderCredentials.provider, modelId.split(":")[0] as ChatProvider)));
}
