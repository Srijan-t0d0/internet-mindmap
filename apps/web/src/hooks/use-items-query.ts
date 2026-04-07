"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchItems, searchItems } from "../lib/api";
import type { Item } from "@internet-mindmap/shared";

export interface ItemsData {
  items: Item[];
  total: number;
}

interface UseItemsQueryOptions {
  view: string;
  source: string | null;
  tag: string | null;
  q: string | null;
  initialData?: ItemsData;
}

/**
 * React Query hook for items — handles both list and search modes.
 *
 * - Query key changes whenever filters change → auto-refetch
 * - `placeholderData: keepPreviousData` keeps old data visible during fetch
 * - `refetchInterval` polls every 5s when items are still processing
 * - `initialData` from SSR prevents loading flash on first render
 */
export function useItemsQuery({
  view,
  source,
  tag,
  q,
  initialData,
}: UseItemsQueryOptions) {
  const isSearching = Boolean(q);

  return useQuery<ItemsData>({
    queryKey: isSearching
      ? ["items", "search", { q, source_type: source, tag }]
      : [
          "items",
          "list",
          {
            source_type: source,
            tag,
            is_read: view === "reading-list" ? "false" : null,
          },
        ],
    queryFn: async () => {
      if (isSearching) {
        const data = await searchItems({
          q: q!,
          source_type: source,
          tag,
        });
        return { items: data.items, total: data.count };
      }
      const data = await fetchItems({
        source_type: source,
        tag,
        is_read: view === "reading-list" ? "false" : null,
      });
      return { items: data.items, total: data.total };
    },
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      const items = query.state.data?.items;
      if (
        items?.some(
          (i) => i.status === "pending" || i.status === "processing",
        )
      ) {
        return 5000;
      }
      return false;
    },
  });
}
