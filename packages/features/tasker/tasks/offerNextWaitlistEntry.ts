import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { z } from "zod";

export const offerNextWaitlistEntryPayloadSchema = z.object({
  eventTypeId: z.number().int(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime().optional(),
});

export async function offerNextWaitlistEntry(payload: string): Promise<void> {
  const data = offerNextWaitlistEntryPayloadSchema.parse(JSON.parse(payload));
  await getWaitlistService().offerNextForSlot({
    eventTypeId: data.eventTypeId,
    startTime: new Date(data.startTime),
    endTime: data.endTime ? new Date(data.endTime) : undefined,
  });
}
