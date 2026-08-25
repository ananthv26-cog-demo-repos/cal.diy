import type { CalendarEvent } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import generateIcsFile, { GenerateIcsRole } from "./generateIcsFile";
import generateIcsString from "./generateIcsString";

vi.mock("./generateIcsString", () => ({
  default: vi.fn(() => "BEGIN:VCALENDAR"),
}));

type DestinationCalendar = NonNullable<CalendarEvent["destinationCalendar"]>[number];

const buildDestinationCalendar = (integration: string): DestinationCalendar => ({
  id: 1,
  integration,
  externalId: "external-id",
  primaryEmail: null,
  userId: null,
  eventTypeId: null,
  credentialId: null,
  delegationCredentialId: null,
  customCalendarReminder: null,
  createdAt: null,
  updatedAt: null,
});

const buildEvent = (destinationCalendar?: CalendarEvent["destinationCalendar"]) =>
  ({
    title: "Test event",
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T11:00:00Z",
    destinationCalendar,
  }) as CalendarEvent;

describe("generateIcsFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an attachment with the generated ics content", () => {
    const calEvent = buildEvent();

    const result = generateIcsFile({
      calEvent,
      role: GenerateIcsRole.ORGANIZER,
      status: "CONFIRMED",
    });

    expect(result).toEqual({
      filename: "event.ics",
      content: "BEGIN:VCALENDAR",
      method: "REQUEST",
    });
    expect(generateIcsString).toHaveBeenCalledWith({
      event: calEvent,
      status: "CONFIRMED",
      t: undefined,
    });
  });

  it("forwards the translation function to generateIcsString", () => {
    const t = ((key: string) => key) as Parameters<typeof generateIcsFile>[0]["t"];

    generateIcsFile({
      calEvent: buildEvent(),
      role: GenerateIcsRole.ATTENDEE,
      status: "CANCELLED",
      t,
    });

    expect(generateIcsString).toHaveBeenCalledWith(expect.objectContaining({ status: "CANCELLED", t }));
  });

  it("returns null for non-attendees when the destination calendar is office365", () => {
    const result = generateIcsFile({
      calEvent: buildEvent([buildDestinationCalendar("office365_calendar")]),
      role: GenerateIcsRole.ORGANIZER,
      status: "CONFIRMED",
    });

    expect(result).toBeNull();
    expect(generateIcsString).not.toHaveBeenCalled();
  });

  it("still returns an attachment for attendees of office365 destination calendars", () => {
    const result = generateIcsFile({
      calEvent: buildEvent([buildDestinationCalendar("office365_calendar")]),
      role: GenerateIcsRole.ATTENDEE,
      status: "CONFIRMED",
    });

    expect(result).not.toBeNull();
    expect(generateIcsString).toHaveBeenCalled();
  });

  it("returns an attachment when the destination calendar is another integration", () => {
    const result = generateIcsFile({
      calEvent: buildEvent([buildDestinationCalendar("google_calendar")]),
      role: GenerateIcsRole.ORGANIZER,
      status: "CONFIRMED",
    });

    expect(result).not.toBeNull();
  });

  it("returns an attachment when the destination calendar list is empty", () => {
    const result = generateIcsFile({
      calEvent: buildEvent([]),
      role: GenerateIcsRole.ORGANIZER,
      status: "CONFIRMED",
    });

    expect(result).not.toBeNull();
  });
});
