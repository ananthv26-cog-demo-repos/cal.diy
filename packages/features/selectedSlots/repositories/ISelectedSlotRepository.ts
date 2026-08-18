import type { SelectedSlot } from "./dto/SelectedSlot";

export type TimeSlot = {
  utcStartIso: string;
  utcEndIso: string;
};

export interface ISelectedSlotRepository {
  reserveForWaitlist(args: {
    eventTypeId: number;
    slot: TimeSlot;
    uid: string;
    releaseAt: Date;
  }): Promise<boolean>;
  releaseForWaitlist(args: { eventTypeId: number; slot: TimeSlot; uid: string }): Promise<void>;
  findReservedByOthers(args: {
    slot: TimeSlot;
    eventTypeId: number;
    uid: string;
  }): Promise<SelectedSlot | null>;
  findManyReservedByOthers(
    slots: TimeSlot[],
    eventTypeId: number,
    uid: string
  ): Promise<Array<Pick<SelectedSlot, "slotUtcEndDate" | "slotUtcStartDate">>>;
  findManyUnexpiredSlots(args: {
    userIds: number[];
    currentTimeInUtc: string;
  }): Promise<Array<Omit<SelectedSlot, "releaseAt">>>;
  deleteManyExpiredSlots(args: { eventTypeId: number; currentTimeInUtc: string }): Promise<{ count: number }>;
}
