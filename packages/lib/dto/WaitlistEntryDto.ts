import { z } from "zod";

export const WaitlistEntryStatusSchema = z.union([
  z.literal("PENDING"),
  z.literal("OFFERED"),
  z.literal("CLAIMED"),
  z.literal("EXPIRED"),
  z.literal("CANCELLED"),
]);

export type WaitlistEntryStatus = z.infer<typeof WaitlistEntryStatusSchema>;

const waitlistEntryFields = {
  id: z.number(),
  uid: z.string(),
  eventTypeId: z.number(),
  startTime: z.coerce.date(),
  endTime: z.coerce.date(),
  attendeeName: z.string(),
  attendeeTimeZone: z.string(),
  responses: z.unknown().nullable(),
  status: WaitlistEntryStatusSchema,
  offeredAt: z.coerce.date().nullable(),
  offerExpiresAt: z.coerce.date().nullable(),
  claimedBookingId: z.number().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
};

export const WaitlistEntryDtoSchema = z.object(waitlistEntryFields);

export type WaitlistEntryDto = z.infer<typeof WaitlistEntryDtoSchema>;

export const WaitlistEntryForHostDtoSchema = WaitlistEntryDtoSchema.extend({
  attendeeEmail: z.string(),
});

export type WaitlistEntryForHostDto = z.infer<typeof WaitlistEntryForHostDtoSchema>;
