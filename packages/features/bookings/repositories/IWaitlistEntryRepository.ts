import type { WaitlistEntryForHostDto, WaitlistEntryStatus } from "@calcom/lib/dto/WaitlistEntryDto";

export type WaitlistEntryRecord = WaitlistEntryForHostDto;

export type WaitlistEntryJson =
  | string
  | number
  | boolean
  | null
  | WaitlistEntryJson[]
  | { [key: string]: WaitlistEntryJson };

export interface WaitlistEntryCreateData {
  uid: string;
  eventTypeId: number;
  startTime: Date;
  endTime: Date;
  attendeeName: string;
  attendeeEmail: string;
  attendeeTimeZone: string;
  responses?: WaitlistEntryJson | null;
  status?: WaitlistEntryStatus;
  offerToken?: string | null;
  offeredAt?: Date | null;
  offerExpiresAt?: Date | null;
  claimedBookingId?: number | null;
}

export interface WaitlistEntryStatusUpdate {
  status: WaitlistEntryStatus;
  offerToken?: string | null;
  offeredAt?: Date | null;
  offerExpiresAt?: Date | null;
  claimedBookingId?: number | null;
}

export interface IWaitlistEntryRepository {
  create(data: WaitlistEntryCreateData): Promise<WaitlistEntryRecord>;

  findById(id: number): Promise<WaitlistEntryRecord | null>;

  findByUid(uid: string): Promise<WaitlistEntryRecord | null>;

  findByOfferToken(offerToken: string): Promise<WaitlistEntryRecord | null>;

  findBySlotAndEmail(params: {
    eventTypeId: number;
    startTime: Date;
    attendeeEmail: string;
  }): Promise<WaitlistEntryRecord | null>;

  findNextPendingForSlot(params: {
    eventTypeId: number;
    startTime: Date;
  }): Promise<WaitlistEntryRecord | null>;

  countActiveForSlot(params: { eventTypeId: number; startTime: Date }): Promise<number>;

  listForEventType(params: {
    eventTypeId: number;
    status?: WaitlistEntryStatus;
  }): Promise<WaitlistEntryRecord[]>;

  transitionStatus(params: {
    id: number;
    expectedStatus: WaitlistEntryStatus;
    data: WaitlistEntryStatusUpdate;
  }): Promise<{ count: number }>;

  expireStaleOffers(params: { now: Date }): Promise<{ count: number }>;

  listActiveBefore(params: { now: Date; limit: number }): Promise<WaitlistEntryRecord[]>;
}
