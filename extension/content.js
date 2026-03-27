// Content script: runs on every page
// Extracts content using Readability when triggered

function detectSourceType(url) {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  return "blog";
}

function extractTwitterContent() {
  // Twitter-specific DOM extraction fallback
  const tweetTexts = document.querySelectorAll('[data-testid="tweetText"]');
  if (tweetTexts.length > 0) {
    return Array.from(tweetTexts)
      .map((el) => el.textContent)
      .join("\n\n");
  }
  return null;
}

function extractContent() {
  const url = window.location.href;
  const sourceType = detectSourceType(url);

  let extractedText = "";
  let title = document.title;

  if (sourceType === "youtube") {
    // For YouTube, just send URL + title; transcript is fetched server-side
    title = document.title.replace(" - YouTube", "").trim();
    // Grab description if available
    const description = document.querySelector(
      "#description-inline-expander, ytd-text-inline-expander"
    );
    extractedText = description ? description.textContent.trim() : "";
  } else if (sourceType === "twitter") {
    // Try Readability first, fall back to DOM extraction
    try {
      const clone = document.cloneNode(true);
      const article = new Readability(clone).parse();
      if (article && article.textContent.length > 100) {
        extractedText = article.textContent;
        title = article.title || title;
      } else {
        extractedText = extractTwitterContent() || "";
      }
    } catch {
      extractedText = extractTwitterContent() || "";
    }
  } else {
    // Blog, Reddit, and everything else: use Readability
    try {
      const clone = document.cloneNode(true);
      const article = new Readability(clone).parse();
      if (article) {
        extractedText = article.textContent;
        title = article.title || title;
      }
    } catch (err) {
      console.error("Readability extraction failed:", err);
      // Fallback: grab body text
      extractedText = document.body.innerText.slice(0, 50000);
    }
  }

  return { url, title, source_type: sourceType, extractedText };
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "extract") {
    const data = extractContent();
    sendResponse(data);
  }
  return true; // keep channel open for async response
});
