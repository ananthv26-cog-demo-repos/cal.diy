import { describe, expect, it } from "vitest";
import { sanitizeDisplayName } from "./sanitizeDisplayName";

describe("sanitizeDisplayName", () => {
  it("returns the input untouched when it is not in `name <email>` format", () => {
    expect(sanitizeDisplayName("someone@example.com")).toBe("someone@example.com");
    expect(sanitizeDisplayName("Just A Name")).toBe("Just A Name");
    expect(sanitizeDisplayName("")).toBe("");
  });

  it("keeps a clean display name as is", () => {
    expect(sanitizeDisplayName("Jane Doe <jane@example.com>")).toBe("Jane Doe <jane@example.com>");
  });

  it("replaces header-injection characters in the display name with spaces", () => {
    expect(sanitizeDisplayName('Jane;,"<>():Doe <jane@example.com>')).toBe("Jane Doe <jane@example.com>");
  });

  it("collapses repeated whitespace created by sanitizing", () => {
    expect(sanitizeDisplayName("Jane   ;;;   Doe <jane@example.com>")).toBe("Jane Doe <jane@example.com>");
  });

  it("does not sanitize the email part", () => {
    expect(sanitizeDisplayName("Jane <jane+tag:1@example.com>")).toBe("Jane <jane+tag:1@example.com>");
  });

  it("only sanitizes up to the first ` <` separator", () => {
    expect(sanitizeDisplayName("A <b> C <c@example.com>")).toBe("A <b> C <c@example.com>");
  });
});
