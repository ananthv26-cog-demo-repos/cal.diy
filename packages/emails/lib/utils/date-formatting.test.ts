import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { describe, expect, it, vi } from "vitest";
import { getFormattedDate } from "./date-formatting";

const buildAttendee = (overrides: Partial<Person> = {}): Person =>
  ({
    name: "Attendee",
    email: "attendee@example.com",
    timeZone: "America/New_York",
    language: {
      locale: "en",
      translate: vi.fn((key: string) => key.toUpperCase()),
    },
    ...overrides,
  }) as Person;

const buildCalEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    startTime: "2024-03-15T14:00:00Z",
    endTime: "2024-03-15T15:30:00Z",
    organizer: {
      name: "Organizer",
      email: "organizer@example.com",
      timeZone: "Europe/London",
      language: { locale: "en", translate: vi.fn((key: string) => key) },
    },
    ...overrides,
  }) as CalendarEvent;

describe("getFormattedDate", () => {
  it("formats the range in the attendee timezone using the organizer's 12 hour format", () => {
    const result = getFormattedDate(
      buildCalEvent({ organizer: { ...buildCalEvent().organizer, timeFormat: TimeFormat.TWELVE_HOUR } }),
      buildAttendee()
    );

    expect(result).toBe("10:00am - 11:30am, FRIDAY, MARCH 15, 2024");
  });

  it("respects the organizer's 24 hour time format", () => {
    const result = getFormattedDate(
      buildCalEvent({ organizer: { ...buildCalEvent().organizer, timeFormat: TimeFormat.TWENTY_FOUR_HOUR } }),
      buildAttendee()
    );

    expect(result).toBe("10:00 - 11:30, FRIDAY, MARCH 15, 2024");
  });

  it("defaults to the 12 hour format when the organizer has no preference", () => {
    const result = getFormattedDate(buildCalEvent(), buildAttendee());

    expect(result).toBe("10:00am - 11:30am, FRIDAY, MARCH 15, 2024");
  });

  it("uses the attendee timezone, which can shift the weekday and date", () => {
    const result = getFormattedDate(
      buildCalEvent({ startTime: "2024-03-15T23:30:00Z", endTime: "2024-03-16T00:30:00Z" }),
      buildAttendee({ timeZone: "Asia/Tokyo" })
    );

    expect(result).toBe("8:30am - 9:30am, SATURDAY, MARCH 16, 2024");
  });

  it("translates the weekday and month through the attendee translate function", () => {
    const translate = vi.fn((key: string) => `t(${key})`);
    const attendee = buildAttendee({
      language: { locale: "en", translate: translate as unknown as Person["language"]["translate"] },
    });

    const result = getFormattedDate(buildCalEvent(), attendee);

    expect(translate).toHaveBeenCalledWith("friday");
    expect(translate).toHaveBeenCalledWith("march");
    expect(result).toContain("t(friday)");
    expect(result).toContain("t(march)");
  });
});
