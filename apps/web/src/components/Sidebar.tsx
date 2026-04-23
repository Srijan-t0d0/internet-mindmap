"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Tag, ViewMode } from "@internet-mindmap/shared";
import { SOURCE_TYPES, SOURCE_LABELS, SOURCE_CSS_COLORS } from "@internet-mindmap/ui";
import UserMenu from "./UserMenu";
import ThreadsList from "./ThreadsList";
import { useFilters } from "../hooks/use-filters";

const SOURCE_FILTERS = SOURCE_TYPES
  .filter((key) => key !== "other")
  .map((key) => ({ key, label: SOURCE_LABELS[key], color: SOURCE_CSS_COLORS[key] }));

const EXPLORE_ICONS: Record<string, ReactNode> = {
  cards: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  list: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  "reading-list": (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    </svg>
  ),
  graph: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2" />
      <circle cx="5" cy="6" r="2" />
      <circle cx="19" cy="6" r="2" />
      <circle cx="5" cy="18" r="2" />
      <circle cx="19" cy="18" r="2" />
      <line x1="10.5" y1="10.5" x2="6.5" y2="7.5" />
      <line x1="13.5" y1="10.5" x2="17.5" y2="7.5" />
      <line x1="10.5" y1="13.5" x2="6.5" y2="16.5" />
      <line x1="13.5" y1="13.5" x2="17.5" y2="16.5" />
    </svg>
  ),
};

const EXPLORE_MODES: { key: ViewMode; label: string }[] = [
  { key: "cards", label: "Cards" },
  { key: "list", label: "List" },
  { key: "reading-list", label: "Reading List" },
  { key: "graph", label: "Graph" },
];

interface SidebarProps {
  tags: Tag[];
  itemCount: number;
}

