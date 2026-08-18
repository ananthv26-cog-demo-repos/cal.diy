import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { WaitlistEntryDtoSchema } from "@calcom/lib/dto/WaitlistEntryDto";
import type { TRPCContext } from "../../../createContext";
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

  const entry = await getWaitlistService().claim(input);
  return WaitlistEntryDtoSchema.parse(entry);
};
