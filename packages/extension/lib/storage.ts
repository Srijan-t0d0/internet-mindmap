const STORAGE_KEY = "internet-mindmap-api-token";

export async function getApiToken(): Promise<string | null> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as string) ?? null;
}

export async function setApiToken(token: string): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: token });
}
