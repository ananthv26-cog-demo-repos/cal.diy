import { RescheduleEligibilityService } from "@calcom/features/bookings/services/RescheduleEligibilityService";
import { prisma } from "@calcom/prisma";
import type { TrpcSessionUser } from "../../../types";
import type { TGetRescheduleEligibilityInputSchema } from "./getRescheduleEligibility.schema";

type GetRescheduleEligibilityOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TGetRescheduleEligibilityInputSchema;
};

export const getRescheduleEligibilityHandler = async ({ ctx, input }: GetRescheduleEligibilityOptions) => {
  const rescheduleEligibilityService = new RescheduleEligibilityService(prisma);

  return await rescheduleEligibilityService.getRescheduleEligibility({
    userId: ctx.user.id,
    bookingUid: input.uid,
  });
};
