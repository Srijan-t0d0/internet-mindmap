import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

it("preserves the login sections, content, and all three sign-in CTAs", async () => {
  const { default: LoginPage } = await import("../components/LoginPage");
  const html = renderToStaticMarkup(React.createElement(LoginPage));
  const text = (markup: string) => markup.replace(/<[^>]*>/g, "");

  expect([...html.matchAll(/<(nav|section|footer)\b/g)].map((match) => match[1]))
    .toEqual(["nav", "section", "section", "section", "section", "footer"]);
  expect([...html.matchAll(/<h[12][^>]*>(.*?)<\/h[12]>/g)].map((match) => text(match[1])))
    .toEqual([
      "Everythingyou read,remembered.",
      "Save once. Find anything.",
      "Built for how ideas work",
      "Start building yoursecond memory.",
    ]);
  expect([...html.matchAll(/<button class="([^"]*)">(.*?)<\/button>/g)]
    .map((match) => [match[1], text(match[2])]))
    .toEqual([
      ["lp-nav-btn", "Sign in"],
      ["lp-btn-dark", "Continue with Google — it&#x27;s free"],
      ["lp-btn-google", "Continue with Google — it&#x27;s free"],
    ]);
  expect(html.match(/class="lp-step"/g)).toHaveLength(3);
  expect(html.match(/class="lp-feat-cell"/g)).toHaveLength(4);
  expect(html.match(/class="lp-source-pill"/g)).toHaveLength(7);
  expect(html.match(/class="lp-fc lp-fc-\d"/g)).toHaveLength(3);
  expect(html).not.toContain("<style>");
});
