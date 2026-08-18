import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared spy registries populated by the mocked email/SMS classes below.
const h = vi.hoisted(() => {
  const emailCtorArgs: Record<string, unknown[][]> = {};
  const smsAttendeeArgs: Record<string, unknown[][]> = {};

  const record = (registry: Record<string, unknown[][]>, name: string, args: unknown[]) => {
    if (!registry[name]) registry[name] = [];
    registry[name].push(args);
  };

  const makeEmailMock = (name: string) => ({
    default: class {
      constructor(...args: unknown[]) {
        record(emailCtorArgs, name, args);
      }
      sendEmail() {
        return Promise.resolve(`sent:${name}`);
      }
    },
  });

  const makeSmsMock = (name: string) => ({
    default: class {
      constructor(..._args: unknown[]) {
        /* no-op */
      }
      sendSMSToAttendee(...args: unknown[]) {
        record(smsAttendeeArgs, name, args);
        return Promise.resolve();
      }
      sendSMSToAttendees() {
        return Promise.resolve();
      }
    },
  });

  return { emailCtorArgs, smsAttendeeArgs, makeEmailMock, makeSmsMock };
});

vi.mock("@calcom/prisma", () => ({ prisma: {} }));
// Identity so we can assert against the same object we passed in.
vi.mock("@calcom/lib/formatCalendarEvent", () => ({ formatCalEvent: (e: CalendarEvent) => e }));
// Unwrap the reporting decorator so the wrapped functions run directly.
vi.mock("@calcom/lib/sentryWrapper", () => ({ withReporting: (fn: unknown) => fn }));

vi.mock("./templates/organizer-scheduled-email", () => h.makeEmailMock("OrganizerScheduledEmail"));
vi.mock("./templates/organizer-rescheduled-email", () => h.makeEmailMock("OrganizerRescheduledEmail"));
vi.mock("./templates/organizer-cancelled-email", () => h.makeEmailMock("OrganizerCancelledEmail"));
vi.mock("./templates/organizer-reassigned-email", () => h.makeEmailMock("OrganizerReassignedEmail"));
vi.mock("./templates/attendee-rescheduled-email", () => h.makeEmailMock("AttendeeRescheduledEmail"));
vi.mock("./templates/attendee-updated-email", () => h.makeEmailMock("AttendeeUpdatedEmail"));

vi.mock("../sms/attendee/event-scheduled-sms", () => h.makeSmsMock("EventSuccessfullyScheduledSMS"));
vi.mock("../sms/attendee/event-rescheduled-sms", () => h.makeSmsMock("EventSuccessfullyReScheduledSMS"));
vi.mock("../sms/attendee/event-cancelled-sms", () => h.makeSmsMock("EventCancelledSMS"));

import {
  sendReassignedScheduledEmailsAndSMS,
  sendReassignedUpdatedEmailsAndSMS,
  sendRoundRobinCancelledEmailsAndSMS,
  sendRoundRobinRescheduledEmailsAndSMS,
} from "./email-manager";

const translate = ((key: string) => key) as unknown as Person["language"]["translate"];

const buildMember = (overrides: Partial<Person> = {}): Person =>
  ({
    name: "Member",
    email: "member@example.com",
    timeZone: "UTC",
    language: { locale: "en", translate },
    ...overrides,
  }) as Person;

const buildEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    title: "Event",
    startTime: "2024-01-15T14:00:00.000Z",
    endTime: "2024-01-15T15:00:00.000Z",
    organizer: buildMember({ name: "Organizer", email: "organizer@example.com" }),
    attendees: [],
    ...overrides,
  }) as CalendarEvent;

const hostDisabled: EventTypeMetadata = { disableStandardEmails: { all: { host: true } } };
const attendeeDisabled: EventTypeMetadata = { disableStandardEmails: { all: { attendee: true } } };

beforeEach(() => {
  for (const key of Object.keys(h.emailCtorArgs)) delete h.emailCtorArgs[key];
  for (const key of Object.keys(h.smsAttendeeArgs)) delete h.smsAttendeeArgs[key];
});

