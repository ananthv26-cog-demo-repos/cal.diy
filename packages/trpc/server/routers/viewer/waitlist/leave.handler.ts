import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { WaitlistEntryDtoSchema } from "@calcom/lib/dto/WaitlistEntryDto";
import type { TRPCContext } from "../../../createContext";
import { withWaitlistErrorMapping } from "./waitlist.error";
import type { TWaitlistLeaveInputSchema } from "./waitlist.schema";

type LeaveOptions = {
  ctx: Pick<TRPCContext, "sourceIp">;
  input: TWaitlistLeaveInputSchema;
};

export const leaveHandler = async ({ ctx, input }: LeaveOptions) => {
  await checkRateLimitAndThrowError({
    identifier: `waitlist:leave:${ctx.sourceIp ?? "unknown"}`,
    rateLimitingType: "core",
  });

  const entry = await withWaitlistErrorMapping(() => getWaitlistService().leave(input));
  return WaitlistEntryDtoSchema.parse(entry);
};
