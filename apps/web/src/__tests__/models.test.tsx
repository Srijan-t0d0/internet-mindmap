import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { activeModelIndex, availableModelOptions, filterModels, type ModelOption } from "../lib/models";
import SettingsView from "../components/SettingsView";
import type { Settings } from "../lib/settings";
import { parseModelCatalog } from "../lib/model-catalog";

const settings: Settings = { chatModel: "openai:gpt-4.1", systemPrompt: "Keep answers brief", credentials: [
  { provider: "openai", status: "ok", last4: "1234" }, { provider: "anthropic", status: "invalid", last4: "5678" },
] };
const catalog: ModelOption[] = [
  { id: "openai:gpt-4.1", name: "GPT 4.1", company: "openai", provider: "openai" },
  { id: "anthropic:claude-sonnet-4-5", name: "Claude Sonnet", company: "anthropic", provider: "anthropic" },
  { id: "openrouter:anthropic/claude-sonnet-4.5", name: "Claude Sonnet", company: "anthropic", provider: "openrouter" },
];
describe("model picker", () => {
  it("uses exact provider IDs, excludes non-chat models and preserves OpenRouter variants", () => {
    const text = { input: ["text", "image"], output: ["text"] };
    const direct = { openai: { models: { "gpt-4.1": { name: "GPT 4.1", modalities: text }, "text-embedding": { name: "Embedding", modalities: { input: ["text"], output: ["embedding"] } }, "bad:id": { name: "Bad", modalities: text } } }, "google-vertex": { models: { vertex: { name: "Vertex", modalities: text } } } };
    const routed = { data: [{ id: "anthropic/claude-sonnet-4.5:free", name: "Claude Sonnet", architecture: { input_modalities: ["text"], output_modalities: ["text"] } }, { id: "image-only", name: "Images", architecture: { input_modalities: ["text"], output_modalities: ["image"] } }] };
    expect(parseModelCatalog(direct, routed).map((model) => model.id).sort()).toEqual(["openai:gpt-4.1", "openrouter:anthropic/claude-sonnet-4.5:free"]);
    expect(parseModelCatalog(null, { data: [null, { id: "bad" }] })).toEqual([]);
  });
  it("only exposes connected providers, keeps included models and preserves custom selections", () => {
    const options = availableModelOptions(catalog, settings, "openai:custom-model");
    expect(options.map((model) => model.id)).toContain("openai:custom-model");
    expect(options.filter((model) => model.provider === "workers-ai")).toHaveLength(2);
    expect(options.some((model) => model.provider === "anthropic" || model.provider === "openrouter")).toBe(false);
    expect(options.filter((model) => model.id === settings.chatModel)).toHaveLength(1);
  });
  it("keeps keyboard selection on the same model when the catalog arrives", () => {
    const before = availableModelOptions([], settings, "openai:custom-model");
    const activeId = before.at(-1)!.id;
    const after = availableModelOptions(catalog, settings, "openai:custom-model");
    expect(after[activeModelIndex(after, activeId)].id).toBe(activeId);
    expect(activeModelIndex(after, "missing")).toBe(0);
    expect(activeModelIndex([], activeId)).toBe(0);
  });
  it("searches names, companies, model IDs and multiple terms case-insensitively", () => {
    expect(filterModels(catalog, "OPENAI 4.1")).toEqual([catalog[0]]);
    expect(filterModels(catalog, "sonnet anthropic")).toHaveLength(2);
    expect(filterModels(catalog, "nonexistent")).toEqual([]);
    expect(filterModels(catalog, "")).toEqual(catalog);
  });
  it("renders saved settings into the initial HTML, without a client loading placeholder", () => {
    const html = renderToStaticMarkup(<QueryClientProvider client={new QueryClient()}><SettingsView initialSettings={settings} updatedAt={Date.now()} /></QueryClientProvider>);
    expect(html).toContain("Keep answers brief");
    expect(html).toContain("1234");
    expect(html).toContain("Default chat model");
    expect(html).not.toContain("Loading settings");
    expect(html).not.toContain("<datalist");
  });
});
