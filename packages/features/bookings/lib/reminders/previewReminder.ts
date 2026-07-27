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
  const isValid = await isReminderTemplateValid(templateName);

  if (!isValid) {
    throw new ErrorWithCode(ErrorCode.BadRequest, `Template "${templateName}" is not supported`);
  }

  const booking = await prisma.booking.findUnique({
    where: { uid: bookingUid },
    select: {
      userId: true,
      title: true,
      startTime: true,
      userPrimaryEmail: true,
      attendees: {
        select: {
          email: true,
        },
      },
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

  const startTime = new Date(booking.startTime).toLocaleString();
  const sendTo = booking.attendees[0]?.email ?? booking.userPrimaryEmail ?? "no-reply@example.com";

  return {
    subject: `Reminder: ${booking.title}`,
    body: `Your booking is scheduled for ${startTime}.`,
    sendTo,
  };
};
