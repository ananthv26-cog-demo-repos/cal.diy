import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { z } from "zod";

export const sweepWaitlistPayloadSchema = z.object({});

export async function sweepWaitlist(payload: string): Promise<void> {
  sweepWaitlistPayloadSchema.parse(JSON.parse(payload));
  await getWaitlistService().sweep();
}
