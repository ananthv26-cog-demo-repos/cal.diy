import { buildCalendarEvent, buildPerson } from "@calcom/lib/test/builder";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import OrganizerScheduledEmail from "./organizer-scheduled-email";

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

class TestOrganizerScheduledEmail extends OrganizerScheduledEmail {
  public getPayload() {
    return this.getNodeMailerPayload();
  }
}

const translate = ((key: string) => key) as unknown as Person["language"]["translate"];

const buildEvent = (overrides: Partial<CalendarEvent> = {}) =>
  buildCalendarEvent({
    title: "Team Sync",
    organizer: buildPerson({
      name: "Org Owner",
      email: "owner@example.com",
      language: { locale: "en", translate },
    }),
    attendees: [
      buildPerson({ email: "a@example.com", language: { locale: "en", translate } }),
      buildPerson({ email: "b@example.com", language: { locale: "en", translate } }),
    ],
    ...overrides,
  });

describe("OrganizerScheduledEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends to the organizer by default", async () => {
    const calEvent = buildEvent();
    const payload = await new TestOrganizerScheduledEmail({ calEvent }).getPayload();
    expect(payload.to).toBe("owner@example.com");
    expect(payload.subject).toBe("Team Sync");
  });

  it("sends to the team member instead of the organizer when a teamMember is provided", async () => {
    const calEvent = buildEvent();
    const teamMember = buildPerson({ email: "member@example.com", language: { locale: "en", translate } });
    const payload = await new TestOrganizerScheduledEmail({ calEvent, teamMember }).getPayload();
    expect(payload.to).toBe("member@example.com");
  });

  it("prefixes the subject with the new_attendee label when newSeat is set", async () => {
    const calEvent = buildEvent();
    const payload = await new TestOrganizerScheduledEmail({ calEvent, newSeat: true }).getPayload();
    expect(payload.subject).toBe("new_attendee: Team Sync");
  });

  it("generates an ICS attachment and rendered html", async () => {
    const generateIcsFile = (await import("../lib/generateIcsFile")).default;
    const calEvent = buildEvent();
    const payload = await new TestOrganizerScheduledEmail({ calEvent }).getPayload();
    expect(payload.icalEvent).toMatchObject({ method: "REQUEST" });
    expect(payload.html).toBe("<html>mock</html>");
    expect(generateIcsFile).toHaveBeenCalledWith(
      expect.objectContaining({ role: "ORGANIZER", status: "CONFIRMED" })
    );
  });

  it("builds the reply-to header from all attendee emails", async () => {
    const { getReplyToHeader } = await import("@calcom/lib/getReplyToHeader");
    const calEvent = buildEvent();
    await new TestOrganizerScheduledEmail({ calEvent }).getPayload();
    expect(getReplyToHeader).toHaveBeenCalledWith(calEvent, ["a@example.com", "b@example.com"], true);
  });

  it("uses the recurring text key when the event recurs", async () => {
    const spyTranslate = vi.fn((key: string) => key);
    const calEvent = buildEvent({
      organizer: buildPerson({
        email: "owner@example.com",
        language: { locale: "en", translate: spyTranslate as unknown as Person["language"]["translate"] },
      }),
      recurringEvent: { count: 2, freq: 2, interval: 1 },
    });
    await new TestOrganizerScheduledEmail({ calEvent }).getPayload();
    expect(spyTranslate).toHaveBeenCalledWith("new_event_scheduled_recurring");
  });
});
