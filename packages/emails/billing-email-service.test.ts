import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendNoShowFeeChargedEmail, sendOrganizerPaymentRefundFailedEmail } from "./billing-email-service";

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

vi.mock("./templates/no-show-fee-charged-email", mockTemplate("NoShowFeeChargedEmail"));
vi.mock(
  "./templates/organizer-payment-refund-failed-email",
  mockTemplate("OrganizerPaymentRefundFailedEmail")
);

const buildPerson = (email: string): Person =>
  ({
    name: email,
    email,
    timeZone: "UTC",
    language: { locale: "en", translate: vi.fn() },
  }) as unknown as Person;

const buildCalEvent = (team?: CalendarEvent["team"]): CalendarEvent =>
  ({
    title: "Paid event",
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T11:00:00Z",
    organizer: buildPerson("organizer@example.com"),
    attendees: [buildPerson("attendee@example.com")],
    team,
  }) as CalendarEvent;

describe("sendOrganizerPaymentRefundFailedEmail", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("sends a single email when there is no team", async () => {
    const calEvent = buildCalEvent();

    await sendOrganizerPaymentRefundFailedEmail(calEvent);

    expect(emailMock.constructed).toEqual([
      { name: "OrganizerPaymentRefundFailedEmail", args: [{ calEvent }] },
    ]);
  });

  it("sends an additional email per team member", async () => {
    const members = [buildPerson("m1@example.com"), buildPerson("m2@example.com")];
    const calEvent = buildCalEvent({ name: "Team", members } as CalendarEvent["team"]);

    await sendOrganizerPaymentRefundFailedEmail(calEvent);

    expect(emailMock.constructed).toHaveLength(3);
    expect(emailMock.constructed.slice(1).map((c) => c.args)).toEqual([
      [{ calEvent, teamMember: members[0] }],
      [{ calEvent, teamMember: members[1] }],
    ]);
  });

  it("ignores a team without members", async () => {
    const calEvent = buildCalEvent({ name: "Team" } as CalendarEvent["team"]);

    await sendOrganizerPaymentRefundFailedEmail(calEvent);

    expect(emailMock.constructed).toHaveLength(1);
  });

  it("rejects when the email cannot be built", async () => {
    emailMock.throwOn = "OrganizerPaymentRefundFailedEmail";

    await expect(sendOrganizerPaymentRefundFailedEmail(buildCalEvent())).rejects.toBeUndefined();
  });
});

describe("sendNoShowFeeChargedEmail", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
  });

  it("sends the no show fee email to the attendee", async () => {
    const attendee = buildPerson("attendee@example.com");
    const calEvent = buildCalEvent();

    await sendNoShowFeeChargedEmail(attendee, calEvent);

    expect(emailMock.constructed).toEqual([{ name: "NoShowFeeChargedEmail", args: [calEvent, attendee] }]);
  });

  it("does not send when attendee emails are disabled by the event type metadata", async () => {
    const metadata: EventTypeMetadata = { disableStandardEmails: { all: { attendee: true } } };

    await sendNoShowFeeChargedEmail(buildPerson("attendee@example.com"), buildCalEvent(), metadata);

    expect(emailMock.constructed).toHaveLength(0);
  });

  it("sends when the metadata flag is disabled", async () => {
    const metadata: EventTypeMetadata = { disableStandardEmails: { all: { attendee: false } } };

    await sendNoShowFeeChargedEmail(buildPerson("attendee@example.com"), buildCalEvent(), metadata);

    expect(emailMock.constructed).toHaveLength(1);
  });
});
