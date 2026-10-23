import { describe, expect, it } from "vitest";
import { htmlToText, isTextMime, stripTags } from "../../src/text.js";

describe("text helpers", () => {
  it("strips nested and split tags completely", () => {
    expect(stripTags("<scr<script>ipt>alert(1)</scr</script>ipt>")).not.toMatch(/[<>]/);
    expect(stripTags("a <b>bold</b> c")).toBe("a bold c");
    expect(stripTags("a < b")).toBe("a  b");
  });

  it("removes scripts and styles, keeps line breaks", () => {
    const text = htmlToText("<style>p{}</style><p>Hello<br>world</p><script>evil()</script><div>Next</div>");
    expect(text).toBe("Hello\nworld\nNext");
  });

  it("decodes entities without double unescaping", () => {
    expect(htmlToText("Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;x&#39;&nbsp;!")).toBe(`Tom & Jerry <3 "hi" 'x' !`);
    expect(htmlToText("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });

  it("recognizes text MIME types", () => {
    for (const t of [
      "text/plain",
      "text/csv; charset=utf-8",
      "application/json",
      "application/xml",
      "application/ld+json",
      "application/csv",
    ]) {
      expect(isTextMime(t)).toBe(true);
    }
    for (const t of ["application/pdf", "image/png", "application/x-jsonish-binary", "application/octet-stream"]) {
      expect(isTextMime(t)).toBe(false);
    }
  });
});
