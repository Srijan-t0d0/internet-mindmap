import type { Item } from "@internet-mindmap/shared";

export const ITEMS_PAGE_SIZE = 50;

export interface ItemsData {
  items: Item[];
  total: number;
}

export interface ItemQueryParams {
  q: string | null;
  source: string | null;
  tag: string | null;
  isRead: boolean;
  graph: boolean;
  page: number;
}

export interface InitialItems {
  data: ItemsData;
  params: ItemQueryParams;
  updatedAt: number;
}

export function getItemQueryParams(filters: {
  q?: string | null;
  source?: string | null;
  tag?: string | null;
  view?: string | null;
  page?: string | number | null;
}): ItemQueryParams {
  const q = filters.q?.trim() || null;
  const page = Number(filters.page ?? 1);
  const graph = filters.view === "graph";
  return {
    q,
    source: filters.source || null,
    tag: filters.tag || null,
    isRead: !q && filters.view === "reading-list",
    graph,
    page: q || graph ? 1 : Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}

export function itemsQueryKey(params: ItemQueryParams) {
  // Search results don't depend on their presentation (cards, list or graph).
  return ["items", params.q ? "search" : params.graph ? "graph" : "list", {
    q: params.q,
    source: params.source,
    tag: params.tag,
    isRead: params.isRead,
    page: params.page,
  }] as const;
}

export function matchesInitialItems(params: ItemQueryParams, initial?: InitialItems) {
  return !!initial && JSON.stringify(itemsQueryKey(params)) === JSON.stringify(itemsQueryKey(initial.params));
}
