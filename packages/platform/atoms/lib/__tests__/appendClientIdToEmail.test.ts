import { describe, expect, it } from "vitest";

import { appendClientIdToEmail } from "../appendClientIdToEmail";

describe("appendClientIdToEmail", () => {
  it("should append the client id as a plus suffix to the local part", () => {
    expect(appendClientIdToEmail("alice@example.com", "clientid123")).toBe(
      "alice+clientid123@example.com"
    );
  });

  it("should preserve subdomains and multi-part TLDs in the domain", () => {
    expect(appendClientIdToEmail("bob@mail.example.co.uk", "abc")).toBe("bob+abc@mail.example.co.uk");
  });

  it("should keep an existing plus suffix and append after it", () => {
    expect(appendClientIdToEmail("carol+existing@example.com", "abc")).toBe(
      "carol+existing+abc@example.com"
    );
  });

  it("should only use the first two segments when the email contains multiple @", () => {
    expect(appendClientIdToEmail("dave@first@second", "abc")).toBe("dave+abc@first");
  });

  it("should produce an undefined domain when there is no @ in the input", () => {
    expect(appendClientIdToEmail("not-an-email", "abc")).toBe("not-an-email+abc@undefined");
  });

  it("should handle an empty client id", () => {
    expect(appendClientIdToEmail("erin@example.com", "")).toBe("erin+@example.com");
  });
});
