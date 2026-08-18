import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { WaitlistEntryDtoSchema } from "@calcom/lib/dto/WaitlistEntryDto";
import type { TRPCContext } from "../../../createContext";
import { withWaitlistErrorMapping } from "./waitlist.error";
import type { TWaitlistClaimInputSchema } from "./waitlist.schema";

type ClaimOptions = {
  ctx: Pick<TRPCContext, "sourceIp">;
  input: TWaitlistClaimInputSchema;
};

export const claimHandler = async ({ ctx, input }: ClaimOptions) => {
  await checkRateLimitAndThrowError({
    identifier: `waitlist:claim:${ctx.sourceIp ?? "unknown"}`,
    rateLimitingType: "core",
  });

  const result = await withWaitlistErrorMapping(() => getWaitlistService().claim(input));
  return {
    entry: WaitlistEntryDtoSchema.parse(result.entry),
    booking: result.booking,
  };
};
