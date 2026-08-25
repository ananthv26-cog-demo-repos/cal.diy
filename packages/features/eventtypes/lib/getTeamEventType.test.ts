import { beforeEach, describe, expect, it, vi } from "vitest";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

vi.mock("@calcom/prisma", () => ({
  prisma: { eventType: { findFirst } },
  default: { eventType: { findFirst } },
}));

import { getTeamEventType } from "./getTeamEventType";

describe("getTeamEventType", () => {
  beforeEach(() => {
    findFirst.mockReset().mockResolvedValue({ id: 1 });
  });

  it("scopes the lookup to a top level team when no org slug is given", async () => {
    await getTeamEventType("acme", "30min", null);

    const args = findFirst.mock.calls[0][0];
    expect(args.where.team).toEqual({ slug: "acme", parent: null });
  });

  it("scopes the lookup to the org's child team when an org slug is given", async () => {
    await getTeamEventType("acme", "30min", "my-org");

    const args = findFirst.mock.calls[0][0];
    expect(args.where.team).toEqual({ slug: "acme", parent: { slug: "my-org" } });
  });

  it("matches both the plain slug and the team-id suffixed slug, preferring the shortest", async () => {
    await getTeamEventType("acme", "30min", null);

    const args = findFirst.mock.calls[0][0];
    expect(args.where.OR).toEqual([{ slug: "30min" }, { slug: { startsWith: "30min-team-id-" } }]);
    expect(args.orderBy).toEqual({ slug: "asc" });
  });

  it("selects the fields the Booker needs and returns the event type", async () => {
    const result = await getTeamEventType("acme", "30min", null);

    const args = findFirst.mock.calls[0][0];
    expect(args.select).toMatchObject({ id: true, slug: true, length: true, hosts: expect.anything() });
    expect(result).toEqual({ id: 1 });
  });

  it("returns null when no event type matches", async () => {
    findFirst.mockResolvedValue(null);
    await expect(getTeamEventType("acme", "nope", null)).resolves.toBeNull();
  });
});
