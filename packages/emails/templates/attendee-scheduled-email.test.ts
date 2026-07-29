import { buildCalendarEvent, buildPerson } from "@calcom/lib/test/builder";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AttendeeScheduledEmail from "./attendee-scheduled-email";

vi.mock("@calcom/prisma", () => ({ prisma: {} }));

vi.mock("../lib/generateIcsFile", () => ({
  default: vi.fn(() => ({ filename: "event.ics", content: "ICS", method: "REQUEST" })),
  GenerateIcsRole: { ATTENDEE: "ATTENDEE", ORGANIZER: "ORGANIZER" },
}));

vi.mock("../src/renderEmail", () => ({
  default: vi.fn(() => Promise.resolve("<html>mock</html>")),
}));

vi.mock("@calcom/lib/getReplyToHeader", () => ({
  getReplyToHeader: vi.fn(() => ({ replyTo: "reply-to-header" })),
}));

vi.mock("@calcom/lib/CalEventParser", () => ({
  getRichDescription: vi.fn(() => "rich-description"),
}));

// Expose the protected payload builder for assertions.
class TestAttendeeScheduledEmail extends AttendeeScheduledEmail {
  public getPayload() {
    return this.getNodeMailerPayload();
  }
}

const translate = ((key: string) => key) as unknown as Person["language"]["translate"];

const buildAttendee = (overrides: Partial<Person> = {}) =>
  buildPerson({
    name: "Attendee One",
    email: "attendee1@example.com",
    language: { locale: "en", translate },
    ...overrides,
  });

describe("AttendeeScheduledEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor attendee visibility", () => {
    it("keeps all attendees for a non-seated event", () => {
      const attendee = buildAttendee();
      const other = buildAttendee({ email: "other@example.com", name: "Other" });
      const calEvent = buildCalendarEvent({ attendees: [attendee, other] });

      const email = new AttendeeScheduledEmail(calEvent, attendee);
      expect(email.calEvent.attendees).toHaveLength(2);
    });

    it("hides other attendees for a seated event when attendees should not be shown", () => {
      const attendee = buildAttendee();
      const other = buildAttendee({ email: "other@example.com", name: "Other" });
      const calEvent = buildCalendarEvent({
        attendees: [attendee, other],
        seatsPerTimeSlot: 5,
        seatsShowAttendees: false,
      });

      const email = new AttendeeScheduledEmail(calEvent, attendee);
      expect(email.calEvent.attendees).toEqual([attendee]);
    });

    it("shows all attendees for a seated event when seatsShowAttendees is true", () => {
      const attendee = buildAttendee();
      const other = buildAttendee({ email: "other@example.com", name: "Other" });
      const calEvent = buildCalendarEvent({
        attendees: [attendee, other],
        seatsPerTimeSlot: 5,
        seatsShowAttendees: true,
      });

      const email = new AttendeeScheduledEmail(calEvent, attendee);
      expect(email.calEvent.attendees).toHaveLength(2);
    });

    it("respects an explicit showAttendees=false override for a seated event", () => {
      const attendee = buildAttendee();
      const other = buildAttendee({ email: "other@example.com", name: "Other" });
      const calEvent = buildCalendarEvent({
        attendees: [attendee, other],
        seatsPerTimeSlot: 5,
        seatsShowAttendees: true,
      });

      const email = new AttendeeScheduledEmail(calEvent, attendee, false);
      expect(email.calEvent.attendees).toEqual([attendee]);
    });
  });

  describe("getNodeMailerPayload", () => {
    it("addresses the email to the attendee and sets the event title as subject", async () => {
      const attendee = buildAttendee();
      const calEvent = buildCalendarEvent({ title: "Intro Call", attendees: [attendee] });

      const payload = await new TestAttendeeScheduledEmail(calEvent, attendee).getPayload();

      expect(payload.to).toBe(`${attendee.name} <${attendee.email}>`);
      expect(payload.from).toContain(calEvent.organizer.name as string);
      expect(payload.subject).toBe("Intro Call");
      expect(payload.icalEvent).toMatchObject({ method: "REQUEST" });
      expect(payload.html).toBe("<html>mock</html>");
    });

    it("builds a reply-to header excluding the recipient attendee", async () => {
      const { getReplyToHeader } = await import("@calcom/lib/getReplyToHeader");
      const attendee = buildAttendee();
      const other = buildAttendee({ email: "other@example.com", name: "Other" });
      const calEvent = buildCalendarEvent({ attendees: [attendee, other] });

      await new TestAttendeeScheduledEmail(calEvent, attendee).getPayload();

      expect(getReplyToHeader).toHaveBeenCalledWith(calEvent, ["other@example.com"]);
    });
  });

  describe("getTextBody translation keys", () => {
    const spyTranslate = vi.fn((key: string) => key);

    const buildEventWith = (overrides: Partial<CalendarEvent>) =>
      buildCalendarEvent({
        attendees: [
          buildAttendee({
            language: { locale: "en", translate: spyTranslate as unknown as Person["language"]["translate"] },
          }),
        ],
        ...overrides,
      });

    beforeEach(() => spyTranslate.mockClear());

    it("uses the non-recurring scheduled key by default", async () => {
      const calEvent = buildEventWith({});
      await new TestAttendeeScheduledEmail(calEvent, calEvent.attendees[0]).getPayload();
      expect(spyTranslate).toHaveBeenCalledWith("your_event_has_been_scheduled");
    });

    it("uses the recurring scheduled key when the event recurs", async () => {
      const calEvent = buildEventWith({ recurringEvent: { count: 3, freq: 2, interval: 1 } });
      await new TestAttendeeScheduledEmail(calEvent, calEvent.attendees[0]).getPayload();
      expect(spyTranslate).toHaveBeenCalledWith("your_event_has_been_scheduled_recurring");
    });
  });
});
