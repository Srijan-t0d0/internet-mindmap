"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@internet-mindmap/ui/components/ui/popover";
import { activeModelIndex, availableModelOptions, filterModels, modelCatalogQuery, type ModelOption } from "../lib/models";
import type { Settings } from "../lib/settings";

function CompanyIcon({ company }: { company: string }) {
  const [failed, setFailed] = useState(false);
  return failed ? <span aria-hidden="true" className="flex size-5 shrink-0 items-center justify-center rounded bg-[var(--color-bg-secondary)] text-xs">{company[0]?.toUpperCase()}</span>
    : <Image src={`https://models.dev/logos/${encodeURIComponent(company)}.svg`} alt="" width={20} height={20} unoptimized onError={() => setFailed(true)} className="size-5 shrink-0" />;
}

export default function ModelPicker({ value, onChange, settings, disabled, id, label = "Chat model", inline = false }: {
  value: string; onChange: (value: string) => void; settings?: Settings; disabled?: boolean; id?: string; label?: string;
  /** Borderless, content-width trigger for embedding inside the chat composer. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState("");
  const listId = useId();
  const list = useRef<HTMLDivElement>(null);
  const { data: catalog, isPending, isError, refetch } = useQuery({ ...modelCatalogQuery, enabled: open });
  const options = availableModelOptions(catalog ?? [], settings, value, search.trim());
  const defaultOption: ModelOption = { id: "", name: "Use default model", company: "cloudflare", provider: "workers-ai" };
  const choices = filterModels([defaultOption, ...options], search);
  const active = activeModelIndex(choices, activeId);
  // Empty value means "use default", so show what the default actually resolves to.
  const selected = options.find((option) => option.id === (value || settings?.chatModel));
  useEffect(() => { list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" }); }, [active]);
  function choose(option: ModelOption) { onChange(option.id); setOpen(false); }
  return <Popover open={open} onOpenChange={(next) => { setOpen(next); setSearch(""); setActiveId(""); }}>
    <PopoverTrigger asChild><button type="button" id={id} aria-label={label} disabled={disabled} className={`flex min-w-0 items-center gap-2 text-sm text-left focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50 ${inline ? "max-w-48 rounded-lg px-2 py-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]" : "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-card)] px-3 py-2"}`}>
      <CompanyIcon key={selected?.company ?? "cloudflare"} company={selected?.company ?? "cloudflare"} /><span className="min-w-0 flex-1 truncate">{selected?.name ?? (value || "Use default model")}</span>{!value && settings?.chatModel && <span className="shrink-0 text-xs text-[var(--color-text-secondary)]">default</span>}<ChevronDown size={16} aria-hidden="true" />
    </button></PopoverTrigger>
    <PopoverContent align={inline ? "end" : "start"} className="w-[min(28rem,calc(100vw-2rem))] p-0 shadow-none border-[var(--color-border)] bg-[var(--color-bg-card)] text-[var(--color-text-primary)] animate-none" aria-label="Choose a chat model">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-2"><Search size={16} aria-hidden="true" /><input role="combobox" aria-label="Search models" aria-autocomplete="list" aria-expanded="true" aria-controls={listId} aria-activedescendant={choices[active] ? `${listId}-${active}` : undefined} value={search} placeholder="Search models, companies, or provider:model…" className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-[var(--color-text-secondary)]" onChange={(event) => { setSearch(event.target.value); setActiveId(""); }} onKeyDown={(event) => {
        if (["ArrowDown", "ArrowUp", "Home", "End", "Enter"].includes(event.key)) event.preventDefault();
        if (event.key === "ArrowDown") setActiveId(choices[Math.min(active + 1, choices.length - 1)]?.id ?? "");
        if (event.key === "ArrowUp") setActiveId(choices[Math.max(active - 1, 0)]?.id ?? "");
        if (event.key === "Home") setActiveId(choices[0]?.id ?? "");
        if (event.key === "End") setActiveId(choices.at(-1)?.id ?? "");
        if (event.key === "Enter" && choices[active]) choose(choices[active]);
      }} /></div>
      <div ref={list} id={listId} role="listbox" aria-label="Chat models" className="max-h-72 overflow-y-auto p-1">
        {choices.map((option, index) => <button type="button" role="option" tabIndex={-1} aria-selected={value === option.id} id={`${listId}-${index}`} data-index={index} key={option.id} onMouseMove={() => setActiveId(option.id)} onClick={() => choose(option)} className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${index === active ? "bg-[var(--color-bg-secondary)]" : ""}`}>
          <CompanyIcon company={option.company} /><span className="min-w-0 flex-1"><span className="block truncate text-sm">{option.name}</span><span className="block truncate text-xs text-[var(--color-text-secondary)]">{option.id || (settings?.chatModel ?? "Workers AI · included")}</span></span>{option.price && <span className="shrink-0 text-xs tabular-nums text-[var(--color-text-secondary)]">{option.price}</span>}{value === option.id && <Check size={16} aria-hidden="true" />}
        </button>)}
        {!choices.length && <p className="px-3 py-6 text-sm">No matching models.</p>}
      </div>
      <div className="border-t border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text-secondary)]">{isPending ? <span role="status">Loading model catalog…</span> : isError ? <span role="status">Catalog unavailable. <button type="button" className="underline" onClick={() => void refetch()}>Retry</button></span> : "Connected providers · models.dev & OpenRouter"}</div>
    </PopoverContent>
  </Popover>;
}
