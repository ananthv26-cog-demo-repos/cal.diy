import { buildCalendarEvent, buildPerson } from "@calcom/lib/test/builder";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import BrokenIntegrationEmail from "./broken-integration-email";

vi.mock("@calcom/prisma", () => ({ prisma: {} }));

vi.mock("../src/renderEmail", () => ({
  default: vi.fn(() => Promise.resolve("<html>broken</html>")),
}));

vi.mock("@calcom/lib/CalEventParser", () => ({
  getRichDescription: vi.fn(() => "rich-description"),
}));

class TestBrokenIntegrationEmail extends BrokenIntegrationEmail {
  public getPayload() {
    return this.getNodeMailerPayload();
  }
}

const buildEvent = (overrides: Partial<CalendarEvent> = {}) => {
  const translate = ((key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key) as unknown as Person["language"]["translate"];
  return buildCalendarEvent({
    type: "30min",
    // The subject exercises getFormattedDate, which resolves the organizer's zone/locale via
    // dayjs — pin both so the builder's faker defaults can't make this flaky.
    startTime: "2024-01-15T14:00:00.000Z",
    endTime: "2024-01-15T15:00:00.000Z",
    organizer: buildPerson({
      name: "Org Owner",
      email: "owner@example.com",
      timeZone: "UTC",
      language: { locale: "en", translate },
    }),
    attendees: [buildPerson({ name: "Attendee One", email: "a@example.com", timeZone: "UTC" })],
    ...overrides,
  });
};

describe("BrokenIntegrationEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("addresses the email to the organizer", async () => {
    const calEvent = buildEvent();
    const payload = await new TestBrokenIntegrationEmail(calEvent, "calendar").getPayload();
    expect(payload.to).toBe("owner@example.com");
  });

  it("prefixes the subject with [Action Required] and interpolates event details", async () => {
    const calEvent = buildEvent();
    const payload = await new TestBrokenIntegrationEmail(calEvent, "video").getPayload();
    const subject = payload.subject as string;
    expect(subject.startsWith("[Action Required] confirmed_event_type_subject:")).toBe(true);
    expect(subject).toContain('"eventType":"30min"');
    expect(subject).toContain('"name":"Attendee One"');
  });

  it("passes the integration type through to the rendered template", async () => {
    const renderEmail = (await import("../src/renderEmail")).default;
    const calEvent = buildEvent();
    await new TestBrokenIntegrationEmail(calEvent, "video").getPayload();
    expect(renderEmail).toHaveBeenCalledWith(
      "BrokenIntegrationEmail",
      expect.objectContaining({ type: "video", attendee: calEvent.organizer })
    );
  });

  it("renders the html body", async () => {
    const calEvent = buildEvent();
    const payload = await new TestBrokenIntegrationEmail(calEvent, "calendar").getPayload();
    expect(payload.html).toBe("<html>broken</html>");
  });
});