describe("sendReassignedScheduledEmailsAndSMS", () => {
  it("sends an OrganizerScheduledEmail per member and SMS only to members with a phone number", async () => {
    const members = [
      buildMember({ email: "m1@example.com" }),
      buildMember({ email: "m2@example.com", phoneNumber: "+15551234567" } as Partial<Person>),
    ];

    await sendReassignedScheduledEmailsAndSMS({ calEvent: buildEvent(), members });

    expect(h.emailCtorArgs.OrganizerScheduledEmail).toHaveLength(2);
    const smsCalls = h.smsAttendeeArgs.EventSuccessfullyScheduledSMS ?? [];
    expect(smsCalls).toHaveLength(1);
    expect(smsCalls[0]?.[0]).toBe(members[1]);
  });

  it("returns early and sends nothing when host emails are disabled", async () => {
    await sendReassignedScheduledEmailsAndSMS({
      calEvent: buildEvent(),
      members: [buildMember()],
      eventTypeMetadata: hostDisabled,
    });

    expect(h.emailCtorArgs.OrganizerScheduledEmail).toBeUndefined();
  });
});

describe("sendRoundRobinRescheduledEmailsAndSMS", () => {
  it("sends an attendee email for a pure attendee and an organizer email for a team member", async () => {
    const attendee = buildMember({ email: "attendee@example.com" });
    const teamMember = buildMember({ email: "host@example.com" });
    const calEvent = buildEvent({
      attendees: [attendee],
      team: { name: "Team", members: [teamMember] },
    } as Partial<CalendarEvent>);

    await sendRoundRobinRescheduledEmailsAndSMS(calEvent, [attendee, teamMember]);

    expect(h.emailCtorArgs.AttendeeRescheduledEmail).toHaveLength(1);
    expect(h.emailCtorArgs.OrganizerRescheduledEmail).toHaveLength(1);
  });

  it("does not send an attendee email when attendee emails are disabled", async () => {
    const attendee = buildMember({ email: "attendee@example.com" });
    const calEvent = buildEvent({ attendees: [attendee] });

    await sendRoundRobinRescheduledEmailsAndSMS(calEvent, [attendee], attendeeDisabled);

    expect(h.emailCtorArgs.AttendeeRescheduledEmail).toBeUndefined();
  });
});

describe("sendReassignedUpdatedEmailsAndSMS", () => {
  it("sends an AttendeeUpdatedEmail per attendee", async () => {
    const calEvent = buildEvent({
      attendees: [buildMember({ email: "a@example.com" }), buildMember({ email: "b@example.com" })],
    });

    await sendReassignedUpdatedEmailsAndSMS({ calEvent, showAttendees: true });

    expect(h.emailCtorArgs.AttendeeUpdatedEmail).toHaveLength(2);
  });

  it("skips sending when attendee emails are disabled", async () => {
    const calEvent = buildEvent({ attendees: [buildMember({ email: "a@example.com" })] });

    await sendReassignedUpdatedEmailsAndSMS({
      calEvent,
      showAttendees: true,
      eventTypeMetadata: attendeeDisabled,
    });

    expect(h.emailCtorArgs.AttendeeUpdatedEmail).toBeUndefined();
  });
});

describe("sendRoundRobinCancelledEmailsAndSMS", () => {
  it("sends an OrganizerCancelledEmail per member", async () => {
    const members = [buildMember({ email: "m1@example.com" }), buildMember({ email: "m2@example.com" })];

    await sendRoundRobinCancelledEmailsAndSMS(buildEvent(), members);

    expect(h.emailCtorArgs.OrganizerCancelledEmail).toHaveLength(2);
  });

  it("returns early when host emails are disabled", async () => {
    await sendRoundRobinCancelledEmailsAndSMS(buildEvent(), [buildMember()], hostDisabled);

    expect(h.emailCtorArgs.OrganizerCancelledEmail).toBeUndefined();
  });
});
