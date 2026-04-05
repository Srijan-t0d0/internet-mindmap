/**
 * Source type colours and labels — single source of truth.
 *
 * CSS_COLORS use CSS custom properties (for DOM elements).
 * HEX_COLORS use raw hex values (for canvas rendering where CSS vars don't work).
 */

export const SOURCE_TYPES = [
  "youtube",
  "reddit",
  "twitter",
  "github",
  "hackernews",
  "substack",
  "blog",
  "other",
] as const;

export type SourceType = (typeof SOURCE_TYPES)[number];

export const SOURCE_LABELS: Record<string, string> = {
  youtube: "YouTube",
  reddit: "Reddit",
  twitter: "X / Twitter",
  github: "GitHub",
  hackernews: "Hacker News",
  substack: "Substack",
  blog: "Blog",
  other: "Web",
};

/** CSS variable references for DOM rendering */
export const SOURCE_CSS_COLORS: Record<string, string> = {
  youtube: "var(--color-source-youtube)",
  reddit: "var(--color-source-reddit)",
  twitter: "var(--color-source-twitter)",
  github: "var(--color-source-github)",
  hackernews: "var(--color-source-hackernews)",
  substack: "var(--color-source-substack)",
  blog: "var(--color-source-blog)",
  other: "var(--color-text-muted)",
};

/** Raw hex values for canvas rendering */
export const SOURCE_HEX_COLORS: Record<string, string> = {
  youtube: "#ff0000",
  reddit: "#ff4500",
  twitter: "#000000",
  github: "#8b5cf6",
  hackernews: "#ff6600",
  substack: "#ff6719",
  blog: "#4a9eff",
  other: "#a0a0a0",
};
