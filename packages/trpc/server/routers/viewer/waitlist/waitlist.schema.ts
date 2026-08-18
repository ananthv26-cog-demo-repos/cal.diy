import type { WaitlistEntryJson } from "@calcom/features/bookings/repositories/IWaitlistEntryRepository";
import { WaitlistEntryStatusSchema } from "@calcom/lib/dto/WaitlistEntryDto";
import { z } from "zod";

const waitlistEntryJsonSchema: z.ZodType<WaitlistEntryJson> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(waitlistEntryJsonSchema),
    z.record(waitlistEntryJsonSchema),
  ])
);

export const ZWaitlistJoinInputSchema = z.object({
  eventTypeId: z.number().int().positive(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  attendee: z.object({
    name: z.string().trim().min(1),
    email: z.string().email(),
    timeZone: z.string().min(1),
  }),
  responses: waitlistEntryJsonSchema.optional(),
});

export const ZWaitlistClaimInputSchema = z.object({
  offerToken: z.string().min(1),
});

export const ZWaitlistLeaveInputSchema = z
  .object({
    uid: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
  })
  .refine((input) => Boolean(input.uid) !== Boolean(input.token), {
    message: "Provide exactly one waitlist identifier",
  });

export const ZWaitlistListForEventTypeInputSchema = z.object({
  eventTypeId: z.number().int().positive(),
  status: WaitlistEntryStatusSchema.optional(),
});

export const ZWaitlistRemoveInputSchema = z.object({
  eventTypeId: z.number().int().positive(),
  uid: z.string().min(1),
});

export type TWaitlistJoinInputSchema = z.infer<typeof ZWaitlistJoinInputSchema>;
export type TWaitlistClaimInputSchema = z.infer<typeof ZWaitlistClaimInputSchema>;
export type TWaitlistLeaveInputSchema = z.infer<typeof ZWaitlistLeaveInputSchema>;
export type TWaitlistListForEventTypeInputSchema = z.infer<typeof ZWaitlistListForEventTypeInputSchema>;
export type TWaitlistRemoveInputSchema = z.infer<typeof ZWaitlistRemoveInputSchema>;
