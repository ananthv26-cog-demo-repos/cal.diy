import type { EventTypeMetadata } from "@calcom/prisma/zod-utils";
import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchOrganizationEmailSettings,
  sendAddGuestsEmails,
  sendAddGuestsEmailsAndSMS,
  sendAttendeeRequestEmailAndSMS,
  sendAwaitingPaymentEmailAndSMS,
  sendCancelledEmailsAndSMS,
  sendCancelledSeatEmailsAndSMS,
  sendDeclinedEmailsAndSMS,
  sendLocationChangeEmailsAndSMS,
  sendOrganizerRequestEmail,
  sendOrganizerRequestReminderEmail,
  sendReassignedEmailsAndSMS,
  sendReassignedScheduledEmailsAndSMS,
  sendReassignedUpdatedEmailsAndSMS,
  sendRequestRescheduleEmailAndSMS,
  sendRescheduledEmailsAndSMS,
  sendRescheduledSeatEmailAndSMS,
  sendRoundRobinCancelledEmailsAndSMS,
  sendRoundRobinRescheduledEmailsAndSMS,
  sendScheduledEmailsAndSMS,
  sendScheduledSeatsEmailsAndSMS,
  shouldSkipAttendeeEmailWithSettings,
} from "./email-manager";
import AttendeeScheduledEmail from "./templates/attendee-scheduled-email";

const { recorder } = vi.hoisted(() => ({
  recorder: {
    emails: [] as { name: string; instance: Record<string, unknown> }[],
    sms: [] as { name: string; recipient?: string }[],
  },
}));

vi.mock("@calcom/prisma", () => ({
  prisma: {},
}));

// Mock dependencies for AttendeeScheduledEmail tests
vi.mock("./lib/generateIcsFile", () => ({
  default: vi.fn(() => "mock-ical-content"),
  GenerateIcsRole: {
    ATTENDEE: "ATTENDEE",
  },
}));

vi.mock("./src/renderEmail", () => ({
  default: vi.fn(() => Promise.resolve("<html>mock-email</html>")),
}));

vi.mock("@calcom/lib/getReplyToHeader", () => ({
  getReplyToHeader: vi.fn(() => ({})),
}));

vi.mock("@calcom/lib/CalEventParser", () => ({
  getRichDescription: vi.fn(() => "mock-description"),
}));

vi.mock("./templates/_base-email", () => {
  return {
    default: class MockBaseEmail {
      getMailerOptions() {
        return { from: "test@cal.com" };
      }
      sendEmail() {
        recorder.emails.push({
          name: this.constructor.name,
          instance: this as unknown as Record<string, unknown>,
        });
        return Promise.resolve();
      }
    },
  };
});

vi.mock("../sms/sms-manager", () => {
  return {
    default: class MockSMSManager {
      calEvent: CalendarEvent;
      constructor(calEvent: CalendarEvent) {
        this.calEvent = calEvent;
      }
      sendSMSToAttendees() {
        recorder.sms.push({ name: this.constructor.name });
        return Promise.resolve();
      }
      sendSMSToAttendee(attendee: Person) {
        recorder.sms.push({ name: this.constructor.name, recipient: attendee.email });
        return Promise.resolve();
      }
    },
  };
});

describe("shouldSkipAttendeeEmailWithSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Metadata check", () => {
    it("should skip email when metadata has disableStandardEmails.all.attendee enabled", () => {
      const metadata: EventTypeMetadata = {
        disableStandardEmails: {
          all: {
            attendee: true,
          },
        },
      };

      const result = shouldSkipAttendeeEmailWithSettings(metadata, null, "confirmation");
      expect(result).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should send email when organizationSettings is null", () => {
      const result = shouldSkipAttendeeEmailWithSettings(undefined, null, "confirmation");
      expect(result).toBe(false);
    });

    it("should send email when metadata is undefined", () => {
      const result = shouldSkipAttendeeEmailWithSettings(undefined, null, "confirmation");
      expect(result).toBe(false);
    });

    it("should skip email when metadata disables attendee emails", () => {
      const metadata: EventTypeMetadata = {
        disableStandardEmails: {
          all: {
            attendee: true,
          },
        },
      };

      const result = shouldSkipAttendeeEmailWithSettings(metadata, null, "confirmation");
      expect(result).toBe(true);
    });

    it("should send email when metadata attendee flag is false", () => {
      const metadata: EventTypeMetadata = {
        disableStandardEmails: {
          all: {
            attendee: false,
          },
        },
      };

      const result = shouldSkipAttendeeEmailWithSettings(metadata, null, "confirmation");
      expect(result).toBe(false);
    });
  });
});

