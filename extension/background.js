// Background service worker (MV3)
// Receives extracted content from content script and sends to API

const API_BASE = "http://localhost:3000"; // Change for production
const API_TOKEN = "ext-dev-token"; // Change for production

// Debounce: prevent double-saves from rapid ⌘⇧S
let lastSaveTime = 0;
const DEBOUNCE_MS = 2000;

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "save-page") return;

  const now = Date.now();
  if (now - lastSaveTime < DEBOUNCE_MS) return;
  lastSaveTime = now;

  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab || !tab.id) return;

    // Ask content script to extract
    const data = await chrome.tabs.sendMessage(tab.id, { action: "extract" });

    if (!data || !data.url) {
      showNotification("Save Failed", "Could not extract page content.");
      return;
    }

    // Send to API
    const response = await fetch(`${API_BASE}/api/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_TOKEN}`,
      },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      showNotification("Saved!", `"${data.title}" is being processed.`);
    } else {
      const err = await response.json().catch(() => ({ error: "Unknown error" }));
      showNotification("Save Failed", err.error || "API error");
    }
  } catch (err) {
    console.error("Save failed:", err);
    showNotification("Save Failed", "Could not connect to the server.");
  }
});

function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon128.png",
    title,
    message,
  });
}
