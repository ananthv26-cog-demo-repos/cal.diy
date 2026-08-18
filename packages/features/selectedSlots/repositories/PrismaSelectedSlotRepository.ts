import type { PrismaClient } from "@calcom/prisma";
import type { Prisma } from "@calcom/prisma/client";
import type { ISelectedSlotRepository, TimeSlot } from "./ISelectedSlotRepository";

export class PrismaSelectedSlotRepository implements ISelectedSlotRepository {
  constructor(private prismaClient: PrismaClient) {}

  async reserveForWaitlist({
    eventTypeId,
    slot,
    uid,
    releaseAt,
  }: {
    eventTypeId: number;
    slot: TimeSlot;
    uid: string;
    releaseAt: Date;
  }): Promise<boolean> {
    const eventType = await this.prismaClient.eventType.findUnique({
      where: { id: eventTypeId },
      select: {
        seatsPerTimeSlot: true,
        users: { select: { id: true } },
      },
    });

    if (!eventType || eventType.seatsPerTimeSlot) {
      return false;
    }

    const reservedBySomeoneElse = await this.findReservedByOthers({ slot, eventTypeId, uid });
    if (reservedBySomeoneElse) {
      return false;
    }

    try {
      await this.prismaClient.$transaction(
        eventType.users.map((user) =>
          this.prismaClient.selectedSlots.upsert({
            where: {
              selectedSlotUnique: {
                userId: user.id,
                slotUtcStartDate: slot.utcStartIso,
                slotUtcEndDate: slot.utcEndIso,
                uid,
              },
            },
            update: {
              releaseAt,
              eventTypeId,
            },
            create: {
              userId: user.id,
              eventTypeId,
              slotUtcStartDate: slot.utcStartIso,
              slotUtcEndDate: slot.utcEndIso,
              uid,
              releaseAt,
              isSeat: false,
            },
          })
        )
      );
      return true;
    } catch {
      return false;
    }
  }

  async releaseForWaitlist({
    eventTypeId,
    slot,
    uid,
  }: {
    eventTypeId: number;
    slot: TimeSlot;
    uid: string;
  }): Promise<void> {
    await this.prismaClient.selectedSlots.deleteMany({
      where: {
        eventTypeId,
        uid,
        slotUtcStartDate: slot.utcStartIso,
        slotUtcEndDate: slot.utcEndIso,
      },
    });
  }

  private async findFirst({ where }: { where: Prisma.SelectedSlotsWhereInput }) {
    return await this.prismaClient.selectedSlots.findFirst({
      where,
    });
  }

  async findReservedByOthers({
    slot,
    eventTypeId,
    uid,
  }: {
    slot: TimeSlot;
    eventTypeId: number;
    uid: string;
  }) {
    return await this.findFirst({
      where: {
        slotUtcStartDate: slot.utcStartIso,
        slotUtcEndDate: slot.utcEndIso,
        eventTypeId,
        uid: { not: uid },
        releaseAt: { gt: new Date() },
      },
    });
  }

  async findManyReservedByOthers(slots: TimeSlot[], eventTypeId: number, uid: string) {
    return await this.prismaClient.selectedSlots.findMany({
      where: {
        OR: slots.map((slot) => ({
          slotUtcStartDate: slot.utcStartIso,
          slotUtcEndDate: slot.utcEndIso,
          eventTypeId,
          uid: { not: uid },
          releaseAt: { gt: new Date() },
        })),
      },
      select: {
        slotUtcStartDate: true,
        slotUtcEndDate: true,
      },
    });
  }

  async findManyUnexpiredSlots({
    userIds,
    currentTimeInUtc,
  }: {
    userIds: number[];
    currentTimeInUtc: string;
  }) {
    return this.prismaClient.selectedSlots.findMany({
      where: {
        userId: { in: userIds },
        releaseAt: { gt: currentTimeInUtc },
      },
      select: {
        id: true,
        slotUtcStartDate: true,
        slotUtcEndDate: true,
        userId: true,
        isSeat: true,
        eventTypeId: true,
        uid: true,
      },
    });
  }

  async deleteManyExpiredSlots({
    eventTypeId,
    currentTimeInUtc,
  }: {
    eventTypeId: number;
    currentTimeInUtc: string;
  }) {
    return this.prismaClient.selectedSlots.deleteMany({
      where: {
        eventTypeId: { equals: eventTypeId },
        releaseAt: { lt: currentTimeInUtc },
      },
    });
  }
}