describe("AttendeeScheduledEmail - Privacy fix for seated events", () => {
  const createMockPerson = (name: string, email: string): Person => ({
    name,
    email,
    timeZone: "America/New_York",
    language: {
      translate: vi.fn((key: string) => key),
      locale: "en",
    },
  });

  const createMockCalendarEvent = (
    options: {
      seatsPerTimeSlot?: number | null;
      seatsShowAttendees?: boolean | null;
      attendees?: Person[];
    } = {}
  ): CalendarEvent => {
    const attendees = options.attendees || [
      createMockPerson("Alice", "alice@example.com"),
      createMockPerson("Bob", "bob@example.com"),
      createMockPerson("Charlie", "charlie@example.com"),
    ];

    return {
      title: "Test Event",
      type: "Test Event Type",
      startTime: "2024-01-01T10:00:00Z",
      endTime: "2024-01-01T11:00:00Z",
      organizer: createMockPerson("Organizer", "organizer@example.com"),
      attendees,
      seatsPerTimeSlot: options.seatsPerTimeSlot ?? null,
      seatsShowAttendees: options.seatsShowAttendees ?? null,
    } as CalendarEvent;
  };

  describe("Privacy: seatsShowAttendees setting", () => {
    it("should filter attendees to only recipient when seatsShowAttendees is false for seated events", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: false,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should only contain the recipient
      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe(recipient.email);
      expect(email.calEvent.attendees[0].name).toBe(recipient.name);
    });

    it("should include all attendees when seatsShowAttendees is true for seated events", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: true,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should contain all attendees
      expect(email.calEvent.attendees).toHaveLength(3);
      expect(email.calEvent.attendees.map((a) => a.email)).toEqual([
        "alice@example.com",
        "bob@example.com",
        "charlie@example.com",
      ]);
    });

    it("should filter attendees when seatsShowAttendees is null for seated events (defaults to false)", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: null,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should only contain the recipient (null defaults to false)
      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe(recipient.email);
    });

    it("should include all attendees for non-seated events regardless of seatsShowAttendees", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: null,
        seatsShowAttendees: false, // This shouldn't matter for non-seated events
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should contain all attendees (non-seated events always show all)
      expect(email.calEvent.attendees).toHaveLength(3);
    });
  });

  describe("Explicit showAttendees parameter", () => {
    it("should use explicit showAttendees=true parameter even when seatsShowAttendees is false", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: false,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient, true);

      // Should contain all attendees because explicit parameter overrides
      expect(email.calEvent.attendees).toHaveLength(3);
    });

    it("should use explicit showAttendees=false parameter even when seatsShowAttendees is true", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: true,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient, false);

      // Should only contain recipient because explicit parameter overrides
      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe(recipient.email);
    });
  });

  describe("Edge cases", () => {
    it("should handle single attendee correctly when filtering", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: false,
        attendees: [createMockPerson("Solo", "solo@example.com")],
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe("solo@example.com");
    });

    it("should not mutate original calEvent when filtering attendees", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: false,
      });
      const originalAttendeesCount = calEvent.attendees.length;
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Original calEvent should remain unchanged
      expect(calEvent.attendees).toHaveLength(originalAttendeesCount);
      // Email's calEvent should be filtered
      expect(email.calEvent.attendees).toHaveLength(1);
      // They should be different objects (cloned)
      expect(email.calEvent).not.toBe(calEvent);
    });

    it("should use same calEvent reference when not filtering (performance optimization)", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 5,
        seatsShowAttendees: true,
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should use same reference when not filtering
      expect(email.calEvent).toBe(calEvent);
    });
  });

  describe("Real-world scenarios", () => {
    it("should protect privacy for paid seated events with sharing disabled", () => {
      // This is the reported bug scenario
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 10,
        seatsShowAttendees: false, // Privacy setting disabled
        attendees: [
          createMockPerson("Customer 1", "customer1@example.com"),
          createMockPerson("Customer 2", "customer2@example.com"),
          createMockPerson("Customer 3", "customer3@example.com"),
        ],
      });
      const recipient = calEvent.attendees[1]; // Customer 2

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Customer 2 should only see their own information
      expect(email.calEvent.attendees).toHaveLength(1);
      expect(email.calEvent.attendees[0].email).toBe("customer2@example.com");
      expect(email.calEvent.attendees[0].name).toBe("Customer 2");
      // Should not contain other customers' information
      expect(email.calEvent.attendees.some((a) => a.email === "customer1@example.com")).toBe(false);
      expect(email.calEvent.attendees.some((a) => a.email === "customer3@example.com")).toBe(false);
    });

    it("should allow sharing when explicitly enabled for seated events", () => {
      const calEvent = createMockCalendarEvent({
        seatsPerTimeSlot: 10,
        seatsShowAttendees: true, // Sharing enabled
        attendees: [
          createMockPerson("Attendee 1", "attendee1@example.com"),
          createMockPerson("Attendee 2", "attendee2@example.com"),
        ],
      });
      const recipient = calEvent.attendees[0];

      const email = new AttendeeScheduledEmail(calEvent, recipient);

      // Should see all attendees when sharing is enabled
      expect(email.calEvent.attendees).toHaveLength(2);
      expect(email.calEvent.attendees.map((a) => a.email)).toEqual([
        "attendee1@example.com",
        "attendee2@example.com",
      ]);
    });
  });
});

