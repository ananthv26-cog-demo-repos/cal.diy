import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendBookingRedirectNotification,
  sendFeedbackEmail,
  sendMonthlyDigestEmail,
} from "./workflow-email-service";

const { emailMock, mockTemplate } = vi.hoisted(() => {
  const emailMock = {
    constructed: [] as { name: string; args: unknown[] }[],
    throwOn: null as string | null,
  };

  const mockTemplate = (name: string) => () => ({
    default: class {
      constructor(...args: unknown[]) {
        if (emailMock.throwOn === name) throw new Error(`${name} failed to build`);
        emailMock.constructed.push({ name, args });
      }
      sendEmail() {
        return Promise.resolve();
      }
    },
  });

  return { emailMock, mockTemplate };
});

vi.mock("./templates/feedback-email", mockTemplate("FeedbackEmail"));
vi.mock("./templates/monthly-digest-email", mockTemplate("MonthlyDigestEmail"));
vi.mock("./templates/booking-redirect-notification", mockTemplate("BookingRedirectEmailNotification"));

const language = ((key: string) => key) as TFunction;

describe("workflow-email-service", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sends the feedback email", async () => {
    const feedback = {
      username: "jane",
      email: "jane@example.com",
      rating: "5",
      comment: "Works great",
    };

    await sendFeedbackEmail(feedback);

    expect(emailMock.constructed).toEqual([{ name: "FeedbackEmail", args: [feedback] }]);
  });

  it("sends the monthly digest email", async () => {
    const eventData = {
      language,
      Created: 10,
      Completed: 8,
      Rescheduled: 1,
      Cancelled: 1,
      mostBookedEvents: [{ eventTypeId: 1, eventTypeName: "30min", count: 5 }],
      membersWithMostBookings: [
        {
          userId: 1,
          user: { id: 1, name: "Jane", email: "jane@example.com", avatar: null, username: "jane" },
          count: 5,
        },
      ],
      admin: { email: "admin@example.com", name: "Admin" },
      team: { name: "Engineering", id: 1 },
    };

    await sendMonthlyDigestEmail(eventData);

    expect(emailMock.constructed).toEqual([{ name: "MonthlyDigestEmail", args: [eventData] }]);
  });

  it("sends the booking redirect notification", async () => {
    const bookingRedirect = {
      language,
      fromEmail: "jane@example.com",
      eventOwner: "Jane",
      toEmail: "john@example.com",
      toName: "John",
      dates: "Jan 1 - Jan 7",
      action: "add" as const,
    };

    await sendBookingRedirectNotification(bookingRedirect);

    expect(emailMock.constructed).toEqual([
      { name: "BookingRedirectEmailNotification", args: [bookingRedirect] },
    ]);
  });

  it("rejects and logs when the email cannot be built", async () => {
    emailMock.throwOn = "FeedbackEmail";

    await expect(
      sendFeedbackEmail({ username: "jane", email: "jane@example.com", rating: "1", comment: "" })
    ).rejects.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("sendEmail failed"),
      expect.any(Error)
    );
  });
});
