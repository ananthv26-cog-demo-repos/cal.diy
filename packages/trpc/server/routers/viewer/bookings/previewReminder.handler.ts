import { previewReminder } from "@calcom/features/bookings/lib/reminders/previewReminder";
import type { TrpcSessionUser } from "@calcom/trpc/server/types";

import type { TPreviewReminderInputSchema } from "./previewReminder.schema";

type PreviewReminderOptions = {
  ctx: {
    user: NonNullable<TrpcSessionUser>;
  };
  input: TPreviewReminderInputSchema;
};

export const previewReminderHandler = async ({ ctx, input }: PreviewReminderOptions) => {
  const { user } = ctx;

  return previewReminder({
    bookingUid: input.bookingUid,
    templateName: input.templateName,
    userId: user.id,
    userEmail: user.email,
  });
};
