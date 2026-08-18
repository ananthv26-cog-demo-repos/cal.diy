import { TimeFormat } from "@calcom/lib/timeFormat";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { describe, expect, it } from "vitest";
import { getFormattedDate } from "./date-formatting";

// These expectations assume TZ=UTC (the repo's test convention). They are not TZ-independent:
// getFormattedDate calls `.tz(zone).locale(locale)`, and dayjs drops the timezone binding on
// `.locale()`, so on a non-UTC host the rendered time is shifted by the host offset. Documented
// in the PR description rather than fixed here, since this file is test-only.

// Echoing translate so we can assert which day/month tokens were looked up.
const translate = ((key: string) => `t(${key})`) as unknown as TFunction;

const buildAttendee = (overrides: Partial<Person> = {}): Person =>
  ({
    name: "Attendee",
    email: "attendee@example.com",
    timeZone: "UTC",
    language: { locale: "en", translate },
    ...overrides,
  }) as Person;

const buildEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    // 2024-01-15 is a Monday; 14:00-15:00 UTC
    startTime: "2024-01-15T14:00:00.000Z",
    endTime: "2024-01-15T15:00:00.000Z",
    organizer: {
      name: "Organizer",
      email: "organizer@example.com",
      timeZone: "UTC",
      timeFormat: TimeFormat.TWELVE_HOUR,
      language: { locale: "en", translate },
    },
    ...overrides,
  }) as CalendarEvent;

describe("getFormattedDate", () => {
  it("formats a 12-hour range with translated weekday and month", () => {
    const result = getFormattedDate(buildEvent(), buildAttendee());
    expect(result).toBe("2:00pm - 3:00pm, t(monday), t(january) 15, 2024");
  });

  it("uses 24-hour formatting when the organizer prefers it", () => {
    const event = buildEvent();
    event.organizer.timeFormat = TimeFormat.TWENTY_FOUR_HOUR;
    const result = getFormattedDate(event, buildAttendee());
    expect(result).toBe("14:00 - 15:00, t(monday), t(january) 15, 2024");
  });

  it("defaults to 12-hour formatting when the organizer has no timeFormat", () => {
    const event = buildEvent();
    event.organizer.timeFormat = undefined;
    const result = getFormattedDate(event, buildAttendee());
    expect(result).toBe("2:00pm - 3:00pm, t(monday), t(january) 15, 2024");
  });

  it("renders the date in the attendee's timezone, not the organizer's", () => {
    // 14:00 UTC is 06:00 in America/Los_Angeles (PST, UTC-8; still Monday the 15th).
    const result = getFormattedDate(buildEvent(), buildAttendee({ timeZone: "America/Los_Angeles" }));
    expect(result).toBe("6:00am - 7:00am, t(monday), t(january) 15, 2024");
  });

  it("reflects a timezone that rolls the date back to the previous day", () => {
    // 05:00 UTC on Mon the 15th is 18:00 on Sun the 14th in Pacific/Midway (UTC-11).
    const event = buildEvent({
      startTime: "2024-01-15T05:00:00.000Z",
      endTime: "2024-01-15T06:00:00.000Z",
    });
    const result = getFormattedDate(event, buildAttendee({ timeZone: "Pacific/Midway" }));
    expect(result).toBe("6:00pm - 7:00pm, t(sunday), t(january) 14, 2024");
  });
});
