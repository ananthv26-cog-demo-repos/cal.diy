import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WaitlistEntryRepository } from "./WaitlistEntryRepository";

describe("WaitlistEntryRepository", () => {
  let repository: WaitlistEntryRepository;
  let mockPrismaClient: {
    waitlistEntry: {
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaClient = {
      waitlistEntry: {
        count: vi.fn(),
        create: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        updateMany: vi.fn(),
      },
    };
    repository = new WaitlistEntryRepository(mockPrismaClient as unknown as PrismaClient);
  });

  it("creates entries with a select projection", async () => {
    const data = {
      uid: "waitlist-entry-uid",
      eventTypeId: 1,
      startTime: new Date("2026-08-18T10:00:00.000Z"),
      endTime: new Date("2026-08-18T10:30:00.000Z"),
      attendeeName: "Attendee",
      attendeeEmail: "attendee@example.com",
      attendeeTimeZone: "UTC",
    };
    const entry = { ...data, id: 1, responses: null, status: "PENDING" };
    mockPrismaClient.waitlistEntry.create.mockResolvedValue(entry);

    await expect(repository.create(data)).resolves.toEqual(entry);
    expect(mockPrismaClient.waitlistEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({ data, select: expect.any(Object) })
    );
    expect(mockPrismaClient.waitlistEntry.create.mock.calls[0][0].select).not.toHaveProperty("offerToken");
  });

  it("finds entries by uid and offer token without selecting offerToken", async () => {
    mockPrismaClient.waitlistEntry.findUnique.mockResolvedValue(null);

    await repository.findByUid("entry-uid");
    await repository.findByOfferToken("offer-token");

    expect(mockPrismaClient.waitlistEntry.findUnique).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { uid: "entry-uid" }, select: expect.any(Object) })
    );
    expect(mockPrismaClient.waitlistEntry.findUnique).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { offerToken: "offer-token" }, select: expect.any(Object) })
    );
    expect(
      mockPrismaClient.waitlistEntry.findUnique.mock.calls.every(([args]) => !("offerToken" in args.select))
    ).toBe(true);
  });

  it("selects the oldest pending entry for a slot", async () => {
    const startTime = new Date("2026-08-18T10:00:00.000Z");
    mockPrismaClient.waitlistEntry.findFirst.mockResolvedValue(null);

    await repository.findNextPendingForSlot({ eventTypeId: 1, startTime });

    expect(mockPrismaClient.waitlistEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventTypeId: 1, startTime, status: "PENDING" },
        orderBy: { createdAt: "asc" },
        select: expect.any(Object),
      })
    );
  });

  it("counts pending and offered entries for a slot", async () => {
    mockPrismaClient.waitlistEntry.count.mockResolvedValue(2);

    await expect(
      repository.countActiveForSlot({ eventTypeId: 1, startTime: new Date("2026-08-18T10:00:00.000Z") })
    ).resolves.toBe(2);
    expect(mockPrismaClient.waitlistEntry.count).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: { in: ["PENDING", "OFFERED"] } }) })
    );
  });

  it("conditionally transitions status for concurrent safety", async () => {
    mockPrismaClient.waitlistEntry.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      repository.transitionStatus({
        id: 1,
        expectedStatus: "OFFERED",
        data: { status: "CLAIMED", offerToken: null },
      })
    ).resolves.toEqual({ count: 0 });
    expect(mockPrismaClient.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: 1, status: "OFFERED" },
      data: { status: "CLAIMED", offerToken: null },
    });
  });

  it("expires only stale offers and invalidates their tokens", async () => {
    const now = new Date("2026-08-18T10:30:00.000Z");
    mockPrismaClient.waitlistEntry.updateMany.mockResolvedValue({ count: 1 });

    await expect(repository.expireStaleOffers({ now })).resolves.toEqual({ count: 1 });
    expect(mockPrismaClient.waitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { status: "OFFERED", offerExpiresAt: { lt: now } },
      data: { status: "EXPIRED", offerToken: null },
    });
  });
});
