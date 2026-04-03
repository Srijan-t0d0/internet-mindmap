import type { SaveRequest } from "@internet-mindmap/shared";
import { saveItem } from "./api";

const WIDGET_ID = "internet-mindmap-save-widget";

export function showSaveWidget(data: SaveRequest) {
  // Remove any existing widget
  document.getElementById(WIDGET_ID)?.remove();

  const host = document.createElement("div");
  host.id = WIDGET_ID;
  host.style.cssText = "position:fixed;top:16px;right:16px;z-index:2147483647;";
  const shadow = host.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; margin: 0; padding: 0; }
      :host { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; }
      .panel {
        width: 360px;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08);
        border: 1px solid #e8e4de;
        overflow: hidden;
        animation: slide-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes slide-in {
        from { opacity: 0; transform: translateY(-8px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .header {
        padding: 16px;
        border-bottom: 1px solid #f3f0eb;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .icon {
        width: 28px; height: 28px;
        background: #c4956a;
        border-radius: 6px;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      .title {
        font-size: 13px;
        font-weight: 600;
        color: #2d2d2d;
        line-height: 1.3;
        overflow: hidden;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        flex: 1;
      }
      .body { padding: 16px; }
      .label {
        font-size: 11px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #a0a0a0;
        margin-bottom: 6px;
      }
      textarea {
        width: 100%;
        min-height: 64px;
        padding: 10px 12px;
        font-size: 13px;
        line-height: 1.5;
        color: #2d2d2d;
        background: #faf9f6;
        border: 1px solid #e8e4de;
        border-radius: 8px;
        resize: vertical;
        outline: none;
        font-family: inherit;
        transition: border-color 0.15s;
      }
      textarea:focus {
        border-color: #c4956a;
        box-shadow: 0 0 0 3px rgba(196, 149, 106, 0.12);
      }
      textarea::placeholder { color: #a0a0a0; }
      .actions {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #f3f0eb;
      }
      button {
        flex: 1;
        padding: 8px 16px;
        font-size: 13px;
        font-weight: 500;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s;
        border: none;
        font-family: inherit;
      }
      .btn-save {
        background: #c4956a;
        color: #fff;
      }
      .btn-save:hover { background: #b8845a; }
      .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-skip {
        background: transparent;
        color: #6b6b6b;
        border: 1px solid #e8e4de;
      }
      .btn-skip:hover { background: #f3f0eb; }
      .status {
        padding: 12px 16px;
        font-size: 12px;
        text-align: center;
      }
      .status.success { color: #4a9e6b; background: rgba(74,158,107,0.06); }
      .status.error { color: #d94f4f; background: rgba(217,79,79,0.06); }
    </style>
    <div class="panel">
      <div class="header">
        <div class="icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="2"/>
            <circle cx="5" cy="6" r="1.5"/>
            <circle cx="19" cy="6" r="1.5"/>
            <circle cx="5" cy="18" r="1.5"/>
            <circle cx="19" cy="18" r="1.5"/>
            <line x1="10.5" y1="10.5" x2="6.2" y2="7.2"/>
            <line x1="13.5" y1="10.5" x2="17.8" y2="7.2"/>
            <line x1="10.5" y1="13.5" x2="6.2" y2="16.8"/>
            <line x1="13.5" y1="13.5" x2="17.8" y2="16.8"/>
          </svg>
        </div>
        <div class="title">${escapeHtml(data.title)}</div>
      </div>
      <div class="body">
        <div class="label">Why are you saving this? (optional)</div>
        <textarea id="notes" placeholder="e.g. Good reference for the auth rewrite, interesting take on caching..." autofocus></textarea>
      </div>
      <div class="actions">
        <button class="btn-skip" id="skip">Skip</button>
        <button class="btn-save" id="save">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(host);

  const textarea = shadow.getElementById("notes") as HTMLTextAreaElement;
  const saveBtn = shadow.getElementById("save") as HTMLButtonElement;
  const skipBtn = shadow.getElementById("skip") as HTMLButtonElement;
  const panel = shadow.querySelector(".panel") as HTMLElement;

  // Focus textarea after animation
  setTimeout(() => textarea.focus(), 50);

  async function doSave(withNotes: boolean) {
    saveBtn.disabled = true;
    skipBtn.style.display = "none";
    saveBtn.textContent = "Saving...";

    try {
      const request: SaveRequest = { ...data };
      if (withNotes && textarea.value.trim()) {
        request.notes = textarea.value.trim();
      }
      await saveItem(request);

      // Show success briefly then remove
      panel.querySelector(".body")?.remove();
      panel.querySelector(".actions")?.remove();
      const status = document.createElement("div");
      status.className = "status success";
      status.textContent = "Saved to your knowledge base";
      panel.appendChild(status);

      setTimeout(() => host.remove(), 1500);
    } catch (err) {
      saveBtn.disabled = false;
      skipBtn.style.display = "";
      saveBtn.textContent = "Save";

      const existing = panel.querySelector(".status");
      if (existing) existing.remove();
      const status = document.createElement("div");
      status.className = "status error";
      status.textContent = err instanceof Error ? err.message : "Save failed";
      panel.appendChild(status);
    }
  }

  saveBtn.addEventListener("click", () => doSave(true));
  skipBtn.addEventListener("click", () => doSave(false));

  // Cmd/Ctrl+Enter to save
  textarea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      doSave(true);
    }
    if (e.key === "Escape") {
      host.remove();
    }
  });

  // Close on Escape anywhere
  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      host.remove();
      document.removeEventListener("keydown", onKeydown);
    }
  }
  document.addEventListener("keydown", onKeydown);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
