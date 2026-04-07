"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchTags } from "../lib/api";
import type { Tag } from "@internet-mindmap/shared";

/**
 * React Query hook for tags.
 *
 * Tags rarely change — 5 min staleTime avoids redundant refetches
 * that the old code triggered on every filter click.
 */
export function useTagsQuery(initialData?: Tag[]) {
  return useQuery<Tag[]>({
    queryKey: ["tags"],
    queryFn: async () => {
      const data = await fetchTags();
      return data.tags;
    },
    initialData,
    initialDataUpdatedAt: initialData ? Date.now() : undefined,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
