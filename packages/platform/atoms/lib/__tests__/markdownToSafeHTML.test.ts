import { describe, expect, it } from "vitest";

import { markdownToSafeHTML } from "../markdownToSafeHTML";

describe("markdownToSafeHTML", () => {
  it("should return an empty string for null, undefined-like and empty input", () => {
    expect(markdownToSafeHTML(null)).toBe("");
    expect(markdownToSafeHTML("")).toBe("");
  });

  it("should convert markdown to html", () => {
    const html = markdownToSafeHTML("# Title\n\nsome **bold** text");

    expect(html).toContain("<h1");
    expect(html).toContain("Title");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("should render links and lists", () => {
    const html = markdownToSafeHTML("- [cal](https://cal.com)\n- second");

    expect(html).toContain("<ul>");
    expect(html).toContain('href="https://cal.com"');
    expect(html).toContain("second");
  });

  it("should strip script tags", () => {
    const html = markdownToSafeHTML("hello<script>alert('xss')</script>");

    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert('xss')");
    expect(html).toContain("hello");
  });

  it("should strip inline event handlers and javascript urls", () => {
    const html = markdownToSafeHTML(
      `<img src="x" onerror="alert(1)" />\n\n[click](javascript:alert(1))`
    );

    expect(html).not.toContain("onerror");
    expect(html).not.toContain("javascript:");
  });

  it("should keep plain text without markdown syntax intact", () => {
    expect(markdownToSafeHTML("just text")).toContain("just text");
  });
});
