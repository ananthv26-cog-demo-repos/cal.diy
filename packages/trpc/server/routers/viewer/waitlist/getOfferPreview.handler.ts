import { getWaitlistService } from "@calcom/features/bookings/di/WaitlistService.container";
import { checkRateLimitAndThrowError } from "@calcom/lib/checkRateLimitAndThrowError";
import { WaitlistEntryDtoSchema } from "@calcom/lib/dto/WaitlistEntryDto";
import type { TRPCContext } from "../../../createContext";
import { withWaitlistErrorMapping } from "./waitlist.error";
import type { TWaitlistOfferPreviewInputSchema } from "./waitlist.schema";

type GetOfferPreviewOptions = {
  ctx: Pick<TRPCContext, "sourceIp">;
  input: TWaitlistOfferPreviewInputSchema;
};

export const getOfferPreviewHandler = async ({ ctx, input }: GetOfferPreviewOptions) => {
  await checkRateLimitAndThrowError({
    identifier: `waitlist:offer-preview:${ctx.sourceIp ?? "unknown"}`,
    rateLimitingType: "core",
  });

  const result = await withWaitlistErrorMapping(() => getWaitlistService().getOfferPreview(input));
  return {
    status: result.status,
    entry: result.entry ? WaitlistEntryDtoSchema.parse(result.entry) : null,
    eventTitle: result.eventTitle,
  };
};
