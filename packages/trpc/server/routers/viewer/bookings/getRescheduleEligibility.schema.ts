import { z } from "zod";

export type TGetRescheduleEligibilityInputSchema = {
  uid: string;
};

export const ZGetRescheduleEligibilityInputSchema: z.ZodType<TGetRescheduleEligibilityInputSchema> = z.object(
  {
    uid: z.string(),
  }
);
