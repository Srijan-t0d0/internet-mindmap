import type { SourceType } from "./types";

export function detectSourceType(url: string): SourceType {
  if (url.includes("youtube.com") || url.includes("youtu.be")) return "youtube";
  if (url.includes("reddit.com")) return "reddit";
  if (url.includes("twitter.com") || url.includes("x.com")) return "twitter";
  if (url.includes("github.com")) return "github";
  if (url.includes("news.ycombinator.com")) return "hackernews";
  if (url.includes("substack.com")) return "substack";
  return "blog";
}