describe("email-manager orchestration", () => {
  const buildPerson = (email: string, extra: Partial<Person> = {}): Person =>
    ({
      name: email.split("@")[0],
      email,
      timeZone: "UTC",
      language: { translate: ((key: string) => key) as Person["language"]["translate"], locale: "en" },
      ...extra,
    }) as Person;

  const buildEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
    ({
      type: "30min",
      title: "30min between Organizer and Alice",
      startTime: "2024-01-01T10:00:00Z",
      endTime: "2024-01-01T10:30:00Z",
      length: 30,
      organizer: buildPerson("organizer@example.com"),
      attendees: [buildPerson("alice@example.com")],
      ...overrides,
    }) as CalendarEvent;

  const teamOf = (...emails: string[]) => ({
    name: "Team",
    id: 1,
    members: emails.map((email) => buildPerson(email)),
  });

  const disableHost: EventTypeMetadata = { disableStandardEmails: { all: { host: true } } };
  const disableAttendee: EventTypeMetadata = { disableStandardEmails: { all: { attendee: true } } };

  const emailNames = () => recorder.emails.map((e) => e.name);

  beforeEach(() => {
    recorder.emails = [];
    recorder.sms = [];
  });

  it("fetchOrganizationEmailSettings always resolves to null since org settings were removed", async () => {
    await expect(fetchOrganizationEmailSettings(1)).resolves.toBeNull();
    await expect(fetchOrganizationEmailSettings()).resolves.toBeNull();
  });

  describe("sendScheduledEmailsAndSMS", () => {
    it("emails the organizer, each team member and every attendee, then texts attendees", async () => {
      const calEvent = buildEvent({
        attendees: [buildPerson("alice@example.com"), buildPerson("bob@example.com")],
        team: teamOf("member@example.com"),
      });

      await sendScheduledEmailsAndSMS(calEvent);

      expect(emailNames()).toEqual([
        "OrganizerScheduledEmail",
        "OrganizerScheduledEmail",
        "AttendeeScheduledEmail",
        "AttendeeScheduledEmail",
      ]);
      expect(recorder.sms).toEqual([{ name: "EventSuccessfullyScheduledSMS" }]);
    });

    it("skips host emails when they are disabled by argument or metadata", async () => {
      await sendScheduledEmailsAndSMS(buildEvent(), undefined, true);
      expect(emailNames()).toEqual(["AttendeeScheduledEmail"]);

      recorder.emails = [];
      await sendScheduledEmailsAndSMS(buildEvent(), undefined, false, false, disableHost);
      expect(emailNames()).toEqual(["AttendeeScheduledEmail"]);
    });

    it("skips attendee emails when they are disabled by argument or metadata", async () => {
      await sendScheduledEmailsAndSMS(buildEvent(), undefined, false, true);
      expect(emailNames()).toEqual(["OrganizerScheduledEmail"]);

      recorder.emails = [];
      await sendScheduledEmailsAndSMS(buildEvent(), undefined, false, false, disableAttendee);
      expect(emailNames()).toEqual(["OrganizerScheduledEmail"]);
    });

    it("renames the attendee email title from the event name object and drops notes when hidden", async () => {
      const calEvent = buildEvent({ additionalNotes: "secret", hideCalendarNotes: true });

      await sendScheduledEmailsAndSMS(calEvent, {
        attendeeName: "Alice",
        eventType: "30min",
        eventName: "Custom {Event type title}",
        host: "Organizer",
        eventDuration: 30,
        t: ((key: string) => key) as Person["language"]["translate"],
      });

      const attendeeEmail = recorder.emails.find((e) => e.name === "AttendeeScheduledEmail");
      const attendeeCalEvent = attendeeEmail?.instance.calEvent as CalendarEvent;
      expect(attendeeCalEvent.title).toBe("Custom 30min");
      expect(attendeeCalEvent.additionalNotes).toBeUndefined();
    });
  });

  describe("sendReassignedScheduledEmailsAndSMS", () => {
    it("emails every new member and texts only those with a phone number", async () => {
      const members = [
        buildPerson("m1@example.com"),
        buildPerson("m2@example.com", { phoneNumber: "+15550000000" }),
      ];

      await sendReassignedScheduledEmailsAndSMS({
        calEvent: buildEvent(),
        members,
        reassigned: { name: "New Host", email: "new@example.com" },
      });

      expect(emailNames()).toEqual(["OrganizerScheduledEmail", "OrganizerScheduledEmail"]);
      expect(recorder.sms).toEqual([{ name: "EventSuccessfullyScheduledSMS", recipient: "m2@example.com" }]);
    });

    it("sends nothing when host emails are disabled", async () => {
      await sendReassignedScheduledEmailsAndSMS({
        calEvent: buildEvent(),
        members: [buildPerson("m1@example.com")],
        eventTypeMetadata: disableHost,
      });

      expect(recorder.emails).toHaveLength(0);
    });
  });

  describe("sendRoundRobinRescheduledEmailsAndSMS", () => {
    it("sends attendee emails to attendees and organizer emails to team members", async () => {
      const attendee = buildPerson("alice@example.com", { phoneNumber: "+15550000001" });
      const member = buildPerson("member@example.com", { phoneNumber: "+15550000002" });
      const calEvent = buildEvent({ attendees: [attendee], team: teamOf("member@example.com") });

      await sendRoundRobinRescheduledEmailsAndSMS(calEvent, [attendee, member]);

      expect(emailNames()).toEqual(["AttendeeRescheduledEmail", "OrganizerRescheduledEmail"]);
      expect(recorder.sms.map((s) => s.recipient)).toEqual(["alice@example.com", "member@example.com"]);
    });

    it("treats a person who is both attendee and team member as a host", async () => {
      const both = buildPerson("member@example.com");
      const calEvent = buildEvent({ attendees: [both], team: teamOf("member@example.com") });

      await sendRoundRobinRescheduledEmailsAndSMS(calEvent, [both]);

      expect(emailNames()).toEqual(["OrganizerRescheduledEmail"]);
    });

    it("respects the attendee and host disable flags", async () => {
      const attendee = buildPerson("alice@example.com");
      const member = buildPerson("member@example.com");
      const calEvent = buildEvent({ attendees: [attendee], team: teamOf("member@example.com") });

      await sendRoundRobinRescheduledEmailsAndSMS(calEvent, [attendee, member], disableAttendee);
      expect(emailNames()).toEqual(["OrganizerRescheduledEmail"]);

      recorder.emails = [];
      await sendRoundRobinRescheduledEmailsAndSMS(calEvent, [attendee, member], disableHost);
      expect(emailNames()).toEqual(["AttendeeRescheduledEmail"]);
    });
  });

  describe("sendReassignedUpdatedEmailsAndSMS", () => {
    it("emails every attendee with the showAttendees flag", async () => {
      const calEvent = buildEvent({
        attendees: [buildPerson("alice@example.com"), buildPerson("bob@example.com")],
      });

      await sendReassignedUpdatedEmailsAndSMS({ calEvent, showAttendees: false });

      expect(emailNames()).toEqual(["AttendeeUpdatedEmail", "AttendeeUpdatedEmail"]);
      expect(recorder.emails.map((e) => (e.instance.attendee as Person).email)).toEqual([
        "alice@example.com",
        "bob@example.com",
      ]);
    });

    it("sends nothing when attendee emails are disabled", async () => {
      await sendReassignedUpdatedEmailsAndSMS({
        calEvent: buildEvent(),
        showAttendees: true,
        eventTypeMetadata: disableAttendee,
      });

      expect(recorder.emails).toHaveLength(0);
    });
  });

  describe("sendRoundRobinCancelledEmailsAndSMS", () => {
    it("emails each removed member and texts the ones with a phone number", async () => {
      const members = [
        buildPerson("m1@example.com"),
        buildPerson("m2@example.com", { phoneNumber: "+15550000003" }),
      ];

      await sendRoundRobinCancelledEmailsAndSMS(buildEvent(), members, undefined, {
        name: "New Host",
        email: "new@example.com",
      });

      expect(emailNames()).toEqual(["OrganizerCancelledEmail", "OrganizerCancelledEmail"]);
      expect(recorder.emails[0].instance.reassigned).toEqual({ name: "New Host", email: "new@example.com" });
      expect(recorder.sms).toEqual([{ name: "EventCancelledSMS", recipient: "m2@example.com" }]);
    });

    it("sends nothing when host emails are disabled", async () => {
      await sendRoundRobinCancelledEmailsAndSMS(buildEvent(), [buildPerson("m1@example.com")], disableHost);

      expect(recorder.emails).toHaveLength(0);
    });
  });

  describe("sendReassignedEmailsAndSMS", () => {
    it("emails each member with the reassignment target", async () => {
      await sendReassignedEmailsAndSMS({
        calEvent: buildEvent(),
        members: [buildPerson("m1@example.com", { phoneNumber: "+15550000004" })],
        reassignedTo: { name: "New Host", email: "new@example.com" },
      });

      expect(emailNames()).toEqual(["OrganizerReassignedEmail"]);
      expect(recorder.sms).toEqual([{ name: "EventCancelledSMS", recipient: "m1@example.com" }]);
    });

    it("sends nothing when host emails are disabled", async () => {
      await sendReassignedEmailsAndSMS({
        calEvent: buildEvent(),
        members: [buildPerson("m1@example.com")],
        reassignedTo: { name: null, email: "new@example.com" },
        eventTypeMetadata: disableHost,
      });

      expect(recorder.emails).toHaveLength(0);
    });
  });

  describe("sendRescheduledEmailsAndSMS", () => {
    it("emails the organizer, the team and every attendee, then texts attendees", async () => {
      const calEvent = buildEvent({ team: teamOf("member@example.com") });

      await sendRescheduledEmailsAndSMS(calEvent);

      expect(emailNames()).toEqual([
        "OrganizerRescheduledEmail",
        "OrganizerRescheduledEmail",
        "AttendeeRescheduledEmail",
      ]);
      expect(recorder.sms).toEqual([{ name: "EventSuccessfullyReScheduledSMS" }]);
    });

    it("respects the host and attendee disable flags", async () => {
      await sendRescheduledEmailsAndSMS(buildEvent(), disableHost);
      expect(emailNames()).toEqual(["AttendeeRescheduledEmail"]);

      recorder.emails = [];
      await sendRescheduledEmailsAndSMS(buildEvent(), disableAttendee);
      expect(emailNames()).toEqual(["OrganizerRescheduledEmail"]);
    });
  });

  describe("sendRescheduledSeatEmailAndSMS", () => {
    it("emails the organizer and the single seat attendee and texts that attendee", async () => {
      const attendee = buildPerson("alice@example.com");

      await sendRescheduledSeatEmailAndSMS(buildEvent(), attendee);

      expect(emailNames()).toEqual(["OrganizerRescheduledEmail", "AttendeeRescheduledEmail"]);
      expect(recorder.sms).toEqual([
        { name: "EventSuccessfullyReScheduledSMS", recipient: "alice@example.com" },
      ]);
    });

    it("respects the host and attendee disable flags", async () => {
      const attendee = buildPerson("alice@example.com");

      await sendRescheduledSeatEmailAndSMS(buildEvent(), attendee, disableHost);
      expect(emailNames()).toEqual(["AttendeeRescheduledEmail"]);

      recorder.emails = [];
      await sendRescheduledSeatEmailAndSMS(buildEvent(), attendee, disableAttendee);
      expect(emailNames()).toEqual(["OrganizerRescheduledEmail"]);
    });
  });

  describe("sendScheduledSeatsEmailsAndSMS", () => {
    it("emails the organizer, the team and the invitee, then texts the invitee", async () => {
      const invitee = buildPerson("alice@example.com");
      const calEvent = buildEvent({ team: teamOf("member@example.com") });

      await sendScheduledSeatsEmailsAndSMS(calEvent, invitee, true, false);

      expect(emailNames()).toEqual([
        "OrganizerScheduledEmail",
        "OrganizerScheduledEmail",
        "AttendeeScheduledEmail",
      ]);
      expect(recorder.emails[0].instance.newSeat).toBe(true);
      expect(recorder.sms).toEqual([
        { name: "EventSuccessfullyScheduledSMS", recipient: "alice@example.com" },
      ]);
    });

    it("honours the host and attendee disable arguments", async () => {
      const invitee = buildPerson("alice@example.com");

      await sendScheduledSeatsEmailsAndSMS(buildEvent(), invitee, false, true, true);
      expect(emailNames()).toEqual(["AttendeeScheduledEmail"]);

      recorder.emails = [];
      await sendScheduledSeatsEmailsAndSMS(buildEvent(), invitee, false, true, false, true);
      expect(emailNames()).toEqual(["OrganizerScheduledEmail"]);
    });
  });

  describe("sendCancelledSeatEmailsAndSMS", () => {
    it("emails the cancelled attendee and the organizer and texts the attendee", async () => {
      const attendee = buildPerson("alice@example.com");

      await sendCancelledSeatEmailsAndSMS(buildEvent(), attendee);

      // OrganizerAttendeeCancelledSeatEmail is declared as `class OrganizerCancelledEmail`
      expect(emailNames()).toEqual(["AttendeeCancelledSeatEmail", "OrganizerCancelledEmail"]);
      expect(recorder.sms).toEqual([{ name: "CancelledSeatSMS", recipient: "alice@example.com" }]);
    });

    it("respects the host and attendee disable flags", async () => {
      const attendee = buildPerson("alice@example.com");

      await sendCancelledSeatEmailsAndSMS(buildEvent(), attendee, disableHost);
      expect(emailNames()).toEqual(["AttendeeCancelledSeatEmail"]);

      recorder.emails = [];
      await sendCancelledSeatEmailsAndSMS(buildEvent(), attendee, disableAttendee);
      expect(emailNames()).toEqual(["OrganizerCancelledEmail"]);
    });
  });

  describe("sendOrganizerRequestEmail", () => {
    it("emails the organizer and every team member", async () => {
      await sendOrganizerRequestEmail(buildEvent({ team: teamOf("m1@example.com", "m2@example.com") }));

      expect(emailNames()).toEqual([
        "OrganizerRequestEmail",
        "OrganizerRequestEmail",
        "OrganizerRequestEmail",
      ]);
    });

    it("sends nothing when host emails are disabled", async () => {
      await sendOrganizerRequestEmail(buildEvent(), disableHost);

      expect(recorder.emails).toHaveLength(0);
    });
  });

  describe("sendAttendeeRequestEmailAndSMS", () => {
    it("emails and texts the attendee", async () => {
      const attendee = buildPerson("alice@example.com");

      await sendAttendeeRequestEmailAndSMS(buildEvent(), attendee);

      expect(emailNames()).toEqual(["AttendeeRequestEmail"]);
      expect(recorder.sms).toEqual([{ name: "EventRequestSMS", recipient: "alice@example.com" }]);
    });

    it("sends nothing when attendee emails are disabled", async () => {
      await sendAttendeeRequestEmailAndSMS(buildEvent(), buildPerson("alice@example.com"), disableAttendee);

      expect(recorder.emails).toHaveLength(0);
      expect(recorder.sms).toHaveLength(0);
    });
  });

  describe("sendDeclinedEmailsAndSMS", () => {
    it("emails every attendee and texts them", async () => {
      const calEvent = buildEvent({
        attendees: [buildPerson("alice@example.com"), buildPerson("bob@example.com")],
      });

      await sendDeclinedEmailsAndSMS(calEvent);

      expect(emailNames()).toEqual(["AttendeeDeclinedEmail", "AttendeeDeclinedEmail"]);
      expect(recorder.sms).toEqual([{ name: "EventDeclinedSMS" }]);
    });

    it("sends nothing when attendee emails are disabled", async () => {
      await sendDeclinedEmailsAndSMS(buildEvent(), disableAttendee);

      expect(recorder.emails).toHaveLength(0);
      expect(recorder.sms).toHaveLength(0);
    });
  });

  describe("sendCancelledEmailsAndSMS", () => {
    it("emails the organizer, the team and every attendee with a rebuilt title", async () => {
      const calEvent = buildEvent({ team: teamOf("member@example.com") });

      await sendCancelledEmailsAndSMS(calEvent, { eventName: "Cancelled {Event type title}" });

      expect(emailNames()).toEqual([
        "OrganizerCancelledEmail",
        "OrganizerCancelledEmail",
        "AttendeeCancelledEmail",
      ]);
      const attendeeEmail = recorder.emails[2].instance.calEvent as CalendarEvent;
      expect(attendeeEmail.title).toBe("Cancelled 30min between Organizer and Alice");
      expect(recorder.sms).toEqual([{ name: "EventCancelledSMS" }]);
    });

    it("logs when the event length is not a number but still sends", async () => {
      const calEvent = buildEvent({ length: undefined });

      await sendCancelledEmailsAndSMS(calEvent, { eventName: "" });

      expect(emailNames()).toEqual(["OrganizerCancelledEmail", "AttendeeCancelledEmail"]);
    });

    it("respects the host and attendee disable flags", async () => {
      await sendCancelledEmailsAndSMS(buildEvent(), { eventName: "" }, disableHost);
      expect(emailNames()).toEqual(["AttendeeCancelledEmail"]);

      recorder.emails = [];
      await sendCancelledEmailsAndSMS(buildEvent(), { eventName: "" }, disableAttendee);
      expect(emailNames()).toEqual(["OrganizerCancelledEmail"]);
    });
  });

  describe("sendOrganizerRequestReminderEmail", () => {
    it("emails the organizer and every team member", async () => {
      await sendOrganizerRequestReminderEmail(buildEvent({ team: teamOf("member@example.com") }));

      expect(emailNames()).toEqual(["OrganizerRequestReminderEmail", "OrganizerRequestReminderEmail"]);
    });

    it("sends nothing when host emails are disabled", async () => {
      await sendOrganizerRequestReminderEmail(buildEvent(), disableHost);

      expect(recorder.emails).toHaveLength(0);
    });
  });

  describe("sendAwaitingPaymentEmailAndSMS", () => {
    it("emails every attendee and texts them", async () => {
      const calEvent = buildEvent({
        attendees: [buildPerson("alice@example.com"), buildPerson("bob@example.com")],
      });

      await sendAwaitingPaymentEmailAndSMS(calEvent);

      expect(emailNames()).toEqual(["AttendeeAwaitingPaymentEmail", "AttendeeAwaitingPaymentEmail"]);
      expect(recorder.sms).toEqual([{ name: "AwaitingPaymentSMS" }]);
    });

    it("still texts attendees when their emails are disabled", async () => {
      await sendAwaitingPaymentEmailAndSMS(buildEvent(), disableAttendee);

      expect(recorder.emails).toHaveLength(0);
      expect(recorder.sms).toEqual([{ name: "AwaitingPaymentSMS" }]);
    });
  });

  describe("sendRequestRescheduleEmailAndSMS", () => {
    it("emails the organizer and the attendee with the reschedule link", async () => {
      await sendRequestRescheduleEmailAndSMS(buildEvent(), { rescheduleLink: "https://cal.dev/resched" });

      expect(emailNames()).toEqual([
        "OrganizerRequestedToRescheduleEmail",
        "AttendeeWasRequestedToRescheduleEmail",
      ]);
      expect(recorder.emails[0].instance.metadata).toEqual({ rescheduleLink: "https://cal.dev/resched" });
      expect(recorder.sms).toEqual([{ name: "EventRequestToRescheduleSMS" }]);
    });

    it("respects the host and attendee disable flags", async () => {
      const metadata = { rescheduleLink: "https://cal.dev/resched" };

      await sendRequestRescheduleEmailAndSMS(buildEvent(), metadata, disableHost);
      expect(emailNames()).toEqual(["AttendeeWasRequestedToRescheduleEmail"]);

      recorder.emails = [];
      await sendRequestRescheduleEmailAndSMS(buildEvent(), metadata, disableAttendee);
      expect(emailNames()).toEqual(["OrganizerRequestedToRescheduleEmail"]);
    });
  });

  describe("sendLocationChangeEmailsAndSMS", () => {
    it("emails the organizer, the team and every attendee then texts attendees", async () => {
      const calEvent = buildEvent({ team: teamOf("member@example.com") });

      await sendLocationChangeEmailsAndSMS(calEvent);

      expect(emailNames()).toEqual([
        "OrganizerLocationChangeEmail",
        "OrganizerLocationChangeEmail",
        "AttendeeLocationChangeEmail",
      ]);
      expect(recorder.sms).toEqual([{ name: "EventLocationChangedSMS" }]);
    });

    it("respects the host and attendee disable flags", async () => {
      await sendLocationChangeEmailsAndSMS(buildEvent(), disableHost);
      expect(emailNames()).toEqual(["AttendeeLocationChangeEmail"]);

      recorder.emails = [];
      await sendLocationChangeEmailsAndSMS(buildEvent(), disableAttendee);
      expect(emailNames()).toEqual(["OrganizerLocationChangeEmail"]);
    });
  });

  describe("sendAddGuestsEmails", () => {
    it("sends a confirmation to new guests and an add-guests email to existing attendees", async () => {
      const calEvent = buildEvent({
        attendees: [buildPerson("alice@example.com"), buildPerson("newguest@example.com")],
        team: teamOf("member@example.com"),
      });

      await sendAddGuestsEmails(calEvent, ["newguest@example.com"]);

      expect(emailNames()).toEqual([
        "OrganizerAddGuestsEmail",
        "OrganizerAddGuestsEmail",
        "AttendeeAddGuestsEmail",
        "AttendeeScheduledEmail",
      ]);
    });
  });

  describe("sendAddGuestsEmailsAndSMS", () => {
    it("texts new guests that have a phone number and emails existing attendees", async () => {
      const calEvent = buildEvent({
        attendees: [
          buildPerson("alice@example.com"),
          buildPerson("newguest@example.com", { phoneNumber: "+15550000005" }),
        ],
        team: teamOf("member@example.com"),
      });

      await sendAddGuestsEmailsAndSMS({ calEvent, newGuests: ["newguest@example.com"] });

      expect(emailNames()).toEqual([
        "OrganizerAddGuestsEmail",
        "OrganizerAddGuestsEmail",
        "AttendeeAddGuestsEmail",
        "AttendeeScheduledEmail",
      ]);
      expect(recorder.sms).toEqual([
        { name: "EventSuccessfullyScheduledSMS", recipient: "newguest@example.com" },
      ]);
    });

    it("skips host emails when disabled and attendee emails when disabled", async () => {
      const calEvent = buildEvent({
        attendees: [buildPerson("alice@example.com"), buildPerson("newguest@example.com")],
      });

      await sendAddGuestsEmailsAndSMS({
        calEvent,
        newGuests: ["newguest@example.com"],
        eventTypeMetadata: disableHost,
      });
      expect(emailNames()).toEqual(["AttendeeAddGuestsEmail", "AttendeeScheduledEmail"]);

      recorder.emails = [];
      await sendAddGuestsEmailsAndSMS({
        calEvent,
        newGuests: ["newguest@example.com"],
        eventTypeMetadata: disableAttendee,
      });
      expect(emailNames()).toEqual(["OrganizerAddGuestsEmail"]);
    });
  });
});
