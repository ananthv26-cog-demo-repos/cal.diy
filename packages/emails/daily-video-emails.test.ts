import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendDailyVideoRecordingEmails, sendDailyVideoTranscriptEmails } from "./daily-video-emails";

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
    attendees: [buildPerson("a1@example.com"), buildPerson("a2@example.com")],
    ...overrides,
  }) as CalendarEvent;

describe("sendDailyVideoTranscriptEmails", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("emails the organizer and every attendee", async () => {
    const calEvent = buildCalEvent();
    const transcripts = ["t1", "t2"];

    await sendDailyVideoTranscriptEmails(calEvent, transcripts);

    expect(emailMock.constructed.map((c) => c.name)).toEqual([
      "OrganizerDailyVideoDownloadTranscriptEmail",
      "AttendeeDailyVideoDownloadTranscriptEmail",
      "AttendeeDailyVideoDownloadTranscriptEmail",
    ]);
    expect(emailMock.constructed[0].args).toEqual([calEvent, transcripts]);
    expect(emailMock.constructed[1].args).toEqual([calEvent, calEvent.attendees[0], transcripts]);
  });

  it("only emails the organizer when there are no attendees", async () => {
    await sendDailyVideoTranscriptEmails(buildCalEvent({ attendees: [] }), []);

    expect(emailMock.constructed).toHaveLength(1);
  });

  it("rejects when an email cannot be built", async () => {
    emailMock.throwOn = "OrganizerDailyVideoDownloadTranscriptEmail";

    await expect(sendDailyVideoTranscriptEmails(buildCalEvent(), [])).rejects.toBeUndefined();
  });
});

describe("sendDailyVideoRecordingEmails", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
  });

  it("emails the organizer and every attendee with the download link", async () => {
    const calEvent = buildCalEvent();

    await sendDailyVideoRecordingEmails(calEvent, "https://download.example.com");

    expect(emailMock.constructed.map((c) => c.name)).toEqual([
      "OrganizerDailyVideoDownloadRecordingEmail",
      "AttendeeDailyVideoDownloadRecordingEmail",
      "AttendeeDailyVideoDownloadRecordingEmail",
    ]);
    expect(emailMock.constructed[0].args[1]).toBe("https://download.example.com");
  });

  it("strips the platform client id from emails before sending", async () => {
    const calEvent = buildCalEvent({
      platformClientId: "clientid",
      attendees: [buildPerson("a1+clientid@example.com")],
      organizer: buildPerson("organizer+clientid@example.com"),
    });

    await sendDailyVideoRecordingEmails(calEvent, "https://download.example.com");

    const attendeeCall = emailMock.constructed[1];
    expect((attendeeCall.args[1] as Person).email).toBe("a1@example.com");
    expect(calEvent.attendees[0].email).toBe("a1+clientid@example.com");
  });
});
