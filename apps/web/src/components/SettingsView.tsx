"use client";
import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsQuery, settingsRequest, type Provider, type Settings } from "../lib/settings";
import ModelPicker from "./ModelPicker";

const control = "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2 text-sm focus:outline-2 focus:outline-[var(--color-accent)]";
const button = "rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm hover:bg-[var(--color-bg-secondary)] disabled:opacity-50";
export default function SettingsView({ initialSettings, updatedAt }: { initialSettings: Settings; updatedAt: number }) {
  const { data, error, isPending } = useQuery({ ...settingsQuery, initialData: initialSettings, initialDataUpdatedAt: updatedAt });
  const client = useQueryClient();
  const [model, setModel] = useState(initialSettings.chatModel ?? "");
  const [prompt, setPrompt] = useState(initialSettings.systemPrompt ?? "");
  const [keys, setKeys] = useState<Partial<Record<Provider, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => { if (data) { setModel(data.chatModel ?? ""); setPrompt(data.systemPrompt ?? ""); } }, [data]);
  useEffect(() => { const params = new URLSearchParams(window.location.search); if (params.has("error")) setNotice("OpenRouter connection failed. Please reconnect."); if (params.has("connected")) setNotice("OpenRouter connected."); }, []);
  async function mutate(path: string, method: string, body?: unknown, savedProvider?: Provider) {
    setBusy(true); setNotice("");
    try {
      await settingsRequest(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      if (savedProvider) setKeys((old) => ({ ...old, [savedProvider]: "" }));
      await client.invalidateQueries({ queryKey: settingsQuery.queryKey }); setNotice("Saved.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not save settings."); }
    finally { setBusy(false); }
  }
  return <main className="flex-1 min-w-0 overflow-y-auto p-6 md:p-10" style={{ color: "var(--color-text-primary)" }}>
    <div className="max-w-2xl mx-auto space-y-8">
      <header><h1 className="text-2xl font-semibold">AI settings</h1><p className="mt-2 text-sm">Your keys power chat only. Background processing still uses Workers AI.</p></header>
      {isPending ? <p role="status">Loading settings…</p> : error ? <p role="alert">Could not load settings. <button className={button} onClick={() => client.invalidateQueries({ queryKey: settingsQuery.queryKey })}>Retry</button></p> : <>
        <section aria-labelledby="provider-heading"><h2 id="provider-heading" className="text-lg font-semibold">Provider keys</h2><p className="text-sm mt-1 mb-4">Keys are encrypted, never shown again, and billed by your provider.</p>
          {(["openai", "anthropic", "google", "openrouter"] as Provider[]).map((provider) => {
            const credential = data?.credentials.find((row) => row.provider === provider);
            return <div key={provider} className="py-4 border-b border-[var(--color-border-subtle)] space-y-2">
              <div className="flex flex-wrap justify-between gap-2"><label htmlFor={`key-${provider}`} className="font-medium capitalize">{provider}</label>
                <span className="text-sm">{credential ? `••••${credential.last4} · ${credential.status === "ok" ? "Connected" : "Key rejected — replace it"}` : "Not connected"}</span></div>
              <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void mutate(`/keys/${provider}`, "PUT", { key: keys[provider] }, provider); }}>
                <input id={`key-${provider}`} type="password" autoComplete="off" spellCheck={false} placeholder="Paste API key" className={`${control} flex-1 min-w-40`} value={keys[provider] ?? ""} onChange={(event) => setKeys({ ...keys, [provider]: event.target.value })} disabled={busy} />
                <button className={button} disabled={busy || !keys[provider]}>Save key</button>
                {credential && <button type="button" className={button} disabled={busy} onClick={() => void mutate(`/keys/${provider}`, "DELETE")}>Disconnect</button>}
                {provider === "openrouter" && <a className={button} href="/api/settings/openrouter/connect">Connect OpenRouter</a>}
              </form>
            </div>;
          })}</section>
        <form className="space-y-5" onSubmit={(event) => { event.preventDefault(); void mutate("", "PATCH", { systemPrompt: prompt || null }); }}>
          <div><label htmlFor="chat-model" className="block font-medium mb-2">Default chat model</label><ModelPicker id="chat-model" label="Default chat model" value={model} onChange={(next) => { setModel(next); void mutate("", "PATCH", { chatModel: next || null }); }} settings={data} disabled={busy} /><p className="text-sm mt-2">Search models by name or company. Connect a provider to see its models.</p></div>
          <div><label htmlFor="custom-prompt" className="block font-medium mb-2">Custom instructions</label><textarea id="custom-prompt" className={control} rows={5} maxLength={2000} value={prompt} onChange={(event) => setPrompt(event.target.value)} disabled={busy} aria-describedby="prompt-count" /><p id="prompt-count" className="text-sm mt-2">{prompt.length}/2000 · Citation rules always apply.</p></div>
          <button className={button} disabled={busy}>{busy ? "Saving…" : "Save instructions"}</button>
        </form>
      </>}
      {notice && <p role="status" className="text-sm">{notice}</p>}
    </div>
  </main>;
}
