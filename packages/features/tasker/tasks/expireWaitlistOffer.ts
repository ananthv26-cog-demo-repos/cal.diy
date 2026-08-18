import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { z } from "zod";

export const expireWaitlistOfferPayloadSchema = z.object({
  entryId: z.number().int(),
});

export async function expireWaitlistOffer(payload: string): Promise<void> {
  const { entryId } = expireWaitlistOfferPayloadSchema.parse(JSON.parse(payload));
  await getWaitlistService().expireOffer({ entryId });
}
