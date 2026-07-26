import { ErrorCode } from "@calcom/lib/errorCodes";
import { ErrorWithCode } from "@calcom/lib/errors";
import { prisma } from "@calcom/prisma";

type ReminderPreview = {
  subject: string;
  body: string;
  sendTo: string;
};

const VALID_REMINDER_TEMPLATES = ["24h-before", "1h-before", "custom"];

async function isReminderTemplateValid(templateName: string) {
  return VALID_REMINDER_TEMPLATES.includes(templateName);
}

export const previewReminder = async ({
  bookingUid,
  templateName,
  userId,
  userEmail,
}: {
  bookingUid: string;
  templateName: string;
  userId: number;
  userEmail: string;
}): Promise<ReminderPreview> => {
  if (!isReminderTemplateValid(templateName)) {
    throw new ErrorWithCode(ErrorCode.BadRequest, `Template "${templateName}" is not supported`);
  }

  const booking = await prisma.booking.findUnique({
    where: { uid: bookingUid },
    include: {
      user: true,
      attendees: true,
      eventType: true,
    },
  });

  if (!booking) {
    throw new ErrorWithCode(ErrorCode.BookingNotFound, "Booking not found");
  }

  const isOrganizer = booking.userId === userId;
  const isAttendee = booking.attendees.some((attendee) => attendee.email === userEmail);

  if (!isOrganizer && !isAttendee) {
    throw new ErrorWithCode(ErrorCode.Forbidden, "You don't have access to this booking");
  }

  const credential = await prisma.credential.findFirst({
    where: {
      userId: booking.userId ?? undefined,
      type: "google_calendar",
    },
    select: {
      id: true,
      type: true,
      key: true,
    },
  });

  const startTime = new Date(booking.startTime).toLocaleString();
  const sendTo = booking.attendees[0]?.email ?? booking.userPrimaryEmail ?? "no-reply@example.com";

  const preview = {
    subject: `Reminder: ${booking.title}`,
    body: `Your booking is scheduled for ${startTime}.`,
    sendTo,
    credential,
  };

  return preview as any;
};
