import type { CalendarEvent } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import generateIcsFile, { GenerateIcsRole } from "./generateIcsFile";
import generateIcsString from "./generateIcsString";

vi.mock("./generateIcsString", () => ({
  default: vi.fn(() => "MOCK_ICS_STRING"),
}));

const mockedGenerateIcsString = vi.mocked(generateIcsString);

const buildEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    startTime: "2024-01-15T14:00:00.000Z",
    endTime: "2024-01-15T15:00:00.000Z",
    organizer: { email: "organizer@example.com" },
    attendees: [],
    ...overrides,
  }) as CalendarEvent;

const t = ((key: string) => key) as unknown as TFunction;

describe("generateIcsFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a REQUEST ics attachment built from generateIcsString", () => {
    const calEvent = buildEvent();
    const result = generateIcsFile({ calEvent, role: GenerateIcsRole.ATTENDEE, status: "CONFIRMED", t });

    expect(result).toEqual({
      filename: "event.ics",
      content: "MOCK_ICS_STRING",
      method: "REQUEST",
    });
    expect(mockedGenerateIcsString).toHaveBeenCalledWith({ event: calEvent, status: "CONFIRMED", t });
  });

  it("returns null for an organizer when the destination calendar is office365", () => {
    const calEvent = buildEvent({
      destinationCalendar: [{ integration: "office365_calendar" }],
    } as Partial<CalendarEvent>);

    const result = generateIcsFile({ calEvent, role: GenerateIcsRole.ORGANIZER, status: "CONFIRMED" });

    expect(result).toBeNull();
    expect(mockedGenerateIcsString).not.toHaveBeenCalled();
  });

  it("still generates the ics for an attendee even with an office365 destination calendar", () => {
    const calEvent = buildEvent({
      destinationCalendar: [{ integration: "office365_calendar" }],
    } as Partial<CalendarEvent>);

    const result = generateIcsFile({ calEvent, role: GenerateIcsRole.ATTENDEE, status: "CONFIRMED" });

    expect(result).not.toBeNull();
    expect(result?.content).toBe("MOCK_ICS_STRING");
  });

  it("generates the ics for an organizer when the destination calendar is not office365", () => {
    const calEvent = buildEvent({
      destinationCalendar: [{ integration: "google_calendar" }],
    } as Partial<CalendarEvent>);

    const result = generateIcsFile({ calEvent, role: GenerateIcsRole.ORGANIZER, status: "CANCELLED" });

    expect(result).not.toBeNull();
    expect(mockedGenerateIcsString).toHaveBeenCalledWith({
      event: calEvent,
      status: "CANCELLED",
      t: undefined,
    });
  });

  it("generates the ics for an organizer when there is no destination calendar", () => {
    const result = generateIcsFile({
      calEvent: buildEvent(),
      role: GenerateIcsRole.ORGANIZER,
      status: "CONFIRMED",
    });

    expect(result).not.toBeNull();
    expect(mockedGenerateIcsString).toHaveBeenCalledTimes(1);
  });
});
