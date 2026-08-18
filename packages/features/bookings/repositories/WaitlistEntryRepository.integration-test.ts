import { prisma } from "@calcom/prisma";
import { afterEach, describe, expect, it } from "vitest";
import { WaitlistEntryRepository } from "./WaitlistEntryRepository";

describe("WaitlistEntryRepository integration", () => {
  let eventTypeId: number | undefined;
  const repository = new WaitlistEntryRepository(prisma);

  afterEach(async () => {
    if (eventTypeId) {
      await prisma.waitlistEntry.deleteMany({ where: { eventTypeId } });
      await prisma.eventType.delete({ where: { id: eventTypeId } });
      eventTypeId = undefined;
    }
  });

  it("allows only one concurrent active offer for a slot", async () => {
    const eventType = await prisma.eventType.create({
      data: {
        title: "Waitlist repository test",
        slug: `waitlist-repository-test-${Date.now()}`,
        length: 30,
      },
    });
    eventTypeId = eventType.id;

    const startTime = new Date("2030-01-01T10:00:00.000Z");
    const createEntry = (suffix: string): ReturnType<WaitlistEntryRepository["create"]> =>
      repository.create({
        uid: `waitlist-entry-${Date.now()}-${suffix}`,
        eventTypeId: eventType.id,
        startTime,
        endTime: new Date("2030-01-01T10:30:00.000Z"),
        attendeeName: `Attendee ${suffix}`,
        attendeeEmail: `${suffix}@example.com`,
        attendeeTimeZone: "UTC",
        status: "OFFERED",
        offerToken: `offer-token-${suffix}`,
        offeredAt: new Date(),
        offerExpiresAt: new Date("2030-01-01T10:30:00.000Z"),
      });

    const results = await Promise.allSettled([createEntry("one"), createEntry("two")]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    await expect(
      prisma.waitlistEntry.count({
        where: { eventTypeId: eventType.id, startTime, status: "OFFERED" },
      })
    ).resolves.toBe(1);
  });
});
