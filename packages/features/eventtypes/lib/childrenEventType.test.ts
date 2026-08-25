import { MembershipRole } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import type { ChildrenEventType } from "./childrenEventType";
import { stripChildrenForPayload } from "./childrenEventType";

function buildChild(overrides: Partial<ChildrenEventType> = {}): ChildrenEventType {
  return {
    value: "1",
    label: "Child",
    created: true,
    slug: "child-slug",
    hidden: false,
    owner: {
      avatar: "https://cal.com/avatar.png",
      id: 1,
      email: "owner@example.com",
      name: "Owner",
      username: "owner",
      membership: MembershipRole.MEMBER,
      eventTypeSlugs: ["a", "b"],
      profile: {
        id: null,
        upId: "usr-1",
        username: "owner",
        organizationId: null,
        organization: null,
      },
    },
    ...overrides,
  };
}

describe("stripChildrenForPayload", () => {
  it("keeps only the fields the server needs", () => {
    expect(stripChildrenForPayload([buildChild()])).toEqual([
      {
        hidden: false,
        owner: {
          id: 1,
          name: "Owner",
          email: "owner@example.com",
          eventTypeSlugs: ["a", "b"],
        },
      },
    ]);
  });

  it("drops display-only fields such as avatar, username, membership and profile", () => {
    const [stripped] = stripChildrenForPayload([buildChild()]);
    expect(stripped).not.toHaveProperty("value");
    expect(stripped).not.toHaveProperty("label");
    expect(stripped).not.toHaveProperty("slug");
    expect(stripped.owner).not.toHaveProperty("avatar");
    expect(stripped.owner).not.toHaveProperty("username");
    expect(stripped.owner).not.toHaveProperty("membership");
    expect(stripped.owner).not.toHaveProperty("profile");
  });

  it("preserves the hidden flag per child and the input ordering", () => {
    const result = stripChildrenForPayload([
      buildChild({ hidden: true, owner: { ...buildChild().owner, id: 7 } }),
      buildChild({ hidden: false, owner: { ...buildChild().owner, id: 8 } }),
    ]);
    expect(result.map((child) => [child.owner.id, child.hidden])).toEqual([
      [7, true],
      [8, false],
    ]);
  });

  it("returns an empty array for no children", () => {
    expect(stripChildrenForPayload([])).toEqual([]);
  });
});
