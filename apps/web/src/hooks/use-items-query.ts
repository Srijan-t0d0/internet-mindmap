"use client";

import { useQuery, queryOptions } from "@tanstack/react-query";
import { fetchItems, searchItems } from "../lib/api";
import {
  ITEMS_PAGE_SIZE,
  itemsQueryKey,
  matchesInitialItems,
  type ItemQueryParams,
  type ItemsData,
  type InitialItems,
} from "../lib/item-query";

export type { ItemsData } from "../lib/item-query";

export function getItemsQueryOptions(params: ItemQueryParams, initial?: InitialItems) {
  const matches = matchesInitialItems(params, initial);
  // The server sends just one page, even for graph mode. Only seed a graph
  // cache when that page is the entire collection; otherwise finish on demand.
  const canSeed = matches && (!params.graph || !!params.q || initial!.data.items.length >= initial!.data.total);

  return queryOptions<ItemsData>({
    queryKey: itemsQueryKey(params),
    queryFn: async ({ signal, client, queryKey }) => {
      if (params.q) {
        const data = await searchItems({
          q: params.q,
          source_type: params.source,
          tag: params.tag,
        }, signal);
        return { items: data.items, total: data.count };
      }

      const filters = {
        source_type: params.source,
        tag: params.tag,
        is_read: params.isRead ? "false" : undefined,
      };
      if (!params.graph) {
        const data = await fetchItems({
          ...filters,
          limit: ITEMS_PAGE_SIZE,
          offset: (params.page - 1) * ITEMS_PAGE_SIZE,
        }, signal);
        return { items: data.items, total: data.total };
      }

      // ponytail: graph ranking needs all items; add a lightweight graph endpoint if library payloads become costly.
      // Reuse the SSR first page once. Later refetches must start fresh.
      const canReuseFirstPage = matches && initial && !client.getQueryData(queryKey)
        && !client.getQueryState(queryKey)?.isInvalidated && Date.now() - initial.updatedAt < 60_000;
      let page = canReuseFirstPage
        ? initial!.data
        : await fetchItems({ ...filters, limit: 500 }, signal);
      const items = [...page.items];
      let total = page.total;
      while (items.length < total && page.items.length > 0) {
        page = await fetchItems({ ...filters, limit: 500, offset: items.length }, signal);
        items.push(...page.items);
        total = page.total;
      }
      return { items, total };
    },
    initialData: canSeed ? initial!.data : undefined,
    initialDataUpdatedAt: canSeed ? initial!.updatedAt : undefined,
    staleTime: 60_000,
    refetchInterval: (query) =>
      query.state.data?.items.some((item) => item.status === "pending" || item.status === "processing")
        ? 5000
        : false,
  });
}

export function useItemsQuery(params: ItemQueryParams, initial?: InitialItems) {
  return useQuery(getItemsQueryOptions(params, initial));
}
