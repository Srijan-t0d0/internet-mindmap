import {
  getApiKey,
  setApiKey,
  getOAuthState,
  setOAuthState,
  clearOAuthState,
  setUserEmail,
} from "../lib/storage";
import { saveItemDirect } from "../lib/api";

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
    if (command !== "save-page" && command !== "save-page-with-notes") return;

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

      // Inject the content script on-demand — activeTab grants temporary
      // permission when the user triggers a keyboard shortcut, so we don't
      // need persistent host_permissions (which Chrome defaults to "Ask").
      try {
        await browser.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content-scripts/content.js"],
        });
      } catch {
        // Already injected or page doesn't allow scripts (chrome://, etc.)
      }

      if (command === "save-page-with-notes") {
        // Show the widget so the user can add notes
        await browser.tabs.sendMessage(tab.id, { action: "show-save-widget" });
      } else {
        // Quick save — extract content and save immediately via background
        const data = await browser.tabs.sendMessage(tab.id, { action: "extract" });
        await saveItemDirect(data);
        showNotification("Saved", data.title || "Page saved to your knowledge base");
      }
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

    if (message.type === "SAVE_ITEM") {
      saveItemDirect((msg as { type: string; data: any }).data)
        .then((result) => sendResponse({ result }))
        .catch((e) => sendResponse({ error: e instanceof Error ? e.message : String(e) }));
      return true; // keep message channel open for async response
    }
  });

  // Watch for the extension-auth content script completing and notifying us
  browser.runtime.onMessage.addListener((msg) => {
    if ((msg as { type: string }).type === "EXTENSION_AUTH_COMPLETE") {
      clearOAuthState();
      // Fetch and store the user's email for display in the popup
      fetchAndStoreEmail();
    }
  });

  async function fetchAndStoreEmail() {
    try {
      const token = await getApiKey();
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/auth/get-session`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const session = await res.json();
      if (session?.user?.email) {
        await setUserEmail(session.user.email);
      }
    } catch {
      // Non-critical — popup still works without email
    }
  }

  // ─── OAuth helpers ────────────────────────────────────────────────────────

  async function startOAuth() {
    const callbackURL = `${API_BASE}/api/auth/extension/callback`;

    // Better Auth's sign-in/social is a POST endpoint that returns
    // { url: "<google-oauth-url>", redirect: true }. We POST from the
    // background script, then open the returned Google URL in a new tab.
    const res = await fetch(`${API_BASE}/api/auth/sign-in/social`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "google", callbackURL }),
    });

    if (!res.ok) {
      throw new Error(`OAuth initiation failed: ${res.status}`);
    }

    const data = (await res.json()) as { url: string; redirect: boolean };
    const tab = await browser.tabs.create({ url: data.url, active: true });
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
