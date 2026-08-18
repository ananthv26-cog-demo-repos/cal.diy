import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { WaitlistEntryForHostDtoSchema } from "@calcom/lib/dto/WaitlistEntryDto";
import { withWaitlistErrorMapping } from "./waitlist.error";
import type { TWaitlistRemoveInputSchema } from "./waitlist.schema";

type RemoveOptions = {
  input: TWaitlistRemoveInputSchema;
};

export const removeHandler = async ({ input }: RemoveOptions) => {
  const entry = await withWaitlistErrorMapping(() => getWaitlistService().remove(input));
  return WaitlistEntryForHostDtoSchema.parse(entry);
};
