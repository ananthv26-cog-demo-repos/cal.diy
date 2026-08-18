import type { PrismaClient } from "@calcom/prisma";
import type { Prisma, WaitlistEntryStatus as PrismaWaitlistEntryStatus } from "@calcom/prisma/client";
import type {
  IWaitlistEntryRepository,
  WaitlistEntryCreateData,
  WaitlistEntryRecord,
  WaitlistEntryStatusUpdate,
} from "./IWaitlistEntryRepository";

const waitlistEntrySelect: Prisma.WaitlistEntrySelect = {
  id: true,
  uid: true,
  eventTypeId: true,
  startTime: true,
  endTime: true,
  attendeeName: true,
  attendeeEmail: true,
  attendeeTimeZone: true,
  responses: true,
  status: true,
  offeredAt: true,
  offerExpiresAt: true,
  claimedBookingId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.WaitlistEntrySelect;

export class WaitlistEntryRepository implements IWaitlistEntryRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  async create(data: WaitlistEntryCreateData): Promise<WaitlistEntryRecord> {
    return this.prismaClient.waitlistEntry.create({
      data,
      select: waitlistEntrySelect,
    });
  }

  async findByUid(uid: string): Promise<WaitlistEntryRecord | null> {
    return this.prismaClient.waitlistEntry.findUnique({
      where: { uid },
      select: waitlistEntrySelect,
    });
  }

  async findByOfferToken(offerToken: string): Promise<WaitlistEntryRecord | null> {
    return this.prismaClient.waitlistEntry.findUnique({
      where: { offerToken },
      select: waitlistEntrySelect,
    });
  }

  async findNextPendingForSlot({
    eventTypeId,
    startTime,
  }: {
    eventTypeId: number;
    startTime: Date;
  }): Promise<WaitlistEntryRecord | null> {
    return this.prismaClient.waitlistEntry.findFirst({
      where: {
        eventTypeId,
        startTime,
        status: "PENDING",
      },
      orderBy: { createdAt: "asc" },
      select: waitlistEntrySelect,
    });
  }

  async countActiveForSlot({
    eventTypeId,
    startTime,
  }: {
    eventTypeId: number;
    startTime: Date;
  }): Promise<number> {
    return this.prismaClient.waitlistEntry.count({
      where: {
        eventTypeId,
        startTime,
        status: {
          in: ["PENDING", "OFFERED"],
        },
      },
    });
  }

  async listForEventType({
    eventTypeId,
    status,
  }: {
    eventTypeId: number;
    status?: PrismaWaitlistEntryStatus;
  }): Promise<WaitlistEntryRecord[]> {
    const where: Prisma.WaitlistEntryWhereInput = { eventTypeId };
    if (status) {
      where.status = status;
    }

    return this.prismaClient.waitlistEntry.findMany({
      where,
      orderBy: [{ startTime: "asc" }, { createdAt: "asc" }],
      select: waitlistEntrySelect,
    });
  }

  async transitionStatus({
    id,
    expectedStatus,
    data,
  }: {
    id: number;
    expectedStatus: PrismaWaitlistEntryStatus;
    data: WaitlistEntryStatusUpdate;
  }): Promise<{ count: number }> {
    return this.prismaClient.waitlistEntry.updateMany({
      where: { id, status: expectedStatus },
      data,
    });
  }

  async expireStaleOffers({ now }: { now: Date }): Promise<{ count: number }> {
    return this.prismaClient.waitlistEntry.updateMany({
      where: {
        status: "OFFERED",
        offerExpiresAt: { lt: now },
      },
      data: {
        status: "EXPIRED",
        offerToken: null,
      },
    });
  }
}
