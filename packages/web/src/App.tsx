import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import type { Item, Tag, ViewMode } from "@internet-mindmap/shared";
import Sidebar from "./components/Sidebar";
import SearchBar from "./components/SearchBar";
import ItemCard from "./components/ItemCard";
import ChatPanel from "./components/ChatPanel";
import DetailPanel from "./components/DetailPanel";
import EmptyState from "./components/EmptyState";
const GraphView = lazy(() => import("./components/GraphView"));
import { fetchItems, searchItems, fetchTags, retryItem, updateItem, deleteItem } from "./lib/api";
import { SOURCE_CSS_COLORS } from "./lib/constants";

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [selectedSourceType, setSelectedSourceType] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const [showChat, setShowChat] = useState(true);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchItems({
        source_type: selectedSourceType,
        tag: selectedTag,
        is_read: viewMode === "reading-list" ? "false" : null,
      });
      setItems(data.items);
      setTotalItems(data.total);
    } catch (err) {
      console.error("Failed to fetch items:", err);
    }
    setLoading(false);
  }, [selectedSourceType, selectedTag, viewMode]);

  const loadTags = useCallback(async () => {
    try {
      const data = await fetchTags();
      setTags(data.tags);
    } catch (err) {
      console.error("Failed to fetch tags:", err);
    }
  }, []);

  useEffect(() => {
    loadItems();
    loadTags();
  }, [loadItems, loadTags]);

  // Poll when processing/pending items exist — ref prevents interval churn
  const hasProcessingRef = useRef(false);
  useEffect(() => {
    hasProcessingRef.current = items.some(
      (i) => i.status === "pending" || i.status === "processing"
    );
  }, [items]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (hasProcessingRef.current) {
        loadItems();
        loadTags();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [loadItems, loadTags]);

  async function handleSearch(query: string) {
    if (!query.trim()) {
      setIsSearching(false);
      loadItems();
      return;
    }

    setIsSearching(true);
    setLoading(true);
    try {
      const data = await searchItems({
        q: query,
        source_type: selectedSourceType,
        tag: selectedTag,
      });
      setItems(data.items);
      setTotalItems(data.count);
    } catch (err) {
      console.error("Search failed:", err);
    }
    setLoading(false);
  }

  async function handleRetry(item: Item) {
    try {
      await retryItem(item.id);
      loadItems();
    } catch (err) {
      console.error("Retry failed:", err);
    }
  }

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
    await deleteItem(item.id);
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    setTotalItems((prev) => prev - 1);
    if (selectedItem?.id === item.id) {
      handleCloseDetail();
    }
    loadTags();
  }

  function handleItemClick(item: Item) {
    setSelectedItem(item);
    setShowChat(false);
  }

  function handleCloseDetail() {
    setSelectedItem(null);
    setShowChat(true);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        tags={tags}
        viewMode={viewMode}
        selectedSourceType={selectedSourceType}
        selectedTag={selectedTag}
        onViewModeChange={(mode) => {
          setViewMode(mode);
          setIsSearching(false);
          setSearchQuery("");
        }}
        onSourceTypeChange={setSelectedSourceType}
        onTagChange={setSelectedTag}
        itemCount={totalItems}
      />

      <main className="flex-1 h-screen overflow-y-auto overflow-x-hidden p-6" role="main">
        <div className="max-w-2xl mx-auto mb-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            onSearch={handleSearch}
          />
          {isSearching && (
            <div className="mt-2 flex items-center gap-2">
              <span
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                Showing results for &quot;{searchQuery}&quot;
              </span>
              <button
                className="text-xs font-medium"
                style={{ color: "var(--color-accent)" }}
                onClick={() => {
                  setSearchQuery("");
                  setIsSearching(false);
                  loadItems();
                }}
              >
                Clear search
              </button>
            </div>
          )}
        </div>

        {viewMode === "reading-list" && !isSearching && (
          <h2
            className="font-[family-name:var(--font-heading)] text-xl font-semibold mb-4"
            style={{ color: "var(--color-text-primary)" }}
          >
            Reading List
          </h2>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg p-6"
                style={{
                  backgroundColor: "var(--color-bg-card)",
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div className="skeleton h-3 rounded w-20 mb-3" />
                <div className="skeleton h-4 rounded w-3/4 mb-2" />
                <div className="skeleton h-3 rounded w-full mb-1" />
                <div className="skeleton h-3 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          viewMode === "reading-list" ? (
            <EmptyState
              title="All caught up"
              description="You've read everything in your queue. Save more content to keep learning."
            />
          ) : isSearching ? (
            <EmptyState
              title="No results"
              description="Try a different search term or broaden your filters."
              action={{
                label: "Clear search",
                onClick: () => {
                  setSearchQuery("");
                  setIsSearching(false);
                  loadItems();
                },
              }}
            />
          ) : (
            <EmptyState
              title="Your knowledge base is empty"
              description="Install the browser extension and press ⌘⇧S on any web page to start building your personal knowledge graph."
            />
          )
        ) : viewMode === "graph" ? (
          <div className="flex-1" style={{ height: "calc(100vh - 140px)" }}>
            <Suspense
              fallback={
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                    Loading graph...
                  </p>
                </div>
              }
            >
              <GraphView items={items} onItemClick={handleItemClick} />
            </Suspense>
          </div>
        ) : viewMode === "list" ? (
          <div className="max-w-3xl mx-auto space-y-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-colors hover:bg-bg-secondary"
                style={{ backgroundColor: "var(--color-bg-card)" }}
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
                    className="text-xs px-1.5 py-0.5 rounded border border-dashed flex-shrink-0"
                    style={{
                      color: "var(--color-text-muted)",
                      borderColor: "var(--color-border)",
                    }}
                  >
                    {tag}
                  </span>
                ))}
                <span
                  className="text-xs flex-shrink-0"
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl mx-auto">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                onClick={handleItemClick}
                onRetry={handleRetry}
                onToggleRead={handleToggleRead}
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
