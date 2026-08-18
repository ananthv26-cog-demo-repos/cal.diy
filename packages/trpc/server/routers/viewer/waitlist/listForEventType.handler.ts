import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { WaitlistEntryForHostDtoSchema } from "@calcom/lib/dto/WaitlistEntryDto";
import { withWaitlistErrorMapping } from "./waitlist.error";
import type { TWaitlistListForEventTypeInputSchema } from "./waitlist.schema";

type ListForEventTypeOptions = {
  input: TWaitlistListForEventTypeInputSchema;
};

export const listForEventTypeHandler = async ({ input }: ListForEventTypeOptions) => {
  const entries = await withWaitlistErrorMapping(() => getWaitlistService().listForEventType(input));
  return entries.map((entry) => WaitlistEntryForHostDtoSchema.parse(entry));
};
