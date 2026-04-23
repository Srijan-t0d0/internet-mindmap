"use client";

import { useState, useEffect, useMemo, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import type { Item, ViewMode } from "@internet-mindmap/shared";
import SearchBar from "./SearchBar";
import ItemCard from "./ItemCard";
import DetailPanel from "./DetailPanel";
import EmptyState from "./EmptyState";
const GraphView = lazy(() => import("./GraphView"));
import { SOURCE_CSS_COLORS } from "@internet-mindmap/ui";

import { useFilters } from "../hooks/use-filters";
import { useItemsQuery, type ItemsData } from "../hooks/use-items-query";
import { useRetryItem, useUpdateItem, useDeleteItem } from "../hooks/use-mutations";

interface ItemsShellProps {
  initialItems: Item[];
  initialTotal: number;
}

export default function ItemsShell({
  initialItems,
  initialTotal,
}: ItemsShellProps) {
  // ---------------------------------------------------------------------------
  // URL state (nuqs) — single source of truth for all filter params
  // ---------------------------------------------------------------------------
  const router = useRouter();
  const [filters, setFilters] = useFilters();
  const { view: viewMode, source: selectedSource, tag: selectedTag, q: searchQuery } = filters;
  const isSearching = Boolean(searchQuery);

  // Local input value — only syncs to URL on Enter
  const [searchInput, setSearchInput] = useState(searchQuery ?? "");

  // Sync input when URL changes (back/forward navigation)
  useEffect(() => {
    setSearchInput(searchQuery ?? "");
  }, [searchQuery]);

  // ---------------------------------------------------------------------------
  // Data fetching (React Query) — fetches ALL items once, filters client-side
  // ---------------------------------------------------------------------------
  const initialData: ItemsData = { items: initialItems, total: initialTotal };

  const {
    data: itemsData,
    isFetching,
  } = useItemsQuery({
    source: selectedSource,
    tag: selectedTag,
    q: searchQuery,
    initialData,
  });

  const allItems = itemsData?.items ?? initialItems;

  // ---------------------------------------------------------------------------
  // Client-side filtering — instant, no server round-trip
  // ---------------------------------------------------------------------------
  const items = useMemo(() => {
    // Search mode: server already filtered, return as-is
    if (searchQuery) return allItems;

    let filtered = allItems;
    if (selectedTag) {
      filtered = filtered.filter((item) => item.tags.includes(selectedTag));
    }
    if (selectedSource) {
      filtered = filtered.filter((item) => item.source_type === selectedSource);
    }
    if (viewMode === "reading-list") {
      filtered = filtered.filter((item) => !item.is_read);
    }
    return filtered;
  }, [allItems, selectedTag, selectedSource, viewMode, searchQuery]);

  // ---------------------------------------------------------------------------
  // Mutations (React Query) — optimistic updates + cache invalidation
  // ---------------------------------------------------------------------------
  const retryMutation = useRetryItem();
  const updateMutation = useUpdateItem();
  const deleteMutation = useDeleteItem();

  // ---------------------------------------------------------------------------
  // UI state
  // ---------------------------------------------------------------------------
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Derive selectedItem from the items cache — no sync useEffect needed
  const selectedItem = selectedItemId
    ? items.find((i) => i.id === selectedItemId) ?? null
    : null;

  // ⌘J keyboard shortcut to jump to chat
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "j") {
        e.preventDefault();
        router.push("/chat");
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  function handleSearch(query: string) {
    if (!query.trim()) {
      setFilters({ q: null });
      return;
    }
    setFilters({ q: query.trim() });
  }

  function handleClearSearch() {
    setSearchInput("");
    setFilters({ q: null });
  }

  // ---------------------------------------------------------------------------
  // Item action handlers
  // ---------------------------------------------------------------------------
  function handleRetry(item: Item) {
    retryMutation.mutate(item.id);
  }

  function handleToggleRead(item: Item) {
    updateMutation.mutate({ id: item.id, data: { is_read: !item.is_read } });
  }

  function handleDelete(item: Item) {
    deleteMutation.mutate(item.id);
    if (selectedItem?.id === item.id) {
      handleCloseDetail();
    }
  }

  function handleItemClick(item: Item) {
    setSelectedItemId(item.id);
  }

  function handleCloseDetail() {
    setSelectedItemId(null);
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      <main
        className="flex-1 h-screen overflow-y-auto overflow-x-hidden p-6"
        role="main"
        style={{
          opacity: isFetching ? 0.6 : 1,
          transition: "opacity 150ms ease",
        }}
      >
        <div className="max-w-2xl mx-auto mb-8">
          <SearchBar
            value={searchInput}
            onChange={setSearchInput}
            onSearch={handleSearch}
          />
          {isSearching && (
            <div className="mt-3 flex items-center gap-2 fade-in">
              <span
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                Showing results for &quot;{searchQuery}&quot;
              </span>
              <button
                className="text-xs font-medium transition-colors duration-150"
                style={{ color: "var(--color-accent)" }}
                onClick={handleClearSearch}
              >
                Clear search
              </button>
            </div>
          )}
        </div>

        {viewMode === "reading-list" && !isSearching && (
          <h2
            className="font-[family-name:var(--font-heading)] text-xl font-semibold mb-5"
            style={{ color: "var(--color-text-primary)" }}
          >
            Reading List
          </h2>
        )}

        {items.length === 0 ? (
          viewMode === "reading-list" ? (
            <EmptyState
              title="All caught up"
              description="You've read everything in your queue. Save more content to keep learning."
            />
          ) : isSearching ? (
            <EmptyState
              title="No results"
              description="Try a different search term or broaden your filters."
              action={{ label: "Clear search", onClick: handleClearSearch }}
            />
          ) : (
            <EmptyState
              title="Your knowledge base is empty"
              description="Install the browser extension and press Command+Shift+S on any web page to start building your personal knowledge graph."
            />
          )
        ) : viewMode === "graph" ? (
          <div className="flex-1" style={{ height: "calc(100vh - 140px)" }}>
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <p
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    Loading graph...
                  </p>
                </div>
              }
            >
              <GraphView items={items} onItemClick={handleItemClick} />
            </Suspense>
          </div>
        ) : viewMode === "list" ? (
          <div className="max-w-3xl mx-auto">
            <div
              className="rounded-lg overflow-hidden"
              style={{
                border: "1px solid var(--color-border-subtle)",
                backgroundColor: "var(--color-bg-card)",
              }}
            >
              {items.map((item, index) => (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors duration-150 list-row-enter"
                  style={{
                    borderTop:
                      index > 0
                        ? "1px solid var(--color-border-subtle)"
                        : "none",
                    animationDelay: `${index * 30}ms`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor =
                      "var(--color-bg-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                  onClick={() => handleItemClick(item)}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: SOURCE_CSS_COLORS[item.source_type],
                    }}
                  />
                  <span
                    className="text-sm font-medium truncate flex-1"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {item.title}
                  </span>
                  {item.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        color: "var(--color-text-muted)",
                        backgroundColor: "var(--color-bg-secondary)",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                  <span
                    className="text-[11px] tabular-nums flex-shrink-0"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {items.map((item, index) => (
              <ItemCard
                key={item.id}
                item={item}
                onClick={handleItemClick}
                onRetry={handleRetry}
                onToggleRead={handleToggleRead}
                style={{ animationDelay: `${index * 50}ms` }}
                className="card-enter"
              />
            ))}
          </div>
        )}
      </main>

      {/* Detail panel — slides in from right as part of layout */}
      {selectedItem && (
        <DetailPanel
          item={selectedItem}
          onClose={handleCloseDetail}
          onToggleRead={handleToggleRead}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}
