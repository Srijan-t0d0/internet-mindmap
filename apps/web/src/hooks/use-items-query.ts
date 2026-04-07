"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { fetchItems, searchItems } from "../lib/api";
import type { Item } from "@internet-mindmap/shared";

export interface ItemsData {
  items: Item[];
  total: number;
}

interface UseItemsQueryOptions {
  /** Only used for search mode — tag/source filtering for search stays server-side */
  source: string | null;
  tag: string | null;
  q: string | null;
  initialData?: ItemsData;
}

/**
 * React Query hook for items — handles both list and search modes.
 *
 * List mode: fetches ALL items once (limit 500). Tag, source, and read-status
 * filtering is done client-side in ItemsShell via useMemo. This avoids a
 * Vercel→CF Worker round-trip on every filter change and fixes the initialData
 * masking bug where unfiltered SSR data showed for new query keys.
 *
 * Search mode: server-side vector search + optional tag/source filtering.
 */
export function useItemsQuery({
  source,
  tag,
  q,
  initialData,
}: UseItemsQueryOptions) {
  const isSearching = Boolean(q);

  return useQuery<ItemsData>({
    queryKey: isSearching
      ? ["items", "search", { q, source_type: source, tag }]
      : ["items", "list"],
    queryFn: async () => {
      if (isSearching) {
        const data = await searchItems({
          q: q!,
          source_type: source,
          tag,
        });
        return { items: data.items, total: data.count };
      }
      const data = await fetchItems({ limit: 500 });
      return { items: data.items, total: data.total };
    },
    initialData: isSearching ? undefined : initialData,
    initialDataUpdatedAt: !isSearching && initialData ? Date.now() : undefined,
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
