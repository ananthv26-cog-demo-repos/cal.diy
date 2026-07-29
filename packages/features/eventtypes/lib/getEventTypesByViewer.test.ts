import { MembershipRole } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import { compareMembership } from "./getEventTypesByViewer";

describe("compareMembership", () => {
  it("ranks OWNER above ADMIN and MEMBER", () => {
    expect(compareMembership(MembershipRole.OWNER, MembershipRole.ADMIN)).toBe(true);
    expect(compareMembership(MembershipRole.OWNER, MembershipRole.MEMBER)).toBe(true);
  });

  it("ranks ADMIN above MEMBER", () => {
    expect(compareMembership(MembershipRole.ADMIN, MembershipRole.MEMBER)).toBe(true);
  });

  it("returns false when the first role is lower", () => {
    expect(compareMembership(MembershipRole.MEMBER, MembershipRole.ADMIN)).toBe(false);
    expect(compareMembership(MembershipRole.ADMIN, MembershipRole.OWNER)).toBe(false);
  });

  it("returns false for equal roles", () => {
    for (const role of Object.values(MembershipRole)) {
      expect(compareMembership(role, role)).toBe(false);
    }
  });
});
