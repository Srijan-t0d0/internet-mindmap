"use client";

import { useState, useTransition, useRef, useEffect, lazy, Suspense } from "react";
import { useRouter } from "next/navigation";
import type { Item, Tag, ViewMode } from "@internet-mindmap/shared";
import Sidebar from "./Sidebar";
import SearchBar from "./SearchBar";
import ItemCard from "./ItemCard";
import ChatPanel from "./ChatPanel";
import DetailPanel from "./DetailPanel";
import EmptyState from "./EmptyState";
const GraphView = lazy(() => import("./GraphView"));
import { retryItem, updateItem, deleteItem } from "../lib/api";
import { SOURCE_CSS_COLORS } from "../lib/constants";

interface ItemsShellProps {
  initialItems: Item[];
  initialTotal: number;
  tags: Tag[];
  viewMode: ViewMode;
  selectedSource: string | null;
  selectedTag: string | null;
  searchQuery: string;
}

export default function ItemsShell({
  initialItems,
  initialTotal,
  tags,
  viewMode,
  selectedSource,
  selectedTag,
  searchQuery,
}: ItemsShellProps) {
  const router = useRouter();
  // ✅ rendering-usetransition-loading: useTransition instead of manual loading state
  const [isPending, startTransition] = useTransition();

  // ✅ rerender-derived-state-no-effect: sync server props to local state during render
  const [items, setItems] = useState(initialItems);
  const [totalItems, setTotalItems] = useState(initialTotal);
  const [prevServerData, setPrevServerData] = useState({ initialItems, initialTotal });

  if (
    initialItems !== prevServerData.initialItems ||
    initialTotal !== prevServerData.initialTotal
  ) {
    setPrevServerData({ initialItems, initialTotal });
    setItems(initialItems);
    setTotalItems(initialTotal);
  }

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showChat, setShowChat] = useState(true);
  const [searchInput, setSearchInput] = useState(searchQuery);

  // Sync search input when server-side query changes (e.g. browser back/forward)
  const [prevQuery, setPrevQuery] = useState(searchQuery);
  if (searchQuery !== prevQuery) {
    setPrevQuery(searchQuery);
    setSearchInput(searchQuery);
  }

  const isSearching = searchQuery.length > 0;

  // ---------------------------------------------------------------------------
  // URL-driven filter changes
  // ---------------------------------------------------------------------------

  function buildUrl(overrides: Record<string, string | null>) {
    const state: Record<string, string | null> = {
      view: viewMode === "cards" ? null : viewMode, // "cards" is default, omit
      source: selectedSource,
      tag: selectedTag,
      q: searchQuery || null,
      ...overrides,
    };
    const sp = new URLSearchParams();
    for (const [key, val] of Object.entries(state)) {
      if (val) sp.set(key, val);
    }
    const qs = sp.toString();
    return qs ? `/?${qs}` : "/";
  }

  function navigateWithTransition(overrides: Record<string, string | null>) {
    startTransition(() => {
      router.push(buildUrl(overrides));
    });
  }

  function handleViewModeChange(mode: ViewMode) {
    setSearchInput("");
    navigateWithTransition({
      view: mode === "cards" ? null : mode,
      q: null,
    });
  }

  function handleSourceTypeChange(source: string | null) {
    navigateWithTransition({ source });
  }

  function handleTagChange(tag: string | null) {
    navigateWithTransition({ tag });
  }

  function handleSearch(query: string) {
    if (!query.trim()) {
      navigateWithTransition({ q: null });
      return;
    }
    navigateWithTransition({ q: query.trim() });
  }

  function handleClearSearch() {
    setSearchInput("");
    navigateWithTransition({ q: null });
  }

  // ---------------------------------------------------------------------------
  // Mutations — call API, then update local state optimistically
  // ---------------------------------------------------------------------------

  async function handleRetry(item: Item) {
    try {
      await retryItem(item.id);
      router.refresh();
    } catch (err) {
      console.error("Retry failed:", err);
    }
  }

  // ✅ rerender-functional-setstate: functional updates for stable callbacks
  async function handleToggleRead(item: Item) {
    try {
      const updated = await updateItem(item.id, { is_read: !item.is_read });
      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id ? { ...i, is_read: updated.is_read } : i
        )
      );
      if (selectedItem?.id === item.id) {
        setSelectedItem((prev) =>
          prev ? { ...prev, is_read: updated.is_read } : null
        );
      }
    } catch (err) {
      console.error("Toggle read failed:", err);
    }
  }

  async function handleDelete(item: Item) {
    try {
      await deleteItem(item.id);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setTotalItems((prev) => prev - 1);
      if (selectedItem?.id === item.id) {
        handleCloseDetail();
      }
      // Let the background poll sync tag counts — calling router.refresh()
      // immediately would clobber the optimistic state via the render-phase
      // server-data sync before the API has committed the deletion.
    } catch (err) {
      console.error("Delete failed:", err);
    }
  }

  function handleItemClick(item: Item) {
    setSelectedItem(item);
    setShowChat(false);
  }

  function handleCloseDetail() {
    setSelectedItem(null);
    setShowChat(true);
  }

  // ---------------------------------------------------------------------------
  // Background polling for processing items — uses router.refresh() (no spinner)
  // ---------------------------------------------------------------------------

  const hasProcessingRef = useRef(false);
  useEffect(() => {
    hasProcessingRef.current = items.some(
      (i) => i.status === "pending" || i.status === "processing"
    );
  }, [items]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (hasProcessingRef.current) {
        router.refresh(); // Silent server re-fetch — no loading state
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [router]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tags={tags}
        viewMode={viewMode}
        selectedSourceType={selectedSource}
        selectedTag={selectedTag}
        onViewModeChange={handleViewModeChange}
        onSourceTypeChange={handleSourceTypeChange}
        onTagChange={handleTagChange}
        itemCount={totalItems}
      />

      <main
        className="flex-1 h-screen overflow-y-auto overflow-x-hidden p-6"
        role="main"
        style={{
          opacity: isPending ? 0.6 : 1,
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

      {selectedItem ? (
        <DetailPanel
          item={selectedItem}
          onClose={handleCloseDetail}
          onToggleRead={handleToggleRead}
          onDelete={handleDelete}
        />
      ) : showChat ? (
        <ChatPanel />
      ) : null}
    </div>
  );
}
