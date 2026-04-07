"use client";

import { useQueryStates, parseAsString, parseAsStringLiteral } from "nuqs";
import type { ViewMode } from "@internet-mindmap/shared";

const viewModes = ["cards", "list", "reading-list", "graph"] as const;

export const filterParsers = {
  view: parseAsStringLiteral<ViewMode>(viewModes).withDefault("cards"),
  source: parseAsString,
  tag: parseAsString,
  q: parseAsString,
};

/**
 * URL-driven filter state via nuqs.
 *
 * Replaces manual pushState/popstate with declarative URL params.
 * Every filter change updates the URL (push history) and returns
 * the new values — React Query keys pick them up automatically.
 */
export function useFilters() {
  return useQueryStates(filterParsers, {
    history: "push",
    shallow: true, // Don't trigger server component re-render
  });
}