export default function Sidebar({ tags, itemCount }: SidebarProps) {
  const pathname = usePathname();
  const [filters, setFilters] = useFilters();
  const { view: viewMode, source: selectedSourceType, tag: selectedTag } = filters;

  const isChat = pathname === "/chat";
  const isExplore = !isChat;

  function handleViewModeChange(mode: ViewMode) {
    setFilters({ view: mode, q: null });
  }

  function handleSourceTypeChange(source: string | null) {
    setFilters({ source });
  }

  function handleTagChange(tag: string | null) {
    setFilters({ tag });
  }

  return (
    <aside
      className="w-60 h-screen flex-shrink-0 overflow-y-auto border-r flex flex-col"
      style={{
        backgroundColor: "var(--color-bg-secondary)",
        borderColor: "var(--color-border)",
      }}
    >
      <div className="p-6 pb-0">
        <h1
          className="font-[family-name:var(--font-heading)] text-lg font-semibold tracking-tight"
          style={{ color: "var(--color-text-primary)" }}
        >
          Internet Mindmap
        </h1>
        <p className="text-xs mt-1 mb-6" style={{ color: "var(--color-text-muted)" }}>
          {itemCount} items saved
        </p>
      </div>

      <nav className="flex-1 px-3 pb-6 space-y-6 overflow-y-auto">
        {/* Top-level page nav */}
        <div className="space-y-0.5">
          <Link
            href="/chat"
            prefetch
            className="w-full text-left text-sm px-3 py-2 rounded-md transition-all duration-150 flex items-center gap-2.5"
            style={{
              backgroundColor: isChat ? "var(--color-accent-subtle)" : "transparent",
              color: isChat ? "var(--color-accent)" : "var(--color-text-secondary)",
              fontWeight: isChat ? 500 : 400,
            }}
            onMouseEnter={(e) => {
              if (!isChat) e.currentTarget.style.backgroundColor = "var(--color-bg-card)";
            }}
            onMouseLeave={(e) => {
              if (!isChat) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Chat
            <span
              className="ml-auto text-[10px] font-mono"
              style={{ color: "var(--color-text-muted)", opacity: 0.5 }}
            >
              {"\u2318"}J
            </span>
          </Link>

          <Link
            href="/"
            prefetch
            className="w-full text-left text-sm px-3 py-2 rounded-md transition-all duration-150 flex items-center gap-2.5"
            style={{
              backgroundColor: isExplore ? "var(--color-bg-card)" : "transparent",
              color: isExplore ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              fontWeight: isExplore ? 500 : 400,
              boxShadow: isExplore ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!isExplore) e.currentTarget.style.backgroundColor = "var(--color-bg-card)";
            }}
            onMouseLeave={(e) => {
              if (!isExplore) e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            Explore
          </Link>
        </div>

        {/* Chat sub-navigation — thread list. Only visible on /chat. */}
        {isChat && <ThreadsList />}

        {/* Explore sub-navigation — only visible when on an explore view */}
        {isExplore && (
          <>
            {/* View modes */}
            <div>
              <h2
                className="text-[11px] font-medium uppercase tracking-widest mb-2 px-3"
                style={{ color: "var(--color-text-muted)" }}
              >
                View
              </h2>
              <div className="space-y-0.5">
                {EXPLORE_MODES.map((mode) => {
                  const active = viewMode === mode.key;
                  return (
                    <button
                      key={mode.key}
                      onClick={() => handleViewModeChange(mode.key)}
                      className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-all duration-150 flex items-center gap-2.5"
                      style={{
                        backgroundColor: active ? "var(--color-bg-card)" : "transparent",
                        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                        fontWeight: active ? 500 : 400,
                        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                      }}
                    >
                      <span style={{ opacity: active ? 1 : 0.5 }}>{EXPLORE_ICONS[mode.key]}</span>
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Source filters */}
            <div>
              <h2
                className="text-[11px] font-medium uppercase tracking-widest mb-2 px-3"
                style={{ color: "var(--color-text-muted)" }}
              >
                Sources
              </h2>
              <div className="space-y-0.5">
                <button
                  onClick={() => handleSourceTypeChange(null)}
                  className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-all duration-150"
                  style={{
                    backgroundColor: !selectedSourceType ? "var(--color-bg-card)" : "transparent",
                    color: !selectedSourceType ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                    fontWeight: !selectedSourceType ? 500 : 400,
                    boxShadow: !selectedSourceType ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                  }}
                >
                  All Sources
                </button>
                {SOURCE_FILTERS.map((source) => {
                  const active = selectedSourceType === source.key;
                  return (
                    <button
                      key={source.key}
                      onClick={() => handleSourceTypeChange(active ? null : source.key)}
                      className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-all duration-150 flex items-center gap-2.5"
                      style={{
                        backgroundColor: active ? "var(--color-bg-card)" : "transparent",
                        color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                        fontWeight: active ? 500 : 400,
                        boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                      }}
                    >
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0 transition-transform duration-150"
                        style={{
                          backgroundColor: source.color,
                          transform: active ? "scale(1.25)" : "scale(1)",
                        }}
                      />
                      {source.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tag filters */}
            {tags.length > 0 && (
              <div>
                <h2
                  className="text-[11px] font-medium uppercase tracking-widest mb-2 px-3"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  Topics
                </h2>
                <div className="space-y-0.5">
                  <button
                    onClick={() => handleTagChange(null)}
                    className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-all duration-150"
                    style={{
                      backgroundColor: !selectedTag ? "var(--color-bg-card)" : "transparent",
                      color: !selectedTag ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                      fontWeight: !selectedTag ? 500 : 400,
                      boxShadow: !selectedTag ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                    }}
                  >
                    All Topics
                  </button>
                  {tags.slice(0, 20).map((tag) => {
                    const active = selectedTag === tag.name;
                    return (
                      <button
                        key={tag.id}
                        onClick={() => handleTagChange(active ? null : tag.name)}
                        className="w-full text-left text-sm px-3 py-1.5 rounded-md transition-all duration-150 flex items-center justify-between"
                        style={{
                          backgroundColor: active ? "var(--color-bg-card)" : "transparent",
                          color: active ? "var(--color-text-primary)" : "var(--color-text-secondary)",
                          fontWeight: active ? 500 : 400,
                          boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none",
                        }}
                      >
                        <span className="truncate">{tag.name}</span>
                        <span
                          className="text-[11px] tabular-nums flex-shrink-0 ml-2"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {tag.item_count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </nav>

      {/* User menu at the bottom */}
      <div className="px-3 pb-4 pt-2 border-t space-y-1" style={{ borderColor: "var(--color-border-subtle)" }}>
        <UserMenu />
      </div>
    </aside>
  );
}
