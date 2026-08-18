import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { WaitlistEntryForHostDtoSchema } from "@calcom/lib/dto/WaitlistEntryDto";
import type { TWaitlistRemoveInputSchema } from "./waitlist.schema";

type RemoveOptions = {
  input: TWaitlistRemoveInputSchema;
};

export const removeHandler = async ({ input }: RemoveOptions) => {
  const entry = await getWaitlistService().remove(input);
  return WaitlistEntryForHostDtoSchema.parse(entry);
};
