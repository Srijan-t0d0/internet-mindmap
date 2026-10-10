"use client";

import { lazy, Suspense } from "react";
import type { Item, ViewMode } from "@internet-mindmap/shared";
import { SOURCE_CSS_COLORS } from "@internet-mindmap/ui";
import ItemCard from "./ItemCard";
import EmptyState from "./EmptyState";

const GraphView = lazy(() => import("./GraphView"));

interface ItemsResultsProps {
  items: Item[];
  view: ViewMode;
  isSearching: boolean;
  hasFilters: boolean;
  onClearSearch: () => void;
  onItemClick: (item: Item) => void;
  onRetry: (item: Item) => void;
  onToggleRead: (item: Item) => void;
}

export default function ItemsResults({
  items, view, isSearching, hasFilters, onClearSearch, onItemClick, onRetry, onToggleRead,
}: ItemsResultsProps) {
  if (items.length === 0) {
    if (isSearching) {
      return <EmptyState title="No results" description="Try a different search term or broaden your filters."
        action={{ label: "Clear search", onClick: onClearSearch }} />;
    }
    if (hasFilters) {
      return <EmptyState title="No matching items" description="Try another source or topic." />;
    }
    if (view === "reading-list") {
      return <EmptyState title="All caught up" description="You've read everything in your queue. Save more content to keep learning." />;
    }
    return <EmptyState title="Your knowledge base is empty"
      description="Install the browser extension and press Command+Shift+S on any web page to start building your personal knowledge graph." />;
  }

  if (view === "graph") {
    return (
      <div className="flex-1" style={{ height: "calc(100vh - 140px)" }}>
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <p role="status" className="text-sm" style={{ color: "var(--color-text-muted)" }}>Loading graph…</p>
          </div>
        }>
          <GraphView items={items} onItemClick={onItemClick} />
        </Suspense>
      </div>
    );
  }

  if (view === "list") {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="rounded-lg overflow-hidden" style={{
          border: "1px solid var(--color-border-subtle)", backgroundColor: "var(--color-bg-card)",
        }}>
          {items.map((item, index) => (
            <button type="button" key={item.id}
              className="w-full text-left flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 list-row-enter focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
              style={{ borderTop: index > 0 ? "1px solid var(--color-border-subtle)" : "none", animationDelay: `${Math.min(index * 30, 300)}ms` }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--color-bg-secondary)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              onClick={() => onItemClick(item)}>
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: SOURCE_CSS_COLORS[item.source_type] }} />
              <span className="text-sm font-medium truncate flex-1" style={{ color: "var(--color-text-primary)" }}>{item.title}</span>
              {item.tags.slice(0, 2).map((tag) => (
                <span key={tag} className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{ color: "var(--color-text-muted)", backgroundColor: "var(--color-bg-secondary)" }}>{tag}</span>
              ))}
              <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--color-text-muted)" }}>
                {new Date(item.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl mx-auto">
      {items.map((item, index) => (
        <ItemCard key={item.id} item={item} onClick={onItemClick} onRetry={onRetry} onToggleRead={onToggleRead}
          style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }} className="card-enter" />
      ))}
    </div>
  );
}
