import type { WaitlistEntryStatus } from "@calcom/lib/dto/WaitlistEntryDto";
import type { PrismaClient } from "@calcom/prisma";
import type { Prisma as PrismaTypes } from "@calcom/prisma/client";
import { Prisma } from "@calcom/prisma/client";
import type {
  IWaitlistEntryRepository,
  WaitlistEntryCreateData,
  WaitlistEntryRecord,
  WaitlistEntryStatusUpdate,
} from "./IWaitlistEntryRepository";

const waitlistEntrySelect: PrismaTypes.WaitlistEntrySelect = {
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
} satisfies PrismaTypes.WaitlistEntrySelect;

function toPrismaCreateData(data: WaitlistEntryCreateData): PrismaTypes.WaitlistEntryUncheckedCreateInput {
  const { responses, ...rest } = data;
  const prismaData: PrismaTypes.WaitlistEntryUncheckedCreateInput = rest;

  if (responses === undefined) {
    return prismaData;
  }

  if (responses === null) {
    prismaData.responses = Prisma.JsonNull;
  } else {
    prismaData.responses = responses;
  }

  return prismaData;
}

function toPrismaStatusUpdate(
  data: WaitlistEntryStatusUpdate
): PrismaTypes.WaitlistEntryUpdateManyMutationInput {
  return data;
}

export class WaitlistEntryRepository implements IWaitlistEntryRepository {
  constructor(private readonly prismaClient: PrismaClient) {}

  async create(data: WaitlistEntryCreateData): Promise<WaitlistEntryRecord> {
    return this.prismaClient.waitlistEntry.create({
      data: toPrismaCreateData(data),
      select: waitlistEntrySelect,
    });
  }

  async findById(id: number): Promise<WaitlistEntryRecord | null> {
    return this.prismaClient.waitlistEntry.findUnique({
      where: { id },
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

  async findBySlotAndEmail({
    eventTypeId,
    startTime,
    attendeeEmail,
  }: {
    eventTypeId: number;
    startTime: Date;
    attendeeEmail: string;
  }): Promise<WaitlistEntryRecord | null> {
    return this.prismaClient.waitlistEntry.findUnique({
      where: {
        eventTypeId_startTime_attendeeEmail: {
          eventTypeId,
          startTime,
          attendeeEmail,
        },
      },
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
    status?: WaitlistEntryStatus;
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
    expectedStatus: WaitlistEntryStatus;
    data: WaitlistEntryStatusUpdate;
  }): Promise<{ count: number }> {
    return this.prismaClient.waitlistEntry.updateMany({
      where: { id, status: expectedStatus },
      data: toPrismaStatusUpdate(data),
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

  async listActiveBefore({ now, limit }: { now: Date; limit: number }): Promise<WaitlistEntryRecord[]> {
    return this.prismaClient.waitlistEntry.findMany({
      where: {
        startTime: { lt: now },
        status: { in: ["PENDING", "OFFERED"] },
      },
      take: limit,
      select: waitlistEntrySelect,
    });
  }
}
