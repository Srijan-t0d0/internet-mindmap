import { it, expect } from "vitest";
import { htmlToText } from "./html-text";

it("htmlToText keeps prose, drops markup, decodes entities once", () => {
  const html = `<div class="tweet"><svg viewBox="0 0 9 9"><path d="M1 2"/></svg><p>Rate &amp; throttle</p>
    <ul><li>Fan-Out &lt;in&gt;</li><li>it&#39;s &amp;lt;raw&amp;gt;</li></ul><script>alert(1)</script></div>`;
  expect(htmlToText(html)).toBe("Rate & throttle\n- Fan-Out <in>\n- it's &lt;raw&gt;");
  expect(htmlToText("plain transcript text")).toBe("plain transcript text");
});
