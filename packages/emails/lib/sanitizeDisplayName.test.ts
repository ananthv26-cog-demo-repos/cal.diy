import { describe, expect, it } from "vitest";
import { sanitizeDisplayName } from "./sanitizeDisplayName";

describe("sanitizeDisplayName", () => {
  it("returns the input unchanged when it does not match the 'Name <email>' shape", () => {
    expect(sanitizeDisplayName("plain-string")).toBe("plain-string");
    expect(sanitizeDisplayName("noreply@example.com")).toBe("noreply@example.com");
    expect(sanitizeDisplayName("")).toBe("");
  });

  it("keeps a clean display name and email intact", () => {
    expect(sanitizeDisplayName("John Doe <john@example.com>")).toBe("John Doe <john@example.com>");
  });

  it("replaces disallowed characters in the name with a single space", () => {
    expect(sanitizeDisplayName("Doe, John <john@example.com>")).toBe("Doe John <john@example.com>");
    // `sanitize` collapses runs of whitespace but never trims, so replacement can leave a
    // leading/doubled space. Pinned as current behavior, not as a desired guarantee.
    expect(sanitizeDisplayName('"Quoted" Name <a@b.com>')).toBe(" Quoted Name <a@b.com>");
    expect(sanitizeDisplayName("A;B:C(D) <a@b.com>")).toBe("A B C D  <a@b.com>");
  });

  it("collapses consecutive whitespace produced by sanitization", () => {
    expect(sanitizeDisplayName("A,,,B <a@b.com>")).toBe("A B <a@b.com>");
    expect(sanitizeDisplayName("A   B <a@b.com>")).toBe("A B <a@b.com>");
  });

  it("does not sanitize characters inside the email portion", () => {
    // The regex captures everything between < and > as the email and leaves it untouched.
    expect(sanitizeDisplayName("Name <a;b@example.com>")).toBe("Name <a;b@example.com>");
  });

  it("uses a lazy name match so the name is the shortest leading segment", () => {
    // `.*?` matches "Team", and everything after the first " <" becomes the email portion (untouched).
    expect(sanitizeDisplayName("Team <A> Lead <lead@example.com>")).toBe("Team <A> Lead <lead@example.com>");
  });
});
