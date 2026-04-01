import { extractContent } from "../lib/extract";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message.action === "extract") {
        extractContent().then(sendResponse);
      }
      return true;
    });
  },
});
