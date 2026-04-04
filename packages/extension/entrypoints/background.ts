import {
  getApiKey,
  setApiKey,
  getOAuthState,
  setOAuthState,
  clearOAuthState,
} from "../lib/storage";

const API_BASE = import.meta.env.WXT_API_BASE as string;

export default defineBackground(() => {
  // Restrict session storage to trusted extension contexts (not content scripts)
  browser.storage.session.setAccessLevel?.({
    accessLevel: "TRUSTED_CONTEXTS",
  });

  // ─── Save-page shortcut ───────────────────────────────────────────────────

  let lastSaveTime = 0;
  const DEBOUNCE_MS = 2000;

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "save-page") return;

    const now = Date.now();
    if (now - lastSaveTime < DEBOUNCE_MS) return;
    lastSaveTime = now;

    try {
      const token = await getApiKey();
      if (!token) {
        showNotification(
          "Setup Required",
          "Click the Internet Mindmap extension icon to sign in."
        );
        return;
      }

      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      await browser.tabs.sendMessage(tab.id, { action: "show-save-widget" });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not connect to the server.";
      showNotification("Save Failed", message);
    }
  });

  // ─── OAuth flow ───────────────────────────────────────────────────────────
  // Driven from the background so it survives MV3 service worker sleep.
  // The popup just sends a "START_OAUTH" message; we do everything here.

  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    const message = msg as { type: string };

    if (message.type === "START_OAUTH") {
      startOAuth().then(() => sendResponse({ ok: true })).catch((e) => {
        sendResponse({ ok: false, error: String(e) });
      });
      return true; // keep message channel open for async response
    }

    if (message.type === "CANCEL_OAUTH") {
      cancelOAuth().then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  // Watch for the extension-auth content script completing and notifying us
  browser.runtime.onMessage.addListener((msg) => {
    if ((msg as { type: string }).type === "EXTENSION_AUTH_COMPLETE") {
      clearOAuthState();
      // Popup will detect the storage change on its own via getApiKey polling
    }
  });

  // ─── OAuth helpers ────────────────────────────────────────────────────────

  async function startOAuth() {
    const callbackURL = `${API_BASE}/api/auth/extension/callback`;
    const signInUrl = new URL(`${API_BASE}/api/auth/signin/google`);
    signInUrl.searchParams.set("callbackURL", callbackURL);

    const tab = await browser.tabs.create({ url: signInUrl.toString(), active: true });
    await setOAuthState({ tabId: tab.id! });
  }

  async function cancelOAuth() {
    const state = await getOAuthState();
    if (state?.tabId) {
      browser.tabs.remove(state.tabId).catch(() => {});
    }
    await clearOAuthState();
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  function showNotification(title: string, message: string) {
    browser.notifications.create({
      type: "basic",
      iconUrl: "/icons/icon128.png",
      title,
      message,
    });
  }
});
