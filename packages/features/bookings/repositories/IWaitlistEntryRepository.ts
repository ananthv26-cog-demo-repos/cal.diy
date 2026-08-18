import type { WaitlistEntryForHostDto } from "@calcom/lib/dto/WaitlistEntryDto";
import type { Prisma, WaitlistEntryStatus as PrismaWaitlistEntryStatus } from "@calcom/prisma/client";

export type WaitlistEntryRecord = Omit<WaitlistEntryForHostDto, "attendeeEmail"> & {
  attendeeEmail: string;
};

export type WaitlistEntryCreateData = Prisma.WaitlistEntryUncheckedCreateInput;

export type WaitlistEntryStatusUpdate = Prisma.WaitlistEntryUpdateManyMutationInput;

export interface IWaitlistEntryRepository {
  create(data: WaitlistEntryCreateData): Promise<WaitlistEntryRecord>;

  findByUid(uid: string): Promise<WaitlistEntryRecord | null>;

  findByOfferToken(offerToken: string): Promise<WaitlistEntryRecord | null>;

  findNextPendingForSlot(params: {
    eventTypeId: number;
    startTime: Date;
  }): Promise<WaitlistEntryRecord | null>;

  countActiveForSlot(params: { eventTypeId: number; startTime: Date }): Promise<number>;

  listForEventType(params: {
    eventTypeId: number;
    status?: PrismaWaitlistEntryStatus;
  }): Promise<WaitlistEntryForHostDto[]>;

  transitionStatus(params: {
    id: number;
    expectedStatus: PrismaWaitlistEntryStatus;
    data: WaitlistEntryStatusUpdate;
  }): Promise<{ count: number }>;

  expireStaleOffers(params: { now: Date }): Promise<{ count: number }>;
}
