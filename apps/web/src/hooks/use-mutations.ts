"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  retryItem,
  updateItem as apiUpdateItem,
  deleteItem as apiDeleteItem,
} from "../lib/api";
import type { ItemsData } from "./use-items-query";

/**
 * Retry a failed item — invalidates the items cache so the new
 * "pending" status shows up immediately.
 */
export function useRetryItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => retryItem(id),
    onError: (err) => {
      console.error("Retry failed:", err);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

/**
 * Toggle read / rename — optimistic update across all item caches.
 */
export function useUpdateItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { is_read?: boolean; title?: string };
    }) => apiUpdateItem(id, data),

    onMutate: async ({ id, data }) => {
      await qc.cancelQueries({ queryKey: ["items"] });
      const snapshot = qc.getQueriesData<ItemsData>({ queryKey: ["items"] });

      qc.setQueriesData<ItemsData>({ queryKey: ["items"] }, (old) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.map((i) => (i.id === id ? { ...i, ...data } : i)),
        };
      });

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      console.error("Update failed:", _err);
      // Rollback on failure
      ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
    },
  });
}

/**
 * Delete an item — optimistic removal from cache + tag invalidation.
 */
export function useDeleteItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiDeleteItem(id),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["items"] });
      const snapshot = qc.getQueriesData<ItemsData>({ queryKey: ["items"] });

      qc.setQueriesData<ItemsData>({ queryKey: ["items"] }, (old) => {
        if (!old?.items) return old;
        return {
          ...old,
          items: old.items.filter((i) => i.id !== id),
          total: old.total - 1,
        };
      });

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      console.error("Delete failed:", _err);
      ctx?.snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  });
}
