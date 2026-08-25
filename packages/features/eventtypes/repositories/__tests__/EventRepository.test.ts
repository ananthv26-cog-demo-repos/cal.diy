import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicEvent, prismaMock } = vi.hoisted(() => ({
  getPublicEvent: vi.fn(),
  prismaMock: { eventType: {} },
}));

vi.mock("@calcom/features/eventtypes/lib/getPublicEvent", () => ({ getPublicEvent }));
vi.mock("@calcom/prisma", () => ({ default: prismaMock, prisma: prismaMock }));

import { EventRepository } from "../EventRepository";

describe("EventRepository.getPublicEvent", () => {
  beforeEach(() => {
    getPublicEvent.mockReset().mockResolvedValue({ id: 1 });
  });

  it("forwards the input, the prisma client and the current user id in the expected order", async () => {
    const result = await EventRepository.getPublicEvent(
      {
        username: "alice",
        eventSlug: "30min",
        isTeamEvent: true,
        org: "acme",
        fromRedirectOfNonOrgLink: true,
      },
      99
    );

    expect(getPublicEvent).toHaveBeenCalledWith("alice", "30min", true, "acme", prismaMock, true, 99);
    expect(result).toEqual({ id: 1 });
  });

  it("leaves the user id undefined for anonymous visitors", async () => {
    await EventRepository.getPublicEvent({
      username: "alice",
      eventSlug: "30min",
      org: null,
      fromRedirectOfNonOrgLink: false,
    });

    expect(getPublicEvent).toHaveBeenCalledWith(
      "alice",
      "30min",
      undefined,
      null,
      prismaMock,
      false,
      undefined
    );
  });

  it("propagates a null event", async () => {
    getPublicEvent.mockResolvedValue(null);

    await expect(
      EventRepository.getPublicEvent({
        username: "alice",
        eventSlug: "missing",
        org: null,
        fromRedirectOfNonOrgLink: false,
      })
    ).resolves.toBeNull();
  });
});
