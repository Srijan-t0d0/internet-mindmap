import { extractContent } from "../lib/extract";
import { showSaveWidget } from "../lib/save-widget";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === "extract") {
        extractContent().then(sendResponse);
        return true;
      }
      if (message.action === "show-save-widget") {
        extractContent().then((data) => {
          showSaveWidget(data);
          sendResponse({ ok: true });
        });
        return true;
      }
    });
  },
});
