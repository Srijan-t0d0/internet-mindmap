import type { Provider, Settings } from "./settings";

export type ModelOption = { id: string; name: string; company: string; provider: Provider | "workers-ai"; /** e.g. "$3 / $15 per 1M" (OpenRouter only). */ price?: string };
export const WORKERS_MODELS: ModelOption[] = [
  { id: "workers-ai:@cf/qwen/qwen3.8-27b", name: "Qwen 3.8 27B", company: "alibaba", provider: "workers-ai" },
  { id: "workers-ai:@cf/qwen/qwen3-30b-a3b-fp8", name: "Qwen 3 30B A3B", company: "alibaba", provider: "workers-ai" },
];
export function availableModelOptions(catalog: ModelOption[], settings?: Settings, selected?: string, custom?: string) {
  const connected = new Set(settings?.credentials.filter((credential) => credential.status === "ok").map((credential) => credential.provider));
  const options = [...WORKERS_MODELS, ...catalog.filter((model) => connected.has(model.provider as Provider))];
  for (const id of [settings?.chatModel, selected, custom]) {
    if (!id || id.length > 200 || !/^[a-z-]+:[\w@./-]+(?::[\w-]+)?$/.test(id) || options.some((model) => model.id === id)) continue;
    const provider = id.split(":")[0] as ModelOption["provider"];
    if (provider === "workers-ai" || connected.has(provider)) options.push({ id, name: id.slice(id.indexOf(":") + 1), company: provider === "workers-ai" ? "cloudflare" : provider, provider });
  }
  return options;
}
export function activeModelIndex(models: ModelOption[], id: string) {
  return Math.max(0, models.findIndex((model) => model.id === id));
}
export function filterModels(models: ModelOption[], query: string) {
  const terms = query.toLowerCase().trim().split(/\s+/);
  return models.filter((model) => terms.every((term) => `${model.name} ${model.company} ${model.id}`.toLowerCase().includes(term)));
}
export const modelCatalogQuery = {
  queryKey: ["model-catalog"],
  queryFn: async (): Promise<ModelOption[]> => {
    const response = await fetch("/model-catalog.json");
    if (!response.ok) throw new Error("Could not load model catalog");
    return response.json();
  },
  staleTime: 60 * 60 * 1000,
};
