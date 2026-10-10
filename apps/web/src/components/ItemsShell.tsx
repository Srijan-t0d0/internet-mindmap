"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Item } from "@internet-mindmap/shared";
import SearchBar from "./SearchBar";
import DetailPanel from "./DetailPanel";
import ItemsResults from "./ItemsResults";
import { useFilters } from "../hooks/use-filters";
import { useItemsQuery } from "../hooks/use-items-query";
import { useRetryItem, useUpdateItem, useDeleteItem } from "../hooks/use-mutations";
import { getItemQueryParams, ITEMS_PAGE_SIZE, type InitialItems } from "../lib/item-query";

export default function ItemsShell({ initial }: { initial: InitialItems }) {
  const router = useRouter();
  const [filters, setFilters] = useFilters();
  const params = getItemQueryParams(filters);
  const isSearching = Boolean(params.q);
  const [searchInput, setSearchInput] = useState(params.q ?? "");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [params.page, params.source, params.tag, params.q, filters.view]);

  useEffect(() => {
    setSearchInput(filters.q ?? "");
  }, [filters.q]);

  const { data, isPending, isFetching, error, refetch } = useItemsQuery(params, initial);
  const loadedItems = data?.items ?? [];
  // Keep optimistic read toggles out of the reading list before refetching.
  const items = params.isRead ? loadedItems.filter((item) => !item.is_read) : loadedItems;
  const total = Math.max(0, (data?.total ?? 0) - (loadedItems.length - items.length));
  const pageCount = Math.max(1, Math.ceil(total / ITEMS_PAGE_SIZE));
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  // A deletion can remove the last item on a page. Return to a valid page.
  useEffect(() => {
    if (data && !isFetching && !params.q && !params.graph && params.page > pageCount) {
      void setFilters({ page: pageCount });
    }
  }, [data, isFetching, params.q, params.graph, params.page, pageCount, setFilters]);

  const retryMutation = useRetryItem();
  const updateMutation = useUpdateItem();
  const deleteMutation = useDeleteItem();

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
    void setFilters({ q: query.trim() || null, page: 1 });
  }

  function handleClearSearch() {
    setSearchInput("");
    void setFilters({ q: null, page: 1 });
  }

  function handleRetry(item: Item) {
    retryMutation.mutate(item.id);
  }

  function handleToggleRead(item: Item) {
    updateMutation.mutate({ id: item.id, data: { is_read: !item.is_read } });
  }

  function handleDelete(item: Item) {
    deleteMutation.mutate(item.id);
    setSelectedItemId(null);
  }

  return (
    <>
      <main ref={mainRef} className="flex-1 h-screen overflow-y-auto overflow-x-hidden p-6" role="main">
        <div className="max-w-2xl mx-auto mb-8">
          <SearchBar value={searchInput} onChange={setSearchInput} onSearch={handleSearch} />
          {isSearching && (
            <div className="mt-3 flex items-center gap-2 fade-in">
              <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                Showing results for &quot;{params.q}&quot;
              </span>
              <button className="text-xs font-medium transition-colors duration-150"
                style={{ color: "var(--color-accent)" }} onClick={handleClearSearch}>Clear search</button>
            </div>
          )}
        </div>

        {filters.view === "reading-list" && !isSearching && (
          <h2 className="font-[family-name:var(--font-heading)] text-xl font-semibold mb-5"
            style={{ color: "var(--color-text-primary)" }}>Reading List</h2>
        )}

        {retryMutation.error && (
          <p role="alert" className="max-w-2xl mx-auto mb-4 text-sm" style={{ color: "var(--color-error)" }}>
            Couldn't retry this item. Please try again.
          </p>
        )}

        <div aria-busy={isFetching}>
          {isPending ? (
            <>
              <p role="status" className="sr-only">{params.graph ? "Loading graph items…" : "Loading items…"}</p>
              <div aria-hidden="true" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 max-w-5xl mx-auto">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="h-40 rounded-lg" style={{ backgroundColor: "var(--color-bg-card)", opacity: 0.4 }} />
                ))}
              </div>
            </>
          ) : error ? (
            <div role="alert" className="max-w-2xl mx-auto text-sm">
              <p>Couldn't load your items. Please try again.</p>
              <button type="button" onClick={() => void refetch()} className="mt-3 font-medium"
                style={{ color: "var(--color-accent)" }}>Try again</button>
            </div>
          ) : (
            <ItemsResults items={items} view={filters.view} isSearching={isSearching}
              hasFilters={Boolean(params.source || params.tag)} onClearSearch={handleClearSearch}
              onItemClick={(item) => setSelectedItemId(item.id)} onRetry={handleRetry} onToggleRead={handleToggleRead} />
          )}
        </div>

        {!isSearching && !params.graph && !isPending && !error && (pageCount > 1 || params.page > 1) && (
          <nav aria-label="Item pages" className="max-w-5xl mx-auto mt-6 flex items-center justify-center gap-4 text-sm">
            <button type="button" disabled={params.page <= 1 || isFetching}
              onClick={() => void setFilters({ page: params.page - 1 })}
              className="px-3 py-2 rounded-md disabled:opacity-40"
              style={{ color: "var(--color-accent)", border: "1px solid var(--color-border)" }}>Previous</button>
            <span role="status" style={{ color: "var(--color-text-secondary)" }}>
              Page {params.page} of {pageCount} · {total} items
            </span>
            <button type="button" disabled={params.page >= pageCount || isFetching}
              onClick={() => void setFilters({ page: params.page + 1 })}
              className="px-3 py-2 rounded-md disabled:opacity-40"
              style={{ color: "var(--color-accent)", border: "1px solid var(--color-border)" }}>Next</button>
          </nav>
        )}
      </main>

      {selectedItem && (
        <DetailPanel item={selectedItem} onClose={() => setSelectedItemId(null)}
          onToggleRead={handleToggleRead} onDelete={handleDelete}
          onRetry={handleRetry} isRetrying={retryMutation.isPending} />
      )}
    </>
  );
}
