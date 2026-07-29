import { MembershipRole } from "@calcom/prisma/enums";
import { describe, expect, it } from "vitest";
import type { ChildrenEventType } from "./childrenEventType";
import { stripChildrenForPayload } from "./childrenEventType";

function buildChild(overrides: Partial<ChildrenEventType> = {}): ChildrenEventType {
  return {
    value: "42",
    label: "Alice",
    created: true,
    slug: "30min",
    hidden: false,
    owner: {
      avatar: "https://example.com/alice.png",
      id: 42,
      email: "alice@example.com",
      name: "Alice",
      username: "alice",
      membership: MembershipRole.MEMBER,
      eventTypeSlugs: ["30min", "60min"],
      profile: {
        id: 1,
        upId: "usr-42",
        username: "alice",
        organizationId: null,
        organization: null,
      },
    },
    ...overrides,
  };
}

describe("stripChildrenForPayload", () => {
  it("keeps only the server-relevant fields", () => {
    expect(stripChildrenForPayload([buildChild()])).toEqual([
      {
        hidden: false,
        owner: {
          id: 42,
          name: "Alice",
          email: "alice@example.com",
          eventTypeSlugs: ["30min", "60min"],
        },
      },
    ]);
  });

  it("drops display-only fields such as avatar, username, membership and profile", () => {
    const [stripped] = stripChildrenForPayload([buildChild()]);

    expect(stripped).not.toHaveProperty("value");
    expect(stripped).not.toHaveProperty("label");
    expect(stripped).not.toHaveProperty("created");
    expect(stripped).not.toHaveProperty("slug");
    expect(stripped.owner).not.toHaveProperty("avatar");
    expect(stripped.owner).not.toHaveProperty("username");
    expect(stripped.owner).not.toHaveProperty("membership");
    expect(stripped.owner).not.toHaveProperty("profile");
  });

  it("preserves the hidden flag per child and the original order", () => {
    const children = [
      buildChild({ hidden: true, owner: { ...buildChild().owner, id: 1, name: "One" } }),
      buildChild({ hidden: false, owner: { ...buildChild().owner, id: 2, name: "Two" } }),
    ];

    expect(stripChildrenForPayload(children)).toEqual([
      {
        hidden: true,
        owner: { id: 1, name: "One", email: "alice@example.com", eventTypeSlugs: ["30min", "60min"] },
      },
      {
        hidden: false,
        owner: { id: 2, name: "Two", email: "alice@example.com", eventTypeSlugs: ["30min", "60min"] },
      },
    ]);
  });

  it("returns an empty array for no children", () => {
    expect(stripChildrenForPayload([])).toEqual([]);
  });

  it("does not mutate the input", () => {
    const child = buildChild();
    const snapshot = structuredClone(child);

    stripChildrenForPayload([child]);

    expect(child).toEqual(snapshot);
  });
});
