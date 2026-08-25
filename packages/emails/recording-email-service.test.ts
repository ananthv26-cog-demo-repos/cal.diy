import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendDailyVideoRecordingEmails, sendDailyVideoTranscriptEmails } from "./recording-email-service";

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

vi.mock(
  "./templates/attendee-daily-video-download-recording-email",
  mockTemplate("AttendeeDailyVideoDownloadRecordingEmail")
);
vi.mock(
  "./templates/attendee-daily-video-download-transcript-email",
  mockTemplate("AttendeeDailyVideoDownloadTranscriptEmail")
);
vi.mock(
  "./templates/organizer-daily-video-download-recording-email",
  mockTemplate("OrganizerDailyVideoDownloadRecordingEmail")
);
vi.mock(
  "./templates/organizer-daily-video-download-transcript-email",
  mockTemplate("OrganizerDailyVideoDownloadTranscriptEmail")
);

const buildPerson = (email: string): Person =>
  ({
    name: email,
    email,
    timeZone: "UTC",
    language: { locale: "en", translate: vi.fn() },
  }) as unknown as Person;

const buildCalEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    title: "Recorded event",
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T11:00:00Z",
    organizer: buildPerson("organizer@example.com"),
    attendees: [buildPerson("a1@example.com")],
    ...overrides,
  }) as CalendarEvent;

describe("recording-email-service", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sends recording emails to the organizer and attendees", async () => {
    await sendDailyVideoRecordingEmails(buildCalEvent(), "https://download.example.com");

    expect(emailMock.constructed.map((c) => c.name)).toEqual([
      "OrganizerDailyVideoDownloadRecordingEmail",
      "AttendeeDailyVideoDownloadRecordingEmail",
    ]);
  });

  it("formats the cal event before sending recording emails", async () => {
    const calEvent = buildCalEvent({
      platformClientId: "clientid",
      attendees: [buildPerson("a1+clientid@example.com")],
    });

    await sendDailyVideoRecordingEmails(calEvent, "link");

    expect((emailMock.constructed[1].args[1] as Person).email).toBe("a1@example.com");
  });

  it("sends transcript emails to the organizer and attendees", async () => {
    const calEvent = buildCalEvent();
    const transcripts = ["t1"];

    await sendDailyVideoTranscriptEmails(calEvent, transcripts);

    expect(emailMock.constructed).toEqual([
      { name: "OrganizerDailyVideoDownloadTranscriptEmail", args: [calEvent, transcripts] },
      {
        name: "AttendeeDailyVideoDownloadTranscriptEmail",
        args: [calEvent, calEvent.attendees[0], transcripts],
      },
    ]);
  });

  it("rejects when a recording email cannot be built", async () => {
    emailMock.throwOn = "AttendeeDailyVideoDownloadRecordingEmail";

    await expect(sendDailyVideoRecordingEmails(buildCalEvent(), "link")).rejects.toBeUndefined();
  });
});
