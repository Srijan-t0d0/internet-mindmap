import type { SaveRequest, SaveResponse } from "@internet-mindmap/shared";
import { getApiKey } from "./storage";

const API_BASE = import.meta.env.WXT_API_BASE as string;

/**
 * Save an item to the knowledge base.
 *
 * When called from a content script, we delegate to the background service
 * worker via runtime messaging. MV3 content script fetch() is subject to
 * CORS (uses the page's origin), so the request would be blocked. The
 * background script is not subject to CORS restrictions.
 */
export async function saveItem(
  data: SaveRequest
): Promise<SaveResponse> {
  // If we're in the background service worker, call the API directly.
  // Otherwise (content script / popup), delegate via message passing.
  if ("clients" in globalThis) {
    return saveItemDirect(data);
  }

  const response = await browser.runtime.sendMessage({
    type: "SAVE_ITEM",
    data,
  });

  if (response.error) {
    throw new Error(response.error);
  }
  return response.result;
}

/** Direct API call — runs in the background service worker only. */
export async function saveItemDirect(
  data: SaveRequest
): Promise<SaveResponse> {
  const token = await getApiKey();
  if (!token) {
    throw new Error("API token not configured. Open the extension popup to set it.");
  }

  const response = await fetch(`${API_BASE}/api/save`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || `API error (${response.status})`);
  }

  return response.json();
}
