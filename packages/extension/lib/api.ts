import type { SaveRequest, SaveResponse } from "@internet-mindmap/shared";
import { getApiToken } from "./storage";

export async function saveItem(
  data: SaveRequest
): Promise<SaveResponse> {
  const token = await getApiToken();
  if (!token) {
    throw new Error("API token not configured. Open the extension popup to set it.");
  }

  const response = await fetch(`${import.meta.env.WXT_API_BASE}/api/save`, {
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
