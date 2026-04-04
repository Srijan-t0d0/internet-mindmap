// Long-lived session token — persists across browser restarts (storage.local)
const TOKEN_KEY = "internet-mindmap-api-key";

export async function getApiKey(): Promise<string | null> {
  const result = await browser.storage.local.get(TOKEN_KEY);
  return (result[TOKEN_KEY] as string) ?? null;
}

export async function setApiKey(key: string): Promise<void> {
  if (key) {
    await browser.storage.local.set({ [TOKEN_KEY]: key });
  } else {
    await browser.storage.local.remove(TOKEN_KEY);
  }
}

// Ephemeral OAuth state — only lives for the duration of the sign-in flow.
// Uses storage.session (in-memory, cleared on browser close) so the pending
// tab ID and state nonce don't linger on disk after a failed auth attempt.
const OAUTH_STATE_KEY = "internet-mindmap-oauth-state";

export interface OAuthState {
  tabId: number;
}

export async function setOAuthState(state: OAuthState): Promise<void> {
  await browser.storage.session.set({ [OAUTH_STATE_KEY]: state });
}

export async function getOAuthState(): Promise<OAuthState | null> {
  const result = await browser.storage.session.get(OAUTH_STATE_KEY);
  return (result[OAUTH_STATE_KEY] as OAuthState) ?? null;
}

export async function clearOAuthState(): Promise<void> {
  await browser.storage.session.remove(OAUTH_STATE_KEY);
}
