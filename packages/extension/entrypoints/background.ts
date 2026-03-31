import { saveItem } from "../lib/api";
import { getApiToken } from "../lib/storage";

export default defineBackground(() => {
  let lastSaveTime = 0;
  const DEBOUNCE_MS = 2000;

  browser.commands.onCommand.addListener(async (command) => {
    if (command !== "save-page") return;

    const now = Date.now();
    if (now - lastSaveTime < DEBOUNCE_MS) return;
    lastSaveTime = now;

    try {
      const token = await getApiToken();
      if (!token) {
        showNotification(
          "Setup Required",
          "Click the Internet Mindmap extension icon to set your API token."
        );
        return;
      }

      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab || !tab.id) return;

      const data = await browser.tabs.sendMessage(tab.id, {
        action: "extract",
      });

      if (!data || !data.url) {
        showNotification("Save Failed", "Could not extract page content.");
        return;
      }

      await saveItem(data);
      showNotification("Saved!", `"${data.title}" is being processed.`);
    } catch (err) {
      console.error("Save failed:", err);
      const message =
        err instanceof Error
          ? err.message
          : "Could not connect to the server.";
      showNotification("Save Failed", message);
    }
  });

  function showNotification(title: string, message: string) {
    browser.notifications.create({
      type: "basic",
      iconUrl: "/icons/icon128.png",
      title,
      message,
    });
  }
});
