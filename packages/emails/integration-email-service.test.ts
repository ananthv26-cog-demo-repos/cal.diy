import type { CalendarEvent, Person } from "@calcom/types/Calendar";
import type { TFunction } from "i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  sendBrokenIntegrationEmail,
  sendDisabledAppEmail,
  sendSlugReplacementEmail,
} from "./integration-email-service";

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

vi.mock("./templates/broken-integration-email", mockTemplate("BrokenIntegrationEmail"));
vi.mock("./templates/disabled-app-email", mockTemplate("DisabledAppEmail"));
vi.mock("./templates/slug-replacement-email", mockTemplate("SlugReplacementEmail"));

const t = ((key: string) => key) as TFunction;

const buildPerson = (email: string): Person =>
  ({
    name: email,
    email,
    timeZone: "UTC",
    language: { locale: "en", translate: t },
  }) as unknown as Person;

const buildCalEvent = (overrides: Partial<CalendarEvent> = {}): CalendarEvent =>
  ({
    title: "Event",
    startTime: "2024-01-01T10:00:00Z",
    endTime: "2024-01-01T11:00:00Z",
    organizer: buildPerson("organizer@example.com"),
    attendees: [buildPerson("a1@example.com")],
    ...overrides,
  }) as CalendarEvent;

describe("sendBrokenIntegrationEmail", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("passes the formatted cal event and the integration type", async () => {
    await sendBrokenIntegrationEmail(buildCalEvent(), "video");

    expect(emailMock.constructed).toHaveLength(1);
    expect(emailMock.constructed[0].name).toBe("BrokenIntegrationEmail");
    expect(emailMock.constructed[0].args[1]).toBe("video");
  });

  it("strips the platform client id from the cal event", async () => {
    const calEvent = buildCalEvent({
      platformClientId: "clientid",
      attendees: [buildPerson("a1+clientid@example.com")],
    });

    await sendBrokenIntegrationEmail(calEvent, "calendar");

    expect((emailMock.constructed[0].args[0] as CalendarEvent).attendees[0].email).toBe("a1@example.com");
  });

  it("rejects when the email cannot be built", async () => {
    emailMock.throwOn = "BrokenIntegrationEmail";

    await expect(sendBrokenIntegrationEmail(buildCalEvent(), "video")).rejects.toBeUndefined();
  });
});

describe("sendDisabledAppEmail", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
  });

  it("forwards all arguments in order", async () => {
    await sendDisabledAppEmail({
      email: "user@example.com",
      appName: "Zoom",
      appType: ["video"],
      t,
      title: "My event",
      eventTypeId: 7,
    });

    expect(emailMock.constructed).toEqual([
      { name: "DisabledAppEmail", args: ["user@example.com", "Zoom", ["video"], t, "My event", 7] },
    ]);
  });

  it("defaults the optional title and event type id to undefined", async () => {
    await sendDisabledAppEmail({ email: "user@example.com", appName: "Zoom", appType: ["video"], t });

    expect(emailMock.constructed[0].args).toEqual([
      "user@example.com",
      "Zoom",
      ["video"],
      t,
      undefined,
      undefined,
    ]);
  });
});

describe("sendSlugReplacementEmail", () => {
  beforeEach(() => {
    emailMock.constructed = [];
    emailMock.throwOn = null;
  });

  it("passes the slug last and supports a null team name", async () => {
    await sendSlugReplacementEmail({
      email: "user@example.com",
      name: "Jane",
      teamName: null,
      t,
      slug: "30min",
    });

    expect(emailMock.constructed).toEqual([
      { name: "SlugReplacementEmail", args: ["user@example.com", "Jane", null, "30min", t] },
    ]);
  });

  it("passes the team name when present", async () => {
    await sendSlugReplacementEmail({
      email: "user@example.com",
      name: "Jane",
      teamName: "Engineering",
      t,
      slug: "30min",
    });

    expect(emailMock.constructed[0].args[2]).toBe("Engineering");
  });
});
