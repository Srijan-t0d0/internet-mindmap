import { describe, it, expect } from "vitest";
import { detectSourceType } from "./utils";

describe("detectSourceType", () => {
  it("detects youtube.com", () => {
    expect(detectSourceType("https://www.youtube.com/watch?v=abc123")).toBe("youtube");
  });

  it("detects youtu.be", () => {
    expect(detectSourceType("https://youtu.be/abc123")).toBe("youtube");
  });

  it("detects reddit.com", () => {
    expect(detectSourceType("https://www.reddit.com/r/typescript/comments/123")).toBe("reddit");
  });

  it("detects twitter.com", () => {
    expect(detectSourceType("https://twitter.com/user/status/123")).toBe("twitter");
  });

  it("detects x.com", () => {
    expect(detectSourceType("https://x.com/user/status/123")).toBe("twitter");
  });

  it("detects github.com", () => {
    expect(detectSourceType("https://github.com/kepano/defuddle/issues/42")).toBe("github");
  });

  it("detects news.ycombinator.com", () => {
    expect(detectSourceType("https://news.ycombinator.com/item?id=12345")).toBe("hackernews");
  });

  it("detects substack.com", () => {
    expect(detectSourceType("https://example.substack.com/p/my-post")).toBe("substack");
  });

  it("returns blog for unknown URLs", () => {
    expect(detectSourceType("https://example.com/article")).toBe("blog");
  });
});
