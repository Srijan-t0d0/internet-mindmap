import type { ModelOption } from "./models";

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function textModalities(input: unknown, output: unknown) {
  return Array.isArray(input) && input.includes("text") && Array.isArray(output) && output.includes("text");
}
function validId(id: string) {
  return id.length <= 200 && /^[a-z-]+:[\w@./-]+(?::[\w-]+)?$/.test(id);
}
/** OpenRouter quotes USD per token as strings; negative means variable (e.g. openrouter/auto). */
export function formatPrice(pricing: unknown) {
  const { prompt, completion } = record(pricing);
  const [input, output] = [Number(prompt), Number(completion)];
  if (typeof prompt !== "string" || typeof completion !== "string" || !(input >= 0) || !(output >= 0)) return undefined;
  if (input === 0 && output === 0) return "Free";
  const perMillion = (value: number) => `$${+(value * 1e6).toFixed(2)}`;
  return `${perMillion(input)} / ${perMillion(output)} per 1M`;
}
export function parseModelCatalog(direct: unknown, openrouter: unknown): ModelOption[] {
  const models: ModelOption[] = [];
  const providers = record(direct);
  for (const provider of ["openai", "anthropic", "google"] as const) {
    for (const [id, value] of Object.entries(record(record(providers[provider]).models))) {
      const model = record(value);
      const modalities = record(model.modalities);
      if (typeof model.name !== "string" || !validId(`${provider}:${id}`) || id.includes(":") || !textModalities(modalities.input, modalities.output)) continue;
      models.push({ id: `${provider}:${id}`, name: model.name, company: provider, provider });
    }
  }
  const routed = record(openrouter).data;
  if (Array.isArray(routed)) for (const value of routed) {
    const model = record(value);
    const architecture = record(model.architecture);
    if (typeof model.id !== "string" || typeof model.name !== "string" || !validId(`openrouter:${model.id}`) || !textModalities(architecture.input_modalities, architecture.output_modalities)) continue;
    const company = model.id.split("/")[0];
    models.push({ id: `openrouter:${model.id}`, name: model.name, company: company === "qwen" ? "alibaba" : company === "meta-llama" ? "meta" : company === "x-ai" ? "xai" : company, provider: "openrouter", price: formatPrice(model.pricing) });
  }
  return models.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export async function getModelCatalog(): Promise<ModelOption[]> {
  const catalogs = await Promise.all(["https://models.dev/api.json", "https://openrouter.ai/api/v1/models"].map(async (url) => {
    const response = await fetch(url, { next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error("Model catalog unavailable");
    return response.json() as Promise<unknown>;
  }));
  const models = parseModelCatalog(catalogs[0], catalogs[1]);
  if (!models.length) throw new Error("Empty model catalog");
  return models;
}
