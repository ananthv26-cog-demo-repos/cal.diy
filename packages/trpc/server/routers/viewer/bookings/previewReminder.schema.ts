import { z } from "zod";

export type TPreviewReminderInputSchema = {
  bookingUid: string;
  templateName: string;
};

export const ZPreviewReminderInputSchema: z.ZodType<TPreviewReminderInputSchema> = z.object({
  bookingUid: z.string().min(1),
  templateName: z.string().min(1),
});
