import { Readability } from "@mozilla/readability";
import { detectSourceType } from "@internet-mindmap/shared";

function extractTwitterContent(): string | null {
  const tweetTexts = document.querySelectorAll('[data-testid="tweetText"]');
  if (tweetTexts.length > 0) {
    return Array.from(tweetTexts)
      .map((el) => el.textContent)
      .join("\n\n");
  }
  return null;
}

export function extractContent(): {
  url: string;
  title: string;
  source_type: string;
  extractedText: string;
} {
  const url = window.location.href;
  const sourceType = detectSourceType(url);

  let extractedText = "";
  let title = document.title;

  if (sourceType === "youtube") {
    title = document.title.replace(" - YouTube", "").trim();
    const description = document.querySelector(
      "#description-inline-expander, ytd-text-inline-expander"
    );
    extractedText = description ? description.textContent!.trim() : "";
  } else if (sourceType === "twitter") {
    try {
      const clone = document.cloneNode(true) as Document;
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
    try {
      const clone = document.cloneNode(true) as Document;
      const article = new Readability(clone).parse();
      if (article) {
        extractedText = article.textContent;
        title = article.title || title;
      }
    } catch (err) {
      console.error("Readability extraction failed:", err);
      extractedText = document.body.innerText.slice(0, 50000);
    }
  }

  return { url, title, source_type: sourceType, extractedText };
}
