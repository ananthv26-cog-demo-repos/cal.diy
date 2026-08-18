import type { PrismaClient } from "@calcom/prisma";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaSelectedSlotRepository } from "./PrismaSelectedSlotRepository";

describe("PrismaSelectedSlotRepository", () => {
  let repository: PrismaSelectedSlotRepository;
  let mockPrismaClient: {
    $transaction: ReturnType<typeof vi.fn>;
    eventType: {
      findUnique: ReturnType<typeof vi.fn>;
    };
    selectedSlots: {
      findFirst: ReturnType<typeof vi.fn>;
      upsert: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaClient = {
      $transaction: vi.fn(),
      eventType: {
        findUnique: vi.fn(),
      },
      selectedSlots: {
        findFirst: vi.fn().mockResolvedValue(null),
        upsert: vi.fn(),
      },
    };
    repository = new PrismaSelectedSlotRepository(mockPrismaClient as unknown as PrismaClient);
  });

  it("does not create a phantom hold when an event type has no assignees", async () => {
    mockPrismaClient.eventType.findUnique.mockResolvedValue({
      seatsPerTimeSlot: null,
      users: [],
      hosts: [],
    });

    await expect(
      repository.reserveForWaitlist({
        eventTypeId: 1,
        slot: {
          utcStartIso: "2026-08-18T10:00:00.000Z",
          utcEndIso: "2026-08-18T10:30:00.000Z",
        },
        uid: "waitlist-entry",
        releaseAt: new Date("2026-08-18T10:05:00.000Z"),
      })
    ).resolves.toBe(false);
    expect(mockPrismaClient.$transaction).not.toHaveBeenCalled();
  });

  it("deduplicates users and hosts when creating holds", async () => {
    mockPrismaClient.eventType.findUnique.mockResolvedValue({
      seatsPerTimeSlot: null,
      users: [{ id: 1 }],
      hosts: [{ userId: 1 }, { userId: 2 }],
    });
    mockPrismaClient.$transaction.mockResolvedValue([]);

    await expect(
      repository.reserveForWaitlist({
        eventTypeId: 1,
        slot: {
          utcStartIso: "2026-08-18T10:00:00.000Z",
          utcEndIso: "2026-08-18T10:30:00.000Z",
        },
        uid: "waitlist-entry",
        releaseAt: new Date("2026-08-18T10:05:00.000Z"),
      })
    ).resolves.toBe(true);

    expect(mockPrismaClient.selectedSlots.upsert).toHaveBeenCalledTimes(2);
    expect(mockPrismaClient.selectedSlots.upsert.mock.calls.map(([args]) => args.create.userId)).toEqual([
      1, 2,
    ]);
  });
});
