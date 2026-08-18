import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { WaitlistEntryDtoSchema } from "@calcom/lib/dto/WaitlistEntryDto";
import { piiHasher } from "@calcom/lib/server/PiiHasher";
import type { TRPCContext } from "../../../createContext";
import { withWaitlistErrorMapping } from "./waitlist.error";
import type { TWaitlistJoinInputSchema } from "./waitlist.schema";

type JoinOptions = {
  ctx: Pick<TRPCContext, "sourceIp">;
  input: TWaitlistJoinInputSchema;
};

export const joinHandler = async ({ ctx, input }: JoinOptions) => {
  const emailIdentifier = piiHasher.hash(input.attendee.email);
  await checkRateLimitAndThrowError({
    identifier: `waitlist:join:${ctx.sourceIp ?? "unknown"}:${emailIdentifier}`,
    rateLimitingType: "core",
  });

  const entry = await withWaitlistErrorMapping(() => getWaitlistService().join(input));
  return WaitlistEntryDtoSchema.parse(entry);
};
